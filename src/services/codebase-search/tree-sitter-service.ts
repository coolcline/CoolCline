/**
 * 代码库专用的 Tree-sitter 服务
 * 扩展了基本的 Tree-sitter 功能，添加了对引用、导入等的支持
 */
import Parser from "web-tree-sitter"
import * as fs from "fs/promises"
import { PathUtils } from "../checkpoints/CheckpointUtils"
import { loadRequiredLanguageParsers, LanguageParser } from "../tree-sitter/languageParser"
import { CodeSymbol, SymbolRelation, RelationType, ResultType } from "./types"
import { parseSourceCodeForDefinitionsTopLevel } from "../tree-sitter/index"

// 创建一个简单的文档接口，类似于VSCode的TextDocument
interface TextDocument {
	uri: string
	languageId: string
	lineCount: number
}

/**
 * 符号定义接口
 */
export interface SymbolDefinition {
	name: string
	type: string
	location: {
		file: string
		line: number
		column: number
	}
	parent?: string
	content: string
	documentation?: string
}

/**
 * 符号引用接口
 */
export interface SymbolReference {
	name: string
	namespace?: string
	parent?: string
	isDefinition?: boolean
	location: {
		line: number
		column: number
	}
}

/**
 * 导入语句接口
 */
export interface ImportStatement {
	source: string
	names: string[]
	location: {
		file: string
		line: number
		column: number
	}
}

/**
 * 处理后的符号信息
 */
export interface ProcessedSymbols {
	definitions: SymbolDefinition[]
	references: SymbolReference[]
	imports: ImportStatement[]
	docComments: Map<string, string>
}

// 注释节点类型，用于关联文档注释
interface CommentNode {
	node: Parser.SyntaxNode
	distance: number
}

/**
 * 代码库树解析服务
 * 用于增强的代码分析，包括引用查找、文档提取等
 */
export class CodebaseTreeSitterService {
	private languageParsers: LanguageParser = {}
	private extendedQueries: Map<string, Parser.Query> = new Map()
	private initialized: boolean = false

	/**
	 * 构造函数
	 */
	constructor() {
		// 初始化操作
	}

	/**
	 * 初始化服务
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) return

		// 提前加载一些常用语言的解析器
		const dummyFiles = ["example.ts", "example.js", "example.py", "example.java", "example.cpp", "example.go"]

		this.languageParsers = await loadRequiredLanguageParsers(dummyFiles)
		this.initialized = true

		// 初始化扩展查询
		await this.initExtendedQueries()
	}

	/**
	 * 初始化扩展查询
	 * 为各语言加载包含引用、导入等的扩展查询
	 */
	private async initExtendedQueries(): Promise<void> {
		// 为已加载的语言解析器创建扩展查询
		for (const ext in this.languageParsers) {
			const { parser } = this.languageParsers[ext]
			const extendedQuery = await this.createExtendedQueryForLanguage(ext, parser.getLanguage())
			if (extendedQuery) {
				this.extendedQueries.set(ext, extendedQuery)
			}
		}
	}

	/**
	 * 为特定语言创建扩展查询
	 */
	private async createExtendedQueryForLanguage(ext: string, language: Parser.Language): Promise<Parser.Query | null> {
		let baseQuery = ""

		// 获取基础查询
		switch (ext) {
			case "ts":
			case "tsx":
				baseQuery = await this.getExtendedTypeScriptQuery()
				break
			case "js":
			case "jsx":
				baseQuery = await this.getExtendedJavaScriptQuery()
				break
			case "py":
				baseQuery = await this.getExtendedPythonQuery()
				break
			// 可以添加更多语言...
			default:
				return null
		}

		try {
			return language.query(baseQuery)
		} catch (error) {
			console.error(`Error creating extended query for ${ext}:`, error)
			return null
		}
	}

