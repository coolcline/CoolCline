/**
 * 代码库索引服务
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { IndexOptions, IndexProgress, IndexStats, IndexTask } from "./types"
import { toPosixPath, arePathsEqual, extname, join, relative } from "../../utils/path"
import { createDatabase, Database } from "./database"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"

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

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 */
	constructor(workspacePath: string) {
		this.workspacePath = toPosixPath(workspacePath)
		this.semanticAnalyzer = createSemanticAnalysisService(this.workspacePath)
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
			const files = await this.scanWorkspace(options?.includePaths, options?.excludePaths)
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
	 * 刷新索引
	 * @param options 索引选项
	 */
	public async refreshIndex(options?: IndexOptions): Promise<void> {
		if (this.isIndexing) {
			// 停止当前索引任务
			this.indexQueue = []
			this.isIndexing = false
		}

		// 重新开始索引
		await this.startIndexing(options)
	}

	/**
	 * 清除索引
	 */
	public async clearIndex(): Promise<void> {
		// 停止当前索引任务
		this.indexQueue = []
		this.isIndexing = false
		this._progress = { total: 0, completed: 0, status: "idle" }

		// 清除数据库内容
		try {
			if (this.db) {
				// 使用事务保证原子性
				await this.db.beginTransaction()
				try {
					// 清除所有关联表数据，顺序很重要（先清除依赖表）
					await this.db.exec("DELETE FROM symbol_relations")
					await this.db.exec("DELETE FROM keywords")
					await this.db.exec("DELETE FROM symbol_contents")
					await this.db.exec("DELETE FROM symbols")
					await this.db.exec("DELETE FROM files")

					// 保留工作区元数据表，但更新最后重置时间
					await this.db.run(
						"INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)",
						["last_reset", Date.now().toString(), Date.now()],
					)

					await this.db.commit()
					console.log("索引数据已清除")
				} catch (error) {
					// 如果出错，回滚事务
					await this.db.rollback()
					throw error
				}
			}
		} catch (error) {
			console.error("清除索引数据失败:", error)
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
					await this.db!.run(
						`INSERT OR REPLACE INTO files (path, language, last_modified, indexed_at, content_hash) 
						VALUES (?, ?, ?, ?, ?)`,
						[normalizedPath, language, lastModified, Date.now(), contentHash],
					)

					// 获取文件ID
					const fileRecord = await this.db!.get("SELECT id FROM files WHERE path = ?", [normalizedPath])

					if (!fileRecord || !fileRecord.id) {
						console.warn(`无法获取文件记录: ${normalizedPath}`)
						return
					}

					const fileId = fileRecord.id

					// 使用语义分析服务提取符号和关系
					const { symbols, relations } = await this.semanticAnalyzer.analyzeFile(filePath)

					// 在事务中保存符号和关系，确保原子性
					await this.db!.beginTransaction()
					try {
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
							if (relation.sourceId > 0 && relation.targetId > 0) {
								await this.db!.run(
									"INSERT INTO symbol_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)",
									[relation.sourceId, relation.targetId, relation.relationType],
								)
							}
						}

						await this.db!.commit()
					} catch (error) {
						await this.db!.rollback()
						throw error
					}

					console.log(`Indexed file: ${normalizedPath} (${language}) with ${symbols.length} symbols`)
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
	 * 从索引中移除文件
	 * @param filePath 文件路径
	 */
	public async removeFileFromIndex(filePath: string): Promise<void> {
		try {
			// 确保数据库已初始化
			await this.initDatabase()

			const normalizedPath = toPosixPath(filePath)

			// 查询文件ID
			const fileRecord = await this.db!.get("SELECT id FROM files WHERE path = ?", [normalizedPath])

			if (fileRecord && fileRecord.id) {
				// 使用事务确保原子性
				await this.db!.beginTransaction()
				try {
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

					await this.db!.commit()
					console.log(`Removed file from index: ${normalizedPath}`)
				} catch (error) {
					await this.db!.rollback()
					throw error
				}
			}
		} catch (error) {
			console.error(`Failed to remove file from index: ${filePath}`, error)
		}
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
		if (this.indexQueue.length === 0) {
			this._progress.status = "completed"
			this.isIndexing = false
			return
		}

		const batch = this.indexQueue.splice(0, this.batchSize)

		// 并行处理批次文件
		await Promise.all(batch.map((task) => this.indexFile(task.filePath)))

		this._progress.completed += batch.length

		// 添加延迟以减少资源占用
		setTimeout(() => this.processQueue(), this.processingDelay)
	}

	/**
	 * 扫描工作区文件
	 * @param includePaths 包含路径
	 * @param excludePaths 排除路径
	 * @returns 文件路径数组
	 * @private
	 */
	private async scanWorkspace(includePaths?: string[], excludePaths?: string[]): Promise<string[]> {
		// 添加日志记录工作区路径
		console.log(`正在扫描工作区: ${this.workspacePath}`)

		// 检查工作区路径是否存在
		if (!fs.existsSync(this.workspacePath)) {
			console.log(`工作区路径不存在: ${this.workspacePath}`)
			return []
		}

		// 使用简单的文件系统扫描来获取文件
		const results: string[] = []

		// 如果没有指定包含路径，使用默认值
		const includes = includePaths && includePaths.length > 0 ? includePaths : ["src", "lib", "app"]

		// 默认排除的目录
		const excludes =
			excludePaths && excludePaths.length > 0 ? excludePaths : ["node_modules", ".git", "dist", "build", "out"]

		console.log(`包含路径: ${includes.join(", ")}`)
		console.log(`排除路径: ${excludes.join(", ")}`)

		// 实现一个简单的扫描逻辑
		// 首先检查指定的包含目录
		let foundFiles = false
		for (const dir of includes) {
			const dirPath = join(this.workspacePath, dir)

			// 检查目录是否存在
			if (!fs.existsSync(dirPath)) {
				console.log(`包含的目录不存在，跳过: ${dirPath}`)
				continue
			}

			console.log(`扫描目录: ${dirPath}`)
			await this.scanDirectory(dirPath, results, excludes)
			foundFiles = foundFiles || results.length > 0
		}

		// 如果在指定目录中没有找到文件，则扫描根目录
		if (!foundFiles) {
			console.log(`在指定目录中未找到文件，扫描根目录: ${this.workspacePath}`)
			await this.scanDirectory(this.workspacePath, results, excludes)
		}

		console.log(`文件扫描完成，找到 ${results.length} 个文件`)
		return results
	}

	/**
	 * 递归扫描目录
	 * @param directory 要扫描的目录
	 * @param results 结果数组
	 * @param excludes 排除的路径
	 */
	private async scanDirectory(directory: string, results: string[], excludes: string[]): Promise<void> {
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
				await this.scanDirectory(fullPath, results, excludes)
			} else if (entry.isFile()) {
				// 只索引一些常见的代码文件
				const ext = extname(entry.name).toLowerCase()
				const validExtensions = [
					".ts",
					".tsx",
					".js",
					".jsx",
					".py",
					".rb",
					".go",
					".java",
					".c",
					".cpp",
					".cs",
					".php",
					".rs",
					".swift",
					".kt",
					".html",
					".css",
					".json",
				]

				if (validExtensions.includes(ext)) {
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

		// 简单的扩展名到语言映射
		const languageMap: Record<string, string> = {
			".ts": "typescript",
			".tsx": "typescript",
			".js": "javascript",
			".jsx": "javascript",
			".py": "python",
			".rb": "ruby",
			".go": "go",
			".java": "java",
			".c": "c",
			".cpp": "cpp",
			".cs": "csharp",
			".php": "php",
			".rs": "rust",
			".swift": "swift",
			".kt": "kotlin",
			".html": "html",
			".css": "css",
			".json": "json",
			".md": "markdown",
			".sql": "sql",
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

		// 关闭数据库连接
		if (this.db) {
			try {
				await this.db.close()
				this.db = null
			} catch (error) {
				console.error("关闭数据库连接失败", error)
			}
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
