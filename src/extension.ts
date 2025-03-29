import * as vscode from "vscode"
import { logger, initializeLogger } from "./utils/logging"

import { CoolClineProvider } from "./core/webview/CoolClineProvider"
import { createCoolClineAPI } from "./exports"
import { CoolClineAPI } from "./exports/coolcline.d"
import "./utils/path" // Necessary to have access to String.prototype.toPosix.
import { CodeActionProvider } from "./core/CodeActionProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { handleUri, registerCommands, registerCodeActions, registerTerminalActions } from "./activate"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { setExtensionContext as setCheckpointsExtensionContext } from "./services/checkpoints/CheckpointUtils"
import { setExtensionContext } from "./services/codebase-search/extension-context"
import { initializeCodebaseSearch } from "./services/codebase-search"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext): Promise<CoolClineAPI> {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel("CoolCline")
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine("CoolCline extension activated")

	// 设置扩展上下文
	setExtensionContext(context)
	setCheckpointsExtensionContext(context)

	// 初始化代码库搜索服务
	try {
		await initializeCodebaseSearch()
		// console.log("代码库搜索服务初始化完成", { ctx: "extension" })
	} catch (error) {
		const errorMessage = `代码库搜索服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
		outputChannel.appendLine(errorMessage)
		console.error(errorMessage)
	}

	// 初始化日志系统
	try {
		await initializeLogger(context)
		// console.log("CoolCline extension activated", { ctx: "extension" })
	} catch (error) {
		const errorMessage = `日志系统初始化失败: ${error instanceof Error ? error.message : String(error)}`
		outputChannel.appendLine(errorMessage)
		console.error(errorMessage)

		// 尝试记录更多诊断信息
		try {
			const storageUri = context.globalStorageUri
			outputChannel.appendLine(`存储路径: ${storageUri.fsPath}`)
			console.log("存储路径:", storageUri.fsPath)
		} catch (e) {
			outputChannel.appendLine(`无法获取存储路径: ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration("coolcline").get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	const sidebarProvider = new CoolClineProvider(context, outputChannel)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CoolClineProvider.sideBarId, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	registerCommands({ context, outputChannel, provider: sidebarProvider })

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	return createCoolClineAPI(outputChannel, sidebarProvider)
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine("CoolCline extension deactivated")
	// Clean up MCP server manager
	await McpServerManager.cleanup(extensionContext)
}