	/**
	 * 获取 TypeScript 扩展查询
	 */
	private async getExtendedTypeScriptQuery(): Promise<string> {
		// 基础 TypeScript 查询 + 引用和导入捕获
		return `
      ; 定义 (保持与现有查询兼容)
      (function_signature
        name: (identifier) @name.definition.function) @definition.function

      (method_signature
        name: (property_identifier) @name.definition.method) @definition.method

      (abstract_method_signature
        name: (property_identifier) @name.definition.method) @definition.method

      (abstract_class_declaration
        name: (type_identifier) @name.definition.class) @definition.class

      (module
        name: (identifier) @name.definition.module) @definition.module

      (function_declaration
        name: (identifier) @name.definition.function) @definition.function

      (method_definition
        name: (property_identifier) @name.definition.method) @definition.method

      (class_declaration
        name: (type_identifier) @name.definition.class) @definition.class
        
      ; 变量定义
      (variable_declarator
        name: (identifier) @name.definition.variable) @definition.variable
        
      ; 接口定义
      (interface_declaration
        name: (type_identifier) @name.definition.interface) @definition.interface
        
      ; 类型定义
      (type_alias_declaration
        name: (type_identifier) @name.definition.type) @definition.type

      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (property_identifier) @name.reference.property
      
      ; 类型引用
      (type_identifier) @name.reference.type
      
      ; 导入语句
      (import_statement
        source: (string) @import.source) @import
      
      ; 导入声明
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.name
            alias: (identifier)? @import.alias))) @import.clause
            
      ; 文档注释
      (comment) @doc.comment
    `
	}

	/**
	 * 获取 JavaScript 扩展查询
	 */
	private async getExtendedJavaScriptQuery(): Promise<string> {
		// 类似 TypeScript 但适用于 JavaScript 的查询
		return `
      ; 定义
      (function_declaration
        name: (identifier) @name.definition.function) @definition.function
        
      (method_definition
        name: (property_identifier) @name.definition.method) @definition.method
        
      (class_declaration
        name: (identifier) @name.definition.class) @definition.class
        
      (variable_declarator
        name: (identifier) @name.definition.variable) @definition.variable
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (property_identifier) @name.reference.property
      
      ; 导入语句
      (import_statement
        source: (string) @import.source) @import
      
      ; 导入声明
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.name
            alias: (identifier)? @import.alias))) @import.clause
            
      ; 文档注释
      (comment) @doc.comment
    `
	}

	/**
	 * 获取 Python 扩展查询
	 */
	private async getExtendedPythonQuery(): Promise<string> {
		return `
      ; 定义
      (function_definition
        name: (identifier) @name.definition.function) @definition.function
        
      (class_definition
        name: (identifier) @name.definition.class) @definition.class
        
      ; 变量定义
      (assignment
        left: (identifier) @name.definition.variable) @definition.variable
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (attribute
        attribute: (identifier) @name.reference.property) @reference.property
        
      ; 导入语句
      (import_statement
        name: (dotted_name) @import.module) @import
        
      (import_from_statement
        module_name: (dotted_name) @import.source
        name: (dotted_name) @import.name) @import.from
        
      ; 文档字符串
      (expression_statement
        (string) @doc.comment)
    `
	}

	/**
	 * 通过文件扩展名获取语言解析器
	 */
	private getLanguageParser(filePath: string): { parser: Parser; query: Parser.Query } | null {
		const ext = PathUtils.extname(filePath).toLowerCase().slice(1)

		if (!this.languageParsers[ext]) {
			return null
		}

		return {
			parser: this.languageParsers[ext].parser,
			query: this.extendedQueries.get(ext) || this.languageParsers[ext].query,
		}
	}

