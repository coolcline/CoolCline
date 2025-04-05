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
import { getDatabaseInstance, Database, getTestDatabaseInstance } from "./database"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"
import { IncrementalIndexer } from "./incremental-index"
import { TransactionManager } from "./transaction-manager"

// 定义索引状态接口
export interface IndexStatus {
	isIndexing: boolean
	progress: IndexProgress
	stats: IndexStats
}

// 索引服务选项接口
export interface IndexServiceOptions {
	useInMemoryDatabase?: boolean
	useTestMode?: boolean // 测试模式使用内存数据库，不创建任何真实文件
}

/**
 * 代码库索引服务类
 */
export class CodebaseIndexService {
	private workspacePath: string
	private indexQueue: IndexTask[] = []
	private isIndexing: boolean = false
	private _progress: IndexProgress = { total: 0, completed: 0, status: "idle" }
	private batchSize: number = 5
	private processingDelay: number = 20
	private priorityFolders: string[] = ["src", "lib", "app", "core"]
	private db: Database | null = null
	private semanticAnalyzer: SemanticAnalysisService
	private fileSystemWatcher: vscode.FileSystemWatcher | null = null
	private debounceTimer: NodeJS.Timeout | null = null
	private _onIndexStatusChange: vscode.EventEmitter<IndexStatus>
	public readonly onIndexStatusChange: vscode.Event<IndexStatus>
	private options: IndexOptions | undefined
	private _useInMemoryDatabase: boolean = false
	private _useTestMode: boolean = false

	// 保存扫描状态以支持恢复
	private _scanState: {
		dirQueue: { path: string; isIncluded: boolean }[]
		files: string[]
		excludeDirs: string[]
	} | null = null

	/**
	 * 事务管理包装器 - 在事务中执行操作
	 * @param operation 需要在事务中执行的操作函数
	 * @returns 操作函数的返回值
	 * @private
	 */
	private async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
		if (!this.db) {
			throw new Error("数据库未初始化")
		}

