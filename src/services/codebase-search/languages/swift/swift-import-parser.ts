import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { readdirSync } from "fs"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * Swift语言导入解析器
 */
export class SwiftImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Swift文件中的直接导入
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
				const resolvedPath = await this.resolveSwiftImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			// 添加当前文件所在目录的其他Swift文件（可能是同一模块的其他部分）
			const currentDir = dirname(filePath)
			try {
				const files = await fs.readdir(currentDir)
				const swiftFiles = files
					.filter((f: string) => f.endsWith(".swift") && join(currentDir, f) !== filePath)
					.map((f: string) => join(currentDir, f))

				resolvedPaths.push(...swiftFiles)
			} catch (e) {
				// 读取目录失败，忽略
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Swift imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Swift文件内容中提取导入路径
	 */
	extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 提取import语句
		// 例如: import Foundation
		// 或者: import UIKit.UIView
		const importRegex = /import\s+([A-Za-z0-9_.]+)/g
		let match
		while ((match = importRegex.exec(content)) !== null) {
			if (match[1]) {
				// 只取主模块名称
				const moduleName = match[1].split(".")[0].trim()
				importPaths.push(moduleName)
			}
		}

		// 提取@testable import语句
		const testableImportRegex = /@testable\s+import\s+([A-Za-z0-9_.]+)/g
		while ((match = testableImportRegex.exec(content)) !== null) {
			if (match[1]) {
				const moduleName = match[1].split(".")[0].trim()
				importPaths.push(moduleName)
			}
		}

		return importPaths
	}

	/**
	 * 解析Swift导入路径为绝对文件路径
	 */
	private async resolveSwiftImport(importPath: string, sourceFile: string): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)
			const projectRoot = this.findXcodeProjectDir(sourceDir)

			// 处理系统框架，不需要解析
			const systemFrameworks = [
				"Foundation",
				"UIKit",
				"SwiftUI",
				"Combine",
				"CoreData",
				"CoreGraphics",
				"CoreLocation",
				"MapKit",
				"AVFoundation",
			]
			if (systemFrameworks.includes(importPath)) {
				return null
			}

			// 尝试在项目目录中查找对应的模块文件或目录
			if (projectRoot) {
				// 可能的模块位置
				const possibleLocations = [
					join(projectRoot, importPath),
					join(projectRoot, "Sources", importPath),
					join(projectRoot, importPath, "Sources"),
				]

				for (const location of possibleLocations) {
					try {
						const stats = await fs.stat(location)
						if (stats.isDirectory()) {
							// 如果是目录，寻找该目录中的Swift文件
							const files = await fs.readdir(location)
							const swiftFiles = files.filter((f: string) => f.endsWith(".swift"))
							if (swiftFiles.length > 0) {
								return join(location, swiftFiles[0])
							}
						}
					} catch (e) {
						// 位置不存在，继续尝试
					}
				}

				// 尝试查找指定名称的Swift文件
				const possibleFiles = [
					join(projectRoot, `${importPath}.swift`),
					join(projectRoot, "Sources", `${importPath}.swift`),
				]

				for (const filePath of possibleFiles) {
					try {
						await fs.access(filePath)
						return filePath
					} catch (e) {
						// 文件不存在，继续尝试
					}
				}

				// 在整个项目中搜索同名的Swift文件
				try {
					const files = await glob(`**/${importPath}.swift`, {
						cwd: projectRoot,
						ignore: ["**/Pods/**", "**/Build/**", "**/DerivedData/**"],
					})
					if (files.length > 0) {
						return join(projectRoot, files[0])
					}
				} catch (e) {
					// glob搜索失败，忽略
				}
			}

			// 无法解析该导入
			return null
		} catch (error) {
			console.error(`Error resolving Swift import: ${importPath}`, error)
			return null
		}
	}

	/**
	 * 查找Xcode项目目录
	 */
	private findXcodeProjectDir(startDir: string): string | null {
		try {
			let currentDir = startDir
			const maxDepth = 10 // 防止无限循环

			for (let i = 0; i < maxDepth; i++) {
				// 检查是否包含.xcodeproj或.xcworkspace文件
				const dirEntries = readdirSync(currentDir)
				if (
					dirEntries.some((entry: string) => entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace"))
				) {
					return currentDir
				}

				// 检查是否包含Package.swift文件（Swift Package Manager项目）
				if (dirEntries.includes("Package.swift")) {
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
			console.error("Error finding Xcode project:", error)
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
