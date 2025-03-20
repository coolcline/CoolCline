import * as vscode from "vscode"
import { toPosixPath, join } from "../../utils/path"

/**
 * 存储扩展上下文的引用
 */
let extensionContext: vscode.ExtensionContext | undefined

/**
 * 设置扩展上下文
 * @param context - VSCode 扩展上下文
 */
export function setExtensionContext(context: vscode.ExtensionContext) {
	extensionContext = context
}

/**
 * 获取扩展上下文
 * @returns VSCode 扩展上下文，如果未初始化则返回 undefined
 */
export function getExtensionContext(): vscode.ExtensionContext | undefined {
	return extensionContext
}

/**
 * 获取扩展的全局存储路径
 * @returns 全局存储路径
 * @throws 如果扩展上下文未初始化，则抛出错误
 */
export function getGlobalStoragePath(): string {
	if (!extensionContext) {
		throw new Error("扩展上下文未初始化，无法获取全局存储路径")
	}
	return toPosixPath(extensionContext.globalStorageUri.fsPath)
}

/**
 * 获取扩展的全局存储中的特定路径
 * @param subPath 子路径
 * @returns 完整路径
 */
export function getGlobalStorageSubPath(subPath: string): string {
	const basePath = getGlobalStoragePath()
	return toPosixPath(join(basePath, subPath))
}
