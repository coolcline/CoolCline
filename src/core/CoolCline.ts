import { Anthropic } from "@anthropic-ai/sdk"
import cloneDeep from "clone-deep"
import { DiffStrategy, getDiffStrategy, UnifiedDiffStrategy } from "./diff/DiffStrategy"
import { validateToolUse, isToolAllowedForMode, ToolName } from "./mode-validator"
import delay from "delay"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import { serializeError } from "serialize-error"
import * as vscode from "vscode"
import { ApiHandler, SingleCompletionHandler, buildApiHandler } from "../api"
import { ApiStream } from "../api/transform/stream"
import { DiffViewProvider } from "../integrations/editor/DiffViewProvider"
import { findToolName, formatContentBlockToMarkdown } from "../integrations/misc/export-markdown"
import {
	extractTextFromFile,
	addLineNumbers,
	stripLineNumbers,
	everyLineHasLineNumbers,
	truncateOutput,
} from "../integrations/misc/extract-text"
import { TerminalManager } from "../integrations/terminal/TerminalManager"
import { UrlContentFetcher } from "../services/browser/UrlContentFetcher"
import { listFiles } from "../services/glob/list-files"
import { regexSearchFiles } from "../services/ripgrep"
import { parseSourceCodeForDefinitionsTopLevel } from "../services/tree-sitter"
import { ApiConfiguration } from "../shared/api"
import { findLastIndex } from "../shared/array"
import { combineApiRequests } from "../shared/combineApiRequests"
import { combineCommandSequences } from "../shared/combineCommandSequences"
import {
	BrowserAction,
	BrowserActionResult,
	browserActions,
	CoolClineApiReqCancelReason,
	CoolClineApiReqInfo,
	CoolClineAsk,
	CoolClineAskUseMcpServer,
	CoolClineMessage,
	CoolClineSay,
	CoolClineSayBrowserAction,
	CoolClineSayTool,
} from "../shared/ExtensionMessage"
import { getApiMetrics } from "../shared/getApiMetrics"
import { HistoryItem } from "../shared/HistoryItem"
import { CoolClineAskResponse } from "../shared/WebviewMessage"
import { calculateApiCost } from "../utils/cost"
import { fileExistsAtPath } from "../utils/fs"
import { arePathsEqual, getReadablePath } from "../utils/path"
import { parseMentions } from "./mentions"
import { AssistantMessageContent, parseAssistantMessage, ToolParamName, ToolUseName } from "./assistant-message"
import { formatResponse } from "./prompts/responses"
import { SYSTEM_PROMPT } from "./prompts/system"
import { modes, defaultModeSlug, getModeBySlug } from "../shared/modes"
import { truncateConversationIfNeeded } from "./sliding-window"
import { CoolClineProvider, GlobalFileNames } from "./webview/CoolClineProvider"
import { detectCodeOmission } from "../integrations/editor/detect-omission"
import { BrowserSession } from "../services/browser/BrowserSession"
import { OpenRouterHandler } from "../api/providers/openrouter"
import { McpHub } from "../services/mcp/McpHub"
import crypto from "crypto"
import { insertGroups } from "./diff/insert-groups"
import { EXPERIMENT_IDS, experiments as Experiments } from "../shared/experiments"
import { CheckpointService } from "../services/checkpoints/CheckpointService"
import { logger } from "../utils/logging"
import { CheckpointRestoreMode } from "../services/checkpoints/types"
import {
	getShadowGitPath,
	hashWorkingDir,
	PathUtils,
	ensureShadowGitDir,
} from "../services/checkpoints/CheckpointUtils"

const cwd =
	vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ??
	PathUtils.joinPath(os.homedir(), "Desktop") // may or may not exist but fs checking existence would immediately ask for permission which would be bad UX, need to come up with a better solution

type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type UserContent = Array<
	Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam
>

export const DIFF_VIEW_URI_SCHEME = "coolcline-diff"

export interface ToolCall {
	name: string
	parameters: Record<string, any>
}

export class CoolCline {
	readonly taskId: string
	api: ApiHandler
	private terminalManager: TerminalManager
	private urlContentFetcher: UrlContentFetcher
	private browserSession: BrowserSession
	private didEditFile: boolean = false
	customInstructions?: string
	diffStrategy?: DiffStrategy
	diffEnabled: boolean = false
	checkpointsEnabled: boolean = true
	private checkpointService?: CheckpointService
	fuzzyMatchThreshold: number = 1.0
	isStreaming: boolean = false
	didFinishAbortingStream: boolean = false
	isWaitingForFirstChunk: boolean = true

	apiConversationHistory: (Anthropic.MessageParam & { ts?: number })[] = []
	coolclineMessages: CoolClineMessage[] = []
	private askResponse?: CoolClineAskResponse
	private askResponseText?: string
	private askResponseImages?: string[]
	private lastMessageTs?: number
	private consecutiveMistakeCount: number = 0
	private consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map()
	private providerRef: WeakRef<CoolClineProvider>
	private abort: boolean = false
	abandoned = false
	private diffViewProvider: DiffViewProvider
	private lastApiRequestTime?: number
	isInitialized = false

	// streaming
	private currentStreamingContentIndex = 0
	private assistantMessageContent: AssistantMessageContent[] = []
	private presentAssistantMessageLocked = false
	private presentAssistantMessageHasPendingUpdates = false
	private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	private userMessageContentReady = false
	private didRejectTool = false
	private didAlreadyUseTool = false
	private didCompleteReadingStream = false
	private awaitCreateCheckpoint: boolean = false // 新增状态
	private conversationHistoryDeletedRange?: [number, number] // 用于记录对话历史被截断的范围

	constructor(
		provider: CoolClineProvider,
		apiConfiguration: ApiConfiguration,
		customInstructions?: string,
		enableDiff?: boolean,
		enableCheckpoints?: boolean,
		fuzzyMatchThreshold?: number,
		task?: string | undefined,
		images?: string[] | undefined,
		historyItem?: HistoryItem | undefined,
		experiments?: Record<string, boolean>,
	) {
		if (!task && !images && !historyItem) {
			throw new Error("Either historyItem or task/images must be provided")
		}

		this.taskId = crypto.randomUUID()
		this.api = buildApiHandler(apiConfiguration)
		this.terminalManager = new TerminalManager()
		this.urlContentFetcher = new UrlContentFetcher(provider.context)
		this.browserSession = new BrowserSession(provider.context)
		this.customInstructions = customInstructions
		this.diffEnabled = enableDiff ?? false
		this.checkpointsEnabled = enableCheckpoints ?? true
		this.fuzzyMatchThreshold = fuzzyMatchThreshold ?? 1.0
		this.providerRef = new WeakRef(provider)
		this.diffViewProvider = new DiffViewProvider(cwd)

		if (historyItem) {
			this.taskId = historyItem.id
		}

		// Initialize diffStrategy based on current state
		this.updateDiffStrategy(Experiments.isEnabled(experiments ?? {}, EXPERIMENT_IDS.DIFF_STRATEGY))

		if (task || images) {
			this.startTask(task, images)
		} else if (historyItem) {
			this.resumeTaskFromHistory()
		}
	}

	// Add method to update diffStrategy
	async updateDiffStrategy(experimentalDiffStrategy?: boolean) {
		// If not provided, get from current state
		if (experimentalDiffStrategy === undefined) {
			const { experiments: stateExperimental } = (await this.providerRef.deref()?.getState()) ?? {}
			experimentalDiffStrategy = stateExperimental?.[EXPERIMENT_IDS.DIFF_STRATEGY] ?? false
		}
		this.diffStrategy = getDiffStrategy(this.api.getModel().id, this.fuzzyMatchThreshold, experimentalDiffStrategy)
	}

	// Storing task to disk for history

	private async ensureTaskDirectoryExists(): Promise<string> {
		const vscodeGlobalStorageCoolClinePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
		if (!vscodeGlobalStorageCoolClinePath) {
			throw new Error("Global storage uri is invalid")
		}
		const taskDir = PathUtils.joinPath(vscodeGlobalStorageCoolClinePath, "tasks", this.taskId)
		await fs.mkdir(taskDir, { recursive: true })
		return taskDir
	}

