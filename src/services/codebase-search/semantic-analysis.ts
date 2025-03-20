/**
 * 代码语义分析服务
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { CodeSymbol, ParsedFile, RelationType, ResultType, SymbolRelation } from "./types"
import { toPosixPath, extname } from "../../utils/path"

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
		// 简单实现，后续可整合更复杂的语义相似度算法

		// 将查询和代码转换为小写，便于比较
		const normalizedQuery = query.toLowerCase()
		const normalizedCode = code.toLowerCase()

		// 提取查询中的关键词
		const keywords = normalizedQuery
			.split(/\s+/)
			.filter((word) => word.length > 2)
			.filter((word) => !["the", "and", "for", "this", "that"].includes(word))

		// 计算关键词在代码中的匹配度
		let matchCount = 0
		for (const keyword of keywords) {
			if (normalizedCode.includes(keyword)) {
				matchCount++
			}
		}

		// 计算相似度分数
		const baseScore = keywords.length > 0 ? matchCount / keywords.length : 0

		// 加入额外因素调整分数
		let bonusScore = 0

		// 如果代码中包含函数、类、变量等关键字，增加相关性
		if (/function|class|interface|const|let|var|method/i.test(normalizedCode)) {
			bonusScore += 0.1
		}

		// 如果代码行数少（更精确匹配），增加相关性
		const lineCount = code.split("\n").length
		if (lineCount < 5) {
			bonusScore += 0.1
		}

		// 结合基础分数和额外评分，但不超过1
		return Math.min(baseScore + bonusScore, 1)
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
		if (treeSitterService) {
			try {
				// TODO: 使用Tree-sitter提取符号
				return this.extractSymbolsFallback(content, language)
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
		// 这里是简化实现，实际应该使用语法树分析
		const relations: SymbolRelation[] = []

		// 如果符号数量少于2，无需分析关系
		if (symbols.length < 2) {
			return relations
		}

		// 为符号分配ID
		symbols.forEach((symbol, index) => {
			symbol.id = index + 1
		})

		// 简单分析：检查符号在其他符号内容中的引用
		for (let i = 0; i < symbols.length; i++) {
			const source = symbols[i]
			if (!source.id) continue

			for (let j = 0; j < symbols.length; j++) {
				if (i === j) continue

				const target = symbols[j]
				if (!target.id) continue

				// 检查源符号是否引用了目标符号
				if (source.content.includes(target.name)) {
					relations.push({
						sourceId: source.id,
						targetId: target.id,
						relationType: RelationType.Uses,
					})
				}

				// 检查类继承关系（简化实现）
				if (
					source.type === ResultType.Class &&
					target.type === ResultType.Class &&
					source.content.includes(`extends ${target.name}`)
				) {
					relations.push({
						sourceId: source.id,
						targetId: target.id,
						relationType: RelationType.Extends,
					})
				}

				// 检查接口实现关系（简化实现）
				if (
					source.type === ResultType.Class &&
					target.type === ResultType.Interface &&
					source.content.includes(`implements ${target.name}`)
				) {
					relations.push({
						sourceId: source.id,
						targetId: target.id,
						relationType: RelationType.Implements,
					})
				}
			}
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
