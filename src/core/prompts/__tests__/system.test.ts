import { SYSTEM_PROMPT } from "../system"
import { McpHub } from "../../../services/mcp/McpHub"
import { McpServer } from "../../../shared/mcp"
import { CoolClineProvider } from "../../../core/webview/CoolClineProvider"
import { SearchReplaceDiffStrategy } from "../../../core/diff/strategies/search-replace"
import * as vscode from "vscode"
import fs from "fs/promises"
import os from "os"
import { defaultModeSlug, modes } from "../../../shared/modes"
// Import path utils to get access to toPosix string extension
import "../../../utils/path"
import { addCustomInstructions } from "../sections/custom-instructions"
import * as modesSection from "../sections/modes"
import { EXPERIMENT_IDS } from "../../../shared/experiments"
import { Mode, ModeConfig, PromptComponent, CustomModePrompts } from "../../../shared/modes"
import { DiffStrategy } from "../../../core/diff/types"

// Mock the sections
jest.mock("../sections/modes", () => ({
	getModesSection: jest.fn().mockImplementation(async () => `====\n\nMODES\n\n- Test modes section`),
}))

jest.mock("../sections/custom-instructions", () => ({
	addCustomInstructions: jest
		.fn()
		.mockImplementation(async (modeCustomInstructions, globalCustomInstructions, cwd, mode) => {
			const sections = []

			// Add global instructions first
			if (globalCustomInstructions?.trim()) {
				sections.push(`Global Instructions:\n${globalCustomInstructions.trim()}`)
			}

			// Add mode-specific instructions after
			if (modeCustomInstructions?.trim()) {
				sections.push(`Mode-specific Instructions:\n${modeCustomInstructions}`)
			}

			// Add rules
			const rules = []
			if (mode) {
				rules.push(`# Rules from .coolclinerules-${mode}:\nMock mode-specific rules`)
			}
			rules.push(`# Rules from .coolclinerules:\nMock generic rules`)

			if (rules.length > 0) {
				sections.push(`Rules:\n${rules.join("\n")}`)
			}

			const joinedSections = sections.join("\n\n")
			return joinedSections
				? `\n====\n\nUSER'S CUSTOM INSTRUCTIONS\n\nThe following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.\n\n${joinedSections}`
				: ""
		}),
}))

// Mock environment-specific values for consistent tests
jest.mock("os", () => ({
	...jest.requireActual("os"),
	homedir: () => "/home/user",
}))

jest.mock("default-shell", () => "/bin/zsh")

jest.mock("os-name", () => () => "Linux")

jest.mock("../../../utils/shell", () => ({
	getShell: () => "/bin/zsh",
	getSystemInfo: () => ({
		os: "Linux",
		shell: "/bin/zsh",
		homeDir: "/home/user",
	}),
}))

// Create a mock ExtensionContext
const mockContext = {
	extensionPath: "/mock/extension/path",
	globalStoragePath: "/mock/storage/path",
	storagePath: "/mock/storage/path",
	logPath: "/mock/log/path",
	subscriptions: [],
	workspaceState: {
		get: () => undefined,
		update: () => Promise.resolve(),
	},
	globalState: {
		get: () => undefined,
		update: () => Promise.resolve(),
		setKeysForSync: () => {},
	},
	extensionUri: { fsPath: "/mock/extension/path" },
	globalStorageUri: { fsPath: "/mock/settings/path" },
	asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
	extension: {
		packageJSON: {
			version: "1.0.0",
		},
	},
} as unknown as vscode.ExtensionContext

// Create a minimal mock of CoolClineProvider
const mockProvider = {
	ensureMcpServersDirectoryExists: async () => "/mock/mcp/path",
	ensureSettingsDirectoryExists: async () => "/mock/settings/path",
	postMessageToWebview: async () => {},
	context: mockContext,
} as unknown as CoolClineProvider

// Instead of extending McpHub, create a mock that implements just what we need
const createMockMcpHub = (): McpHub =>
	({
		getServers: () => [],
		getMcpServersPath: async () => "/mock/mcp/path",
		getMcpSettingsFilePath: async () => "/mock/settings/path",
		dispose: async () => {},
		// Add other required public methods with no-op implementations
		restartConnection: async () => {},
		readResource: async () => ({ contents: [] }),
		callTool: async () => ({ content: [] }),
		toggleServerDisabled: async () => {},
		toggleToolAlwaysAllow: async () => {},
		isConnecting: false,
		connections: [],
	}) as unknown as McpHub

