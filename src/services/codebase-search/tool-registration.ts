/**
 * 代码库搜索工具注册
 */
import { handleCodebaseSearchTool, handleFindReferences } from "./index"

/**
 * 代码库搜索工具定义
 */
export const codebaseSearchTool = {
	name: "codebase_search",
	description:
		"Find snippets of code from the codebase most relevant to the search query.\nThis is a semantic search tool, so the query should ask for something semantically matching what is needed.\nIf it makes sense to only search in particular directories, please specify them in the target_directories field.\nUnless there is a clear reason to use your own search query, please just reuse the user's exact query with their wording.\nTheir exact wording/phrasing can often be helpful for the semantic search query. Keeping the same exact question format can also be helpful.\nThis should be heavily preferred over using the grep search, file search, and list dir tools.",
	parameters: {
		properties: {
			query: {
				description:
					"The search query to find relevant code. You should reuse the user's exact query/most recent message with their wording unless there is a clear reason not to.",
				type: "string",
			},
			target_directories: {
				description: "Glob patterns for directories to search over",
				items: {
					type: "string",
				},
				type: "array",
			},
			explanation: {
				description:
					"One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
				type: "string",
			},
		},
		required: ["query"],
		type: "object",
	},
	handler: handleCodebaseSearchTool,
}

/**
 * 工具注册信息（用于集成到工具组系统）
 */
export const codebaseSearchToolGroup = {
	id: "codebase_search",
	name: "codebase_search",
	description: "Find snippets of code from the codebase most relevant to the search query",
	emoji: "🔍",
	schema: codebaseSearchTool.parameters,
	component: "default",
}

/**
 * 工具使用建议
 */
export const codebaseSearchUsageGuidance = `
# 代码库搜索工具 (codebase_search)

## 最佳使用场景
- 需要查找与某个功能相关的代码，但不确定确切文件位置
- 寻找特定类型的代码结构（函数、类、接口等）
- 需要理解代码的结构和语义
- 希望按相关性排序找到最匹配的结果

## 与其他工具的区别
- 文本搜索 (grep_search): 适用于精确的文本匹配和正则表达式搜索
- 文件搜索 (file_search): 适用于查找特定文件名
- 目录列表 (list_dir): 适用于浏览目录结构

## 使用示例
- "查找处理用户认证的相关代码"
- "找到实现用户验证的函数"
- "寻找数据库连接相关的类"

## 参数说明
- query: 搜索查询，尽量使用用户的原始描述
- target_directories: 可选，限定搜索特定目录
`

/**
 * 将代码库搜索工具注册到扩展
 * @param register 工具注册函数
 */
export function registerCodebaseSearchTool(register: (tool: any) => void): void {
	register(codebaseSearchTool)
}

/**
 * 引用查找工具定义 - 代码库搜索的组成部分
 */
export const findReferencesTool = {
	name: "find_references",
	description:
		"Find all references to a symbol in the codebase, including definitions and usages across files. This is a part of the codebase search functionality that focuses on precise symbol references.",
	parameters: {
		properties: {
			filePath: {
				description: "The path to the file containing the symbol",
				type: "string",
			},
			line: {
				description: "The line number where the symbol is located (1-indexed)",
				type: "number",
			},
			column: {
				description: "The column number where the symbol is located (0-indexed)",
				type: "number",
			},
			symbolName: {
				description:
					"Optional name of the symbol to find references for. If not provided, will be inferred from position.",
				type: "string",
			},
			includeSelf: {
				description: "Whether to include the definition itself in results",
				type: "boolean",
			},
			maxResults: {
				description: "Maximum number of results to return",
				type: "number",
			},
			includeImports: {
				description: "Whether to search in imported files",
				type: "boolean",
			},
			maxDepth: {
				description: "Maximum depth to search in imported files",
				type: "number",
			},
			explanation: {
				description:
					"One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
				type: "string",
			},
		},
		required: ["filePath", "line", "column"],
		type: "object",
	},
	handler: handleFindReferences,
}

/**
 * 引用查找工具组 - 代码库搜索的组成部分
 */
export const findReferencesToolGroup = {
	id: "find_references",
	name: "find_references",
	description: "Find all references to a symbol in the codebase (part of codebase search)",
	emoji: "🔎",
	schema: findReferencesTool.parameters,
	component: "default",
}

/**
 * 引用查找工具使用指南
 */
export const findReferencesUsageGuidance = `
# 符号引用查找工具 (find_references)

## 作为代码库搜索功能的一部分
此工具是代码库搜索功能集的组成部分，专注于精确符号引用查找。

## 最佳使用场景
- 需要找到某个函数、变量或类在整个代码库中的所有引用
- 需要了解一个符号的使用位置和上下文
- 查看继承类的方法覆写情况
- 寻找接口的所有实现

## 与其他工具的区别
- 代码库搜索 (codebase_search): 适用于一般性代码查找
- 文本搜索 (grep_search): 可能返回不相关的同名文本匹配
- 文件读取 (read_file): 只能查看单个文件内容

## 使用示例
- "查找登录函数的所有调用位置"
- "查看用户类的所有使用位置"
- "查找数据库连接初始化方法的所有引用"

## 参数说明
- filePath: 符号所在的文件路径
- line: 符号所在的行号（从1开始）
- column: 符号所在的列号（从0开始）
- symbolName: 可选，符号名称（如果不提供，将根据位置推断）
`

/**
 * 注册引用查找工具 - 代码库搜索的组成部分
 * @param register 工具注册函数
 */
export function registerFindReferencesTool(register: (tool: any) => void): void {
	register(findReferencesTool)
}
