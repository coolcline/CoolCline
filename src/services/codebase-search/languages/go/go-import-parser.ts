import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * Go语言导入解析器
 */
export class GoImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Go文件中的直接导入
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
				const resolvedPath = await this.resolveGoImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Go imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Go文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 提取单行导入 - import "fmt"
		const singleImportRegex = /import\s+["']([^"']+)["']/g
		let match
		while ((match = singleImportRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		// 提取导入块 - import ( ... )
		const importBlockRegex = /import\s+\(([\s\S]*?)\)/g
		while ((match = importBlockRegex.exec(content)) !== null) {
			if (match[1]) {
				const blockContent = match[1]
				// 在块内匹配每一行导入
				const blockImportRegex = /["']([^"']+)["']/g
				let blockMatch
				while ((blockMatch = blockImportRegex.exec(blockContent)) !== null) {
					if (blockMatch[1]) {
						importPaths.push(blockMatch[1])
					}
				}

				// 匹配带别名的导入
				const aliasedImportRegex = /(\w+)\s+["']([^"']+)["']/g
				while ((blockMatch = aliasedImportRegex.exec(blockContent)) !== null) {
					if (blockMatch[2]) {
						importPaths.push(blockMatch[2])
					}
				}
			}
		}

		return importPaths
	}

	/**
	 * 解析Go导入路径为绝对文件路径
	 */
	private async resolveGoImport(importPath: string, sourceFile: string): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)
			const projectRoot = this.findGoModDir(sourceDir)

			// 标准库不处理
			if (!importPath.includes(".") && !importPath.includes("/")) {
				return null
			}

			// Go模块导入解析
			if (projectRoot) {
				// 查找GOPATH
				const gopath = process.env.GOPATH || join(process.env.HOME || "", "go")

				// 尝试在本地项目中查找
				const localModulePath = join(projectRoot, importPath)
				try {
					const stats = await fs.stat(localModulePath)
					if (stats.isDirectory()) {
						// 找到包目录，查找Go源文件
						const files = await fs.readdir(localModulePath)
						const goFiles = files.filter((f: string) => f.endsWith(".go"))
						if (goFiles.length > 0) {
							return join(localModulePath, goFiles[0])
						}
					}
				} catch (e) {
					// 本地不存在，继续尝试
				}

				// 尝试在GOPATH中查找
				const gopathSrc = join(gopath, "src")
				const gopathModulePath = join(gopathSrc, importPath)
				try {
					const stats = await fs.stat(gopathModulePath)
					if (stats.isDirectory()) {
						// 找到包目录，查找Go源文件
						const files = await fs.readdir(gopathModulePath)
						const goFiles = files.filter((f: string) => f.endsWith(".go"))
						if (goFiles.length > 0) {
							return join(gopathModulePath, goFiles[0])
						}
					}
				} catch (e) {
					// GOPATH中不存在
				}

				// 尝试在vendor目录中查找
				const vendorPath = join(projectRoot, "vendor", importPath)
				try {
					const stats = await fs.stat(vendorPath)
					if (stats.isDirectory()) {
						// 找到包目录，查找Go源文件
						const files = await fs.readdir(vendorPath)
						const goFiles = files.filter((f: string) => f.endsWith(".go"))
						if (goFiles.length > 0) {
							return join(vendorPath, goFiles[0])
						}
					}
				} catch (e) {
					// vendor中不存在
				}
			}

			// 无法解析
			return null
		} catch (error) {
			console.error(`Error resolving Go import ${importPath} from ${sourceFile}:`, error)
			return null
		}
	}

	/**
	 * 查找Go项目根目录 (包含go.mod的目录)
	 */
	private findGoModDir(startDir: string): string | null {
		const fs = require("fs")

		let currentDir = startDir
		// 向上搜索最多10层目录
		for (let i = 0; i < 10; i++) {
			// 检查是否存在go.mod文件
			if (fs.existsSync(join(currentDir, "go.mod"))) {
				return currentDir
			}

			const parentDir = dirname(currentDir)
			// 已到达文件系统根目录
			if (parentDir === currentDir) {
				break
			}
			currentDir = parentDir
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
			throw new Error(`Failed to read file: ${filePath}`)
		}
	}
}