	private async getSavedApiConversationHistory(): Promise<Anthropic.MessageParam[]> {
		const filePath = PathUtils.joinPath(
			await this.ensureTaskDirectoryExists(),
			GlobalFileNames.apiConversationHistory,
		)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			return JSON.parse(await fs.readFile(filePath, "utf8"))
		}
		return []
	}

	private async addToApiConversationHistory(message: Anthropic.MessageParam) {
		const messageWithTs = { ...message, ts: Date.now() }
		this.apiConversationHistory.push(messageWithTs)
		await this.saveApiConversationHistory()
	}

	async overwriteApiConversationHistory(newHistory: Anthropic.MessageParam[]) {
		this.apiConversationHistory = newHistory
		await this.saveApiConversationHistory()
	}

	private async saveApiConversationHistory() {
		try {
			const filePath = PathUtils.joinPath(
				await this.ensureTaskDirectoryExists(),
				GlobalFileNames.apiConversationHistory,
			)
			await fs.writeFile(filePath, JSON.stringify(this.apiConversationHistory))
		} catch (error) {
			// in the off chance this fails, we don't want to stop the task
			console.error("Failed to save API conversation history:", error)
		}
	}

	private async getSavedCoolClineMessages(): Promise<CoolClineMessage[]> {
		const filePath = PathUtils.joinPath(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)
		if (await fileExistsAtPath(filePath)) {
			return JSON.parse(await fs.readFile(filePath, "utf8"))
		} else {
			// check old location
			const oldPath = PathUtils.joinPath(await this.ensureTaskDirectoryExists(), "claude_messages.json")
			if (await fileExistsAtPath(oldPath)) {
				const data = JSON.parse(await fs.readFile(oldPath, "utf8"))
				await fs.unlink(oldPath) // remove old file
				return data
			}
		}
		return []
	}

	private async addToCoolClineMessages(message: CoolClineMessage) {
		this.coolclineMessages.push(message)
		await this.saveCoolClineMessages()
	}

	public async overwriteCoolClineMessages(newMessages: CoolClineMessage[]) {
		this.coolclineMessages = newMessages
		await this.saveCoolClineMessages()
	}

	private static readonly MAX_MESSAGE_SIZE = 1000000 // 1MB 限制
	private static readonly MAX_MESSAGE_PREVIEW_SIZE = 100000 // 预览大小限制

	private async saveCoolClineMessages() {
		try {
			const filePath = PathUtils.joinPath(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)

			// 处理大型消息
			const processedMessages = this.coolclineMessages.map((msg) => {
				if (!msg.text) return msg

				// 检查消息大小
				if (msg.text.length > CoolCline.MAX_MESSAGE_SIZE) {
					logger.warn("消息内容过大，将被截断", {
						ctx: "coolcline",
						messageType: msg.type,
						messageLength: msg.text.length,
						limit: CoolCline.MAX_MESSAGE_SIZE,
					})

					// 对于命令输出类型的消息，添加特殊提示
					if (msg.type === "say" && msg.say === "command_output") {
						return {
							...msg,
							text:
								msg.text.substring(0, CoolCline.MAX_MESSAGE_PREVIEW_SIZE) +
								"\n\n... [输出内容过长，已截断。建议使用其他工具查看完整输出，比如将输出重定向到文件：command > output.txt]",
						}
					}

					// 其他类型消息的通用处理
					return {
						...msg,
						text: msg.text.substring(0, CoolCline.MAX_MESSAGE_PREVIEW_SIZE) + "\n... [内容过长已截断]",
					}
				}
				return msg
			})

			// 分块写入文件
			try {
				await fs.writeFile(filePath, JSON.stringify(processedMessages), "utf8")

				// 更新任务历史
				const apiMetrics = getApiMetrics(
					combineApiRequests(combineCommandSequences(processedMessages.slice(1))),
				)
				const taskMessage = processedMessages[0]
				const lastRelevantMessage =
					processedMessages[
						findLastIndex(
							processedMessages,
							(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
						)
					]

				await this.providerRef.deref()?.updateTaskHistory({
					id: this.taskId,
					ts: lastRelevantMessage.ts,
					task: taskMessage.text ?? "",
					tokensIn: apiMetrics.totalTokensIn,
					tokensOut: apiMetrics.totalTokensOut,
					cacheWrites: apiMetrics.totalCacheWrites,
					cacheReads: apiMetrics.totalCacheReads,
					totalCost: apiMetrics.totalCost,
					shadowGitConfigWorkTree: await getShadowGitPath(
						this.providerRef.deref()?.context.globalStorageUri.fsPath ?? "",
						this.taskId,
						hashWorkingDir(cwd),
					),
				})
			} catch (error) {
				// 如果写入失败，尝试只保存最近的消息
				logger.error("保存完整消息失败，尝试只保存最近的消息", {
					ctx: "coolcline",
					error: error instanceof Error ? error.message : String(error),
				})

				const recentMessages = processedMessages.slice(-10) // 只保留最近的10条消息
				await fs.writeFile(filePath, JSON.stringify(recentMessages), "utf8")

				// 通知用户
				vscode.window.showWarningMessage(
					"由于消息内容过大，只保存了最近的消息。建议清理历史记录或开启新的任务。",
				)
			}
		} catch (error) {
			logger.error("保存消息完全失败", {
				ctx: "coolcline",
				error: error instanceof Error ? error.message : String(error),
			})

			// 通知用户但继续运行
			vscode.window.showErrorMessage("保存消息历史失败。建议保存重要内容到文件并重新开始任务。")
		}
	}

	// Communicate with webview

	// partial has three valid states true (partial message), false (completion of partial message), undefined (individual complete message)
	async ask(
		type: CoolClineAsk,
		text?: string,
		partial?: boolean,
	): Promise<{ response: CoolClineAskResponse; text?: string; images?: string[] }> {
		// If this CoolCline instance was aborted by the provider, then the only thing keeping us alive is a promise still running in the background, in which case we don't want to send its result to the webview as it is attached to a new instance of CoolCline now. So we can safely ignore the result of any active promises, and this class will be deallocated. (Although we set CoolCline = undefined in provider, that simply removes the reference to this instance, but the instance is still alive until this promise resolves or rejects.)
		if (this.abort) {
			throw new Error("CoolCline instance aborted")
		}
		let askTs: number
		if (partial !== undefined) {
			const lastMessage = this.coolclineMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type
			if (partial) {
				if (isUpdatingPreviousPartial) {
					// existing partial message, so update it
					lastMessage.text = text
					lastMessage.partial = partial
					// todo be more efficient about saving and posting only new data or one whole message at a time so ignore partial for saves, and only post parts of partial message instead of whole array in new listener
					// await this.saveCoolClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
					throw new Error("Current ask promise was ignored 1")
				} else {
					// this is a new partial message, so add it with partial state
					// this.askResponse = undefined
					// this.askResponseText = undefined
					// this.askResponseImages = undefined
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addToCoolClineMessages({
						ts: askTs,
						type: "ask",
						ask: type,
						text,
						partial,
						conversationHistoryIndex: this.apiConversationHistory.length - 1, // 设置当前消息在 API 对话历史中的索引
					})
					await this.providerRef.deref()?.postStateToWebview()
					throw new Error("Current ask promise was ignored 2")
				}
			} else {
				// partial=false means its a complete version of a previously partial message
				if (isUpdatingPreviousPartial) {
					// this is the complete version of a previously partial message, so replace the partial with the complete version
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined

					/*
					Bug for the history books:
					In the webview we use the ts as the chatrow key for the virtuoso list. Since we would update this ts right at the end of streaming, it would cause the view to flicker. The key prop has to be stable otherwise react has trouble reconciling items between renders, causing unmounting and remounting of components (flickering).
					The lesson here is if you see flickering when rendering lists, it's likely because the key prop is not stable.
					So in this case we must make sure that the message ts is never altered after first setting it.
					*/
					askTs = lastMessage.ts
					this.lastMessageTs = askTs
					// lastMessage.ts = askTs
					lastMessage.text = text
					lastMessage.partial = false
					await this.saveCoolClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
				} else {
					// this is a new partial=false message, so add it like normal
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addToCoolClineMessages({ ts: askTs, type: "ask", ask: type, text })
					await this.providerRef.deref()?.postStateToWebview()
				}
			}
		} else {
			// this is a new non-partial message, so add it like normal
			// const lastMessage = this.coolclineMessages.at(-1)
			this.askResponse = undefined
			this.askResponseText = undefined
			this.askResponseImages = undefined
			askTs = Date.now()
			this.lastMessageTs = askTs
			await this.addToCoolClineMessages({
				ts: askTs,
				type: "ask",
				ask: type,
				text,
				conversationHistoryIndex: this.apiConversationHistory.length - 1, // 设置当前消息在 API 对话历史中的索引
			})
			await this.providerRef.deref()?.postStateToWebview()
		}

		await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })
		if (this.lastMessageTs !== askTs) {
			throw new Error("Current ask promise was ignored") // could happen if we send multiple asks in a row i.e. with command_output. It's important that when we know an ask could fail, it is handled gracefully
		}
		const result = { response: this.askResponse!, text: this.askResponseText, images: this.askResponseImages }
		this.askResponse = undefined
		this.askResponseText = undefined
		this.askResponseImages = undefined
		return result
	}

	async handleWebviewAskResponse(askResponse: CoolClineAskResponse, text?: string, images?: string[]) {
		if (text) {
			// 收到发送的消息（一个任务窗口追问的情况）
			// console.log("handleWebviewAskResponse,awaitCreateCheckpoint", text)
			// this.awaitCreateCheckpoint = true // 当用户发送消息时设置标记
		}
		this.askResponse = askResponse
		this.askResponseText = text
		this.askResponseImages = images
	}

	async say(type: CoolClineSay, text?: string, images?: string[], partial?: boolean): Promise<undefined> {
		if (this.abort) {
			throw new Error("CoolCline instance aborted")
		}

		if (partial !== undefined) {
			const lastMessage = this.coolclineMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type
			if (partial) {
				if (isUpdatingPreviousPartial) {
					// existing partial message, so update it
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = partial
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
				} else {
					// this is a new partial message, so add it with partial state
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addToCoolClineMessages({ ts: sayTs, type: "say", say: type, text, images, partial })
					await this.providerRef.deref()?.postStateToWebview()
				}
			} else {
				// partial=false means its a complete version of a previously partial message
				if (isUpdatingPreviousPartial) {
					// this is the complete version of a previously partial message, so replace the partial with the complete version
					this.lastMessageTs = lastMessage.ts
					// lastMessage.ts = sayTs
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = false

					// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
					await this.saveCoolClineMessages()
					// await this.providerRef.deref()?.postStateToWebview()
					await this.providerRef
						.deref()
						?.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage }) // more performant than an entire postStateToWebview
				} else {
					// this is a new partial=false message, so add it like normal
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addToCoolClineMessages({ ts: sayTs, type: "say", say: type, text, images })
					await this.providerRef.deref()?.postStateToWebview()
				}
			}
		} else {
			// this is a new non-partial message, so add it like normal
			const sayTs = Date.now()
			this.lastMessageTs = sayTs
			await this.addToCoolClineMessages({ ts: sayTs, type: "say", say: type, text, images })
			await this.providerRef.deref()?.postStateToWebview()
		}
	}

	async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) {
		await this.say(
			"error",
			`CoolCline tried to use ${toolName}${
				relPath ? ` for '${relPath.toPosix()}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`,
		)
		return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
	}

	// Task lifecycle

	private async startTask(task?: string, images?: string[]): Promise<void> {
		// 只创建必要的目录结构
		// 这一步主要是为了生成目录，这样历史记录可以记录这个目录，以便之后加载历史消息可以按项目加载
		// await ensureShadowGitDir(hashWorkingDir(cwd)) // 这个测试太难模拟环境了所以弃用
		const shadowGitDir = PathUtils.joinPath(
			this.providerRef.deref()?.context.globalStorageUri.fsPath ?? "",
			"shadow-git",
			hashWorkingDir(cwd),
		)
		try {
			// 检查目录是否存在
			await fs.access(shadowGitDir)
		} catch {
			// 目录不存在时创建
			await fs.mkdir(shadowGitDir, { recursive: true })
		}

		if (task || images) {
			this.awaitCreateCheckpoint = true // 当用户第一次创建任务并发送消息时设置标记
		}

		this.coolclineMessages = []
		this.apiConversationHistory = []
		await this.providerRef.deref()?.postStateToWebview()

		await this.say("text", task, images)

		let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)
		await this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${task}\n</task>`,
			},
			...imageBlocks,
		])
	}

	private async resumeTaskFromHistory() {
		const modifiedCoolClineMessages = await this.getSavedCoolClineMessages()
		// this.awaitCreateCheckpoint = true // 在恢复任务时设置标记，确保第一次修改操作会创建检查点

		// Remove any resume messages that may have been added before
		const lastRelevantMessageIndex = findLastIndex(
			modifiedCoolClineMessages,
			(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
		)
		if (lastRelevantMessageIndex !== -1) {
			modifiedCoolClineMessages.splice(lastRelevantMessageIndex + 1)
		}

		// since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
		const lastApiReqStartedIndex = findLastIndex(
			modifiedCoolClineMessages,
			(m) => m.type === "say" && m.say === "api_req_started",
		)
		if (lastApiReqStartedIndex !== -1) {
			const lastApiReqStarted = modifiedCoolClineMessages[lastApiReqStartedIndex]
			const { cost, cancelReason }: CoolClineApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")
			if (cost === undefined && cancelReason === undefined) {
				modifiedCoolClineMessages.splice(lastApiReqStartedIndex, 1)
			}
		}

		await this.overwriteCoolClineMessages(modifiedCoolClineMessages)
		this.coolclineMessages = await this.getSavedCoolClineMessages()

		// need to make sure that the api conversation history can be resumed by the api, even if it goes out of sync with coolcline messages
		let existingApiConversationHistory: Anthropic.Messages.MessageParam[] =
			await this.getSavedApiConversationHistory()

		// 如果没有现有的 API 对话历史，则创建一个初始对话
		if (existingApiConversationHistory.length === 0) {
			const lastCoolClineMessage = this.coolclineMessages
				.slice()
				.reverse()
				.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"))

			if (lastCoolClineMessage?.text) {
				existingApiConversationHistory = [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: lastCoolClineMessage.text,
							},
						],
					},
				]
			} else {
				existingApiConversationHistory = [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Task was interrupted and no previous conversation history found.",
							},
						],
					},
				]
			}
		}

		// Now present the coolcline messages to the user and ask if they want to resume
		const lastCoolClineMessage = this.coolclineMessages
			.slice()
			.reverse()
			.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"))

		let askType: CoolClineAsk
		if (lastCoolClineMessage?.ask === "completion_result") {
			askType = "resume_completed_task"
		} else {
			askType = "resume_task"
		}

		const { response, text, images } = await this.ask(askType) // calls poststatetowebview
		let responseText: string | undefined
		let responseImages: string[] | undefined
		if (response === "messageResponse") {
			await this.say("user_feedback", text, images)
			responseText = text
			responseImages = images
		}

		// v2.0 xml tags refactor caveat: since we don't use tools anymore, we need to replace all tool use blocks with a text block since the API disallows conversations with tool uses and no tool schema
		const conversationWithoutToolBlocks = existingApiConversationHistory.map((message) => {
			if (Array.isArray(message.content)) {
				const newContent = message.content.map((block) => {
					if (block.type === "tool_use") {
						// it's important we convert to the new tool schema format so the model doesn't get confused about how to invoke tools
						const inputAsXml = Object.entries(block.input as Record<string, string>)
							.map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
							.join("\n")
						return {
							type: "text",
							text: `<${block.name}>\n${inputAsXml}\n</${block.name}>`,
						} as Anthropic.Messages.TextBlockParam
					} else if (block.type === "tool_result") {
						// Convert block.content to text block array, removing images
						const contentAsTextBlocks = Array.isArray(block.content)
							? block.content.filter((item) => item.type === "text")
							: [{ type: "text", text: block.content }]
						const textContent = contentAsTextBlocks.map((item) => item.text).join("\n\n")
						const toolName = findToolName(block.tool_use_id, existingApiConversationHistory)
						return {
							type: "text",
							text: `[${toolName} Result]\n\n${textContent}`,
						} as Anthropic.Messages.TextBlockParam
					}
					return block
				})
				return { ...message, content: newContent }
			}
			return message
		})
		existingApiConversationHistory = conversationWithoutToolBlocks

		// FIXME: remove tool use blocks altogether

		// if the last message is an assistant message, we need to check if there's tool use since every tool use has to have a tool response
		// if there's no tool use and only a text block, then we can just add a user message
		// (note this isn't relevant anymore since we use custom tool prompts instead of tool use blocks, but this is here for legacy purposes in case users resume old tasks)

		// if the last message is a user message, we can need to get the assistant message before it to see if it made tool calls, and if so, fill in the remaining tool responses with 'interrupted'

		let modifiedOldUserContent: UserContent // either the last message if its user message, or the user message before the last (assistant) message
		let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[] // need to remove the last user message to replace with new modified user message
		if (existingApiConversationHistory.length > 0) {
			const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

			if (lastMessage.role === "assistant") {
				const content = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				const hasToolUse = content.some((block) => block.type === "tool_use")

				if (hasToolUse) {
					const toolUseBlocks = content.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]
					const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
						type: "tool_result",
						tool_use_id: block.id,
						content: "Task was interrupted before this tool call could be completed.",
					}))
					modifiedApiConversationHistory = [...existingApiConversationHistory] // no changes
					modifiedOldUserContent = [...toolResponses]
				} else {
					modifiedApiConversationHistory = [...existingApiConversationHistory]
					modifiedOldUserContent = []
				}
			} else if (lastMessage.role === "user") {
				const previousAssistantMessage: Anthropic.Messages.MessageParam | undefined =
					existingApiConversationHistory[existingApiConversationHistory.length - 2]

				const existingUserContent: UserContent = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
					const assistantContent = Array.isArray(previousAssistantMessage.content)
						? previousAssistantMessage.content
						: [{ type: "text", text: previousAssistantMessage.content }]

					const toolUseBlocks = assistantContent.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]

					if (toolUseBlocks.length > 0) {
						const existingToolResults = existingUserContent.filter(
							(block) => block.type === "tool_result",
						) as Anthropic.ToolResultBlockParam[]

						const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
							.filter(
								(toolUse) => !existingToolResults.some((result) => result.tool_use_id === toolUse.id),
							)
							.map((toolUse) => ({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: "Task was interrupted before this tool call could be completed.",
							}))

						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1) // removes the last user message
						modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
					} else {
						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
						modifiedOldUserContent = [...existingUserContent]
					}
				} else {
					modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
					modifiedOldUserContent = [...existingUserContent]
				}
			} else {
				throw new Error("Unexpected: Last message is not a user or assistant message")
			}
		} else {
			throw new Error("Unexpected: No existing API conversation history")
		}

		let newUserContent: UserContent = [...modifiedOldUserContent]

		const agoText = ((): string => {
			const timestamp = lastCoolClineMessage?.ts ?? Date.now()
			const now = Date.now()
			const diff = now - timestamp
			const minutes = Math.floor(diff / 60000)
			const hours = Math.floor(minutes / 60)
			const days = Math.floor(hours / 24)

			if (days > 0) {
				return `${days} day${days > 1 ? "s" : ""} ago`
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? "s" : ""} ago`
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
			}
			return "just now"
		})()

		const wasRecent = lastCoolClineMessage?.ts && Date.now() - lastCoolClineMessage.ts < 30_000

		newUserContent.push({
			type: "text",
			text:
				`[TASK RESUMPTION] This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '${cwd.toPosix()}'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.${
					wasRecent
						? "\n\nIMPORTANT: If the last tool use was a write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
						: ""
				}` +
				(responseText
					? `\n\nNew instructions for task continuation:\n<user_message>\n${responseText}\n</user_message>`
					: ""),
		})

		if (responseImages && responseImages.length > 0) {
			newUserContent.push(...formatResponse.imageBlocks(responseImages))
		}

		await this.overwriteApiConversationHistory(modifiedApiConversationHistory)
		await this.initiateTaskLoop(newUserContent)
	}

	private async initiateTaskLoop(userContent: UserContent): Promise<void> {
		let nextUserContent = userContent
		let includeFileDetails = true
		while (!this.abort) {
			const didEndLoop = await this.recursivelyMakeCoolClineRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // we only need file details the first time

			//  The way this agentic loop works is that coolcline will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.
			// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite requests, but CoolCline is prompted to finish the task as efficiently as he can.

			//const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
				//this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
				break
			} else {
				// this.say(
				// 	"tool",
				// 	"CoolCline responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
				// )
				nextUserContent = [
					{
						type: "text",
						text: formatResponse.noToolsUsed(),
					},
				]
				this.consecutiveMistakeCount++
			}
		}
	}

	abortTask() {
		this.abort = true
		this.browserSession.closeBrowser()
		this.terminalManager.disposeAll()
		this.didFinishAbortingStream = true
	}

	// Tools

	async executeCommandTool(command: string): Promise<[boolean, ToolResponse]> {
		const terminalInfo = await this.terminalManager.getOrCreateTerminal(cwd)
		terminalInfo.terminal.show() // weird visual bug when creating new terminals (even manually) where there's an empty space at the top.
		const process = this.terminalManager.runCommand(terminalInfo, command)

		let userFeedback: { text?: string; images?: string[] } | undefined
		let didContinue = false
		const sendCommandOutput = async (line: string): Promise<void> => {
			try {
				const { response, text, images } = await this.ask("command_output", line)
				if (response === "yesButtonClicked") {
					// proceed while running
				} else {
					userFeedback = { text, images }
				}
				didContinue = true
				process.continue() // continue past the await
			} catch {
				// This can only happen if this ask promise was ignored, so ignore this error
			}
		}

		let lines: string[] = []
		process.on("line", (line: string) => {
			lines.push(line)
			if (!didContinue) {
				sendCommandOutput(line)
			} else {
				this.say("command_output", line)
			}
		})

		let completed = false
		process.once("completed", () => {
			completed = true
		})

		process.once("no_shell_integration", async () => {
			await this.say("shell_integration_warning")
		})

		await process

		// Wait for a short delay to ensure all messages are sent to the webview
		// This delay allows time for non-awaited promises to be created and
		// for their associated messages to be sent to the webview, maintaining
		// the correct order of messages (although the webview is smart about
		// grouping command_output messages despite any gaps anyways)
		await delay(50)

		const { terminalOutputLineLimit } = (await this.providerRef.deref()?.getState()) ?? {}
		const output = truncateOutput(lines.join("\n"), terminalOutputLineLimit)
		const result = output.trim()

		if (userFeedback) {
			await this.say("user_feedback", userFeedback.text, userFeedback.images)
			return [
				true,
				formatResponse.toolResult(
					`Command is still running in the user's terminal.${
						result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
					}\n\nThe user provided the following feedback:\n<feedback>\n${userFeedback.text}\n</feedback>`,
					userFeedback.images,
				),
			]
		}

		if (completed) {
			return [false, `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ""}`]
		} else {
			return [
				false,
				`Command is still running in the user's terminal.${
					result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
				}\n\nYou will be updated on the terminal status and new output in the future.`,
			]
		}
	}

	async *attemptApiRequest(previousApiReqIndex: number, retryAttempt: number = 0): ApiStream {
		// Add maximum retry limit
		const MAX_RETRIES = 3
		if (retryAttempt >= MAX_RETRIES) {
			await this.say(
				"api_req_retry_delayed",
				`Maximum retry attempts (${MAX_RETRIES}) reached. Please check your network connection or Resume Task.`,
				undefined,
				false,
			)
			throw new Error(
				`Maximum retry attempts (${MAX_RETRIES}) reached. Please check your network connection or Resume Task.`,
			)
		}

		let mcpHub: McpHub | undefined

		const { mcpEnabled, alwaysApproveResubmit, requestDelaySeconds, rateLimitSeconds } =
			(await this.providerRef.deref()?.getState()) ?? {}

		let finalDelay = 0

		// Only apply rate limiting if this isn't the first request and not retrying
		if (this.lastApiRequestTime && retryAttempt === 0) {
			const now = Date.now()
			const timeSinceLastRequest = now - this.lastApiRequestTime
			const rateLimit = rateLimitSeconds || 0
			const rateLimitDelay = Math.max(0, rateLimit * 1000 - timeSinceLastRequest)
			finalDelay = rateLimitDelay
		}

		if (finalDelay > 0) {
			// Show countdown timer for rate limiting
			for (let i = Math.ceil(finalDelay / 1000); i > 0; i--) {
				await this.say("api_req_retry_delayed", `Rate limiting for ${i} seconds...`, undefined, true)
				await delay(1000)
			}
		}

		// Update last request time before making the request
		this.lastApiRequestTime = Date.now()

		if (mcpEnabled ?? true) {
			mcpHub = this.providerRef.deref()?.mcpHub
			if (!mcpHub) {
				throw new Error(
					"MCP hub is not available. If you just moved the extension between the main sidebar and secondary sidebar, please try restarting VSCode to resolve this issue.",
				)
			}
			// Wait for MCP servers to be connected before generating system prompt
			await pWaitFor(() => mcpHub!.isConnecting !== true, { timeout: 10_000 }).catch(() => {
				console.error("MCP servers failed to connect in time")
			})
		}

		const {
			browserViewportSize,
			mode,
			customModePrompts, // 获取终端用户自定义roleDefinition和customInstructions
			preferredLanguage,
			experiments,
			enableMcpServerCreation,
		} = (await this.providerRef.deref()?.getState()) ?? {}
		// customModes 是获取到开发者预设的模式配置，包含slug、name、roleDefinition、groups等
		const { customModes } = (await this.providerRef.deref()?.getState()) ?? {}

		// 调用函数进行提示词组装
		const systemPrompt = await (async () => {
			const provider = this.providerRef.deref()
			if (!provider) {
				throw new Error("Provider not available")
			}

			// 根据模式传入不同的参数
			//  mode 是要传 slug，是小写字母
			switch (mode) {
				case "ask":
					return SYSTEM_PROMPT(
						{
							preferredLanguage,
							cwd,
						},
						"ask",
					)

				case "code":
					return SYSTEM_PROMPT(
						{
							context: provider.context,
							preferredLanguage,
							cwd,
							enableBaseObjective: true, // 默认启用基础工作目标
							// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
							// 它是追加模式，系统的提示词是这些
							// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
							globalCustomInstructions: this.customInstructions,
							supportsComputerUse: this.api.getModel().info.supportsComputerUse ?? false,
							browserViewportSize,
							enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
							mcpHub,
							diffStrategy: this.diffStrategy,
							diffEnabled: this.diffEnabled,
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
							context: provider.context,
							preferredLanguage,
							cwd,
							enableBaseObjective: true, // 默认启用基础工作目标
							// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
							// 它是追加模式，系统的提示词是这些
							// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
							globalCustomInstructions: this.customInstructions,
							supportsComputerUse: this.api.getModel().info.supportsComputerUse ?? false,
							browserViewportSize,
							enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
							mcpHub,
							diffStrategy: this.diffStrategy,
							diffEnabled: this.diffEnabled,
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
							context: provider.context,
							preferredLanguage,
							cwd,
							enableBaseObjective: true, // 默认启用基础工作目标
							// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
							// 它是追加模式，系统的提示词是这些
							// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
							globalCustomInstructions: this.customInstructions,
							supportsComputerUse: this.api.getModel().info.supportsComputerUse ?? false,
							browserViewportSize,
							enableMcpServerCreation, // 是否需要 AI 创建 MCP 服务器
							mcpHub,
							diffStrategy: this.diffStrategy,
							diffEnabled: this.diffEnabled,
							allowAIToCreateMode: false, // 是否需要 AI 创建角色模式
							customModePrompts, // 获取终端用户自定义roleDefinition和customInstructions
							customModeConfigs: customModes, // 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
							experiments, // 实验设置，可能影响提示词的生成
							enableToolUse: true, // 显式启用工具使用部分
							enableToolGuidelines: true, // 显式启用工具使用指南部分
						},
						mode,
					)
			}
		})()

		// If the previous API request's total token usage is close to the context window, truncate the conversation history to free up space for the new request
		if (previousApiReqIndex >= 0) {
			const previousRequest = this.coolclineMessages[previousApiReqIndex]?.text
			if (!previousRequest) return

			const {
				tokensIn = 0,
				tokensOut = 0,
				cacheWrites = 0,
				cacheReads = 0,
			}: CoolClineApiReqInfo = JSON.parse(previousRequest)
			const totalTokens = tokensIn + tokensOut + cacheWrites + cacheReads

			const trimmedMessages = truncateConversationIfNeeded(
				this.apiConversationHistory,
				totalTokens,
				this.api.getModel().info,
			)

			if (trimmedMessages !== this.apiConversationHistory) {
				await this.overwriteApiConversationHistory(trimmedMessages)
			}
		}

		// Clean conversation history by:
		// 1. Converting to Anthropic.MessageParam by spreading only the API-required properties
		// 2. Converting image blocks to text descriptions if model doesn't support images
		const cleanConversationHistory = this.apiConversationHistory.map(({ role, content }) => {
			// Handle array content (could contain image blocks)
			if (Array.isArray(content)) {
				if (!this.api.getModel().info.supportsImages) {
					// Convert image blocks to text descriptions
					content = content.map((block) => {
						if (block.type === "image") {
							// Convert image blocks to text descriptions
							// Note: We can't access the actual image content/url due to API limitations,
							// but we can indicate that an image was present in the conversation
							return {
								type: "text",
								text: "[Referenced image in conversation]",
							}
						}
						return block
					})
				}
			}
			return { role, content }
		})
		const stream = this.api.createMessage(systemPrompt, cleanConversationHistory)
		const iterator = stream[Symbol.asyncIterator]()

		try {
			// awaiting first chunk to see if it will throw an error
			const firstChunk = await iterator.next()
			yield firstChunk.value
		} catch (error) {
			// note that this api_req_failed ask is unique in that we only present this option if the api hasn't streamed any content yet (ie it fails on the first chunk due), as it would allow them to hit a retry button. However if the api failed mid-stream, it could be in any arbitrary state where some tools may have executed, so that error is handled differently and requires cancelling the task entirely.
			if (retryAttempt >= MAX_RETRIES) {
				throw new Error(
					`Maximum retry attempts (${MAX_RETRIES}) reached. Please check your network connection or Resume Task.`,
				)
			}

			const errorMsg = error.message ?? "Unknown error"
			const remainingRetries = MAX_RETRIES - retryAttempt
			let shouldRetry = false

			if (alwaysApproveResubmit) {
				shouldRetry = true
			} else {
				const { response } = await this.ask(
					"api_req_failed",
					error.message ?? JSON.stringify(serializeError(error), null, 2),
				)
				shouldRetry = response === "yesButtonClicked"
				if (!shouldRetry) {
					throw new Error("API request failed")
				}
				await this.say("api_req_retried")
			}

			if (shouldRetry) {
				// 使用固定的退避时间间隔
				const retryDelays = [3, 5, 10] // 秒
				const retryDelay = retryDelays[retryAttempt] // 当前重试次数对应的延迟

				// Show countdown timer with fixed backoff
				for (let i = retryDelay; i > 0; i--) {
					await this.say(
						"api_req_retry_delayed",
						`${errorMsg}\n\nRetry ${retryAttempt + 1} of ${MAX_RETRIES}\nRetrying in ${i} seconds...`,
						undefined,
						true,
					)
					await delay(1000)
				}

				await this.say(
					"api_req_retry_delayed",
					`${errorMsg}\n\nRetry ${retryAttempt + 1} of ${MAX_RETRIES}\nRetrying now...`,
					undefined,
					false,
				)

				// 重置最后请求时间，避免触发速率限制
				this.lastApiRequestTime = 0

				// delegate generator output from the recursive call with incremented retry count
				yield* this.attemptApiRequest(previousApiReqIndex, retryAttempt + 1)
				return
			}
		}

		// no error, so we can continue to yield all remaining chunks
		// (needs to be placed outside of try/catch since it we want caller to handle errors not with api_req_failed as that is reserved for first chunk failures only)
		// this delegates to another generator or iterable object. In this case, it's saying "yield all remaining values from this iterator". This effectively passes along all subsequent chunks from the original stream.
		yield* iterator
	}

	async presentAssistantMessage() {
		if (this.abort) {
			throw new Error("CoolCline instance aborted")
		}

		if (this.presentAssistantMessageLocked) {
			this.presentAssistantMessageHasPendingUpdates = true
			return
		}
		this.presentAssistantMessageLocked = true
		this.presentAssistantMessageHasPendingUpdates = false

		if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
			// this may happen if the last content block was completed before streaming could finish. if streaming is finished, and we're out of bounds then this means we already presented/executed the last content block and are ready to continue to next request
			if (this.didCompleteReadingStream) {
				this.userMessageContentReady = true
			}
			// console.log("no more content blocks to stream! this shouldn't happen?")
			this.presentAssistantMessageLocked = false
			return
			//throw new Error("No more content blocks to stream! This shouldn't happen...") // remove and just return after testing
		}

		const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex]) // need to create copy bc while stream is updating the array, it could be updating the reference block properties too
		switch (block.type) {
			case "text": {
				if (this.didRejectTool || this.didAlreadyUseTool) {
					break
				}
				let content = block.content
				if (content) {
					// (have to do this for partial and complete since sending content in thinking tags to markdown renderer will automatically be removed)
					// Remove end substrings of <thinking or </thinking (below xml parsing is only for opening tags)
					// (this is done with the xml parsing below now, but keeping here for reference)
					// content = content.replace(/<\/?t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?$/, "")
					// Remove all instances of <thinking> (with optional line break after) and </thinking> (with optional line break before)
					// - Needs to be separate since we dont want to remove the line break before the first tag
					// - Needs to happen before the xml parsing below
					content = content.replace(/<thinking>\s?/g, "")
					content = content.replace(/\s?<\/thinking>/g, "")

					// Remove partial XML tag at the very end of the content (for tool use and thinking tags)
					// (prevents scrollview from jumping when tags are automatically removed)
					const lastOpenBracketIndex = content.lastIndexOf("<")
					if (lastOpenBracketIndex !== -1) {
						const possibleTag = content.slice(lastOpenBracketIndex)
						// Check if there's a '>' after the last '<' (i.e., if the tag is complete) (complete thinking and tool tags will have been removed by now)
						const hasCloseBracket = possibleTag.includes(">")
						if (!hasCloseBracket) {
							// Extract the potential tag name
							let tagContent: string
							if (possibleTag.startsWith("</")) {
								tagContent = possibleTag.slice(2).trim()
							} else {
								tagContent = possibleTag.slice(1).trim()
							}
							// Check if tagContent is likely an incomplete tag name (letters and underscores only)
							const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
							// Preemptively remove < or </ to keep from these artifacts showing up in chat (also handles closing thinking tags)
							const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
							// If the tag is incomplete and at the end, remove it from the content
							if (isOpeningOrClosing || isLikelyTagName) {
								content = content.slice(0, lastOpenBracketIndex).trim()
							}
						}
					}
				}
				await this.say("text", content, undefined, block.partial)
				break
			}
			case "tool_use":
				// 在执行工具前检查是否需要创建 checkpoint
				const modifyingTools = [
					"write_to_file", // 直接写入文件
					"apply_diff", // 应用差异修改文件
					"insert_content", // 插入内容到文件
					"search_and_replace", // 搜索并替换文件内容
					"execute_command", // 执行命令可能会通过重定向、管道等修改文件
				]

				if (modifyingTools.includes(block.name)) {
					this.awaitCreateCheckpoint = true
				}

				const toolDescription = (): string => {
					switch (block.name) {
						case "execute_command":
							return `[${block.name} for '${block.params.command}']`
						case "read_file":
							return `[${block.name} for '${block.params.path}']`
						case "write_to_file":
							return `[${block.name} for '${block.params.path}']`
						case "apply_diff":
							return `[${block.name} for '${block.params.path}']`
						case "search_files":
							return `[${block.name} for '${block.params.regex}'${
								block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
							}]`
						case "codebase_search":
							return `[${block.name} for '${block.params.query}'${
								block.params.target_directories && Array.isArray(block.params.target_directories)
									? ` in '${block.params.target_directories.join(", ")}'`
									: ""
							}]`
						case "insert_content":
							return `[${block.name} for '${block.params.path}']`
						case "search_and_replace":
							return `[${block.name} for '${block.params.path}']`
						case "list_files":
							return `[${block.name} for '${block.params.path}']`
						case "list_code_definition_names":
							return `[${block.name} for '${block.params.path}']`
						case "browser_action":
							return `[${block.name} for '${block.params.action}']`
						case "use_mcp_tool":
							return `[${block.name} for '${block.params.server_name}']`
						case "access_mcp_resource":
							return `[${block.name} for '${block.params.server_name}']`
						case "ask_followup_question":
							return `[${block.name} for '${block.params.question}']`
						case "attempt_completion":
							return `[${block.name}]`
						case "switch_mode":
							return `[${block.name} to '${block.params.mode_slug}'${
								block.params.reason ? ` because: ${block.params.reason}` : ""
							}]`
						case "new_task": {
							const mode = block.params.mode ?? defaultModeSlug
							const message = block.params.message ?? "(no message)"
							const modeName = getModeBySlug(mode, customModes)?.name ?? mode
							return `[${block.name} in ${modeName} mode: '${message}']`
						}
						default:
							return `[${block.name}]`
					}
				}

				if (this.didRejectTool) {
					// ignore any tool content after user has rejected tool once
					if (!block.partial) {
						this.userMessageContent.push({
							type: "text",
							text: `Skipping tool ${toolDescription()} due to user rejecting a previous tool.`,
						})
					} else {
						// partial tool after user rejected a previous tool
						this.userMessageContent.push({
							type: "text",
							text: `Tool ${toolDescription()} was interrupted and not executed due to user rejecting a previous tool.`,
						})
					}
					break
				}

				if (this.didAlreadyUseTool) {
					// ignore any content after a tool has already been used
					this.userMessageContent.push({
						type: "text",
						text: `Tool [${block.name}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
					})
					break
				}

				const pushToolResult = (content: ToolResponse) => {
					this.userMessageContent.push({
						type: "text",
						text: `${toolDescription()} Result:`,
					})
					if (typeof content === "string") {
						this.userMessageContent.push({
							type: "text",
							text: content || "(tool did not return anything)",
						})
					} else {
						this.userMessageContent.push(...content)
					}
					// once a tool result has been collected, ignore all other tool uses since we should only ever present one tool result per message
					this.didAlreadyUseTool = true
				}

				const askApproval = async (type: CoolClineAsk, partialMessage?: string) => {
					const { response, text, images } = await this.ask(type, partialMessage, false)
					if (response !== "yesButtonClicked") {
						// Handle both messageResponse and noButtonClicked with text
						if (text) {
							await this.say("user_feedback", text, images)
							pushToolResult(
								formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images),
							)
						} else {
							pushToolResult(formatResponse.toolDenied())
						}
						this.didRejectTool = true
						return false
					}
					// Handle yesButtonClicked with text
					if (text) {
						await this.say("user_feedback", text, images)
						pushToolResult(formatResponse.toolResult(formatResponse.toolApprovedWithFeedback(text), images))
					}
					return true
				}

				const handleError = async (action: string, error: Error) => {
					const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
					await this.say(
						"error",
						`Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
					)
					// this.toolResults.push({
					// 	type: "tool_result",
					// 	tool_use_id: toolUseId,
					// 	content: await this.formatToolError(errorString),
					// })
					pushToolResult(formatResponse.toolError(errorString))
				}

				// If block is partial, remove partial closing tag so its not presented to user
				const removeClosingTag = (tag: ToolParamName, text?: string) => {
					if (!block.partial) {
						return text || ""
					}
					if (!text) {
						return ""
					}
					// This regex dynamically constructs a pattern to match the closing tag:
					// - Optionally matches whitespace before the tag
					// - Matches '<' or '</' optionally followed by any subset of characters from the tag name
					const tagRegex = new RegExp(
						`\\s?<\/?${tag
							.split("")
							.map((char) => `(?:${char})?`)
							.join("")}$`,
						"g",
					)
					return text.replace(tagRegex, "")
				}

				if (block.name !== "browser_action") {
					await this.browserSession.closeBrowser()
				}

				// Validate tool use before execution
				const { mode, customModes } = (await this.providerRef.deref()?.getState()) ?? {}
				try {
					validateToolUse(
						block.name as ToolName,
						mode ?? defaultModeSlug,
						customModes ?? [],
						{
							apply_diff: this.diffEnabled,
						},
						block.params,
					)
				} catch (error) {
					this.consecutiveMistakeCount++
					pushToolResult(formatResponse.toolError(error.message))
					break
				}

				switch (block.name) {
					case "write_to_file": {
						const relPath: string | undefined = block.params.path
						let newContent: string | undefined = block.params.content
						let predictedLineCount: number | undefined = parseInt(block.params.line_count ?? "0")
						if (!relPath || !newContent) {
							// checking for newContent ensure relPath is complete
							// wait so we can determine if it's a new file or editing an existing file
							break
						}
						// Check if file exists using cached map or fs.access
						let fileExists: boolean
						if (this.diffViewProvider.editType !== undefined) {
							fileExists = this.diffViewProvider.editType === "modify"
						} else {
							const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relPath))
							fileExists = await fileExistsAtPath(absolutePath)
							this.diffViewProvider.editType = fileExists ? "modify" : "create"
						}

						// pre-processing newContent for cases where weaker models might add artifacts like markdown codeblock markers (deepseek/llama) or extra escape characters (gemini)
						if (newContent.startsWith("```")) {
							// this handles cases where it includes language specifiers like ```python ```js
							newContent = newContent.split("\n").slice(1).join("\n").trim()
						}
						if (newContent.endsWith("```")) {
							newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
						}

						if (!this.api.getModel().id.includes("claude")) {
							// it seems not just llama models are doing this, but also gemini and potentially others
							if (
								newContent.includes("&gt;") ||
								newContent.includes("&lt;") ||
								newContent.includes("&quot;")
							) {
								newContent = newContent
									.replace(/&gt;/g, ">")
									.replace(/&lt;/g, "<")
									.replace(/&quot;/g, '"')
							}
						}

						const sharedMessageProps: CoolClineSayTool = {
							tool: fileExists ? "editedExistingFile" : "newFileCreated",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}
						try {
							if (block.partial) {
								// update gui message
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								// update editor
								if (!this.diffViewProvider.isEditing) {
									// open the editor and prepare to stream content in
									await this.diffViewProvider.open(relPath)
								}
								// editor is open, stream content in
								await this.diffViewProvider.update(
									everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
									false,
								)
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("write_to_file", "path"))
									await this.diffViewProvider.reset()
									break
								}
								if (!newContent) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("write_to_file", "content"))
									await this.diffViewProvider.reset()
									break
								}
								if (!predictedLineCount) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("write_to_file", "line_count"),
									)
									await this.diffViewProvider.reset()
									break
								}
								this.consecutiveMistakeCount = 0

								// if isEditingFile false, that means we have the full contents of the file already.
								// it's important to note how this function works, you can't make the assumption that the block.partial conditional will always be called since it may immediately get complete, non-partial data. So this part of the logic will always be called.
								// in other words, you must always repeat the block.partial logic here
								if (!this.diffViewProvider.isEditing) {
									// show gui message before showing edit animation
									const partialMessage = JSON.stringify(sharedMessageProps)
									await this.ask("tool", partialMessage, true).catch(() => {}) // sending true for partial even though it's not a partial, this shows the edit row before the content is streamed into the editor
									await this.diffViewProvider.open(relPath)
								}
								await this.diffViewProvider.update(
									everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
									true,
								)
								await delay(300) // wait for diff view to update
								this.diffViewProvider.scrollToFirstDiff()

								// Check for code omissions before proceeding
								if (
									detectCodeOmission(
										this.diffViewProvider.originalContent || "",
										newContent,
										predictedLineCount,
									)
								) {
									if (this.diffStrategy) {
										await this.diffViewProvider.revertChanges()
										pushToolResult(
											formatResponse.toolError(
												`Content appears to be truncated (file has ${
													newContent.split("\n").length
												} lines but was predicted to have ${predictedLineCount} lines), and found comments indicating omitted code (e.g., '// rest of code unchanged', '/* previous code */'). Please provide the complete file content without any omissions if possible, or otherwise use the 'apply_diff' tool to apply the diff to the original file.`,
											),
										)
										break
									} else {
										vscode.window
											.showWarningMessage(
												"Potential code truncation detected. This happens when the AI reaches its max output limit.",
												"Follow this guide to fix the issue",
											)
											.then((selection) => {
												if (selection === "Follow this guide to fix the issue") {
													vscode.env.openExternal(
														vscode.Uri.parse(
															"https://github.com/coolcline/coolcline/wiki/Troubleshooting-%E2%80%90-CoolCline-Deleting-Code-with-%22Rest-of-Code-Here%22-Comments",
														),
													)
												}
											})
									}
								}

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: fileExists ? undefined : newContent,
									diff: fileExists
										? formatResponse.createPrettyPatch(
												relPath,
												this.diffViewProvider.originalContent,
												newContent,
											)
										: undefined,
								} satisfies CoolClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges()
									break
								}
								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies CoolClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(
												finalContent || "",
											)}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`The content was successfully saved to ${relPath.toPosix()}.${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("writing file", error)
							await this.diffViewProvider.reset()
							break
						}
					}
					case "apply_diff": {
						const relPath: string | undefined = block.params.path
						const diffContent: string | undefined = block.params.diff

						const sharedMessageProps: CoolClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								// update gui message
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("apply_diff", "path"))
									break
								}
								if (!diffContent) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("apply_diff", "diff"))
									break
								}

								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relPath))
								const fileExists = await fileExistsAtPath(absolutePath)

								if (!fileExists) {
									this.consecutiveMistakeCount++
									const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
									await this.say("error", formattedError)
									pushToolResult(formattedError)
									break
								}

								const originalContent = await fs.readFile(absolutePath, "utf-8")

								// Apply the diff to the original content
								const diffResult = (await this.diffStrategy?.applyDiff(
									originalContent,
									diffContent,
									parseInt(block.params.start_line ?? ""),
									parseInt(block.params.end_line ?? ""),
								)) ?? {
									success: false,
									error: "No diff strategy available",
								}
								if (!diffResult.success) {
									this.consecutiveMistakeCount++
									const currentCount =
										(this.consecutiveMistakeCountForApplyDiff.get(relPath) || 0) + 1
									this.consecutiveMistakeCountForApplyDiff.set(relPath, currentCount)
									const errorDetails = diffResult.details
										? JSON.stringify(diffResult.details, null, 2)
										: ""
									const formattedError = `Unable to apply diff to file: ${absolutePath}\n\n<error_details>\n${
										diffResult.error
									}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
									if (currentCount >= 2) {
										await this.say("error", formattedError)
									}
									pushToolResult(formattedError)
									break
								}

								this.consecutiveMistakeCount = 0
								this.consecutiveMistakeCountForApplyDiff.delete(relPath)
								// Show diff view before asking for approval
								this.diffViewProvider.editType = "modify"
								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(diffResult.content, true)
								await this.diffViewProvider.scrollToFirstDiff()

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									diff: diffContent,
								} satisfies CoolClineSayTool)

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges() // This likely handles closing the diff view
									break
								}

								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies CoolClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(
												finalContent || "",
											)}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`Changes successfully applied to ${relPath.toPosix()}:\n\n${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("applying diff", error)
							await this.diffViewProvider.reset()
							break
						}
					}

					case "insert_content": {
						const relPath: string | undefined = block.params.path
						const operations: string | undefined = block.params.operations

						const sharedMessageProps: CoolClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								const partialMessage = JSON.stringify(sharedMessageProps)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							}

							// Validate required parameters
							if (!relPath) {
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("insert_content", "path"))
								break
							}

							if (!operations) {
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("insert_content", "operations"))
								break
							}

							const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relPath))
							const fileExists = await fileExistsAtPath(absolutePath)

							if (!fileExists) {
								this.consecutiveMistakeCount++
								const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
								await this.say("error", formattedError)
								pushToolResult(formattedError)
								break
							}

							let parsedOperations: Array<{
								start_line: number
								content: string
							}>

							try {
								parsedOperations = JSON.parse(operations)
								if (!Array.isArray(parsedOperations)) {
									throw new Error("Operations must be an array")
								}
							} catch (error) {
								this.consecutiveMistakeCount++
								await this.say("error", `Failed to parse operations JSON: ${error.message}`)
								pushToolResult(formatResponse.toolError("Invalid operations JSON format"))
								break
							}

							this.consecutiveMistakeCount = 0

							// Read the file
							const fileContent = await fs.readFile(absolutePath, "utf8")
							this.diffViewProvider.editType = "modify"
							this.diffViewProvider.originalContent = fileContent
							const lines = fileContent.split("\n")

							const updatedContent = insertGroups(
								lines,
								parsedOperations.map((elem) => {
									return {
										index: elem.start_line - 1,
										elements: elem.content.split("\n"),
									}
								}),
							).join("\n")

							// Show changes in diff view
							if (!this.diffViewProvider.isEditing) {
								await this.ask("tool", JSON.stringify(sharedMessageProps), true).catch(() => {})
								// First open with original content
								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(fileContent, false)
								this.diffViewProvider.scrollToFirstDiff()
								await delay(200)
							}

							const diff = formatResponse.createPrettyPatch(relPath, fileContent, updatedContent)

							if (!diff) {
								pushToolResult(`No changes needed for '${relPath}'`)
								break
							}

							await this.diffViewProvider.update(updatedContent, true)

							const completeMessage = JSON.stringify({
								...sharedMessageProps,
								diff,
							} satisfies CoolClineSayTool)

							const didApprove = await this.ask("tool", completeMessage, false).then(
								(response) => response.response === "yesButtonClicked",
							)

							if (!didApprove) {
								await this.diffViewProvider.revertChanges()
								pushToolResult("Changes were rejected by the user.")
								break
							}

							const { newProblemsMessage, userEdits, finalContent } =
								await this.diffViewProvider.saveChanges()
							this.didEditFile = true

							if (!userEdits) {
								pushToolResult(
									`The content was successfully inserted in ${relPath.toPosix()}.${newProblemsMessage}`,
								)
								await this.diffViewProvider.reset()
								break
							}

							const userFeedbackDiff = JSON.stringify({
								tool: "appliedDiff",
								path: getReadablePath(cwd, relPath),
								diff: userEdits,
							} satisfies CoolClineSayTool)

							console.debug("[DEBUG] User made edits, sending feedback diff:", userFeedbackDiff)
							await this.say("user_feedback_diff", userFeedbackDiff)
							pushToolResult(
								`The user made the following updates to your content:\n\n${userEdits}\n\n` +
									`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file:\n\n` +
									`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
									`Please note:\n` +
									`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
									`2. Proceed with the task using this updated file content as the new baseline.\n` +
									`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
									`${newProblemsMessage}`,
							)
							await this.diffViewProvider.reset()
						} catch (error) {
							handleError("insert content", error)
							await this.diffViewProvider.reset()
						}
						break
					}

					case "search_and_replace": {
						const relPath: string | undefined = block.params.path
						const operations: string | undefined = block.params.operations

						const sharedMessageProps: CoolClineSayTool = {
							tool: "appliedDiff",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}

						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									path: removeClosingTag("path", relPath),
									operations: removeClosingTag("operations", operations),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("search_and_replace", "path"),
									)
									break
								}
								if (!operations) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("search_and_replace", "operations"),
									)
									break
								}

								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relPath))
								const fileExists = await fileExistsAtPath(absolutePath)

								if (!fileExists) {
									this.consecutiveMistakeCount++
									const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
									await this.say("error", formattedError)
									pushToolResult(formattedError)
									break
								}

								let parsedOperations: Array<{
									search: string
									replace: string
									start_line?: number
									end_line?: number
									use_regex?: boolean
									ignore_case?: boolean
									regex_flags?: string
								}>

								try {
									parsedOperations = JSON.parse(operations)
									if (!Array.isArray(parsedOperations)) {
										throw new Error("Operations must be an array")
									}
								} catch (error) {
									this.consecutiveMistakeCount++
									await this.say("error", `Failed to parse operations JSON: ${error.message}`)
									pushToolResult(formatResponse.toolError("Invalid operations JSON format"))
									break
								}

								// Read the original file content
								const fileContent = await fs.readFile(absolutePath, "utf-8")
								this.diffViewProvider.editType = "modify"
								this.diffViewProvider.originalContent = fileContent
								let lines = fileContent.split("\n")

								for (const op of parsedOperations) {
									const flags = op.regex_flags ?? (op.ignore_case ? "gi" : "g")
									const multilineFlags = flags.includes("m") ? flags : flags + "m"

									const searchPattern = op.use_regex
										? new RegExp(op.search, multilineFlags)
										: new RegExp(escapeRegExp(op.search), multilineFlags)

									if (op.start_line || op.end_line) {
										const startLine = Math.max((op.start_line ?? 1) - 1, 0)
										const endLine = Math.min((op.end_line ?? lines.length) - 1, lines.length - 1)

										// Get the content before and after the target section
										const beforeLines = lines.slice(0, startLine)
										const afterLines = lines.slice(endLine + 1)

										// Get the target section and perform replacement
										const targetContent = lines.slice(startLine, endLine + 1).join("\n")
										const modifiedContent = targetContent.replace(searchPattern, op.replace)
										const modifiedLines = modifiedContent.split("\n")

										// Reconstruct the full content with the modified section
										lines = [...beforeLines, ...modifiedLines, ...afterLines]
									} else {
										// Global replacement
										const fullContent = lines.join("\n")
										const modifiedContent = fullContent.replace(searchPattern, op.replace)
										lines = modifiedContent.split("\n")
									}
								}

								const newContent = lines.join("\n")

								this.consecutiveMistakeCount = 0

								// Show diff preview
								const diff = formatResponse.createPrettyPatch(relPath, fileContent, newContent)

								if (!diff) {
									pushToolResult(`No changes needed for '${relPath}'`)
									break
								}

								await this.diffViewProvider.open(relPath)
								await this.diffViewProvider.update(newContent, true)
								this.diffViewProvider.scrollToFirstDiff()

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									diff: diff,
								} satisfies CoolClineSayTool)

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									await this.diffViewProvider.revertChanges() // This likely handles closing the diff view
									break
								}

								const { newProblemsMessage, userEdits, finalContent } =
									await this.diffViewProvider.saveChanges()
								this.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
								if (userEdits) {
									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies CoolClineSayTool),
									)
									pushToolResult(
										`The user made the following updates to your content:\n\n${userEdits}\n\n` +
											`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
											`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(finalContent || "")}\n</final_file_content>\n\n` +
											`Please note:\n` +
											`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
											`2. Proceed with the task using this updated file content as the new baseline.\n` +
											`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
											`${newProblemsMessage}`,
									)
								} else {
									pushToolResult(
										`Changes successfully applied to ${relPath.toPosix()}:\n\n${newProblemsMessage}`,
									)
								}
								await this.diffViewProvider.reset()
								break
							}
						} catch (error) {
							await handleError("applying search and replace", error)
							await this.diffViewProvider.reset()
							break
						}
					}

					case "read_file": {
						const relPath: string | undefined = block.params.path
						const sharedMessageProps: CoolClineSayTool = {
							tool: "readFile",
							path: getReadablePath(cwd, removeClosingTag("path", relPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: undefined,
								} satisfies CoolClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("read_file", "path"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relPath))
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: absolutePath,
								} satisfies CoolClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								// now execute the tool like normal
								const content = await extractTextFromFile(absolutePath)
								pushToolResult(content)
								break
							}
						} catch (error) {
							await handleError("reading file", error)
							break
						}
					}
					case "list_files": {
						const relDirPath: string | undefined = block.params.path
						const recursiveRaw: string | undefined = block.params.recursive
						const recursive = recursiveRaw?.toLowerCase() === "true"
						const sharedMessageProps: CoolClineSayTool = {
							tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies CoolClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("list_files", "path"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relDirPath))
								const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200)
								const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: result,
								} satisfies CoolClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("listing files", error)
							break
						}
					}
					case "list_code_definition_names": {
						const relDirPath: string | undefined = block.params.path
						const sharedMessageProps: CoolClineSayTool = {
							tool: "listCodeDefinitionNames",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies CoolClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("list_code_definition_names", "path"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relDirPath))
								const result = await parseSourceCodeForDefinitionsTopLevel(absolutePath)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: result,
								} satisfies CoolClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("parsing source code definitions", error)
							break
						}
					}
					case "search_files": {
						const relDirPath: string | undefined = block.params.path
						const regex: string | undefined = block.params.regex
						const filePattern: string | undefined = block.params.file_pattern
						const sharedMessageProps: CoolClineSayTool = {
							tool: "searchFiles",
							path: getReadablePath(cwd, removeClosingTag("path", relDirPath)),
							regex: removeClosingTag("regex", regex),
							filePattern: removeClosingTag("file_pattern", filePattern),
						}
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									...sharedMessageProps,
									content: "",
								} satisfies CoolClineSayTool)
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!relDirPath) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("search_files", "path"))
									break
								}
								if (!regex) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("search_files", "regex"))
									break
								}
								this.consecutiveMistakeCount = 0
								const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(cwd, relDirPath))
								const results = await regexSearchFiles(cwd, absolutePath, regex, filePattern)
								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: results,
								} satisfies CoolClineSayTool)
								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}
								pushToolResult(results)
								break
							}
						} catch (error) {
							await handleError("searching files", error)
							break
						}
					}
					case "browser_action": {
						const action: BrowserAction | undefined = block.params.action as BrowserAction
						const url: string | undefined = block.params.url
						const coordinate: string | undefined = block.params.coordinate
						const text: string | undefined = block.params.text
						if (!action || !browserActions.includes(action)) {
							// checking for action to ensure it is complete and valid
							if (!block.partial) {
								// if the block is complete and we don't have a valid action this is a mistake
								this.consecutiveMistakeCount++
								pushToolResult(await this.sayAndCreateMissingParamError("browser_action", "action"))
								await this.browserSession.closeBrowser()
							}
							break
						}

						try {
							if (block.partial) {
								if (action === "launch") {
									await this.ask(
										"browser_action_launch",
										removeClosingTag("url", url),
										block.partial,
									).catch(() => {})
								} else {
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,
											coordinate: removeClosingTag("coordinate", coordinate),
											text: removeClosingTag("text", text),
										} satisfies CoolClineSayBrowserAction),
										undefined,
										block.partial,
									)
								}
								break
							} else {
								let browserActionResult: BrowserActionResult
								if (action === "launch") {
									if (!url) {
										this.consecutiveMistakeCount++
										pushToolResult(
											await this.sayAndCreateMissingParamError("browser_action", "url"),
										)
										await this.browserSession.closeBrowser()
										break
									}
									this.consecutiveMistakeCount = 0
									const didApprove = await askApproval("browser_action_launch", url)
									if (!didApprove) {
										break
									}

									// NOTE: it's okay that we call this message since the partial inspect_site is finished streaming. The only scenario we have to avoid is sending messages WHILE a partial message exists at the end of the messages array. For example the api_req_finished message would interfere with the partial message, so we needed to remove that.
									// await this.say("inspect_site_result", "") // no result, starts the loading spinner waiting for result
									await this.say("browser_action_result", "") // starts loading spinner

									await this.browserSession.launchBrowser()
									browserActionResult = await this.browserSession.navigateToUrl(url)
								} else {
									if (action === "click") {
										if (!coordinate) {
											this.consecutiveMistakeCount++
											pushToolResult(
												await this.sayAndCreateMissingParamError(
													"browser_action",
													"coordinate",
												),
											)
											await this.browserSession.closeBrowser()
											break // can't be within an inner switch
										}
									}
									if (action === "type") {
										if (!text) {
											this.consecutiveMistakeCount++
											pushToolResult(
												await this.sayAndCreateMissingParamError("browser_action", "text"),
											)
											await this.browserSession.closeBrowser()
											break
										}
									}
									this.consecutiveMistakeCount = 0
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,
											coordinate,
											text,
										} satisfies CoolClineSayBrowserAction),
										undefined,
										false,
									)
									switch (action) {
										case "click":
											browserActionResult = await this.browserSession.click(coordinate!)
											break
										case "type":
											browserActionResult = await this.browserSession.type(text!)
											break
										case "scroll_down":
											browserActionResult = await this.browserSession.scrollDown()
											break
										case "scroll_up":
											browserActionResult = await this.browserSession.scrollUp()
											break
										case "close":
											browserActionResult = await this.browserSession.closeBrowser()
											break
									}
								}

								switch (action) {
									case "launch":
									case "click":
									case "type":
									case "scroll_down":
									case "scroll_up":
										await this.say("browser_action_result", JSON.stringify(browserActionResult))
										pushToolResult(
											formatResponse.toolResult(
												`The browser action has been executed. The console logs and screenshot have been captured for your analysis.\n\nConsole logs:\n${
													browserActionResult.logs || "(No new logs)"
												}\n\n(REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close this browser. For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
												browserActionResult.screenshot ? [browserActionResult.screenshot] : [],
											),
										)
										break
									case "close":
										pushToolResult(
											formatResponse.toolResult(
												`The browser has been closed. You may now proceed to using other tools.`,
											),
										)
										break
								}
								break
							}
						} catch (error) {
							await this.browserSession.closeBrowser() // if any error occurs, the browser session is terminated
							await handleError("executing browser action", error)
							break
						}
					}
					case "execute_command": {
						const command: string | undefined = block.params.command
						try {
							if (block.partial) {
								await this.ask("command", removeClosingTag("command", command), block.partial).catch(
									() => {},
								)
								break
							} else {
								if (!command) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("execute_command", "command"),
									)
									break
								}
								this.consecutiveMistakeCount = 0

								const didApprove = await askApproval("command", command)
								if (!didApprove) {
									break
								}
								const [userRejected, result] = await this.executeCommandTool(command)
								if (userRejected) {
									this.didRejectTool = true
								}
								pushToolResult(result)
								break
							}
						} catch (error) {
							await handleError("executing command", error)
							break
						}
					}
					case "use_mcp_tool": {
						const server_name: string | undefined = block.params.server_name
						const tool_name: string | undefined = block.params.tool_name
						const mcp_arguments: string | undefined = block.params.arguments
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									type: "use_mcp_tool",
									serverName: removeClosingTag("server_name", server_name),
									toolName: removeClosingTag("tool_name", tool_name),
									arguments: removeClosingTag("arguments", mcp_arguments),
								} satisfies CoolClineAskUseMcpServer)
								await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!server_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("use_mcp_tool", "server_name"),
									)
									break
								}
								if (!tool_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("use_mcp_tool", "tool_name"),
									)
									break
								}
								// arguments are optional, but if they are provided they must be valid JSON
								// if (!mcp_arguments) {
								// 	this.consecutiveMistakeCount++
								// 	pushToolResult(await this.sayAndCreateMissingParamError("use_mcp_tool", "arguments"))
								// 	break
								// }
								let parsedArguments: Record<string, unknown> | undefined
								if (mcp_arguments) {
									try {
										parsedArguments = JSON.parse(mcp_arguments)
									} catch (error) {
										this.consecutiveMistakeCount++
										await this.say(
											"error",
											`CoolCline tried to use ${tool_name} with an invalid JSON argument. Retrying...`,
										)
										pushToolResult(
											formatResponse.toolError(
												formatResponse.invalidMcpToolArgumentError(server_name, tool_name),
											),
										)
										break
									}
								}
								this.consecutiveMistakeCount = 0
								const completeMessage = JSON.stringify({
									type: "use_mcp_tool",
									serverName: server_name,
									toolName: tool_name,
									arguments: mcp_arguments,
								} satisfies CoolClineAskUseMcpServer)
								const didApprove = await askApproval("use_mcp_server", completeMessage)
								if (!didApprove) {
									break
								}
								// now execute the tool
								await this.say("mcp_server_request_started") // same as browser_action_result
								const toolResult = await this.providerRef
									.deref()
									?.mcpHub?.callTool(server_name, tool_name, parsedArguments)

								// TODO: add progress indicator and ability to parse images and non-text responses
								const toolResultPretty =
									(toolResult?.isError ? "Error:\n" : "") +
										toolResult?.content
											.map((item) => {
												if (item.type === "text") {
													return item.text
												}
												if (item.type === "resource") {
													const { blob, ...rest } = item.resource
													return JSON.stringify(rest, null, 2)
												}
												return ""
											})
											.filter(Boolean)
											.join("\n\n") || "(No response)"
								await this.say("mcp_server_response", toolResultPretty)
								pushToolResult(formatResponse.toolResult(toolResultPretty))
								break
							}
						} catch (error) {
							await handleError("executing MCP tool", error)
							break
						}
					}
					case "access_mcp_resource": {
						const server_name: string | undefined = block.params.server_name
						const uri: string | undefined = block.params.uri
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									type: "access_mcp_resource",
									serverName: removeClosingTag("server_name", server_name),
									uri: removeClosingTag("uri", uri),
								} satisfies CoolClineAskUseMcpServer)
								await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!server_name) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("access_mcp_resource", "server_name"),
									)
									break
								}
								if (!uri) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("access_mcp_resource", "uri"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const completeMessage = JSON.stringify({
									type: "access_mcp_resource",
									serverName: server_name,
									uri,
								} satisfies CoolClineAskUseMcpServer)
								const didApprove = await askApproval("use_mcp_server", completeMessage)
								if (!didApprove) {
									break
								}
								// now execute the tool
								await this.say("mcp_server_request_started")
								const resourceResult = await this.providerRef
									.deref()
									?.mcpHub?.readResource(server_name, uri)
								const resourceResultPretty =
									resourceResult?.contents
										.map((item) => {
											if (item.text) {
												return item.text
											}
											return ""
										})
										.filter(Boolean)
										.join("\n\n") || "(Empty response)"
								await this.say("mcp_server_response", resourceResultPretty)
								pushToolResult(formatResponse.toolResult(resourceResultPretty))
								break
							}
						} catch (error) {
							await handleError("accessing MCP resource", error)
							break
						}
					}
					case "ask_followup_question": {
						const question: string | undefined = block.params.question
						try {
							if (block.partial) {
								await this.ask("followup", removeClosingTag("question", question), block.partial).catch(
									() => {},
								)
								break
							} else {
								if (!question) {
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("ask_followup_question", "question"),
									)
									break
								}
								this.consecutiveMistakeCount = 0
								const { text, images } = await this.ask("followup", question, false)
								await this.say("user_feedback", text ?? "", images)
								pushToolResult(formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images))
								break
							}
						} catch (error) {
							await handleError("asking question", error)
							break
						}
					}
					case "switch_mode": {
						const mode_slug: string | undefined = block.params.mode_slug
						const reason: string | undefined = block.params.reason
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									tool: "switchMode",
									mode: removeClosingTag("mode_slug", mode_slug),
									reason: removeClosingTag("reason", reason),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!mode_slug) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("switch_mode", "mode_slug"))
									break
								}
								this.consecutiveMistakeCount = 0

								// Verify the mode exists
								const targetMode = getModeBySlug(
									mode_slug,
									(await this.providerRef.deref()?.getState())?.customModes,
								)
								if (!targetMode) {
									pushToolResult(formatResponse.toolError(`Invalid mode: ${mode_slug}`))
									break
								}

								// Check if already in requested mode
								const currentMode =
									(await this.providerRef.deref()?.getState())?.mode ?? defaultModeSlug
								if (currentMode === mode_slug) {
									pushToolResult(`Already in ${targetMode.name} mode.`)
									break
								}

								const completeMessage = JSON.stringify({
									tool: "switchMode",
									mode: mode_slug,
									reason,
								})

								const didApprove = await askApproval("tool", completeMessage)
								if (!didApprove) {
									break
								}

								// Switch the mode using shared handler
								const provider = this.providerRef.deref()
								if (provider) {
									await provider.handleModeSwitch(mode_slug)
								}
								pushToolResult(
									`Successfully switched from ${getModeBySlug(currentMode)?.name ?? currentMode} mode to ${
										targetMode.name
									} mode${reason ? ` because: ${reason}` : ""}.`,
								)
								await delay(500) // delay to allow mode change to take effect before next tool is executed
								break
							}
						} catch (error) {
							await handleError("switching mode", error)
							break
						}
					}

					case "new_task": {
						const mode: string | undefined = block.params.mode
						const message: string | undefined = block.params.message
						try {
							if (block.partial) {
								const partialMessage = JSON.stringify({
									tool: "newTask",
									mode: removeClosingTag("mode", mode),
									message: removeClosingTag("message", message),
								})
								await this.ask("tool", partialMessage, block.partial).catch(() => {})
								break
							} else {
								if (!mode) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("new_task", "mode"))
									break
								}
								if (!message) {
									this.consecutiveMistakeCount++
									pushToolResult(await this.sayAndCreateMissingParamError("new_task", "message"))
									break
								}
								this.consecutiveMistakeCount = 0

								// Verify the mode exists
								const targetMode = getModeBySlug(
									mode,
									(await this.providerRef.deref()?.getState())?.customModes,
								)
								if (!targetMode) {
									pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
									break
								}

								// Show what we're about to do
								const toolMessage = JSON.stringify({
									tool: "newTask",
									mode: targetMode.name,
									content: message,
								})

								const didApprove = await askApproval("tool", toolMessage)
								if (!didApprove) {
									break
								}

								// Switch mode first, then create new task instance
								const provider = this.providerRef.deref()
								if (provider) {
									await provider.handleModeSwitch(mode)
									await provider.initCoolClineWithTask(message)
									pushToolResult(
										`Successfully created new task in ${targetMode.name} mode with message: ${message}`,
									)
								} else {
									pushToolResult(
										formatResponse.toolError("Failed to create new task: provider not available"),
									)
								}
								break
							}
						} catch (error) {
							await handleError("creating new task", error)
							break
						}
					}

					case "attempt_completion": {
						/*
						this.consecutiveMistakeCount = 0
						let resultToSend = result
						if (command) {
							await this.say("completion_result", resultToSend)
							// TODO: currently we don't handle if this command fails, it could be useful to let coolcline know and retry
							const [didUserReject, commandResult] = await this.executeCommand(command, true)
							// if we received non-empty string, the command was rejected or failed
							if (commandResult) {
								return [didUserReject, commandResult]
							}
							resultToSend = ""
						}
						const { response, text, images } = await this.ask("completion_result", resultToSend) // this prompts webview to show 'new task' button, and enable text input (which would be the 'text' here)
						if (response === "yesButtonClicked") {
							return [false, ""] // signals to recursive loop to stop (for now this never happens since yesButtonClicked will trigger a new task)
						}
						await this.say("user_feedback", text ?? "", images)
						return [
						*/
						const result: string | undefined = block.params.result
						const command: string | undefined = block.params.command
						try {
							const lastMessage = this.coolclineMessages.at(-1)
							if (block.partial) {
								// console.log("partial 为 true 正在流式输出结果")
								if (command) {
									// the attempt_completion text is done, now we're getting command
									// remove the previous partial attempt_completion ask, replace with say, post state to webview, then stream command

									// const secondLastMessage = this.coolclineMessages.at(-2)
									if (lastMessage && lastMessage.ask === "command") {
										// update command
										await this.ask(
											"command",
											removeClosingTag("command", command),
											block.partial,
										).catch(() => {})
									} else {
										// last message is completion_result
										// we have command string, which means we have the result as well, so finish it (doesnt have to exist yet)
										await this.say(
											"completion_result",
											removeClosingTag("result", result),
											undefined,
											false,
										)
										await this.ask(
											"command",
											removeClosingTag("command", command),
											block.partial,
										).catch(() => {})
									}
								} else {
									// no command, still outputting partial result
									await this.say(
										"completion_result",
										removeClosingTag("result", result),
										undefined,
										block.partial,
									)
								}
								break
							} else {
								// console.log("partial 为 false 结果输出完成")
								if (!result) {
									console.log("执行没有结果")
									this.consecutiveMistakeCount++
									pushToolResult(
										await this.sayAndCreateMissingParamError("attempt_completion", "result"),
									)
									break
								}

								// 如果有文件修改，在 AI 响应结束时创建检查点
								if (this.awaitCreateCheckpoint) {
									// console.log("1.AI 响应结束，生成 checkpoint")
									await this.checkpointSave()
									// await new Promise(resolve => setTimeout(resolve, 1000))
								}

								this.consecutiveMistakeCount = 0

								let commandResult: ToolResponse | undefined
								if (command) {
									// console.log("执行结果有命令command: ", command)

									if (lastMessage && lastMessage.ask !== "command") {
										// havent sent a command message yet so first send completion_result then command
										await this.say("completion_result", result, undefined, false)
									}

									// complete command message
									const didApprove = await askApproval("command", command)
									if (!didApprove) {
										break
									}
									const [userRejected, execCommandResult] = await this.executeCommandTool(command!)
									if (userRejected) {
										this.didRejectTool = true
										pushToolResult(execCommandResult)
										break
									}
									// user didn't reject, but the command may have output
									commandResult = execCommandResult
								} else {
									// console.log("执行结果没有命令command")
									await this.say("completion_result", result, undefined, false)
								}

								// we already sent completion_result says, an empty string asks relinquishes control over button and field
								const { response, text, images } = await this.ask("completion_result", "", false)
								// console.log("执行结果response: ", response)

								if (response === "yesButtonClicked") {
									pushToolResult("") // signals to recursive loop to stop (for now this never happens since yesButtonClicked will trigger a new task)
									break
								}
								await this.say("user_feedback", text ?? "", images)

								const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
								if (commandResult) {
									if (typeof commandResult === "string") {
										toolResults.push({ type: "text", text: commandResult })
									} else if (Array.isArray(commandResult)) {
										toolResults.push(...commandResult)
									}
								}
								toolResults.push({
									type: "text",
									text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
								})
								toolResults.push(...formatResponse.imageBlocks(images))
								this.userMessageContent.push({
									type: "text",
									text: `${toolDescription()} Result:`,
								})
								this.userMessageContent.push(...toolResults)

								break
							}
						} catch (error) {
							await handleError("inspecting site", error)
							break
						}
					}
				}
				break
		}

		/*
		Seeing out of bounds is fine, it means that the next too call is being built up and ready to add to assistantMessageContent to present.
		When you see the UI inactive during this, it means that a tool is breaking without presenting any UI. For example the write_to_file tool was breaking when relpath was undefined, and for invalid relpath it never presented UI.
		*/
		this.presentAssistantMessageLocked = false // this needs to be placed here, if not then calling this.presentAssistantMessage below would fail (sometimes) since it's locked
		// NOTE: when tool is rejected, iterator stream is interrupted and it waits for userMessageContentReady to be true. Future calls to present will skip execution since didRejectTool and iterate until contentIndex is set to message length and it sets userMessageContentReady to true itself (instead of preemptively doing it in iterator)
		if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
			// block is finished streaming and executing
			if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
				// its okay that we increment if !didCompleteReadingStream, it'll just return bc out of bounds and as streaming continues it will call presentAssitantMessage if a new block is ready. if streaming is finished then we set userMessageContentReady to true when out of bounds. This gracefully allows the stream to continue on and all potential content blocks be presented.
				// last block is complete and it is finished executing
				this.userMessageContentReady = true // will allow pwaitfor to continue
			}

			// call next block if it exists (if not then read stream will call it when its ready)
			this.currentStreamingContentIndex++ // need to increment regardless, so when read stream calls this function again it will be streaming the next block

			if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
				// there are already more content blocks to stream, so we'll call this function ourselves
				// await this.presentAssistantContent()

				this.presentAssistantMessage()
				return
			}
		}
		// block is partial, but the read stream may have finished
		if (this.presentAssistantMessageHasPendingUpdates) {
			this.presentAssistantMessage()
		}
	}

	async recursivelyMakeCoolClineRequests(
		userContent: UserContent,
		includeFileDetails: boolean = false,
	): Promise<boolean> {
		if (this.abort) {
			throw new Error("CoolCline instance aborted")
		}

		if (this.consecutiveMistakeCount >= 3) {
			const { response, text, images } = await this.ask(
				"mistake_limit_reached",
				this.api.getModel().id.includes("claude")
					? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
					: "CoolCline uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.5 Sonnet for its advanced agentic coding capabilities.",
			)
			if (response === "messageResponse") {
				userContent.push(
					...[
						{
							type: "text",
							text: formatResponse.tooManyMistakes(text),
						} as Anthropic.Messages.TextBlockParam,
						...formatResponse.imageBlocks(images),
					],
				)
			}
			this.consecutiveMistakeCount = 0
		}

		// get previous api req's index to check token usage and determine if we need to truncate conversation history
		const previousApiReqIndex = findLastIndex(this.coolclineMessages, (m) => m.say === "api_req_started")

		// getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
		// for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
		await this.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
			}),
		)

		const [parsedUserContent, environmentDetails] = await this.loadContext(userContent, includeFileDetails)
		userContent = parsedUserContent
		// add environment details as its own text block, separate from tool results
		userContent.push({ type: "text", text: environmentDetails })

		await this.addToApiConversationHistory({ role: "user", content: userContent })

		// since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
		const lastApiReqIndex = findLastIndex(this.coolclineMessages, (m) => m.say === "api_req_started")
		this.coolclineMessages[lastApiReqIndex].text = JSON.stringify({
			request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
		} satisfies CoolClineApiReqInfo)
		await this.saveCoolClineMessages()
		await this.providerRef.deref()?.postStateToWebview()

		try {
			let cacheWriteTokens = 0
			let cacheReadTokens = 0
			let inputTokens = 0
			let outputTokens = 0
			let totalCost: number | undefined

			// update api_req_started. we can't use api_req_finished anymore since it's a unique case where it could come after a streaming message (ie in the middle of being updated or executed)
			// fortunately api_req_finished was always parsed out for the gui anyways, so it remains solely for legacy purposes to keep track of prices in tasks from history
			// (it's worth removing a few months from now)
			const updateApiReqMsg = (cancelReason?: CoolClineApiReqCancelReason, streamingFailedMessage?: string) => {
				this.coolclineMessages[lastApiReqIndex].text = JSON.stringify({
					...JSON.parse(this.coolclineMessages[lastApiReqIndex].text || "{}"),
					tokensIn: inputTokens,
					tokensOut: outputTokens,
					cacheWrites: cacheWriteTokens,
					cacheReads: cacheReadTokens,
					cost:
						totalCost ??
						calculateApiCost(
							this.api.getModel().info,
							inputTokens,
							outputTokens,
							cacheWriteTokens,
							cacheReadTokens,
						),
					cancelReason,
					streamingFailedMessage,
				} satisfies CoolClineApiReqInfo)
			}

			const abortStream = async (cancelReason: CoolClineApiReqCancelReason, streamingFailedMessage?: string) => {
				if (this.diffViewProvider.isEditing) {
					await this.diffViewProvider.revertChanges() // closes diff view
				}

				// if last message is a partial we need to update and save it
				const lastMessage = this.coolclineMessages.at(-1)
				if (lastMessage && lastMessage.partial) {
					// lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
					lastMessage.partial = false
					// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
					console.log("updating partial message", lastMessage)
					// await this.saveCoolClineMessages()
				}

				// Let assistant know their response was interrupted for when task is resumed
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [
						{
							type: "text",
							text:
								assistantMessage +
								`\n\n[${
									cancelReason === "streaming_failed"
										? "Response interrupted by API Error"
										: "Response interrupted by user"
								}]`,
						},
					],
				})

				// update api_req_started to have cancelled and cost, so that we can display the cost of the partial stream
				updateApiReqMsg(cancelReason, streamingFailedMessage)
				await this.saveCoolClineMessages()

				// signals to provider that it can retrieve the saved messages from disk, as abortTask can not be awaited on in nature
				this.didFinishAbortingStream = true
			}

			// reset streaming state
			this.currentStreamingContentIndex = 0
			this.assistantMessageContent = []
			this.didCompleteReadingStream = false
			this.userMessageContent = []
			this.userMessageContentReady = false
			this.didRejectTool = false
			this.didAlreadyUseTool = false
			this.presentAssistantMessageLocked = false
			this.presentAssistantMessageHasPendingUpdates = false
			await this.diffViewProvider.reset()

			const stream = this.attemptApiRequest(previousApiReqIndex) // yields only if the first chunk is successful, otherwise will allow the user to retry the request (most likely due to rate limit error, which gets thrown on the first chunk)
			let assistantMessage = ""
			let reasoningMessage = ""
			try {
				for await (const chunk of stream) {
					if (!chunk) {
						// Sometimes chunk is undefined, no idea that can cause it, but this workaround seems to fix it
						continue
					}
					switch (chunk.type) {
						case "reasoning":
							reasoningMessage += chunk.text
							await this.say("reasoning", reasoningMessage, undefined, true)
							break
						case "usage":
							inputTokens += chunk.inputTokens
							outputTokens += chunk.outputTokens
							cacheWriteTokens += chunk.cacheWriteTokens ?? 0
							cacheReadTokens += chunk.cacheReadTokens ?? 0
							totalCost = chunk.totalCost
							break
						case "text":
							assistantMessage += chunk.text
							// parse raw assistant message into content blocks
							const prevLength = this.assistantMessageContent.length
							this.assistantMessageContent = parseAssistantMessage(assistantMessage)
							if (this.assistantMessageContent.length > prevLength) {
								this.userMessageContentReady = false // new content we need to present, reset to false in case previous content set this to true
							}
							// present content to user
							this.presentAssistantMessage()
							break
					}

					if (this.abort) {
						console.log("aborting stream...")
						if (!this.abandoned) {
							// only need to gracefully abort if this instance isn't abandoned (sometimes openrouter stream hangs, in which case this would affect future instances of coolcline)
							await abortStream("user_cancelled")
						}
						break // aborts the stream
					}

					if (this.didRejectTool) {
						// userContent has a tool rejection, so interrupt the assistant's response to present the user's feedback
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						// this.userMessageContentReady = true // instead of setting this premptively, we allow the present iterator to finish and set userMessageContentReady when its ready
						break
					}

					// PREV: we need to let the request finish for openrouter to get generation details
					// UPDATE: it's better UX to interrupt the request at the cost of the api cost not being retrieved
					if (this.didAlreadyUseTool) {
						assistantMessage +=
							"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
						break
					}
				}
			} catch (error) {
				// abandoned happens when extension is no longer waiting for the coolcline instance to finish aborting (error is thrown here when any function in the for loop throws due to this.abort)
				if (!this.abandoned) {
					this.abortTask() // if the stream failed, there's various states the task could be in (i.e. could have streamed some tools the user may have executed), so we just resort to replicating a cancel task
					await abortStream(
						"streaming_failed",
						error.message ?? JSON.stringify(serializeError(error), null, 2),
					)
					const history = await this.providerRef.deref()?.getTaskWithId(this.taskId)
					if (history) {
						await this.providerRef.deref()?.initCoolClineWithHistoryItem(history.historyItem)
						// await this.providerRef.deref()?.postStateToWebview()
					}
				}
			}

			// need to call here in case the stream was aborted
			if (this.abort) {
				throw new Error("CoolCline instance aborted")
			}

			this.didCompleteReadingStream = true

			// set any blocks to be complete to allow presentAssistantMessage to finish and set userMessageContentReady to true
			// (could be a text block that had no subsequent tool uses, or a text block at the very end, or an invalid tool use, etc. whatever the case, presentAssistantMessage relies on these blocks either to be completed or the user to reject a block in order to proceed and eventually set userMessageContentReady to true)
			const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
			partialBlocks.forEach((block) => {
				block.partial = false
			})
			// this.assistantMessageContent.forEach((e) => (e.partial = false)) // cant just do this bc a tool could be in the middle of executing ()
			if (partialBlocks.length > 0) {
				this.presentAssistantMessage() // if there is content to update then it will complete and update this.userMessageContentReady to true, which we pwaitfor before making the next request. all this is really doing is presenting the last partial message that we just set to complete
			}

			updateApiReqMsg()
			await this.saveCoolClineMessages()
			await this.providerRef.deref()?.postStateToWebview()

			// now add to apiconversationhistory
			// need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
			let didEndLoop = false
			if (assistantMessage.length > 0) {
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: assistantMessage }],
				})

				// NOTE: this comment is here for future reference - this was a workaround for userMessageContent not getting set to true. It was due to it not recursively calling for partial blocks when didRejectTool, so it would get stuck waiting for a partial block to complete before it could continue.
				// in case the content blocks finished
				// it may be the api stream finished after the last parsed content block was executed, so  we are able to detect out of bounds and set userMessageContentReady to true (note you should not call presentAssistantMessage since if the last block is completed it will be presented again)
				// const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // if there are any partial blocks after the stream ended we can consider them invalid
				// if (this.currentStreamingContentIndex >= completeBlocks.length) {
				// 	this.userMessageContentReady = true
				// }

				await pWaitFor(() => this.userMessageContentReady)

				// if the model did not tool use, then we need to tell it to either use a tool or attempt_completion
				const didToolUse = this.assistantMessageContent.some((block) => block.type === "tool_use")
				if (!didToolUse) {
					this.userMessageContent.push({
						type: "text",
						text: formatResponse.noToolsUsed(),
					})
					this.consecutiveMistakeCount++
				}

				const recDidEndLoop = await this.recursivelyMakeCoolClineRequests(this.userMessageContent)
				didEndLoop = recDidEndLoop
			} else {
				// if there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
				)
				await this.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			return didEndLoop // will always be false for now
		} catch (error) {
			// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonClicked, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
			return true // needs to be true so parent loop knows to end task
		}
	}

	async loadContext(userContent: UserContent, includeFileDetails: boolean = false) {
		return await Promise.all([
			// Process userContent array, which contains various block types:
			// TextBlockParam, ImageBlockParam, ToolUseBlockParam, and ToolResultBlockParam.
			// We need to apply parseMentions() to:
			// 1. All TextBlockParam's text (first user message with task)
			// 2. ToolResultBlockParam's content/context text arrays if it contains "<feedback>" (see formatToolDeniedFeedback, attemptCompletion, executeCommand, and consecutiveMistakeCount >= 3) or "<answer>" (see askFollowupQuestion), we place all user generated content in these tags so they can effectively be used as markers for when we should parse mentions)
			Promise.all(
				userContent.map(async (block) => {
					const shouldProcessMentions = (text: string) =>
						text.includes("<task>") || text.includes("<feedback>")

					if (block.type === "text") {
						if (shouldProcessMentions(block.text)) {
							return {
								...block,
								text: await parseMentions(block.text, cwd, this.urlContentFetcher),
							}
						}
						return block
					} else if (block.type === "tool_result") {
						if (typeof block.content === "string") {
							if (shouldProcessMentions(block.content)) {
								return {
									...block,
									content: await parseMentions(block.content, cwd, this.urlContentFetcher),
								}
							}
							return block
						} else if (Array.isArray(block.content)) {
							const parsedContent = await Promise.all(
								block.content.map(async (contentBlock) => {
									if (contentBlock.type === "text" && shouldProcessMentions(contentBlock.text)) {
										return {
											...contentBlock,
											text: await parseMentions(contentBlock.text, cwd, this.urlContentFetcher),
										}
									}
									return contentBlock
								}),
							)
							return {
								...block,
								content: parsedContent,
							}
						}
						return block
					}
					return block
				}),
			),
			this.getEnvironmentDetails(includeFileDetails),
		])
	}

	// 专门负责收集当前环境的各种信息
	async getEnvironmentDetails(includeFileDetails: boolean = false) {
		let details = ""

		// It could be useful for coolcline to know if the user went from one or no file to another between messages, so we always include this context
		details += "\n\n# VSCode Visible Files"
		// 使用Set对可见文件路径进行去重
		const visibleFilePaths = new Set(
			vscode.window.visibleTextEditors
				?.map((editor) => editor.document?.uri?.fsPath)
				.filter(Boolean)
				.map((absolutePath) => PathUtils.relativePath(cwd, absolutePath).toPosix()),
		)
		const visibleFiles = Array.from(visibleFilePaths).join("\n")
		if (visibleFiles) {
			details += `\n${visibleFiles}`
		} else {
			details += "\n(No visible files)"
		}

		details += "\n\n# VSCode Open Tabs"
		// 使用Set对打开的标签页路径进行去重
		const openTabPaths = new Set(
			vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.map((tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
				.filter(Boolean)
				.map((absolutePath) => PathUtils.relativePath(cwd, absolutePath).toPosix()),
		)
		const openTabs = Array.from(openTabPaths).join("\n")
		if (openTabs) {
			details += `\n${openTabs}`
		} else {
			details += "\n(No open tabs)"
		}

		const busyTerminals = this.terminalManager.getTerminals(true)
		const inactiveTerminals = this.terminalManager.getTerminals(false)
		// const allTerminals = [...busyTerminals, ...inactiveTerminals]

		if (busyTerminals.length > 0 && this.didEditFile) {
			//  || this.didEditFile
			await delay(300) // delay after saving file to let terminals catch up
		}

		// let terminalWasBusy = false
		if (busyTerminals.length > 0) {
			// wait for terminals to cool down
			// terminalWasBusy = allTerminals.some((t) => this.terminalManager.isProcessHot(t.id))
			await pWaitFor(() => busyTerminals.every((t) => !this.terminalManager.isProcessHot(t.id)), {
				interval: 100,
				timeout: 15_000,
			}).catch(() => {})
		}

		// we want to get diagnostics AFTER terminal cools down for a few reasons: terminal could be scaffolding a project, dev servers (compilers like webpack) will first re-compile and then send diagnostics, etc
		/*
		let diagnosticsDetails = ""
		const diagnostics = await this.diagnosticsMonitor.getCurrentDiagnostics(this.didEditFile || terminalWasBusy) // if coolcline ran a command (ie npm install) or edited the workspace then wait a bit for updated diagnostics
		for (const [uri, fileDiagnostics] of diagnostics) {
			const problems = fileDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
			if (problems.length > 0) {
				diagnosticsDetails += `\n## ${PathUtils.relativePath(cwd, uri.fsPath)}`
				for (const diagnostic of problems) {
					// let severity = diagnostic.severity === vscode.DiagnosticSeverity.Error ? "Error" : "Warning"
					const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
					const source = diagnostic.source ? `[${diagnostic.source}] ` : ""
					diagnosticsDetails += `\n- ${source}Line ${line}: ${diagnostic.message}`
				}
			}
		}
		*/
		this.didEditFile = false // reset, this lets us know when to wait for saved files to update terminals

		// waiting for updated diagnostics lets terminal output be the most up-to-date possible
		let terminalDetails = ""
		if (busyTerminals.length > 0) {
			// terminals are cool, let's retrieve their output
			terminalDetails += "\n\n# Actively Running Terminals"
			for (const busyTerminal of busyTerminals) {
				terminalDetails += `\n## Original command: \`${busyTerminal.lastCommand}\``
				const newOutput = this.terminalManager.getUnretrievedOutput(busyTerminal.id)
				if (newOutput) {
					terminalDetails += `\n### New Output\n${newOutput}`
				} else {
					// details += `\n(Still running, no new output)` // don't want to show this right after running the command
				}
			}
		}
		// only show inactive terminals if there's output to show
		if (inactiveTerminals.length > 0) {
			const inactiveTerminalOutputs = new Map<number, string>()
			for (const inactiveTerminal of inactiveTerminals) {
				const newOutput = this.terminalManager.getUnretrievedOutput(inactiveTerminal.id)
				if (newOutput) {
					inactiveTerminalOutputs.set(inactiveTerminal.id, newOutput)
				}
			}
			if (inactiveTerminalOutputs.size > 0) {
				terminalDetails += "\n\n# Inactive Terminals"
				for (const [terminalId, newOutput] of inactiveTerminalOutputs) {
					const inactiveTerminal = inactiveTerminals.find((t) => t.id === terminalId)
					if (inactiveTerminal) {
						terminalDetails += `\n## ${inactiveTerminal.lastCommand}`
						terminalDetails += `\n### New Output\n${newOutput}`
					}
				}
			}
		}

		// details += "\n\n# VSCode Workspace Errors"
		// if (diagnosticsDetails) {
		// 	details += diagnosticsDetails
		// } else {
		// 	details += "\n(No errors detected)"
		// }

		if (terminalDetails) {
			details += terminalDetails
		}

		// Add current time information with timezone
		const now = new Date()
		const formatter = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			hour12: true,
		})
		const timeZone = formatter.resolvedOptions().timeZone
		const timeZoneOffset = -now.getTimezoneOffset() / 60 // Convert to hours and invert sign to match conventional notation
		const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}:00`
		details += `\n\n# Current Time\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

		// Add context tokens information
		const { contextTokens } = getApiMetrics(this.coolclineMessages)
		const modelInfo = this.api.getModel().info
		const contextWindow = modelInfo.contextWindow
		const contextPercentage =
			contextTokens && contextWindow ? Math.round((contextTokens / contextWindow) * 100) : undefined
		details += `\n\n# Current Context Size (Tokens)\n${contextTokens ? `${contextTokens.toLocaleString()} (${contextPercentage}%)` : "(Not available)"}`

		// Add current mode and any mode-specific warnings
		const { mode, customModes } = (await this.providerRef.deref()?.getState()) ?? {}
		const currentMode = mode ?? defaultModeSlug
		details += `\n\n# Current Mode\n${currentMode}`

		// Add warning if not in code mode
		if (
			!isToolAllowedForMode("write_to_file", currentMode, customModes ?? [], {
				apply_diff: this.diffEnabled,
			}) &&
			!isToolAllowedForMode("apply_diff", currentMode, customModes ?? [], { apply_diff: this.diffEnabled })
		) {
			const currentModeName = getModeBySlug(currentMode, customModes)?.name ?? currentMode
			const defaultModeName = getModeBySlug(defaultModeSlug, customModes)?.name ?? defaultModeSlug
			details += `\n\nNOTE: You are currently in '${currentModeName}' mode which only allows read-only operations. To write files or execute commands, the user will need to switch to '${defaultModeName}' mode. Note that only the user can switch modes.`
		}

		if (includeFileDetails) {
			details += `\n\n# Current Working Directory (${cwd.toPosix()}) Files\n`
			const isDesktop = arePathsEqual(cwd, PathUtils.joinPath(os.homedir(), "Desktop"))
			if (isDesktop) {
				// don't want to immediately access desktop since it would show permission popup
				details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
			} else {
				const [files, didHitLimit] = await listFiles(cwd, true, 200)
				const result = formatResponse.formatFilesList(cwd, files, didHitLimit)
				details += result
			}
		}

		return `<environment_details>\n${details.trim()}\n</environment_details>`
	}

	// Checkpoints
	// 获取或初始化 CheckpointService 实例
	private async getCheckpointService(): Promise<CheckpointService> {
		if (!this.checkpointService) {
			const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
			if (!globalStoragePath) {
				throw new Error("无法获取 vscode globalStorage 路径")
			}

			this.checkpointService = await CheckpointService.create(this.taskId, {
				context: {
					globalStorageUri: {
						fsPath: globalStoragePath,
					},
				},
			})

			try {
				await this.checkpointService.initialize()
			} catch (error) {
				console.error("CheckpointService 初始化失败:", error)
				throw error
			}
		}
		return this.checkpointService
	}

	// 比较差异
	public async checkpointDiff({
		ts,
		commitHash,
		mode,
	}: {
		ts: number
		commitHash: string
		mode: "full" | "checkpoint"
	}) {
		if (!this.checkpointsEnabled) {
			this.providerRef.deref()?.log("[checkpointDiff] checkpoints 功能已禁用")
			vscode.window.showWarningMessage("Checkpoints feature is disabled.")
			return
		}

		let nextCommitHash = undefined
		let title = ""
		let changes = undefined

		if (mode === "checkpoint") {
			const service = await this.getCheckpointService()
			changes = await service.getDiff(commitHash || "HEAD", nextCommitHash || undefined)

			title = "This Changes"
		} else {
			const service = await this.getCheckpointService()
			changes = await service.getDiffToLatest(commitHash || "HEAD")

			title = "All changes"
		}

		try {
			// const service = await this.getCheckpointService()
			// const changes = await service.getDiff(commitHash || "HEAD", nextCommitHash || undefined)

			if (!changes?.length) {
				vscode.window.showInformationMessage("No changes found.")
				return
			}

			// 使用 vscode.changes 命令显示差异
			await vscode.commands.executeCommand(
				"vscode.changes",
				title,
				changes.map((change) => [
					vscode.Uri.file(change.absolutePath),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.relativePath}`).with({
						query: Buffer.from(change.before ?? "").toString("base64"),
					}),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.relativePath}`).with({
						query: Buffer.from(change.after ?? "").toString("base64"),
					}),
				]),
			)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			this.providerRef
				.deref()
				?.log(
					`[checkpointDiff] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)
			vscode.window.showErrorMessage(`Failed to show diff: ${errorMessage}`)
			// this.checkpointsEnabled = false
		}
	}

	// 移动 checkpoint 消息到用户消息后面
	private async moveCheckpointAfterMessage(): Promise<boolean> {
		try {
			// 1. 从后往前找到第一个 checkpoint 消息
			let checkpointIndex = this.coolclineMessages.length - 1
			while (checkpointIndex >= 0) {
				const msg = this.coolclineMessages[checkpointIndex]
				if (msg.type === "say" && msg.say === "checkpoint_saved") {
					break
				}
				checkpointIndex--
			}

			if (checkpointIndex === -1) {
				console.log("找不到 checkpoint 消息")
				return false
			}

			const checkpointMessage = this.coolclineMessages[checkpointIndex]

			// 2. 从 checkpoint 消息位置向上查找最近的用户消息（带有 images 字段的消息）
			let messageStartIndex = checkpointIndex - 1
			while (messageStartIndex >= 0) {
				const msg = this.coolclineMessages[messageStartIndex]
				if (msg.type === "say" && Array.isArray(msg.images)) {
					break
				}
				messageStartIndex--
			}

			if (messageStartIndex === -1) {
				console.log("找不到用户消息")
				return false
			}

			let apiCheckpointIndex = -1
			try {
				// 3. 更新内存中的 UI 消息
				this.coolclineMessages.splice(checkpointIndex, 1)
				this.coolclineMessages.splice(messageStartIndex + 1, 0, checkpointMessage)

				// 4. 更新内存中的 API 历史
				// 从后往前找到对应的 API 历史消息
				apiCheckpointIndex = this.apiConversationHistory.length - 1
				while (apiCheckpointIndex >= 0) {
					const msg = this.apiConversationHistory[apiCheckpointIndex]
					if (
						msg.content &&
						Array.isArray(msg.content) &&
						msg.content.some((c) => c.type === "text" && c.text.includes("checkpoint_saved"))
					) {
						break
					}
					apiCheckpointIndex--
				}

				if (apiCheckpointIndex !== -1) {
					const apiCheckpointMessage = this.apiConversationHistory[apiCheckpointIndex]
					this.apiConversationHistory.splice(apiCheckpointIndex, 1)
					this.apiConversationHistory.splice(messageStartIndex + 1, 0, apiCheckpointMessage)
				}

				// 5. 保存到文件
				await Promise.all([this.saveCoolClineMessages(), this.saveApiConversationHistory()])

				// 6. 通知 webview 更新
				await this.providerRef.deref()?.postStateToWebview()

				return true // 成功移动消息
			} catch (error) {
				// 如果保存失败，恢复内存中的状态
				if (apiCheckpointIndex !== -1) {
					const apiCheckpointMessage = this.apiConversationHistory[messageStartIndex + 1]
					this.apiConversationHistory.splice(messageStartIndex + 1, 1)
					this.apiConversationHistory.splice(apiCheckpointIndex, 0, apiCheckpointMessage)
				}
				this.coolclineMessages.splice(messageStartIndex + 1, 1)
				this.coolclineMessages.splice(checkpointIndex, 0, checkpointMessage)

				console.error("移动 checkpoint 消息失败:", error)
				return false
			}
		} catch (error) {
			console.error("移动 checkpoint 消息失败:", error)
			return false
		}
	}

	// 创建 checkpoint 检查点
	public async checkpointSave(): Promise<boolean> {
		if (!this.checkpointsEnabled) {
			return false
		}

		try {
			const service = await this.getCheckpointService()
			const message = `checkpoint:create,task:${this.taskId}`
			const checkpoint = await service.saveCheckpoint(message)

			if (checkpoint?.hash) {
				await this.providerRef
					.deref()
					?.postMessageToWebview({ type: "currentCheckpointUpdated", text: checkpoint.hash })

				await this.say("checkpoint_saved", checkpoint.hash)

				this.awaitCreateCheckpoint = false // 只有在成功创建检查点后才重置标记

				// 直接移动最后一条消息（就是刚刚创建的 checkpoint 消息）
				// 移动到消息下一行
				await this.moveCheckpointAfterMessage()

				return true
			}
			return false
		} catch (err) {
			this.providerRef
				.deref()
				?.log(
					`[checkpointSave] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)

			// 失败时不重置标记，这样下次修改操作时还会尝试创建检查点
			console.error("创建检查点失败，将在下次修改时重试")
			return false
		}
	}

	// 还原 checkpoint 检查点
	public async checkpointRestore({
		ts,
		commitHash,
		mode,
	}: {
		ts: number
		commitHash: string
		mode: CheckpointRestoreMode
	}) {
		try {
			// 处理消息恢复
			const shouldRestoreMessages = true // 新模式下都需要删除消息
			if (shouldRestoreMessages) {
				// 找到用户发送的消息
				const editMessageIndex = this.coolclineMessages.findIndex((m) => m.ts === ts)
				console.log("coolclineMessages: ", this.coolclineMessages)
				console.log("editMessageIndex: ", editMessageIndex)

				if (editMessageIndex === -1) {
					this.providerRef
						.deref()
						?.log(`[checkpointRestore] Could not find edit message with timestamp ${ts}`)
					vscode.window.showErrorMessage("Could not find specified checkpoint.")
					return
				}

				// 向前查找这个编辑操作所属的用户消息的开始位置
				let taskStartIndex = editMessageIndex
				while (taskStartIndex > 0) {
					const msg = this.coolclineMessages[taskStartIndex]
					// 如果找到一个带有 images 字段，且type 字段的值是 say 类型消息，就停止（根据目前数据结构）
					if (msg.type === "say" && Array.isArray(msg.images)) {
						break
					}
					taskStartIndex--
				}

				// 找到原始消息
				const message = this.coolclineMessages[taskStartIndex]
				console.log("上一条message: ", message)
				if (!message) {
					throw new Error("无法找到要恢复的消息")
				}

				// 保存原始消息的历史范围信息
				this.conversationHistoryDeletedRange = message.conversationHistoryDeletedRange

				// 根据不同的恢复模式处理消息
				let newCoolClineMessages: typeof this.coolclineMessages = []
				if (mode === "restore_this_change") {
					newCoolClineMessages = [...this.coolclineMessages]

					// 查找下一条用户消息
					let nextMessageIndex = editMessageIndex
					console.log("nextMessageIndex1: ", nextMessageIndex)
					while (nextMessageIndex < this.coolclineMessages.length - 1) {
						const nextMsg = this.coolclineMessages[nextMessageIndex] // 修改这里
						if (nextMsg.type === "say" && Array.isArray(nextMsg.images)) {
							break
						}
						nextMessageIndex++
					}

					let message = undefined
					if (nextMessageIndex === this.coolclineMessages.length - 1) {
						message = this.coolclineMessages[0]
					} else {
						message = this.coolclineMessages[taskStartIndex]
					}
					console.log("下一条message: ", message)

					// 计算要删除的元素数量
					const deleteCount =
						nextMessageIndex < this.coolclineMessages.length - 1
							? nextMessageIndex - taskStartIndex + 1 // 移除 -1
							: this.coolclineMessages.length - taskStartIndex + 1

					// 执行删除和插入操作
					if (taskStartIndex === 0) {
						newCoolClineMessages.splice(taskStartIndex + 1, deleteCount - 1)
					} else {
						newCoolClineMessages.splice(taskStartIndex - 1, deleteCount - 1)
					}

					// if (nextMessageIndex < this.coolclineMessages.length - 1) {
					// 	newCoolClineMessages.splice(taskStartIndex, 0, message);
					// }
				} else if (mode === "restore_this_and_after_change" || mode === "undo_restore") {
					// 删除之后的所有消息
					newCoolClineMessages = this.coolclineMessages.slice(0, taskStartIndex) // 移除 -1
					if (taskStartIndex === 0) {
						newCoolClineMessages.push(message)
					}
				}

				// 更新消息历史
				await this.overwriteCoolClineMessages(newCoolClineMessages)

				// 恢复 API 对话历史
				let historyIndex =
					message.conversationHistoryIndex ?? Math.min(this.apiConversationHistory.length, taskStartIndex) // 移除 -1
				const newConversationHistory = this.apiConversationHistory.slice(0, historyIndex)
				await this.overwriteApiConversationHistory(newConversationHistory)

				await this.providerRef.deref()?.postStateToWebview()
			}

			// 处理文件恢复
			const service = await this.getCheckpointService()
			if (mode === "restore_this_change") {
				const message1 = `checkpoint:restore,task:${this.taskId},target:${commitHash},restoreMode:restore_this_change,time:${Date.now()}`
				await service.restoreCheckpoint(message1)
			} else if (mode === "restore_this_and_after_change") {
				const message2 = `checkpoint:restore,task:${this.taskId},target:${commitHash},restoreMode:restore_this_and_after_change,time:${Date.now()}`
				await service.restoreCheckpoint(message2)
			} else if (mode === "undo_restore") {
				const message3 = `checkpoint:undo_restore,task:${this.taskId},target:${commitHash},restoreMode:undo_restore,time:${Date.now()}`
				await service.undoRestore(message3)
			}

			await this.providerRef.deref()?.postMessageToWebview({ type: "currentCheckpointUpdated", text: commitHash })

			// 显示恢复成功消息
			let successMessage = ""
			switch (mode) {
				case "restore_this_change":
					successMessage = "This change has been restored"
					break
				case "restore_this_and_after_change":
					successMessage = "This change and all changes after it have been restored"
					break
				case "undo_restore":
					successMessage = "The restore operation has been undone"
					break
			}

			if (successMessage) {
				vscode.window.showInformationMessage(successMessage)
				// 关闭所有差异编辑器
				try {
					await vscode.commands.executeCommand("git.closeAllDiffEditors")
					// 关闭 vscode.changes 打开页面
					const visibleEditors = vscode.window.visibleTextEditors
					for (const editor of visibleEditors) {
						// DIFF_VIEW_URI_SCHEME = "coolcline-diff"
						if (editor.document.uri.scheme === "coolcline-diff") {
							try {
								await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
							} catch (closeError) {
								console.log(`Error closing editor: ${closeError.message || closeError}`)
								// 忽略关闭编辑器出现的错误
							}
						}
					}
				} catch (diffError) {
					console.log(`Error closing diff editors: ${diffError.message || diffError}`)
					// 忽略关闭差异编辑器时出现的错误
				}
			}

			// 更新 checkpoint 状态
			await this.saveCoolClineMessages()
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			this.providerRef
				.deref()
				?.log(
					`[checkpointRestore] Encountered unexpected error: $${err instanceof Error ? err.message : String(err)}`,
				)
			vscode.window.showErrorMessage(`Failed to restore checkpoint: ${errorMessage}`)
		}
	}
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
