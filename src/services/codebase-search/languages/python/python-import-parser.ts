import { join, dirname } from "../../../../utils/path"
import * as fs from "fs/promises"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

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
			const sourceDir = dirname(sourceFile)

			// 将模块名称转换为路径，例如 'foo.bar' -> 'foo/bar.py'
			const modulePath = importModule.replace(/\./g, "/") + ".py"

			// 首先尝试相对于源文件的路径
			let resolvedPath = join(sourceDir, modulePath)

			try {
				const stats = await fs.stat(resolvedPath)
				if (stats.isFile()) {
					return resolvedPath
				}
			} catch (e) {
				// 文件不存在，继续尝试
			}

			// 尝试包路径 - 查找__init__.py
			const packageDir = join(sourceDir, importModule.split(".")[0])
			const initFile = join(packageDir, "__init__.py")

			try {
				const stats = await fs.stat(initFile)
				if (stats.isFile()) {
					// 找到了包, 尝试解析完整的模块路径
					const submodulePath = importModule.split(".").slice(1).join("/")
					if (submodulePath) {
						const submoduleFile = join(packageDir, submodulePath + ".py")
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
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}
