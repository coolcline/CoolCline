// type that represents json data that is sent from extension to webview, called ExtensionMessage and has 'type' enum which can be 'plusButtonClicked' or 'settingsButtonClicked' or 'hello'

import { ApiConfiguration, llmProvider, ModelInfo } from "./api"
import { HistoryItem } from "./HistoryItem"
import { McpServer } from "./mcp"
import { GitCommit } from "../utils/git"
import { Mode, CustomModePrompts, ModeConfig } from "./modes"
import { CustomSupportPrompts } from "./support-prompt"
import { ExperimentId } from "./experiments"
import { WebViewMessagePayload } from "./WebviewMessage"

export interface LanguageModelChatSelector {
	vendor?: string
	family?: string
	version?: string
	id?: string
}

// webview will hold state
export interface ExtensionMessage {
	type:
		| "state"
		| "invoke"
		| "action"
		| "theme"
		| "selectedImages"
		| "workspaceUpdated"
		| "partialMessage"
		| "glamaModels"
		| "openRouterModels"
		| "openAiModels"
		| "ollamaModels"
		| "lmStudioModels"
		| "vsCodeLmModels"
		| "listApiConfig"
		| "unboundModels"
		| "requestyModels"
		| "mcpServers"
		| "enhancedPrompt"
		| "commitSearchResults"
		| "vsCodeLmApiAvailable"
		| "requestVsCodeLmModels"
		| "updatePrompt"
		| "systemPrompt"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "currentCheckpointUpdated"
		| "refreshRequestyModels"
		| "checkpointRestoreComplete"
		| "extensionState"
		| "editorType"
	text?: string
	action?:
		| "chatButtonClicked"
		| "mcpButtonClicked"
		| "settingsButtonClicked"
		| "historyButtonClicked"
		| "promptsButtonClicked"
		| "didBecomeVisible"
	invoke?: "sendMessage" | "primaryButtonClick" | "secondaryButtonClick" | "setChatBoxMessage"
	state?: ExtensionState
	images?: string[]
	ollamaModels?: string[]
	lmStudioModels?: string[]
	vsCodeLmModels?: { vendor?: string; family?: string; version?: string; id?: string }[]
	filePaths?: string[]
	openedTabs?: Array<{
		label: string
		isActive: boolean
		path?: string
	}>
	partialMessage?: CoolClineMessage
	glamaModels?: Record<string, ModelInfo>
	openRouterModels?: Record<string, ModelInfo>
	openAiModels?: string[]
	mcpServers?: McpServer[]
	commits?: GitCommit[]
	listApiConfig?: ApiConfigMeta[]
	mode?: Mode
	customMode?: ModeConfig
	slug?: string
	unboundModels?: Record<string, ModelInfo>
	requestyModels?: Record<string, ModelInfo>
	payload?: WebViewMessagePayload
}

export interface ApiConfigMeta {
	id: string
	name: string
	llmProvider?: llmProvider
}

export interface ExtensionState {
	version: string
	coolclineMessages: CoolClineMessage[]
	taskHistory: HistoryItem[]
	shouldShowAnnouncement: boolean
	apiConfiguration?: ApiConfiguration
	currentApiConfigName?: string
	listApiConfigMeta?: ApiConfigMeta[]
	customInstructions?: string
	customModePrompts?: CustomModePrompts
	customSupportPrompts?: CustomSupportPrompts
	alwaysAllowReadOnly?: boolean
	alwaysAllowWrite?: boolean
	alwaysAllowExecute?: boolean
	alwaysAllowBrowser?: boolean
	alwaysAllowMcp?: boolean
	alwaysApproveResubmit?: boolean
	alwaysAllowModeSwitch?: boolean
	requestDelaySeconds: number
	rateLimitSeconds: number // Minimum time between successive requests (0 = disabled)
	uriScheme?: string
	allowedCommands?: string[]
	soundEnabled?: boolean
	soundVolume?: number
	diffEnabled?: boolean
	browserViewportSize?: string
	screenshotQuality?: number
	fuzzyMatchThreshold?: number
	preferredLanguage: string
	writeDelayMs: number
	terminalOutputLineLimit?: number
	mcpEnabled: boolean
	enableMcpServerCreation: boolean
	mode: Mode
	modeApiConfigs?: Record<Mode, string>
	enhancementApiConfigId?: string
	experiments: Record<ExperimentId, boolean> // Map of experiment IDs to their enabled state
	autoApprovalEnabled?: boolean
	customModes: ModeConfig[]
	toolRequirements?: Record<string, boolean> // Map of tool names to their requirements (e.g. {"apply_diff": true} if diffEnabled)
	checkpointsEnabled: boolean
	requestyModels: Record<string, ModelInfo>
	// 编辑器类型设置
	editorType?: string
	// 代码库索引相关状态
	codebaseIndexEnabled: boolean
	codebaseIndexAutoStart: boolean
	codebaseIndexExcludePaths?: string
	codebaseIndexIncludeTests?: boolean
}

export interface CoolClineMessage {
	ts: number
	type: "ask" | "say"
	ask?: CoolClineAsk
	say?: CoolClineSay
	text?: string
	images?: string[]
	partial?: boolean
	reasoning?: string
	conversationHistoryIndex?: number
	conversationHistoryDeletedRange?: [number, number] // 用于记录对话历史被截断的范围
}

export type CoolClineAsk =
	| "followup"
	| "command"
	| "command_output"
	| "completion_result"
	| "tool"
	| "api_req_failed"
	| "resume_task"
	| "resume_completed_task"
	| "mistake_limit_reached"
	| "browser_action_launch"
	| "use_mcp_server"

export type CoolClineSay =
	| "task"
	| "error"
	| "api_req_started"
	| "api_req_finished"
	| "text"
	| "reasoning"
	| "completion_result"
	| "user_feedback"
	| "user_feedback_diff"
	| "api_req_retried"
	| "api_req_retry_delayed"
	| "command_output"
	| "tool"
	| "shell_integration_warning"
	| "browser_action"
	| "browser_action_result"
	| "command"
	| "mcp_server_request_started"
	| "mcp_server_response"
	| "new_task_started"
	| "new_task"
	| "api_req_deleted"
	| "checkpoint_saved"

export interface CoolClineSayTool {
	tool:
		| "editedExistingFile"
		| "appliedDiff"
		| "newFileCreated"
		| "readFile"
		| "listFilesTopLevel"
		| "listFilesRecursive"
		| "listCodeDefinitionNames"
		| "searchFiles"
		| "switchMode"
		| "newTask"
	path?: string
	diff?: string
	content?: string
	regex?: string
	filePattern?: string
	mode?: string
	reason?: string
}

// must keep in sync with system prompt
export const browserActions = ["launch", "click", "type", "scroll_down", "scroll_up", "close"] as const
export type BrowserAction = (typeof browserActions)[number]

export interface CoolClineSayBrowserAction {
	action: BrowserAction
	coordinate?: string
	text?: string
}

export type BrowserActionResult = {
	screenshot?: string
	logs?: string
	currentUrl?: string
	currentMousePosition?: string
}

export interface CoolClineAskUseMcpServer {
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
}

export interface CoolClineApiReqInfo {
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: CoolClineApiReqCancelReason
	streamingFailedMessage?: string
}

export type CoolClineApiReqCancelReason = "streaming_failed" | "user_cancelled"