	/**
	 * 解析文件，提取定义、引用和导入
	 */
	public async parseFileWithReferences(filePath: string): Promise<{
		definitions: any[]
		references: SymbolReference[]
	}> {
		// 确保服务已初始化
		if (!this.initialized) {
			await this.initialize()
		}

		try {
			const content = await fs.readFile(filePath, "utf8")
			const languageParser = this.getLanguageParser(filePath)

			if (!languageParser) {
				return {
					definitions: [],
					references: [],
				}
			}

			const { parser, query } = languageParser

			// 解析文件内容
			const tree = parser.parse(content)

			// 使用查询捕获节点
			const captures = query.captures(tree.rootNode)

			// 处理查询结果
			const result = this.processQueryResults(captures, content, filePath)

			return {
				definitions: result.definitions,
				references: result.references,
			}
		} catch (error) {
			console.error(`Error parsing file ${filePath}:`, error)
			return {
				definitions: [],
				references: [],
			}
		}
	}

	/**
	 * 仅解析文件的顶层定义
	 * 用于大文件的轻量级索引
	 */
	public async parseFileTopLevelOnly(filePath: string): Promise<{
		definitions: any[]
	}> {
		// 确保服务已初始化
		if (!this.initialized) {
			await this.initialize()
		}

		const content = await fs.readFile(filePath, "utf8")
		const languageParser = this.getLanguageParser(filePath)

		if (!languageParser) {
			return {
				definitions: [],
			}
		}

		const { parser, query } = languageParser

		// 解析文件内容
		const tree = parser.parse(content)

		// 使用查询捕获节点
		const captures = query.captures(tree.rootNode)

		const result = this.processQueryResults(captures, content, filePath)

		// 过滤仅保留顶层定义和导入
		const topLevelDefinitions = result.definitions.filter((def) => {
			// 假设没有父级的是顶层定义
			return !def.parent
		})

		return {
			definitions: topLevelDefinitions,
		}
	}

	/**
	 * 处理查询结果，提取定义、引用和文档注释
	 */
	private processQueryResults(captures: Parser.QueryCapture[], content: string, filePath: string): ProcessedSymbols {
		const lines = content.split("\n")
		const definitions: SymbolDefinition[] = []
		const references: SymbolReference[] = []
		const imports: ImportStatement[] = []
		const docComments = new Map<string, string>()

		// 1. 第一轮：收集文档注释和定义
		for (const capture of captures) {
			const { node, name } = capture

			// 处理文档注释
			if (name.includes("doc")) {
				const docText = this.getNodeText(node, content)
				docComments.set(this.getNodeId(node), this.formatDocComment(docText))
				continue
			}

			// 处理定义
			if (name.includes("definition")) {
				try {
					// 查找定义的名称节点
					const parentNode = node
					// @ts-ignore SyntaxNode has a childCount property, but TS doesn't know about it
					if (parentNode && parentNode.childCount > 0) {
						// 查找与capture name匹配的name节点
						const nameMatches = captures.filter(
							(c) => c.name.includes("name") && c.name.includes(name.split("definition")[1]),
						)
						const nameNode = nameMatches.find((m) => {
							// 安全检查，确保node.parent不为null
							const parentOfNode = m.node.parent
							return parentOfNode && parentNode.equals(parentOfNode)
						})?.node

						if (nameNode) {
							const definition = this.createDefinition(
								nameNode,
								parentNode,
								name,
								content,
								lines,
								filePath,
							)
							definitions.push(definition)
						}
					}
				} catch (error) {
					console.error("解析定义时出错:", error)
				}
			}
		}

		// 2. 第二轮：处理引用和导入，尝试关联到定义
		for (const capture of captures) {
			const { node, name } = capture

			// 处理引用
			if (name.includes("reference")) {
				try {
					const reference = this.createReference(node, name, content, filePath)

					// 尝试确定引用的命名空间和父级
					reference.namespace = this.determineNamespace(node, captures, content)
					reference.parent = this.determineParent(node, captures, content)

					// 排除已知的定义
					const isDef = definitions.some(
						(def) =>
							def.name === reference.name &&
							def.location.line === reference.location.line &&
							def.location.column === reference.location.column,
					)
					if (!isDef) {
						references.push(reference)
					}
				} catch (error) {
					console.error("解析引用时出错:", error)
				}
			}

			// 处理导入
			if (name.includes("import")) {
				if (name === "import.source") {
					try {
						const importStmt = this.createImportStatement(node, captures, content, filePath)
						if (importStmt) {
							imports.push(importStmt)
						}
					} catch (error) {
						console.error("解析导入时出错:", error)
					}
				}
			}
		}

		// 3. 建立定义和文档注释的关联
		for (const definition of definitions) {
			if (definition.documentation) continue // 已经有文档了

			// 查找可能的文档注释
			for (const [nodeId, docText] of docComments.entries()) {
				const [line, col] = nodeId.split(":").map(Number)
				// 如果文档注释在定义之前且距离不超过3行，则关联
				if (line < definition.location.line && definition.location.line - line <= 3) {
					definition.documentation = docText
					break
				}
			}
		}

		return { definitions, references, imports, docComments }
	}

