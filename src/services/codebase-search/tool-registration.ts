/**
 * 代码库搜索工具注册
 */
import { handleCodebaseSearchTool } from "./index"

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
