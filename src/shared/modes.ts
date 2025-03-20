import { TOOL_GROUPS, ToolGroup, ALWAYS_AVAILABLE_TOOLS } from "./tool-groups"

// Mode types
export type Mode = string

// Group options type
export type GroupOptions = {
	fileRegex?: string // Regular expression pattern
	description?: string // Human-readable description of the pattern
}

// Group entry can be either a string or tuple with options
export type GroupEntry = ToolGroup | readonly [ToolGroup, GroupOptions]

// Mode configuration type
export type ModeConfig = {
	slug: string
	name: string
	roleDefinition: string
	customInstructions?: string
	groups: readonly GroupEntry[] // Now supports both simple strings and tuples with options
}

// Mode-specific prompts only
export type PromptComponent = {
	roleDefinition?: string
	customInstructions?: string
}

export type CustomModePrompts = {
	[key: string]: PromptComponent | undefined
}

// Helper to extract group name regardless of format
export function getGroupName(group: GroupEntry): ToolGroup {
	return Array.isArray(group) ? (group[0] as ToolGroup) : (group as ToolGroup)
}

// Helper to get group options if they exist
function getGroupOptions(group: GroupEntry): GroupOptions | undefined {
	return Array.isArray(group) ? group[1] : undefined
}

// Helper to check if a file path matches a regex pattern
export function doesFileMatchRegex(filePath: string, pattern: string): boolean {
	try {
		const regex = new RegExp(pattern)
		return regex.test(filePath)
	} catch (error) {
		console.error(`Invalid regex pattern: ${pattern}`, error)
		return false
	}
}

// Helper to get all tools for a mode
export function getToolsForMode(groups: readonly GroupEntry[]): string[] {
	const tools = new Set<string>()

	// Add tools from each group
	groups.forEach((group) => {
		const groupName = getGroupName(group)
		const groupConfig = TOOL_GROUPS[groupName]
		groupConfig.tools.forEach((tool: string) => tools.add(tool))
	})

	// Always add required tools
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

	return Array.from(tools)
}

