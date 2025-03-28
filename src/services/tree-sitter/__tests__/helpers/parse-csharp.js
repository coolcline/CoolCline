const Parser = require("web-tree-sitter")
const fs = require("fs")
const path = require("path")

// 直接定义查询字符串，避免导入问题
const csharpQuery = `
; 基本标识符和类型
(identifier) @definition

; 方法调用
(invocation_expression) @call

; 使用声明 - 匹配所有形式
(using_directive (identifier) @using)
(using_directive (qualified_name (identifier) @using))
(using_directive (qualified_name (qualified_name (identifier) @using)))

; 接口声明
(interface_declaration 
  name: (identifier) @interface
)

; 嵌套接口
; 其他查询规则...
(comment) @comment
`

async function main() {
	try {
		await Parser.init()
		const parser = new Parser()

		const wasmPath = path.join(
			__dirname,
			"../../../../../node_modules/tree-sitter-wasms/out/tree-sitter-c_sharp.wasm",
		)
		console.log("Loading WASM from:", wasmPath)

		const language = await Parser.Language.load(wasmPath)
		parser.setLanguage(language)

		// 创建查询对象
		const query = language.query(csharpQuery)
		const code = fs.readFileSync(path.join(__dirname, "../fixtures/test.cs"), "utf8")
		const tree = parser.parse(code)

		// 使用查询对象捕获所有节点
		const captures = query.captures(tree.rootNode)
		const groupedCaptures = {}

		captures.forEach((capture) => {
			if (!groupedCaptures[capture.name]) {
				groupedCaptures[capture.name] = []
			}
			groupedCaptures[capture.name].push(capture.node)
		})

		// 输出捕获结果
		console.log("\nCapture results:")
		Object.entries(groupedCaptures).forEach(([type, nodes]) => {
			console.log(`\n${type} (${nodes.length}):`)
			nodes.forEach((node, i) => {
				console.log(`  ${i + 1}. ${node.text}`)
				if (type === "interface") {
					console.log(`    Full node: ${node.toString()}`)
					console.log(`    Type: ${node.type}`)
					console.log(`    Parent: ${node.parent?.type || "N/A"}`)
					console.log(`    Is nested: ${node.parent?.type === "class_declaration"}`)
					const nameNode = node.childForFieldName("name")
					console.log(`    Name: ${nameNode?.text || "N/A"}`)
				}
			})
		})

		// 输出完整语法树
		console.log("\nFull syntax tree:")
		console.log(tree.rootNode.toString())
	} catch (error) {
		console.error("Error during parsing:", error)
	}
}

main().catch(console.error)
