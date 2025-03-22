/**
 * 代码语义分析服务
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { CodeSymbol, ParsedFile, RelationType, ResultType, SymbolRelation } from "./types"
import { toPosixPath, extname, dirname, join, basename } from "../../utils/path"
import * as os from "os"

// 尝试导入现有的Tree-sitter服务
let treeSitterService: any
try {
	// 使用动态导入避免循环依赖
	import("../tree-sitter").then((module) => {
		treeSitterService = module
	})
} catch (error) {
	console.error("Failed to load tree-sitter service:", error)
}

/**
 * 语义分析服务类
 */
export class SemanticAnalysisService {
	private workspacePath: string

	/**
	 * 构造函数
	 * @param workspacePath 工作区路径
	 */
	constructor(workspacePath: string) {
		this.workspacePath = toPosixPath(workspacePath)
	}

	/**
	 * 分析文件
	 * @param filePath 文件路径
	 * @returns 文件解析结果
	 */
	public async analyzeFile(filePath: string): Promise<ParsedFile> {
		try {
			// 规范化文件路径
			filePath = toPosixPath(filePath)

			// 检查文件是否存在
			if (!fs.existsSync(filePath)) {
				throw new Error(`文件不存在: ${filePath}`)
			}

			// 读取文件内容
			const content = await fs.promises.readFile(filePath, "utf-8")

			// 获取文件语言
			const language = this.detectLanguage(filePath)

			// 解析文件内容，提取符号
			const symbols = await this.extractSymbols(content, language, filePath)

			// 分析符号间关系
			const relations = await this.analyzeRelations(symbols, content, language)

			return { symbols, relations }
		} catch (error) {
			console.error(`分析文件失败: ${filePath}`, error)
			throw new Error(`分析文件失败: ${error.message}`)
		}
	}

	/**
	 * 计算查询与代码的语义相似度
	 * @param query 查询字符串
	 * @param code 代码片段
	 * @returns 相似度分数 (0-1)
	 */
	public calculateSemanticRelevance(query: string, code: string): number {
		// 处理空输入
		if (!query || !code) {
			return 0
		}

		// 将查询和代码转换为小写，便于比较
		const normalizedQuery = query.toLowerCase()
		const normalizedCode = code.toLowerCase()

		// 提取查询中的关键词
		const keywords = normalizedQuery
			.split(/\s+/)
			.filter((word) => word.length > 2)
			.filter((word) => !["the", "and", "for", "this", "that"].includes(word))

		// 如果没有关键词，返回0
		if (keywords.length === 0) {
			return 0
		}

		// 计算关键词在代码中的匹配度
		let matchCount = 0
		for (const keyword of keywords) {
			if (normalizedCode.includes(keyword)) {
				matchCount++
			}
		}

		// 计算相似度分数
		const baseScore = matchCount / keywords.length

		// 加入额外因素调整分数
		let bonusScore = 0

		// 代码结构关键词加分
		const structureKeywords = ["class", "interface", "function", "method", "property"]
		for (const keyword of structureKeywords) {
			if (normalizedCode.includes(keyword)) {
				bonusScore += 0.1
			}
		}

		// 返回最终分数
		return Math.min(1, baseScore + bonusScore)
	}

	/**
	 * 提取文件中的符号
	 * @param content 文件内容
	 * @param language 编程语言
	 * @param filePath 文件路径
	 * @returns 符号数组
	 * @private
	 */
	private async extractSymbols(content: string, language: string, filePath: string): Promise<CodeSymbol[]> {
		// 如果Tree-sitter服务可用，使用它提取符号
		if (treeSitterService && treeSitterService.parseSourceCodeForDefinitionsTopLevel) {
			try {
				const dirPath = dirname(filePath)
				const fileName = basename(filePath)

				// 创建临时目录结构用于Tree-sitter解析
				const tempDir = join(os.tmpdir(), `coolcline-${Date.now()}`)
				await fs.promises.mkdir(tempDir, { recursive: true })
				await fs.promises.writeFile(join(tempDir, fileName), content)

				// 使用Tree-sitter解析代码
				const parseResult = await treeSitterService.parseSourceCodeForDefinitionsTopLevel(tempDir)

				// 解析Tree-sitter结果
				const symbols = this.parseTreeSitterResult(parseResult, content)

				// 清理临时文件
				try {
					await fs.promises.rm(tempDir, { recursive: true, force: true })
				} catch (error) {
					console.warn("清理临时文件失败:", error)
				}

				return symbols.length > 0 ? symbols : this.extractSymbolsFallback(content, language)
			} catch (error) {
				console.warn("Tree-sitter extraction failed, using fallback:", error)
				return this.extractSymbolsFallback(content, language)
			}
		} else {
			// 使用简单的回退方法
			return this.extractSymbolsFallback(content, language)
		}
	}