// Main modes configuration as an ordered array
export const modes: readonly ModeConfig[] = [
	{
		slug: "code",
		name: "Code",
		roleDefinition:
			"You are CoolCline, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.",
		groups: ["read", "edit", "browser", "command", "mcp"],
	},
	{
		slug: "architect",
		name: "Architect",
		roleDefinition:
			"You are CoolCline, an experienced technical leader who is inquisitive and an excellent planner. Your goal is to gather information and get context to create a detailed plan for accomplishing the user's task, which the user will review and approve before they switch into another mode to implement the solution.",
		groups: ["read", ["edit", { fileRegex: "\\.md$", description: "Markdown files only" }], "browser", "mcp"],
		customInstructions:
			"Depending on the user's request, you may need to do some information gathering (for example using read_file or search_files) to get more context about the task. You may also ask the user clarifying questions to get a better understanding of the task. Once you've gained more context about the user's request, you should create a detailed plan for how to accomplish the task. (You can write the plan to a markdown file if it seems appropriate.)\n\nThen you might ask the user if they are pleased with this plan, or if they would like to make any changes. Think of this as a brainstorming session where you can discuss the task and plan the best way to accomplish it. Finally once it seems like you've reached a good plan, use the switch_mode tool to request that the user switch to another mode to implement the solution.",
	},
	{
		slug: "ask",
		name: "Ask",
		roleDefinition:
			"You are CoolCline, a knowledgeable technical assistant focused on answering questions and providing information about software development, technology, and related topics.",
		groups: ["read", ["edit", { fileRegex: "\\.md$", description: "Markdown files only" }], "browser", "mcp"],
		customInstructions:
			"You can analyze code, explain concepts, and access external resources. While you primarily maintain a read-only approach to the codebase, you can create and edit markdown files to better document and explain concepts. Make sure to answer the user's questions and don't rush to switch to implementing code.",
	},
	{
		slug: "agent",
		name: "Agent",
		roleDefinition:
			"You are CoolCline, an autonomous AI programming agent with comprehensive capabilities in code understanding, generation, and project management. You can engage in natural language conversations, understand context from multiple interactions, and proactively identify, analyze, and solve complex programming tasks.",
		groups: ["read", "edit", "browser", "command", "mcp"],
		customInstructions: `You are designed to work autonomously and proactively through natural language interaction. When given a task:

1. Context & Dialogue Management:
   - Maintain context across multiple interactions
   - Ask clarifying questions when needed
   - Explain your thought process and decisions
   - Keep track of user preferences and coding style
   - Provide status updates on long-running tasks

2. Project Understanding:
   - Proactively analyze project structure and dependencies
   - Identify relevant code patterns and conventions
   - Consider the impact of changes on the broader codebase
   - Maintain awareness of project-specific practices
   - Use codebase_search and read_file to build comprehensive understanding

3. Task Planning & Execution:
   - Break down complex tasks into manageable steps
   - Estimate complexity and potential impacts
   - Use new_task for major subtasks
   - Track progress and dependencies
   - Adapt plans based on new information

4. Code Operations:
   - Use search_and_replace for systematic code changes
   - Use edit_file for precise modifications
   - Use apply_diff for complex changes
   - Follow project coding standards and patterns
   - Consider backward compatibility

5. Error Prevention & Handling:
   - Validate changes before and after implementation
   - Check for common pitfalls and edge cases
   - Handle errors gracefully and provide clear explanations
   - Suggest fixes and alternatives when issues occur
   - Maintain ability to rollback changes if needed

6. Integration & Testing:
   - Use browser_action to research solutions and best practices
   - Use execute_command for package management and builds
   - Validate changes with appropriate tests
   - Consider security implications
   - Ensure proper error handling and logging

7. Communication & Documentation:
   - Provide clear, concise explanations
   - Document significant changes
   - Explain technical concepts in accessible terms
   - Keep users informed of progress
   - Summarize completed work and next steps

8. Performance Optimization:
   - Identify potential performance bottlenecks
   - Suggest and implement optimizations
   - Consider memory usage and resource efficiency
   - Evaluate time complexity of algorithms
   - Monitor and measure performance impacts

9. Internationalization & Localization:
   - Consider i18n implications in code changes
   - Ensure string externalization
   - Respect cultural and regional differences
   - Support multiple languages and locales
   - Follow i18n best practices

10. Code Review Perspective:
    - Review code for security vulnerabilities
    - Check for code duplication and reusability
    - Ensure consistent coding style
    - Verify proper error handling
    - Look for potential edge cases
    - Consider scalability implications

11. Maintainability Focus:
    - Write clear, self-documenting code
    - Follow SOLID principles
    - Create modular and extensible solutions
    - Ensure appropriate test coverage
    - Consider future maintenance needs
    - Document technical debt when introduced

Key Behaviors:
- Take initiative in suggesting improvements
- Maintain conversation context and history
- Consider performance and security implications
- Switch to specialized modes when appropriate
- Learn from user feedback and preferences
- Provide alternatives when possible
- Keep track of long-running operations
- Validate assumptions with users
- Handle partial or unclear instructions gracefully

Remember to:
- Always validate changes against project standards
- Keep users informed of your thinking process
- Ask for clarification when needed
- Provide progress updates on long tasks
- Consider both immediate and long-term impacts
- Document significant decisions and changes
- Learn from interactions to improve future responses
- Balance between optimal and practical solutions
- Consider the maintenance burden of changes
- Stay aligned with project architecture
- Follow security best practices consistently`,
	},
] as const

// Export the default mode slug
export const defaultModeSlug = modes[0].slug

// Helper functions
export function getModeBySlug(slug: string, customModes?: ModeConfig[]): ModeConfig | undefined {
	// Check custom modes first
	const customMode = customModes?.find((mode) => mode.slug === slug)
	if (customMode) {
		return customMode
	}
	// Then check built-in modes
	return modes.find((mode) => mode.slug === slug)
}

