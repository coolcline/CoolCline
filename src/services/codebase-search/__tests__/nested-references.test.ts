/**
 * 嵌套结构引用查找测试
 * 测试Ruby、PHP、Java和Go的嵌套结构支持
 */
import { ReferencesFinder, Location } from "../references-finder"
import { CodebaseTreeSitterService } from "../tree-sitter-service"
import * as path from "../../../utils/path"
import { SymbolDefinition, SymbolReference } from "../types"

// 模拟Tree-sitter服务
jest.mock("../tree-sitter-service")

describe("嵌套结构引用查找测试", () => {
	let finder: ReferencesFinder
	let mockTreeService: jest.Mocked<CodebaseTreeSitterService>

	// 使用固定的模拟路径
	const rubyFilePath = "/mock/path/test.rb"
	const phpFilePath = "/mock/path/test.php"
	const javaFilePath = "/mock/path/test.java"
	const goFilePath = "/mock/path/test.go"

	beforeEach(() => {
		// 初始化依赖
		mockTreeService = new CodebaseTreeSitterService() as jest.Mocked<CodebaseTreeSitterService>
		mockTreeService.getLanguageIdForFile = jest.fn()
		finder = new ReferencesFinder(mockTreeService)
	})

	describe("Ruby嵌套类和模块支持", () => {
		it("应该能找到Ruby嵌套类中的方法引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const processDataDef: SymbolDefinition = {
				name: "process_data",
				type: "nested.method",
				parent: "DataProcessor",
				location: {
					file: rubyFilePath,
					line: 3,
					column: 4,
				},
				content: "def process_data",
			}

			const processDataRef: SymbolReference = {
				name: "process_data",
				parent: "DataProcessor",
				type: "reference.nested.method",
				location: {
					file: rubyFilePath,
					line: 10,
					column: 20,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [processDataDef],
				references: [processDataRef],
			})

			// 模拟语言检测为Ruby
			mockTreeService.getLanguageIdForFile.mockReturnValue("ruby")

			// 执行引用查找
			const refs = await finder.findReferences("process_data", rubyFilePath, { line: 3, column: 4 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(10)
			expect(refs[0].column).toBe(20)
		})

		it("应该能找到Ruby模块嵌套常量引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const maxSizeDef: SymbolDefinition = {
				name: "MAX_SIZE",
				type: "constant",
				parent: "Utilities",
				location: {
					file: rubyFilePath,
					line: 5,
					column: 2,
				},
				content: "MAX_SIZE = 100",
			}

			const maxSizeRef: SymbolReference = {
				name: "MAX_SIZE",
				namespace: "Utilities",
				type: "reference.nested.constant",
				location: {
					file: rubyFilePath,
					line: 15,
					column: 12,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [maxSizeDef],
				references: [maxSizeRef],
			})

			// 模拟语言检测为Ruby
			mockTreeService.getLanguageIdForFile.mockReturnValue("ruby")

			// 执行引用查找
			const refs = await finder.findReferences("MAX_SIZE", rubyFilePath, { line: 5, column: 2 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(15)
			expect(refs[0].column).toBe(12)
		})
	})

	describe("PHP命名空间和类嵌套支持", () => {
		it("应该能找到PHP命名空间中类的引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const userControllerDef: SymbolDefinition = {
				name: "UserController",
				type: "namespaced.class",
				namespace: "App\\Controllers",
				location: {
					file: phpFilePath,
					line: 5,
					column: 6,
				},
				content: "class UserController",
			}

			const userControllerRef: SymbolReference = {
				name: "UserController",
				namespace: "App\\Controllers",
				type: "qualified_name",
				location: {
					file: phpFilePath,
					line: 20,
					column: 10,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [userControllerDef],
				references: [userControllerRef],
			})

			// 模拟语言检测为PHP
			mockTreeService.getLanguageIdForFile.mockReturnValue("php")

			// 执行引用查找
			const refs = await finder.findReferences("UserController", phpFilePath, { line: 5, column: 6 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(20)
			expect(refs[0].column).toBe(10)
		})

		it("应该能找到PHP类中的方法引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const getDataDef: SymbolDefinition = {
				name: "getData",
				type: "nested.method",
				parent: "DataService",
				location: {
					file: phpFilePath,
					line: 8,
					column: 4,
				},
				content: "public function getData()",
			}

			const getDataRef: SymbolReference = {
				name: "getData",
				parent: "DataService",
				type: "reference.nested.method",
				location: {
					file: phpFilePath,
					line: 25,
					column: 15,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [getDataDef],
				references: [getDataRef],
			})

			// 模拟语言检测为PHP
			mockTreeService.getLanguageIdForFile.mockReturnValue("php")

			// 执行引用查找
			const refs = await finder.findReferences("getData", phpFilePath, { line: 8, column: 4 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(25)
			expect(refs[0].column).toBe(15)
		})
	})

	describe("Java嵌套类和接口支持", () => {
		it("应该能找到Java嵌套类中的方法引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const processDataDef: SymbolDefinition = {
				name: "processData",
				type: "nested.method",
				parent: "DataProcessor",
				location: {
					file: javaFilePath,
					line: 5,
					column: 4,
				},
				content: "public void processData()",
			}

			const processDataRef: SymbolReference = {
				name: "processData",
				parent: "DataProcessor",
				type: "reference.nested.method",
				location: {
					file: javaFilePath,
					line: 15,
					column: 20,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [processDataDef],
				references: [processDataRef],
			})

			// 模拟语言检测为Java
			mockTreeService.getLanguageIdForFile.mockReturnValue("java")

			// 执行引用查找
			const refs = await finder.findReferences("processData", javaFilePath, { line: 5, column: 4 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(15)
			expect(refs[0].column).toBe(20)
		})

		it("应该能找到Java静态内部类的引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const builderDef: SymbolDefinition = {
				name: "Builder",
				type: "nested.class",
				parent: "Person",
				location: {
					file: javaFilePath,
					line: 10,
					column: 2,
				},
				content: "public static class Builder",
			}

			const builderRef: SymbolReference = {
				name: "Builder",
				parent: "Person",
				type: "reference.nested.class",
				location: {
					file: javaFilePath,
					line: 30,
					column: 15,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [builderDef],
				references: [builderRef],
			})

			// 模拟语言检测为Java
			mockTreeService.getLanguageIdForFile.mockReturnValue("java")

			// 执行引用查找
			const refs = await finder.findReferences("Builder", javaFilePath, { line: 10, column: 2 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(30)
			expect(refs[0].column).toBe(15)
		})

		it("应该能找到Java包中的类引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const userServiceDef: SymbolDefinition = {
				name: "UserService",
				type: "class",
				namespace: "com.example.services",
				location: {
					file: javaFilePath,
					line: 3,
					column: 1,
				},
				content: "public class UserService",
			}

			const userServiceRef: SymbolReference = {
				name: "UserService",
				namespace: "com.example.services",
				type: "reference.class",
				location: {
					file: javaFilePath,
					line: 20,
					column: 10,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [userServiceDef],
				references: [userServiceRef],
			})

			// 模拟语言检测为Java
			mockTreeService.getLanguageIdForFile.mockReturnValue("java")

			// 执行引用查找
			const refs = await finder.findReferences("UserService", javaFilePath, { line: 3, column: 1 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(20)
			expect(refs[0].column).toBe(10)
		})
	})

	describe("Go结构体方法和嵌套支持", () => {
		it("应该能找到Go结构体方法的引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const processDataDef: SymbolDefinition = {
				name: "Process",
				type: "struct.method",
				parent: "DataHandler",
				location: {
					file: goFilePath,
					line: 8,
					column: 1,
				},
				content: "func (d *DataHandler) Process() error",
			}

			const processDataRef: SymbolReference = {
				name: "Process",
				parent: "DataHandler",
				type: "reference.struct.method",
				location: {
					file: goFilePath,
					line: 20,
					column: 15,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [processDataDef],
				references: [processDataRef],
			})

			// 模拟语言检测为Go
			mockTreeService.getLanguageIdForFile.mockReturnValue("go")

			// 执行引用查找
			const refs = await finder.findReferences("Process", goFilePath, { line: 8, column: 1 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(20)
			expect(refs[0].column).toBe(15)
		})

		it("应该能找到Go嵌入式结构体的字段引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const nameDef: SymbolDefinition = {
				name: "Name",
				type: "field",
				parent: "Person",
				location: {
					file: goFilePath,
					line: 5,
					column: 2,
				},
				content: "Name string",
			}

			const nameRef: SymbolReference = {
				name: "Name",
				parent: "Employee", // 在Employee结构体中引用了嵌入的Person结构体的Name字段
				type: "reference.embedded.field",
				location: {
					file: goFilePath,
					line: 25,
					column: 10,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [nameDef],
				references: [nameRef],
			})

			// 模拟语言检测为Go
			mockTreeService.getLanguageIdForFile.mockReturnValue("go")

			// 执行引用查找
			const refs = await finder.findReferences("Name", goFilePath, { line: 5, column: 2 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(25)
			expect(refs[0].column).toBe(10)
		})

		it("应该能找到Go接口实现的方法引用", async () => {
			// 模拟Tree-sitter服务返回的解析结果
			const stringerDef: SymbolDefinition = {
				name: "String",
				type: "interface.method",
				parent: "Stringer",
				location: {
					file: goFilePath,
					line: 12,
					column: 2,
				},
				content: "String() string",
			}

			const stringerRef: SymbolReference = {
				name: "String",
				parent: "User", // User类型实现了Stringer接口
				type: "reference.interface.method",
				location: {
					file: goFilePath,
					line: 30,
					column: 1,
				},
			}

			mockTreeService.parseFileWithReferences.mockResolvedValue({
				definitions: [stringerDef],
				references: [stringerRef],
			})

			// 模拟语言检测为Go
			mockTreeService.getLanguageIdForFile.mockReturnValue("go")

			// 执行引用查找
			const refs = await finder.findReferences("String", goFilePath, { line: 12, column: 2 })

			// 验证结果
			expect(refs).toHaveLength(1)
			expect(refs[0].line).toBe(30)
			expect(refs[0].column).toBe(1)
		})
	})
})
