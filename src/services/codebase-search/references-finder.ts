/**
 * 符号引用查找器
 * 用于在 codebase 代码库中查找符号的所有引用
 */
import * as vscode from "vscode"
import { LRUCache } from "./lru-cache"
import { SearchResult, ResultType } from "./types"
import {
	CodebaseTreeSitterService,
	SymbolReference,
	TypeScriptImportParser,
	PythonImportParser,
	CSharpImportParser,
	JavaImportParser,
	GoImportParser,
} from "./tree-sitter-service"
import { CodebaseSearchManager } from "./index"
import type { ImportParser } from "./tree-sitter-service"

/**
 * 位置信息
 */
export interface Location {
	file: string
	line: number
	column: number
	content?: string
}

/**
 * 符号信息
 */
export interface SymbolInfo {
	name: string
	namespace?: string
	parent?: string
	location: Location
	type?: string
}

/**
 * 引用查找选项
 */
export interface FindReferencesOptions {
	includeSelf?: boolean // 是否包含定义自身
	maxResults?: number // 最大结果数
	includeImports?: boolean // 是否包含导入文件中的引用
	maxDepth?: number // 导入搜索最大深度
}

/**
 * 引用查找器
 */
export class ReferencesFinder {
	// LRU缓存，限制大小，避免无限增长的内存占用
	private referenceCache: LRUCache<Location[]>
	// 缓存已解析过的文件，避免重复解析
	private fileParseCache: LRUCache<{
		definitions: any[]
		references: any[]
	}>
	// 语言特定的导入解析器
	private importParsers: Map<string, ImportParser> = new Map()
	// Tree-sitter服务引用
	private treeService: CodebaseTreeSitterService

