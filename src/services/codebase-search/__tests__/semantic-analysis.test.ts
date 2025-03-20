import { SemanticAnalysisService } from "../semantic-analysis"
import { ResultType } from "../types"
import * as fs from "fs"
import { toPosixPath } from "../../../utils/path"

jest.mock("fs", () => ({
	existsSync: jest.fn(),
	promises: {
		readFile: jest.fn(),
	},
}))

describe("SemanticAnalysisService", () => {
	let semanticService: SemanticAnalysisService
	const testWorkspace = toPosixPath("/test/workspace")

	beforeEach(() => {
		semanticService = new SemanticAnalysisService(testWorkspace)
		;(fs.existsSync as jest.Mock).mockReturnValue(true)
		;(fs.promises.readFile as jest.Mock).mockResolvedValue(`
      function testFunction() {
        const testVar = 123;
        return testVar;
      }

      class TestClass extends BaseClass {
        constructor() {
          super();
        }
      }
    `)
	})

	describe("analyzeFile", () => {
		it("should analyze TypeScript file", async () => {
			const result = await semanticService.analyzeFile("test.ts")
			expect(result.symbols).toBeDefined()
			expect(result.relations).toBeDefined()
		})

		it("should handle non-existent file", async () => {
			;(fs.existsSync as jest.Mock).mockReturnValue(false)
			await expect(semanticService.analyzeFile("nonexistent.ts")).rejects.toThrow()
		})

		it("should extract symbols correctly", async () => {
			const result = await semanticService.analyzeFile("test.ts")
			const symbols = result.symbols

			expect(symbols.some((s) => s.name === "testFunction" && s.type === ResultType.Function)).toBe(true)
			expect(symbols.some((s) => s.name === "testVar" && s.type === ResultType.Variable)).toBe(true)
			expect(symbols.some((s) => s.name === "TestClass" && s.type === ResultType.Class)).toBe(true)
		})

		it("should detect relations between symbols", async () => {
			const result = await semanticService.analyzeFile("test.ts")
			const relations = result.relations

			expect(relations.length).toBeGreaterThan(0)
			expect(relations.some((r) => r.relationType === "extends")).toBe(true)
		})
	})

	describe("calculateSemanticRelevance", () => {
		it("should calculate high relevance for exact matches", () => {
			const query = "test function"
			const code = "function testFunction() { return true; }"
			const relevance = semanticService.calculateSemanticRelevance(query, code)
			expect(relevance).toBeGreaterThan(0.5)
		})

		it("should calculate low relevance for unrelated content", () => {
			const query = "database connection"
			const code = "function testFunction() { return true; }"
			const relevance = semanticService.calculateSemanticRelevance(query, code)
			expect(relevance).toBeLessThan(0.5)
		})

		it("should handle empty inputs", () => {
			expect(semanticService.calculateSemanticRelevance("", "")).toBe(0)
		})

		it("should give bonus for code structure keywords", () => {
			const query = "test"
			const code = "class TestClass { }"
			const relevance = semanticService.calculateSemanticRelevance(query, code)
			expect(relevance).toBeGreaterThan(0)
		})
	})

	describe("language detection", () => {
		it("should analyze TypeScript files correctly", async () => {
			const result = await semanticService.analyzeFile("test.ts")
			expect(result.symbols.length).toBeGreaterThan(0)
			expect(result.symbols[0].content).toContain("function")
		})

		it("should analyze JavaScript files correctly", async () => {
			const result = await semanticService.analyzeFile("test.js")
			expect(result.symbols.length).toBeGreaterThan(0)
			expect(result.symbols[0].content).toContain("function")
		})

		it("should analyze Python files correctly", async () => {
			;(fs.promises.readFile as jest.Mock).mockResolvedValue(`
        def test_function():
            test_var = 123
            return test_var
      `)
			const result = await semanticService.analyzeFile("test.py")
			expect(result.symbols.length).toBeGreaterThan(0)
			expect(result.symbols[0].content).toContain("def")
		})
	})
})
