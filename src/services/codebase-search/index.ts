/**
 * 代码库搜索工具入口
 */
import * as vscode from "vscode"
import { CodebaseIndexService, createIndexService } from "./index-service"
import { CodebaseSearchService, createSearchService } from "./search-service"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"
import { CodebaseSearchOptions, IndexOptions, IndexProgress, IndexStats, SearchResult } from "./types"
import { toPosixPath, toRelativePath } from "../../utils/path"
import { CodeSymbol, RelationType, ResultType, WorkspaceSearchResult } from "./types"
import { IndexStatus } from "./index-service"

/**
 * 代码库搜索管理器
 */
export class CodebaseSearchManager {
	private static instance: CodebaseSearchManager
	private indexServices: Map<string, CodebaseIndexService> = new Map()
	private searchServices: Map<string, CodebaseSearchService> = new Map()
	private semanticServices: Map<string, SemanticAnalysisService> = new Map()
	private currentWorkspacePath: string = ""

	/**
	 * 获取管理器单例
	 */
	public static getInstance(): CodebaseSearchManager {
		if (!CodebaseSearchManager.instance) {
			CodebaseSearchManager.instance = new CodebaseSearchManager()
		}
		return CodebaseSearchManager.instance
	}

	/**
	 * 初始化指定工作区的服务
	 * @param workspacePath 工作区路径
	 */
	public async initialize(workspacePath: string): Promise<void> {
		try {
			// 验证工作区路径
			if (!workspacePath || workspacePath.trim() === "") {
				throw new Error("工作区路径不能为空")
			}

			// 规范化工作区路径
			workspacePath = toPosixPath(workspacePath)
			this.currentWorkspacePath = workspacePath

			// 创建索引服务
			const indexService = createIndexService(workspacePath)
			this.indexServices.set(workspacePath, indexService)

			// 创建搜索服务
			const searchService = createSearchService(workspacePath)
			this.searchServices.set(workspacePath, searchService)

			// 创建语义分析服务
			const semanticService = createSemanticAnalysisService(workspacePath)
			this.semanticServices.set(workspacePath, semanticService)
		} catch (error) {
			console.error(`初始化代码库搜索服务失败:`, error)
			throw error
		}
	}

	/**
	 * 获取指定工作区的索引服务
	 * @param workspacePath 工作区路径
	 */
	public getIndexService(workspacePath: string): CodebaseIndexService | undefined {
		if (!workspacePath) {
			workspacePath = this.currentWorkspacePath
		}
		return this.indexServices.get(workspacePath)
	}

	/**
	 * 获取指定工作区的搜索服务
	 * @param workspacePath 工作区路径
	 */
	public getSearchService(workspacePath: string): CodebaseSearchService {
		const searchService = this.searchServices.get(workspacePath)
		if (!searchService) {
			throw new Error(`搜索服务未找到，工作区: ${workspacePath}`)
		}
		return searchService
	}

	/**
	 * 获取指定工作区的语义分析服务
	 * @param workspacePath 工作区路径
	 */
	public getSemanticService(workspacePath: string): SemanticAnalysisService {
		const semanticService = this.semanticServices.get(workspacePath)
		if (!semanticService) {
			throw new Error(`语义分析服务未找到，工作区: ${workspacePath}`)
		}
		return semanticService
	}

