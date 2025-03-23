import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * C/C++语言导入解析器
 */
export class CPPImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取C/C++文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 导入的文件路径数组
	 */
	async getDirectImports(filePath: string): Promise<string[]> {
		try {
			// 读取文件内容
			const content = await this.readFileContent(filePath)

			// 提取导入路径
			const importPaths = this.extractImportPaths(content)

			// 解析所有导入路径
			const resolvedPaths: string[] = []
			for (const importPath of importPaths) {
				const resolvedPath = await this.resolveCPPImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing C/C++ imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从C/C++文件内容中提取导入路径
	 */
	extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 提取#include <库文件>
		const angleIncludeRegex = /#include\s*<([^>]+)>/g
		let match
		while ((match = angleIncludeRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		// 提取#include "本地文件"
		const quoteIncludeRegex = /#include\s*"([^"]+)"/g
		while ((match = quoteIncludeRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		return importPaths
	}

	/**
	 * 解析C/C++导入路径为绝对文件路径
	 */
	private async resolveCPPImport(importPath: string, sourceFile: string): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)

			// 处理 "文件名.h" 格式，先查找相对路径
			if (!importPath.startsWith("<")) {
				// 首先尝试相对于源文件的路径
				const localPath = resolve(sourceDir, importPath)
				try {
					await fs.access(localPath)
					return localPath
				} catch (e) {
					// 本地路径不存在，继续检查
				}

				// 尝试在项目中查找
				const projectRoot = this.treeService.getProjectRoot()
				const possiblePaths = [resolve(projectRoot, "include", importPath), resolve(projectRoot, importPath)]

				for (const path of possiblePaths) {
					try {
						await fs.access(path)
						return path
					} catch (e) {
						// 文件不存在，继续尝试
					}
				}
			}

			// 对于系统头文件 <库文件>，我们通常不能解析其路径
			// 在真实环境中，这需要知道编译器的包含路径
			// 这里简单返回null
			return null
		} catch (error) {
			console.error(`Error resolving C/C++ import: ${importPath}`, error)
			return null
		}
	}

	/**
	 * 读取文件内容
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			return await fs.readFile(filePath, "utf-8")
		} catch (error) {
			throw new Error(`Could not read file ${filePath}: ${error}`)
		}
	}
}