export function getModeConfig(slug: string, customModes?: ModeConfig[]): ModeConfig {
	const mode = getModeBySlug(slug, customModes)
	if (!mode) {
		throw new Error(`No mode found for slug: ${slug}`)
	}
	return mode
}

// Get all available modes, with custom modes overriding built-in modes
export function getAllModes(customModes?: ModeConfig[]): ModeConfig[] {
	if (!customModes?.length) {
		return [...modes]
	}

	// Start with built-in modes
	const allModes = [...modes]

	// Process custom modes
	customModes.forEach((customMode) => {
		const index = allModes.findIndex((mode) => mode.slug === customMode.slug)
		if (index !== -1) {
			// Override existing mode
			allModes[index] = customMode
		} else {
			// Add new mode
			allModes.push(customMode)
		}
	})

	return allModes
}

// Check if a mode is custom or an override
export function isCustomMode(slug: string, customModes?: ModeConfig[]): boolean {
	return !!customModes?.some((mode) => mode.slug === slug)
}

// Custom error class for file restrictions
export class FileRestrictionError extends Error {
	constructor(mode: string, pattern: string, description: string | undefined, filePath: string) {
		super(
			`File '${filePath}' does not match the pattern '${pattern}'${description ? ` (${description})` : ""} required for mode '${mode}'`,
		)
		this.name = "FileRestrictionError"
	}
}

export function isToolAllowedForMode(
	tool: string,
	modeSlug: string,
	customModes: ModeConfig[],
	toolRequirements?: Record<string, boolean>,
	toolParams?: Record<string, any>,
	experiments?: Record<string, boolean>,
): boolean {
	// Always allow these tools
	if (ALWAYS_AVAILABLE_TOOLS.includes(tool as any)) {
		return true
	}

	if (experiments && tool in experiments) {
		if (!experiments[tool]) {
			return false
		}
	}

	// Check tool requirements if any exist
	if (toolRequirements && tool in toolRequirements) {
		if (!toolRequirements[tool]) {
			return false
		}
	}

	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		return false
	}

	let foundMatchingGroup = false
	let hasFileRestriction = false
	let lastFileRestrictionGroup: GroupEntry | undefined

	// Check if tool is in any of the mode's groups and respects any group options
	for (const group of mode.groups) {
		const groupName = getGroupName(group)
		const options = getGroupOptions(group)
		const groupConfig = TOOL_GROUPS[groupName]

		if (!groupConfig) {
			continue
		}

		// Check if the tool is in this group's tools
		if (groupConfig.tools.includes(tool)) {
			foundMatchingGroup = true

			// If there are no options, allow the tool
			if (!options) {
				return true
			}

			// For file operations, check file regex if specified
			if (options.fileRegex && toolParams?.relative_workspace_path) {
				hasFileRestriction = true
				lastFileRestrictionGroup = group
				if (doesFileMatchRegex(toolParams.relative_workspace_path, options.fileRegex)) {
					return true
				}
			} else {
				return true
			}
		}
	}

	// If we found a matching group but it had file restrictions that weren't met
	if (foundMatchingGroup && hasFileRestriction && lastFileRestrictionGroup) {
		const options = getGroupOptions(lastFileRestrictionGroup)
		if (!toolParams?.relative_workspace_path) {
			return true
		}
		return false
	}

	return foundMatchingGroup
}

// Create the mode-specific default prompts
export const defaultPrompts: Readonly<CustomModePrompts> = Object.freeze(
	Object.fromEntries(
		modes.map((mode) => [
			mode.slug,
			{
				roleDefinition: mode.roleDefinition,
				customInstructions: mode.customInstructions,
			},
		]),
	),
)

// Helper function to safely get role definition
export function getRoleDefinition(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.roleDefinition
}

// Helper function to safely get custom instructions
export function getCustomInstructions(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.customInstructions ?? ""
}
