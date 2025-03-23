/**
 * 符号处理器
 * 负责处理Tree-sitter查询结果并提取符号信息
 */
import Parser from "web-tree-sitter"
import { SymbolDefinition, SymbolReference, ImportStatement, ProcessedSymbols } from "./types"

/**
 * 处理Tree-sitter查询结果，提取定义、引用和文档注释
 */
export function processQueryResults(
	captures: Parser.QueryCapture[],
	content: string,
	filePath: string,
): ProcessedSymbols {
	const lines = content.split("\n")
	const definitions: SymbolDefinition[] = []
	const references: SymbolReference[] = []
	const imports: ImportStatement[] = []
	const docComments = new Map<string, string>()

	// 1. 第一轮：收集文档注释和定义
	for (const capture of captures) {
		const { node, name } = capture

		// 处理文档注释
		if (name.includes("doc")) {
			const docText = getNodeText(node, content)
			docComments.set(getNodeId(node), formatDocComment(docText))
			continue
		}

		// 处理定义
		if (name.includes("definition")) {
			try {
				// 查找定义的名称节点
				const parentNode = node
				// @ts-ignore SyntaxNode has a childCount property, but TS doesn't know about it
				if (parentNode && parentNode.childCount > 0) {
					// 查找与capture name匹配的name节点
					const nameMatches = captures.filter(
						(c) => c.name.includes("name") && c.name.includes(name.split("definition")[1]),
					)
					const nameNode = nameMatches.find((m) => {
						// 安全检查，确保node.parent不为null
						const parentOfNode = m.node.parent
						return parentOfNode && parentNode.equals(parentOfNode)
					})?.node

					if (nameNode) {
						const definition = createDefinition(nameNode, parentNode, name, content, lines, filePath)
						definitions.push(definition)
					}
				}
			} catch (error) {
				console.error("解析定义时出错:", error)
			}
		}
	}

	// 2. 第二轮：处理引用和导入，尝试关联到定义
	for (const capture of captures) {
		const { node, name } = capture

		// 处理引用
		if (name.includes("reference")) {
			try {
				const reference = createReference(node, name, content, filePath)

				// 尝试确定引用的命名空间和父级
				reference.namespace = determineNamespace(node, captures, content)
				reference.parent = determineParent(node, captures, content)

				// 排除已知的定义
				const isDef = definitions.some(
					(def) =>
						def.name === reference.name &&
						def.location.line === reference.location.line &&
						def.location.column === reference.location.column,
				)
				if (!isDef) {
					references.push(reference)
				}
			} catch (error) {
				console.error("解析引用时出错:", error)
			}
		}

		// 处理导入
		if (name.includes("import")) {
			if (name === "import.source") {
				try {
					const importStmt = createImportStatement(node, captures, content, filePath)
					if (importStmt) {
						imports.push(importStmt)
					}
				} catch (error) {
					console.error("解析导入时出错:", error)
				}
			}
		}
	}

	// 3. 建立定义和文档注释的关联
	for (const definition of definitions) {
		if (definition.documentation) continue // 已经有文档了

		// 查找可能的文档注释
		for (const [nodeId, docText] of docComments.entries()) {
			const [line, col] = nodeId.split(":").map(Number)
			// 如果文档注释在定义之前且距离不超过3行，则关联
			if (line < definition.location.line && definition.location.line - line <= 3) {
				definition.documentation = docText
				break
			}
		}
	}

	return { definitions, references, imports, docComments }
}

/**
 * 确定节点所属的命名空间
 * 例如：对于 a.b.c，确定命名空间为 a.b
 */
