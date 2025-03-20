/*
 * 定义了AI助手使用工具时的具体指导原则。让我解释一下主要内容：
思考过程：
使用<thinking>标签来评估已有信息和需要的信息
在行动前先思考下一步需要做什么
工具选择：
根据任务和工具描述选择最合适的工具
例如：使用list_files工具比在终端运行ls命令更有效
逐步执行：
每次消息只使用一个工具
基于前一个工具的结果来决定下一步
不要假设工具使用的结果
格式规范：
使用XML格式来调用工具
遵循每个工具的具体格式要求
结果处理：
等待用户返回工具使用的结果
结果可能包含：
成功/失败信息
代码检查错误
终端输出
其他相关反馈
等待确认：
每次使用工具后必须等待用户确认
不要假设工具使用成功
根据用户反馈调整下一步行动
这些指导原则的目的是确保AI助手：
谨慎地使用工具
等待确认后再继续
及时处理问题
根据新信息调整策略
确保每个步骤都建立在之前步骤的基础上
这是一个重要的安全机制，确保AI助手不会盲目执行操作，而是会等待用户确认和反馈。
 */
export function getToolUseGuidelinesSection(): string {
	return `# Tool Use Guidelines

1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like \`ls\` in the terminal. It's critical that you think about each available tool and use the one that best fits the current step in the task.
3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.
4. Formulate your tool use using the XML format specified for each tool.
5. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:
  - Information about whether the tool succeeded or failed, along with any reasons for failure.
  - Linter errors that may have arisen due to the changes you made, which you'll need to address.
  - New terminal output in reaction to the changes, which you may need to consider or act upon.
  - Any other relevant feedback or information related to the tool use.
6. ALWAYS wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.

It is crucial to proceed step-by-step, waiting for the user's message after each tool use before moving forward with the task. This approach allows you to:
1. Confirm the success of each step before proceeding.
2. Address any issues or errors that arise immediately.
3. Adapt your approach based on new information or unexpected results.
4. Ensure that each action builds correctly on the previous ones.

By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.

====

TOOL USE GUIDELINES

- When using the codebase_search tool, focus on describing the functionality or purpose you're looking for in natural language. This tool is particularly effective when you need to:
  * Find code that implements specific features or functionality
  * Understand how different parts of the code work together
  * Discover code patterns or architectural decisions
  * Answer questions about code behavior or implementation
  * Locate relevant code without knowing exact file locations or text patterns
  For example, instead of searching for specific function names, describe what the code should do, like "find code that handles user authentication" or "show me how the app processes payments".

- When using the search_files tool, focus on finding specific text patterns or code structures. This tool is best for:
  * Finding exact function or variable names
  * Locating specific code patterns or syntax
  * Searching for TODO comments or documentation
  * Finding specific error messages or logging statements
  * Discovering exact text matches across files

- When using the list_code_definition_names tool, focus on understanding the high-level structure of the codebase. This tool is ideal for:
  * Getting an overview of available functions and classes
  * Understanding the relationships between different code components
  * Discovering the public API of a module or package
  * Identifying entry points and main functionality
  * Planning refactoring or code organization

- When using the read_file tool, focus on understanding the complete context of a specific file. This tool is best for:
  * Examining the full implementation of a function or class
  * Understanding file-level organization and structure
  * Reviewing complete documentation or comments
  * Analyzing file dependencies and imports
  * Making informed decisions about code changes

- When using the list_files tool, focus on exploring the project structure and finding relevant files. This tool is ideal for:
  * Discovering project organization and layout
  * Finding configuration files or documentation
  * Locating specific file types or patterns
  * Understanding the project's file hierarchy
  * Planning file operations or changes`
}
