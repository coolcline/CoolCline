/**
 * 代码库搜索服务
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { CodebaseSearchOptions, ParsedQuery, ResultType, SearchResult } from "./types"
import { toPosixPath, arePathsEqual, join, isAbsolute } from "../../utils/path"
import { getDatabaseInstance, Database } from "./database"
import { createSemanticAnalysisService, SemanticAnalysisService } from "./semantic-analysis"

/**
 * 代码库搜索服务类
 */
export class CodebaseSearchService {
	private workspacePath: string
	private db: Database | null = null
	private semanticAnalyzer: SemanticAnalysisService | null = null

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 */
	constructor(workspacePath: string) {
		this.workspacePath = toPosixPath(workspacePath)
	}

	/**
	 * 搜索代码库
	 * @param query 搜索查询
	 * @param options 搜索选项
	 * @returns 搜索结果数组
	 */
	public async search(query: string, options?: CodebaseSearchOptions): Promise<SearchResult[]> {
		try {
			// 验证查询字符串
			if (!query || query.trim() === "") {
				throw new Error("搜索查询不能为空")
			}

			// 解析查询
			const parsedQuery = this.parseQuery(query)

			// 确定搜索范围
			const targetDirs = this.resolveTargetDirectories(options?.targetDirectories)

			// 执行搜索
			const results = await this.executeSearch(parsedQuery, options)

			// 排序结果
			return this.rankResults(results, parsedQuery, options?.sortBy)
		} catch (error) {
			console.error("搜索错误:", error)
			throw new Error(`搜索错误: ${error.message}`)
		}
	}

	/**
	 * 查找符号引用
	 * @param symbol 符号名称
	 * @param file 文件路径
	 * @returns 搜索结果数组
	 */
	public async findReferences(symbol: string, file: string): Promise<SearchResult[]> {
		// TODO: 实现查找引用功能
		return []
	}

	/**
	 * 查找接口实现
	 * @param interfaceName 接口名称
	 * @returns 搜索结果数组
	 */
	public async findImplementations(interfaceName: string): Promise<SearchResult[]> {
		// TODO: 实现查找实现功能
		return []
	}

