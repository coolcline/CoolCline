import { ToolArgs } from "./types"

export function getCodebaseSearchDescription(args: ToolArgs): string {
	return `## codebase_search
Description: A semantic code search tool that understands code meaning and context. Use this tool when you need to:
- Find code that implements specific functionality (e.g., "find code that handles user login")
- Understand how different parts of the code work together
- Discover code patterns and implementations
- Answer questions about code implementation
- Find relevant code examples

This tool is different from other search tools:
- Unlike grep/search_files: It understands code semantics, not just text patterns
- Unlike list_code_definition_names: It finds relevant code snippets, not just names
- Unlike read_file: It finds specific relevant parts, not entire files
- Unlike list_files: It searches code content, not just file structure

Parameters:
- query: (required) A natural language query describing what you're looking for. Use the user's exact wording when possible.
- target_directories: (optional) The path of the directory to search in (relative to the current working directory ${args.cwd}). If not provided, it will search the entire workspace.

Usage:
<codebase_search>
<query>Your natural language query here</query>
<target_directories>src/</target_directories>
</codebase_search>

Example: Find authentication implementation
<codebase_search>
<query>How is user authentication implemented? Show me the login function</query>
</codebase_search>

Example: Find related code patterns
<codebase_search>
<query>Find examples of error handling in API calls</query>
<target_directories>src/api/</target_directories>
</codebase_search>`
}

/**
 * 获取引用查找工具描述 - 这是代码库搜索的一部分功能
 */
export function getFindReferencesDescription(args: ToolArgs): string {
	return `## find_references
Description: Find all references to a symbol in the codebase, including definitions and usages across files. This is part of the codebase search functionality that focuses on precise symbol references. Use this tool when you need to:
- Discover all places where a function, variable, or class is used
- Understand the context of how a symbol is used
- Find all implementations of an interface or method
- See where a class is extended or a method is overridden
- Track data flow through the application

Parameters:
- filePath: (required) The path of the file containing the symbol
- line: (required) The line number where the symbol is located (1-indexed)
- column: (required) The column number where the symbol is located (0-indexed)
- symbolName: (optional) Name of the symbol to find references for. If not provided, will be inferred from position.
- includeSelf: (optional) Whether to include the definition itself in results. Default is true.
- maxResults: (optional) Maximum number of results to return. Default is 100.
- includeImports: (optional) Whether to search in imported files. Default is true.
- maxDepth: (optional) Maximum depth to search in imported files. Default is 1.

Usage:
<find_references>
<filePath>src/components/User.tsx</filePath>
<line>25</line>
<column>15</column>
<symbolName>authenticateUser</symbolName>
</find_references>

Example: Find all places where a function is called
<find_references>
<filePath>src/services/auth.ts</filePath>
<line>42</line>
<column>9</column>
</find_references>

This tool is helpful for:
- Understanding how components or services interact
- Tracing the flow of data or functions
- Finding all usages before refactoring code
- Discovering where certain functionality is implemented`
}