describe("SYSTEM_PROMPT", () => {
	let mockMcpHub: McpHub
	let experiments: Record<string, boolean>

	beforeAll(() => {
		// Ensure fs mock is properly initialized
		const mockFs = jest.requireMock("fs/promises")
		mockFs._setInitialMockData()

		// Initialize all required directories
		const dirs = [
			"/mock",
			"/mock/extension",
			"/mock/extension/path",
			"/mock/storage",
			"/mock/storage/path",
			"/mock/settings",
			"/mock/settings/path",
			"/mock/mcp",
			"/mock/mcp/path",
		]
		dirs.forEach((dir) => mockFs._mockDirectories.add(dir))
		experiments = {
			[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: false,
			[EXPERIMENT_IDS.INSERT_BLOCK]: false,
		}
	})

	beforeEach(() => {
		jest.clearAllMocks()
	})

	afterEach(async () => {
		// Clean up any McpHub instances
		if (mockMcpHub) {
			await mockMcpHub.dispose()
		}
	})

	it("should maintain consistent system prompt", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("You are CoolCline")
		expect(prompt).toContain("CAPABILITIES")
		expect(prompt).toContain("RULES")
		expect(prompt).toContain("SYSTEM INFORMATION")
	})

	it("should include browser actions when supportsComputerUse is true", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: true,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: "1280x800",
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("browser_action")
		expect(prompt).toContain("Puppeteer-controlled browser")
	})

	it("should include MCP server info when mcpHub is provided", async () => {
		mockMcpHub = createMockMcpHub()

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: mockMcpHub,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("MCP SERVERS")
	})

	it("should explicitly handle undefined mcpHub", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).not.toContain("(No MCP servers currently connected)")
	})

	it("should handle different browser viewport sizes", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: true,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: "900x600",
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("browser_action")
		expect(prompt).toContain("Puppeteer-controlled browser")
	})

	it("should include diff strategy tool description when diffEnabled is true", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: new SearchReplaceDiffStrategy(),
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: true,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("apply_diff")
	})

	it("should exclude diff strategy tool description when diffEnabled is false", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: new SearchReplaceDiffStrategy(),
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: false,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).not.toContain("apply_diff")
	})

	it("should exclude diff strategy tool description when diffEnabled is undefined", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: new SearchReplaceDiffStrategy(),
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).not.toContain("apply_diff")
	})

	it("should include preferred language in system prompt", async () => {
		const prompt = await generatePromptWithLanguage("Spanish")

		expect(prompt).toContain("Language Preference:")
		expect(prompt).toContain("You MUST ALWAYS respond ONLY in the Spanish language")
	})

	it("should include custom mode role definition at top and instructions at bottom", async () => {
		const customModePrompts: CustomModePrompts = {
			[defaultModeSlug]: {
				roleDefinition: "You are a rockstar developer.\nAlways write clean code.\nRock on!",
				customInstructions: "Rock on!",
			},
		}
		const customModeConfigs: ModeConfig[] = [
			{
				slug: defaultModeSlug,
				name: "Default Mode",
				roleDefinition: "Default role definition",
				groups: [],
			},
		]

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts,
				customModeConfigs,
				globalCustomInstructions: "Global custom instructions",
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("You are a rockstar developer")
		expect(prompt).toContain("Always write clean code")
		expect(prompt).toContain("Rock on!")
		expect(prompt).toContain("Global custom instructions")
	})

	it("should use promptComponent roleDefinition when available", async () => {
		const customModePrompts = {
			[defaultModeSlug]: {
				roleDefinition: "Custom prompt role definition",
				customInstructions: "Custom prompt instructions",
			},
		}

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: customModePrompts,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		// Role definition from promptComponent should be at the top
		expect(prompt.indexOf("Custom prompt role definition")).toBeLessThan(prompt.indexOf("TOOL USE"))
		// Should not contain the default mode's role definition
		expect(prompt).not.toContain(modes[0].roleDefinition)
	})

	it("should fallback to modeConfig roleDefinition when promptComponent has no roleDefinition", async () => {
		const customModePrompts = {
			[defaultModeSlug]: {
				customInstructions: "Custom prompt instructions",
				// No roleDefinition provided
			},
		}

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: customModePrompts,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		// Should use the default mode's role definition
		expect(prompt.indexOf(modes[0].roleDefinition)).toBeLessThan(prompt.indexOf("TOOL USE"))
	})

	describe("experimental tools", () => {
		it("should disable experimental tools by default", async () => {
			const prompt = await SYSTEM_PROMPT(
				{
					context: mockContext,
					cwd: "/test/path",
					supportsComputerUse: false,
					mcpHub: undefined,
					diffStrategy: undefined,
					browserViewportSize: undefined,
					customModePrompts: undefined,
					customModeConfigs: undefined,
					globalCustomInstructions: undefined,
					preferredLanguage: undefined,
					diffEnabled: undefined,
					experiments,
					enableMcpServerCreation: true,
				},
				defaultModeSlug,
			)

			// Verify experimental tools are not included in the prompt
			expect(prompt).not.toContain(EXPERIMENT_IDS.SEARCH_AND_REPLACE)
			expect(prompt).not.toContain(EXPERIMENT_IDS.INSERT_BLOCK)
		})

		it("should enable experimental tools when explicitly enabled", async () => {
			const experiments = {
				[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: true,
				[EXPERIMENT_IDS.INSERT_BLOCK]: true,
			}

			const prompt = await SYSTEM_PROMPT(
				{
					context: mockContext,
					cwd: "/test/path",
					supportsComputerUse: false,
					mcpHub: undefined,
					diffStrategy: undefined,
					browserViewportSize: undefined,
					customModePrompts: undefined,
					customModeConfigs: undefined,
					globalCustomInstructions: undefined,
					preferredLanguage: undefined,
					diffEnabled: undefined,
					experiments,
					enableMcpServerCreation: true,
				},
				defaultModeSlug,
			)

			// Verify experimental tools are included in the prompt when enabled
			expect(prompt).toContain(EXPERIMENT_IDS.SEARCH_AND_REPLACE)
			expect(prompt).toContain(EXPERIMENT_IDS.INSERT_BLOCK)
		})

		it("should selectively enable experimental tools", async () => {
			const experiments = {
				[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: true,
				[EXPERIMENT_IDS.INSERT_BLOCK]: false,
			}

			const prompt = await SYSTEM_PROMPT(
				{
					context: mockContext,
					cwd: "/test/path",
					supportsComputerUse: false,
					mcpHub: undefined,
					diffStrategy: undefined,
					browserViewportSize: undefined,
					customModePrompts: undefined,
					customModeConfigs: undefined,
					globalCustomInstructions: undefined,
					preferredLanguage: undefined,
					diffEnabled: undefined,
					experiments,
					enableMcpServerCreation: true,
				},
				defaultModeSlug,
			)

			// Verify only enabled experimental tools are included
			expect(prompt).toContain(EXPERIMENT_IDS.SEARCH_AND_REPLACE)
			expect(prompt).not.toContain(EXPERIMENT_IDS.INSERT_BLOCK)
		})

		it("should list all available editing tools in base instruction", async () => {
			const experiments = {
				[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: true,
				[EXPERIMENT_IDS.INSERT_BLOCK]: true,
			}

			const prompt = await SYSTEM_PROMPT(
				{
					context: mockContext,
					cwd: "/test/path",
					supportsComputerUse: false,
					mcpHub: undefined,
					diffStrategy: new SearchReplaceDiffStrategy(),
					browserViewportSize: undefined,
					customModePrompts: undefined,
					customModeConfigs: undefined,
					globalCustomInstructions: undefined,
					preferredLanguage: undefined,
					diffEnabled: true,
					experiments,
					enableMcpServerCreation: true,
				},
				defaultModeSlug,
			)

			// Verify base instruction lists all available tools
			expect(prompt).toContain("apply_diff (for replacing lines in existing files)")
			expect(prompt).toContain("write_to_file (for creating new files or complete file rewrites)")
			expect(prompt).toContain("insert_content (for adding lines to existing files)")
			expect(prompt).toContain("search_and_replace (for finding and replacing individual pieces of text)")
		})

		it("should provide detailed instructions for each enabled tool", async () => {
			const experiments = {
				[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: true,
				[EXPERIMENT_IDS.INSERT_BLOCK]: true,
			}

			const prompt = await SYSTEM_PROMPT(
				{
					context: mockContext,
					cwd: "/test/path",
					supportsComputerUse: false,
					mcpHub: undefined,
					diffStrategy: new SearchReplaceDiffStrategy(),
					browserViewportSize: undefined,
					customModePrompts: undefined,
					customModeConfigs: undefined,
					globalCustomInstructions: undefined,
					preferredLanguage: undefined,
					diffEnabled: true,
					experiments,
					enableMcpServerCreation: true,
				},
				defaultModeSlug,
			)

			// Verify detailed instructions for each tool
			expect(prompt).toContain(
				"You should always prefer using other editing tools over write_to_file when making changes to existing files since write_to_file is much slower and cannot handle large files.",
			)
			expect(prompt).toContain("The insert_content tool adds lines of text to files")
			expect(prompt).toContain("The search_and_replace tool finds and replaces text or regex in files")
		})
	})

	afterAll(() => {
		jest.restoreAllMocks()
	})
})

describe("addCustomInstructions", () => {
	let experiments: Record<string, boolean>
	beforeAll(() => {
		// Ensure fs mock is properly initialized
		const mockFs = jest.requireMock("fs/promises")
		mockFs._setInitialMockData()
		mockFs.mkdir.mockImplementation(async (path: string) => {
			if (path.startsWith("/test")) {
				mockFs._mockDirectories.add(path)
				return Promise.resolve()
			}
			throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`)
		})

		experiments = {
			[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: false,
			[EXPERIMENT_IDS.INSERT_BLOCK]: false,
		}
	})

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("should generate correct prompt for architect mode", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			"architect",
		)

		expect(prompt).toContain("You are CoolCline")
		expect(prompt).toContain("CAPABILITIES")
		expect(prompt).toContain("RULES")
		expect(prompt).toContain("SYSTEM INFORMATION")
		expect(prompt).toContain("architect")
	})

	it("should generate correct prompt for ask mode", async () => {
		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: undefined,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			"ask",
		)

		expect(prompt).toContain("You are CoolCline")
		expect(prompt).toContain("CAPABILITIES")
		expect(prompt).toContain("RULES")
		expect(prompt).toContain("SYSTEM INFORMATION")
		expect(prompt).toContain("ask")
	})

	it("should include MCP server creation info when enabled", async () => {
		const mockMcpHub = createMockMcpHub()

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: mockMcpHub,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: true,
			},
			defaultModeSlug,
		)

		expect(prompt).toContain("Creating an MCP Server")
	})

	it("should exclude MCP server creation info when disabled", async () => {
		const mockMcpHub = createMockMcpHub()

		const prompt = await SYSTEM_PROMPT(
			{
				context: mockContext,
				cwd: "/test/path",
				supportsComputerUse: false,
				mcpHub: mockMcpHub,
				diffStrategy: undefined,
				browserViewportSize: undefined,
				customModePrompts: undefined,
				customModeConfigs: undefined,
				globalCustomInstructions: undefined,
				preferredLanguage: undefined,
				diffEnabled: undefined,
				experiments,
				enableMcpServerCreation: false,
			},
			defaultModeSlug,
		)

		expect(prompt).not.toContain("Creating an MCP Server")
	})

	it("should prioritize mode-specific rules for code mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toContain("Rules from .coolclinerules-code")
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should prioritize mode-specific rules for ask mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", modes[2].slug)
		expect(instructions).toContain("Rules from .coolclinerules-ask")
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should prioritize mode-specific rules for architect mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", modes[1].slug)
		expect(instructions).toContain("Rules from .coolclinerules-architect")
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should prioritize mode-specific rules for test engineer mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", "test")
		expect(instructions).toContain("Rules from .coolclinerules-test")
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should prioritize mode-specific rules for code reviewer mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", "review")
		expect(instructions).toContain("Rules from .coolclinerules-review")
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should fall back to generic rules when mode-specific rules not found", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toContain("Rules from .coolclinerules")
	})

	it("should include custom instructions when provided", async () => {
		const instructions = await addCustomInstructions("Custom test instructions", "", "/test/path", defaultModeSlug)
		expect(instructions).toContain("Mode-specific Instructions")
		expect(instructions).toContain("Custom test instructions")
	})

	it("should combine custom instructions without language preference", async () => {
		const instructions = await addCustomInstructions("Custom test instructions", "", "/test/path", defaultModeSlug)
		expect(instructions).toContain("Mode-specific Instructions")
		expect(instructions).toContain("Custom test instructions")
		expect(instructions).not.toContain("Language Preference")
	})

	afterAll(() => {
		jest.restoreAllMocks()
	})
})

// 添加一个测试生成器函数
async function generatePromptWithLanguage(language?: string) {
	const testExperiments = {
		[EXPERIMENT_IDS.SEARCH_AND_REPLACE]: false,
		[EXPERIMENT_IDS.INSERT_BLOCK]: false,
	}

	return SYSTEM_PROMPT(
		{
			context: mockContext,
			cwd: "/test/path",
			supportsComputerUse: false,
			mcpHub: undefined,
			diffStrategy: undefined,
			browserViewportSize: undefined,
			customModePrompts: undefined,
			customModeConfigs: undefined,
			globalCustomInstructions: undefined,
			preferredLanguage: language,
			diffEnabled: undefined,
			experiments: testExperiments,
			enableMcpServerCreation: true,
		},
		defaultModeSlug,
	)
}

it("should not include language preference section when no language is specified", async () => {
	const prompt = await generatePromptWithLanguage(undefined)

	expect(prompt).not.toContain("Language Preference:")
	expect(prompt).not.toContain("You should always speak and think in")
})