	/**
	 * 解析查询字符串
	 * @param query 查询字符串
	 * @returns 解析后的查询对象
	 * @private
	 */
	private parseQuery(query: string): ParsedQuery {
		// 常见停用词
		const stopWords = [
			"the",
			"and",
			"a",
			"an",
			"of",
			"to",
			"in",
			"for",
			"with",
			"by",
			"at",
			"this",
			"that",
			"on",
			"are",
			"be",
			"is",
			"as",
			"or",
			"it",
			"can",
			"will",
			"would",
			"should",
			"could",
			"i",
			"me",
			"find",
			"search",
			"show",
			"get",
			"give",
			"where",
			"how",
			"what",
			"which",
			"when",
			"who",
		]

		// 编程概念词典 - 用于识别意图和结果类型
		const conceptMapping: Record<string, { type: ResultType; synonyms: string[] }> = {
			function: {
				type: ResultType.Function,
				synonyms: ["method", "procedure", "routine", "subroutine", "callable", "func"],
			},
			class: {
				type: ResultType.Class,
				synonyms: ["struct", "component", "module", "object", "blueprint", "type"],
			},
			interface: {
				type: ResultType.Interface,
				synonyms: ["protocol", "contract", "signature", "abstract"],
			},
			variable: {
				type: ResultType.Variable,
				synonyms: ["var", "field", "property", "attribute", "const", "let", "param", "parameter", "argument"],
			},
			import: {
				type: ResultType.Import,
				synonyms: ["require", "include", "use", "using", "imports", "dependency"],
			},
		}

		// 标准化查询字符串
		const normalizedQuery = query.toLowerCase().trim()

		// 分词
		const rawTokens = normalizedQuery.split(/\s+|[.,;:?!]/)

		// 移除停用词并去重
		const tokens = Array.from(new Set(rawTokens.filter((word) => word.length > 1 && !stopWords.includes(word))))

		// 意图识别
		let intent = "search"
		if (normalizedQuery.match(/implement|extends|inherit|derived|subclass/i)) {
			intent = "implementation"
		} else if (normalizedQuery.match(/call|invoke|use/i)) {
			intent = "reference"
		} else if (normalizedQuery.match(/define|declaration|create/i)) {
			intent = "declaration"
		}

		// 识别符号 - 检查引号内的内容作为精确符号匹配
		const symbols: string[] = []
		const symbolMatches = normalizedQuery.match(/'([^']+)'|"([^"]+)"|`([^`]+)`/g)
		if (symbolMatches) {
			symbolMatches.forEach((match) => {
				// 去除引号
				const symbol = match.replace(/^['"`]|['"`]$/g, "")
				symbols.push(symbol)
			})
		}

		// 识别结果类型
		const resultTypes: ResultType[] = []
		const allConceptTerms = Object.keys(conceptMapping).concat(
			...Object.values(conceptMapping).map((item) => item.synonyms),
		)

		// 检查每个词是否匹配概念词典
		for (const token of tokens) {
			// 检查完全匹配
			for (const [concept, data] of Object.entries(conceptMapping)) {
				if (token === concept || data.synonyms.includes(token)) {
					resultTypes.push(data.type)
					break
				}
			}

			// 检查包含匹配
			if (resultTypes.length === 0) {
				for (const [concept, data] of Object.entries(conceptMapping)) {
					// 例如，"functions"会匹配"function"
					if (token.includes(concept) || data.synonyms.some((syn) => token.includes(syn))) {
						resultTypes.push(data.type)
						break
					}
				}
			}
		}

		// 提取关键词 - 移除已识别为意图或类型的词
		const keywords = tokens.filter(
			(token) =>
				!allConceptTerms.includes(token) &&
				!["implementation", "reference", "declaration", "search"].includes(token),
		)

		// 处理同义词扩展（简单实现）
		const expandedKeywords = new Set<string>(keywords)

		// 常见编程同义词
		const synonymMap: Record<string, string[]> = {
			create: ["new", "init", "instantiate", "make"],
			delete: ["remove", "destroy", "erase"],
			update: ["modify", "change", "edit"],
			list: ["array", "collection", "iterable"],
			user: ["account", "profile"],
			authentication: ["auth", "login", "signin"],
			database: ["db", "storage", "persistence"],
			// 可以根据需要添加更多
		}

		// 添加同义词到扩展关键词中
		keywords.forEach((word) => {
			for (const [key, synonyms] of Object.entries(synonymMap)) {
				if (word === key || synonyms.includes(word)) {
					// 添加原词及其所有同义词
					expandedKeywords.add(key)
					synonyms.forEach((syn) => expandedKeywords.add(syn))
				}
			}
		})

		return {
			originalQuery: query,
			intent,
			symbols,
			resultTypes:
				resultTypes.length > 0 ? resultTypes : [ResultType.Function, ResultType.Class, ResultType.Variable],
			keywords: Array.from(expandedKeywords),
		}
	}

	/**
	 * 解析目标目录
	 * @param targetDirectories 目标目录数组
	 * @returns 解析后的完整路径数组
	 * @private
	 */
	private resolveTargetDirectories(targetDirectories?: string[]): string[] {
		if (!targetDirectories || targetDirectories.length === 0) {
			return [this.workspacePath]
		}

		return targetDirectories.map((dir) => {
			if (isAbsolute(dir)) {
				return toPosixPath(dir)
			}
			return toPosixPath(join(this.workspacePath, dir))
		})
	}

	/**
	 * 执行搜索
	 * @param parsedQuery 解析后的查询
	 * @param options 搜索选项
	 * @returns 搜索结果数组
	 * @private
	 */
	private async executeSearch(parsedQuery: ParsedQuery, options?: CodebaseSearchOptions): Promise<SearchResult[]> {
		// 确保依赖服务
		if (!this.db) {
			// console.log("search-service.ts 创建数据库连接")
			this.db = await getDatabaseInstance(this.workspacePath)
		}

		if (!this.semanticAnalyzer) {
			this.semanticAnalyzer = createSemanticAnalysisService(this.workspacePath)
		}

		// 构建SQL查询
		const { resultTypes, keywords } = parsedQuery
		const limit = options?.maxResults || 100

		// 检查结果类型过滤
		let typeCondition = ""
		const typeParams: string[] = []
		if (resultTypes && resultTypes.length > 0) {
			typeCondition = "AND s.type IN (" + resultTypes.map(() => "?").join(",") + ")"
			typeParams.push(...resultTypes)
		}

		// 检查语言过滤
		let languageCondition = ""
		const languageParams: string[] = []
		if (options?.language) {
			const languages = Array.isArray(options.language) ? options.language : [options.language]
			if (languages.length > 0) {
				languageCondition = "AND f.language IN (" + languages.map(() => "?").join(",") + ")"
				languageParams.push(...languages)
			}
		}

		// 构建关键词查询
		if (keywords && keywords.length > 0) {
			// 关键词搜索
			const sql = `
				SELECT s.id, s.name, s.type, s.signature, s.line, s.column, f.path as file, 
					   sc.content, MAX(k.relevance) as relevance, f.language
				FROM symbols s
				JOIN files f ON s.file_id = f.id
				JOIN symbol_contents sc ON s.id = sc.symbol_id
				JOIN keywords k ON s.id = k.symbol_id
				WHERE k.keyword IN (${keywords.map(() => "?").join(",")})
				${typeCondition}
				${languageCondition}
				GROUP BY s.id
				ORDER BY relevance DESC
				LIMIT ?
			`

			const params = [...keywords, ...typeParams, ...languageParams, limit]

			// 执行SQL查询
			const rows = await this.db.all(sql, params)

			// 转换结果
			return rows.map((row) => this.mapRowToSearchResult(row))
		} else {
			// 无关键词时的通用搜索
			const sql = `
				SELECT s.id, s.name, s.type, s.signature, s.line, s.column, f.path as file, 
					   sc.content, 0.5 as relevance, f.language
				FROM symbols s
				JOIN files f ON s.file_id = f.id
				JOIN symbol_contents sc ON s.id = sc.symbol_id
				WHERE 1=1
				${typeCondition}
				${languageCondition}
				ORDER BY s.name
				LIMIT ?
			`

			const params = [...typeParams, ...languageParams, limit]

			// 执行SQL查询
			const rows = await this.db.all(sql, params)

			// 转换结果
			return rows.map((row) => this.mapRowToSearchResult(row))
		}
	}

	/**
	 * 将数据库行映射为搜索结果
	 * @param row 数据库查询结果行
	 * @returns 搜索结果对象
	 * @private
	 */
	private mapRowToSearchResult(row: Record<string, any>): SearchResult {
		return {
			file: row.file,
			line: row.line,
			column: row.column,
			context: row.content,
			relevance: row.relevance,
			type: row.type as ResultType,
			symbol: row.name,
			signature: row.signature,
			language: row.language,
		}
	}

	/**
	 * 对结果进行排序
	 * @param results 搜索结果数组
	 * @param parsedQuery 解析后的查询
	 * @param sortBy 排序方式
	 * @returns 排序后的结果数组
	 * @private
	 */
	private rankResults(
		results: SearchResult[],
		parsedQuery: ParsedQuery,
		sortBy: "relevance" | "path" | "modified" = "relevance",
	): SearchResult[] {
		if (sortBy === "path") {
			// 按文件路径排序
			return [...results].sort((a, b) => a.file.localeCompare(b.file))
		}

		if (sortBy === "modified") {
			// 按修改时间排序，这里简化实现，未来可以从Git或文件系统获取实际修改时间
			return results
		}

		// 按相关性排序
		return [...results].sort((a, b) => {
			// 首先检查初始相关性分数
			const baseComparison = b.relevance - a.relevance
			if (Math.abs(baseComparison) > 0.1) {
				// 如果差距足够大，直接使用基础相关性
				return baseComparison
			}

			// 精确符号匹配加分
			const aSymbolMatch = parsedQuery.symbols.some(
				(symbol) =>
					a.symbol?.toLowerCase() === symbol.toLowerCase() ||
					a.context.toLowerCase().includes(symbol.toLowerCase()),
			)
			const bSymbolMatch = parsedQuery.symbols.some(
				(symbol) =>
					b.symbol?.toLowerCase() === symbol.toLowerCase() ||
					b.context.toLowerCase().includes(symbol.toLowerCase()),
			)

			if (aSymbolMatch && !bSymbolMatch) return -1
			if (!aSymbolMatch && bSymbolMatch) return 1

			// 结果类型匹配加分
			const aTypeMatch = parsedQuery.resultTypes.includes(a.type)
			const bTypeMatch = parsedQuery.resultTypes.includes(b.type)

			if (aTypeMatch && !bTypeMatch) return -1
			if (!aTypeMatch && bTypeMatch) return 1

			// 关键词匹配数量比较
			const aKeywordMatches = this.countKeywordMatches(parsedQuery.keywords, a)
			const bKeywordMatches = this.countKeywordMatches(parsedQuery.keywords, b)

			if (aKeywordMatches !== bKeywordMatches) {
				return bKeywordMatches - aKeywordMatches
			}

			// 文件路径优先级 - 核心代码目录优先
			const aCorePathScore = this.getPathPriorityScore(a.file)
			const bCorePathScore = this.getPathPriorityScore(b.file)

			if (aCorePathScore !== bCorePathScore) {
				return bCorePathScore - aCorePathScore
			}

			// 如果所有因素都相等，回退到使用原始相关性分数
			return baseComparison
		})
	}

	/**
	 * 计算关键词匹配数量
	 * @param keywords 关键词列表
	 * @param result 搜索结果
	 * @returns 匹配数量
	 * @private
	 */
	private countKeywordMatches(keywords: string[], result: SearchResult): number {
		let count = 0
		const content = (result.symbol || "") + " " + result.context.toLowerCase()

		for (const keyword of keywords) {
			if (content.includes(keyword.toLowerCase())) {
				count++
			}
		}

		return count
	}

	/**
	 * 获取文件路径优先级分数
	 * @param filePath 文件路径
	 * @returns 优先级分数
	 * @private
	 */
	private getPathPriorityScore(filePath: string): number {
		const normalizedPath = filePath.toLowerCase()

		// 核心代码目录优先
		const corePaths = ["/src/", "/app/", "/lib/", "/core/"]
		const testPaths = ["/test/", "/tests/", "/spec/", "/__tests__/"]

		// 核心路径得分最高
		for (const corePath of corePaths) {
			if (normalizedPath.includes(corePath)) {
				return 3
			}
		}

		// 测试路径得分较低
		for (const testPath of testPaths) {
			if (normalizedPath.includes(testPath)) {
				return 1
			}
		}

		// 其他路径得分中等
		return 2
	}
}

/**
 * 创建代码库搜索服务实例
 * @param workspacePath 工作区路径
 * @returns 搜索服务实例
 */
export function createSearchService(workspacePath: string): CodebaseSearchService {
	return new CodebaseSearchService(workspacePath)
}