	/**
	 * 确定节点所属的命名空间
	 * 例如：对于 a.b.c，确定命名空间为 a.b
	 */
	private determineNamespace(
		node: Parser.SyntaxNode,
		captures: Parser.QueryCapture[],
		content: string,
	): string | undefined {
		// 对于属性访问，尝试找到对象部分
		if (node.type === "property_identifier" || node.type === "identifier") {
			let current = node.parent

			// 处理TypeScript/JavaScript的情况
			if (current?.type === "member_expression") {
				// 递归查找完整路径，例如 a.b.c
				const parts: string[] = []
				let memberExp: Parser.SyntaxNode | null = current

				while (memberExp && memberExp.type === "member_expression") {
					// 获取对象部分 (a.b中的a)
					const objectNode = memberExp.childForFieldName("object")
					if (objectNode && objectNode.type === "identifier") {
						parts.unshift(this.getNodeText(objectNode, content))
					}
					// 安全地更新memberExp
					memberExp = memberExp.parent
				}

				if (parts.length > 0) {
					return parts.join(".")
				}
			}

			// 处理Python的情况
			if (current?.type === "attribute") {
				const valueNode = current.childForFieldName("value")
				if (valueNode) {
					return this.getNodeText(valueNode, content)
				}
			}
		}

		return undefined
	}

	/**
	 * 确定节点的父级（例如类名或模块名）
	 */
	private determineParent(
		node: Parser.SyntaxNode,
		captures: Parser.QueryCapture[],
		content: string,
	): string | undefined {
		// 向上查找父节点
		let current = node.parent
		while (current) {
			// 检查是否在类定义内
			if (current.type === "class_declaration" || current.type === "class_definition") {
				// 查找类名
				const classNameNode = current.childForFieldName("name")
				if (classNameNode) {
					return this.getNodeText(classNameNode, content)
				}
			}

			// 检查是否在方法定义内
			if (
				current.type === "method_definition" ||
				(current.type === "function_definition" && current.parent?.parent?.type === "class_definition")
			) {
				// 继续向上查找类
				let classNode = current.parent
				while (classNode && classNode.type !== "class_declaration" && classNode.type !== "class_definition") {
					classNode = classNode.parent
				}

				if (classNode) {
					const classNameNode = classNode.childForFieldName("name")
					if (classNameNode) {
						return this.getNodeText(classNameNode, content)
					}
				}
			}

			current = current.parent
		}

		return undefined
	}

