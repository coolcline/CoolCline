import * as fs from "fs"
import { Database } from "./database"
import { IndexOptions } from "./types"
import { toPosixPath, arePathsEqual, extname, join, relative } from "../../utils/path"

interface FileRecord {
	path: string
	last_modified: number
	isTestFile?: boolean
}

interface ScanState {
	dirQueue: { path: string; isIncluded: boolean }[]
	files: string[]
	excludeDirs: string[]
}

/**
 * 增量索引实现
 */
export class IncrementalIndexer {
	private scanState: ScanState | null = null

	constructor(private db: Database) {}

	/**
	 * 执行增量索引
	 * @param workspacePath 工作区路径
	 * @param options 索引选项
	 */
	public async executeIncrementalIndex(workspacePath: string, options?: IndexOptions): Promise<FileRecord[]> {
		// 扫描工作区文件
		const files = await this.scanWorkspace(workspacePath, options)

		// 读取现有文件记录到内存
		const memoryTable = await this.buildMemoryTable(files, options)

		// 获取数据库中现有记录
		const dbFiles = await this.db.all("SELECT path, content_hash, last_modified FROM files")
		const dbFileMap = new Map(dbFiles.map((f) => [f.path, f]))

		// 找出需要删除的文件
		const filesToDelete = this.findFilesToDelete(dbFiles, memoryTable)
		// 找出更新的文件
		const filesToUpdate = await this.findFilesToUpdate(memoryTable, dbFileMap)

		// 使用removeFilesFromIndex方法批量删除不再存在的文件
		if (filesToDelete.length > 0) {
			// 导入removeFilesFromIndex函数
			const { removeFilesFromIndex } = await import("./removeFileFromIndex")
			await removeFilesFromIndex(this.db, filesToDelete)
		}

		// 插入新文件到数据库
		const newFiles = filesToUpdate.filter((file) => !dbFileMap.has(file.path))
		await this.insertNewFiles(newFiles)

		// 返回需要更新的文件列表
		return filesToUpdate
	}

	/**
	 * 构建内存表
	 * @param files 文件列表
	 * @param options 索引选项
	 */
	private async buildMemoryTable(files: string[], options?: IndexOptions): Promise<FileRecord[]> {
		const memoryTable: FileRecord[] = []

		for (const file of files) {
			try {
				const stats = fs.statSync(file)
				memoryTable.push({
					path: toPosixPath(file),
					last_modified: stats.mtimeMs,
					isTestFile: this.isTestFile(file),
				})
			} catch (error) {
				console.warn(`无法获取文件状态: ${file}`, error)
			}
		}

		// 过滤掉测试文件(如果 includeTests 为 false)
		return memoryTable.filter((file) => {
			if (!options?.includeTests && file.isTestFile) {
				return false
			}
			return true
		})
	}

	/**
	 * 扫描工作区文件
	 * @param workspacePath 工作区路径
	 * @param options 索引选项
	 */
	private async scanWorkspace(workspacePath: string, options?: IndexOptions): Promise<string[]> {
		const files: string[] = []

		// 检查工作区路径是否存在
		if (!fs.existsSync(workspacePath)) {
			return []
		}

		// 如果没有指定包含路径，使用默认值
		const includes =
			options?.includePaths && options.includePaths.length > 0 ? options.includePaths : ["src", "lib", "app"]

		// 默认排除的目录
		const excludeDirs =
			options?.excludePaths && options.excludePaths.length > 0
				? options.excludePaths
				: [
						// 包管理器目录
						"node_modules",
						"bower_components",
						"vendor",
						"packages",
						// 版本控制目录
						".git",
						".svn",
						".hg",
						".bzr",
						// 输出和构建目录
						"dist",
						"build",
						"out",
						"bin",
						"target",
						"output",
						"compiled",
						"deploy",
						"release",
						"debug",
						"publish",
						// 临时和缓存目录
						"tmp",
						"temp",
						"cache",
						".cache",
						".npm",
						".yarn",
						// IDE和编辑器目录
						".idea",
						".vscode",
						".vs",
						"__pycache__",
						// 文档目录
						"docs",
						"example",
						"examples",
					]

		// 准备要扫描的目录队列
		const dirQueue: { path: string; isIncluded: boolean }[] = []

		// 首先添加包含目录
		for (const dir of includes) {
			const dirPath = join(workspacePath, dir)
			if (fs.existsSync(dirPath)) {
				dirQueue.push({ path: dirPath, isIncluded: true })
			}
		}

		// 如果没有找到包含目录，添加工作区根目录
		if (dirQueue.length === 0) {
			dirQueue.push({ path: workspacePath, isIncluded: false })
		}

		// 保存扫描状态以支持恢复
		this.scanState = {
			dirQueue,
			files,
			excludeDirs,
		}

		// 异步批处理扫描目录
		while (dirQueue.length > 0) {
			// 定期让出控制权，避免阻塞主线程
			if (dirQueue.length % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0))
			}

