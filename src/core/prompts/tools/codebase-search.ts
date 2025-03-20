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
