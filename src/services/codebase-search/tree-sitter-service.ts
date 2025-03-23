/**
 * 代码库的Tree-sitter服务
 * 负责解析代码文件并提取符号信息
 */
import Parser from "web-tree-sitter"
import * as path from "../../utils/path"
import { promises as fs } from "fs"
import { ResultType, CodeSymbol, SymbolDefinition, SymbolReference, ImportStatement, ProcessedSymbols } from "./types"

// 导入符号处理器
import { processQueryResults } from "./symbol-processor"

// 导入各语言的查询函数
import { getTypeScriptQuery } from "./languages/typescript"
import { getPythonQuery } from "./languages/python"
import { getGoQuery } from "./languages/go"
import { getRubyQuery } from "./languages/ruby"
import { getPHPQuery } from "./languages/php"
import { getCSharpQuery } from "./languages/csharp"
import { getJavaQuery } from "./languages/java"

// 导入语言工具函数
import { getExtensionForLanguage } from "./languages"

// 定义语言解析器类型
type LanguageParser = {
	[ext: string]: {
		parser: Parser
		language: Parser.Language
		query?: Parser.Query
	}
}

interface TextDocument {
	uri: string
	languageId: string
	lineCount: number
}

/**
 * 代码库Tree-sitter服务类
 */
export class CodebaseTreeSitterService {
	private languageParsers: LanguageParser = {}
	private extendedQueries: Map<string, Parser.Query> = new Map()
	private initialized: boolean = false
	private workspaceRootPath: string

	/**
	 * 构造函数
	 * @param workspaceRootPath 工作区根路径
	 */
	constructor(workspaceRootPath?: string) {
		this.workspaceRootPath = workspaceRootPath || process.cwd()
	}

	/**
	 * 获取项目根目录
	 */
	public getProjectRoot(): string {
		return this.workspaceRootPath
	}

	/**
	 * 初始化Tree-sitter
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) return

		await Parser.init()
		await this.initExtendedQueries()

		this.initialized = true
	}

	/**
	 * 初始化扩展查询
	 */
	private async initExtendedQueries(): Promise<void> {
		// 初始化各种语言的解析器
		// 这里应该加载所有支持的语言的parser
		// 暂时先支持TypeScript/JavaScript和Python
		const languages = ["typescript", "python", "java", "go", "csharp", "ruby", "php"]

		for (const lang of languages) {
			try {
				const language = await this.loadLanguage(lang)
				if (language) {
					const ext = getExtensionForLanguage(lang)
					this.languageParsers[ext] = { parser: new Parser(), language }
					this.languageParsers[ext].parser.setLanguage(language)

					// 创建扩展查询
					const query = await this.createExtendedQueryForLanguage(ext, language)
					if (query) {
						this.extendedQueries.set(ext, query)
						this.languageParsers[ext].query = query
					}
				}
			} catch (error) {
				console.error(`Error initializing ${lang} parser:`, error)
			}
		}
	}

	/**
	 * 为语言创建扩展查询
	 */
	private async createExtendedQueryForLanguage(ext: string, language: Parser.Language): Promise<Parser.Query | null> {
		try {
			// 使用导入的查询函数获取查询字符串
			let queryString: string = ""

			switch (ext) {
				case ".ts":
				case ".tsx":
				case ".js":
				case ".jsx":
					queryString = getTypeScriptQuery()
					break
				case ".py":
					queryString = getPythonQuery()
					break
				case ".java":
					queryString = getJavaQuery()
					break
				case ".go":
					queryString = getGoQuery()
					break
				case ".cs":
					queryString = getCSharpQuery()
					break
				case ".rb":
					queryString = getRubyQuery()
					break
				case ".php":
					queryString = getPHPQuery()
					break
				default:
					return null
			}

			// 如果获取到查询字符串，创建查询
			if (queryString) {
				return language.query(queryString)
			}

			return null
		} catch (error) {
			console.error(`Error creating query for extension ${ext}:`, error)
			return null
		}
	}

	/**
	 * 获取语言解析器
	 */
	private getLanguageParser(filePath: string): { parser: Parser; query: Parser.Query } | null {
		const ext = path.extname(filePath).toLowerCase()
		const parser = this.languageParsers[ext]

		if (!parser || !parser.query) {
			return null
		}

		return { parser: parser.parser, query: parser.query }
	}

	/**
	 * 解析文件并提取引用
	 */
	public async parseFileWithReferences(filePath: string): Promise<{
		definitions: any[]
		references: SymbolReference[]
	}> {
		if (!this.initialized) {
			await this.initialize()
		}

		try {
			const parserInfo = this.getLanguageParser(filePath)
			if (!parserInfo) {
				return { definitions: [], references: [] }
			}

			const { parser, query } = parserInfo
			const content = await this.readFileContent(filePath)
			if (!content) {
				return { definitions: [], references: [] }
			}

			const tree = parser.parse(content)
			const captures = query.captures(tree.rootNode)

			// 使用符号处理器处理查询结果
			const result = processQueryResults(captures, content, filePath)

			return {
				definitions: result.definitions,
				references: result.references,
			}
		} catch (error) {
			console.error(`Error parsing file with references ${filePath}:`, error)
			return { definitions: [], references: [] }
		}
	}

	/**
	 * 解析文件顶层符号
	 */
	public async parseFileTopLevelOnly(filePath: string): Promise<{
		definitions: any[]
	}> {
		if (!this.initialized) {
			await this.initialize()
		}

		try {
			const parserInfo = this.getLanguageParser(filePath)
			if (!parserInfo) {
				return { definitions: [] }
			}

			const { parser, query } = parserInfo
			const content = await this.readFileContent(filePath)
			if (!content) {
				return { definitions: [] }
			}

			const tree = parser.parse(content)
			const captures = query.captures(tree.rootNode)

			// 使用符号处理器处理查询结果
			const result = processQueryResults(captures, content, filePath)

			return {
				definitions: result.definitions,
			}
		} catch (error) {
			console.error(`Error parsing file top level ${filePath}:`, error)
			return { definitions: [] }
		}
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
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}

	/**
	 * 加载特定语言
	 */
	private async loadLanguage(lang: string): Promise<Parser.Language | null> {
		try {
			return await Parser.Language.load(`${__dirname}/../tree-sitter/tree-sitter-${lang}.wasm`)
		} catch (error) {
			console.error(`Error loading language ${lang}:`, error)
			return null
		}
	}
}
