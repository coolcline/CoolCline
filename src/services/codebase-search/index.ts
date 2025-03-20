/**
 * 代码库搜索工具入口
 */
import * as vscode from "vscode"
import { CodebaseIndexService, createIndexService } from "./index-service"
import { CodebaseSearchService, createSearchService } from "./search-service"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"
import { CodebaseSearchOptions, IndexOptions, IndexProgress, IndexStats, SearchResult } from "./types"
import { toPosixPath, toRelativePath } from "../../utils/path"
import delay from "delay"
import i18next from "i18next"

/**
 * 代码库搜索管理器
 */
export class CodebaseSearchManager {
	private static instance: CodebaseSearchManager
	private indexServices: Map<string, CodebaseIndexService> = new Map()
	private searchServices: Map<string, CodebaseSearchService> = new Map()
	private semanticServices: Map<string, SemanticAnalysisService> = new Map()

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

			// 创建索引服务
			const indexService = createIndexService(workspacePath)
			this.indexServices.set(workspacePath, indexService)

			// 创建搜索服务
			const searchService = createSearchService(workspacePath)
			this.searchServices.set(workspacePath, searchService)

			// 创建语义分析服务
			const semanticService = createSemanticAnalysisService(workspacePath)
			this.semanticServices.set(workspacePath, semanticService)

			console.log(`代码库搜索服务已初始化，工作区: ${workspacePath}`)
		} catch (error) {
			console.error(`初始化代码库搜索服务失败:`, error)
			throw error
		}
	}

	/**
	 * 获取指定工作区的索引服务
	 * @param workspacePath 工作区路径
	 */
	public getIndexService(workspacePath: string): CodebaseIndexService {
		const indexService = this.indexServices.get(workspacePath)
		if (!indexService) {
			throw new Error(`索引服务未找到，工作区: ${workspacePath}`)
		}
		return indexService
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
			return await indexService.getIndexStats()
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
			return indexService.progress
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
			await indexService.startIndexing(options)
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
			await indexService.refreshIndex(options)
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
			await indexService.clearIndex()
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
}

/**
 * 为所有工作区初始化搜索服务
 */
export async function initializeCodebaseSearch(): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		console.log("没有打开的工作区，跳过初始化代码库搜索")
		return
	}

	console.log(`发现 ${workspaceFolders.length} 个工作区，开始初始化代码库搜索服务`)
	const manager = CodebaseSearchManager.getInstance()

	// 显示进度通知
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Codebase Index",
			cancellable: false,
		},
		async (progress) => {
			// 为每个工作区初始化服务
			for (const folder of workspaceFolders) {
				try {
					const workspacePath = folder.uri.fsPath
					console.log(`初始化工作区: ${workspacePath}`)

					progress.report({ message: "scanning" })
					// 添加短暂延迟，让用户能看到"scanning"状态
					await delay(500)

					await manager.initialize(workspacePath)

					progress.report({ message: "indexing" })
					// 添加短暂延迟，让用户能看到"indexing"状态
					await delay(500)

					await manager.startIndexing({
						includePaths: ["src", "lib", "app", "core"],
						excludePaths: ["node_modules", ".git", "dist", "build"],
					})

					console.log(`工作区初始化完成: ${workspacePath}`)
				} catch (error) {
					console.error(`初始化工作区失败:`, error)
					// 继续处理下一个工作区，不中断整个过程
				}
			}

			progress.report({ message: "Completed" })

			// 添加2秒延时，确保用户能看清进度条
			await delay(2000)
		},
	)

	console.log("代码库搜索服务初始化完成并开始索引")
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
		return formatSearchResults(results)
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
				// 刷新索引
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

				await manager.refreshIndex(refreshOptions)

				// 发送更新的状态和进度
				webview.postMessage({
					type: "codebaseIndexStats",
					stats: await manager.getIndexStatus(),
					progress: manager.getIndexProgress(),
				})
				break

			case "clearIndex":
				// 清除索引
				await manager.clearIndex()

				// 发送更新的状态和进度
				webview.postMessage({
					type: "codebaseIndexStats",
					stats: await manager.getIndexStatus(),
					progress: manager.getIndexProgress(),
				})
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
				console.log(`未知的代码库搜索操作: ${message.action}`)
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

// 导出类型
export * from "./types"

// 导出服务
export { CodebaseIndexService } from "./index-service"
export { CodebaseSearchService } from "./search-service"
export { SemanticAnalysisService } from "./semantic-analysis"