function determineNamespace(
	node: Parser.SyntaxNode,
	captures: Parser.QueryCapture[],
	content: string,
): string | undefined {
	// 对于属性访问，尝试找到对象部分
	if (node.type === "property_identifier" || node.type === "identifier") {
		let current = node.parent

		// 处理TypeScript/JavaScript的情况
		if (current?.type === "member_expression") {
			// 递归查找完整路径，例如 a.b.c
			const parts: string[] = []
			let memberExp: Parser.SyntaxNode | null = current

			while (memberExp && memberExp.type === "member_expression") {
				// 获取对象部分 (a.b中的a)
				const objectNode = memberExp.childForFieldName("object")
				if (objectNode && objectNode.type === "identifier") {
					parts.unshift(getNodeText(objectNode, content))
				}
				// 安全地更新memberExp
				memberExp = memberExp.parent
			}

			if (parts.length > 0) {
				return parts.join(".")
			}
		}

		// 处理Python的情况
		if (current?.type === "attribute") {
			const valueNode = current.childForFieldName("value")
			if (valueNode) {
				return getNodeText(valueNode, content)
			}
		}
	}

	return undefined
}

/**
 * 确定节点的父级（例如类名或模块名）
 */
function determineParent(
	node: Parser.SyntaxNode,
	captures: Parser.QueryCapture[],
	content: string,
): string | undefined {
	// 向上查找父节点
	let current = node.parent
	while (current) {
		// 检查是否在类定义内
		if (current.type === "class_declaration" || current.type === "class_definition") {
			// 查找类名
			const classNameNode = current.childForFieldName("name")
			if (classNameNode) {
				return getNodeText(classNameNode, content)
			}
		}

		// 检查是否在方法定义内
		if (
			current.type === "method_definition" ||
			(current.type === "function_definition" && current.parent?.parent?.type === "class_definition")
		) {
			// 继续向上查找类
			let classNode = current.parent
			while (classNode && classNode.type !== "class_declaration" && classNode.type !== "class_definition") {
				classNode = classNode.parent
			}

			if (classNode) {
				const classNameNode = classNode.childForFieldName("name")
				if (classNameNode) {
					return getNodeText(classNameNode, content)
				}
			}
		}

		current = current.parent
	}

	return undefined
}

/**
 * 创建符号定义对象
 */
function createDefinition(
	nameNode: Parser.SyntaxNode,
	definitionNode: Parser.SyntaxNode,
	captureName: string,
	content: string,
	lines: string[],
	filePath: string,
): SymbolDefinition {
	// 提取符号类型
	let type = "unknown"
	if (captureName.includes("function")) {
		type = "function"
	} else if (captureName.includes("method")) {
		type = "method"
	} else if (captureName.includes("class")) {
		type = "class"
	} else if (captureName.includes("variable")) {
		type = "variable"
	} else if (captureName.includes("interface")) {
		type = "interface"
	} else if (captureName.includes("module")) {
		type = "module"
	} else if (captureName.includes("type")) {
		type = "type"
	}

	// 获取符号名称
	const name = getNodeText(nameNode, content)

	// 尝试获取父级符号名称
	const parent = getParentSymbol(definitionNode, nameNode, content)

	// 获取符号所在行内容
	const lineContent = lines[nameNode.startPosition.row] || ""

	return {
		name,
		type,
		location: {
			file: filePath,
			line: nameNode.startPosition.row + 1, // 转为1-indexed
			column: nameNode.startPosition.column,
		},
		parent,
		content: lineContent,
	}
}

/**
 * 创建符号引用对象
 */
function createReference(
	node: Parser.SyntaxNode,
	captureName: string,
	content: string,
	filePath: string,
): SymbolReference {
	const name = getNodeText(node, content)

	// 确定引用类型和命名空间
	let namespace = undefined
	let parent = undefined

	// 尝试获取命名空间/父级信息
	if (captureName.includes("property")) {
		// 属性访问，如 obj.prop
		const objNode = node.parent?.childForFieldName("object")
		if (objNode) {
			parent = getNodeText(objNode, content)
		}
	}

	return {
		name,
		location: {
			file: filePath,
			line: node.startPosition.row + 1, // 转为1-indexed
			column: node.startPosition.column,
		},
		isDefinition: false,
		namespace,
		parent,
	}
}

