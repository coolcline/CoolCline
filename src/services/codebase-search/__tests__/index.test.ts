import { toPosixPath } from "../../../utils/path"
import * as vscode from "vscode"
import { CodebaseSearchManager, initializeCodebaseSearch, handleCodebaseSearchTool } from "../index"
import { CodebaseSearchOptions, ResultType } from "../types"

// Mock vscode workspace
jest.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: toPosixPath("/test/workspace") }, name: "test" }],
	},
}))

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
	beforeEach(async () => {
		await initializeCodebaseSearch()
	})

	it("should handle empty query", async () => {
		const result = await handleCodebaseSearchTool({})
		expect(result.error).toBeDefined()
	})

	it("should handle valid query", async () => {
		const result = await handleCodebaseSearchTool({
			query: "test query",
			target_directories: ["src"],
		})
		expect(result.found).toBeDefined()
		expect(Array.isArray(result.results)).toBe(true)
	})

	it("should format results correctly", async () => {
		const result = await handleCodebaseSearchTool({
			query: "test query",
		})
		if (result.found) {
			expect(result.results[0]).toHaveProperty("file")
			expect(result.results[0]).toHaveProperty("line")
			expect(result.results[0]).toHaveProperty("context")
		}
	})
})
