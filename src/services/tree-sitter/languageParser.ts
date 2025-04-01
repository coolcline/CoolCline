import Parser from "web-tree-sitter"
import { toPosixPath } from "../../utils/path"
import { PathUtils } from "../checkpoints/CheckpointUtils"
import {
	javascriptQuery,
	typescriptQuery,
	pythonQuery,
	rustQuery,
	goQuery,
	cppQuery,
	cQuery,
	csharpQuery,
	rubyQuery,
	javaQuery,
	phpQuery,
	swiftQuery,
	kotlinQuery,
} from "./queries"

export interface LanguageParser {
	[key: string]: {
		parser: Parser
		query: Parser.Query
	}
}

/**
 * 缓存已加载的语言模块，避免重复加载同一个WASM文件
 * 这对于解决WebAssembly内存问题至关重要：
 * 1. 防止重复加载同一模块导致的内存浪费
 * 2. 维护模块引用的一致性，避免状态冲突
 * 3. 提供显式的模块生命周期管理
 */
let loadedLanguages = new Map<string, Parser.Language>()

/**
 * 加载指定语言的WASM模块
 * @param langName 语言名称
 * @param forceReload 是否强制重新加载，即使已经在缓存中
 * @returns 语言对象
 */
async function loadLanguage(langName: string, forceReload: boolean = false) {
	// 如果强制重新加载或缓存中没有，则从WASM文件加载
	if (forceReload || !loadedLanguages.has(langName)) {
		const wasmPath = toPosixPath(PathUtils.joinPath(__dirname, `tree-sitter-${langName}.wasm`))
		const language = await Parser.Language.load(wasmPath)

		// 更新缓存
		loadedLanguages.set(langName, language)
		return language
	}

	// 返回缓存的语言对象
	return loadedLanguages.get(langName)!
}

/**
 * 用于标记Parser是否已初始化
 */
let isParserInitialized = false

/**
 * 初始化Parser，只执行一次
 */
async function initializeParser() {
	if (!isParserInitialized) {
		await Parser.init()
		isParserInitialized = true
	}
}

/*
Using node bindings for tree-sitter is problematic in vscode extensions 
because of incompatibility with electron. Going the .wasm route has the 
advantage of not having to build for multiple architectures.

We use web-tree-sitter and tree-sitter-wasms which provides auto-updating prebuilt WASM binaries for tree-sitter's language parsers.

This function loads WASM modules for relevant language parsers based on input files:
1. Extracts unique file extensions
2. Maps extensions to language names
3. Loads corresponding WASM files (containing grammar rules)
4. Uses WASM modules to initialize tree-sitter parsers

This approach optimizes performance by loading only necessary parsers once for all relevant files.

Sources:
- https://github.com/tree-sitter/node-tree-sitter/issues/169
- https://github.com/tree-sitter/node-tree-sitter/issues/168
- https://github.com/Gregoor/tree-sitter-wasms/blob/main/README.md
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/test/query-test.js
*/
export async function loadRequiredLanguageParsers(filesToParse: string[]): Promise<LanguageParser> {
	await initializeParser()
	const extensionsToLoad = new Set(filesToParse.map((file) => PathUtils.extname(file).toLowerCase().slice(1)))
	const parsers: LanguageParser = {}
	for (const ext of extensionsToLoad) {
		let language: Parser.Language
		let query: Parser.Query

		try {
			switch (ext) {
				case "js":
				case "jsx":
					language = await loadLanguage("javascript")
					query = language.query(javascriptQuery)
					break
				case "ts":
					language = await loadLanguage("typescript")
					query = language.query(typescriptQuery)
					break
				case "tsx":
					language = await loadLanguage("tsx")
					query = language.query(typescriptQuery)
					break
				case "py":
					language = await loadLanguage("python")
					query = language.query(pythonQuery)
					break
				case "rs":
					language = await loadLanguage("rust")
					query = language.query(rustQuery)
					break
				case "go":
					language = await loadLanguage("go")
					query = language.query(goQuery)
					break
				case "cpp":
				case "hpp":
					language = await loadLanguage("cpp")
					query = language.query(cppQuery)
					break
				case "c":
				case "h":
					language = await loadLanguage("c")
					query = language.query(cQuery)
					break
				case "cs":
					language = await loadLanguage("c_sharp")
					query = language.query(csharpQuery)
					break
				case "rb":
					language = await loadLanguage("ruby")
					query = language.query(rubyQuery)
					break
				case "java":
					language = await loadLanguage("java")
					query = language.query(javaQuery)
					break
				case "php":
					language = await loadLanguage("php")
					query = language.query(phpQuery)
					break
				case "swift":
					language = await loadLanguage("swift")
					query = language.query(swiftQuery)
					break
				case "kt":
				case "kts":
					try {
						language = await loadLanguage("kotlin")
						query = language.query(kotlinQuery)
					} catch (error) {
						console.warn(`无法加载Kotlin解析器，跳过此文件类型: ${error.message}`)
						continue // 跳过当前循环迭代，不处理Kotlin文件
					}
					break
				default:
					throw new Error(`Unsupported language: ${ext}`)
			}

			const parser = new Parser()
			parser.setLanguage(language)
			parsers[ext] = { parser, query }
		} catch (error) {
			if (error instanceof Error && error.message.includes("Unsupported language")) {
				throw error
			}

			// 记录解析器加载错误信息
			console.warn(`加载语言解析器失败: ${ext}`, error)

			// 分析特定的WebAssembly错误
			if (error instanceof Error) {
				if (error.message.includes("Aborted") || error.message.includes("table index is out of bounds")) {
					console.error(`[Tree-sitter] 检测到WebAssembly内存问题: ${error.message}`)
					console.error(`[Tree-sitter] 这可能是由于处理大量文件导致的资源累积或内存泄漏`)

					// 尝试获取更多错误上下文
					console.error(`[Tree-sitter] 错误堆栈: ${error.stack || "无堆栈信息"}`)

					// 记录当前已处理的解析器数量
					console.error(`[Tree-sitter] 当前已加载 ${Object.keys(parsers).length} 个语言解析器`)

					try {
						const memoryUsage = process.memoryUsage()
						console.error(
							`[Tree-sitter] 错误发生时内存使用: RSS=${Math.round(memoryUsage.rss / 1024 / 1024)}MB, 堆总大小=${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB, 堆已用=${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
						)
					} catch (memErr) {
						console.error(`[Tree-sitter] 无法获取内存使用情况: ${memErr}`)
					}
				}
			}
		}
	}
	return parsers
}