		// 使用事务管理器执行事务
		const transactionManager = TransactionManager.getInstance(this.db)
		return transactionManager.executeInTransaction(operation)
	}

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 * @param options 索引服务选项
	 */
	constructor(workspacePath: string, options?: IndexServiceOptions) {
		this.workspacePath = toPosixPath(workspacePath)
		this.semanticAnalyzer = createSemanticAnalysisService(this.workspacePath)
		this._useInMemoryDatabase = options?.useInMemoryDatabase || false
		this._useTestMode = options?.useTestMode || false // 设置测试模式标志

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

		// 只在非测试模式下设置文件系统监听器
		if (!this._useInMemoryDatabase && !this._useTestMode) {
			this.setupFileSystemWatcher()
		}
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
		if (this.db) {
			return
		}

		try {
			// 根据选项选择数据库类型
			if (this._useTestMode || this._useInMemoryDatabase) {
				// 使用测试模式的内存数据库
				this.db = await getTestDatabaseInstance()
				console.log("使用测试模式内存数据库")
			} else {
				// 使用常规文件数据库
				this.db = await getDatabaseInstance(this.workspacePath)
			}

			// 初始化事务管理器
			if (this.db) {
				TransactionManager.getInstance(this.db)
			}

			const stats = await this.getIndexStats()
			this.notifyStatusChange()
		} catch (error) {
			console.error("初始化数据库失败:", error)
			throw error
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
		this.options = options // 保存选项

		try {
			// 初始化数据库
			await this.initDatabase()

			// 使用增量索引器扫描工作区文件
			const incrementalIndexer = new IncrementalIndexer(this.db!)
			const filesToUpdate = await incrementalIndexer.executeIncrementalIndex(this.workspacePath, options)
			this._progress.total = filesToUpdate.length
			this._progress.status = "indexing"

			// 将需要更新的文件添加到索引队列
			this.indexQueue = await Promise.all(
				filesToUpdate.map(async (file) => {
					return {
						filePath: file.path,
						priority: this.calculatePriority(file.path),
						lastModified: file.last_modified,
					}
				}),
			)

			// 按优先级排序
			this.indexQueue.sort((a, b) => b.priority - a.priority)

			// 启动处理队列
			this.processQueue()
		} catch (error) {
			console.log("开始索引失败:", error)
			this._progress.status = "error"
			this.isIndexing = false
			throw error
		}
	}

	/**
	 * 停止当前索引
	 * 可以被用户手动触发停止当前索引过程
	 * @deprecated 使用 pauseIndexing 代替
	 */
	public async stopIndexing(): Promise<void> {
		// 为向后兼容，调用 pauseIndexing
		await this.pauseIndexing()
	}

	/**
	 * 暂停当前索引
	 * 暂停当前索引过程，但保留进度和状态，以便后续恢复
	 */
	public async pauseIndexing(): Promise<void> {
		if (this.isIndexing) {
			// 标记暂停状态，但保持索引队列
			this._progress.status = "paused"

			// 重要：暂时设置isIndexing为false来停止当前处理循环
			// 但不要清空索引队列，以便恢复时继续处理
			this.isIndexing = false

			// 确保所有数据已写入
			if (this.db) {
				try {
					// 执行一个空事务，确保所有数据已提交
					await this.executeInTransaction(async () => {
						// 空事务，只是为了确保之前的所有更改都已提交
					})
				} catch (error) {
					console.error("暂停时提交事务失败:", error)
				}
			}

			// console.table(await this.db!.all("SELECT * FROM files LIMIT 20"))

			// 强制暂停所有当前处理
			await new Promise((resolve) => setTimeout(resolve, 100))

			// 通知前端状态变化
			this.notifyStatusChange()

			console.log("索引过程已暂停")
		}
	}

	/**
	 * 恢复索引
	 * 恢复之前暂停的索引过程
	 */
	public async resumeIndexing(): Promise<void> {
		// 检查是否处于暂停状态
		if (this._progress.status !== "paused") {
			return
		}

		// 重新激活索引过程
		this.isIndexing = true

		try {
			// 初始化数据库，因为可能在暂停状态后删除了数据库
			await this.initDatabase()

			// 使用增量索引器扫描工作区文件
			const incrementalIndexer = new IncrementalIndexer(this.db!)
			const filesToUpdate = await incrementalIndexer.executeIncrementalIndex(this.workspacePath, this.options)
			this._progress.total = filesToUpdate.length
			this._progress.status = "indexing"

			// 将需要更新的文件添加到索引队列
			this.indexQueue = await Promise.all(
				filesToUpdate.map(async (file) => {
					return {
						filePath: file.path,
						priority: this.calculatePriority(file.path),
						lastModified: file.last_modified,
					}
				}),
			)

			// 按优先级排序
			this.indexQueue.sort((a, b) => b.priority - a.priority)

			// 启动处理队列
			this.processQueue()
		} catch (error) {
			console.error("恢复索引失败:", error)
			this._progress.status = "error"
			this.isIndexing = false
			this.notifyStatusChange()
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
			this.options = options // 保存选项

			// 确保数据库已初始化
			await this.initDatabase()

			// 扫描工作区文件
			const files = await this.scanWorkspace(options?.includePaths, options?.excludePaths, options)

			// 获取需要更新的文件列表
			const filesToUpdate: { path: string; last_modified: number }[] = []
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
					try {
						const stats = fs.statSync(file)
						filesToUpdate.push({
							path: file,
							last_modified: stats.mtimeMs,
						})
					} catch (error) {
						console.warn(`无法检查文件状态: ${file}`, error)
					}
				} else {
					// 检查文件是否被修改
					try {
						const stats = fs.statSync(file)
						const currentHash = stats.mtimeMs

						if (currentHash > indexedFile.content_hash) {
							// 文件被修改，需要更新
							filesToUpdate.push({
								path: file,
								last_modified: currentHash,
							})
						}
					} catch (error) {
						console.warn(`无法检查文件状态: ${file}`, error)
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
				// 使用事务管理器执行删除操作
				await this.executeInTransaction(async () => {
					await this.removeFilesFromIndex(filesToRemove, true) // true表示已在事务中
				})
			}

			// 更新或添加修改过的文件
			if (filesToUpdate.length > 0) {
				this._progress.total = filesToUpdate.length
				this._progress.completed = 0
				this._progress.status = "indexing"

				// 将文件添加到索引队列
				this.indexQueue = await Promise.all(
					filesToUpdate.map(async (file) => {
						return {
							filePath: file.path,
							priority: this.calculatePriority(file.path),
							lastModified: file.last_modified, // 使用已获取的 last_modified 值
						}
					}),
				)

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
			if (!this.db) {
				console.warn("数据库未初始化，无法清除索引")
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
	 * @param last_modified 文件最后修改时间，如果不提供将自动获取
	 * @param inTransaction 是否已在事务中，如果是则不会创建新事务
	 */
	public async indexFile(filePath: string, last_modified?: number, inTransaction: boolean = false): Promise<void> {
		await this.initDatabase()

		// 检查文件是否存在
		if (!fs.existsSync(filePath)) {
			// console.log(`文件不存在，跳过索引: ${filePath}`)
			return
		}

		// 检查是否在.vscode-test目录中，这些文件可能是临时的或不稳定的
		if (filePath.includes(".vscode-test")) {
			// console.log(`跳过.vscode-test目录下的文件: ${filePath}`)
			return
		}

		// 根据是否已在事务中决定是否创建新事务
		const executeOperation = async () => {
			try {
				// 执行文件索引逻辑...
				// const fileStats = fs.statSync(filePath)
				// 如果没有提供 last_modified，则使用文件的修改时间
				const lastModified = last_modified !== undefined ? last_modified : fs.statSync(filePath).mtimeMs

				// 计算文件内容的哈希以检测变化
				// const content = fs.readFileSync(filePath, "utf-8")
				// const contentHash = this.calculateContentHash(content)
				const contentHash = lastModified

				// 检查文件是否已在数据库中，并检查其内容是否有变化
				const existingFile = await this.db!.get("SELECT id, content_hash FROM files WHERE path = ?", [filePath])

				if (existingFile && existingFile.content_hash === contentHash) {
					// 文件存在且内容未变化，更新索引时间
					await this.db!.run("UPDATE files SET indexed_at = ? WHERE id = ?", [Date.now(), existingFile.id])
					return // 跳过后续处理
				}

				// 如果文件已存在但内容变化，先删除旧索引
				if (existingFile) {
					await this.removeFileFromIndex(filePath, true)
				}

				// 添加或更新文件信息
				const language = this.detectLanguage(filePath)
				const fileResult = await this.db!.run(
					"INSERT INTO files (path, language, last_modified, indexed_at, content_hash) VALUES (?, ?, ?, ?, ?)",
					[filePath, language, lastModified, Date.now(), contentHash],
				)
				const fileId = fileResult.lastID

				// 提取和保存符号信息
				try {
					// 使用语义分析服务解析符号
					const { symbols, relations } = await this.semanticAnalyzer.analyzeFile(filePath)

					// 保存符号信息
					for (const symbol of symbols) {
						const symbolResult = await this.db!.run(
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

						const symbolId = symbolResult.lastID

						// 保存符号内容 (上下文)
						if (symbol.content) {
							await this.db!.run("INSERT INTO symbol_contents (symbol_id, content) VALUES (?, ?)", [
								symbolId,
								symbol.content,
							])
						}

						// 提取和保存关键词
						const keywords = this.extractKeywords(symbol.name, symbol.content || "")
						for (const keyword of keywords) {
							await this.db!.run(
								"INSERT OR IGNORE INTO keywords (keyword, symbol_id, relevance) VALUES (?, ?, ?)",
								[keyword, symbolId, 1.0],
							)
						}
					}

					// 保存符号关系
					for (const relation of relations) {
						if (relation.sourceId && relation.targetId) {
							await this.db!.run(
								`INSERT OR IGNORE INTO symbol_relations
								(source_id, target_id, relation_type)
								VALUES (?, ?, ?)`,
								[relation.sourceId, relation.targetId, relation.relationType],
							)
						}
					}
				} catch (parseError) {
					console.error(`无法解析文件符号: ${filePath}`, parseError)
					// 继续处理其他文件
				}
			} catch (error) {
				console.error(`索引文件时出错: ${filePath}`, error)
				// 记录错误但不中断索引过程
			}
		}

		// 根据是否已在事务中决定是否创建新事务
		if (inTransaction) {
			// 如果已在事务中，直接执行操作
			await executeOperation()
		} else {
			// 如果不在事务中，创建新事务
			const transactionManager = TransactionManager.getInstance(this.db!)
			await transactionManager.executeInTransaction(executeOperation)
		}
	}

	/**
	 * 计算内容哈希值
	 * @param content 文件内容
	 * @returns 哈希值
	 */
	// private calculateContentHash(content: string): string {
	// 	// 简单的哈希计算
	// 	let hash = 0
	// 	for (let i = 0; i < content.length; i++) {
	// 		const char = content.charCodeAt(i)
	// 		hash = (hash << 5) - hash + char
	// 		hash = hash & hash // 转换为32位整数
	// 	}
	// 	return Math.abs(hash).toString(16)
	// }

	/**
	 * 从索引中删除文件
	 * @param filePath 文件路径
	 * @param inTransaction 是否已在事务中
	 */
	public async removeFileFromIndex(filePath: string, inTransaction: boolean = false): Promise<void> {
		await this.initDatabase()

		// 使用独立的工具函数实现
		const { removeFileFromIndex } = await import("./removeFileFromIndex")
		await removeFileFromIndex(this.db!, filePath, inTransaction)
	}

	/**
	 * 从索引中删除多个文件
	 * @param filePaths 文件路径数组
	 * @param inTransaction 是否已在事务中
	 */
	public async removeFilesFromIndex(filePaths: string[], inTransaction: boolean = false): Promise<void> {
		await this.initDatabase()

		// 使用批量删除函数
		const { removeFilesFromIndex } = await import("./removeFileFromIndex")
		await removeFilesFromIndex(this.db!, filePaths, inTransaction)
	}

	/**
	 * 获取索引统计信息
	 */
	public async getIndexStats(): Promise<IndexStats> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()
			// console.log("已经索引：",await this.db!.all("SELECT * FROM files"))

			// 从数据库获取统计信息
			const filesCount = await this.db!.get("SELECT COUNT(id) as count FROM files WHERE content_hash > 0")
			const symbolsCount = await this.db!.get("SELECT COUNT(id) as count FROM symbols")
			const keywordsCount = await this.db!.get("SELECT COUNT(symbol_id) as count FROM keywords")
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
			// 如果是由于暂停索引导致的，保持暂停状态
			if (this._progress.status === "paused") {
				// 确保isIndexing为false
				this.isIndexing = false

				// 确保所有数据已写入
				if (this.db) {
					try {
						// 执行一个空事务，确保所有数据已提交
						await this.executeInTransaction(async () => {
							// 空事务，只是为了确保之前的所有更改都已提交
						})
					} catch (error) {
						console.error("暂停时提交事务失败:", error)
					}
				}

				// 通知监听器索引已暂停
				this.notifyStatusChange()
				return
			}

			// 如果是由于停止索引导致的，保持停止状态
			if (this._progress.status === "stopped") {
				this.isIndexing = false

				// 确保所有数据已写入
				if (this.db) {
					try {
						// 执行一个空事务，确保所有数据已提交
						await this.executeInTransaction(async () => {
							// 空事务，只是为了确保之前的所有更改都已提交
						})
					} catch (error) {
						console.error("暂停时提交事务失败:", error)
					}
				}

				// 通知监听器索引已停止
				this.notifyStatusChange()
				return
			}

			this._progress.status = "completed"
			this.isIndexing = false

			// 确保所有数据已写入
			if (this.db) {
				try {
					// 执行一个空事务，确保所有数据已提交
					await this.executeInTransaction(async () => {
						// 空事务，只是为了确保之前的所有更改都已提交
					})
				} catch (error) {
					console.error("提交最终事务失败:", error)
				}
			}

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

		// 再次检查状态是否为暂停
		if (this._progress.status === "paused") {
			this.isIndexing = false
			this.notifyStatusChange()
			return
		}

		// 自适应批处理大小，初始较小，处理顺利时逐渐增加
		const currentBatchSize = Math.min(this.batchSize, Math.max(5, Math.floor(this.indexQueue.length / 10)))

		// 取出一批任务
		const batch = this.indexQueue.splice(0, currentBatchSize)
		// 设置状态为indexing
		this._progress.status = "indexing"

		// 记录批处理开始时间，用于自适应调整延迟
		const batchStartTime = Date.now()

		try {
			// 处理批次，使用事务包装器
			await this.executeInTransaction(async () => {
				for (const task of batch) {
					// 检查是否应该暂停处理
					if (!this.isIndexing || this._progress.status !== "indexing") {
						// 将未处理的任务放回队列前面
						this.indexQueue.unshift(task)
						return
					}

					// 在批处理事务中调用indexFile，传入inTransaction=true避免嵌套事务
					await this.indexFile(task.filePath, task.lastModified, true)
					this._progress.completed++

					// 每完成一个任务就通知进度变化
					if (this._progress.completed % 5 === 0 || this._progress.completed === this._progress.total) {
						this.notifyStatusChange()
					}

					// 每处理一个文件后让出控制权，避免长时间阻塞
					if (this._progress.completed % 3 === 0) {
						await new Promise((resolve) => setTimeout(resolve, 0))

						// 在让出控制权后，再次检查是否应该暂停
						if (!this.isIndexing || this._progress.status !== "indexing") {
							// 将剩余未处理的任务放回队列前面
							for (let i = batch.indexOf(task) + 1; i < batch.length; i++) {
								this.indexQueue.unshift(batch[i])
							}
							return
						}
					}
				}

				// 在批处理完成后，更新这批文件的 content_hash
				// indexFile 方法里的insert 是同样作用 "INSERT INTO files (path, language, last_modified, indexed_at, content_hash) VALUES (?, ?, ?, ?, ?)",
				// [filePath, language, lastModified, Date.now(), contentHash]

				// for (const task of batch) {
				// 	await this.updateContentHash(task.filePath, task.lastModified)
				// }
			})

			// 最后一次检查是否应该暂停
			if (!this.isIndexing || this._progress.status !== "indexing") {
				this.notifyStatusChange()
				return
			}

			// 计算批处理耗时
			const batchProcessTime = Date.now() - batchStartTime

			// 自适应调整处理延迟
			// 如果处理速度太快，减少延迟；如果处理速度慢，增加延迟
			if (batchProcessTime > 500) {
				// 处理耗时较长，可能系统负载较高，增加延迟
				this.processingDelay = Math.min(200, this.processingDelay + 20)
				// 同时减小批处理大小
				this.batchSize = Math.max(5, this.batchSize - 1)
			} else if (batchProcessTime < 100 && this.processingDelay > 0) {
				// 处理较快，减少延迟
				this.processingDelay = Math.max(0, this.processingDelay - 5)
				// 尝试增加批处理大小，但不超过初始设定
				this.batchSize = Math.min(20, this.batchSize + 1)
			}

			// 添加延迟以避免阻塞主线程
			await new Promise((resolve) => setTimeout(resolve, this.processingDelay))

			// 继续处理下一批，使用setTimeout避免递归调用导致的栈溢出
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

		// 准备要扫描的目录队列
		const dirQueue: { path: string; isIncluded: boolean }[] = []

		// 首先添加包含目录
		for (const dir of includes) {
			const dirPath = join(this.workspacePath, dir)
			if (fs.existsSync(dirPath)) {
				dirQueue.push({ path: dirPath, isIncluded: true })
			}
		}

		// 如果没有找到包含目录，添加工作区根目录
		if (dirQueue.length === 0) {
			dirQueue.push({ path: this.workspacePath, isIncluded: false })
		}

		let hasYieldedControl = false

		// 异步批处理扫描目录
		while (dirQueue.length > 0 && this.isIndexing) {
			// 定期让出控制权，避免阻塞主线程
			if (!hasYieldedControl || dirQueue.length % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0))
				hasYieldedControl = true

				// 通知进度变化
				this.notifyStatusChange()

				// 如果扫描过程被暂停，保存当前状态并返回
				if (this._progress.status === "paused") {
					// 保存扫描状态，将来可以恢复
					this._scanState = {
						dirQueue,
						files,
						excludeDirs,
					}
					return files
				}
			}

			// 处理当前目录
			const { path: currentDir, isIncluded } = dirQueue.shift()!

			try {
				// 分批读取目录内容
				const entries = fs.readdirSync(currentDir, { withFileTypes: true })

				// 处理当前目录中的每个条目
				for (const entry of entries) {
					const fullPath = join(currentDir, entry.name)

					// 检查是否应该排除
					const relativePath = toPosixPath(relative(this.workspacePath, fullPath))
					const shouldExclude = excludeDirs.some(
						(exclude) =>
							relativePath === exclude ||
							relativePath.startsWith(`${exclude}/`) ||
							relativePath.includes(`/${exclude}/`),
					)

					if (shouldExclude) {
						continue
					}

					if (entry.isDirectory()) {
						// 将子目录添加到队列
						dirQueue.push({ path: fullPath, isIncluded })
					} else if (entry.isFile() && this.shouldIndexFile(fullPath)) {
						files.push(toPosixPath(fullPath))
					}
				}
			} catch (error) {
				console.warn(`无法读取目录 ${currentDir}:`, error)
			}
		}

		return files
	}

	/**
	 * 恢复之前暂停的扫描
	 */
	private async resumeScan(): Promise<string[]> {
		if (!this._scanState) {
			return []
		}

		const { dirQueue, files, excludeDirs } = this._scanState
		this._scanState = null

		// 继续扫描剩余目录
		let hasYieldedControl = false

		while (dirQueue.length > 0 && this.isIndexing) {
			// 定期让出控制权，避免阻塞主线程
			if (!hasYieldedControl || dirQueue.length % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0))
				hasYieldedControl = true

				// 通知进度变化
				this.notifyStatusChange()

				// 如果扫描过程被暂停，保存当前状态并返回
				if (this._progress.status === "paused") {
					// 再次保存扫描状态，将来可以恢复
					this._scanState = {
						dirQueue,
						files,
						excludeDirs,
					}
					return files
				}
			}

			// 处理当前目录
			const { path: currentDir, isIncluded } = dirQueue.shift()!

			try {
				// 分批读取目录内容
				const entries = fs.readdirSync(currentDir, { withFileTypes: true })

				// 处理当前目录中的每个条目
				for (const entry of entries) {
					const fullPath = join(currentDir, entry.name)

					// 检查是否应该排除
					const relativePath = toPosixPath(relative(this.workspacePath, fullPath))
					const shouldExclude = excludeDirs.some(
						(exclude) =>
							relativePath === exclude ||
							relativePath.startsWith(`${exclude}/`) ||
							relativePath.includes(`/${exclude}/`),
					)

					if (shouldExclude) {
						continue
					}

					if (entry.isDirectory()) {
						// 将子目录添加到队列
						dirQueue.push({ path: fullPath, isIncluded })
					} else if (entry.isFile() && this.shouldIndexFile(fullPath)) {
						files.push(toPosixPath(fullPath))
					}
				}
			} catch (error) {
				console.warn(`无法读取目录 ${currentDir}:`, error)
			}
		}

		return files
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
					this.scheduleIndex(filePath, 0)
				}
			})

			// 监听文件修改事件
			this.fileSystemWatcher.onDidChange(async (uri) => {
				const filePath = uri.fsPath
				if (this.shouldIndexFile(filePath)) {
					this.scheduleIndex(filePath, 0)
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

		// 首先检查是否是目录
		if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
			return false
		}

		// 测试相关目录，根据 includeTests 选项决定是否排除
		const testDirs = ["test", "tests", "spec", "coverage", "__tests__", "__test__", "__mocks__"]
		const isInTestDir = testDirs.some(
			(testDir) =>
				relativePath === testDir ||
				relativePath.startsWith(`${testDir}/`) ||
				relativePath.includes(`/${testDir}/`),
		)

		// 如果文件在测试目录中且 includeTests 为 false，则排除
		if (isInTestDir && this.options?.includeTests !== true) {
			return false
		}

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
			// 文档目录
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
	private scheduleIndex(filePath: string, last_modified: number): void {
		// 清除之前的定时器
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}

		// 设置新的定时器，延迟 500ms 执行，避免频繁索引
		this.debounceTimer = setTimeout(async () => {
			await this.indexFile(filePath, last_modified)
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

		// 获取最新的统计信息并直接发送，避免统计数据不更新的问题
		this.getIndexStats()
			.then((fullStats) => {
				// 确保stats的status值与progress的status保持一致
				fullStats.status = this._progress.status
				safeFireEvent(fullStats)
			})
			.catch((error) => {
				console.error("获取索引统计信息失败:", error)
				// 发生错误时才发送基本信息作为备选
				const basicStats: IndexStats = {
					filesCount: 0,
					symbolsCount: 0,
					keywordsCount: 0,
					lastIndexed: null,
					status: this._progress.status,
				}
				safeFireEvent(basicStats)
			})
	}

	/**
	 * 更新内容哈希值
	 * @param filePath 文件路径
	 * @param lastModified 文件最后修改时间
	 */
	private async updateContentHash(filePath: string, lastModified: number): Promise<void> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()

			// 更新文件的 content_hash
			await this.db!.run("UPDATE files SET indexed_at = ?, content_hash = ? WHERE path = ?", [
				Date.now(),
				lastModified,
				toPosixPath(filePath),
			])
		} catch (error) {
			console.error(`Failed to update content hash for file: ${filePath}`, error)
		}
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
