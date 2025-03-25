import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import axios from "axios"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"
import { buildApiHandler } from "../../api"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import { getDiffStrategy } from "../diff/DiffStrategy"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/McpHub"
import { ApiConfiguration, llmProvider, ModelInfo } from "../../shared/api"
import { findLast } from "../../shared/array"
import { ApiConfigMeta, ExtensionMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { Mode, CustomModePrompts, PromptComponent, defaultModeSlug } from "../../shared/modes"
import { SYSTEM_PROMPT } from "../prompts/system"
import { fileExistsAtPath } from "../../utils/fs"
import { CoolCline } from "../CoolCline"
import { openMention } from "../mentions"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { playSound, setSoundEnabled, setSoundVolume } from "../../utils/sound"
import { checkExistKey } from "../../shared/checkExistApiConfig"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { searchCommits } from "../../utils/git"
import { ConfigManager } from "../config/ConfigManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { EXPERIMENT_IDS, experiments as Experiments, experimentDefault, ExperimentId } from "../../shared/experiments"
import { CustomSupportPrompts, supportPrompt } from "../../shared/support-prompt"
import { ACTION_NAMES } from "../CodeActionProvider"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { RequestyProvider } from "./RequestyProvider"
import { CheckpointRestoreMode } from "../../services/checkpoints/types"
import { getShadowGitPath, hashWorkingDir, PathUtils } from "../../services/checkpoints/CheckpointUtils"
import { ManageCheckpointRepository } from "../../services/checkpoints/ManageCheckpointRepository"
import { handleCodebaseSearchWebviewMessage } from "../../services/codebase-search"
import { EditorFactory, EditorType } from "../../integrations/editor/EditorFactory"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

type SecretKey =
	| "apiKey"
	| "glamaApiKey"
	| "openRouterApiKey"
	| "awsAccessKey"
	| "awsSecretKey"
	| "awsSessionToken"
	| "openAiApiKey"
	| "geminiApiKey"
	| "openAiNativeApiKey"
	| "deepSeekApiKey"
	| "mistralApiKey"
	| "unboundApiKey"
	| "requestyApiKey"
type GlobalStateKey =
	| "llmProvider"
	| "apiModelId"
	| "glamaModelId"
	| "glamaModelInfo"
	| "awsRegion"
	| "awsUseCrossRegionInference"
	| "awsProfile"
	| "awsUseProfile"
	| "vertexProjectId"
	| "vertexRegion"
	| "lastShownAnnouncementId"
	| "customInstructions"
	| "alwaysAllowReadOnly"
	| "alwaysAllowWrite"
	| "alwaysAllowExecute"
	| "alwaysAllowBrowser"
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "taskHistory"
	| "openAiBaseUrl"
	| "openAiModelId"
	| "openAiCustomModelInfo"
	| "openAiUseAzure"
	| "ollamaModelId"
	| "ollamaBaseUrl"
	| "lmStudioModelId"
	| "lmStudioBaseUrl"
	| "anthropicBaseUrl"
	| "azureApiVersion"
	| "openAiStreamingEnabled"
	| "openRouterModelId"
	| "openRouterModelInfo"
	| "openRouterBaseUrl"
	| "openRouterUseMiddleOutTransform"
	| "allowedCommands"
	| "soundEnabled"
	| "soundVolume"
	| "diffEnabled"
	| "browserViewportSize"
	| "screenshotQuality"
	| "fuzzyMatchThreshold"
	| "preferredLanguage"
	| "writeDelayMs"
	| "terminalOutputLineLimit"
	| "mcpEnabled"
	| "enableMcpServerCreation"
	| "alwaysApproveResubmit"
	| "requestDelaySeconds"
	| "rateLimitSeconds"
	| "currentApiConfigName"
	| "listApiConfigMeta"
	| "vsCodeLmModelSelector"
	| "mode"
	| "modeApiConfigs"
	| "customModePrompts"
	| "customSupportPrompts"
	| "enhancementApiConfigId"
	| "experiments"
	| "autoApprovalEnabled"
	| "customModes"
	| "unboundModelId"
	| "unboundModelInfo"
	| "checkpointsEnabled"
	| "modelTemperature"
	| "requestyModels"
	| "requestyModelId"
	| "requestyModelInfo"
	| "codebaseIndexEnabled"
	| "codebaseIndexAutoStart"
	| "codebaseIndexExcludePaths"
	| "codebaseIndexIncludeTests"
	| "editorType"

export const GlobalFileNames = {
	apiConversationHistory: "api_conversation_history.json",
	uiMessages: "ui_messages.json",
	glamaModels: "glama_models.json",
	openRouterModels: "openrouter_models.json",
	mcpSettings: "coolcline_mcp_settings.json",
	unboundModels: "unbound_models.json",
	customModes: "custom_modes.json",
	requestyModels: "requesty_models.json",
}

export class CoolClineProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "coolcline.SidebarProvider" // used in package.json as the view's id. This value cannot be changed due to how vscode caches views based on their id, and updating the id would break existing instances of the extension.
	public static readonly tabPanelId = "coolcline.TabPanelProvider"
	private static activeInstances: Set<CoolClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private isViewLaunched = false
	private coolcline?: CoolCline
	private workspaceTracker?: WorkspaceTracker
	mcpHub?: McpHub
	private latestAnnouncementId = "jan-21-2025-custom-modes" // update to some unique identifier when we add a new announcement
	configManager: ConfigManager
	customModesManager: CustomModesManager
	private requestyProvider?: RequestyProvider
	private checkpointManager: ManageCheckpointRepository

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {
		this.outputChannel.appendLine("CoolClineProvider instantiated")
		CoolClineProvider.activeInstances.add(this)
		this.workspaceTracker = new WorkspaceTracker(this)
		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub
			})
			.catch((error) => {
				this.outputChannel.appendLine(`Failed to initialize MCP Hub: ${error}`)
			})
		this.configManager = new ConfigManager(this.context)
		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})
		this.requestyProvider = new RequestyProvider(
			PathUtils.joinPath(this.context.globalStorageUri.fsPath, "cache"),
			this.outputChannel,
		)
		this.checkpointManager = new ManageCheckpointRepository(context)
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("Disposing CoolClineProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("Cleared task")
		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Disposed webview")
		}
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.workspaceTracker?.dispose()
		this.workspaceTracker = undefined
		this.mcpHub?.dispose()
		this.mcpHub = undefined
		this.customModesManager?.dispose()
		this.outputChannel.appendLine("Disposed all disposables")
		CoolClineProvider.activeInstances.delete(this)

		// Unregister from McpServerManager
		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): CoolClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<CoolClineProvider | undefined> {
		let visibleProvider = CoolClineProvider.getVisibleInstance()

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand("coolcline.SidebarProvider.focus")
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = CoolClineProvider.getVisibleInstance()
		}

		// If still no visible provider, return
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await CoolClineProvider.getInstance()
		if (!visibleProvider) {
			return false
		}

		if (visibleProvider.coolcline) {
			return true
		}

		return false
	}

	public static async handleCodeAction(
		command: string,
		promptType: keyof typeof ACTION_NAMES,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await CoolClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("addToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})

			return
		}

		if (visibleProvider.coolcline && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})

			return
		}

		await visibleProvider.initCoolClineWithTask(prompt)
	}

	public static async handleTerminalAction(
		command: string,
		promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await CoolClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("AddToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}

		if (visibleProvider.coolcline && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})
			return
		}

		await visibleProvider.initCoolClineWithTask(prompt)
	}

	// 初始化 CoolCline 组件
	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.outputChannel.appendLine("Resolving webview view")
		this.view = webviewView

		// 获取初始状态
		const initialState = await this.getState()
		const { preferredLanguage = "English", soundEnabled = false } = initialState

		// 设置 webview 选项
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		// 设置 webview HTML
		webviewView.webview.html =
			this.context.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview, { preferredLanguage })
				: this.getHtmlContent(webviewView.webview, { preferredLanguage })

		// 初始化声音设置
		setSoundEnabled(soundEnabled)

		// 设置消息监听器
		this.setWebviewMessageListener(webviewView.webview)

		// 设置可见性监听器
		if ("onDidChangeViewState" in webviewView) {
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			webviewView.onDidChangeVisibility(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables,
		)

		// Listen for when color changes
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					// Sends latest theme name to webview
					await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
				}
			},
			null,
			this.disposables,
		)

		// if the extension is starting a new session, clear previous task state
		this.clearTask()

		this.outputChannel.appendLine("Webview view resolved")
	}

	public async initCoolClineWithTask(task?: string, images?: string[]) {
		await this.clearTask()
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		this.coolcline = new CoolCline(
			this,
			apiConfiguration,
			effectiveInstructions,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			task,
			images,
			undefined,
			experiments,
		)
	}

	public async initCoolClineWithHistoryItem(historyItem: HistoryItem) {
		await this.clearTask()
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		this.coolcline = new CoolCline(
			this,
			apiConfiguration,
			effectiveInstructions,
			diffEnabled,
			checkpointsEnabled,
			fuzzyMatchThreshold,
			undefined,
			undefined,
			historyItem,
			experiments,
		)
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview, initialState?: any): Promise<string> {
		const localPort = "5173"
		const localServerUrl = `localhost:${localPort}`

		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(
				"Local development server is not running, HMR will not work. Please run 'npm run dev' before launching the extension to enable HMR.",
			)
			return this.getHtmlContent(webview, initialState)
		}

		const nonce = getNonce()
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} data:`,
			`script-src 'unsafe-eval' https://* http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		// 创建初始状态元数据
		const stateMetadata = initialState
			? `<meta name="vscode-state" content="${encodeURIComponent(JSON.stringify(initialState))}" />`
			: ""

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					${stateMetadata}
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<title>CoolCline</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	private getHtmlContent(webview: vscode.Webview, initialState?: any): string {
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.js"])
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const nonce = getNonce()

		// 创建初始状态元数据
		const stateMetadata = initialState
			? `<meta name="vscode-state" content="${encodeURIComponent(JSON.stringify(initialState))}" />`
			: ""

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta name="theme-color" content="#000000">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
					${stateMetadata}
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<title>CoolCline</title>
				</head>
				<body>
					<noscript>You need to enable JavaScript to run this app.</noscript>
					<div id="root"></div>
					<script nonce="${nonce}" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is recieved.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case "webviewDidLaunch":
						// Load custom modes first
						const customModes = await this.customModesManager.getCustomModes()
						await this.updateGlobalState("customModes", customModes)

						this.postStateToWebview()
						this.workspaceTracker?.initializeFilePaths() // don't await
						getTheme().then((theme) =>
							this.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) }),
						)
						// post last cached models in case the call to endpoint fails
						this.readOpenRouterModels().then((openRouterModels) => {
							if (openRouterModels) {
								this.postMessageToWebview({ type: "openRouterModels", openRouterModels })
							}
						})
						// gui relies on model info to be up-to-date to provide the most accurate pricing, so we need to fetch the latest details on launch.
						// we do this for all users since many users switch between llm providers and if they were to switch back to openrouter it would be showing outdated model info if we hadn't retrieved the latest at this point
						// (see normalizeApiConfiguration > openrouter)
						this.refreshOpenRouterModels().then(async (openRouterModels) => {
							if (openRouterModels) {
								// update model info in state (this needs to be done here since we don't want to update state while settings is open, and we may refresh models there)
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.openRouterModelId) {
									await this.updateGlobalState(
										"openRouterModelInfo",
										openRouterModels[apiConfiguration.openRouterModelId],
									)
									await this.postStateToWebview()
								}
							}
						})
						this.readGlamaModels().then((glamaModels) => {
							if (glamaModels) {
								this.postMessageToWebview({ type: "glamaModels", glamaModels })
							}
						})
						this.refreshGlamaModels().then(async (glamaModels) => {
							if (glamaModels) {
								// update model info in state (this needs to be done here since we don't want to update state while settings is open, and we may refresh models there)
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.glamaModelId) {
									await this.updateGlobalState(
										"glamaModelInfo",
										glamaModels[apiConfiguration.glamaModelId],
									)
									await this.postStateToWebview()
								}
							}
						})

						this.refreshUnboundModels().then(async (unboundModels) => {
							if (unboundModels) {
								// update model info in state
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.unboundModelId) {
									await this.updateGlobalState(
										"unboundModelInfo",
										unboundModels[apiConfiguration.unboundModelId],
									)
									await this.postStateToWebview()
								}
							}
						})

						this.configManager
							.listConfig()
							.then(async (listApiConfig) => {
								if (!listApiConfig) {
									return
								}

								if (listApiConfig.length === 1) {
									// check if first time init then sync with exist config
									if (!checkExistKey(listApiConfig[0])) {
										const { apiConfiguration } = await this.getState()
										await this.configManager.saveConfig(
											listApiConfig[0].name ?? "default",
											apiConfiguration,
										)
										listApiConfig[0].llmProvider = apiConfiguration.llmProvider
									}
								}

								const currentConfigName = (await this.getGlobalState("currentApiConfigName")) as string

								if (currentConfigName) {
									if (!(await this.configManager.hasConfig(currentConfigName))) {
										// current config name not valid, get first config in list
										await this.updateGlobalState("currentApiConfigName", listApiConfig?.[0]?.name)
										if (listApiConfig?.[0]?.name) {
											const apiConfig = await this.configManager.loadConfig(
												listApiConfig?.[0]?.name,
											)

											await Promise.all([
												this.updateGlobalState("listApiConfigMeta", listApiConfig),
												this.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
												this.updateApiConfiguration(apiConfig),
											])
											await this.postStateToWebview()
											return
										}
									}
								}

								await Promise.all([
									await this.updateGlobalState("listApiConfigMeta", listApiConfig),
									await this.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
								])
							})
							.catch((error) =>
								this.outputChannel.appendLine(
									`Error list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								),
							)

						this.isViewLaunched = true
						break
					case "newTask":
						// Code that should run in response to the hello message command
						//vscode.window.showInformationMessage(message.text!)

						// Send a message to our webview.
						// You can send any JSON serializable data.
						// Could also do this in extension .ts
						//this.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
						// initializing new instance of CoolCline will make sure that any agentically running promises in old instance don't affect our new task. this essentially creates a fresh slate for the new task
						await this.initCoolClineWithTask(message.text, message.images)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							await this.updateApiConfiguration(message.apiConfiguration)
						}
						await this.postStateToWebview()
						break
					case "customInstructions":
						await this.updateCustomInstructions(message.text)
						break
					case "alwaysAllowReadOnly":
						await this.updateGlobalState("alwaysAllowReadOnly", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowWrite":
						await this.updateGlobalState("alwaysAllowWrite", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowExecute":
						await this.updateGlobalState("alwaysAllowExecute", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowBrowser":
						await this.updateGlobalState("alwaysAllowBrowser", message.bool ?? undefined)
						await this.postStateToWebview()
						break
					case "alwaysAllowMcp":
						await this.updateGlobalState("alwaysAllowMcp", message.bool)
						await this.postStateToWebview()
						break
					case "alwaysAllowModeSwitch":
						await this.updateGlobalState("alwaysAllowModeSwitch", message.bool)
						await this.postStateToWebview()
						break
					case "askResponse":
						this.coolcline?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						// newTask will start a new task with a given task text, while clear task resets the current session and allows for a new task to be started
						await this.clearTask()
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await selectImages()
						await this.postMessageToWebview({ type: "selectedImages", images })
						break
					case "exportCurrentTask":
						const currentTaskId = this.coolcline?.taskId
						if (currentTaskId) {
							this.exportTaskWithId(currentTaskId)
						}
						break
					case "showTaskWithId":
						this.showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						this.deleteTaskWithId(message.text!)
						break
					case "exportTaskWithId":
						this.exportTaskWithId(message.text!)
						break
					case "resetState":
						await this.resetState()
						break
					case "requestOllamaModels":
						const ollamaModels = await this.getOllamaModels(message.text)
						this.postMessageToWebview({ type: "ollamaModels", ollamaModels })
						break
					case "requestLmStudioModels":
						const lmStudioModels = await this.getLmStudioModels(message.text)
						this.postMessageToWebview({ type: "lmStudioModels", lmStudioModels })
						break
					case "requestVsCodeLmModels":
						const vsCodeLmModels = await this.getVsCodeLmModels()
						this.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
						break
					case "refreshGlamaModels":
						await this.refreshGlamaModels()
						break
					case "refreshOpenRouterModels":
						await this.refreshOpenRouterModels()
						break
					case "refreshOpenAiModels":
						if (message?.values?.baseUrl && message?.values?.apiKey) {
							const openAiModels = await this.getOpenAiModels(
								message?.values?.baseUrl,
								message?.values?.apiKey,
							)
							this.postMessageToWebview({ type: "openAiModels", openAiModels })
						}
						break
					case "refreshUnboundModels":
						await this.refreshUnboundModels()
						break
					case "openImage":
						openImage(message.text!)
						break
					case "openFile":
						openFile(message.text!, message.values as { create?: boolean; content?: string })
						break
					case "openMention":
						openMention(message.text)
						break
					case "checkpointDiff":
						if (message.payload) {
							try {
								await this.coolcline?.checkpointDiff({
									ts: message.payload.ts as number,
									commitHash: message.payload.commitHash as string,
									mode: message.payload.mode as "full" | "checkpoint",
								})
							} catch (error) {
								const errorMessage = error instanceof Error ? error.message : "未知错误"
								vscode.window.showErrorMessage(`Failed to show checkpoint diff: ${errorMessage}`)
								this.log(`[checkpointDiff] 错误: ${errorMessage}`)
							}
						}
						break
					case "checkpointRestore": {
						if (message.payload) {
							// 在恢复之前取消当前任务
							await this.cancelTask()

							try {
								// 等待新的 coolcline 实例初始化完成
								await pWaitFor(() => this.coolcline?.isInitialized === true, {
									timeout: 3_000,
								}).catch(() => {
									console.error("Failed to init new coolcline instance")
									this.log("[checkpointRestore] 初始化新的 coolcline 实例失败")
								})

								// 调用 Core 层的 checkpointRestore 方法
								await this.coolcline?.checkpointRestore({
									ts: message.payload.ts as number,
									commitHash: message.payload.commitHash as string,
									mode: message.payload.mode as CheckpointRestoreMode,
								})

								// 添加restore完成通知
								await this.postMessageToWebview({
									type: "checkpointRestoreComplete",
									payload: message.payload,
								})
							} catch (error) {
								const errorMessage = error instanceof Error ? error.message : "未知错误"
								vscode.window.showErrorMessage(`Failed to restore checkpoint: ${errorMessage}`)
								this.log(`[checkpointRestore] 错误: ${errorMessage}`)
							}
						}
						break
					}
					case "cancelTask":
						await this.cancelTask()
						break
					case "allowedCommands":
						await this.context.globalState.update("allowedCommands", message.commands)
						// Also update workspace settings
						await vscode.workspace
							.getConfiguration("coolcline")
							.update("allowedCommands", message.commands, vscode.ConfigurationTarget.Global)
						break
					case "openMcpSettings": {
						const mcpSettingsFilePath = await this.mcpHub?.getMcpSettingsFilePath()
						if (mcpSettingsFilePath) {
							openFile(mcpSettingsFilePath)
						}
						break
					}
					case "openCustomModesSettings": {
						const customModesFilePath = await this.customModesManager.getCustomModesFilePath()
						if (customModesFilePath) {
							openFile(customModesFilePath)
						}
						break
					}
					case "restartMcpServer": {
						try {
							await this.mcpHub?.restartConnection(message.text!)
						} catch (error) {
							this.outputChannel.appendLine(
								`Failed to retry connection for ${message.text}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "toggleToolAlwaysAllow": {
						try {
							await this.mcpHub?.toggleToolAlwaysAllow(
								message.serverName!,
								message.toolName!,
								message.alwaysAllow!,
							)
						} catch (error) {
							this.outputChannel.appendLine(
								`Failed to toggle auto-approve for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "toggleMcpServer": {
						try {
							await this.mcpHub?.toggleServerDisabled(message.serverName!, message.disabled!)
						} catch (error) {
							this.outputChannel.appendLine(
								`Failed to toggle MCP server ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
						}
						break
					}
					case "mcpEnabled":
						const mcpEnabled = message.bool ?? true
						await this.updateGlobalState("mcpEnabled", mcpEnabled)
						await this.postStateToWebview()
						break
					case "enableMcpServerCreation":
						await this.updateGlobalState("enableMcpServerCreation", message.bool ?? true)
						await this.postStateToWebview()
						break
					case "playSound":
						if (message.audioType) {
							const soundPath = PathUtils.joinPath(
								this.context.extensionPath,
								"audio",
								`${message.audioType}.wav`,
							)
							playSound(soundPath)
						}
						break
					case "soundEnabled":
						const soundEnabled = message.bool ?? true
						await this.updateGlobalState("soundEnabled", soundEnabled)
						setSoundEnabled(soundEnabled) // Add this line to update the sound utility
						await this.postStateToWebview()
						break
					case "soundVolume":
						const soundVolume = message.value ?? 0.5
						await this.updateGlobalState("soundVolume", soundVolume)
						setSoundVolume(soundVolume)
						await this.postStateToWebview()
						break
					case "diffEnabled":
						const diffEnabled = message.bool ?? true
						await this.updateGlobalState("diffEnabled", diffEnabled)
						await this.postStateToWebview()
						break
					case "browserViewportSize":
						const browserViewportSize = message.text ?? "900x600"
						await this.updateGlobalState("browserViewportSize", browserViewportSize)
						await this.postStateToWebview()
						break
					case "fuzzyMatchThreshold":
						await this.updateGlobalState("fuzzyMatchThreshold", message.value)
						await this.postStateToWebview()
						break
					case "alwaysApproveResubmit":
						await this.updateGlobalState("alwaysApproveResubmit", message.bool ?? false)
						await this.postStateToWebview()
						break
					case "requestDelaySeconds":
						await this.updateGlobalState("requestDelaySeconds", message.value ?? 5)
						await this.postStateToWebview()
						break
					case "rateLimitSeconds":
						await this.updateGlobalState("rateLimitSeconds", message.value ?? 0)
						await this.postStateToWebview()
						break
					case "preferredLanguage":
						await this.updateGlobalState("preferredLanguage", message.text)
						await this.postStateToWebview()
						break
					case "writeDelayMs":
						await this.updateGlobalState("writeDelayMs", message.value)
						await this.postStateToWebview()
						break
					case "terminalOutputLineLimit":
						await this.updateGlobalState("terminalOutputLineLimit", message.value)
						await this.postStateToWebview()
						break
					case "mode":
						await this.handleModeSwitch(message.text as Mode)
						break
					case "updateSupportPrompt":
						try {
							if (Object.keys(message?.values ?? {}).length === 0) {
								return
							}

							const existingPrompts = (await this.getGlobalState("customSupportPrompts")) || {}

							const updatedPrompts = {
								...existingPrompts,
								...message.values,
							}

							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(
								`Error update support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("Failed to update support prompt")
						}
						break
					case "resetSupportPrompt":
						try {
							if (!message?.text) {
								return
							}

							const existingPrompts = ((await this.getGlobalState("customSupportPrompts")) ||
								{}) as Record<string, any>

							const updatedPrompts = {
								...existingPrompts,
							}

							updatedPrompts[message.text] = undefined

							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(
								`Error reset support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("Failed to reset support prompt")
						}
						break
					case "updatePrompt":
						if (message.promptMode && message.customPrompt !== undefined) {
							const existingPrompts = (await this.getGlobalState("customModePrompts")) || {}

							const updatedPrompts = {
								...existingPrompts,
								[message.promptMode]: message.customPrompt,
							}

							await this.updateGlobalState("customModePrompts", updatedPrompts)

							// Get current state and explicitly include customModePrompts
							const currentState = await this.getState()

							const stateWithPrompts = {
								...currentState,
								customModePrompts: updatedPrompts,
							}

							// Post state with prompts
							this.view?.webview.postMessage({
								type: "state",
								state: stateWithPrompts,
							})
						}
						break
					case "deleteMessage": {
						const answer = await vscode.window.showInformationMessage(
							"What would you like to delete?",
							{ modal: true },
							"Just this message",
							"This and all subsequent messages",
						)
						if (
							(answer === "Just this message" || answer === "This and all subsequent messages") &&
							this.coolcline &&
							typeof message.value === "number" &&
							message.value
						) {
							const timeCutoff = message.value - 1000 // 1 second buffer before the message to delete
							const messageIndex = this.coolcline.coolclineMessages.findIndex(
								(msg) => msg.ts && msg.ts >= timeCutoff,
							)
							const apiConversationHistoryIndex = this.coolcline.apiConversationHistory.findIndex(
								(msg) => msg.ts && msg.ts >= timeCutoff,
							)

							if (messageIndex !== -1) {
								const { historyItem } = await this.getTaskWithId(this.coolcline.taskId)

								if (answer === "Just this message") {
									// Find the next user message first
									const nextUserMessage = this.coolcline.coolclineMessages
										.slice(messageIndex + 1)
										.find((msg) => msg.type === "say" && msg.say === "user_feedback")

									// Handle UI messages
									if (nextUserMessage) {
										// Find absolute index of next user message
										const nextUserMessageIndex = this.coolcline.coolclineMessages.findIndex(
											(msg) => msg === nextUserMessage,
										)
										// Keep messages before current message and after next user message
										await this.coolcline.overwriteCoolClineMessages([
											...this.coolcline.coolclineMessages.slice(0, messageIndex),
											...this.coolcline.coolclineMessages.slice(nextUserMessageIndex),
										])
									} else {
										// If no next user message, keep only messages before current message
										await this.coolcline.overwriteCoolClineMessages(
											this.coolcline.coolclineMessages.slice(0, messageIndex),
										)
									}

									// Handle API messages
									if (apiConversationHistoryIndex !== -1) {
										if (nextUserMessage && nextUserMessage.ts) {
											// Keep messages before current API message and after next user message
											await this.coolcline.overwriteApiConversationHistory([
												...this.coolcline.apiConversationHistory.slice(
													0,
													apiConversationHistoryIndex,
												),
												...this.coolcline.apiConversationHistory.filter(
													(msg) => msg.ts && msg.ts >= nextUserMessage.ts,
												),
											])
										} else {
											// If no next user message, keep only messages before current API message
											await this.coolcline.overwriteApiConversationHistory(
												this.coolcline.apiConversationHistory.slice(
													0,
													apiConversationHistoryIndex,
												),
											)
										}
									}
								} else if (answer === "This and all subsequent messages") {
									// Delete this message and all that follow
									await this.coolcline.overwriteCoolClineMessages(
										this.coolcline.coolclineMessages.slice(0, messageIndex),
									)
									if (apiConversationHistoryIndex !== -1) {
										await this.coolcline.overwriteApiConversationHistory(
											this.coolcline.apiConversationHistory.slice(0, apiConversationHistoryIndex),
										)
									}
								}

								await this.initCoolClineWithHistoryItem(historyItem)
							}
						}
						break
					}
					case "screenshotQuality":
						await this.updateGlobalState("screenshotQuality", message.value)
						await this.postStateToWebview()
						break
					case "enhancementApiConfigId":
						await this.updateGlobalState("enhancementApiConfigId", message.text)
						await this.postStateToWebview()
						break
					case "autoApprovalEnabled":
						await this.updateGlobalState("autoApprovalEnabled", message.bool ?? false)
						await this.postStateToWebview()
						break
					case "checkpointsEnabled":
						await this.updateGlobalState("checkpointsEnabled", message.bool ?? false)
						await this.postStateToWebview()
						break
					case "editorType":
						if (message.text) {
							// 保存编辑器类型首选项
							await this.updateGlobalState("editorType", message.text)
							// 更新VSCode配置
							await EditorFactory.setPreferredEditorType(message.text as EditorType)
							// 更新状态
							await this.postStateToWebview()
						}
						break
					case "enhancePrompt":
						if (message.text) {
							try {
								const {
									apiConfiguration,
									customSupportPrompts,
									listApiConfigMeta,
									enhancementApiConfigId,
								} = await this.getState()

								// Try to get enhancement config first, fall back to current config
								let configToUse: ApiConfiguration = apiConfiguration
								if (enhancementApiConfigId) {
									const config = listApiConfigMeta?.find((c) => c.id === enhancementApiConfigId)
									if (config?.name) {
										const loadedConfig = await this.configManager.loadConfig(config.name)
										if (loadedConfig.llmProvider) {
											configToUse = loadedConfig
										}
									}
								}

								const enhancedPrompt = await singleCompletionHandler(
									configToUse,
									supportPrompt.create(
										"ENHANCE",
										{
											userInput: message.text,
										},
										customSupportPrompts,
									),
								)

								await this.postMessageToWebview({
									type: "enhancedPrompt",
									text: enhancedPrompt,
								})
							} catch (error) {
								this.outputChannel.appendLine(
									`Error enhancing prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to enhance prompt")
								await this.postMessageToWebview({
									type: "enhancedPrompt",
								})
							}
						}
						break
					case "getSystemPrompt":
						try {
							const {
								apiConfiguration,
								customModePrompts,
								customInstructions,
								preferredLanguage,
								browserViewportSize,
								diffEnabled,
								mcpEnabled,
								fuzzyMatchThreshold,
								experiments,
								enableMcpServerCreation,
							} = await this.getState()

							// Create diffStrategy based on current model and settings
							const diffStrategy = getDiffStrategy(
								apiConfiguration.apiModelId || apiConfiguration.openRouterModelId || "",
								fuzzyMatchThreshold,
								Experiments.isEnabled(experiments, EXPERIMENT_IDS.DIFF_STRATEGY),
							)
							const cwd =
								vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) || ""

							const mode = message.mode ?? defaultModeSlug
							const customModes = await this.customModesManager.getCustomModes()

							// 这里的作用是 `PromptsView.tsx` 页面预览提示词按钮用的
							// 注意保持与 CoolCline.ts 中组装提示词的实现一致
							const systemPrompt = await (async () => {
								// 根据模式传入不同的参数
								//  mode 是要传 slug，是小写字母
								switch (mode) {
									case "ask":
										return SYSTEM_PROMPT(
											{
												preferredLanguage,
											},
											"ask",
										)

									case "code":
										return SYSTEM_PROMPT(
											{
												context: this.context,
												preferredLanguage,
												cwd,
												enableBaseObjective: true, // 默认启用基础工作目标
												// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
												// 它是追加模式，系统的提示词是这些
												// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
												globalCustomInstructions: customInstructions,
												supportsComputerUse:
													apiConfiguration.openRouterModelInfo?.supportsComputerUse ?? false,
												browserViewportSize: browserViewportSize ?? "900x600",
												enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
												mcpHub: mcpEnabled ? this.mcpHub : undefined,
												diffStrategy,
												diffEnabled,
												// allowAIToCreateMode: false, // 是否需要 AI 创建角色模式
												customModePrompts, // 获取终端用户自定义roleDefinition和customInstructions
												customModeConfigs: customModes, // 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
												experiments,
												enableToolUse: true, // 显式启用工具使用部分
												enableToolGuidelines: true, // 显式启用工具使用指南部分
											},
											"code",
										)

									case "architect":
										return SYSTEM_PROMPT(
											{
												preferredLanguage,
												cwd,
											},
											"architect",
										)

									case "agent":
										return SYSTEM_PROMPT(
											{
												context: this.context,
												preferredLanguage,
												cwd,
												enableBaseObjective: true, // 默认启用基础工作目标
												// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
												// 它是追加模式，系统的提示词是这些
												// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
												globalCustomInstructions: customInstructions,
												supportsComputerUse:
													apiConfiguration.openRouterModelInfo?.supportsComputerUse ?? false,
												browserViewportSize: browserViewportSize ?? "900x600",
												enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
												mcpHub: mcpEnabled ? this.mcpHub : undefined,
												diffStrategy,
												diffEnabled,
												// allowAIToCreateMode: false, // 是否需要 AI 创建角色模式
												customModePrompts, // 获取终端用户自定义roleDefinition和customInstructions
												customModeConfigs: customModes, // 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
												experiments,
												enableToolUse: true, // 显式启用工具使用部分
												enableToolGuidelines: true, // 显式启用工具使用指南部分
											},
											"agent",
										)

									default:
										return SYSTEM_PROMPT(
											{
												context: this.context,
												preferredLanguage,
												cwd,
												enableBaseObjective: true, // 默认启用基础工作目标
												// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
												// 它是追加模式，系统的提示词是这些
												// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
												globalCustomInstructions: customInstructions,
												supportsComputerUse:
													apiConfiguration.openRouterModelInfo?.supportsComputerUse ?? false,
												browserViewportSize: browserViewportSize ?? "900x600",
												enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
												mcpHub: mcpEnabled ? this.mcpHub : undefined,
												diffStrategy,
												diffEnabled,
												allowAIToCreateMode: false, // 是否需要 AI 创建角色模式
												customModePrompts, // 获取终端用户自定义roleDefinition和customInstructions
												customModeConfigs: customModes, // 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
												experiments,
												enableToolUse: true, // 显式启用工具使用部分
												enableToolGuidelines: true, // 显式启用工具使用指南部分
											},
											mode,
										)
								}
							})()

							await this.postMessageToWebview({
								type: "systemPrompt",
								text: systemPrompt,
								mode: message.mode,
							})
						} catch (error) {
							this.outputChannel.appendLine(
								`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("Failed to get system prompt")
						}
						break
					case "searchCommits": {
						const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
						if (cwd) {
							try {
								const commits = await searchCommits(message.query || "", cwd)
								await this.postMessageToWebview({
									type: "commitSearchResults",
									commits,
								})
							} catch (error) {
								this.outputChannel.appendLine(
									`Error searching commits: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to search commits")
							}
						}
						break
					}
					case "upsertApiConfiguration":
						if (message.text && message.apiConfiguration) {
							try {
								await this.configManager.saveConfig(message.text, message.apiConfiguration)
								const listApiConfig = await this.configManager.listConfig()

								await Promise.all([
									this.updateGlobalState("listApiConfigMeta", listApiConfig),
									this.updateApiConfiguration(message.apiConfiguration),
									this.updateGlobalState("currentApiConfigName", message.text),
								])

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to create api configuration")
							}
						}
						break
					case "renameApiConfiguration":
						if (message.values && message.apiConfiguration) {
							try {
								const { oldName, newName } = message.values

								if (oldName === newName) {
									break
								}

								await this.configManager.saveConfig(newName, message.apiConfiguration)
								await this.configManager.deleteConfig(oldName)

								const listApiConfig = await this.configManager.listConfig()
								const config = listApiConfig?.find((c) => c.name === newName)

								// Update listApiConfigMeta first to ensure UI has latest data
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)

								await Promise.all([this.updateGlobalState("currentApiConfigName", newName)])

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to create api configuration")
							}
						}
						break
					case "loadApiConfiguration":
						if (message.text) {
							try {
								// 1. 先加载配置
								const apiConfig = await this.configManager.loadConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()

								// 2. 更新配置元数据
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)
								await this.updateGlobalState("currentApiConfigName", message.text)

								// 3. 更新具体配置前先请求模型信息
								if (apiConfig.llmProvider) {
									switch (apiConfig.llmProvider) {
										case "ollama":
											// 直接调用请求模型的方法
											await this.getOllamaModels(apiConfig.ollamaBaseUrl)
											break
										case "lmstudio":
											await this.getLmStudioModels(apiConfig.lmStudioBaseUrl)
											break
										case "vscode-lm":
											await this.getVsCodeLmModels()
											break
									}
								}

								// 4. 更新配置并通知UI
								await this.updateApiConfiguration(apiConfig)
								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`Error load api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to load api configuration")
							}
						}
						break
					case "deleteApiConfiguration":
						if (message.text) {
							const answer = await vscode.window.showInformationMessage(
								"Are you sure you want to delete this configuration profile?",
								{ modal: true },
								"Yes",
							)

							if (answer !== "Yes") {
								break
							}

							try {
								await this.configManager.deleteConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()

								// Update listApiConfigMeta first to ensure UI has latest data
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)

								// If this was the current config, switch to first available
								const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
								if (message.text === currentApiConfigName && listApiConfig?.[0]?.name) {
									const apiConfig = await this.configManager.loadConfig(listApiConfig[0].name)
									await Promise.all([
										this.updateGlobalState("currentApiConfigName", listApiConfig[0].name),
										this.updateApiConfiguration(apiConfig),
									])
								}

								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(
									`Error delete api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to delete api configuration")
							}
						}
						break
					case "getListApiConfiguration":
						try {
							const listApiConfig = await this.configManager.listConfig()
							await this.updateGlobalState("listApiConfigMeta", listApiConfig)
							this.postMessageToWebview({ type: "listApiConfig", listApiConfig })
						} catch (error) {
							this.outputChannel.appendLine(
								`Error get list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
							)
							vscode.window.showErrorMessage("Failed to get list api configuration")
						}
						break
					case "updateExperimental": {
						if (!message.values) {
							break
						}

						const updatedExperiments = {
							...((await this.getGlobalState("experiments")) ?? experimentDefault),
							...message.values,
						} as Record<ExperimentId, boolean>

						await this.updateGlobalState("experiments", updatedExperiments)

						// Update diffStrategy in current CoolCline instance if it exists
						if (message.values[EXPERIMENT_IDS.DIFF_STRATEGY] !== undefined && this.coolcline) {
							await this.coolcline.updateDiffStrategy(
								Experiments.isEnabled(updatedExperiments, EXPERIMENT_IDS.DIFF_STRATEGY),
							)
						}

						await this.postStateToWebview()
						break
					}
					case "updateMcpTimeout":
						if (message.serverName && typeof message.timeout === "number") {
							try {
								await this.mcpHub?.updateServerTimeout(message.serverName, message.timeout)
							} catch (error) {
								this.outputChannel.appendLine(
									`Failed to update timeout for ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
								)
								vscode.window.showErrorMessage("Failed to update server timeout")
							}
						}
						break
					case "updateCustomMode":
						if (message.modeConfig) {
							await this.customModesManager.updateCustomMode(message.modeConfig.slug, message.modeConfig)
							// Update state after saving the mode
							const customModes = await this.customModesManager.getCustomModes()
							await this.updateGlobalState("customModes", customModes)
							await this.updateGlobalState("mode", message.modeConfig.slug)
							await this.postStateToWebview()
						}
						break
					case "deleteCustomMode":
						if (message.slug) {
							const answer = await vscode.window.showInformationMessage(
								"Are you sure you want to delete this custom mode?",
								{ modal: true },
								"Yes",
							)

							if (answer !== "Yes") {
								break
							}

							await this.customModesManager.deleteCustomMode(message.slug)
							// Switch back to default mode after deletion
							await this.updateGlobalState("mode", defaultModeSlug)
							await this.postStateToWebview()
						}
						break
					case "refreshOpenRouterModels":
						await this.refreshOpenRouterModels()
						break
					case "refreshRequestyModels":
						await this.refreshRequestyModels()
						break
					case "deleteAllProjectsAllHistory":
						await this.deleteAllProjectsAllHistory()
						break
					case "deleteThisProjectAllHistory":
						await this.deleteThisProjectAllHistory()
						break
					case "codebaseSearch":
						await handleCodebaseSearchWebviewMessage(webview, message)
						break
				}
			},
			null,
			this.disposables,
		)
	}

	/**
	 * Handle switching to a new mode, including updating the associated API configuration
	 * @param newMode The mode to switch to
	 */
	public async handleModeSwitch(newMode: Mode) {
		await this.updateGlobalState("mode", newMode)

		// Load the saved API config for the new mode if it exists
		const savedConfigId = await this.configManager.getModeConfigId(newMode)
		const listApiConfig = await this.configManager.listConfig()

		// Update listApiConfigMeta first to ensure UI has latest data
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)

		// If this mode has a saved config, use it
		if (savedConfigId) {
			const config = listApiConfig?.find((c) => c.id === savedConfigId)
			if (config?.name) {
				const apiConfig = await this.configManager.loadConfig(config.name)
				await Promise.all([
					this.updateGlobalState("currentApiConfigName", config.name),
					this.updateApiConfiguration(apiConfig),
				])
			}
		} else {
			// If no saved config for this mode, save current config as default
			const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
			if (currentApiConfigName) {
				const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
				if (config?.id) {
					await this.configManager.setModeConfig(newMode, config.id)
				}
			}
		}

		await this.postStateToWebview()
	}

	private async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		// Update mode's default config
		const { mode } = await this.getState()
		if (mode) {
			const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
			const listApiConfig = await this.configManager.listConfig()
			const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
			if (config?.id) {
				await this.configManager.setModeConfig(mode, config.id)
			}
		}

		const {
			llmProvider,
			apiModelId,
			apiKey,
			glamaModelId,
			glamaModelInfo,
			glamaApiKey,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiCustomModelInfo,
			openAiUseAzure,
			ollamaModelId,
			ollamaBaseUrl,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			azureApiVersion,
			openAiStreamingEnabled,
			openRouterModelId,
			openRouterModelInfo,
			openRouterBaseUrl,
			openRouterUseMiddleOutTransform,
			vsCodeLmModelSelector,
			mistralApiKey,
			unboundApiKey,
			unboundModelId,
			modelTemperature,
			requestyApiKey,
			requestyModelId,
			requestyModelInfo,
		} = apiConfiguration
		await this.updateGlobalState("llmProvider", llmProvider)
		await this.updateGlobalState("apiModelId", apiModelId)
		await this.storeSecret("apiKey", apiKey)
		await this.updateGlobalState("glamaModelId", glamaModelId)
		await this.updateGlobalState("glamaModelInfo", glamaModelInfo)
		await this.storeSecret("glamaApiKey", glamaApiKey)
		await this.storeSecret("openRouterApiKey", openRouterApiKey)
		await this.storeSecret("awsAccessKey", awsAccessKey)
		await this.storeSecret("awsSecretKey", awsSecretKey)
		await this.storeSecret("awsSessionToken", awsSessionToken)
		await this.updateGlobalState("awsRegion", awsRegion)
		await this.updateGlobalState("awsUseCrossRegionInference", awsUseCrossRegionInference)
		await this.updateGlobalState("awsProfile", awsProfile)
		await this.updateGlobalState("awsUseProfile", awsUseProfile)
		await this.updateGlobalState("vertexProjectId", vertexProjectId)
		await this.updateGlobalState("vertexRegion", vertexRegion)
		await this.updateGlobalState("openAiBaseUrl", openAiBaseUrl)
		await this.storeSecret("openAiApiKey", openAiApiKey)
		await this.updateGlobalState("openAiModelId", openAiModelId)
		await this.updateGlobalState("openAiCustomModelInfo", openAiCustomModelInfo)
		await this.updateGlobalState("openAiUseAzure", openAiUseAzure)
		await this.updateGlobalState("ollamaModelId", ollamaModelId)
		await this.updateGlobalState("ollamaBaseUrl", ollamaBaseUrl)
		await this.updateGlobalState("lmStudioModelId", lmStudioModelId)
		await this.updateGlobalState("lmStudioBaseUrl", lmStudioBaseUrl)
		await this.updateGlobalState("anthropicBaseUrl", anthropicBaseUrl)
		await this.storeSecret("geminiApiKey", geminiApiKey)
		await this.storeSecret("openAiNativeApiKey", openAiNativeApiKey)
		await this.storeSecret("deepSeekApiKey", deepSeekApiKey)
		await this.updateGlobalState("azureApiVersion", azureApiVersion)
		await this.updateGlobalState("openAiStreamingEnabled", openAiStreamingEnabled)
		await this.updateGlobalState("openRouterModelId", openRouterModelId)
		await this.updateGlobalState("openRouterModelInfo", openRouterModelInfo)
		await this.updateGlobalState("openRouterBaseUrl", openRouterBaseUrl)
		await this.updateGlobalState("openRouterUseMiddleOutTransform", openRouterUseMiddleOutTransform)
		await this.updateGlobalState("vsCodeLmModelSelector", vsCodeLmModelSelector)
		await this.storeSecret("mistralApiKey", mistralApiKey)
		await this.storeSecret("unboundApiKey", unboundApiKey)
		await this.updateGlobalState("unboundModelId", unboundModelId)
		await this.updateGlobalState("modelTemperature", modelTemperature)
		await this.storeSecret("requestyApiKey", requestyApiKey)
		await this.updateGlobalState("requestyModelId", requestyModelId)
		await this.updateGlobalState("requestyModelInfo", requestyModelInfo)
		if (this.coolcline) {
			this.coolcline.api = buildApiHandler(apiConfiguration)
		}
	}

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field
		await this.updateGlobalState("customInstructions", instructions || undefined)
		if (this.coolcline) {
			this.coolcline.customInstructions = instructions || undefined
		}
		await this.postStateToWebview()
	}

	// MCP

	async ensureMcpServersDirectoryExists(): Promise<string> {
		const mcpServersDir = PathUtils.joinPath(os.homedir(), "Documents", "CoolCline", "MCP")
		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			return "~/Documents/CoolCline/MCP" // in case creating a directory in documents fails for whatever reason (e.g. permissions) - this is fine since this path is only ever used in the system prompt
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const settingsDir = PathUtils.joinPath(this.context.globalStorageUri.fsPath, "settings")
		await fs.mkdir(settingsDir, { recursive: true })
		return settingsDir
	}

	// Ollama

	async getOllamaModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:11434"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/api/tags`)
			const modelsArray = response.data?.models?.map((model: any) => model.name) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// LM Studio

	async getLmStudioModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:1234"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/v1/models`)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// VSCode LM API
	private async getVsCodeLmModels() {
		try {
			const models = await vscode.lm.selectChatModels({})
			return models || []
		} catch (error) {
			this.outputChannel.appendLine(
				`Error fetching VS Code LM models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			return []
		}
	}

	// OpenAi

	async getOpenAiModels(baseUrl?: string, apiKey?: string) {
		try {
			if (!baseUrl) {
				return []
			}

			if (!URL.canParse(baseUrl)) {
				return []
			}

			const config: Record<string, any> = {}
			if (apiKey) {
				config["headers"] = { Authorization: `Bearer ${apiKey}` }
			}

			const response = await axios.get(`${baseUrl}/models`, config)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
		}
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://openrouter.ai/api/v1/auth/keys", { code })
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const openrouter: llmProvider = "openrouter"
		await this.updateGlobalState("llmProvider", openrouter)
		await this.storeSecret("openRouterApiKey", apiKey)
		await this.postStateToWebview()
		if (this.coolcline) {
			this.coolcline.api = buildApiHandler({ llmProvider: openrouter, openRouterApiKey: apiKey })
		}
		// await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // bad ux if user is on welcome
	}

	private async ensureCacheDirectoryExists(): Promise<string> {
		const cacheDir = PathUtils.joinPath(this.context.globalStorageUri.fsPath, "cache")
		await fs.mkdir(cacheDir, { recursive: true })
		return cacheDir
	}

	async handleGlamaCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })
			if (response.data && response.data.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Invalid response from Glama API")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const glama: llmProvider = "glama"
		await this.updateGlobalState("llmProvider", glama)
		await this.storeSecret("glamaApiKey", apiKey)
		await this.postStateToWebview()
		if (this.coolcline) {
			this.coolcline.api = buildApiHandler({
				llmProvider: glama,
				glamaApiKey: apiKey,
			})
		}
		// await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // bad ux if user is on welcome
	}

	private async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined> {
		const filePath = PathUtils.joinPath(await this.ensureCacheDirectoryExists(), filename)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			const fileContents = await fs.readFile(filePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	async readGlamaModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.glamaModels)
	}

	async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.openRouterModels)
	}

	async readUnboundModels(): Promise<Record<string, ModelInfo> | undefined> {
		return this.readModelsFromCache(GlobalFileNames.unboundModels)
	}

	async refreshGlamaModels() {
		const glamaModelsFilePath = PathUtils.joinPath(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.glamaModels,
		)

		const models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://glama.ai/api/gateway/v1/models")
			/*
				{
					"added": "2024-12-24T15:12:49.324Z",
					"capabilities": [
						"adjustable_safety_settings",
						"caching",
						"code_execution",
						"function_calling",
						"json_mode",
						"json_schema",
						"system_instructions",
						"tuning",
						"input:audio",
						"input:image",
						"input:text",
						"input:video",
						"output:text"
					],
					"id": "google-vertex/gemini-1.5-flash-002",
					"maxTokensInput": 1048576,
					"maxTokensOutput": 8192,
					"pricePerToken": {
						"cacheRead": null,
						"cacheWrite": null,
						"input": "0.000000075",
						"output": "0.0000003"
					}
				}
			*/
			if (response.data) {
				const rawModels = response.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.maxTokensOutput,
						contextWindow: rawModel.maxTokensInput,
						supportsImages: rawModel.capabilities?.includes("input:image"),
						supportsComputerUse: rawModel.capabilities?.includes("computer_use"),
						supportsPromptCache: rawModel.capabilities?.includes("caching"),
						inputPrice: parsePrice(rawModel.pricePerToken?.input),
						outputPrice: parsePrice(rawModel.pricePerToken?.output),
						description: undefined,
						cacheWritesPrice: parsePrice(rawModel.pricePerToken?.cacheWrite),
						cacheReadsPrice: parsePrice(rawModel.pricePerToken?.cacheRead),
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("Invalid response from Glama API")
			}
			await fs.writeFile(glamaModelsFilePath, JSON.stringify(models))
			this.outputChannel.appendLine("Glama models fetched and saved")
		} catch (error) {
			this.outputChannel.appendLine(
				`Error fetching Glama models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "glamaModels", glamaModels: models })
		return models
	}

	async refreshOpenRouterModels() {
		const openRouterModelsFilePath = PathUtils.joinPath(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.openRouterModels,
		)

		const models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://openrouter.ai/api/v1/models")
			/*
			{
				"id": "anthropic/claude-3.5-sonnet",
				"name": "Anthropic: Claude 3.5 Sonnet",
				"created": 1718841600,
				"description": "Claude 3.5 Sonnet delivers better-than-Opus capabilities, faster-than-Sonnet speeds, at the same Sonnet prices. Sonnet is particularly good at:\n\n- Coding: Autonomously writes, edits, and runs code with reasoning and troubleshooting\n- Data science: Augments human data science expertise; navigates unstructured data while using multiple tools for insights\n- Visual processing: excelling at interpreting charts, graphs, and images, accurately transcribing text to derive insights beyond just the text alone\n- Agentic tasks: exceptional tool use, making it great at agentic tasks (i.e. complex, multi-step problem solving tasks that require engaging with other systems)\n\n#multimodal",
				"context_length": 200000,
				"architecture": {
					"modality": "text+image-\u003Etext",
					"tokenizer": "Claude",
					"instruct_type": null
				},
				"pricing": {
					"prompt": "0.000003",
					"completion": "0.000015",
					"image": "0.0048",
					"request": "0"
				},
				"top_provider": {
					"context_length": 200000,
					"max_completion_tokens": 8192,
					"is_moderated": true
				},
				"per_request_limits": null
			},
			*/
			if (response.data?.data) {
				const rawModels = response.data.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.top_provider?.max_completion_tokens,
						contextWindow: rawModel.context_length,
						supportsImages: rawModel.architecture?.modality?.includes("image"),
						supportsPromptCache: false,
						inputPrice: parsePrice(rawModel.pricing?.prompt),
						outputPrice: parsePrice(rawModel.pricing?.completion),
						description: rawModel.description,
					}

					switch (rawModel.id) {
						case "anthropic/claude-3.5-sonnet":
						case "anthropic/claude-3.5-sonnet:beta":
							// NOTE: this needs to be synced with api.ts/openrouter default model info
							modelInfo.supportsComputerUse = true
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3.5-sonnet-20240620":
						case "anthropic/claude-3.5-sonnet-20240620:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3-5-haiku":
						case "anthropic/claude-3-5-haiku:beta":
						case "anthropic/claude-3-5-haiku-20241022":
						case "anthropic/claude-3-5-haiku-20241022:beta":
						case "anthropic/claude-3.5-haiku":
						case "anthropic/claude-3.5-haiku:beta":
						case "anthropic/claude-3.5-haiku-20241022":
						case "anthropic/claude-3.5-haiku-20241022:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 1.25
							modelInfo.cacheReadsPrice = 0.1
							break
						case "anthropic/claude-3-opus":
						case "anthropic/claude-3-opus:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 18.75
							modelInfo.cacheReadsPrice = 1.5
							break
						case "anthropic/claude-3-haiku":
						case "anthropic/claude-3-haiku:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 0.3
							modelInfo.cacheReadsPrice = 0.03
							break
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("Invalid response from OpenRouter API")
			}
			await fs.writeFile(openRouterModelsFilePath, JSON.stringify(models))
			this.outputChannel.appendLine("OpenRouter models fetched and saved")
		} catch (error) {
			this.outputChannel.appendLine(
				`Error fetching OpenRouter models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "openRouterModels", openRouterModels: models })
		return models
	}

	async refreshUnboundModels() {
		const models: Record<string, ModelInfo> = {}
		try {
			const cacheDir = await this.ensureCacheDirectoryExists()
			const unboundModelsFilePath = PathUtils.joinPath(cacheDir, "unbound-models.json")
			const response = await axios.get("https://api.getunbound.ai/models")
			if (response.data) {
				const rawModels = response.data
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.maxTokensOutput,
						contextWindow: rawModel.maxTokensInput,
						supportsImages: rawModel.capabilities?.includes("input:image"),
						supportsComputerUse: rawModel.capabilities?.includes("computer_use"),
						supportsPromptCache: rawModel.capabilities?.includes("caching"),
						inputPrice: parseFloat(rawModel.pricePerToken?.input) * 1_000_000,
						outputPrice: parseFloat(rawModel.pricePerToken?.output) * 1_000_000,
						description: rawModel.description,
						cacheWritesPrice: parseFloat(rawModel.pricePerToken?.cacheWrite) * 1_000_000,
						cacheReadsPrice: parseFloat(rawModel.pricePerToken?.cacheRead) * 1_000_000,
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				this.outputChannel.appendLine("Invalid response from Unbound API")
			}
			await fs.writeFile(unboundModelsFilePath, JSON.stringify(models))
			this.outputChannel.appendLine("Unbound models fetched and saved")
		} catch (error) {
			this.outputChannel.appendLine(
				`Error fetching Unbound models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}

		await this.postMessageToWebview({ type: "unboundModels", unboundModels: models })
		return models
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = PathUtils.joinPath(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = PathUtils.joinPath(
				taskDirPath,
				GlobalFileNames.apiConversationHistory,
			)
			const uiMessagesFilePath = PathUtils.joinPath(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesnt save to disk for some reason
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.coolcline?.taskId) {
			// non-current task
			const { historyItem } = await this.getTaskWithId(id)
			await this.initCoolClineWithHistoryItem(historyItem) // clears existing task
		}
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteTaskWithId(id: string) {
		if (id === this.coolcline?.taskId) {
			await this.clearTask()
		}

		const { taskDirPath, apiConversationHistoryFilePath, uiMessagesFilePath } = await this.getTaskWithId(id)

		await this.deleteTaskFromState(id)

		// Delete the task files
		const apiConversationHistoryFileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
		if (apiConversationHistoryFileExists) {
			await fs.unlink(apiConversationHistoryFilePath)
		}
		const uiMessagesFileExists = await fileExistsAtPath(uiMessagesFilePath)
		if (uiMessagesFileExists) {
			await fs.unlink(uiMessagesFilePath)
		}
		const legacyMessagesFilePath = PathUtils.joinPath(taskDirPath, "claude_messages.json")
		if (await fileExistsAtPath(legacyMessagesFilePath)) {
			await fs.unlink(legacyMessagesFilePath)
		}
		await fs.rmdir(taskDirPath).catch(() => {}) // succeeds if the dir is empty
	}

	async deleteTaskFromState(id: string) {
		// Remove the task from history
		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()
	}

	// 删除所有项目的所有历史记录
	async deleteAllProjectsAllHistory() {
		const answer = await vscode.window.showInformationMessage(
			"Are you sure you want to delete all history records from all projects? This action cannot be undone.",
			{ modal: true },
			"Yes",
		)

		if (answer !== "Yes") {
			return
		}

		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const currentWorkspaceHash = hashWorkingDir(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "")

		// Delete all task files
		for (const task of taskHistory) {
			try {
				const taskDirPath = PathUtils.joinPath(this.context.globalStorageUri.fsPath, "tasks", task.id)
				const apiConversationHistoryFilePath = PathUtils.joinPath(
					taskDirPath,
					GlobalFileNames.apiConversationHistory,
				)
				const uiMessagesFilePath = PathUtils.joinPath(taskDirPath, GlobalFileNames.uiMessages)
				const legacyMessagesFilePath = PathUtils.joinPath(taskDirPath, "claude_messages.json")

				// Delete related files
				await fs.rm(apiConversationHistoryFilePath, { force: true })
				await fs.rm(uiMessagesFilePath, { force: true })
				await fs.rm(legacyMessagesFilePath, { force: true })
				await fs.rmdir(taskDirPath).catch(() => {}) // Ignore directory not exist error
			} catch (error) {
				this.outputChannel.appendLine(`Error deleting task ${task.id}: ${error}`)
			}
		}

		// 同时所有 checkpoint 仓库
		try {
			await this.checkpointManager.cleanCheckpointRepositories(true, currentWorkspaceHash)
		} catch (error) {
			this.outputChannel.appendLine(`Error cleaning checkpoint repositories: ${error}`)
		}

		// Clear history records
		await this.updateGlobalState("taskHistory", [])
		await this.postStateToWebview()
	}

	// 删除当前项目的所有历史记录
	async deleteThisProjectAllHistory() {
		const answer = await vscode.window.showInformationMessage(
			"Are you sure you want to delete all history records from all projects? This action cannot be undone.",
			{ modal: true },
			"Yes",
		)

		if (answer !== "Yes") {
			return
		}

		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const currentWorkspaceHash = hashWorkingDir(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "")

		// 获取 currentShadowGitPath 当做条件查询历史记录
		const currentShadowGitPath = await getShadowGitPath(
			this.context.globalStorageUri.fsPath,
			this.coolcline?.taskId ?? "",
			currentWorkspaceHash,
		)

		if (!currentShadowGitPath) {
			vscode.window.showWarningMessage("Unable to determine current project path")
			return
		}

		// Filter tasks for current project
		const projectTasks = taskHistory.filter((item) => item.shadowGitConfigWorkTree === currentShadowGitPath)

		// Delete task files
		for (const task of projectTasks) {
			try {
				const taskDirPath = PathUtils.joinPath(this.context.globalStorageUri.fsPath, "tasks", task.id)
				const apiConversationHistoryFilePath = PathUtils.joinPath(
					taskDirPath,
					GlobalFileNames.apiConversationHistory,
				)
				const uiMessagesFilePath = PathUtils.joinPath(taskDirPath, GlobalFileNames.uiMessages)
				const legacyMessagesFilePath = PathUtils.joinPath(taskDirPath, "claude_messages.json")

				// Delete related files
				await fs.rm(apiConversationHistoryFilePath, { force: true })
				await fs.rm(uiMessagesFilePath, { force: true })
				await fs.rm(legacyMessagesFilePath, { force: true })
				await fs.rmdir(taskDirPath).catch(() => {}) // Ignore directory not exist error
			} catch (error) {
				this.outputChannel.appendLine(`Error deleting task ${task.id}: ${error}`)
			}
		}

		// 处理当前项目的 checkpoint 仓库
		try {
			await this.checkpointManager.cleanCheckpointRepositories(false, currentWorkspaceHash)
		} catch (error) {
			this.outputChannel.appendLine(`Error cleaning checkpoint repositories: ${error}`)
		}

		// Update history records, keep tasks not from current project
		const updatedTaskHistory = taskHistory.filter((item) => item.shadowGitConfigWorkTree !== currentShadowGitPath)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview() {
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			soundEnabled,
			diffEnabled,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			preferredLanguage,
			writeDelayMs,
			terminalOutputLineLimit,
			fuzzyMatchThreshold,
			mcpEnabled,
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			experiments,
			checkpointsEnabled,
			requestyModels,
			// 添加代码库索引相关状态
			codebaseIndexEnabled,
			codebaseIndexAutoStart,
			codebaseIndexExcludePaths,
			codebaseIndexIncludeTests,
			editorType,
		} = await this.getState()

		const allowedCommands = vscode.workspace.getConfiguration("coolcline").get<string[]>("allowedCommands") || []

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			uriScheme: vscode.env.uriScheme,
			coolclineMessages: this.coolcline?.coolclineMessages || [],
			taskHistory: await (async () => {
				const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
				const currentShadowGitPath = await getShadowGitPath(
					this.context.globalStorageUri.fsPath,
					this.coolcline?.taskId ?? "",
					hashWorkingDir(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""),
				)

				return history
					.filter(
						(item) =>
							item.ts &&
							item.task &&
							(!currentShadowGitPath ||
								!item.shadowGitConfigWorkTree ||
								item.shadowGitConfigWorkTree === currentShadowGitPath),
					)
					.sort((a, b) => b.ts - a.ts)
			})(),
			allowedCommands,
			shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
			soundEnabled: soundEnabled ?? true,
			soundVolume: soundVolume ?? 0.5,
			diffEnabled: diffEnabled ?? true,
			browserViewportSize: browserViewportSize ?? { width: 1280, height: 720 },
			screenshotQuality: screenshotQuality ?? 0.8,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 0.8,
			preferredLanguage: preferredLanguage ?? "en",
			writeDelayMs: writeDelayMs ?? 0,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 1000,
			mcpEnabled: mcpEnabled ?? false,
			enableMcpServerCreation: enableMcpServerCreation ?? false,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 0,
			rateLimitSeconds: rateLimitSeconds ?? 0,
			currentApiConfigName,
			listApiConfigMeta,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			experiments: experiments ?? experimentDefault,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			customModes: await this.customModesManager.getCustomModes(),
			mcpServers: this.mcpHub?.getAllServers() ?? [],
			checkpointsEnabled: checkpointsEnabled ?? true,
			requestyModels: requestyModels ?? {},
			codebaseIndexEnabled,
			codebaseIndexAutoStart,
			codebaseIndexExcludePaths,
			codebaseIndexIncludeTests,
			editorType,
		}
	}

	async clearTask() {
		this.coolcline?.abortTask()
		this.coolcline = undefined // removes reference to it, so once promises end it will be garbage collected
	}

	// Caching mechanism to keep track of webview messages + API conversation history per provider instance

	/*
	Now that we use retainContextWhenHidden, we don't have to store a cache of coolcline messages in the user's state, but we could to reduce memory footprint in long conversations.

	- We have to be careful of what state is shared between CoolClineProvider instances since there could be multiple instances of the extension running at once. For example when we cached coolcline messages using the same key, two instances of the extension could end up using the same key and overwriting each other's messages.
	- Some state does need to be shared between the instances, i.e. the API key--however there doesn't seem to be a good way to notfy the other instances that the API key has changed.

	We need to use a unique identifier for each CoolClineProvider instance's message cache since we could be running several instances of the extension outside of just the sidebar i.e. in editor panels.

	// conversation history to send in API requests

	/*
	It seems that some API messages do not comply with vscode state requirements. Either the Anthropic library is manipulating these values somehow in the backend in a way thats creating cyclic references, or the API returns a function or a Symbol as part of the message content.
	VSCode docs about state: "The value must be JSON-stringifyable ... value — A value. MUST not contain cyclic references."
	For now we'll store the conversation history in memory, and if we need to store in state directly we'd need to do a manual conversion to ensure proper json stringification.
	*/

	// getApiConversationHistory(): Anthropic.MessageParam[] {
	// 	// const history = (await this.getGlobalState(
	// 	// 	this.getApiConversationHistoryStateKey()
	// 	// )) as Anthropic.MessageParam[]
	// 	// return history || []
	// 	return this.apiConversationHistory
	// }

	// setApiConversationHistory(history: Anthropic.MessageParam[] | undefined) {
	// 	// await this.updateGlobalState(this.getApiConversationHistoryStateKey(), history)
	// 	this.apiConversationHistory = history || []
	// }

	// addMessageToApiConversationHistory(message: Anthropic.MessageParam): Anthropic.MessageParam[] {
	// 	// const history = await this.getApiConversationHistory()
	// 	// history.push(message)
	// 	// await this.setApiConversationHistory(history)
	// 	// return history
	// 	this.apiConversationHistory.push(message)
	// 	return this.apiConversationHistory
	// }

	/*
	Storage
	https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	https://www.eliostruyf.com/devhack-code-extension-storage-options/
	*/

	async getState() {
		const [
			storedllmProvider,
			apiModelId,
			apiKey,
			glamaApiKey,
			glamaModelId,
			glamaModelInfo,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiCustomModelInfo,
			openAiUseAzure,
			ollamaModelId,
			ollamaBaseUrl,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			mistralApiKey,
			azureApiVersion,
			openAiStreamingEnabled,
			openRouterModelId,
			openRouterModelInfo,
			openRouterBaseUrl,
			openRouterUseMiddleOutTransform,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			taskHistory,
			allowedCommands,
			soundEnabled,
			diffEnabled,
			soundVolume,
			browserViewportSize,
			fuzzyMatchThreshold,
			preferredLanguage,
			writeDelayMs,
			screenshotQuality,
			terminalOutputLineLimit,
			mcpEnabled,
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			vsCodeLmModelSelector,
			mode,
			modeApiConfigs,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			customModes,
			experiments,
			unboundApiKey,
			unboundModelId,
			checkpointsEnabled,
			modelTemperature,
			requestyModels,
			requestyModelId,
			requestyModelInfo,
			requestyApiKey,
			codebaseIndexEnabled,
			codebaseIndexAutoStart,
			codebaseIndexExcludePaths,
			codebaseIndexIncludeTests,
			editorType,
		] = await Promise.all([
			this.getGlobalState("llmProvider") as Promise<llmProvider | undefined>,
			this.getGlobalState("apiModelId") as Promise<string | undefined>,
			this.getSecret("apiKey") as Promise<string | undefined>,
			this.getSecret("glamaApiKey") as Promise<string | undefined>,
			this.getGlobalState("glamaModelId") as Promise<string | undefined>,
			this.getGlobalState("glamaModelInfo") as Promise<ModelInfo | undefined>,
			this.getSecret("openRouterApiKey") as Promise<string | undefined>,
			this.getSecret("awsAccessKey") as Promise<string | undefined>,
			this.getSecret("awsSecretKey") as Promise<string | undefined>,
			this.getSecret("awsSessionToken") as Promise<string | undefined>,
			this.getGlobalState("awsRegion") as Promise<string | undefined>,
			this.getGlobalState("awsUseCrossRegionInference") as Promise<boolean | undefined>,
			this.getGlobalState("awsProfile") as Promise<string | undefined>,
			this.getGlobalState("awsUseProfile") as Promise<boolean | undefined>,
			this.getGlobalState("vertexProjectId") as Promise<string | undefined>,
			this.getGlobalState("vertexRegion") as Promise<string | undefined>,
			this.getGlobalState("openAiBaseUrl") as Promise<string | undefined>,
			this.getSecret("openAiApiKey") as Promise<string | undefined>,
			this.getGlobalState("openAiModelId") as Promise<string | undefined>,
			this.getGlobalState("openAiCustomModelInfo") as Promise<ModelInfo | undefined>,
			this.getGlobalState("openAiUseAzure") as Promise<boolean | undefined>,
			this.getGlobalState("ollamaModelId") as Promise<string | undefined>,
			this.getGlobalState("ollamaBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("lmStudioModelId") as Promise<string | undefined>,
			this.getGlobalState("lmStudioBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("anthropicBaseUrl") as Promise<string | undefined>,
			this.getSecret("geminiApiKey") as Promise<string | undefined>,
			this.getSecret("openAiNativeApiKey") as Promise<string | undefined>,
			this.getSecret("deepSeekApiKey") as Promise<string | undefined>,
			this.getSecret("mistralApiKey") as Promise<string | undefined>,
			this.getGlobalState("azureApiVersion") as Promise<string | undefined>,
			this.getGlobalState("openAiStreamingEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("openRouterModelId") as Promise<string | undefined>,
			this.getGlobalState("openRouterModelInfo") as Promise<ModelInfo | undefined>,
			this.getGlobalState("openRouterBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("openRouterUseMiddleOutTransform") as Promise<boolean | undefined>,
			this.getGlobalState("lastShownAnnouncementId") as Promise<string | undefined>,
			this.getGlobalState("customInstructions") as Promise<string | undefined>,
			this.getGlobalState("alwaysAllowReadOnly") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowWrite") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowExecute") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowBrowser") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowMcp") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysAllowModeSwitch") as Promise<boolean | undefined>,
			this.getGlobalState("taskHistory") as Promise<HistoryItem[] | undefined>,
			this.getGlobalState("allowedCommands") as Promise<string[] | undefined>,
			this.getGlobalState("soundEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("diffEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("soundVolume") as Promise<number | undefined>,
			this.getGlobalState("browserViewportSize") as Promise<string | undefined>,
			this.getGlobalState("fuzzyMatchThreshold") as Promise<number | undefined>,
			this.getGlobalState("preferredLanguage") as Promise<string | undefined>,
			this.getGlobalState("writeDelayMs") as Promise<number | undefined>,
			this.getGlobalState("screenshotQuality") as Promise<number | undefined>,
			this.getGlobalState("terminalOutputLineLimit") as Promise<number | undefined>,
			this.getGlobalState("mcpEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("enableMcpServerCreation") as Promise<boolean | undefined>,
			this.getGlobalState("alwaysApproveResubmit") as Promise<boolean | undefined>,
			this.getGlobalState("requestDelaySeconds") as Promise<number | undefined>,
			this.getGlobalState("rateLimitSeconds") as Promise<number | undefined>,
			this.getGlobalState("currentApiConfigName") as Promise<string | undefined>,
			this.getGlobalState("listApiConfigMeta") as Promise<ApiConfigMeta[] | undefined>,
			this.getGlobalState("vsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
			this.getGlobalState("mode") as Promise<Mode | undefined>,
			this.getGlobalState("modeApiConfigs") as Promise<Record<Mode, string> | undefined>,
			this.getGlobalState("customModePrompts") as Promise<CustomModePrompts | undefined>,
			this.getGlobalState("customSupportPrompts") as Promise<CustomSupportPrompts | undefined>,
			this.getGlobalState("enhancementApiConfigId") as Promise<string | undefined>,
			this.getGlobalState("autoApprovalEnabled") as Promise<boolean | undefined>,
			this.customModesManager.getCustomModes(),
			this.getGlobalState("experiments") as Promise<Record<ExperimentId, boolean> | undefined>,
			this.getSecret("unboundApiKey") as Promise<string | undefined>,
			this.getGlobalState("unboundModelId") as Promise<string | undefined>,
			this.getGlobalState("checkpointsEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("modelTemperature") as Promise<number | undefined>,
			this.getGlobalState("requestyModels") as Promise<Record<string, ModelInfo> | undefined>,
			this.getGlobalState("requestyModelId") as Promise<string | undefined>,
			this.getGlobalState("requestyModelInfo") as Promise<ModelInfo | undefined>,
			this.getSecret("requestyApiKey") as Promise<string | undefined>,
			this.getGlobalState("codebaseIndexEnabled") as Promise<boolean | undefined>,
			this.getGlobalState("codebaseIndexAutoStart") as Promise<boolean | undefined>,
			this.getGlobalState("codebaseIndexExcludePaths") as Promise<string | undefined>,
			this.getGlobalState("codebaseIndexIncludeTests") as Promise<boolean | undefined>,
			this.getGlobalState("editorType") as Promise<string | undefined>,
		])

		let llmProvider: llmProvider
		if (storedllmProvider) {
			llmProvider = storedllmProvider
		} else {
			if (apiKey) {
				llmProvider = "anthropic"
			} else {
				llmProvider = "vscode-lm"
			}
		}

		return {
			apiConfiguration: {
				llmProvider,
				apiModelId,
				apiKey,
				glamaApiKey,
				glamaModelId,
				glamaModelInfo,
				openRouterApiKey,
				awsAccessKey,
				awsSecretKey,
				awsSessionToken,
				awsRegion,
				awsUseCrossRegionInference,
				awsProfile,
				awsUseProfile,
				vertexProjectId,
				vertexRegion,
				openAiBaseUrl,
				openAiApiKey,
				openAiModelId,
				openAiCustomModelInfo,
				openAiUseAzure,
				ollamaModelId,
				ollamaBaseUrl,
				lmStudioModelId,
				lmStudioBaseUrl,
				anthropicBaseUrl,
				geminiApiKey,
				openAiNativeApiKey,
				deepSeekApiKey,
				mistralApiKey,
				azureApiVersion,
				openAiStreamingEnabled,
				openRouterModelId,
				openRouterModelInfo,
				openRouterBaseUrl,
				openRouterUseMiddleOutTransform,
				vsCodeLmModelSelector,
				unboundApiKey,
				unboundModelId,
				modelTemperature,
				requestyApiKey,
				requestyModelId,
				requestyModelInfo,
			},
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			taskHistory,
			allowedCommands,
			soundEnabled: soundEnabled ?? false,
			diffEnabled: diffEnabled ?? true,
			soundVolume,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			mode: mode ?? defaultModeSlug,
			preferredLanguage:
				preferredLanguage ??
				(() => {
					const vscodeLang = vscode.env.language
					const langMap: { [key: string]: string } = {
						en: "English",
						ar: "Arabic",
						"pt-br": "Brazilian Portuguese",
						cs: "Czech",
						fr: "French",
						de: "German",
						hi: "Hindi",
						hu: "Hungarian",
						it: "Italian",
						ja: "Japanese",
						ko: "Korean",
						pl: "Polish",
						pt: "Portuguese",
						ru: "Russian",
						"zh-cn": "Simplified Chinese",
						es: "Spanish",
						"zh-tw": "Traditional Chinese",
						tr: "Turkish",
					}
					return langMap[vscodeLang.split("-")[0]] ?? "English"
				})(),
			mcpEnabled: mcpEnabled ?? true,
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: Math.max(5, requestDelaySeconds ?? 10),
			rateLimitSeconds: rateLimitSeconds ?? 0,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			modeApiConfigs: modeApiConfigs ?? ({} as Record<Mode, string>),
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			experiments: experiments ?? experimentDefault,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			customModes,
			checkpointsEnabled: checkpointsEnabled ?? true,
			requestyModels: requestyModels ?? {},
			requestyModelId,
			requestyModelInfo,
			codebaseIndexEnabled: codebaseIndexEnabled ?? true,
			codebaseIndexAutoStart: codebaseIndexAutoStart ?? true,
			codebaseIndexExcludePaths: codebaseIndexExcludePaths ?? "node_modules,dist,build",
			codebaseIndexIncludeTests: codebaseIndexIncludeTests ?? false,
			editorType,
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)

		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await this.updateGlobalState("taskHistory", history)
		return history
	}

	// global

	async updateGlobalState(key: GlobalStateKey, value: any) {
		await this.context.globalState.update(key, value)
	}

	async getGlobalState(key: GlobalStateKey) {
		return await this.context.globalState.get(key)
	}

	// workspace

	private async updateWorkspaceState(key: string, value: any) {
		await this.context.workspaceState.update(key, value)
	}

	private async getWorkspaceState(key: string) {
		return await this.context.workspaceState.get(key)
	}

	// private async clearState() {
	// 	this.context.workspaceState.keys().forEach((key) => {
	// 		this.context.workspaceState.update(key, undefined)
	// 	})
	// 	this.context.globalState.keys().forEach((key) => {
	// 		this.context.globalState.update(key, undefined)
	// 	})
	// 	this.context.secrets.delete("apiKey")
	// }

	// secrets

	public async storeSecret(key: SecretKey, value?: string) {
		if (value) {
			await this.context.secrets.store(key, value)
		} else {
			await this.context.secrets.delete(key)
		}
	}

	private async getSecret(key: SecretKey) {
		return await this.context.secrets.get(key)
	}

	// dev

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			"Are you sure you want to delete all data in the extension? This cannot be undone.",
			{ modal: true },
			"Yes",
		)

		if (answer !== "Yes") {
			return
		}

		for (const key of this.context.globalState.keys()) {
			await this.context.globalState.update(key, undefined)
		}
		const secretKeys: SecretKey[] = [
			"apiKey",
			"glamaApiKey",
			"openRouterApiKey",
			"awsAccessKey",
			"awsSecretKey",
			"awsSessionToken",
			"openAiApiKey",
			"geminiApiKey",
			"openAiNativeApiKey",
			"deepSeekApiKey",
			"mistralApiKey",
			"unboundApiKey",
		]
		for (const key of secretKeys) {
			await this.storeSecret(key, undefined)
		}
		await this.configManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()
		if (this.coolcline) {
			this.coolcline.abortTask()
			this.coolcline = undefined
		}
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })

		// 删除所有历史记录，包括 git 仓库
		await this.deleteAllProjectsAllHistory()
	}

	// integration tests

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.coolcline?.coolclineMessages || []
	}

	// logging
	public log(message: string) {
		this.outputChannel.appendLine(message)
	}

	public async cancelTask() {
		if (this.coolcline) {
			try {
				const { historyItem } = await this.getTaskWithId(this.coolcline.taskId)
				this.coolcline.abortTask()

				// 添加日志记录任务取消开始
				this.outputChannel.appendLine(`[cancelTask] Cancelling task ${this.coolcline.taskId}`)

				await pWaitFor(
					() =>
						this.coolcline === undefined ||
						this.coolcline.isStreaming === false ||
						this.coolcline.didFinishAbortingStream ||
						this.coolcline.isWaitingForFirstChunk,
					{
						timeout: 3_000,
					},
				).catch((error) => {
					// 使用 outputChannel 记录详细错误
					this.outputChannel.appendLine(
						`[cancelTask] Failed to abort task: ${error instanceof Error ? error.message : String(error)}`,
					)
				})

				if (this.coolcline) {
					this.coolcline.abandoned = true
					// 添加日志记录任务标记为已放弃
					this.outputChannel.appendLine(`[cancelTask] Task ${this.coolcline.taskId} marked as abandoned`)
				}

				await this.initCoolClineWithHistoryItem(historyItem)
				// 添加日志记录任务取消完成
				this.outputChannel.appendLine(`[cancelTask] Task ${historyItem.id} cancelled successfully`)
			} catch (error) {
				// 使用 outputChannel 记录错误
				this.outputChannel.appendLine(
					`[cancelTask] Error cancelling task: ${error instanceof Error ? error.message : String(error)}`,
				)
				throw error // 重新抛出错误以便上层处理
			}
		}
	}

	async refreshRequestyModels() {
		const requestyModelsFilePath = PathUtils.joinPath(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.requestyModels,
		)

		const models: Record<string, ModelInfo> = {}
		try {
			if (!this.requestyProvider) {
				this.outputChannel.appendLine("Requesty provider not initialized")
				return models
			}

			const response = await axios.get("https://router.requesty.ai/v1/models")

			// 添加日志
			// console.log("Requesty API Response:", JSON.stringify(response.data, null, 2))

			if (response.data?.data) {
				const rawModels = response.data.data
				for (const rawModel of rawModels) {
					// 添加日志
					// console.log("Processing model:", JSON.stringify(rawModel, null, 2))

					const modelInfo: ModelInfo = {
						contextWindow: rawModel.context_length,
						maxTokens: rawModel.max_tokens,
						inputPrice: rawModel.pricing?.prompt,
						outputPrice: rawModel.pricing?.completion,
						supportsImages: rawModel.supports_images || false,
						supportsPromptCache: false,
						supportsComputerUse: true,
						description: rawModel.description,
						reasoningEffort: "medium",
					}
					models[rawModel.id] = modelInfo
				}

				await fs.writeFile(requestyModelsFilePath, JSON.stringify(models))
				this.outputChannel.appendLine("Requesty models fetched and saved")
			} else {
				this.outputChannel.appendLine("Invalid response from Requesty API")
			}

			this.postMessageToWebview({ type: "requestyModels", requestyModels: models })
			return models
		} catch (error) {
			this.outputChannel.appendLine(`Error refreshing Requesty models: ${error}`)
			return models
		}
	}
}