	/**
	 * 解析Tree-sitter结果
	 * @param parseResult Tree-sitter解析结果
	 * @param originalContent 原始文件内容
	 * @returns 符号数组
	 * @private
	 */
	private parseTreeSitterResult(parseResult: string, originalContent: string): CodeSymbol[] {
		const symbols: CodeSymbol[] = []
		const contentLines = originalContent.split("\n")

		// 解析Tree-sitter输出格式
		const sections = parseResult.split("|----")

		for (const section of sections) {
			const lines = section.trim().split("\n")
			for (const line of lines) {
				if (!line || !line.startsWith("│")) continue

				// 去除前缀
				const content = line.substring(1)

				// 尝试确定行号
				let lineNumber = -1
				for (let i = 0; i < contentLines.length; i++) {
					if (contentLines[i].includes(content)) {
						lineNumber = i + 1
						break
					}
				}

				if (lineNumber === -1) continue

				// 确定符号类型
				let type = ResultType.Variable
				if (content.includes("function") || content.includes("def ") || content.includes("func ")) {
					type = ResultType.Function
				} else if (content.includes("class") || content.includes("interface") || content.includes("struct")) {
					type = ResultType.Class
				} else if (content.includes("import") || content.includes("require")) {
					type = ResultType.Import
				}

				// 提取符号名称
				let name = ""

				// 按语言特性提取名称
				if (type === ResultType.Function) {
					const functionMatch = content.match(/(?:function|def|func)\s+(\w+)|(\w+)\s*\([^)]*\)/)
					if (functionMatch) {
						name = functionMatch[1] || functionMatch[2]
					}
				} else if (type === ResultType.Class) {
					const classMatch = content.match(/(?:class|interface|struct)\s+(\w+)/)
					if (classMatch) {
						name = classMatch[1]
					}
				} else {
					const varMatch = content.match(/(?:const|let|var|public|private)\s+(\w+)\s*(?::|=)/)
					if (varMatch) {
						name = varMatch[1]
					} else {
						// 尝试提取任何可能的标识符
						const wordMatch = content.match(/^\s*(\w+)\s*(?::|=|{)/)
						if (wordMatch) {
							name = wordMatch[1]
						}
					}
				}

				if (name) {
					symbols.push({
						name,
						type,
						line: lineNumber,
						column: content.indexOf(name),
						content: content.trim(),
						signature: type === ResultType.Function ? content.trim() : undefined,
					})
				}
			}
		}

		return symbols
	}

	/**
	 * 使用简单的正则表达式提取符号（回退方法）
	 * @param content 文件内容
	 * @param language 编程语言
	 * @returns 符号数组
	 * @private
	 */
	private extractSymbolsFallback(content: string, language: string): CodeSymbol[] {
		const symbols: CodeSymbol[] = []
		const lines = content.split("\n")

		// 根据语言选择不同的正则表达式
		let functionRegex: RegExp
		let classRegex: RegExp
		let variableRegex: RegExp

		switch (language) {
			case "typescript":
			case "javascript":
				functionRegex =
					/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(?.*\)?\s*=>|(?:async\s*)?(\w+)\s*\([^)]*\)\s*{)/g
				classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g
				variableRegex = /(?:const|let|var)\s+(\w+)\s*(?::|\=)/g
				break
			case "python":
				functionRegex = /def\s+(\w+)\s*\(/g
				classRegex = /class\s+(\w+)(?:\s*\(([^)]+)\))?/g
				variableRegex = /(\w+)\s*=\s*(?!function|class)/g
				break
			default:
				functionRegex = /(?:function|def|func)\s+(\w+)|(\w+)\s*\([^)]*\)\s*{/g
				classRegex = /(?:class|interface|struct)\s+(\w+)/g
				variableRegex = /(?:const|let|var|public|private)\s+(\w+)\s*(?::|=)/g
		}

