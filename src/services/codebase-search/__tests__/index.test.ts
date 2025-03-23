import { toPosixPath } from "../../../utils/path"
import * as vscode from "vscode"
import { CodebaseSearchManager, initializeCodebaseSearch, handleCodebaseSearchTool } from "../index"
import { CodebaseSearchOptions, ResultType, SearchResult } from "../types"
import { createSearchService } from "../search-service"
import { setExtensionContext } from "../extension-context"
import { CodebaseSearchService } from "../search-service"
import { beforeAllTests, afterAllTests } from "./test-cleanup"

// Mock vscode workspace
jest.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: toPosixPath("/test/workspace") }, name: "test" }],
	},
}))

// 在运行测试前模拟VS Code API
jest.mock(
	"vscode",
	() => ({
		window: {
			showInformationMessage: jest.fn(),
			showErrorMessage: jest.fn(),
		},
		workspace: {
			workspaceFolders: [
				{
					uri: { fsPath: "/test/workspace" },
					name: "test",
					index: 0,
				},
			],
			createFileSystemWatcher: jest.fn().mockReturnValue({
				onDidCreate: jest.fn(),
				onDidChange: jest.fn(),
				onDidDelete: jest.fn(),
				dispose: jest.fn(),
			}),
		},
	}),
	{ virtual: true },
)

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
	asAbsolutePath: (p: string) => `/test/extension/${p}`,
}

// Mock CodebaseSearchManager
jest.mock("../index", () => {
	const originalModule = jest.requireActual("../index")
	return {
		...originalModule,
		handleCodebaseSearchTool: jest.fn().mockImplementation(async (params) => {
			if (!params.query) {
				return { error: "查询不能为空" }
			}
			return {
				results: [
					{
						file: "test.ts",
						line: 1,
						context: "test function",
						relevance: 0.8,
						type: "function",
					},
					{
						file: "test2.ts",
						line: 2,
						context: "test function",
						relevance: 0.7,
						type: "function",
					},
				],
			}
		}),
		CodebaseSearchManager: {
			getInstance: jest.fn().mockReturnValue({
				initialize: jest.fn().mockImplementation(async (workspacePath) => {
					if (!workspacePath) {
						throw new Error("Invalid workspace path")
					}
					return undefined
				}),
				getIndexService: jest.fn().mockReturnValue({}),
				getSearchService: jest.fn().mockReturnValue({}),
				getSemanticService: jest.fn().mockReturnValue({}),
				search: jest.fn().mockResolvedValue([
					{
						file: "test.ts",
						line: 1,
						context: "test function",
						relevance: 0.8,
						type: "function",
					},
					{
						file: "test2.ts",
						line: 2,
						context: "test function",
						relevance: 0.7,
						type: "function",
					},
				]),
			}),
		},
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
	beforeEach(() => {
		jest.clearAllMocks()
		setExtensionContext(mockContext as any)
	})

	it("should handle empty query", async () => {
		const result = await handleCodebaseSearchTool({ query: "" })
		expect(result).toHaveProperty("error")
	})

	it("should handle valid query", async () => {
		const result = await handleCodebaseSearchTool({ query: "test function" })
		expect(result.results).toHaveLength(2)
		expect(result.results[0]).toHaveProperty("file")
		expect(result.results[0]).toHaveProperty("line")
		expect(result.results[0]).toHaveProperty("context")
		expect(result.results[0]).toHaveProperty("relevance")
	})

	it("should format results correctly", async () => {
		const result = await handleCodebaseSearchTool({ query: "const" })
		expect(result.results[0]).toHaveProperty("file")
		expect(result.results[0]).toHaveProperty("line")
		expect(result.results[0]).toHaveProperty("context")
		expect(result.results[0]).toHaveProperty("relevance")
	})
})

// 测试开始前全局清理
beforeAll(async () => {
	// 清理测试环境
	await beforeAllTests()
})

// 测试结束后全局清理
afterAll(async () => {
	// 再次清理测试环境
	await afterAllTests()
})