	/**
	 * 搜索当前工作区
	 * @param query 搜索查询
	 * @param options 搜索选项
	 */
	public async search(query: string, options?: CodebaseSearchOptions): Promise<SearchResult[]> {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const searchService = this.getSearchService(workspacePath)
			return await searchService.search(query, options)
		} catch (error) {
			console.error("搜索失败:", error)
			throw new Error(`搜索失败: ${error.message}`)
		}
	}

	/**
	 * 获取当前工作区索引状态
	 */
	public async getIndexStatus(): Promise<IndexStats> {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const indexService = this.getIndexService(workspacePath)
			return (
				(await indexService?.getIndexStats()) || {
					filesCount: 0,
					symbolsCount: 0,
					keywordsCount: 0,
					lastIndexed: null,
					status: "error",
				}
			)
		} catch (error) {
			console.error("获取索引状态失败:", error)
			return {
				filesCount: 0,
				symbolsCount: 0,
				keywordsCount: 0,
				lastIndexed: null,
				status: "error",
			}
		}
	}

	/**
	 * 获取当前工作区索引进度
	 */
	public getIndexProgress(): IndexProgress {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const indexService = this.getIndexService(workspacePath)
			return indexService?.progress || { total: 0, completed: 0, status: "error" }
		} catch (error) {
			console.error("获取索引进度失败:", error)
			return { total: 0, completed: 0, status: "error" }
		}
	}

	/**
	 * 开始索引当前工作区
	 * @param options 索引选项
	 */
	public async startIndexing(options?: IndexOptions): Promise<void> {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const indexService = this.getIndexService(workspacePath)
			await indexService?.startIndexing(options)
		} catch (error) {
			console.error("开始索引失败:", error)
			throw new Error(`开始索引失败: ${error.message}`)
		}
	}

	/**
	 * 刷新当前工作区索引
	 * @param options 索引选项
	 */
	public async refreshIndex(options?: IndexOptions): Promise<void> {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const indexService = this.getIndexService(workspacePath)
			await indexService?.refreshIndex(options)
		} catch (error) {
			console.error("刷新索引失败:", error)
			throw new Error(`刷新索引失败: ${error.message}`)
		}
	}

	/**
	 * 清除当前工作区索引
	 */
	public async clearIndex(): Promise<void> {
		try {
			const workspacePath = this.getCurrentWorkspacePath()
			const indexService = this.getIndexService(workspacePath)
			await indexService?.clearIndex()
		} catch (error) {
			console.error("清除索引失败:", error)
			throw new Error(`清除索引失败: ${error.message}`)
		}
	}

	/**
	 * 获取当前工作区路径
	 * @returns 工作区路径
	 * @private
	 */
	private getCurrentWorkspacePath(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error("没有打开的工作区")
		}
		return toPosixPath(workspaceFolders[0].uri.fsPath)
	}

	/**
	 * 订阅索引状态变更事件
	 * @param listener 监听器函数
	 * @returns 可释放的事件订阅
	 */
	public onIndexStatusChange(listener: (status: IndexStatus) => void): vscode.Disposable {
		const service = this.getIndexService(this.currentWorkspacePath)
		if (!service) {
			return { dispose: () => {} }
		}
		return service.onIndexStatusChange(listener)
	}
}

/**
 * 为所有工作区初始化搜索服务
 */
export async function initializeCodebaseSearch(): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return
	}

	const manager = CodebaseSearchManager.getInstance()

	// 先初始化服务，这个过程较快
	for (const folder of workspaceFolders) {
		try {
			const workspacePath = folder.uri.fsPath
			await manager.initialize(workspacePath)
		} catch (error) {
			console.error(`初始化工作区失败:`, error)
		}
	}

	// 使用setImmediate将索引过程移到下一个事件循环，不阻塞扩展激活
	setImmediate(() => {
		// 显示进度通知
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Codebase Index",
				cancellable: false,
			},
			async (progress) => {
				// 为每个工作区启动索引
				for (const folder of workspaceFolders) {
					try {
						const workspacePath = folder.uri.fsPath
						progress.report({ message: "Scanning" })

						// 开始索引过程
						await manager.startIndexing({
							includePaths: ["src", "lib", "app", "core"],
							excludePaths: ["node_modules", ".git", "dist", "build"],
						})

						// 获取索引状态并更新进度
						const indexStats = await manager.getIndexStatus()
						progress.report({
							message: `Indexed ${indexStats.filesCount} files`,
						})
					} catch (error) {
						console.error(`索引工作区失败:`, error)
						progress.report({
							message: "Indexing error",
						})
					}
				}

				// 显示完成消息
				progress.report({
					message: "Indexing completed",
				})

				// 显示状态栏消息通知用户索引已完成
				vscode.window.setStatusBarMessage("Codebase indexing completed", 5000)

				return new Promise<void>((resolve) => {
					// 短暂显示完成消息后关闭进度条
					setTimeout(() => {
						resolve()
					}, 3000)
				})
			},
		)
	})
}

/**
 * 处理代码库搜索工具调用
 * @param params 工具参数
 * @returns 搜索结果
 */
