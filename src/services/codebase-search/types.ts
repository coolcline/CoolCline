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
	File = "file",
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
	status: "idle" | "scanning" | "indexing" | "completed" | "error" | "stopped"
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
	excludeExtensions?: string[] // 排除的文件扩展名
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
	Imports = "imports", // 导入关系
	References = "references", // 引用关系
	DependsOn = "depends_on", // 依赖关系
	Contains = "contains", // 包含关系
}

/**
 * 符号关系接口
 */
export interface SymbolRelation {
	sourceId?: number // 源符号ID
	targetId?: number // 目标符号ID
	sourceSymbol?: string // 源符号名称
	targetSymbol?: string // 目标符号名称
	type?: RelationType // 关系类型
	relationType?: RelationType // 兼容旧版本
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

/**
 * Tree-sitter符号处理相关类型
 */

import Parser from "web-tree-sitter"

/**
 * 符号定义接口
 */
export interface SymbolDefinition {
	name: string
	type: string
	location: {
		file: string
		line: number
		column: number
	}
	parent?: string
	namespace?: string // 添加命名空间字段，用于支持PHP等语言
	content: string
	documentation?: string
}

/**
 * 符号引用接口
 */
export interface SymbolReference {
	name: string
	namespace?: string
	parent?: string
	isDefinition?: boolean
	type?: string // 添加类型字段，用于区分不同类型的引用（如nested.method, namespaced.class等）
	location: {
		file: string
		line: number
		column: number
	}
	parentContext?: string // 符号所在父级上下文（如嵌套类的外部类）
	content?: string // 添加内容字段，便于调试和显示
}

/**
 * 导入语句接口
 */
export interface ImportStatement {
	source: string
	names: string[]
	location: {
		file: string
		line: number
		column: number
	}
}

/**
 * 符号定义导入解析器接口
 */
export interface ImportParser {
	/**
	 * 获取文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 被导入文件的路径数组
	 */
	getDirectImports(filePath: string): Promise<string[]>
}

/**
 * 处理后的符号信息
 */
export interface ProcessedSymbols {
	definitions: SymbolDefinition[]
	references: SymbolReference[]
	imports: ImportStatement[]
	docComments: Map<string, string>
}

export interface SymbolInfo {
	/** 符号名称 */
	name: string
	/** 符号类型 */
	type: string
	/** 符号位置 */
	location: Location
	/** 符号所属父类（如方法所属的类） */
	parent?: string
	/** 符号所属命名空间 */
	namespace?: string
	/** 符号所在父级上下文（如嵌套类的外部类） */
	parentContext?: string
	/** 是否是定义本身 */
	isDefinition?: boolean
	/** 附加内容信息 */
	content?: string
}
