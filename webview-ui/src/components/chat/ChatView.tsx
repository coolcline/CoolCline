import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import debounce from "debounce"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEvent, useMount } from "react-use"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import styled from "styled-components"
import {
	CoolClineAsk,
	CoolClineMessage,
	CoolClineSayBrowserAction,
	CoolClineSayTool,
	ExtensionMessage,
} from "../../../../src/shared/ExtensionMessage"
import { McpServer, McpTool } from "../../../../src/shared/mcp"
import { findLast } from "../../../../src/shared/array"
import { combineApiRequests } from "../../../../src/shared/combineApiRequests"
import { combineCommandSequences } from "../../../../src/shared/combineCommandSequences"
import { getApiMetrics } from "../../../../src/shared/getApiMetrics"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import HistoryPreview from "../history/HistoryPreview"
import { normalizeApiConfiguration } from "../settings/ApiOptions"
import Announcement from "./Announcement"
import BrowserSessionRow from "./BrowserSessionRow"
import ChatRow from "./ChatRow"
import ChatTextArea from "./ChatTextArea"
import TaskHeader from "./TaskHeader"
import AutoApproveMenu from "./AutoApproveMenu"
import { AudioType } from "../../../../src/shared/WebviewMessage"
import { validateCommand } from "../../utils/command-validation"
import { useTranslation } from "react-i18next"

interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
	showHistoryView: () => void
}

export const MAX_IMAGES_PER_MESSAGE = 20 // Anthropic limits to 20 images

// 添加消息显示配置接口
interface MessageDisplayConfig {
	showApiReqFinished?: boolean
	showApiReqRetried?: boolean
	showApiReqDeleted?: boolean
	showRetryDelayed?: boolean
}

// 添加默认配置
const defaultMessageDisplayConfig: MessageDisplayConfig = {
	showApiReqFinished: false,
	showApiReqRetried: false,
	showApiReqDeleted: false,
	showRetryDelayed: true,
}