		// 提取函数
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// 尝试匹配函数
			let match: RegExpExecArray | null
			while ((match = functionRegex.exec(line)) !== null) {
				const name = match[1] || match[2] || match[3]
				if (name) {
					symbols.push({
						name,
						type: ResultType.Function,
						line: i + 1,
						column: match.index,
						content: line.trim(),
						signature: line.trim(),
					})
				}
			}

			// 尝试匹配类
			functionRegex.lastIndex = 0 // 重置索引
			while ((match = classRegex.exec(line)) !== null) {
				const name = match[1]
				if (name) {
					symbols.push({
						name,
						type: ResultType.Class,
						line: i + 1,
						column: match.index,
						content: line.trim(),
					})
				}
			}

			// 尝试匹配变量
			classRegex.lastIndex = 0 // 重置索引
			while ((match = variableRegex.exec(line)) !== null) {
				const name = match[1]
				if (name) {
					symbols.push({
						name,
						type: ResultType.Variable,
						line: i + 1,
						column: match.index,
						content: line.trim(),
					})
				}
			}
		}

		return symbols
	}

	/**
	 * 分析符号间的关系
	 * @param symbols 符号数组
	 * @param content 文件内容
	 * @param language 编程语言
	 * @returns 符号关系数组
	 * @private
	 */
	private async analyzeRelations(
		symbols: CodeSymbol[],
		content: string,
		language: string,
	): Promise<SymbolRelation[]> {
		const relations: SymbolRelation[] = []

		// 分析继承关系
		const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g
		let match
		while ((match = extendsRegex.exec(content)) !== null) {
			const childClass = match[1]
			const parentClass = match[2]
			relations.push({
				sourceId: symbols.findIndex((s) => s.name === childClass) + 1,
				targetId: symbols.findIndex((s) => s.name === parentClass) + 1,
				relationType: RelationType.Extends,
			})
		}

		// 分析实现关系
		const implementsRegex = /class\s+(\w+)\s+implements\s+(\w+)/g
		while ((match = implementsRegex.exec(content)) !== null) {
			const implementingClass = match[1]
			const interfaceName = match[2]
			relations.push({
				sourceId: symbols.findIndex((s) => s.name === implementingClass) + 1,
				targetId: symbols.findIndex((s) => s.name === interfaceName) + 1,
				relationType: RelationType.Implements,
			})
		}

		return relations
	}

	/**
	 * 检测文件语言
	 * @param filePath 文件路径
	 * @returns 文件语言
	 * @private
	 */
	private detectLanguage(filePath: string): string {
		const ext = extname(filePath).toLowerCase()

		// 简单的扩展名到语言映射
		const languageMap: Record<string, string> = {
			".ts": "typescript",
			".tsx": "typescript",
			".js": "javascript",
			".jsx": "javascript",
			".py": "python",
			".rb": "ruby",
			".go": "go",
			".java": "java",
			".c": "c",
			".cpp": "cpp",
			".cs": "csharp",
			".php": "php",
			".rs": "rust",
			".swift": "swift",
			".kt": "kotlin",
			".html": "html",
			".css": "css",
			".json": "json",
			".md": "markdown",
			".sql": "sql",
		}

		return languageMap[ext] || "plaintext"
	}
}

/**
 * 创建语义分析服务实例
 * @param workspacePath 工作区路径
 * @returns 语义分析服务实例
 */
export function createSemanticAnalysisService(workspacePath: string): SemanticAnalysisService {
	return new SemanticAnalysisService(toPosixPath(workspacePath))
}
