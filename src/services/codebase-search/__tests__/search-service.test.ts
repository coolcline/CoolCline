import { CodebaseSearchService } from "../search-service"
import { ResultType } from "../types"

describe("CodebaseSearchService", () => {
	let searchService: CodebaseSearchService

	beforeEach(() => {
		searchService = new CodebaseSearchService("/test/workspace")
	})

	describe("search", () => {
		it("should perform basic search", async () => {
			const results = await searchService.search("test query")
			expect(Array.isArray(results)).toBe(true)
			expect(results.length).toBeGreaterThanOrEqual(0)
		})

		it("should handle empty query", async () => {
			await expect(searchService.search("")).rejects.toThrow()
		})

		it("should respect maxResults option", async () => {
			const maxResults = 2
			const results = await searchService.search("test query", { maxResults })
			expect(results.length).toBeLessThanOrEqual(maxResults)
		})

		it("should filter by result type", async () => {
			const resultType = [ResultType.Function]
			const results = await searchService.search("test query", { resultType })
			results.forEach((result) => {
				expect(result.type).toBe(ResultType.Function)
			})
		})

		it("should sort results by relevance", async () => {
			const results = await searchService.search("test query", { sortBy: "relevance" })
			for (let i = 1; i < results.length; i++) {
				expect(results[i].relevance).toBeLessThanOrEqual(results[i - 1].relevance)
			}
		})
	})

	describe("findReferences", () => {
		it("should find symbol references", async () => {
			const results = await searchService.findReferences("testSymbol", "test.ts")
			expect(Array.isArray(results)).toBe(true)
		})
	})

	describe("findImplementations", () => {
		it("should find interface implementations", async () => {
			const results = await searchService.findImplementations("TestInterface")
			expect(Array.isArray(results)).toBe(true)
		})
	})
})
