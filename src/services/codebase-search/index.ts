/**
 * 代码库搜索工具入口
 */
import * as vscode from "vscode"
import { CodebaseIndexService, createIndexService } from "./index-service"
import { CodebaseSearchService, createSearchService } from "./search-service"
import { SemanticAnalysisService, createSemanticAnalysisService } from "./semantic-analysis"
import { CodebaseSearchOptions, IndexOptions, IndexProgress, IndexStats, SearchResult } from "./types"
import { toPosixPath, toRelativePath } from "../../utils/path"

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

	const manager = CodebaseSearchManager.getInstance()

	// 为每个工作区初始化服务
	for (const folder of workspaceFolders) {
		await manager.initialize(folder.uri.fsPath)
	}

	console.log("代码库搜索服务初始化完成")
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

// 导出类型
export * from "./types"

// 导出服务
export { CodebaseIndexService } from "./index-service"
export { CodebaseSearchService } from "./search-service"
export { SemanticAnalysisService } from "./semantic-analysis"