export async function handleCodebaseSearchTool(params: any): Promise<any> {
	try {
		// 验证参数
		if (!params.query) {
			throw new Error("搜索查询不能为空")
		}

		// 初始化服务（如果尚未初始化）
		const manager = CodebaseSearchManager.getInstance()
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders && workspaceFolders.length > 0) {
			if (!manager.getIndexService(workspaceFolders[0].uri.fsPath)) {
				await manager.initialize(workspaceFolders[0].uri.fsPath)
			}
		}

		// 检查索引状态
		const indexStats = await manager.getIndexStatus()
		if (indexStats.status === "indexing" || indexStats.status === "scanning") {
			// 如果索引正在进行中，提示用户并继续搜索
			const indexProgress = manager.getIndexProgress()
			const progressMessage =
				indexProgress.total > 0 ? `indexing (${indexProgress.completed}/${indexProgress.total})` : "indexing"

			// 创建状态消息通知用户索引未完成
			vscode.window.setStatusBarMessage("Codebase indexing in progress - search results may be incomplete", 3000)

			// 设置警告消息，但仍然继续搜索
			const warning = {
				warning: true,
				message: `Note: Codebase indexing not complete (${progressMessage}), search results may be incomplete`,
			}
		}

		// 构建搜索选项
		const options: CodebaseSearchOptions = {}

		// 设置目标目录
		if (params.target_directories && Array.isArray(params.target_directories)) {
			options.targetDirectories = params.target_directories
		}

		// 设置其他选项（可根据需要扩展）
		options.maxResults = 10 // 默认限制结果数量

		// 执行搜索
		const results = await manager.search(params.query, options)

		// 格式化结果
		const formattedResults = formatSearchResults(results)

		// 如果有警告消息和索引未完成，添加到结果中
		if (indexStats.status === "indexing" || indexStats.status === "scanning") {
			formattedResults.indexing = true
			formattedResults.message = "Note: Codebase indexing not complete, search results may be incomplete"
		}

		return formattedResults
	} catch (error) {
		console.error("代码库搜索工具调用失败:", error)
		return {
			error: `搜索失败: ${error.message}`,
		}
	}
}

/**
 * 格式化搜索结果
 * @param results 搜索结果数组
 * @returns 格式化的结果
 * @private
 */
function formatSearchResults(results: SearchResult[]): any {
	// 如果没有结果
	if (!results || results.length === 0) {
		return {
			found: false,
			message: "未找到匹配的代码",
			results: [],
		}
	}

	// 格式化结果
	const formattedResults = results.map((result) => {
		// 获取相对路径
		const workspaceFolders = vscode.workspace.workspaceFolders
		let relativePath = result.file
		if (workspaceFolders && workspaceFolders.length > 0) {
			const workspacePath = workspaceFolders[0].uri.fsPath
			relativePath = toRelativePath(result.file, workspacePath)
		}

		return {
			file: relativePath,
			line: result.line,
			column: result.column,
			context: result.context,
			relevance: result.relevance,
			type: result.type,
			symbol: result.symbol,
			signature: result.signature,
		}
	})

	return {
		found: true,
		count: formattedResults.length,
		results: formattedResults,
	}
}

/**
 * 处理来自webview的代码库搜索相关消息
 * @param webview webview实例
 * @param message 消息内容
 */
