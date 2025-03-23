import { join, dirname } from "../../../../utils/path"
import * as fs from "fs/promises"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

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
			const sourceDir = dirname(sourceFile)
			let resolvedPath = join(sourceDir, importPath)

			// 如果没有扩展名，尝试添加扩展名
			if (!resolvedPath.includes(".")) {
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
					const indexFile = join(resolvedPath, `index${ext}`)
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
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}