	/**
	 * 构造函数
	 */
	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
		// 初始化缓存
		this.referenceCache = new LRUCache<Location[]>(200) // 缓存200个查询结果
		this.fileParseCache = new LRUCache<any>(50) // 缓存50个文件的解析结果
		// 注册语言特定的导入解析器
		this.registerImportParsers()
	}

	/**
	 * 注册各语言的导入解析器
	 */
	private registerImportParsers() {
		// 使用显式导入确保测试环境能正确解析类
		this.importParsers.set("typescript", new TypeScriptImportParser(this.treeService))
		this.importParsers.set("javascript", new TypeScriptImportParser(this.treeService))
		this.importParsers.set("python", new PythonImportParser(this.treeService))
		// 添加C#导入解析器
		this.importParsers.set("csharp", new CSharpImportParser(this.treeService))
		// 恢复Java和Go解析器注册
		this.importParsers.set("java", new JavaImportParser(this.treeService))
		this.importParsers.set("go", new GoImportParser(this.treeService))
		// 其他语言可以在这里添加...
	}

	/**
	 * 查找符号引用的主方法
	 */
	public async findReferences(
		symbolName: string,
		filePath: string,
		position: { line: number; column: number },
		options: FindReferencesOptions = {},
	): Promise<Location[]> {
		// 默认选项
		const defaultOptions: FindReferencesOptions = {
			includeSelf: false,
			maxResults: 100,
			includeImports: true,
			maxDepth: 1,
		}

		const mergedOptions = { ...defaultOptions, ...options }

		// 生成缓存键，加入选项以区分不同查询条件
		const cacheKey = `${filePath}:${position.line}:${position.column}:${symbolName}:${JSON.stringify(mergedOptions)}`

		// 检查缓存
		if (this.referenceCache.has(cacheKey)) {
			return this.referenceCache.get(cacheKey) || []
		}

		// 获取当前符号的完整定义信息
		const symbolInfo = await this.getSymbolAtPosition(filePath, position, symbolName)
		if (!symbolInfo) {
			return []
		}

		const references: Location[] = []

		// 1. 首先搜索当前文件内的引用
		const currentFileRefs = await this.findReferencesInFile(symbolInfo, filePath)

		// 如果不包含自身，则过滤掉定义自身
		const filteredRefs = mergedOptions.includeSelf
			? currentFileRefs
			: currentFileRefs.filter(
					(ref) =>
						!(
							ref.file === symbolInfo.location.file &&
							ref.line === symbolInfo.location.line &&
							ref.column === symbolInfo.location.column
						),
				)

		references.push(...filteredRefs)

		// 2. 搜索直接导入的文件中的引用（避免过度复杂的分析）
		if (mergedOptions.includeImports && mergedOptions.maxDepth && mergedOptions.maxDepth > 0) {
			await this.findReferencesInImportedFiles(symbolInfo, filePath, references, mergedOptions.maxDepth)
		}

		// 应用最大结果限制
		const limitedResults = mergedOptions.maxResults ? references.slice(0, mergedOptions.maxResults) : references

		// 缓存结果
		this.referenceCache.set(cacheKey, limitedResults)

		return limitedResults
	}

	/**
	 * 获取特定位置的符号信息
	 */
	private async getSymbolAtPosition(
		filePath: string,
		position: { line: number; column: number },
		symbolName: string,
	): Promise<SymbolInfo | null> {
		// 解析文件以获取符号
		const { definitions, references } = await this.parseFile(filePath)

		// 首先查找定义
		for (const def of definitions) {
			// 检查位置匹配
			if (
				def.location.line === position.line &&
				def.location.column <= position.column &&
				def.location.column + def.name.length >= position.column
			) {
				return {
					name: def.name,
					parent: def.parent,
					location: {
						file: filePath,
						line: def.location.line,
						column: def.location.column,
						content: def.content,
					},
					type: def.type,
				}
			}
		}

		// 如果没有找到定义，检查是否是引用
		for (const ref of references) {
			if (
				ref.location.line === position.line &&
				ref.location.column <= position.column &&
				ref.location.column + ref.name.length >= position.column
			) {
				return {
					name: ref.name,
					parent: ref.parent,
					namespace: ref.namespace,
					location: {
						file: filePath,
						line: ref.location.line,
						column: ref.location.column,
					},
				}
			}
		}

		// 如果没有找到对应位置的符号，但提供了符号名称，则创建一个基本信息
		if (symbolName) {
			return {
				name: symbolName,
				location: {
					file: filePath,
					line: position.line,
					column: position.column,
				},
			}
		}

		return null
	}

	/**
	 * 解析文件，带缓存
	 */
	private async parseFile(filePath: string): Promise<{
		definitions: any[]
		references: any[]
	}> {
		// 检查缓存
		const cachedResult = this.fileParseCache.get(filePath)
		if (cachedResult) {
			return cachedResult
		}

		// 解析文件
		const result = await this.treeService.parseFileWithReferences(filePath)

		// 简化结果，只保留必要信息
		const simplified = {
			definitions: result.definitions,
			references: result.references,
		}

		// 缓存结果
		this.fileParseCache.set(filePath, simplified)

		return simplified
	}

	/**
	 * 在单个文件中查找引用
	 */
	private async findReferencesInFile(symbolInfo: SymbolInfo, filePath: string): Promise<Location[]> {
		// 使用带缓存的文件解析
		const { references, definitions } = await this.parseFile(filePath)

		const result: Location[] = []

		// 添加定义位置（如果在当前文件中）
		const matchingDefs = definitions.filter(
			(def) => def.name === symbolInfo.name && (!symbolInfo.parent || def.parent === symbolInfo.parent),
		)

		for (const def of matchingDefs) {
			result.push({
				file: filePath,
				line: def.location.line,
				column: def.location.column,
				content: def.content,
			})
		}

		// 添加引用位置
		const matchingRefs = references.filter(
			(ref) => ref.name === symbolInfo.name && this.isReferenceToSymbol(ref, symbolInfo),
		)

		for (const ref of matchingRefs) {
			result.push({
				file: filePath,
				line: ref.location.line,
				column: ref.location.column,
			})
		}

		return result
	}

	/**
	 * 在导入的文件中查找引用
	 */
	private async findReferencesInImportedFiles(
		symbolInfo: SymbolInfo,
		sourceFile: string,
		results: Location[],
		maxDepth: number,
		visitedFiles: Set<string> = new Set(),
	): Promise<void> {
		// 防止重复处理同一文件
		if (visitedFiles.has(sourceFile)) {
			return
		}

		visitedFiles.add(sourceFile)

		// 如果达到最大深度，停止递归
		if (maxDepth <= 0) {
			return
		}

		// 获取文件的语言类型
		const languageId = this.getLanguageIdFromFile(sourceFile)
		const importParser = this.getImportParser(languageId)

		if (!importParser) {
			return
		}

		// 获取当前文件导入的所有文件
		const importedFiles = await importParser.getDirectImports(sourceFile)

		// 限制并行处理的文件数量，避免过多并发
		const MAX_CONCURRENT = 5

		// 分批处理导入文件
		for (let i = 0; i < importedFiles.length; i += MAX_CONCURRENT) {
			const batch = importedFiles.slice(i, i + MAX_CONCURRENT)
			await Promise.all(
				batch.map(async (file) => {
					try {
						// 在导入的文件中查找引用
						const refs = await this.findReferencesInFile(symbolInfo, file)
						results.push(...refs)

						// 递归处理导入文件的导入
						if (maxDepth > 1) {
							await this.findReferencesInImportedFiles(
								symbolInfo,
								file,
								results,
								maxDepth - 1,
								visitedFiles,
							)
						}
					} catch (error) {
						// 忽略单个文件的错误，继续处理其他文件
						console.error(`Error processing file ${file}:`, error)
					}
				}),
			)
		}
	}

	/**
	 * 获取语言特定的导入解析器
	 */
	private getImportParser(languageId: string): ImportParser | undefined {
		return this.importParsers.get(languageId) || this.importParsers.get("javascript")
	}

	/**
	 * 判断一个引用是否指向给定符号
	 */
	private isReferenceToSymbol(reference: SymbolReference, symbol: SymbolInfo): boolean {
		// 基本名称匹配
		if (reference.name !== symbol.name) {
			return false
		}

		// 排除自身定义
		if (reference.isDefinition) {
			return false
		}

		// 增强的命名空间检查
		if (symbol.namespace && reference.namespace) {
			// 完整匹配命名空间
			if (symbol.namespace !== reference.namespace) {
				// 检查是否为子命名空间
				if (!reference.namespace.startsWith(symbol.namespace + ".")) {
					return false
				}
			}
		}

		// 增强的类成员检查
		if (symbol.parent && reference.parent) {
			// 如果类名不同，则不匹配
			if (symbol.parent !== reference.parent) {
				// 还需考虑继承关系，但这需要更复杂的分析
				// 目前只做精确匹配
				return false
			}
		}

		// 特别处理方法调用引用
		if (symbol.type === "method" && reference.name.endsWith(".method")) {
			// 确保方法名匹配（去掉.method后缀）
			const methodName = reference.name.replace(/\.method$/, "")
			return methodName === symbol.name
		}

		return true
	}

	/**
	 * 从文件路径获取语言ID
	 */
	private getLanguageIdFromFile(filePath: string): string {
		const ext = filePath.split(".").pop()?.toLowerCase() || ""

		switch (ext) {
			case "ts":
			case "tsx":
				return "typescript"
			case "js":
			case "jsx":
				return "javascript"
			case "py":
				return "python"
			case "java":
				return "java"
			case "go":
				return "go"
			case "rb":
				return "ruby"
			case "php":
				return "php"
			default:
				return "javascript" // 默认使用 JavaScript
		}
	}

	/**
	 * 清除缓存
	 */
	public clearCache(): void {
		this.referenceCache.clear()
		this.fileParseCache.clear()
	}

	/**
	 * 清理过期缓存
	 * 可以定期调用以释放内存
	 */
	public cleanExpiredCache(): void {
		this.referenceCache.cleanExpired()
		this.fileParseCache.cleanExpired()
	}
}