/**
 * 创建导入语句对象
 */
function createImportStatement(
	sourceNode: Parser.SyntaxNode,
	captures: Parser.QueryCapture[],
	content: string,
	filePath: string,
): ImportStatement | null {
	const source = getNodeText(sourceNode, content)
	if (!source) return null

	// 清除引号
	const cleanedSource = source.replace(/['"`]/g, "")

	// 查找同一导入语句中的导入名称
	const importParent = sourceNode.parent
	const names: string[] = []

	if (importParent) {
		// 搜索所有与此导入相关的名称
		for (const capture of captures) {
			if (capture.name === "import.name") {
				// 检查是否是当前导入的一部分
				let current: Parser.SyntaxNode | null = capture.node.parent
				while (current) {
					if (current.id === importParent.id) {
						const name = getNodeText(capture.node, content)
						if (name) names.push(name)
						break
					}
					current = current.parent
				}
			}
		}
	}

	return {
		source: cleanedSource,
		names,
		location: {
			file: filePath,
			line: sourceNode.startPosition.row + 1,
			column: sourceNode.startPosition.column,
		},
	}
}

/**
 * 获取节点文本内容
 */
function getNodeText(node: Parser.SyntaxNode, content: string): string {
	return content.substring(node.startIndex, node.endIndex)
}

/**
 * 获取节点唯一标识符
 */
function getNodeId(node: Parser.SyntaxNode): string {
	return `${node.startPosition.row}:${node.startPosition.column}`
}

/**
 * 获取父级符号名称
 */
function getParentSymbol(
	definitionNode: Parser.SyntaxNode,
	nameNode: Parser.SyntaxNode,
	content: string,
): string | undefined {
	// 根据节点类型确定父级
	const parent = definitionNode.parent
	if (!parent) return undefined

	// 类方法的父级是类
	if (definitionNode.type === "method_definition" || definitionNode.type === "method_declaration") {
		// 向上查找 class_declaration
		let current: Parser.SyntaxNode | null = parent
		while (current) {
			if (
				current.type === "class_declaration" ||
				current.type === "class_definition" ||
				current.type === "class_body"
			) {
				// 找到类后，查找其名称
				const classNameNode = current.childForFieldName("name") || current.parent?.childForFieldName("name")
				if (classNameNode) {
					return getNodeText(classNameNode, content)
				}
			}
			current = current.parent
		}
	}

	// 类属性的父级是类
	if (definitionNode.type === "field_definition" || definitionNode.type === "property_definition") {
		let current: Parser.SyntaxNode | null = parent
		while (current) {
			if (
				current.type === "class_declaration" ||
				current.type === "class_definition" ||
				current.type === "class_body"
			) {
				const classNameNode = current.childForFieldName("name") || current.parent?.childForFieldName("name")
				if (classNameNode) {
					return getNodeText(classNameNode, content)
				}
			}
			current = current.parent
		}
	}

	// 命名空间成员的父级是命名空间
	if (definitionNode.type === "function_declaration" || definitionNode.type === "variable_declaration") {
		let current: Parser.SyntaxNode | null = parent
		while (current) {
			if (current.type === "namespace_declaration") {
				const namespaceNameNode = current.childForFieldName("name")
				if (namespaceNameNode) {
					return getNodeText(namespaceNameNode, content)
				}
			}
			current = current.parent
		}
	}

	return undefined
}

/**
 * 格式化文档注释
 */
function formatDocComment(comment: string): string {
	// 移除注释标记
	return comment
		.replace(/^\/\*\*|\*\/$/g, "") // 移除开头的 /** 和结尾的 */
		.replace(/^\s*\*\s?/gm, "") // 移除每行开头的 *
		.replace(/^#\s?/gm, "") // 移除Python文档注释的 #
		.replace(/^\/\/\s?/gm, "") // 移除单行注释的 //
		.trim()
}
