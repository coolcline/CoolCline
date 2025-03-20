/**
 * 代码库搜索工具的类型定义
 */

/**
 * 搜索结果类型枚举
 */
export enum ResultType {
	Function = "function",
	Class = "class",
	Interface = "interface",
	Variable = "variable",
	Comment = "comment",
	Import = "import",
	Pattern = "pattern",
}

/**
 * 搜索选项接口
 */
export interface CodebaseSearchOptions {
	language?: string | string[] // 编程语言
	context?: number // 上下文行数
	maxResults?: number // 最大结果数
	includeTests?: boolean // 是否包含测试文件
	excludePatterns?: string[] // 排除的文件模式
	resultType?: ResultType[] // 需要的结果类型
	sortBy?: "relevance" | "path" | "modified" // 排序方式
	scope?: "workspace" | "open-files" | "current-file" // 搜索范围
	targetDirectories?: string[] // 目标目录
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
	file: string // 文件路径
	line: number // 行号
	column?: number // 列号
	context: string // 上下文
	relevance: number // 相关性分数
	type: ResultType // 结果类型
	symbol?: string // 符号名称
	signature?: string // 函数/方法签名
	language?: string // 编程语言
}

/**
 * 索引进度接口
 */
export interface IndexProgress {
	total: number // 总文件数
	completed: number // 已完成文件数
	status: "idle" | "scanning" | "indexing" | "completed" | "error"
}

/**
 * 索引统计接口
 */
export interface IndexStats {
	filesCount: number // 索引的文件数
	symbolsCount: number // 索引的符号数
	keywordsCount: number // 索引的关键词数
	lastIndexed: Date | null // 最后索引时间
	status: string // 当前状态
}

/**
 * 索引选项接口
 */
export interface IndexOptions {
	includePaths?: string[] // 包含的路径模式
	excludePaths?: string[] // 排除的路径模式
	languages?: string[] // 包含的语言
	includeTests?: boolean // 是否包含测试文件
}

/**
 * 索引任务接口
 */
export interface IndexTask {
	filePath: string // 文件路径
	priority: number // 优先级
}

/**
 * 代码符号接口
 */
export interface CodeSymbol {
	id?: number // ID（数据库中使用）
	name: string // 符号名称
	type: ResultType // 符号类型
	signature?: string // 函数/方法签名
	line: number // 行号
	column: number // 列号
	content: string // 符号内容
	parentId?: number // 父符号ID
}

/**
 * 符号关系类型
 */
export enum RelationType {
	Calls = "calls", // 调用关系
	Implements = "implements", // 实现接口
	Extends = "extends", // 继承关系
	Uses = "uses", // 使用关系
	Defines = "defines", // 定义关系
}

/**
 * 符号关系接口
 */
export interface SymbolRelation {
	sourceId: number // 源符号ID
	targetId: number // 目标符号ID
	relationType: RelationType // 关系类型
}

/**
 * 解析的查询接口
 */
export interface ParsedQuery {
	originalQuery: string // 原始查询
	intent: string // 查询意图
	symbols: string[] // 相关符号
	resultTypes: ResultType[] // 期望结果类型
	keywords: string[] // 关键词
}

/**
 * 文件解析结果接口
 */
export interface ParsedFile {
	symbols: CodeSymbol[] // 提取的符号
	relations: SymbolRelation[] // 符号间关系
}

/**
 * 工作区搜索结果接口
 */
export interface WorkspaceSearchResult {
	workspaceName: string
	workspacePath: string
	results: SearchResult[]
	error?: string
}
