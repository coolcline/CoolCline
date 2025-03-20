/**
 * 代码库索引服务
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { IndexOptions, IndexProgress, IndexStats, IndexTask } from "./types"
import { toPosixPath, arePathsEqual, extname, join, relative } from "../../utils/path"

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

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 */
	constructor(workspacePath: string) {
		this.workspacePath = toPosixPath(workspacePath)
	}

	/**
	 * 获取索引进度
	 */
	public get progress(): IndexProgress {
		return this._progress
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

		// TODO: 清除数据库内容
	}

	/**
	 * 索引单个文件
	 * @param filePath 文件路径
	 */
	public async indexFile(filePath: string): Promise<void> {
		try {
			// 检查文件是否存在
			if (!fs.existsSync(filePath)) {
				console.warn(`File does not exist: ${filePath}`)
				return
			}

			// 获取文件内容
			const content = await fs.promises.readFile(filePath, "utf-8")

			// 获取文件语言
			const language = this.detectLanguage(filePath)

			// TODO: 解析文件内容，提取符号
			// TODO: 将符号写入数据库

			console.log(`Indexed file: ${toPosixPath(filePath)} (${language})`)
		} catch (error) {
			console.error(`Failed to index file: ${toPosixPath(filePath)}`, error)
		}
	}

	/**
	 * 从索引中移除文件
	 * @param filePath 文件路径
	 */
	public async removeFileFromIndex(filePath: string): Promise<void> {
		// TODO: 从数据库中移除文件相关数据
		console.log(`Removed file from index: ${filePath}`)
	}

	/**
	 * 获取索引统计信息
	 */
	public async getIndexStats(): Promise<IndexStats> {
		// TODO: 从数据库获取真实统计信息
		return {
			filesCount: 0,
			symbolsCount: 0,
			keywordsCount: 0,
			lastIndexed: null,
			status: this._progress.status,
		}
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
		// 这里简化实现，实际应使用glob或其他方式高效扫描文件
		// TODO: 实现真正的文件扫描逻辑

		// 临时返回一些测试文件
		return [
			toPosixPath(join(this.workspacePath, "src/index.ts")),
			toPosixPath(join(this.workspacePath, "src/services/codebase-search/index-service.ts")),
		]
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
}

/**
 * 创建代码库索引服务实例
 * @param workspacePath 工作区路径
 * @returns 索引服务实例
 */
export function createIndexService(workspacePath: string): CodebaseIndexService {
	return new CodebaseIndexService(workspacePath)
}
