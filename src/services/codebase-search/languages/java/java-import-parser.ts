import { join, dirname, resolve } from "../../../../utils/path"
import * as fs from "fs/promises"
import { glob } from "glob"
import { ImportParser } from "../../types"
import { CodebaseTreeSitterService } from "../../tree-sitter-service"

/**
 * Java导入解析器
 */
export class JavaImportParser implements ImportParser {
	private treeService: CodebaseTreeSitterService

	constructor(treeService: CodebaseTreeSitterService) {
		this.treeService = treeService
	}

	/**
	 * 获取Java文件中的直接导入
	 * @param filePath 文件路径
	 * @returns 导入的文件路径数组
	 */
	async getDirectImports(filePath: string): Promise<string[]> {
		try {
			// 读取文件内容
			const content = await this.readFileContent(filePath)

			// 提取导入语句
			const importPaths = this.extractImportPaths(content)

			// 同时提取当前文件的包名，用于解析内部类
			const packageName = this.extractPackageName(content)

			// 解析所有导入路径
			const resolvedPaths: string[] = []
			for (const importPath of importPaths) {
				const resolvedPath = await this.resolveJavaImport(importPath, filePath, packageName)
				if (resolvedPath) {
					resolvedPaths.push(resolvedPath)
				}
			}

			return resolvedPaths
		} catch (error) {
			console.error(`Error parsing Java imports for ${filePath}:`, error)
			return []
		}
	}

	/**
	 * 从Java文件内容中提取导入路径
	 */
	private extractImportPaths(content: string): string[] {
		const importPaths: string[] = []

		// 匹配import语句: import java.util.List;
		const importRegex = /import\s+([\w.]+);/g
		let match

		const contentLines = content.split("\n")
		for (let i = 0; i < contentLines.length; i++) {
			const line = contentLines[i].trim()
			// 忽略注释行
			if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
				continue
			}

			// 匹配导入语句
			const importRegex = /import\s+([\w.]+);/
			const match = line.match(importRegex)
			if (match && match[1]) {
				importPaths.push(match[1])
			}

			// 匹配静态导入: import static com.example.Utils.helper;
			const staticImportRegex = /import\s+static\s+([\w.]+);/
			const staticMatch = line.match(staticImportRegex)
			if (staticMatch && staticMatch[1]) {
				importPaths.push(staticMatch[1])
			}

			// 匹配星号导入: import java.util.*;
			const wildcardImportRegex = /import\s+([\w.]+)\.\*;/
			const wildcardMatch = line.match(wildcardImportRegex)
			if (wildcardMatch && wildcardMatch[1]) {
				importPaths.push(wildcardMatch[1] + ".*")
			}
		}

		return importPaths
	}

	/**
	 * 从Java文件中提取包名
	 */
	private extractPackageName(content: string): string {
		// 匹配包声明: package com.example.app;
		const packageRegex = /package\s+([\w.]+);/
		const match = content.match(packageRegex)
		return match ? match[1] : ""
	}

	/**
	 * 解析Java导入路径为绝对文件路径
	 */
	private async resolveJavaImport(
		importPath: string,
		sourceFile: string,
		currentPackage: string = "",
	): Promise<string | null> {
		try {
			const sourceDir = dirname(sourceFile)
			const projectRoot = this.findProjectRoot(sourceDir)

			// 检查是否是内部类导入
			// 内部类形式：OuterClass.InnerClass
			const innerClassMatch = importPath.match(/^(.+)\.([A-Z][a-zA-Z0-9_]*)$/)
			if (innerClassMatch && /[A-Z]/.test(innerClassMatch[2][0])) {
				// 可能是内部类引用，先尝试解析外部类
				const outerClassPath = innerClassMatch[1]
				const outerClassFilePath = await this.resolveJavaImport(outerClassPath, sourceFile, currentPackage)
				if (outerClassFilePath) {
					return outerClassFilePath
				}
			}

			// 移除星号通配符
			const normalizedImport = importPath.replace(/\.\*$/, "")

			// 将包路径转换为文件路径 (com.example.Class -> com/example/Class.java)
			const relativeFilePath = normalizedImport.replace(/\./g, "/") + ".java"

			// 尝试在项目源代码目录中查找
			// 常见的Java源码目录结构
			const sourceRoots = ["src/main/java", "src", "java"]

			for (const srcRoot of sourceRoots) {
				const candidatePath = join(projectRoot || sourceDir, srcRoot, relativeFilePath)
				try {
					const stats = await fs.stat(candidatePath)
					if (stats.isFile()) {
						return candidatePath
					}
				} catch (e) {
					// 文件不存在，继续尝试
				}
			}

			// 处理同包引用
			// 如果导入没有包名前缀，且当前文件有包名，尝试在同包下查找
			if (!importPath.includes(".") && currentPackage) {
				const samePkgImportPath = currentPackage + "." + importPath
				return this.resolveJavaImport(samePkgImportPath, sourceFile)
			}

			// 无法解析为具体文件
			return null
		} catch (error) {
			console.error(`Error resolving Java import ${importPath} from ${sourceFile}:`, error)
			return null
		}
	}

	/**
	 * 查找Java项目根目录
	 * 通常是包含pom.xml, build.gradle等文件的目录
	 */
	private findProjectRoot(startDir: string): string | null {
		const fs = require("fs")
		const path = require("path")

		let currentDir = startDir
		// 向上搜索最多10层目录
		for (let i = 0; i < 10; i++) {
			// 检查是否存在项目标志文件
			if (
				fs.existsSync(join(currentDir, "pom.xml")) ||
				fs.existsSync(join(currentDir, "build.gradle")) ||
				fs.existsSync(join(currentDir, ".git"))
			) {
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
			console.error(`Error reading file ${filePath}:`, error)
			return ""
		}
	}
}