export async function handleCodebaseSearchWebviewMessage(webview: vscode.Webview, message: any): Promise<void> {
	try {
		const manager = CodebaseSearchManager.getInstance()

		switch (message.action) {
			case "getStats":
				// 获取索引状态和进度
				const stats = await manager.getIndexStatus()
				const progress = manager.getIndexProgress()

				// 发送状态和进度回webview
				webview.postMessage({
					type: "codebaseIndexStats",
					stats,
					progress,
				})
				break

			case "refreshIndex":
				try {
					// 解析前端发送的设置
					const refreshOptions: IndexOptions = {}

					// 如果提供了设置，使用它们
					if (message.settings) {
						if (message.settings.excludePaths) {
							refreshOptions.excludePaths = message.settings.excludePaths
								.split(",")
								.map((path: string) => path.trim())
								.filter(Boolean)
						}

						if (message.settings.includeTests !== undefined) {
							refreshOptions.includeTests = message.settings.includeTests
						}
					}

					// 开始刷新索引
					await manager.refreshIndex(refreshOptions)

					// 获取最新的索引统计数据
					const stats = await manager.getIndexStatus()

					// 向 WebView 发送最初的响应
					webview.postMessage({
						type: "codebaseIndexStats",
						stats,
						progress: manager.getIndexProgress(),
					})

					// 添加索引状态变更监听器
					const disposable = manager.onIndexStatusChange((status) => {
						// 向 WebView 发送进度更新（保持之前的消息格式）
						webview.postMessage({
							type: "codebaseIndexStats",
							stats: status.stats,
							progress: status.progress,
						})

						// 如果索引已完成或出错，移除监听器
						if (status.progress.status === "completed" || status.progress.status === "error") {
							disposable.dispose()
						}
					})
				} catch (error) {
					console.error("刷新索引失败:", error)
					// 向 WebView 发送错误响应
					webview.postMessage({
						type: "codebaseIndexStats",
						error: String(error),
						stats: {
							filesCount: 0,
							symbolsCount: 0,
							keywordsCount: 0,
							lastIndexed: null,
							status: "error",
						},
						progress: { total: 0, completed: 0, status: "error" },
					})
				}
				break

			case "clearIndex":
				try {
					// 清除索引
					await manager.clearIndex()

					// 获取最新状态
					const stats = await manager.getIndexStatus()
					const progress = manager.getIndexProgress()

					// 发送更新的状态和进度
					webview.postMessage({
						type: "codebaseIndexStats",
						stats,
						progress: {
							...progress,
							status: "idle", // 确保状态为idle
							completed: 0,
							total: 0,
						},
					})

					// 添加索引状态变更监听器
					const disposable = manager.onIndexStatusChange((status) => {
						// 向 WebView 发送进度更新
						webview.postMessage({
							type: "codebaseIndexStats",
							stats: status.stats,
							progress: status.progress,
						})

						// 如果索引已完成或出错，移除监听器
						if (status.progress.status === "completed" || status.progress.status === "error") {
							disposable.dispose()
						}
					})
				} catch (error) {
					console.error("清除索引失败:", error)
					// 向 WebView 发送错误响应
					webview.postMessage({
						type: "codebaseIndexStats",
						error: String(error),
						stats: {
							filesCount: 0,
							symbolsCount: 0,
							keywordsCount: 0,
							lastIndexed: null,
							status: "error",
						},
						progress: { total: 0, completed: 0, status: "error" },
					})
				}
				break

			case "updateSettings":
				// 获取索引选项
				if (message.settings) {
					// 处理索引设置更新
					const indexOptions: IndexOptions = {}

					if (message.settings.excludePaths !== undefined) {
						const excludePaths = message.settings.excludePaths
							.split(",")
							.map((folder: string) => folder.trim())
							.filter(Boolean)
						indexOptions.excludePaths = excludePaths

						// 保存到配置
						await vscode.workspace
							.getConfiguration("codebaseSearch")
							.update("excludePaths", message.settings.excludePaths, vscode.ConfigurationTarget.Global)
					}

					if (message.settings.includeTests !== undefined) {
						indexOptions.includeTests = message.settings.includeTests

						// 保存到配置
						await vscode.workspace
							.getConfiguration("codebaseSearch")
							.update("includeTests", message.settings.includeTests, vscode.ConfigurationTarget.Global)
					}

					if (message.settings.autoIndexOnStartup !== undefined) {
						// 保存到全局设置
						await vscode.workspace
							.getConfiguration("codebaseSearch")
							.update(
								"autoIndexOnStartup",
								message.settings.autoIndexOnStartup,
								vscode.ConfigurationTarget.Global,
							)
					}

					if (message.settings.enabled !== undefined) {
						// 保存到全局设置
						await vscode.workspace
							.getConfiguration("codebaseSearch")
							.update("enabled", message.settings.enabled, vscode.ConfigurationTarget.Global)
					}

					// 应用索引设置
					if (Object.keys(indexOptions).length > 0) {
						await manager.refreshIndex(indexOptions)
					}

					// 发送更新的设置到所有webview
					webview.postMessage({
						type: "extensionState",
						state: {
							codebaseIndexEnabled: message.settings.enabled,
							codebaseIndexAutoStart: message.settings.autoIndexOnStartup,
							codebaseIndexExcludePaths: message.settings.excludePaths,
							codebaseIndexIncludeTests: message.settings.includeTests,
						},
					})
				}
				break

			default:
			// 未知的代码库搜索操作
		}
	} catch (error) {
		console.error("处理代码库搜索消息失败:", error)

		// 发送错误消息回webview
		webview.postMessage({
			type: "codebaseIndexStats",
			error: error.message,
			stats: {
				filesCount: 0,
				symbolsCount: 0,
				keywordsCount: 0,
				lastIndexed: null,
				status: "error",
			},
			progress: { total: 0, completed: 0, status: "error" },
		})
	}
}

