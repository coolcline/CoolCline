import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { existsSync } from "fs"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * Rust语言导入解析器
 */
export class RustImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Rust文件中的直接导入
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
				const resolvedPath = await this.resolveRustImport(importPath, filePath)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			// 添加当前文件所在目录的其他Rust文件（可能是同一模块的其他部分）
			const currentDir = dirname(filePath)
			try {
				const files = await fs.readdir(currentDir)
				const rustFiles = files
					.filter((f: string) => f.endsWith(".rs") && join(currentDir, f) !== filePath)
					.map((f: string) => join(currentDir, f))

				resolvedPaths.push(...rustFiles)
			} catch (e) {
				// 读取目录失败，忽略
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Rust imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Rust文件内容中提取导入路径
	 */
	extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 提取use语句
		// 例如: use std::collections::HashMap;
		// 或者: use crate::utils::helper;
		const useRegex = /use\s+([^;]+);/g
		let match
		while ((match = useRegex.exec(content)) !== null) {
			if (match[1]) {
				// 提取路径部分，忽略具体导入的项
				const path = match[1].split("::")[0].trim()
				if (path && !path.startsWith("self") && !path.startsWith("super")) {
					importPaths.push(path)
				}
			}
		}

		// 提取mod声明
		// 例如: mod config;
		const modRegex = /mod\s+([a-zA-Z0-9_]+);/g
		while ((match = modRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		// 提取extern crate声明
		// 例如: extern crate serde;
		const externCrateRegex = /extern\s+crate\s+([a-zA-Z0-9_]+);/g
		while ((match = externCrateRegex.exec(content)) !== null) {
			if (match[1]) {
				importPaths.push(match[1])
			}
		}

		return importPaths
	}

	/**
	 * 解析Rust导入路径为绝对文件路径
	 */
	private async resolveRustImport(importPath: string, sourceFile: string): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)
			const projectRoot = this.findCargoTomlDir(sourceDir)

			// 处理标准库引用
			if (importPath === "std" || importPath.startsWith("std::")) {
				return null // 标准库不需要解析为实际路径
			}

			// 处理crate内部模块引用
			if (importPath === "crate" || importPath.startsWith("crate::")) {
				// 去掉crate::前缀
				const modulePath = importPath.replace(/^crate::?/, "")
				if (!modulePath) return null

				// 尝试在src目录下查找相应的模块文件
				if (projectRoot) {
					const srcDir = join(projectRoot, "src")
					const possiblePaths = [
						join(srcDir, `${modulePath.replace(/::/g, "/")}.rs`),
						join(srcDir, modulePath.replace(/::/g, "/"), "mod.rs"),
					]

					for (const path of possiblePaths) {
						try {
							await fs.access(path)
							return path
						} catch (e) {
							// 文件不存在，继续尝试
						}
					}
				}
			}

			// 处理mod声明引用
			if (!importPath.includes("::")) {
				// 查找方式1：同目录下的{mod_name}.rs
				const modFile = join(sourceDir, `${importPath}.rs`)
				try {
					await fs.access(modFile)
					return modFile
				} catch (e) {
					// 文件不存在，继续尝试
				}

				// 查找方式2：子目录中的mod.rs
				const modDirFile = join(sourceDir, importPath, "mod.rs")
				try {
					await fs.access(modDirFile)
					return modDirFile
				} catch (e) {
					// 文件不存在，继续尝试
				}
			}

			// 对于外部crate的引用，我们无法解析到实际路径
			// 在真实环境中，这需要查找Cargo.lock和依赖目录
			return null
		} catch (error) {
			console.error(`Error resolving Rust import: ${importPath}`, error)
			return null
		}
	}

	/**
	 * 查找Cargo.toml文件所在目录
	 */
	private findCargoTomlDir(startDir: string): string | null {
		try {
			let currentDir = startDir
			const maxDepth = 10 // 防止无限循环

			for (let i = 0; i < maxDepth; i++) {
				const cargoPath = join(currentDir, "Cargo.toml")

				if (existsSync(cargoPath)) {
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
			console.error("Error finding Cargo.toml:", error)
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
