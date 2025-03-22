import * as vscode from "vscode"
import * as path from "path"

import * as fs from "fs"

// 创建临时目录作为存储路径
const tmpDir = path.join(__dirname, "../__tests__/test-storage")
if (!fs.existsSync(tmpDir)) {
	fs.mkdirSync(tmpDir, { recursive: true })
}

// 模拟扩展上下文
const mockExtensionContext: vscode.ExtensionContext = {
	subscriptions: [],
	workspaceState: {
		get: jest.fn(),
		update: jest.fn(),
		keys: jest.fn().mockReturnValue([]),
	} as any,
	globalState: {
		get: jest.fn(),
		update: jest.fn(),
		setKeysForSync: jest.fn(),
		keys: jest.fn().mockReturnValue([]),
	} as any,
	extensionPath: "/mock/extension/path",
	asAbsolutePath: (relativePath) => path.join("/mock/extension/path", relativePath),
	storagePath: tmpDir,
	globalStoragePath: tmpDir,
	logPath: tmpDir,
	extensionUri: {
		fsPath: "/mock/extension/path",
		scheme: "file",
	} as any,
	globalStorageUri: {
		fsPath: tmpDir,
		scheme: "file",
		path: tmpDir,
		with: jest.fn(),
		toString: () => tmpDir,
	} as any,
	logUri: {
		fsPath: tmpDir,
		scheme: "file",
	} as any,
	extensionMode: 3, // Test mode
	environmentVariableCollection: {} as any,
	storageUri: {
		fsPath: tmpDir,
		scheme: "file",
	} as any,
	extension: {} as any,
	secrets: {
		store: jest.fn().mockResolvedValue(undefined),
		get: jest.fn().mockResolvedValue(""),
		delete: jest.fn().mockResolvedValue(undefined),
		onDidChange: jest.fn(),
	},
	languageModelAccessInformation: {} as any,
}

/**
 * 获取扩展上下文
 */
export function getExtensionContext(): vscode.ExtensionContext | undefined {
	return mockExtensionContext
}

/**
 * 设置扩展上下文
 */
export function setExtensionContext(context: vscode.ExtensionContext): void {
	// 在测试中不做任何事情，保持使用mock
}

/**
 * 获取扩展的全局存储路径
 */
export function getGlobalStoragePath(): string {
	return tmpDir
}

/**
 * 获取扩展的全局存储中的特定路径
 */
export function getGlobalStorageSubPath(subPath: string): string {
	return path.join(tmpDir, subPath)
}