	/**
	 * 创建符号定义对象
	 */
	private createDefinition(
		nameNode: Parser.SyntaxNode,
		definitionNode: Parser.SyntaxNode,
		captureName: string,
		content: string,
		lines: string[],
		filePath: string,
	): SymbolDefinition {
		// 提取符号类型
		let type = "unknown"
		if (captureName.includes("function")) {
			type = "function"
		} else if (captureName.includes("method")) {
			type = "method"
		} else if (captureName.includes("class")) {
			type = "class"
		} else if (captureName.includes("variable")) {
			type = "variable"
		} else if (captureName.includes("interface")) {
			type = "interface"
		} else if (captureName.includes("module")) {
			type = "module"
		} else if (captureName.includes("type")) {
			type = "type"
		}

		// 获取符号名称
		const name = this.getNodeText(nameNode, content)

		// 尝试获取父级符号名称
		const parent = this.getParentSymbol(definitionNode)

		// 获取符号所在行内容
		const lineContent = lines[nameNode.startPosition.row] || ""

		return {
			name,
			type,
			location: {
				file: filePath,
				line: nameNode.startPosition.row + 1, // 转为1-indexed
				column: nameNode.startPosition.column,
			},
			parent,
			content: lineContent,
		}
	}

	/**
	 * 创建符号引用对象
	 */
	private createReference(
		node: Parser.SyntaxNode,
		captureName: string,
		content: string,
		filePath: string,
	): SymbolReference {
		const name = this.getNodeText(node, content)

		// 确定引用类型和命名空间
		let namespace = undefined
		let parent = undefined

		// 尝试获取命名空间/父级信息
		if (captureName.includes("property")) {
			// 属性访问，如 obj.prop
			const objNode = node.parent?.childForFieldName("object")
			if (objNode) {
				parent = this.getNodeText(objNode, content)
			}
		}

		return {
			name,
			location: {
				line: node.startPosition.row + 1, // 转为1-indexed
				column: node.startPosition.column,
			},
			isDefinition: false,
			namespace,
			parent,
		}
	}

