import { codebaseSearchTool, codebaseSearchToolGroup, registerCodebaseSearchTool } from "../tool-registration"

describe("Tool Registration", () => {
	describe("codebaseSearchTool", () => {
		it("should have correct structure", () => {
			expect(codebaseSearchTool).toHaveProperty("name", "codebase_search")
			expect(codebaseSearchTool).toHaveProperty("description")
			expect(codebaseSearchTool).toHaveProperty("parameters")
			expect(codebaseSearchTool).toHaveProperty("handler")
		})

		it("should have required parameters", () => {
			const { parameters } = codebaseSearchTool
			expect(parameters.properties).toHaveProperty("query")
			expect(parameters.properties).toHaveProperty("target_directories")
			expect(parameters.properties).toHaveProperty("explanation")
			expect(parameters.required).toContain("query")
		})
	})

	describe("codebaseSearchToolGroup", () => {
		it("should have correct structure", () => {
			expect(codebaseSearchToolGroup).toHaveProperty("id", "codebase_search")
			expect(codebaseSearchToolGroup).toHaveProperty("name", "codebase_search")
			expect(codebaseSearchToolGroup).toHaveProperty("description")
			expect(codebaseSearchToolGroup).toHaveProperty("emoji", "🔍")
			expect(codebaseSearchToolGroup).toHaveProperty("schema")
			expect(codebaseSearchToolGroup).toHaveProperty("component", "default")
		})

		it("should use same schema as tool", () => {
			expect(codebaseSearchToolGroup.schema).toBe(codebaseSearchTool.parameters)
		})
	})

	describe("registerCodebaseSearchTool", () => {
		it("should register tool correctly", () => {
			const mockRegister = jest.fn()
			registerCodebaseSearchTool(mockRegister)
			expect(mockRegister).toHaveBeenCalledWith(codebaseSearchTool)
		})
	})
})
