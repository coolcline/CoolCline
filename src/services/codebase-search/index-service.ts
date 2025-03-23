/**
 * 代码库索引服务
 * 检查函数调用链路：
	界面点击"刷新索引"按钮 -> handleRefreshIndex 函数
	发送 codebaseSearch 类型消息，action 为 refreshIndex
	消息传递到 handleCodebaseSearchWebviewMessage 处理
	调用 manager.refreshIndex 函数 (来自 CodebaseSearchManager)
	最终调用 CodebaseIndexService.refreshIndex
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { IndexOptions, IndexProgress, IndexStats, IndexTask, ResultType } from "./types"
import { toPosixPath, arePathsEqual, extname, join, relative } from "../../utils/path"
import { createDatabase, Database } from "./database"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"

// 定义索引状态接口
export interface IndexStatus {
	isIndexing: boolean
	progress: IndexProgress
	stats: IndexStats
}

/**
 * 代码库索引服务类
 */
export class CodebaseIndexService {
	private workspacePath: string
	private indexQueue: IndexTask[] = []
	private isIndexing: boolean = false
	private _progress: IndexProgress = { total: 0, completed: 0, status: "idle" }
	private batchSize: number = 10
	private processingDelay: number = 0
	private priorityFolders: string[] = ["src", "lib", "app", "core"]
	private db: Database | null = null
	private semanticAnalyzer: SemanticAnalysisService
	private fileSystemWatcher: vscode.FileSystemWatcher | null = null
	private debounceTimer: NodeJS.Timeout | null = null
	private _onIndexStatusChange: vscode.EventEmitter<IndexStatus>
	public readonly onIndexStatusChange: vscode.Event<IndexStatus>

	/**
	 * 事务管理包装器 - 在事务中执行操作
	 * @param operation 需要在事务中执行的操作函数
	 * @returns 操作函数的返回值
	 * @private
	 */
	private async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
		// 确保数据库已初始化
		await this.initDatabase()

		// 检查是否已在事务中
		const inTransaction = await this.db!.isInTransaction()

		if (inTransaction) {
			// 已在事务中，直接执行操作
			return await operation()
		}

