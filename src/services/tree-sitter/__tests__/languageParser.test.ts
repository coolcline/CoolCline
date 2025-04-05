import { loadRequiredLanguageParsers, _resetLanguageCache } from "../languageParser"
import Parser from "web-tree-sitter"
import * as path from "path"

// 为了更有效地测试缓存机制，我们需要直接操作模块内部缓存

// Mock 路径工具，确保文件路径的一致性
jest.mock("../../../utils/path", () => ({
	toPosixPath: (p: string) => p,
}))

// Mock 路径工具类，以控制__dirname的值
jest.mock("../../checkpoints/CheckpointUtils", () => ({
	PathUtils: {
		joinPath: (dir: string, filename: string) => path.join(dir, filename),
		extname: (file: string) => path.extname(file),
	},
}))

// Mock web-tree-sitter
const mockSetLanguage = jest.fn()
jest.mock("web-tree-sitter", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			setLanguage: mockSetLanguage,
		})),
		init: jest.fn().mockResolvedValue(undefined),
	}
})

// Add static methods to Parser mock
const ParserMock = Parser as jest.MockedClass<typeof Parser>
ParserMock.init = jest.fn().mockResolvedValue(undefined)
ParserMock.Language = {
	load: jest.fn().mockResolvedValue({
		query: jest.fn().mockReturnValue("mockQuery"),
	}),
	prototype: {}, // Add required prototype property
} as unknown as typeof Parser.Language

describe("Language Parser", () => {
	beforeEach(() => {
		jest.clearAllMocks()
		// 使用导出的函数重置缓存
		_resetLanguageCache()
	})

	describe("loadRequiredLanguageParsers", () => {
		it("should initialize parser only once", async () => {
			const files = ["test.js", "test2.js"]
			await loadRequiredLanguageParsers(files)
			await loadRequiredLanguageParsers(files)

			expect(ParserMock.init).toHaveBeenCalledTimes(1)
		})

		it("should load JavaScript parser for .js and .jsx files", async () => {
			const files = ["test.js", "test.jsx"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-javascript.wasm"),
			)
			expect(parsers.js).toBeDefined()
			expect(parsers.jsx).toBeDefined()
			expect(parsers.js.query).toBeDefined()
			expect(parsers.jsx.query).toBeDefined()
		})

		it("should load TypeScript parser for .ts and .tsx files", async () => {
			const files = ["test.ts", "test.tsx"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-typescript.wasm"),
			)
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-tsx.wasm"))
			expect(parsers.ts).toBeDefined()
			expect(parsers.tsx).toBeDefined()
		})

		it("should load Python parser for .py files", async () => {
			const files = ["test.py"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-python.wasm"))
			expect(parsers.py).toBeDefined()
		})

		it("should load multiple language parsers as needed", async () => {
			const files = ["test.js", "test.py", "test.rs", "test.go"]
			const parsers = await loadRequiredLanguageParsers(files)

			// 确保每种语言解析器都被加载
			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-javascript.wasm"),
			)
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-python.wasm"))
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-rust.wasm"))
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-go.wasm"))

			expect(parsers.js).toBeDefined()
			expect(parsers.py).toBeDefined()
			expect(parsers.rs).toBeDefined()
			expect(parsers.go).toBeDefined()
		})

		it("should handle C/C++ files correctly", async () => {
			const files = ["test.c", "test.h", "test.cpp", "test.hpp"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-c.wasm"))
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-cpp.wasm"))
			expect(parsers.c).toBeDefined()
			expect(parsers.h).toBeDefined()
			expect(parsers.cpp).toBeDefined()
			expect(parsers.hpp).toBeDefined()
		})

		it("should throw error for unsupported file extensions", async () => {
			const files = ["test.unsupported"]

			await expect(loadRequiredLanguageParsers(files)).rejects.toThrow("Unsupported language: unsupported")
		})

		it("should load each language only once for multiple files", async () => {
			const files = ["test1.js", "test2.js", "test3.js"]
			await loadRequiredLanguageParsers(files)

			// 检查是否加载了Javascript解析器
			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-javascript.wasm"),
			)
			// 对同一类型的多个文件，应该只调用一次加载
			expect(ParserMock.Language.load).toHaveBeenCalledTimes(1)
		})

		it("should set language for each parser instance", async () => {
			const files = ["test.js", "test.py"]
			await loadRequiredLanguageParsers(files)

			// 每种文件类型都需要一个parser实例
			expect(mockSetLanguage).toHaveBeenCalledTimes(2)
		})
	})
})
