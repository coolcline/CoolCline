import { join, dirname, parse, basename } from "../../../../utils/path"
import * as fs from "fs/promises"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * C#导入解析器
 */
export class CSharpImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService
	private fs = require("fs").promises
	private glob = require("glob")

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取C#文件中的直接导入
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
				const resolvedPath = await this.resolveCSharpImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing C# imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从C#文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 匹配基本using语句: using System.Collections.Generic;
		const usingRegex = /using\s+([\w.]+);/g
		let match

		// 匹配带别名的using语句: using Project = MyCompany.Project;
		const aliasedUsingRegex = /using\s+(\w+)\s*=\s*([\w.]+);/g

		const contentLines = content.split("\n")
		for (let i = 0; i < contentLines.length; i++) {
			const line = contentLines[i].trim()

			// 忽略注释行
			if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
				continue
			}

			// 匹配基本using语句
			const usingRegex = /using\s+([\w.]+);/g
			while ((match = usingRegex.exec(line)) !== null) {
				if (match[1]) {
					importPaths.push(match[1])
				}
			}

			// 匹配别名using语句
			const aliasRegex = /using\s+(\w+)\s*=\s*([\w.]+);/g
			while ((match = aliasRegex.exec(line)) !== null) {
				if (match[2]) {
					// 保存原始命名空间路径
					importPaths.push(match[2])
				}
			}

			// 匹配静态using语句: using static System.Math;
			const staticUsingRegex = /using\s+static\s+([\w.]+);/g
			while ((match = staticUsingRegex.exec(line)) !== null) {
				if (match[1]) {
					importPaths.push(match[1])
				}
			}
		}

		return importPaths
	}

	/**
	 * 解析C#导入路径为实际文件路径
	 * @param importPath 导入路径（命名空间路径）
	 * @param sourceFilePath 源文件路径
	 */
	private async resolveCSharpImport(importPath: string, sourceFilePath: string): Promise<string | null> {
		try {
			// 获取项目根目录
			const projectRoot = await this.findProjectRoot(sourceFilePath)
			if (!projectRoot) {
				return null
			}

			// 将命名空间路径转换为可能的文件路径
			const namespaceParts = importPath.split(".")

			// 尝试查找可能的.cs文件
			// 考虑多种可能性:
			// 1. 完整路径匹配: System.Collections.Generic -> System/Collections/Generic.cs
			// 2. 最后一个部分作为文件名: System.Collections.Generic -> */Generic.cs

			// 方法1: 尝试完整路径匹配
			const possiblePath = join(projectRoot, ...namespaceParts) + ".cs"
			if (await this.fileExists(possiblePath)) {
				return possiblePath
			}

			// 方法2: 在src目录下查找
			const srcDirPath = join(projectRoot, "src")
			if (await this.directoryExists(srcDirPath)) {
				const possibleSrcPath = join(srcDirPath, ...namespaceParts) + ".cs"
				if (await this.fileExists(possibleSrcPath)) {
					return possibleSrcPath
				}
			}

			// 方法3: 在项目中使用glob搜索最后一个部分作为文件名
			const fileName = namespaceParts[namespaceParts.length - 1] + ".cs"
			const globPattern = join(projectRoot, "**", fileName)

			const globResults = await this.globSearch(globPattern)
			if (globResults && globResults.length > 0) {
				// 选择最可能的匹配结果
				// 简单策略: 选择路径中含有较多命名空间部分的文件
				let bestMatch = globResults[0]
				let bestMatchScore = 0

				for (const result of globResults) {
					let score = 0
					for (const part of namespaceParts) {
						if (result.includes(part)) {
							score++
						}
					}

					if (score > bestMatchScore) {
						bestMatchScore = score
						bestMatch = result
					}
				}

				return bestMatch
			}

			return null
		} catch (error) {
			console.error(`Error resolving C# import ${importPath}:`, error)
			return null
		}
	}

	/**
	 * 查找包含给定文件的项目根目录
	 * 通过查找.csproj, .sln等文件判断
	 */
	private async findProjectRoot(filePath: string): Promise<string | null> {
		try {
			let currentDir = dirname(filePath)
			const root = parse(currentDir).root

			// 向上遍历目录直到找到项目文件或到达文件系统根目录
			while (currentDir !== root) {
				// 查找.csproj或.sln文件
				const hasCsproj = await this.globSearch(join(currentDir, "*.csproj"))
				const hasSln = await this.globSearch(join(currentDir, "*.sln"))

				if ((hasCsproj && hasCsproj.length > 0) || (hasSln && hasSln.length > 0)) {
					return currentDir
				}

				// 移动到父目录
				currentDir = dirname(currentDir)
			}

			// 没有找到项目文件，返回文件所在目录作为备选
			return dirname(filePath)
		} catch (error) {
			console.error(`Error finding C# project root:`, error)
			return dirname(filePath)
		}
	}

	/**
	 * 读取文件内容的辅助方法
	 */
	private async readFileContent(filePath: string): Promise<string> {
		try {
			return await this.fs.readFile(filePath, "utf8")
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}

	/**
	 * 检查文件是否存在
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await this.fs.access(filePath)
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * 检查目录是否存在
	 */
	private async directoryExists(dirPath: string): Promise<boolean> {
		try {
			const stats = await this.fs.stat(dirPath)
			return stats.isDirectory()
		} catch (error) {
			return false
		}
	}

	/**
	 * 执行glob搜索
	 */
	private async globSearch(pattern: string): Promise<string[]> {
		try {
			return new Promise((resolve, reject) => {
				this.glob(pattern, (err: any, files: string[]) => {
					if (err) reject(err)
					else resolve(files)
				})
			})
		} catch (error) {
			console.error(`Error performing glob search with pattern ${pattern}:`, error)
			return []
		}
	}
}