/**
 * 符号引用查找处理函数
 * 用于查找代码中符号的引用位置
 */
export async function handleFindReferences(params: any): Promise<any> {
	try {
		// 参数解析
		const { filePath, line, column, symbolName, includeSelf, maxResults, includeImports, maxDepth } = params

		if (!filePath) {
			throw new Error("必须提供文件路径")
		}

		if (line === undefined || column === undefined) {
			throw new Error("必须提供符号位置（行号和列号）")
		}

		// 获取服务实例
		const manager = CodebaseSearchManager.getInstance()

		// 通过vscode API获取当前工作区路径
		const workspacePath = getWorkspacePath()

		// 使用ReferencesFinder服务
		const { codebaseTSService, referencesFinder } = getReferenceServices()

		// 查找引用
		const options = {
			includeSelf: includeSelf !== false,
			maxResults: maxResults || 100,
			includeImports: includeImports !== false,
			maxDepth: maxDepth || 1,
		}

		// 执行查找
		const references = await referencesFinder.findReferences(symbolName, filePath, { line, column }, options)

		// 格式化结果
		return formatReferenceResults(references, workspacePath)
	} catch (error) {
		console.error("查找引用失败:", error)
		return {
			error: `查找引用失败: ${error.message}`,
			references: [],
		}
	}
}

/**
 * 获取当前工作区路径
 */
function getWorkspacePath(): string {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		throw new Error("没有打开的工作区")
	}
	return toPosixPath(workspaceFolders[0].uri.fsPath)
}

/**
 * 获取引用查找服务实例
 * 懒加载方式，避免不必要的资源消耗
 */
let referenceServices: { codebaseTSService: any; referencesFinder: any } | null = null

function getReferenceServices() {
	if (!referenceServices) {
		// 动态引入服务，避免循环依赖
		const { CodebaseTreeSitterService } = require("./tree-sitter-service")
		const { ReferencesFinder } = require("./references-finder")

		// 创建服务实例
		const codebaseTSService = new CodebaseTreeSitterService()

		// 异步初始化（但不阻塞当前流程）
		codebaseTSService.initialize().catch((err: Error) => {
			console.error("初始化 CodebaseTreeSitterService 失败:", err)
		})

		const referencesFinder = new ReferencesFinder(codebaseTSService)

		// 缓存服务实例
		referenceServices = { codebaseTSService, referencesFinder }

		// 设置定期清理缓存
		const HOUR_IN_MS = 60 * 60 * 1000
		setInterval(() => {
			referencesFinder.cleanExpiredCache()
		}, HOUR_IN_MS)
	}

	return referenceServices
}

/**
 * 格式化引用查找结果
 */
function formatReferenceResults(references: any[], workspacePath: string): any {
	// 如果没有结果
	if (!references || references.length === 0) {
		return {
			count: 0,
			references: [],
		}
	}

	// 格式化结果
	const formattedReferences = references.map((ref) => {
		return {
			file: toRelativePath(workspacePath, ref.file),
			line: ref.line,
			column: ref.column,
			content: ref.content || "",
			isDefinition: ref.isDefinition || false,
		}
	})

	return {
		count: formattedReferences.length,
		references: formattedReferences,
	}
}

// 导出类型
export * from "./types"

// 导出服务
export { CodebaseIndexService } from "./index-service"
export { CodebaseSearchService } from "./search-service"
export { SemanticAnalysisService } from "./semantic-analysis"