		// 开始新事务
		await this.db!.beginTransaction()
		try {
			const result = await operation()
			await this.db!.commit()
			return result
		} catch (error) {
			await this.db!.rollback()
			throw error
		}
	}

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 */
	constructor(workspacePath: string) {
		this.workspacePath = toPosixPath(workspacePath)
		this.semanticAnalyzer = createSemanticAnalysisService(this.workspacePath)

		// 初始化事件发射器
		try {
			this._onIndexStatusChange = new vscode.EventEmitter<IndexStatus>()
			this.onIndexStatusChange = this._onIndexStatusChange.event
		} catch (error) {
			// 在测试环境中可能会失败，使用模拟替代
			console.log("创建EventEmitter失败，使用模拟对象")
			this._onIndexStatusChange = {
				fire: () => {},
			} as any
			this.onIndexStatusChange = () => {
				return { dispose: () => {} }
			}
		}

		this.setupFileSystemWatcher()
	}

	/**
	 * 获取索引进度
	 */
	public get progress(): IndexProgress {
		return this._progress
	}

	/**
	 * 初始化数据库
	 * @private
	 */
	private async initDatabase(): Promise<void> {
		if (!this.db) {
			this.db = await createDatabase(this.workspacePath)
		}
	}

	/**
	 * 开始索引工作区
	 * @param options 索引选项
	 */
	public async startIndexing(options?: IndexOptions): Promise<void> {
		if (this.isIndexing) {
			return // 已有索引任务在进行中
		}

		this.isIndexing = true
		this._progress = { total: 0, completed: 0, status: "scanning" }

		try {
			// 初始化数据库
			await this.initDatabase()

			// 扫描工作区文件
			const files = await this.scanWorkspace(options?.includePaths, options?.excludePaths, options)
			this._progress.total = files.length
			this._progress.status = "indexing"

			// 将文件添加到索引队列
			this.indexQueue = files.map((file) => ({
				filePath: file,
				priority: this.calculatePriority(file),
			}))

			// 按优先级排序
			this.indexQueue.sort((a, b) => b.priority - a.priority)

			// 启动处理队列
			this.processQueue()
		} catch (error) {
			this._progress.status = "error"
			this.isIndexing = false
			throw error
		}
	}

	/**
	 * 停止当前索引
	 * 可以被用户手动触发停止当前索引过程
	 */
	public async stopIndexing(): Promise<void> {
		if (this.isIndexing) {
			// 清空索引队列
			this.indexQueue = []
			// 更新状态
			this.isIndexing = false
			this._progress.status = "stopped"
			// 通知前端状态变化
			this.notifyStatusChange()

			console.log("索引过程已暂停")
		}
	}

	/**
	 * 刷新索引
	 * @param options 索引选项
	 */
	public async refreshIndex(options?: IndexOptions): Promise<void> {
		if (this.isIndexing) {
			// 停止当前索引任务
			this.indexQueue = []
			this.isIndexing = false

			// 添加短暂延迟确保索引状态被完全清理
			await new Promise((resolve) => setTimeout(resolve, 50))
		}

		try {
			// 标记开始索引
			this.isIndexing = true
			this._progress = { total: 0, completed: 0, status: "scanning" }

			// 确保数据库已初始化
			await this.initDatabase()

			// 扫描工作区文件
			const files = await this.scanWorkspace(options?.includePaths, options?.excludePaths, options)

			// 获取需要更新的文件列表
			const filesToUpdate: string[] = []
			const filesToRemove: string[] = []

			// 获取当前已索引的文件列表
			const indexedFiles = await this.db!.all("SELECT path, content_hash, last_modified FROM files")
			const indexedFileMap = new Map(indexedFiles.map((f) => [f.path, f]))

			// 检查每个文件是否需要更新
			for (const file of files) {
				const normalizedPath = toPosixPath(file)
				const indexedFile = indexedFileMap.get(normalizedPath)

				if (!indexedFile) {
					// 新文件，需要添加
					filesToUpdate.push(file)
				} else {
					// 检查文件是否被修改
					try {
						const stats = fs.statSync(file)
						const currentHash = this.calculateContentHash(await fs.promises.readFile(file, "utf-8"))

						if (stats.mtimeMs > indexedFile.last_modified || currentHash !== indexedFile.content_hash) {
							// 文件被修改，需要更新
							filesToUpdate.push(file)
						}
					} catch (error) {
						console.warn(`无法检查文件状态: ${file}`, error)
						filesToUpdate.push(file)
					}
				}
			}

			// 检查需要删除的文件
			for (const indexedFile of indexedFiles) {
				if (!files.some((f) => toPosixPath(f) === indexedFile.path)) {
					filesToRemove.push(indexedFile.path)
				}
			}

			// 删除不再存在的文件
			if (filesToRemove.length > 0) {
				await this.removeFilesFromIndex(filesToRemove)
			}

			// 更新或添加修改过的文件
			if (filesToUpdate.length > 0) {
				this._progress.total = filesToUpdate.length
				this._progress.completed = 0
				this._progress.status = "indexing"

				// 将文件添加到索引队列
				this.indexQueue = filesToUpdate.map((file) => ({
					filePath: file,
					priority: this.calculatePriority(file),
				}))

				// 按优先级排序
				this.indexQueue.sort((a, b) => b.priority - a.priority)

				// 启动处理队列
				this.processQueue()
			} else {
				// 没有需要更新的文件，也要将状态设为完成
				this._progress.status = "completed"
				this._progress.total = 0
				this._progress.completed = 0
				this.isIndexing = false
				// 通知状态变化，这样前端可以显示"完成"的状态
				this.notifyStatusChange()
			}
		} catch (error) {
			this._progress.status = "error"
			this.isIndexing = false
			console.error("索引刷新失败:", error)
			throw error
		}
	}

	/**
	 * 清除索引
	 */
	public async clearIndex(): Promise<void> {
		// 停止当前索引任务
		this.indexQueue = []
		this.isIndexing = false

		try {
			if (this.db) {
				// 使用事务保证原子性
				await this.executeInTransaction(async () => {
					// 清除所有关联表数据，顺序很重要（先清除依赖表）
					await this.db!.exec("DELETE FROM symbol_relations")
					await this.db!.exec("DELETE FROM keywords")
					await this.db!.exec("DELETE FROM symbol_contents")
					await this.db!.exec("DELETE FROM symbols")
					await this.db!.exec("DELETE FROM files")

					// 保留工作区元数据表，但更新最后重置时间
					await this.db!.run(
						"INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)",
						["last_reset", Date.now().toString(), Date.now()],
					)
				})

				// 更新状态为已完成清除
				this._progress = { total: 0, completed: 0, status: "idle" }
				// 通知状态变化
				this.notifyStatusChange()
			}
		} catch (error) {
			console.error("清除索引数据失败:", error)
			this._progress.status = "error"
			this.notifyStatusChange()
			throw error
		}
	}

	/**
	 * 索引单个文件
	 * @param filePath 文件路径
	 */
	public async indexFile(filePath: string): Promise<void> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()

			// 检查文件是否存在
			if (!fs.existsSync(filePath)) {
				console.warn(`File does not exist: ${filePath}`)
				return
			}

			try {
				// 获取文件内容
				const content = await fs.promises.readFile(filePath, "utf-8")

				// 计算内容哈希，用于后续增量更新
				const contentHash = this.calculateContentHash(content)

				// 获取文件语言
				const language = this.detectLanguage(filePath)

				// 获取文件最后修改时间
				let lastModified = Date.now()
				try {
					const stats = fs.statSync(filePath)
					lastModified = stats.mtimeMs
				} catch (error) {
					console.warn(`无法获取文件状态信息，使用当前时间: ${filePath}`)
				}

				// 先将文件信息保存到数据库
				const normalizedPath = toPosixPath(filePath)
				try {
					// 获取文件ID（如果已存在）
					const existingFile = await this.db!.get("SELECT id FROM files WHERE path = ?", [normalizedPath])
					let fileId: number

					if (existingFile) {
						fileId = existingFile.id
						// 更新文件信息
						await this.db!.run(
							`UPDATE files SET language = ?, last_modified = ?, indexed_at = ?, content_hash = ? WHERE id = ?`,
							[language, lastModified, Date.now(), contentHash, fileId],
						)
					} else {
						// 插入新文件
						const result = await this.db!.run(
							`INSERT INTO files (path, language, last_modified, indexed_at, content_hash) 
							VALUES (?, ?, ?, ?, ?)`,
							[normalizedPath, language, lastModified, Date.now(), contentHash],
						)
						fileId = result.lastID
					}

					// 使用语义分析服务提取符号和关系
					const { symbols, relations } = await this.semanticAnalyzer.analyzeFile(filePath)

					// 在事务中保存符号和关系，确保原子性
					await this.executeInTransaction(async () => {
						// 先删除该文件的旧符号相关数据
						await this.db!.run(
							"DELETE FROM symbol_relations WHERE source_id IN (SELECT id FROM symbols WHERE file_id = ?)",
							[fileId],
						)
						await this.db!.run(
							"DELETE FROM symbol_contents WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)",
							[fileId],
						)
						await this.db!.run(
							"DELETE FROM keywords WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)",
							[fileId],
						)
						await this.db!.run("DELETE FROM symbols WHERE file_id = ?", [fileId])

						// 保存新的符号
						for (const symbol of symbols) {
							// 插入符号
							const result = await this.db!.run(
								`INSERT INTO symbols 
								(file_id, name, type, signature, line, column, parent_id) 
								VALUES (?, ?, ?, ?, ?, ?, ?)`,
								[
									fileId,
									symbol.name,
									symbol.type,
									symbol.signature || "",
									symbol.line,
									symbol.column,
									symbol.parentId || null,
								],
							)

							// 获取新插入符号的ID
							const symbolId = result.lastID

							// 保存符号内容
							await this.db!.run("INSERT INTO symbol_contents (symbol_id, content) VALUES (?, ?)", [
								symbolId,
								symbol.content,
							])

							// 生成并保存关键词
							const keywords = this.extractKeywords(symbol.name, symbol.content)
							for (const keyword of keywords) {
								// 计算关键词与符号的相关性
								const relevance = this.semanticAnalyzer.calculateSemanticRelevance(
									keyword,
									symbol.content,
								)

								await this.db!.run(
									"INSERT INTO keywords (keyword, symbol_id, relevance) VALUES (?, ?, ?)",
									[keyword, symbolId, relevance],
								)
							}
						}

						// 保存符号关系
						for (const relation of relations) {
							// 检查源和目标ID是否有效
							if (
								relation.sourceId !== undefined &&
								relation.targetId !== undefined &&
								relation.sourceId > 0 &&
								relation.targetId > 0
							) {
								await this.db!.run(
									"INSERT INTO symbol_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)",
									[relation.sourceId, relation.targetId, relation.relationType],
								)
							}
						}
					})
				} catch (dbError) {
					console.error(`数据库操作失败: ${normalizedPath}`, dbError)
				}
			} catch (fileError) {
				console.error(`文件处理失败: ${filePath}`, fileError)
			}
		} catch (error) {
			console.error(`Failed to index file: ${toPosixPath(filePath)}`, error)
		}
	}

	/**
	 * 计算内容哈希值
	 * @param content 文件内容
	 * @returns 哈希值
	 */
	private calculateContentHash(content: string): string {
		// 简单的哈希计算
		let hash = 0
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash // 转换为32位整数
		}
		return Math.abs(hash).toString(16)
	}

	/**
	 * 从索引中删除文件
	 * @param filePath 文件路径
	 * @param inTransaction 是否在外部事务中执行
	 */
	public async removeFileFromIndex(filePath: string, inTransaction: boolean = false): Promise<void> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()

			const normalizedPath = toPosixPath(filePath)

			// 查询文件ID
			const fileRecord = await this.db!.get("SELECT id FROM files WHERE path = ?", [normalizedPath])

			if (fileRecord && fileRecord.id) {
				const deleteOperation = async () => {
					// 删除与该文件相关的符号关系
					await this.db!.run(
						"DELETE FROM symbol_relations WHERE source_id IN (SELECT id FROM symbols WHERE file_id = ?)",
						[fileRecord.id],
					)

					// 删除与该文件相关的符号内容
					await this.db!.run(
						"DELETE FROM symbol_contents WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)",
						[fileRecord.id],
					)

					// 删除与该文件相关的关键词
					await this.db!.run(
						"DELETE FROM keywords WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)",
						[fileRecord.id],
					)

					// 删除该文件的符号
					await this.db!.run("DELETE FROM symbols WHERE file_id = ?", [fileRecord.id])

					// 删除文件记录
					await this.db!.run("DELETE FROM files WHERE id = ?", [fileRecord.id])
				}

				if (inTransaction) {
					// 已在事务中，直接执行
					await deleteOperation()
				} else {
					// 需要自己管理事务
					await this.executeInTransaction(deleteOperation)
				}
			}
		} catch (error) {
			console.error(`Failed to remove file from index: ${filePath}`, error)
			throw error
		}
	}

	/**
	 * 从索引中批量删除文件
	 * @param filePaths 文件路径数组
	 */
	public async removeFilesFromIndex(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) {
			return
		}

		await this.executeInTransaction(async () => {
			for (const filePath of filePaths) {
				await this.removeFileFromIndex(filePath, true)
			}
		})
	}

	/**
	 * 获取索引统计信息
	 */
	public async getIndexStats(): Promise<IndexStats> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()

			// 从数据库获取统计信息
			const filesCount = await this.db!.get("SELECT COUNT(*) as count FROM files")
			const symbolsCount = await this.db!.get("SELECT COUNT(*) as count FROM symbols")
			const keywordsCount = await this.db!.get("SELECT COUNT(*) as count FROM keywords")
			const lastIndexed = await this.db!.get("SELECT MAX(indexed_at) as last_indexed FROM files")

			return {
				filesCount: filesCount ? filesCount.count : 0,
				symbolsCount: symbolsCount ? symbolsCount.count : 0,
				keywordsCount: keywordsCount ? keywordsCount.count : 0,
				lastIndexed: lastIndexed && lastIndexed.last_indexed ? new Date(lastIndexed.last_indexed) : null,
				status: this._progress.status,
			}
		} catch (error) {
			console.error("获取索引统计信息失败:", error)
			return {
				filesCount: 0,
				symbolsCount: 0,
				keywordsCount: 0,
				lastIndexed: null,
				status: this._progress.status,
			}
		}
	}

	/**
	 * 从文本中提取关键词
	 * @param name 符号名称
	 * @param content 内容文本
	 * @returns 关键词数组
	 * @private
	 */
	private extractKeywords(name: string, content: string): string[] {
		// 标准化文本
		const normalizedText = (name + " " + content).toLowerCase()

		// 移除常见的编程代码标点符号和关键字
		const cleanedText = normalizedText.replace(
			/[(){}\[\]<>,.;:'"!?=+\-*\/]|function|class|const|let|var|return|if|else|for|while|do|switch|case|break|continue|new|this|async|await/g,
			" ",
		)

		// 按空格分割得到单词
		const words = cleanedText.split(/\s+/).filter((word) => word.length > 2)

		// 移除重复词并返回
		return [...new Set(words)]
	}

	/**
	 * 处理索引队列
	 * @private
	 */
	private async processQueue(): Promise<void> {
		// 如果队列为空或已停止索引，则退出
		if (this.indexQueue.length === 0 || !this.isIndexing) {
			// 如果是由于停止索引导致的，保持停止状态
			if (this._progress.status === "stopped") {
				this.isIndexing = false
				// 通知监听器索引已停止
				this.notifyStatusChange()
				return
			}

			this._progress.status = "completed"
			this.isIndexing = false
			// 确保进度值在完成时是有效的
			if (this._progress.total > 0 && this._progress.completed < this._progress.total) {
				this._progress.completed = this._progress.total
			} else if (this._progress.total === 0) {
				this._progress.completed = 0
			}
			// 通知监听器索引已完成
			this.notifyStatusChange()
			return
		}

		// 取出一批任务
		const batch = this.indexQueue.splice(0, this.batchSize)
		this._progress.status = "indexing"

		try {
			// 处理批次，使用事务包装器
			await this.executeInTransaction(async () => {
				for (const task of batch) {
					await this.indexFile(task.filePath)
					this._progress.completed++

					// 每完成一个任务就通知进度变化
					if (this._progress.completed % 5 === 0 || this._progress.completed === this._progress.total) {
						this.notifyStatusChange()
					}
				}
			})

			// 添加延迟以避免阻塞主线程
			await new Promise((resolve) => setTimeout(resolve, this.processingDelay))

			// 继续处理下一批
			setTimeout(() => this.processQueue(), 0)
		} catch (error) {
			console.error("索引过程错误:", error)
			this._progress.status = "error"
			this.isIndexing = false
			// 通知监听器索引出错
			this.notifyStatusChange()
		}
	}

	/**
	 * 扫描工作区文件
	 * @param includePaths 包含的路径模式
	 * @param excludePaths 排除的路径模式
	 * @param options 索引选项
	 */
	private async scanWorkspace(
		includePaths?: string[],
		excludePaths?: string[],
		options?: IndexOptions,
	): Promise<string[]> {
		const files: string[] = []

		// 检查工作区路径是否存在
		if (!fs.existsSync(this.workspacePath)) {
			return []
		}

		// 使用简单的文件系统扫描来获取文件
		const results: string[] = []

		// 如果没有指定包含路径，使用默认值
		const includes = includePaths && includePaths.length > 0 ? includePaths : ["src", "lib", "app"]

		// 默认排除的目录
		const excludeDirs =
			excludePaths && excludePaths.length > 0
				? excludePaths
				: [
						// 包管理器目录
						"node_modules",
						"bower_components",
						"vendor",
						"packages",
						// 版本控制目录
						".git",
						".svn",
						".hg",
						".bzr",
						// 输出和构建目录
						"dist",
						"build",
						"out",
						"bin",
						"target",
						"output",
						"compiled",
						"deploy",
						"release",
						"debug",
						"publish",
						// 临时和缓存目录
						"tmp",
						"temp",
						"cache",
						".cache",
						".npm",
						".yarn",
						// IDE和编辑器目录
						".idea",
						".vscode",
						".vs",
						"__pycache__",
					]

		// 实现一个简单的扫描逻辑
		// 首先检查指定的包含目录
		let foundFiles = false
		for (const dir of includes) {
			const dirPath = join(this.workspacePath, dir)

			// 检查目录是否存在
			if (!fs.existsSync(dirPath)) {
				continue
			}

			await this.scanDirectory(dirPath, results, excludeDirs, options)
			foundFiles = foundFiles || results.length > 0
		}

		// 如果在指定目录中没有找到文件，则扫描根目录
		if (!foundFiles) {
			await this.scanDirectory(this.workspacePath, results, excludeDirs, options)
		}

		return results
	}

	/**
	 * 递归扫描目录
	 * @param directory 要扫描的目录
	 * @param results 结果数组
	 * @param excludes 排除的路径
	 */
	private async scanDirectory(
		directory: string,
		results: string[],
		excludes: string[],
		options?: IndexOptions,
	): Promise<void> {
		// 读取目录内容
		const entries = fs.readdirSync(directory, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = join(directory, entry.name)

			// 检查是否应该排除
			const relativePath = toPosixPath(relative(this.workspacePath, fullPath))
			const shouldExclude = excludes.some(
				(exclude) =>
					relativePath === exclude ||
					relativePath.startsWith(`${exclude}/`) ||
					relativePath.includes(`/${exclude}/`),
			)

			if (shouldExclude) {
				continue
			}

			if (entry.isDirectory()) {
				// 递归扫描子目录
				await this.scanDirectory(fullPath, results, excludes, options)
			} else if (entry.isFile()) {
				// 使用 shouldIndexFile 方法来统一判断文件是否应该被索引
				// 这样按钮触发的索引和文件系统监听器触发的索引会使用相同的规则
				if (this.shouldIndexFile(fullPath)) {
					results.push(toPosixPath(fullPath))
				}
			}
		}
	}

	/**
	 * 计算文件的索引优先级
	 * @param filePath 文件路径
	 * @returns 优先级（数字越大优先级越高）
	 * @private
	 */
	private calculatePriority(filePath: string): number {
		try {
			// 活跃文件优先级最高
			const activeEditor = vscode.window.activeTextEditor
			if (activeEditor && arePathsEqual(activeEditor.document.uri.fsPath, filePath)) {
				return 100
			}

			// 优先文件夹优先级高
			const relativePath = toPosixPath(relative(this.workspacePath, filePath))
			for (const folder of this.priorityFolders) {
				if (relativePath.startsWith(folder)) {
					return 50
				}
			}

			// 其他文件基本优先级
			return 10
		} catch (error) {
			console.error("Error calculating priority:", error)
			return 0
		}
	}

	/**
	 * 检测文件语言
	 * @param filePath 文件路径
	 * @returns 文件语言
	 * @private
	 */
	private detectLanguage(filePath: string): string {
		const ext = extname(filePath).toLowerCase()

		// 扩展的文件类型到语言映射
		const languageMap: Record<string, string> = {
			// TypeScript
			".ts": "typescript",
			".tsx": "typescript",
			".mts": "typescript",
			".cts": "typescript",
			// JavaScript
			".js": "javascript",
			".jsx": "javascript",
			".mjs": "javascript",
			".cjs": "javascript",
			// Python
			".py": "python",
			".pyi": "python",
			".pyw": "python",
			".pyx": "python",
			// Ruby
			".rb": "ruby",
			".rbw": "ruby",
			".rake": "ruby",
			// Go
			".go": "go",
			// Java
			".java": "java",
			".class": "java",
			".jar": "java",
			// C/C++
			".c": "c",
			".h": "c",
			".cpp": "cpp",
			".cc": "cpp",
			".cxx": "cpp",
			".hpp": "cpp",
			".hxx": "cpp",
			// C#
			".cs": "csharp",
			".csx": "csharp",
			// PHP
			".php": "php",
			".phtml": "php",
			// Rust
			".rs": "rust",
			// Swift
			".swift": "swift",
			// Kotlin
			".kt": "kotlin",
			".kts": "kotlin",
			// Web
			".html": "html",
			".htm": "html",
			".css": "css",
			".scss": "css",
			".sass": "css",
			".less": "css",
			// Data
			".json": "json",
			".yaml": "yaml",
			".yml": "yaml",
			".toml": "toml",
			".xml": "xml",
			".csv": "csv",
			// Shell
			".sh": "shell",
			".bash": "shell",
			".zsh": "shell",
			// Markdown
			".md": "markdown",
			".markdown": "markdown",
			// Config
			".ini": "ini",
			".conf": "ini",
			".config": "ini",
		}

		return languageMap[ext] || "plaintext"
	}

	/**
	 * 关闭服务
	 */
	public async close(): Promise<void> {
		// 停止索引
		this.indexQueue = []
		this.isIndexing = false

		// 清除定时器
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}

		// 关闭文件系统监听器
		if (this.fileSystemWatcher) {
			this.fileSystemWatcher.dispose()
			this.fileSystemWatcher = null
		}

		// 关闭数据库连接
		if (this.db) {
			try {
				// 确保所有数据已写入
				if (this._progress.status === "indexing") {
					// 强制停止索引
					this._progress.status = "completed"
					this._progress.completed = this._progress.total
				}

				// 添加延迟确保所有异步操作完成
				await new Promise((resolve) => setTimeout(resolve, 100))

				// 关闭数据库
				await this.db.close()
				this.db = null

				// 再次延迟确保文件系统完成
				await new Promise((resolve) => setTimeout(resolve, 100))
			} catch (error) {
				console.error("关闭数据库连接失败", error)
			}
		}
	}

	/**
	 * 设置文件系统监听器
	 * @private
	 */
	private setupFileSystemWatcher(): void {
		try {
			// 创建文件系统监听器，监听所有文件变化
			this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false)

			// 确保方法存在
			if (
				typeof this.fileSystemWatcher.onDidCreate !== "function" ||
				typeof this.fileSystemWatcher.onDidChange !== "function" ||
				typeof this.fileSystemWatcher.onDidDelete !== "function"
			) {
				// 测试环境下可能方法不存在
				console.log("FileSystemWatcher方法不可用，使用模拟方法")
				this.fileSystemWatcher = {
					onDidCreate: () => ({ dispose: () => {} }),
					onDidChange: () => ({ dispose: () => {} }),
					onDidDelete: () => ({ dispose: () => {} }),
					dispose: () => {},
				} as any
				return
			}

			// 监听文件创建事件
			this.fileSystemWatcher.onDidCreate(async (uri) => {
				const filePath = uri.fsPath
				// 检查文件是否应该被索引
				if (this.shouldIndexFile(filePath)) {
					this.scheduleIndex(filePath)
				}
			})

			// 监听文件修改事件
			this.fileSystemWatcher.onDidChange(async (uri) => {
				const filePath = uri.fsPath
				if (this.shouldIndexFile(filePath)) {
					this.scheduleIndex(filePath)
				}
			})

			// 监听文件删除事件
			this.fileSystemWatcher.onDidDelete(async (uri) => {
				const filePath = uri.fsPath
				await this.removeFileFromIndex(filePath)
			})
		} catch (error) {
			console.log("设置FileSystemWatcher失败", error)
			// 提供一个假的实现
			this.fileSystemWatcher = {
				onDidCreate: () => ({ dispose: () => {} }),
				onDidChange: () => ({ dispose: () => {} }),
				onDidDelete: () => ({ dispose: () => {} }),
				dispose: () => {},
			} as any
		}
	}

	/**
	 * 检查文件是否应该被索引
	 * @param filePath 文件路径
	 * @returns 是否应该索引
	 * @private
	 */
	private shouldIndexFile(filePath: string): boolean {
		const ext = extname(filePath).toLowerCase()
		const relativePath = toPosixPath(relative(this.workspacePath, filePath))

		// 检查是否在排除目录中
		const excludeDirs = [
			// 包管理器目录
			"node_modules",
			"bower_components",
			"vendor",
			"packages",
			// 版本控制目录
			".git",
			".svn",
			".hg",
			".bzr",
			// 输出和构建目录
			"dist",
			"build",
			"out",
			"bin",
			"target",
			"output",
			"compiled",
			"deploy",
			"release",
			"debug",
			"publish",
			// 临时和缓存目录
			"tmp",
			"temp",
			"cache",
			".cache",
			".npm",
			".yarn",
			// IDE和编辑器目录
			".idea",
			".vscode",
			".vs",
			"__pycache__",
			// 测试和文档目录 (可选，取决于配置)
			"test",
			"tests",
			"spec",
			"coverage",
			"docs",
			"example",
			"examples",
		]

		const shouldExclude = excludeDirs.some(
			(exclude) =>
				relativePath === exclude ||
				relativePath.startsWith(`${exclude}/`) ||
				relativePath.includes(`/${exclude}/`),
		)

		if (shouldExclude) {
			return false
		}

		// 获取默认排除的文件类型
		const defaultExcludeExtensions = [
			// 系统文件
			".DS_Store",
			".Thumbs.db",
			".desktop.ini",
			// 版本控制相关配置文件 - 保留这些文件扩展名
			".gitignore",
			".gitattributes",
			".gitmodules",
			// 二进制文件
			".exe",
			".dll",
			".so",
			".dylib",
			".class",
			".o",
			".obj",
			".a",
			".lib",
			// 压缩文件
			".zip",
			".tar",
			".gz",
			".rar",
			".7z",
			// 媒体文件
			".jpg",
			".jpeg",
			".png",
			".gif",
			".bmp",
			".svg",
			".mp3",
			".wav",
			".ogg",
			".mp4",
			".avi",
			".mov",
			// 字体文件
			".ttf",
			".otf",
			".woff",
			".woff2",
			".eot",
			// 编译输出
			".min.js",
			".min.css",
			".map",
			// 临时文件
			".tmp",
			".temp",
			".swp",
			".swo",
			// 日志文件
			".log",
			// 数据库文件
			".db",
			".sqlite",
			".sqlite3",
			// 其他
			".pdf",
			".doc",
			".docx",
			".xls",
			".xlsx",
			".ppt",
			".pptx",
			".psd",
			".ai",
			".sketch",
			".fig",
		]

		return !defaultExcludeExtensions.includes(ext)
	}

	/**
	 * 调度文件索引
	 * @param filePath 文件路径
	 * @private
	 */
	private scheduleIndex(filePath: string): void {
		// 清除之前的定时器
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}

		// 设置新的定时器，延迟 500ms 执行，避免频繁索引
		this.debounceTimer = setTimeout(async () => {
			await this.indexFile(filePath)
		}, 500)
	}

	/**
	 * 通知索引状态变化
	 * @private
	 */
	private notifyStatusChange(): void {
		// 为了保持进度条显示的一致性，首先确保进度值有效
		if (this._progress.status === "completed" && this._progress.total > 0) {
			// 如果状态是完成，但进度不匹配，则修正进度
			this._progress.completed = this._progress.total
		}

		// 安全触发事件
		const safeFireEvent = (stats: IndexStats) => {
			try {
				if (this._onIndexStatusChange && typeof this._onIndexStatusChange.fire === "function") {
					this._onIndexStatusChange.fire({
						isIndexing: this.isIndexing,
						progress: this._progress,
						stats: stats,
					})
				}
			} catch (error) {
				console.log("触发状态变化事件失败", error)
			}
		}

		// 先发送基本信息
		const basicStats: IndexStats = {
			filesCount: 0,
			symbolsCount: 0,
			keywordsCount: 0,
			lastIndexed: null,
			status: this._progress.status,
		}

		safeFireEvent(basicStats)

		// 然后异步更新完整的统计信息
		this.getIndexStats()
			.then((fullStats) => {
				// 确保stats的status值与progress的status保持一致
				fullStats.status = this._progress.status
				safeFireEvent(fullStats)
			})
			.catch((error) => {
				console.error("获取索引统计信息失败:", error)
			})
	}
}

/**
 * 创建代码库索引服务实例
 * @param workspacePath 工作区路径
 * @returns 索引服务实例
 */
export function createIndexService(workspacePath: string): CodebaseIndexService {
	return new CodebaseIndexService(workspacePath)
}
