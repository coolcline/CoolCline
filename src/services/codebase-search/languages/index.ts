/**
 * 代码库搜索语言支持模块
 * 统一导出所有语言支持
 */

// TypeScript/JavaScript支持
export * from "./typescript"

// Python支持
export * from "./python"

// Java支持
export * from "./java"

// C#支持
export * from "./csharp"

// PHP支持
export * from "./php"

// Go支持
export * from "./go"

// Ruby支持
export * from "./ruby"

// C/C++支持
export * from "./cpp"

// Rust支持
export * from "./rust"

// Swift支持
export * from "./swift"

// Kotlin支持
export * from "./kotlin"

// 语言工厂和工具函数
import { CodebaseTreeSitterService } from "../tree-sitter-service"
import { ImportParser } from "../types"
import { TypeScriptImportParser } from "./typescript"
import { PythonImportParser } from "./python"
import { JavaImportParser } from "./java"
import { CSharpImportParser } from "./csharp"
import { PHPImportParser } from "./php"
import { GoImportParser } from "./go"
import { RubyImportParser } from "./ruby"
import { CPPImportParser } from "./cpp"
import { RustImportParser } from "./rust"
import { SwiftImportParser } from "./swift"
import { KotlinImportParser } from "./kotlin"

/**
 * 根据语言ID创建适当的导入解析器
 * @param languageId 语言ID（如typescript, python等）
 * @param treeService Tree-sitter服务实例
 * @returns 对应语言的导入解析器
 */
export function createImportParser(languageId: string, treeService: CodebaseTreeSitterService): ImportParser {
	switch (languageId) {
		case "typescript":
		case "javascript":
			return new TypeScriptImportParser(treeService)
		case "python":
			return new PythonImportParser(treeService)
		case "java":
			return new JavaImportParser(treeService)
		case "csharp":
			return new CSharpImportParser(treeService)
		case "php":
			return new PHPImportParser(treeService)
		case "go":
			return new GoImportParser(treeService)
		case "ruby":
			return new RubyImportParser(treeService)
		case "cpp":
		case "c":
			return new CPPImportParser(treeService)
		case "rust":
			return new RustImportParser(treeService)
		case "swift":
			return new SwiftImportParser(treeService)
		case "kotlin":
			return new KotlinImportParser(treeService)
		default:
			throw new Error(`不支持的语言: ${languageId}`)
	}
}

/**
 * 根据文件扩展名获取语言ID
 * @param ext 文件扩展名（包括点，如.ts, .py）
 * @returns 语言ID
 */
export function getLanguageIdFromFileExtension(ext: string): string {
	const extension = ext.toLowerCase()
	switch (extension) {
		case ".ts":
		case ".tsx":
			return "typescript"
		case ".js":
		case ".jsx":
			return "javascript"
		case ".py":
			return "python"
		case ".java":
			return "java"
		case ".cs":
			return "csharp"
		case ".php":
			return "php"
		case ".go":
			return "go"
		case ".rb":
			return "ruby"
		case ".c":
		case ".cpp":
		case ".cc":
		case ".h":
		case ".hpp":
			return "cpp"
		case ".rs":
			return "rust"
		case ".swift":
			return "swift"
		case ".kt":
		case ".kts":
			return "kotlin"
		default:
			return "unknown"
	}
}

/**
 * 根据语言ID获取文件扩展名
 * @param languageId 语言ID (如typescript, python等)
 * @returns 文件扩展名 (带点，如.ts, .py)
 */
export function getExtensionForLanguage(languageId: string): string {
	const lang = languageId.toLowerCase()
	switch (lang) {
		case "typescript":
			return ".ts"
		case "javascript":
			return ".js"
		case "python":
			return ".py"
		case "java":
			return ".java"
		case "csharp":
			return ".cs"
		case "php":
			return ".php"
		case "go":
			return ".go"
		case "ruby":
			return ".rb"
		case "cpp":
			return ".cpp"
		case "c":
			return ".c"
		case "rust":
			return ".rs"
		case "swift":
			return ".swift"
		case "kotlin":
			return ".kt"
		default:
			return ""
	}
}