			// 处理当前目录
			const { path: currentDir, isIncluded } = dirQueue.shift()!

			try {
				// 分批读取目录内容
				const entries = fs.readdirSync(currentDir, { withFileTypes: true })

				// 处理当前目录中的每个条目
				for (const entry of entries) {
					const fullPath = join(currentDir, entry.name)
					const relativePath = toPosixPath(relative(workspacePath, fullPath))

					// 检查是否应该排除
					const shouldExclude = excludeDirs.some(
						(exclude) =>
							relativePath === exclude ||
							relativePath.startsWith(`${exclude}/`) ||
							relativePath.includes(`/${exclude}/`),
					)

					if (shouldExclude) {
						continue
					}

					if (entry.isDirectory()) {
						// 将子目录添加到队列
						dirQueue.push({ path: fullPath, isIncluded })
					} else if (entry.isFile() && this.shouldIndexFile(fullPath)) {
						files.push(toPosixPath(fullPath))
					}
				}
			} catch (error) {
				console.warn(`无法读取目录 ${currentDir}:`, error)
			}
		}

		// 清除扫描状态
		this.scanState = null

		return files
	}

	/**
	 * 找出需要删除的文件
	 * @param dbFiles 数据库中的文件记录
	 * @param memoryTable 内存表
	 */
	private findFilesToDelete(dbFiles: any[], memoryTable: FileRecord[]): string[] {
		const memoryPaths = new Set(memoryTable.map((f) => f.path))
		return dbFiles.map((f) => f.path).filter((path) => !memoryPaths.has(path))
	}

	/**
	 * 找出需要更新的文件
	 * @param memoryTable 内存表
	 * @param dbFileMap 数据库文件map
	 */
	private async findFilesToUpdate(memoryTable: FileRecord[], dbFileMap: Map<string, any>): Promise<FileRecord[]> {
		const filesToUpdate: FileRecord[] = []

		for (const file of memoryTable) {
			const dbFile = dbFileMap.get(file.path)

			if (!dbFile) {
				// 新文件，需要索引
				filesToUpdate.push(file)
			} else if (file.last_modified > dbFile.content_hash) {
				// 文件已修改，需要重新索引
				filesToUpdate.push(file)
			}
		}

		return filesToUpdate
	}

	/**
	 * 将新文件插入到数据库
	 * @param files 新文件列表
	 */
	private async insertNewFiles(files: FileRecord[]): Promise<void> {
		if (files.length === 0) return

		await this.db.run(
			`INSERT OR IGNORE INTO files (path, language, last_modified, indexed_at, content_hash) VALUES ${files.map(() => "(?, ?, ?, ?, ?)").join(",")}`,
			files.flatMap((file) => [file.path, this.detectLanguage(file.path), file.last_modified, 0, 0]),
		)
	}

	/**
	 * 更新文件的content_hash
	 * @param filePath 文件路径
	 * @param hash 新的hash值为内存表里的 file.last_modified时间，并且不用 hash 计算，保留字段名待 hash 是不想改表结构
	 */
	// public async updateContentHash(filePath: string, hash: string): Promise<void> {
	//   await this.db.run(
	//     "UPDATE files SET content_hash = ? WHERE path = ?",
	//     [hash, toPosixPath(filePath)]
	//   )
	// }

	/**
	 * 判断是否为测试文件
	 * @param filePath 文件路径
	 */
	private isTestFile(filePath: string): boolean {
		const testDirs = ["test", "tests", "spec", "coverage", "__tests__", "__test__", "__mocks__"]
		const normalizedPath = toPosixPath(filePath)
		return testDirs.some((dir) => normalizedPath.includes(`/${dir}/`) || normalizedPath.startsWith(`${dir}/`))
	}

	/**
	 * 检查文件是否应该被索引
	 * @param filePath 文件路径
	 */
	private shouldIndexFile(filePath: string): boolean {
		// 系统和二进制文件扩展名
		const excludeExtensions = [
			// 系统文件
			".DS_Store",
			".Thumbs.db",
			".desktop.ini",
			// 二进制文件
			".exe",
			".dll",
			".so",
			".dylib",
			".class",
			".o",
			".obj",
			// 压缩文件
			".zip",
			".tar",
			".gz",
			".rar",
			".7z",
			// 媒体文件
			".jpg",
			".jpeg",
			".png",
			".gif",
			".bmp",
			".svg",
			".mp3",
			".wav",
			".ogg",
			".mp4",
			".avi",
			".mov",
			// 字体文件
			".ttf",
			".otf",
			".woff",
			".woff2",
			".eot",
			// 编译输出
			".min.js",
			".min.css",
			".map",
			// 其他二进制和文档
			".pdf",
			".doc",
			".docx",
			".xls",
			".xlsx",
			".ppt",
			".pptx",
			".psd",
			".ai",
			".sketch",
			".fig",
		]

		const ext = toPosixPath(filePath).split(".").pop()?.toLowerCase() || ""
		return !excludeExtensions.includes(`.${ext}`)
	}

	/**
	 * 检测文件语言
	 * @param filePath 文件路径
	 * @returns 文件语言
	 * @private
	 */
	private detectLanguage(filePath: string): string {
		const ext = extname(filePath).toLowerCase()

		// 扩展的文件类型到语言映射
		const languageMap: Record<string, string> = {
			// TypeScript
			".ts": "typescript",
			".tsx": "typescript",
			".mts": "typescript",
			".cts": "typescript",
			// JavaScript
			".js": "javascript",
			".jsx": "javascript",
			".mjs": "javascript",
			".cjs": "javascript",
			// Python
			".py": "python",
			".pyi": "python",
			".pyw": "python",
			".pyx": "python",
			// Ruby
			".rb": "ruby",
			".rbw": "ruby",
			".rake": "ruby",
			// Go
			".go": "go",
			// Java
			".java": "java",
			".class": "java",
			".jar": "java",
			// C/C++
			".c": "c",
			".h": "c",
			".cpp": "cpp",
			".cc": "cpp",
			".cxx": "cpp",
			".hpp": "cpp",
			".hxx": "cpp",
			// C#
			".cs": "csharp",
			".csx": "csharp",
			// PHP
			".php": "php",
			".phtml": "php",
			// Rust
			".rs": "rust",
			// Swift
			".swift": "swift",
			// Kotlin
			".kt": "kotlin",
			".kts": "kotlin",
			// Web
			".html": "html",
			".htm": "html",
			".css": "css",
			".scss": "css",
			".sass": "css",
			".less": "css",
			// Data
			".json": "json",
			".yaml": "yaml",
			".yml": "yaml",
			".toml": "toml",
			".xml": "xml",
			".csv": "csv",
			// Shell
			".sh": "shell",
			".bash": "shell",
			".zsh": "shell",
			// Markdown
			".md": "markdown",
			".markdown": "markdown",
			// Config
			".ini": "ini",
			".conf": "ini",
			".config": "ini",
		}

		return languageMap[ext] || "plaintext"
	}
}
