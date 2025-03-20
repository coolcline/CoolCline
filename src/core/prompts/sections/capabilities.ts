import { DiffStrategy } from "../../diff/DiffStrategy"
import { McpHub } from "../../../services/mcp/McpHub"

/*
capabilities.ts 这个文件的主要作用是生成AI系统提示词中的"能力部分"(CAPABILITIES)，
告诉AI助手它可以使用哪些工具和执行哪些操作。具体分析如下：
功能定义：文件导出一个getCapabilitiesSection函数，用于根据不同参数生成相应的能力描述文本。
参数依赖：
cwd：当前工作目录，用于告知AI文件系统的位置
supportsComputerUse：布尔值，决定AI是否可以使用浏览器功能
mcpHub（可选）：MCP服务器相关配置
diffStrategy（可选）：差异策略，影响文件修改方式
描述的能力：
执行CLI命令
列出文件
查看代码定义
正则表达式搜索
读写文件
提问后续问题
条件性能力（根据参数启用）：
使用浏览器（当supportsComputerUse为true时）
使用差异比较工具（当diffStrategy存在时）
MCP服务器功能（当mcpHub存在时）
工作流程指导：提示词详细描述了AI应如何使用这些工具来完成任务，包括：
先了解项目结构
使用定义查看工具理解代码
读取相关文件
分析并建议改进
应用更改
这个提示词模块是AI系统的重要组成部分，它定义了AI助手的操作边界和能力范围，
使AI能够清楚地了解自己可以执行哪些操作来协助用户完成任务。它通过动态生成的方式，根据系统配置灵活调整AI的能力范围。
*/
export function getCapabilitiesSection(
	cwd: string,
	supportsComputerUse: boolean,
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
): string {
	return `====

CAPABILITIES

- You have access to tools that let you execute CLI commands on the user's computer, list files, view source code definitions, regex search${
		supportsComputerUse ? ", use the browser" : ""
	}, read and write files, and ask follow-up questions. These tools help you effectively accomplish a wide range of tasks, such as writing code, making edits or improvements to existing files, understanding the current state of a project, performing system operations, and much more.
- When the user initially gives you a task, a recursive list of all filepaths in the current working directory ('${cwd}') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current working directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.
- You can use codebase_search to perform semantic searches across the codebase. This tool understands code meaning and context, making it ideal for finding code that implements specific functionality, understanding how different parts of the code work together, or discovering code patterns. Unlike regex-based search, it can understand natural language queries and return the most relevant code snippets. This should be your preferred tool when searching for code based on its functionality or purpose rather than specific text patterns.
- You can use search_files to perform regex searches across files in a specified directory, outputting context-rich results that include surrounding lines. This is particularly useful for understanding code patterns, finding specific implementations, or identifying areas that need refactoring.
- You can use the list_code_definition_names tool to get an overview of source code definitions for all files at the top level of a specified directory. This can be particularly useful when you need to understand the broader context and relationships between certain parts of the code. You may need to call this tool multiple times to understand various parts of the codebase related to the task.
    - For example, when asked to make edits or improvements you might analyze the file structure in the initial environment_details to get an overview of the project, then use list_code_definition_names to get further insight using source code definitions for files located in relevant directories, then read_file to examine the contents of relevant files, analyze the code and suggest improvements or make necessary edits, then use the write_to_file${diffStrategy ? " or apply_diff" : ""} tool to apply the changes. If you refactored code that could affect other parts of the codebase, you could use search_files to ensure you update other files as needed.
- You can use the execute_command tool to run commands on the user's computer whenever you feel it can help accomplish the user's task. When you need to execute a CLI command, you must provide a clear explanation of what the command does. Prefer to execute complex CLI commands over creating executable scripts, since they are more flexible and easier to run. Interactive and long-running commands are allowed, since the commands are run in the user's VSCode terminal. The user may keep commands running in the background and you will be kept updated on their status along the way. Each command you execute is run in a new terminal instance.${
		supportsComputerUse
			? "\n- You can use the browser_action tool to interact with websites (including html files and locally running development servers) through a Puppeteer-controlled browser when you feel it is necessary in accomplishing the user's task. This tool is particularly useful for web development tasks as it allows you to launch a browser, navigate to pages, interact with elements through clicks and keyboard input, and capture the results through screenshots and console logs. This tool may be useful at key stages of web development tasks-such as after implementing new features, making substantial changes, when troubleshooting issues, or to verify the result of your work. You can analyze the provided screenshots to ensure correct rendering or identify errors, and review console logs for runtime issues.\n  - For example, if asked to add a component to a react website, you might create the necessary files, use execute_command to run the site locally, then use browser_action to launch the browser, navigate to the local server, and verify the component renders & functions correctly before closing the browser."
			: ""
	}${
		mcpHub
			? `
- You have access to MCP servers that may provide additional tools and resources. Each server may provide different capabilities that you can use to accomplish tasks more effectively.
`
			: ""
	}`
}
