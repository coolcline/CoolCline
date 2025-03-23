import { join, dirname, basename } from "../../../../utils/path"
import * as fs from "fs/promises"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * PHP导入解析器
 */
export class PHPImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取PHP文件中的直接导入
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
				const resolvedPath = await this.resolvePHPImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing PHP imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从PHP文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 匹配require/include语句: require 'foo.php'; include('bar.php');
		const includeRegex = /(require|require_once|include|include_once)\s*\(?['"](.*?)['"][\);]/g
		let match

		// 匹配use语句: use Namespace\Class;
		const useRegex = /use\s+([\\\w]+)(\s+as\s+[\w]+)?;/g

		const contentLines = content.split("\n")
		for (let i = 0; i < contentLines.length; i++) {
			const line = contentLines[i].trim()

			// 忽略注释行
			if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
				continue
			}

			// 匹配include/require语句
			while ((match = includeRegex.exec(line)) !== null) {
				if (match[2]) {
					importPaths.push(match[2])
				}
			}

			// 匹配use语句（命名空间导入）
			while ((match = useRegex.exec(line)) !== null) {
				if (match[1]) {
					importPaths.push(`namespace:${match[1]}`)
				}
			}
		}

		return importPaths
	}

	/**
	 * 解析PHP导入路径
	 * @param importPath 导入路径
	 * @param currentFilePath 当前文件路径
	 */
	private async resolvePHPImport(importPath: string, currentFilePath: string): Promise<string | null> {
		try {
			const currentDir = dirname(currentFilePath)

			// 处理命名空间导入
			if (importPath.startsWith("namespace:")) {
				// 从命名空间路径转换为文件路径
				const nsPath = importPath.substring(10)
				const filePath = this.namespaceToFilePath(nsPath)

				// 在项目中查找匹配的文件
				const files = await this.findFilesByPattern(filePath)

				if (files.length > 0) {
					return files[0]
				}

				return null
			}

			// 处理require/include路径
			// 首先检查相对路径
			const fullPath = join(currentDir, importPath)

			try {
				await fs.access(fullPath)
				return fullPath
			} catch {
				// 文件不存在，尝试不同的方式
			}

			// 尝试添加.php扩展名
			if (!importPath.endsWith(".php")) {
				const pathWithExt = fullPath + ".php"
				try {
					await fs.access(pathWithExt)
					return pathWithExt
				} catch {
					// 文件不存在，继续尝试
				}
			}

			// 最后，在整个项目中搜索文件名
			const fileName = basename(importPath)
			const files = await this.findFilesByName(fileName)

			if (files.length > 0) {
				return files[0]
			}

			return null
		} catch (error) {
			console.warn(`Error resolving PHP import ${importPath}:`, error)
			return null
		}
	}

	/**
	 * 将命名空间路径转换为文件路径模式
	 */
	private namespaceToFilePath(namespace: string): string {
		// 将命名空间分隔符转换为路径分隔符
		return namespace.replace(/\\/g, "/") + ".php"
	}

	/**
	 * 在项目中查找具有指定名称的文件
	 */
	private async findFilesByName(fileName: string): Promise<string[]> {
		// 使用简单的glob匹配
		const projectRoot = this.treeService.getProjectRoot()
		const pattern = join(projectRoot, "**", fileName)

		try {
			return await glob(pattern, { ignore: ["**/node_modules/**", "**/vendor/**"] })
		} catch (error) {
			console.error(`Error searching for files:`, error)
			return []
		}
	}

	/**
	 * 在项目中查找匹配特定模式的文件
	 */
	private async findFilesByPattern(pattern: string): Promise<string[]> {
		const projectRoot = this.treeService.getProjectRoot()
		const globPattern = join(projectRoot, "**", pattern)

		try {
			return await glob(globPattern, { ignore: ["**/node_modules/**", "**/vendor/**"] })
		} catch (error) {
			console.error(`Error searching for files:`, error)
			return []
		}
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			return await fs.readFile(filePath, "utf8")
		} catch (error) {
			throw new Error(`Failed to read file: ${filePath}`)
		}
	}
}