	/**
	 * 创建导入语句对象
	 */
	private createImportStatement(
		sourceNode: Parser.SyntaxNode,
		captures: Parser.QueryCapture[],
		content: string,
		filePath: string,
	): ImportStatement | null {
		const source = this.getNodeText(sourceNode, content)
		if (!source) return null

		// 清除引号
		const cleanedSource = source.replace(/['"`]/g, "")

		// 查找同一导入语句中的导入名称
		const importParent = sourceNode.parent
		const names: string[] = []

		if (importParent) {
			// 搜索所有与此导入相关的名称
			for (const capture of captures) {
				if (capture.name === "import.name") {
					// 检查是否是当前导入的一部分
					let current: Parser.SyntaxNode | null = capture.node.parent
					while (current) {
						if (current.id === importParent.id) {
							const name = this.getNodeText(capture.node, content)
							if (name) names.push(name)
							break
						}
						current = current.parent
					}
				}
			}
		}

		return {
			source: cleanedSource,
			names,
			location: {
				file: filePath,
				line: sourceNode.startPosition.row + 1,
				column: sourceNode.startPosition.column,
			},
		}
	}

	/**
	 * 获取节点文本内容
	 */
	private getNodeText(node: Parser.SyntaxNode, content: string): string {
		return content.substring(node.startIndex, node.endIndex)
	}

	/**
	 * 获取节点唯一标识符
	 */
	private getNodeId(node: Parser.SyntaxNode): string {
		return `${node.startIndex}-${node.endIndex}`
	}

	/**
	 * 获取父级符号名称
	 */
	private getParentSymbol(node: Parser.SyntaxNode): string | undefined {
		// 根据节点类型确定父级
		const parent = node.parent
		if (!parent) return undefined

		// 类方法的父级是类
		if (node.type === "method_definition" || node.type === "method_signature") {
			// 向上查找 class_declaration
			let current: Parser.SyntaxNode | null = parent
			while (current) {
				if (current.type === "class_declaration" || current.type === "class_body") {
					// 找到类后，查找其名称
					const classNameNode = current.childForFieldName("name")
					if (classNameNode) {
						return classNameNode.text
					}
				}
				const nextParent: Parser.SyntaxNode | null = current.parent
				current = nextParent
			}
		}

		return undefined
	}

	/**
	 * 将代码符号转换为数据库模型
	 */
	public symbolDefinitionToCodeSymbol(definition: SymbolDefinition): CodeSymbol {
		return {
			name: definition.name,
			type: this.mapDefinitionTypeToResultType(definition.type),
			line: definition.location.line,
			column: definition.location.column,
			content: definition.content,
			// 其他字段可以根据需要添加
		}
	}

	/**
	 * 将定义类型映射到结果类型
	 */
	private mapDefinitionTypeToResultType(definitionType: string): ResultType {
		switch (definitionType) {
			case "function":
				return ResultType.Function
			case "method":
				return ResultType.Function // 可以考虑添加特定的方法类型
			case "class":
				return ResultType.Class
			case "interface":
				return ResultType.Interface
			case "variable":
				return ResultType.Variable
			default:
				return ResultType.Pattern // 默认为模式类型
		}
	}

	/**
	 * 提取节点的文档注释
	 * @param node 语法节点
	 * @param document 文档对象
	 * @returns 格式化后的文档注释
	 */
	extractDocComment(node: any, document: any): string {
		// 基本实现，稍后需要完善
		// 在节点之前查找注释节点，提取并格式化注释内容

		return ""
	}

	/**
	 * 格式化文档注释
	 */
	private formatDocComment(comment: string): string {
		// 移除注释标记
		return comment
			.replace(/^\/\*\*|\*\/$/g, "") // 移除开头的 /** 和结尾的 */
			.replace(/^\s*\*\s?/gm, "") // 移除每行开头的 *
			.trim()
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			const fs = require("fs/promises")
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}

/**
 * 符号定义导入解析器接口
 */
export interface ImportParser {
	/**
	 * 获取文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 被导入文件的路径数组
	 */
	getDirectImports(filePath: string): Promise<string[]>
}

/**
 * TypeScript导入解析器
 */
export class TypeScriptImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取TypeScript/JavaScript文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 导入的文件路径数组
	 */
	async getDirectImports(filePath: string): Promise<string[]> {
		try {
			// 解析文件获取导入语句
			const { references } = await this.treeService.parseFileWithReferences(filePath)

			// 提取导入路径
			const imports: string[] = []
			const result = await this.treeService.parseFileWithReferences(filePath)

			// 目前我们不能直接获取导入语句，所以需要增强TreeSitterService
			// 这是一个临时实现，稍后需要改进
			const content = await this.readFileContent(filePath)
			const importStatements = this.extractImportPaths(content)

			// 解析所有导入路径
			const resolvedPaths: string[] = []
			for (const importPath of importStatements) {
				const resolvedPath = await this.resolveImportPath(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 简单正则匹配import语句
		// 注意: 这只是临时方案，最终应该使用Tree-sitter查询
		const importRegex = /import\s+(?:[\w\s{},*]*\s+from\s+)?['"]([^'"]+)['"]/g
		let match

		while ((match = importRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		// 也匹配require语句
		const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

		while ((match = requireRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		return importPaths
	}

	/**
	 * 解析导入路径为绝对文件路径
	 */
	private async resolveImportPath(importPath: string, sourceFile: string): Promise<string | null> {
		// 忽略非相对路径导入 (如 node_modules 包)
		if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
			return null
		}

		try {
			const fs = require("fs/promises")
			const path = require("path")

			const sourceDir = path.dirname(sourceFile)
			let resolvedPath = path.join(sourceDir, importPath)

			// 如果没有扩展名，尝试添加扩展名
			if (!path.extname(resolvedPath)) {
				// 尝试常见扩展名
				for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
					const withExt = `${resolvedPath}${ext}`
					try {
						const stats = await fs.stat(withExt)
						if (stats.isFile()) {
							return withExt
						}
					} catch (e) {
						// 文件不存在，继续尝试
					}
				}

				// 尝试 index 文件
				for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
					const indexFile = path.join(resolvedPath, `index${ext}`)
					try {
						const stats = await fs.stat(indexFile)
						if (stats.isFile()) {
							return indexFile
						}
					} catch (e) {
						// 文件不存在，继续尝试
					}
				}
			} else {
				// 已有扩展名，直接验证文件是否存在
				try {
					const stats = await fs.stat(resolvedPath)
					if (stats.isFile()) {
						return resolvedPath
					}
				} catch (e) {
					// 文件不存在
				}
			}
		} catch (error) {
			console.error(`Error resolving import path ${importPath} from ${sourceFile}:`, error)
		}

		return null
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			const fs = require("fs/promises")
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}

/**
 * Python导入解析器
 */
export class PythonImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Python文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 导入的文件路径数组
	 */
	async getDirectImports(filePath: string): Promise<string[]> {
		try {
			// 读取文件内容
			const content = await this.readFileContent(filePath)

			// 提取导入语句
			const importPaths = this.extractImportPaths(content)

			// 解析所有导入路径
			const resolvedPaths: string[] = []
			for (const importPath of importPaths) {
				const resolvedPath = await this.resolvePythonImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Python imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Python文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 匹配import语句: import foo, import foo.bar
		const importRegex = /import\s+([\w.]+)(?:\s*,\s*([\w.]+))*/g
		let match

		let contentLines = content.split("\n")
		for (let i = 0; i < contentLines.length; i++) {
			const line = contentLines[i].trim()
			// 忽略注释行
			if (line.startsWith("#")) continue

			// 匹配import语句
			while ((match = importRegex.exec(line)) !== null) {
				if (match[1]) {
					importPaths.push(match[1])
				}
				// 处理多个导入: import foo, bar
				if (match[2]) {
					importPaths.push(match[2])
				}
			}

			// 匹配from语句: from foo import bar
			const fromRegex = /from\s+([\w.]+)\s+import\s+/
			const fromMatch = line.match(fromRegex)
			if (fromMatch && fromMatch[1]) {
				importPaths.push(fromMatch[1])
			}
		}

		return importPaths
	}

	/**
	 * 解析Python导入路径为绝对文件路径
	 */
	private async resolvePythonImport(importModule: string, sourceFile: string): Promise<string | null> {
		try {
			const fs = require("fs/promises")
			const path = require("path")

			const sourceDir = path.dirname(sourceFile)

			// 将模块名称转换为路径，例如 'foo.bar' -> 'foo/bar.py'
			const modulePath = importModule.replace(/\./g, "/") + ".py"

			// 首先尝试相对于源文件的路径
			let resolvedPath = path.join(sourceDir, modulePath)

			try {
				const stats = await fs.stat(resolvedPath)
				if (stats.isFile()) {
					return resolvedPath
				}
			} catch (e) {
				// 文件不存在，继续尝试
			}

			// 尝试包路径 - 查找__init__.py
			const packageDir = path.join(sourceDir, importModule.split(".")[0])
			const initFile = path.join(packageDir, "__init__.py")

			try {
				const stats = await fs.stat(initFile)
				if (stats.isFile()) {
					// 找到了包, 尝试解析完整的模块路径
					const submodulePath = importModule.split(".").slice(1).join("/")
					if (submodulePath) {
						const submoduleFile = path.join(packageDir, submodulePath + ".py")
						try {
							const subStats = await fs.stat(submoduleFile)
							if (subStats.isFile()) {
								return submoduleFile
							}
						} catch (e) {
							// 子模块文件不存在
						}
					}
					// 如果只找到包但没找到具体模块，返回__init__.py
					return initFile
				}
			} catch (e) {
				// 包不存在
			}

			// 还可以添加对Python环境路径的搜索，但这需要更复杂的实现

			return null
		} catch (error) {
			console.error(`Error resolving Python import ${importModule} from ${sourceFile}:`, error)
			return null
		}
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			const fs = require("fs/promises")
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}
