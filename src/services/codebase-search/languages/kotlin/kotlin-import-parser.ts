import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { existsSync } from "fs"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * Kotlin语言导入解析器
 */
export class KotlinImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Kotlin文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 导入的文件路径数组
	 */
	async getDirectImports(filePath: string): Promise<string[]> {
		try {
			// 读取文件内容
			const content = await this.readFileContent(filePath)

			// 提取导入路径
			const importPaths = this.extractImportPaths(content)

			// 提取当前包名
			const packageName = this.extractPackageName(content)

			// 解析所有导入路径
			const resolvedPaths: string[] = []
			for (const importPath of importPaths) {
				const resolvedPath = await this.resolveKotlinImport(importPath, filePath, packageName)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			// 添加当前文件所在目录的其他Kotlin文件（同包文件）
			const currentDir = dirname(filePath)
			try {
				const files = await fs.readdir(currentDir)
				const kotlinFiles = files
					.filter(
						(f: string) => (f.endsWith(".kt") || f.endsWith(".kts")) && join(currentDir, f) !== filePath,
					)
					.map((f: string) => join(currentDir, f))

				resolvedPaths.push(...kotlinFiles)
			} catch (e) {
				// 读取目录失败，忽略
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Kotlin imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Kotlin文件内容中提取导入路径
	 */
	extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 提取import语句
		// 例如: import kotlin.collections.List
		// 或者: import org.example.MyClass
		const importRegex = /import\s+([A-Za-z0-9_.]+)(?:\s+as\s+[A-Za-z0-9_]+)?/g
		let match
		while ((match = importRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		// 提取import语句带星号
		// 例如: import kotlin.collections.*
		const importStarRegex = /import\s+([A-Za-z0-9_.]+)\.\*/g
		while ((match = importStarRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		return importPaths
	}

	/**
	 * 从Kotlin文件中提取包名
	 */
	private extractPackageName(content: string): string {
		// 匹配包声明: package org.example.app
		const packageRegex = /package\s+([A-Za-z0-9_.]+)/
		const match = content.match(packageRegex)
		return match ? match[1] : ""
	}

	/**
	 * 解析Kotlin导入路径为绝对文件路径
	 */
	private async resolveKotlinImport(
		importPath: string,
		sourceFile: string,
		currentPackage: string = "",
	): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)
			const projectRoot = this.findGradleDir(sourceDir)

			// 处理标准库引用
			if (importPath.startsWith("kotlin.") || importPath.startsWith("java.")) {
				return null // 标准库不需要解析为实际路径
			}

			// 尝试在项目中查找对应的类文件
			if (projectRoot) {
				// 转换包名为路径
				const packagePath = importPath.replace(/\./g, "/")

				// 在src/main/kotlin和src/main/java目录中查找
				const possibleDirs = [
					join(projectRoot, "src", "main", "kotlin"),
					join(projectRoot, "src", "main", "java"),
				]

				for (const baseDir of possibleDirs) {
					// 构建可能的类文件路径
					const possibleFile = join(baseDir, `${packagePath}.kt`)
					try {
						await fs.access(possibleFile)
						return possibleFile
					} catch (e) {
						// 文件不存在，继续尝试
					}

					// 尝试查找目录下的Kotlin文件
					const possibleDir = join(baseDir, packagePath)
					try {
						const stats = await fs.stat(possibleDir)
						if (stats.isDirectory()) {
							const files = await fs.readdir(possibleDir)
							const kotlinFiles = files.filter((f: string) => f.endsWith(".kt"))
							if (kotlinFiles.length > 0) {
								return join(possibleDir, kotlinFiles[0])
							}
						}
					} catch (e) {
						// 目录不存在，继续尝试
					}
				}

				// 使用glob模式在项目中搜索
				try {
					const lastSegment = importPath.split(".").pop()
					if (lastSegment) {
						const files = await glob(`**/${lastSegment}.kt`, {
							cwd: projectRoot,
							ignore: ["**/build/**", "**/out/**", "**/generated/**"],
						})
						if (files.length > 0) {
							return join(projectRoot, files[0])
						}
					}
				} catch (e) {
					// glob搜索失败，忽略
				}
			}

			// 尝试使用当前包名来解析相对导入
			if (currentPackage && importPath.startsWith(currentPackage + ".")) {
				const relativePath = importPath.slice(currentPackage.length + 1)
				const filePath = join(sourceDir, relativePath.replace(/\./g, "/") + ".kt")
				try {
					await fs.access(filePath)
					return filePath
				} catch (e) {
					// 文件不存在，继续尝试
				}
			}

			return null
		} catch (error) {
			console.error(`Error resolving Kotlin import: ${importPath}`, error)
			return null
		}
	}

	/**
	 * 查找Gradle项目目录
	 */
	private findGradleDir(startDir: string): string | null {
		try {
			let currentDir = startDir
			const maxDepth = 10 // 防止无限循环

			for (let i = 0; i < maxDepth; i++) {
				// 检查是否包含build.gradle或build.gradle.kts文件
				if (existsSync(join(currentDir, "build.gradle")) || existsSync(join(currentDir, "build.gradle.kts"))) {
					return currentDir
				}

				// 检查是否包含settings.gradle或settings.gradle.kts文件
				if (
					existsSync(join(currentDir, "settings.gradle")) ||
					existsSync(join(currentDir, "settings.gradle.kts"))
				) {
					return currentDir
				}

				const parentDir = dirname(currentDir)
				if (parentDir === currentDir) {
					break // 已到达文件系统根目录
				}

				currentDir = parentDir
			}

			return null
		} catch (error) {
			console.error("Error finding Gradle project:", error)
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
