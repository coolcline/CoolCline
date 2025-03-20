import { toPosixPath } from "../../../utils/path"
import * as vscode from "vscode"
import { CodebaseSearchManager, initializeCodebaseSearch, handleCodebaseSearchTool } from "../index"
import { CodebaseSearchOptions, ResultType } from "../types"
import { createSearchService } from "../search-service"
import { setExtensionContext } from "../extension-context"

// Mock vscode workspace
jest.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: toPosixPath("/test/workspace") }, name: "test" }],
	},
}))

// 模拟VS Code的API
jest.mock("vscode", () => {
	return {
		window: {
			showInformationMessage: jest.fn(),
			showErrorMessage: jest.fn(),
			withProgress: jest.fn((options, callback) => {
				// 简单执行回调函数，不实际显示进度条
				return callback({
					report: jest.fn(),
				})
			}),
		},
		ProgressLocation: {
			Notification: 1,
		},
		workspace: {
			workspaceFolders: [
				{
					uri: { fsPath: "/test/workspace" },
					name: "test",
					index: 0,
				},
			],
		},
		l10n: {
			t: (key: string) => key,
		},
		Uri: {
			file: (path: string) => ({ fsPath: path }),
		},
	}
})

// 设置模拟的扩展上下文
const mockContext = {
	globalStorageUri: { fsPath: "/test/storage" },
	workspaceState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	globalState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	subscriptions: [],
	extensionPath: "/test/extension",
	extensionUri: { fsPath: "/test/extension" },
	environmentVariableCollection: {},
	extensionMode: 1,
	logUri: { fsPath: "/test/logs" },
	logPath: "/test/logs",
	storageUri: { fsPath: "/test/storage" },
	storagePath: "/test/storage",
	asAbsolutePath: (path: string) => `/test/extension/${path}`,
}

// 模拟search-service
jest.mock("../search-service", () => {
	return {
		createSearchService: jest.fn().mockImplementation(() => {
			return {
				search: jest.fn().mockResolvedValue([
					{
						file: "/test/file1.ts",
						line: 10,
						snippet: "function test() { return true; }",
						score: 0.95,
					},
					{
						file: "/test/file2.ts",
						line: 20,
						snippet: "const x = 10;",
						score: 0.85,
					},
				]),
			}
		}),
	}
})

describe("CodebaseSearchManager", () => {
	let manager: CodebaseSearchManager

	beforeEach(() => {
		manager = CodebaseSearchManager.getInstance()
	})

	describe("getInstance", () => {
		it("should return the same instance", () => {
			const instance1 = CodebaseSearchManager.getInstance()
			const instance2 = CodebaseSearchManager.getInstance()
			expect(instance1).toBe(instance2)
		})
	})

	describe("initialize", () => {
		it("should initialize services for workspace", async () => {
			await manager.initialize(toPosixPath("/test/workspace"))
			expect(() => manager.getIndexService(toPosixPath("/test/workspace"))).not.toThrow()
			expect(() => manager.getSearchService(toPosixPath("/test/workspace"))).not.toThrow()
			expect(() => manager.getSemanticService(toPosixPath("/test/workspace"))).not.toThrow()
		})

		it("should throw error for invalid workspace", async () => {
			await expect(manager.initialize("")).rejects.toThrow()
		})
	})

	describe("search", () => {
		it("should perform search with default options", async () => {
			await manager.initialize(toPosixPath("/test/workspace"))
			const results = await manager.search("test query")
			expect(Array.isArray(results)).toBe(true)
		})

		it("should perform search with custom options", async () => {
			await manager.initialize(toPosixPath("/test/workspace"))
			const options: CodebaseSearchOptions = {
				maxResults: 5,
				resultType: [ResultType.Function],
				targetDirectories: ["src"],
			}
			const results = await manager.search("test query", options)
			expect(Array.isArray(results)).toBe(true)
		})
	})
})

describe("handleCodebaseSearchTool", () => {
	beforeAll(() => {
		// 设置模拟的扩展上下文
		setExtensionContext(mockContext as any)
	})

	it("should handle empty query", async () => {
		const result = await handleCodebaseSearchTool({ query: "" })
		expect(result).toHaveProperty("error")
	})

	it("should handle valid query", async () => {
		const result = await handleCodebaseSearchTool({ query: "test function" })
		expect(result.results).toHaveLength(2)
		expect(createSearchService).toHaveBeenCalled()
	})

	it("should format results correctly", async () => {
		const result = await handleCodebaseSearchTool({ query: "const" })
		expect(result.results[0]).toHaveProperty("file")
		expect(result.results[0]).toHaveProperty("line")
		expect(result.results[0]).toHaveProperty("context")
		expect(result.results[0]).toHaveProperty("relevance")
	})
})