const ChatView = ({ isHidden, showAnnouncement, hideAnnouncement, showHistoryView }: ChatViewProps) => {
	const {
		version,
		coolclineMessages: messages,
		taskHistory,
		apiConfiguration,
		mcpServers,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowWrite,
		alwaysAllowExecute,
		alwaysAllowMcp,
		allowedCommands,
		writeDelayMs,
		mode,
		setMode,
		autoApprovalEnabled,
		alwaysAllowModeSwitch,
	} = useExtensionState()

	//const task = messages.length > 0 ? (messages[0].say === "task" ? messages[0] : undefined) : undefined) : undefined
	const task = useMemo(() => messages.at(0), [messages]) // leaving this less safe version here since if the first message is not a task, then the extension is in a bad state and needs to be debugged (see CoolCline.abort)
	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages.slice(1))), [messages])
	// has to be after api_req_finished are all reduced into api_req_started messages
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [textAreaDisabled, setTextAreaDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	// we need to hold on to the ask because useEffect > lastMessage will always let us know when an ask comes in and handle it, but by the time handleMessage is called, the last message might not be the ask anymore (it could be a say that followed)
	const [coolclineAsk, setCoolClineAsk] = useState<CoolClineAsk | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>(undefined)
	const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>(undefined)
	const [didClickCancel, setDidClickCancel] = useState(false)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)
	const userScrolledRef = useRef(false)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(false)

	const [wasStreaming, setWasStreaming] = useState<boolean>(false)

	// UI layout depends on the last 2 messages
	// (since it relies on the content of these messages, we are deep comparing. i.e. the button state after hitting button sets enableButtons to false, and this effect otherwise would have to true again even if messages didn't change
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	const { t } = useTranslation()

	function playSound(audioType: AudioType) {
		vscode.postMessage({ type: "playSound", audioType })
	}

	useEffect(() => {
		// if last message is an ask, show user ask UI
		// if user finished a task, then start a new task with a new conversation history since in this moment that the extension is waiting for user response, the user could close the extension and the conversation history would be lost.
		// basically as long as a task is active, the conversation history will be persisted
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							playSound("progress_loop")
							setTextAreaDisabled(true)
							setCoolClineAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat.actions.retry"))
							setSecondaryButtonText(t("chat.actions.startNewTask"))
							break
						case "mistake_limit_reached":
							playSound("progress_loop")
							setTextAreaDisabled(false)
							setCoolClineAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat.actions.proceedAnyways"))
							setSecondaryButtonText(t("chat.actions.startNewTask"))
							break
						case "followup":
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("followup")
							setEnableButtons(isPartial)
							// setPrimaryButtonText(undefined)
							// setSecondaryButtonText(undefined)
							break
						case "tool":
							if (!isAutoApproved(lastMessage)) {
								playSound("notification")
							}
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("tool")
							setEnableButtons(!isPartial)
							const tool = JSON.parse(lastMessage.text || "{}") as CoolClineSayTool
							switch (tool.tool) {
								case "editedExistingFile":
								case "appliedDiff":
								case "newFileCreated":
									setPrimaryButtonText(t("chat.actions.save"))
									setSecondaryButtonText(t("chat.actions.reject"))
									break
								default:
									setPrimaryButtonText(t("chat.actions.approve"))
									setSecondaryButtonText(t("chat.actions.reject"))
									break
							}
							break
						case "browser_action_launch":
							if (!isAutoApproved(lastMessage)) {
								playSound("notification")
							}
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("browser_action_launch")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat.actions.approve"))
							setSecondaryButtonText(t("chat.actions.reject"))
							break
						case "command":
							if (!isAutoApproved(lastMessage)) {
								playSound("notification")
							}
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat.actions.runCommand"))
							setSecondaryButtonText(t("chat.actions.reject"))
							break
						case "command_output":
							setTextAreaDisabled(false)
							setCoolClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat.actions.proceedWhileRunning"))
							setSecondaryButtonText(undefined)
							break
						case "use_mcp_server":
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat.actions.approve"))
							setSecondaryButtonText(t("chat.actions.reject"))
							break
						case "completion_result":
							// extension waiting for feedback. but we can just present a new task button
							playSound("celebration")
							setTextAreaDisabled(isPartial)
							setCoolClineAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat.actions.startNewTask"))
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							setTextAreaDisabled(false)
							setCoolClineAsk("resume_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat.actions.resumeTask"))
							setSecondaryButtonText(t("chat.actions.terminate"))
							setDidClickCancel(false) // special case where we reset the cancel button state
							break
						case "resume_completed_task":
							setTextAreaDisabled(false)
							setCoolClineAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat.actions.startNewTask"))
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
					}
					break
				case "say":
					// don't want to reset since there could be a "say" after an "ask" while ask is waiting for response
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
							setTextAreaDisabled(true)
							break
						case "api_req_started":
							if (secondLastMessage?.ask === "command_output") {
								// if the last ask is a command_output, and we receive an api_req_started, then that means the command has finished and we don't need input from the user anymore (in every other case, the user has to interact with input field or buttons to continue, which does the following automatically)
								setInputValue("")
								setTextAreaDisabled(true)
								setSelectedImages([])
								setCoolClineAsk(undefined)
								setEnableButtons(false)
							}
							break
						case "task":
						case "error":
						case "api_req_finished":
						case "text":
						case "browser_action":
						case "browser_action_result":
						case "command_output":
						case "mcp_server_request_started":
						case "mcp_server_response":
						case "completion_result":
						case "tool":
							break
					}
					break
			}
		} else {
			// this would get called after sending the first message, so we have to watch messages.length instead
			// No messages, so user has to submit a task
			// setTextAreaDisabled(false)
			// setCoolClineAsk(undefined)
			// setPrimaryButtonText(undefined)
			// setSecondaryButtonText(undefined)
		}
	}, [lastMessage, secondLastMessage])

	useEffect(() => {
		if (messages.length === 0) {
			setTextAreaDisabled(false)
			setCoolClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		}
	}, [messages.length])

	useEffect(() => {
		setExpandedRows({})
	}, [task?.ts])

	const isStreaming = useMemo(() => {
		const isLastAsk = !!modifiedMessages.at(-1)?.ask // checking coolclineAsk isn't enough since messages effect may be called again for a tool for example, set coolclineAsk to its value, and if the next message is not an ask then it doesn't reset. This is likely due to how much more often we're updating messages as compared to before, and should be resolved with optimizations as it's likely a rendering bug. but as a final guard for now, the cancel button will show if the last message is not an ask
		const isToolCurrentlyAsking =
			isLastAsk && coolclineAsk !== undefined && enableButtons && primaryButtonText !== undefined
		if (isToolCurrentlyAsking) {
			return false
		}

		const isLastMessagePartial = modifiedMessages.at(-1)?.partial === true
		if (isLastMessagePartial) {
			return true
		} else {
			const lastApiReqStarted = findLast(modifiedMessages, (message) => message.say === "api_req_started")
			if (
				lastApiReqStarted &&
				lastApiReqStarted.text !== null &&
				lastApiReqStarted.text !== undefined &&
				lastApiReqStarted.say === "api_req_started"
			) {
				const cost = JSON.parse(lastApiReqStarted.text).cost
				if (cost === undefined) {
					// api request has not finished yet
					return true
				}
			}
		}

		return false
	}, [modifiedMessages, coolclineAsk, enableButtons, primaryButtonText])

	const handleSendMessage = useCallback(
		(text: string, images: string[]) => {
			text = text.trim()
			if (text || images.length > 0) {
				if (messages.length === 0) {
					vscode.postMessage({ type: "newTask", text, images })
				} else if (coolclineAsk) {
					switch (coolclineAsk) {
						case "followup":
						case "tool":
						case "browser_action_launch":
						case "command": // user can provide feedback to a tool or command use
						case "command_output": // user can send input to command stdin
						case "use_mcp_server":
						case "completion_result": // if this happens then the user has feedback for the completion result
						case "resume_task":
						case "resume_completed_task":
						case "mistake_limit_reached":
							vscode.postMessage({
								type: "askResponse",
								askResponse: "messageResponse",
								text,
								images,
							})
							break
						// there is no other case that a textfield should be enabled
					}
				}
				// Only reset message-specific state, preserving mode
				setInputValue("")
				setTextAreaDisabled(true)
				setSelectedImages([])
				setCoolClineAsk(undefined)
				setEnableButtons(false)
				// Do not reset mode here as it should persist
				// setPrimaryButtonText(undefined)
				// setSecondaryButtonText(undefined)
				disableAutoScrollRef.current = false
				// 在用户发送新消息时，恢复自动滚动功能
				userScrolledRef.current = false
			}
		},
		[messages.length, coolclineAsk],
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[]) => {
			// Avoid nested template literals by breaking down the logic
			let newValue = text
			if (inputValue !== "") {
				newValue = inputValue + " " + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	const startNewTask = useCallback(() => {
		vscode.postMessage({ type: "clearTask" })
	}, [])

	/*
	This logic depends on the useEffect[messages] above to set coolclineAsk, after which buttons are shown and we then send an askResponse to the extension.
	*/
	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			const trimmedInput = text?.trim()
			switch (coolclineAsk) {
				case "api_req_failed":
				case "command":
				case "command_output":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
				case "resume_task":
				case "mistake_limit_reached":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
							text: trimmedInput,
							images: images,
						})
					} else {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
						})
					}
					// 只在非工具使用时清空输入框，这样运行过程中输入框内容就不会自动清空了
					if (coolclineAsk !== "tool") {
						setInputValue("")
						setSelectedImages([])
					}
					break
				case "completion_result":
				case "resume_completed_task":
					// extension waiting for feedback. but we can just present a new task button
					startNewTask()
					break
			}
			setTextAreaDisabled(true)
			setCoolClineAsk(undefined)
			setEnableButtons(false)
			disableAutoScrollRef.current = false
			// 移除重置用户滚动标记，保持用户滚动状态
			// userScrolledRef.current = false
		},
		[coolclineAsk, startNewTask],
	)

	const handleSecondaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			const trimmedInput = text?.trim()
			if (isStreaming) {
				vscode.postMessage({ type: "cancelTask" })
				setDidClickCancel(true)
				return
			}

			switch (coolclineAsk) {
				case "api_req_failed":
				case "mistake_limit_reached":
				case "resume_task":
					startNewTask()
					break
				case "command":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
							text: trimmedInput,
							images: images,
						})
					} else {
						// responds to the API with a "This operation failed" and lets it try again
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
						})
					}
					// Clear input state after sending
					setInputValue("")
					setSelectedImages([])
					break
			}
			setTextAreaDisabled(true)
			setCoolClineAsk(undefined)
			setEnableButtons(false)
			disableAutoScrollRef.current = false
			// 移除重置用户滚动标记，保持用户滚动状态
			// userScrolledRef.current = false
		},
		[coolclineAsk, startNewTask, isStreaming],
	)

	const handleTaskCloseButtonClick = useCallback(() => {
		startNewTask()
	}, [startNewTask])

	const { selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	const selectImages = useCallback(() => {
		vscode.postMessage({ type: "selectImages" })
	}, [])

	const shouldDisableImages =
		!selectedModelInfo.supportsImages || textAreaDisabled || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data
			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden && !textAreaDisabled && !enableButtons) {
								textAreaRef.current?.focus()
							}
							break
					}
					break
				case "selectedImages":
					const newImages = message.images ?? []
					if (newImages.length > 0) {
						setSelectedImages((prevImages) =>
							[...prevImages, ...newImages].slice(0, MAX_IMAGES_PER_MESSAGE),
						)
					}
					break
				case "invoke":
					switch (message.invoke!) {
						case "sendMessage":
							handleSendMessage(message.text ?? "", message.images ?? [])
							break
						case "setChatBoxMessage":
							handleSetChatBoxMessage(message.text ?? "", message.images ?? [])
							break
						case "primaryButtonClick":
							handlePrimaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "secondaryButtonClick":
							handleSecondaryButtonClick(message.text ?? "", message.images ?? [])
							break
					}
			}
			// textAreaRef.current is not explicitly required here since react gaurantees that ref will be stable across re-renders, and we're not using its value but its reference.
		},
		[
			isHidden,
			textAreaDisabled,
			enableButtons,
			handleSendMessage,
			handleSetChatBoxMessage,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
		],
	)

	useEvent("message", handleMessage)

	useMount(() => {
		// NOTE: the vscode window needs to be focused for this to work
		textAreaRef.current?.focus()
	})

	useEffect(() => {
		const timer = setTimeout(() => {
			if (!isHidden && !textAreaDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		}, 50)
		return () => {
			clearTimeout(timer)
		}
	}, [isHidden, textAreaDisabled, enableButtons])

	const visibleMessages = useMemo(() => {
		// 添加第一条消息（任务消息）
		const result: CoolClineMessage[] = []
		if (messages.length > 0) {
			// 将第一条消息添加到结果中，不管它是什么类型
			result.push(messages[0])
		} else {
			console.log("没有消息")
		}

		// 添加其他可见消息
		result.push(
			...modifiedMessages.filter((message) => {
				switch (message.ask) {
					case "completion_result":
						// don't show a chat row for a completion_result ask without text. This specific type of message only occurs if coolcline wants to execute a command as part of its completion result, in which case we interject the completion_result tool with the execute_command tool.
						if (message.text === "") {
							return false
						}
						break
					case "api_req_failed": // this message is used to update the latest api_req_started that the request failed
					case "resume_task":
					case "resume_completed_task":
						return false
				}
				switch (message.say) {
					case "api_req_finished": // combineApiRequests removes this from modifiedMessages anyways
					case "api_req_retried": // this message is used to update the latest api_req_started that the request was retried
						return false
					case "api_req_retry_delayed":
						// Only show the retry message if it's the last message
						return message === modifiedMessages.at(-1)
					case "text":
						// Sometimes coolcline returns an empty text message, we don't want to render these. (We also use a say text for user messages, so in case they just sent images we still render that)
						if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
							return false
						}
						break
					case "mcp_server_request_started":
						return false
				}
				return true
			}),
		)

		return result
	}, [modifiedMessages, messages])

	const isReadOnlyToolAction = useCallback((message: CoolClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}
			const tool = JSON.parse(message.text)
			return [
				"readFile",
				"listFiles",
				"listFilesTopLevel",
				"listFilesRecursive",
				"listCodeDefinitionNames",
				"searchFiles",
			].includes(tool.tool)
		}
		return false
	}, [])

	const isWriteToolAction = useCallback((message: CoolClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}
			const tool = JSON.parse(message.text)
			return ["editedExistingFile", "appliedDiff", "newFileCreated"].includes(tool.tool)
		}
		return false
	}, [])

	const isMcpToolAlwaysAllowed = useCallback(
		(message: CoolClineMessage | undefined) => {
			if (message?.type === "ask" && message.ask === "use_mcp_server") {
				if (!message.text) {
					return true
				}
				const mcpServerUse = JSON.parse(message.text) as {
					type: string
					serverName: string
					toolName: string
				}
				if (mcpServerUse.type === "use_mcp_tool") {
					const server = mcpServers?.find((s: McpServer) => s.name === mcpServerUse.serverName)
					const tool = server?.tools?.find((t: McpTool) => t.name === mcpServerUse.toolName)
					return tool?.alwaysAllow || false
				}
			}
			return false
		},
		[mcpServers],
	)

	// Check if a command message is allowed
	const isAllowedCommand = useCallback(
		(message: CoolClineMessage | undefined): boolean => {
			if (message?.type !== "ask") return false
			return validateCommand(message.text || "", allowedCommands || [])
		},
		[allowedCommands],
	)

	const isAutoApproved = useCallback(
		(message: CoolClineMessage | undefined) => {
			if (!autoApprovalEnabled || !message || message.type !== "ask") {
				return false
			}

			return (
				(alwaysAllowBrowser && message.ask === "browser_action_launch") ||
				(alwaysAllowReadOnly && message.ask === "tool" && isReadOnlyToolAction(message)) ||
				(alwaysAllowWrite && message.ask === "tool" && isWriteToolAction(message)) ||
				(alwaysAllowExecute && message.ask === "command" && isAllowedCommand(message)) ||
				(alwaysAllowMcp && message.ask === "use_mcp_server" && isMcpToolAlwaysAllowed(message)) ||
				(alwaysAllowModeSwitch &&
					message.ask === "tool" &&
					(JSON.parse(message.text || "{}")?.tool === "switchMode" ||
						JSON.parse(message.text || "{}")?.tool === "newTask"))
			)
		},
		[
			autoApprovalEnabled,
			alwaysAllowBrowser,
			alwaysAllowReadOnly,
			isReadOnlyToolAction,
			alwaysAllowWrite,
			isWriteToolAction,
			alwaysAllowExecute,
			isAllowedCommand,
			alwaysAllowMcp,
			isMcpToolAlwaysAllowed,
			alwaysAllowModeSwitch,
		],
	)

	useEffect(() => {
		// Only execute when isStreaming changes from true to false
		if (wasStreaming && !isStreaming && lastMessage) {
			// Play appropriate sound based on lastMessage content
			if (lastMessage.type === "ask") {
				// Don't play sounds for auto-approved actions
				if (!isAutoApproved(lastMessage)) {
					switch (lastMessage.ask) {
						case "api_req_failed":
						case "mistake_limit_reached":
							playSound("progress_loop")
							break
						case "followup":
							if (!lastMessage.partial) {
								playSound("notification")
							}
							break
						case "tool":
						case "browser_action_launch":
						case "resume_task":
						case "use_mcp_server":
							playSound("notification")
							break
						case "completion_result":
						case "resume_completed_task":
							playSound("celebration")
							break
					}
				}
			}
		}
		// Update previous value
		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, isAutoApproved])

	const isBrowserSessionMessage = (message: CoolClineMessage): boolean => {
		// which of visible messages are browser session messages, see above
		if (message.type === "ask") {
			return ["browser_action_launch"].includes(message.ask!)
		}
		if (message.type === "say") {
			return ["api_req_started", "text", "browser_action", "browser_action_result"].includes(message.say!)
		}
		return false
	}

	const groupedMessages = useMemo(() => {
		const result: (CoolClineMessage | CoolClineMessage[])[] = []
		let currentGroup: CoolClineMessage[] = []
		let isInBrowserSession = false

		const endBrowserSession = () => {
			if (currentGroup.length > 0) {
				result.push([...currentGroup])
				currentGroup = []
				isInBrowserSession = false
			}
		}

		visibleMessages.forEach((message) => {
			if (message.ask === "browser_action_launch") {
				// complete existing browser session if any
				endBrowserSession()
				// start new
				isInBrowserSession = true
				currentGroup.push(message)
			} else if (isInBrowserSession) {
				// end session if api_req_started is cancelled

				if (message.say === "api_req_started") {
					// get last api_req_started in currentGroup to check if it's cancelled. If it is then this api req is not part of the current browser session
					const lastApiReqStarted = [...currentGroup].reverse().find((m) => m.say === "api_req_started")
					if (lastApiReqStarted?.text !== null && lastApiReqStarted?.text !== undefined) {
						const info = JSON.parse(lastApiReqStarted.text)
						const isCancelled = info.cancelReason !== null && info.cancelReason !== undefined
						if (isCancelled) {
							endBrowserSession()
							result.push(message)
							return
						}
					}
				}

				if (isBrowserSessionMessage(message)) {
					currentGroup.push(message)

					// Check if this is a close action
					if (message.say === "browser_action") {
						const browserAction = JSON.parse(message.text || "{}") as CoolClineSayBrowserAction
						if (browserAction.action === "close") {
							endBrowserSession()
						}
					}
				} else {
					// complete existing browser session if any
					endBrowserSession()
					result.push(message)
				}
			} else {
				result.push(message)
			}
		})

		// Handle case where browser session is the last group
		if (currentGroup.length > 0) {
			result.push([...currentGroup])
		}

		return result
	}, [visibleMessages])

	// scrolling

	const scrollToBottomSmooth = useMemo(
		() =>
			debounce(
				() => {
					virtuosoRef.current?.scrollTo({
						top: Number.MAX_SAFE_INTEGER,
						behavior: "smooth",
					})
				},
				10,
				{ immediate: true },
			),
		[],
	)

	const scrollToBottomAuto = useCallback(() => {
		virtuosoRef.current?.scrollTo({
			top: Number.MAX_SAFE_INTEGER,
			behavior: "auto", // instant causes crash
		})
	}, [])

	// 判断是否应该自动滚动
	const shouldAutoScroll = useCallback(() => {
		return !disableAutoScrollRef.current && !userScrolledRef.current
	}, [])

	// scroll when user toggles certain rows
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			const isCollapsing = expandedRows[ts] ?? false
			const lastGroup = groupedMessages.at(-1)
			const isLast = Array.isArray(lastGroup) ? lastGroup[0].ts === ts : lastGroup?.ts === ts
			const secondToLastGroup = groupedMessages.at(-2)
			const isSecondToLast = Array.isArray(secondToLastGroup)
				? secondToLastGroup[0].ts === ts
				: secondToLastGroup?.ts === ts

			const isLastCollapsedApiReq =
				isLast &&
				!Array.isArray(lastGroup) && // Make sure it's not a browser session group
				lastGroup?.say === "api_req_started" &&
				!expandedRows[lastGroup.ts]

			setExpandedRows((prev) => ({
				...prev,
				[ts]: !prev[ts],
			}))

			// disable auto scroll when user expands row
			if (!isCollapsing) {
				disableAutoScrollRef.current = true
			}

			if (isCollapsing && isAtBottom) {
				const timer = setTimeout(() => {
					scrollToBottomAuto()
				}, 0)
				return () => clearTimeout(timer)
			} else if (isLast || isSecondToLast) {
				if (isCollapsing) {
					if (isSecondToLast && !isLastCollapsedApiReq) {
						return
					}
					const timer = setTimeout(() => {
						scrollToBottomAuto()
					}, 0)
					return () => clearTimeout(timer)
				} else {
					const timer = setTimeout(() => {
						virtuosoRef.current?.scrollToIndex({
							index: groupedMessages.length - (isLast ? 1 : 2),
							align: "start",
						})
					}, 0)
					return () => clearTimeout(timer)
				}
			}
		},
		[groupedMessages, expandedRows, scrollToBottomAuto, isAtBottom],
	)

	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (shouldAutoScroll()) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					setTimeout(() => {
						scrollToBottomAuto()
					}, 0)
				}
			}
		},
		[scrollToBottomSmooth, scrollToBottomAuto, shouldAutoScroll],
	)

	const handleWheel = useCallback((event: Event) => {
		const wheelEvent = event as WheelEvent
		if (wheelEvent.deltaY) {
			if (scrollContainerRef.current?.contains(wheelEvent.target as Node)) {
				// 用户滚动时禁用自动滚动，无论是向上还是向下滚动
				disableAutoScrollRef.current = true
				userScrolledRef.current = true
			}
		}
	}, [])

	useEvent("wheel", handleWheel, window, { passive: true }) // passive improves scrolling performance

	useEffect(() => {
		if (shouldAutoScroll()) {
			setTimeout(() => {
				scrollToBottomSmooth()
			}, 50)
		}
	}, [groupedMessages.length, scrollToBottomSmooth, shouldAutoScroll])

	const placeholderText = useMemo(() => {
		const baseText = task ? String(t("chat.input.typeMessage")) : String(t("chat.input.typeTask"))
		const contextText = String(t("chat.input.addContext"))
		const switchModeText = String(t("chat.input.switchMode"))
		const imageText = shouldDisableImages ? "" : String(t("chat.input.dragImages"))
		const helpText = imageText
			? `\n${contextText}${switchModeText}${imageText})`
			: `\n${contextText}${switchModeText})`
		return baseText + helpText
	}, [task, shouldDisableImages, t])

	const itemContent = useCallback(
		(index: number, messageOrGroup: CoolClineMessage | CoolClineMessage[]) => {
			// browser session group
			if (Array.isArray(messageOrGroup)) {
				return (
					<BrowserSessionRow
						messages={messageOrGroup}
						isLast={index === groupedMessages.length - 1}
						lastModifiedMessage={modifiedMessages.at(-1)}
						onHeightChange={handleRowHeightChange}
						isStreaming={isStreaming}
						// Pass handlers for each message in the group
						isExpanded={(messageTs: number) => expandedRows[messageTs] ?? false}
						onToggleExpand={(messageTs: number) => {
							setExpandedRows((prev) => ({
								...prev,
								[messageTs]: !prev[messageTs],
							}))
						}}
					/>
				)
			}

			// regular message
			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={() => toggleRowExpansion(messageOrGroup.ts)}
					lastModifiedMessage={modifiedMessages.at(-1)}
					isLast={index === groupedMessages.length - 1}
					onHeightChange={handleRowHeightChange}
					isStreaming={isStreaming}
				/>
			)
		},
		[
			expandedRows,
			modifiedMessages,
			groupedMessages.length,
			handleRowHeightChange,
			isStreaming,
			toggleRowExpansion,
		],
	)

	useEffect(() => {
		// Only proceed if we have an ask and buttons are enabled
		if (!coolclineAsk || !enableButtons) return

		const autoApprove = async () => {
			if (isAutoApproved(lastMessage)) {
				// Add delay for write operations
				if (lastMessage?.ask === "tool" && isWriteToolAction(lastMessage)) {
					await new Promise((resolve) => setTimeout(resolve, writeDelayMs))
				}
				handlePrimaryButtonClick()
			}
		}
		autoApprove()
	}, [
		coolclineAsk,
		enableButtons,
		handlePrimaryButtonClick,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowWrite,
		alwaysAllowExecute,
		alwaysAllowMcp,
		messages,
		allowedCommands,
		mcpServers,
		isAutoApproved,
		lastMessage,
		writeDelayMs,
		isWriteToolAction,
	])

	const shouldShowMessage = useCallback(
		(message: CoolClineMessage, config: MessageDisplayConfig = defaultMessageDisplayConfig) => {
			switch (message.say) {
				case "api_req_finished":
					return config.showApiReqFinished ?? defaultMessageDisplayConfig.showApiReqFinished
				case "api_req_retried":
					return config.showApiReqRetried ?? defaultMessageDisplayConfig.showApiReqRetried
				case "api_req_deleted":
					return config.showApiReqDeleted ?? defaultMessageDisplayConfig.showApiReqDeleted
				case "api_req_retry_delayed":
					if (!(config.showRetryDelayed ?? defaultMessageDisplayConfig.showRetryDelayed)) {
						return false
					}
					return message === messages[messages.length - 1]
				default:
					return true
			}
		},
		[messages],
	)

	const atBottomStateChange = useCallback((isAtBottom: boolean) => {
		setIsAtBottom(isAtBottom)
		// 只有在用户手动滚动且不在底部时显示滚动按钮
		setShowScrollToBottom(userScrolledRef.current && !isAtBottom)
	}, [])

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: isHidden ? "none" : "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			{task ? (
				<TaskHeader
					task={task}
					tokensIn={apiMetrics.totalTokensIn}
					tokensOut={apiMetrics.totalTokensOut}
					doesModelSupportPromptCache={selectedModelInfo.supportsPromptCache}
					cacheWrites={apiMetrics.totalCacheWrites}
					cacheReads={apiMetrics.totalCacheReads}
					totalCost={apiMetrics.totalCost}
					contextTokens={apiMetrics.contextTokens}
					onClose={handleTaskCloseButtonClick}
				/>
			) : (
				<div
					style={{
						flex: "1 1 0", // flex-grow: 1, flex-shrink: 1, flex-basis: 0
						minHeight: 0,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						paddingBottom: "10px",
					}}>
					{showAnnouncement && <Announcement version={version} hideAnnouncement={hideAnnouncement} />}
					<div style={{ padding: "0 20px", flexShrink: 0 }}>
						<h2>{String(t("chat.welcome.title"))}</h2>
						<p>
							{String(t("chat.welcome.description"))} {String(t("chat.welcome.readMore"))}
							{":"}
							<VSCodeLink
								href="https://github.com/coolcline/coolcline/blob/main/docs/user-docs/en/index.md"
								style={{ display: "inline" }}>
								en
							</VSCodeLink>
							{"|"}
							<VSCodeLink
								href="https://gitee.com/coolcline/coolcline/blob/main/docs/user-docs/zh/index.md"
								style={{ display: "inline" }}>
								简体中文
							</VSCodeLink>
						</p>
					</div>
					{taskHistory.length > 0 && <HistoryPreview showHistoryView={showHistoryView} />}
				</div>
			)}

			{/*
			// Flex layout explanation:
			// 1. Content div above uses flex: "1 1 0" to:
			//    - Grow to fill available space (flex-grow: 1)
			//    - Shrink when AutoApproveMenu needs space (flex-shrink: 1)
			//    - Start from zero size (flex-basis: 0) to ensure proper distribution
			//    minHeight: 0 allows it to shrink below its content height
			//
			// 2. AutoApproveMenu uses flex: "0 1 auto" to:
			//    - Not grow beyond its content (flex-grow: 0)
			//    - Shrink when viewport is small (flex-shrink: 1)
			//    - Use its content size as basis (flex-basis: auto)
			//    This ensures it takes its natural height when there's space
			//    but becomes scrollable when the viewport is too small
			*/}
			{!task && (
				<AutoApproveMenu
					style={{
						marginBottom: -2,
						flex: "0 1 auto", // flex-grow: 0, flex-shrink: 1, flex-basis: auto
						minHeight: 0,
					}}
				/>
			)}

			{task && (
				<>
					<div style={{ flexGrow: 1, display: "flex" }} ref={scrollContainerRef}>
						<Virtuoso
							ref={virtuosoRef}
							key={task.ts} // trick to make sure virtuoso re-renders when task changes, and we use initialTopMostItemIndex to start at the bottom
							className="scrollable"
							style={{
								flexGrow: 1,
								overflowY: "scroll", // always show scrollbar
							}}
							components={{
								Footer: () => <div style={{ height: 5 }} />, // Add empty padding at the bottom
							}}
							// increasing top by 3_000 to prevent jumping around when user collapses a row
							increaseViewportBy={{
								top: 3_000,
								bottom: Number.MAX_SAFE_INTEGER,
							}} // hack to make sure the last message is always rendered to get truly perfect scroll to bottom animation when new messages are added (Number.MAX_SAFE_INTEGER is safe for arithmetic operations, which is all virtuoso uses this value for in src/sizeRangeSystem.ts)
							data={groupedMessages} // messages is the raw format returned by extension, modifiedMessages is the manipulated structure that combines certain messages of related type, and visibleMessages is the filtered structure that removes messages that should not be rendered
							itemContent={itemContent}
							atBottomStateChange={atBottomStateChange}
							atBottomThreshold={10} // anything lower causes issues with followOutput
							initialTopMostItemIndex={groupedMessages.length - 1}
						/>
					</div>
					<AutoApproveMenu />
					{showScrollToBottom ? (
						<div
							style={{
								display: "flex",
								padding: "10px 15px 0px 15px",
							}}>
							<ScrollToBottomButton
								onClick={() => {
									scrollToBottomSmooth()
									disableAutoScrollRef.current = false
									userScrolledRef.current = false
								}}>
								<span className="codicon codicon-chevron-down" style={{ fontSize: "18px" }}></span>
							</ScrollToBottomButton>
						</div>
					) : (
						<div
							style={{
								opacity:
									primaryButtonText || secondaryButtonText || isStreaming
										? enableButtons || (isStreaming && !didClickCancel)
											? 1
											: 0.5
										: 0,
								display: "flex",
								padding: `${
									primaryButtonText || secondaryButtonText || isStreaming ? "10" : "0"
								}px 15px 0px 15px`,
							}}>
							{primaryButtonText && !isStreaming && (
								<VSCodeButton
									appearance="primary"
									disabled={!enableButtons}
									style={{
										flex: secondaryButtonText ? 1 : 2,
										marginRight: secondaryButtonText ? "6px" : "0",
									}}
									onClick={(e) => handlePrimaryButtonClick(inputValue, selectedImages)}>
									{primaryButtonText}
								</VSCodeButton>
							)}
							{(secondaryButtonText || isStreaming) && (
								<VSCodeButton
									appearance="secondary"
									disabled={!enableButtons && !(isStreaming && !didClickCancel)}
									style={{
										flex: isStreaming ? 2 : 1,
										marginLeft: isStreaming ? 0 : "6px",
									}}
									onClick={(e) => handleSecondaryButtonClick(inputValue, selectedImages)}>
									{isStreaming ? t("chat.actions.cancel") : secondaryButtonText}
								</VSCodeButton>
							)}
						</div>
					)}
				</>
			)}
			<ChatTextArea
				ref={textAreaRef}
				inputValue={inputValue}
				setInputValue={setInputValue}
				textAreaDisabled={textAreaDisabled}
				placeholderText={placeholderText}
				selectedImages={selectedImages}
				setSelectedImages={setSelectedImages}
				onSend={() => handleSendMessage(inputValue, selectedImages)}
				onSelectImages={selectImages}
				shouldDisableImages={shouldDisableImages}
				onHeightChange={() => {
					if (isAtBottom) {
						scrollToBottomAuto()
					}
				}}
				mode={mode}
				setMode={setMode}
			/>
		</div>
	)
}

const ScrollToBottomButton = styled.div`
	background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 55%, transparent);
	border-radius: 3px;
	overflow: hidden;
	cursor: pointer;
	display: flex;
	justify-content: center;
	align-items: center;
	flex: 1;
	height: 25px;

	&:hover {
		background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 90%, transparent);
	}

	&:active {
		background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
	}
`

export default ChatView
