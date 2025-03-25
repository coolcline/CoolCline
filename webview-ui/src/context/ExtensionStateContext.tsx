import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ApiConfigMeta, ExtensionMessage, ExtensionState } from "../../../src/shared/ExtensionMessage"
import {
	ApiConfiguration,
	ModelInfo,
	glamaDefaultModelId,
	glamaDefaultModelInfo,
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	unboundDefaultModelId,
	unboundModels,
} from "../../../src/shared/api"
import { vscode } from "../utils/vscode"
import { convertTextMateToHljs } from "../utils/textMateToHljs"
import { findLastIndex } from "../../../src/shared/array"
import { McpServer } from "../../../src/shared/mcp"
import { checkExistKey } from "../../../src/shared/checkExistApiConfig"
import { Mode, CustomModePrompts, defaultModeSlug, defaultPrompts, ModeConfig } from "../../../src/shared/modes"
import { CustomSupportPrompts } from "../../../src/shared/support-prompt"
import { experimentDefault, ExperimentId } from "../../../src/shared/experiments"
import { initializeLanguage } from "../utils/i18n"

export interface ExtensionStateContextType extends ExtensionState {
	didHydrateState: boolean
	showWelcome: boolean
	theme: any
	glamaModels: Record<string, ModelInfo>
	openRouterModels: Record<string, ModelInfo>
	openAiModels: string[]
	unboundModels: Record<string, ModelInfo>
	mcpServers: McpServer[]
	filePaths: string[]
	openedTabs: Array<{ label: string; isActive: boolean; path?: string }>
	setApiConfiguration: (config: ApiConfiguration) => void
	setCustomInstructions: (value?: string) => void
	setAlwaysAllowReadOnly: (value: boolean) => void
	setAlwaysAllowWrite: (value: boolean) => void
	setAlwaysAllowExecute: (value: boolean) => void
	setAlwaysAllowBrowser: (value: boolean) => void
	setAlwaysAllowMcp: (value: boolean) => void
	setAlwaysAllowModeSwitch: (value: boolean) => void
	setShowAnnouncement: (value: boolean) => void
	setAllowedCommands: (value: string[]) => void
	setSoundEnabled: (value: boolean) => void
	setSoundVolume: (value: number) => void
	setDiffEnabled: (value: boolean) => void
	setBrowserViewportSize: (value: string) => void
	setFuzzyMatchThreshold: (value: number) => void
	preferredLanguage: string
	setPreferredLanguage: (value: string) => void
	setWriteDelayMs: (value: number) => void
	screenshotQuality?: number
	setScreenshotQuality: (value: number) => void
	terminalOutputLineLimit?: number
	setTerminalOutputLineLimit: (value: number) => void
	mcpEnabled: boolean
	setMcpEnabled: (value: boolean) => void
	enableMcpServerCreation: boolean
	setEnableMcpServerCreation: (value: boolean) => void
	alwaysApproveResubmit?: boolean
	setAlwaysApproveResubmit: (value: boolean) => void
	requestDelaySeconds: number
	setRequestDelaySeconds: (value: number) => void
	rateLimitSeconds: number
	setRateLimitSeconds: (value: number) => void
	setCurrentApiConfigName: (value: string) => void
	setListApiConfigMeta: (value: ApiConfigMeta[]) => void
	onUpdateApiConfig: (apiConfig: ApiConfiguration) => void
	mode: Mode
	setMode: (value: Mode) => void
	setCustomModePrompts: (value: CustomModePrompts) => void
	setCustomSupportPrompts: (value: CustomSupportPrompts) => void
	enhancementApiConfigId?: string
	setEnhancementApiConfigId: (value: string) => void
	setExperimentEnabled: (id: ExperimentId, enabled: boolean) => void
	setAutoApprovalEnabled: (value: boolean) => void
	handleInputChange: (field: keyof ApiConfiguration, softUpdate?: boolean) => (event: any) => void
	customModes: ModeConfig[]
	setCustomModes: (value: ModeConfig[]) => void
	checkpointsEnabled: boolean
	setCheckpointsEnabled: (value: boolean) => void
	currentCheckpoint?: string
	requestyModels: Record<string, ModelInfo>
	// 编辑器类型设置
	editorType?: string
	setEditorType: (value: string) => void
	// 代码库索引相关状态
	codebaseIndexEnabled: boolean
	setCodebaseIndexEnabled: (value: boolean) => void
	codebaseIndexAutoStart: boolean
	setCodebaseIndexAutoStart: (value: boolean) => void
	codebaseIndexExcludePaths: string
	setCodebaseIndexExcludePaths: (value: string) => void
	codebaseIndexIncludeTests: boolean
	setCodebaseIndexIncludeTests: (value: boolean) => void
	// 代码库索引加载状态
	codebaseIndexLoading: boolean
}

export const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

export const ExtensionStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [state, setState] = useState<ExtensionState>({
		version: "",
		coolclineMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		allowedCommands: [],
		soundEnabled: false,
		soundVolume: 0.5,
		diffEnabled: false,
		fuzzyMatchThreshold: 1.0,
		preferredLanguage: "English",
		writeDelayMs: 1000,
		browserViewportSize: "900x600",
		screenshotQuality: 75,
		terminalOutputLineLimit: 500,
		mcpEnabled: true,
		enableMcpServerCreation: true,
		alwaysApproveResubmit: false,
		requestDelaySeconds: 5,
		rateLimitSeconds: 0, // Minimum time between successive requests (0 = disabled)
		currentApiConfigName: "default",
		listApiConfigMeta: [],
		mode: defaultModeSlug,
		customModePrompts: defaultPrompts,
		customSupportPrompts: {},
		experiments: experimentDefault,
		enhancementApiConfigId: "",
		autoApprovalEnabled: false,
		customModes: [],
		checkpointsEnabled: true,
		requestyModels: {},
		// 代码库索引相关状态
		codebaseIndexEnabled: true,
		codebaseIndexAutoStart: true,
		codebaseIndexExcludePaths: "node_modules,dist,build",
		codebaseIndexIncludeTests: false,
	})

	const [didHydrateState, setDidHydrateState] = useState(false)
	const [showWelcome, setShowWelcome] = useState(false)
	const [theme, setTheme] = useState<any>(undefined)
	const [filePaths, setFilePaths] = useState<string[]>([])
	const [glamaModels, setGlamaModels] = useState<Record<string, ModelInfo>>({
		[glamaDefaultModelId]: glamaDefaultModelInfo,
	})
	const [openedTabs, setOpenedTabs] = useState<Array<{ label: string; isActive: boolean; path?: string }>>([])
	const [openRouterModels, setOpenRouterModels] = useState<Record<string, ModelInfo>>({
		[openRouterDefaultModelId]: openRouterDefaultModelInfo,
	})

	const [openAiModels, setOpenAiModels] = useState<string[]>([])
	const [mcpServers, setMcpServers] = useState<McpServer[]>([])
	const [currentCheckpoint, setCurrentCheckpoint] = useState<string>()
	const [unboundModels, setUnboundModels] = useState<Record<string, ModelInfo>>({})

	// 代码库索引相关状态
	const [codebaseIndexEnabled, setCodebaseIndexEnabled] = useState<boolean>(() => {
		// console.log("初始化codebaseIndexEnabled状态，默认值为true")
		return true
	})
	const [codebaseIndexAutoStart, setCodebaseIndexAutoStart] = useState<boolean>(() => {
		// console.log("初始化codebaseIndexAutoStart状态，默认值为true")
		return true
	})
	const [codebaseIndexExcludePaths, setCodebaseIndexExcludePaths] = useState<string>("node_modules,dist,build")
	const [codebaseIndexIncludeTests, setCodebaseIndexIncludeTests] = useState<boolean>(false)
	// 代码库索引加载状态 - 初始为true表示正在等待后端消息
	const [codebaseIndexLoading, setCodebaseIndexLoading] = useState<boolean>(true)

	const setListApiConfigMeta = useCallback(
		(value: ApiConfigMeta[]) => setState((prevState) => ({ ...prevState, listApiConfigMeta: value })),
		[],
	)

	const onUpdateApiConfig = useCallback((apiConfig: ApiConfiguration) => {
		setState((currentState) => {
			vscode.postMessage({
				type: "upsertApiConfiguration",
				text: currentState.currentApiConfigName,
				apiConfiguration: apiConfig,
			})
			return currentState // No state update needed
		})
	}, [])

	const handleInputChange = useCallback(
		// Returns a function that handles an input change event for a specific API configuration field.
		// The optional "softUpdate" flag determines whether to immediately update local state or send an external update.
		(field: keyof ApiConfiguration, softUpdate?: boolean) => (event: any) => {
			// Use the functional form of setState to ensure the latest state is used in the update logic.
			setState((currentState) => {
				const newValue = event.target.value
				const updatedConfig = {
					...currentState.apiConfiguration,
					[field]: newValue,
				}

				if (softUpdate) {
					// For soft updates, only update the local state without sending a message
					return {
						...currentState,
						apiConfiguration: updatedConfig,
					}
				} else {
					// For non-soft updates, send a message to the VS Code extension
					vscode.postMessage({
						type: "upsertApiConfiguration",
						text: currentState.currentApiConfigName,
						apiConfiguration: updatedConfig,
					})
					// Also update the local state to maintain consistency
					return {
						...currentState,
						apiConfiguration: updatedConfig,
					}
				}
			})
		},
		[],
	)

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			// console.log("收到消息类型:", message.type)
			switch (message.type) {
				case "state": {
					const newState = message.state!
					// 收到后端消息后，将loading状态设置为false
					setCodebaseIndexLoading(false)

					setState((prevState) => {
						// console.log("更新全局state状态")
						return {
							...prevState,
							...newState,
						}
					})
					const config = newState.apiConfiguration
					const hasKey = checkExistKey(config)
					setShowWelcome(!hasKey)
					setDidHydrateState(true)

					// 初始化语言设置
					if (newState.preferredLanguage) {
						initializeLanguage(newState.preferredLanguage)
					}

					// 更新代码库索引相关状态
					if (newState.codebaseIndexEnabled !== undefined) {
						// console.log("从state消息更新codebaseIndexEnabled:", newState.codebaseIndexEnabled)
						setCodebaseIndexEnabled(newState.codebaseIndexEnabled)
					} else {
						// console.log("state消息中没有codebaseIndexEnabled，使用默认值true")
						setCodebaseIndexEnabled(true) // 默认启用
					}
					if (newState.codebaseIndexAutoStart !== undefined) {
						// console.log("从state消息更新codebaseIndexAutoStart:", newState.codebaseIndexAutoStart)
						setCodebaseIndexAutoStart(newState.codebaseIndexAutoStart)
					} else {
						// console.log("state消息中没有codebaseIndexAutoStart，使用默认值true")
						setCodebaseIndexAutoStart(true)
					}
					if (newState.codebaseIndexExcludePaths !== undefined) {
						setCodebaseIndexExcludePaths(newState.codebaseIndexExcludePaths)
					}
					if (newState.codebaseIndexIncludeTests !== undefined) {
						setCodebaseIndexIncludeTests(newState.codebaseIndexIncludeTests)
					}
					break
				}
				case "theme": {
					if (message.text) {
						setTheme(convertTextMateToHljs(JSON.parse(message.text)))
					}
					break
				}
				case "workspaceUpdated": {
					const paths = message.filePaths ?? []
					const tabs = message.openedTabs ?? []

					setFilePaths(paths)
					setOpenedTabs(tabs)
					break
				}
				case "partialMessage": {
					const partialMessage = message.partialMessage!
					setState((prevState) => {
						// worth noting it will never be possible for a more up-to-date message to be sent here or in normal messages post since the presentAssistantContent function uses lock
						const lastIndex = findLastIndex(
							prevState.coolclineMessages,
							(msg) => msg.ts === partialMessage.ts,
						)
						if (lastIndex !== -1) {
							const newCoolClineMessages = [...prevState.coolclineMessages]
							newCoolClineMessages[lastIndex] = partialMessage
							return { ...prevState, coolclineMessages: newCoolClineMessages }
						}
						return prevState
					})
					break
				}
				case "glamaModels": {
					const updatedModels = message.glamaModels ?? {}
					setGlamaModels({
						[glamaDefaultModelId]: glamaDefaultModelInfo, // in case the extension sent a model list without the default model
						...updatedModels,
					})
					break
				}
				case "openRouterModels": {
					const updatedModels = message.openRouterModels ?? {}
					setOpenRouterModels({
						[openRouterDefaultModelId]: openRouterDefaultModelInfo, // in case the extension sent a model list without the default model
						...updatedModels,
					})
					break
				}
				case "openAiModels": {
					const updatedModels = message.openAiModels ?? []
					setOpenAiModels(updatedModels)
					break
				}
				case "mcpServers": {
					setMcpServers(message.mcpServers ?? [])
					break
				}
				case "listApiConfig": {
					setListApiConfigMeta(message.listApiConfig ?? [])
					break
				}
				case "currentCheckpointUpdated": {
					setCurrentCheckpoint(message.text)
					break
				}
				case "unboundModels": {
					const updatedModels = message.unboundModels ?? {}
					setUnboundModels(updatedModels)
					break
				}
				case "requestyModels": {
					setState((prevState) => ({
						...prevState,
						requestyModels: message.requestyModels ?? {},
					}))
					break
				}
				case "extensionState": {
					// console.log("收到extensionState消息:", message.state)
					if (message.state) {
						if (message.state.codebaseIndexEnabled !== undefined) {
							// console.log("从extensionState更新codebaseIndexEnabled:", message.state.codebaseIndexEnabled)
							setCodebaseIndexEnabled(message.state.codebaseIndexEnabled)
						} else {
							// console.log("extensionState消息中没有codebaseIndexEnabled，使用默认值true")
							setCodebaseIndexEnabled(true) // 默认启用
						}
						if (message.state.codebaseIndexAutoStart !== undefined) {
							// console.log("从extensionState更新codebaseIndexAutoStart:", message.state.codebaseIndexAutoStart)
							setCodebaseIndexAutoStart(message.state.codebaseIndexAutoStart)
						} else {
							// console.log("extensionState消息中没有codebaseIndexAutoStart，使用默认值true")
							setCodebaseIndexAutoStart(true)
						}
						if (message.state.codebaseIndexExcludePaths !== undefined) {
							setCodebaseIndexExcludePaths(message.state.codebaseIndexExcludePaths)
						}
						if (message.state.codebaseIndexIncludeTests !== undefined) {
							setCodebaseIndexIncludeTests(message.state.codebaseIndexIncludeTests)
						}
					}
					break
				}
			}
		},
		[setListApiConfigMeta],
	)

	useEvent("message", handleMessage)

	useEffect(() => {
		vscode.postMessage({ type: "webviewDidLaunch" })
		// console.log("webviewDidLaunch消息已发送")
	}, [])

	const contextValue: ExtensionStateContextType = {
		...state,
		didHydrateState,
		showWelcome,
		theme,
		glamaModels,
		openRouterModels,
		openAiModels,
		unboundModels,
		mcpServers,
		filePaths,
		openedTabs,
		soundVolume: state.soundVolume,
		fuzzyMatchThreshold: state.fuzzyMatchThreshold,
		writeDelayMs: state.writeDelayMs,
		screenshotQuality: state.screenshotQuality,
		codebaseIndexLoading,
		setExperimentEnabled: (id, enabled) =>
			setState((prevState) => ({ ...prevState, experiments: { ...prevState.experiments, [id]: enabled } })),
		setApiConfiguration: (value) =>
			setState((prevState) => ({
				...prevState,
				apiConfiguration: value,
			})),
		setCustomInstructions: (value) => setState((prevState) => ({ ...prevState, customInstructions: value })),
		setAlwaysAllowReadOnly: (value) => setState((prevState) => ({ ...prevState, alwaysAllowReadOnly: value })),
		setAlwaysAllowWrite: (value) => setState((prevState) => ({ ...prevState, alwaysAllowWrite: value })),
		setAlwaysAllowExecute: (value) => setState((prevState) => ({ ...prevState, alwaysAllowExecute: value })),
		setAlwaysAllowBrowser: (value) => setState((prevState) => ({ ...prevState, alwaysAllowBrowser: value })),
		setAlwaysAllowMcp: (value) => setState((prevState) => ({ ...prevState, alwaysAllowMcp: value })),
		setAlwaysAllowModeSwitch: (value) => setState((prevState) => ({ ...prevState, alwaysAllowModeSwitch: value })),
		setShowAnnouncement: (value) => setState((prevState) => ({ ...prevState, shouldShowAnnouncement: value })),
		setAllowedCommands: (value) => setState((prevState) => ({ ...prevState, allowedCommands: value })),
		setSoundEnabled: (value) => setState((prevState) => ({ ...prevState, soundEnabled: value })),
		setSoundVolume: (value) => setState((prevState) => ({ ...prevState, soundVolume: value })),
		setDiffEnabled: (value) => setState((prevState) => ({ ...prevState, diffEnabled: value })),
		setBrowserViewportSize: (value: string) =>
			setState((prevState) => ({ ...prevState, browserViewportSize: value })),
		setFuzzyMatchThreshold: (value) => setState((prevState) => ({ ...prevState, fuzzyMatchThreshold: value })),
		setPreferredLanguage: useCallback((value: string) => {
			setState((prevState) => ({ ...prevState, preferredLanguage: value }))
			initializeLanguage(value)
		}, []),
		setWriteDelayMs: (value) => setState((prevState) => ({ ...prevState, writeDelayMs: value })),
		setScreenshotQuality: (value) => setState((prevState) => ({ ...prevState, screenshotQuality: value })),
		setTerminalOutputLineLimit: (value) =>
			setState((prevState) => ({ ...prevState, terminalOutputLineLimit: value })),
		setMcpEnabled: (value) => setState((prevState) => ({ ...prevState, mcpEnabled: value })),
		setEnableMcpServerCreation: (value) =>
			setState((prevState) => ({ ...prevState, enableMcpServerCreation: value })),
		setAlwaysApproveResubmit: (value) => setState((prevState) => ({ ...prevState, alwaysApproveResubmit: value })),
		setRequestDelaySeconds: (value) => setState((prevState) => ({ ...prevState, requestDelaySeconds: value })),
		setRateLimitSeconds: (value) => setState((prevState) => ({ ...prevState, rateLimitSeconds: value })),
		setCurrentApiConfigName: (value) => setState((prevState) => ({ ...prevState, currentApiConfigName: value })),
		setListApiConfigMeta,
		onUpdateApiConfig,
		setMode: useCallback((value: Mode) => {
			setState((prevState) => {
				return { ...prevState, mode: value }
			})
			vscode.postMessage({
				type: "mode",
				text: value,
			})
		}, []),
		setCustomModePrompts: (value) => setState((prevState) => ({ ...prevState, customModePrompts: value })),
		setCustomSupportPrompts: (value) => setState((prevState) => ({ ...prevState, customSupportPrompts: value })),
		setEnhancementApiConfigId: (value) =>
			setState((prevState) => ({ ...prevState, enhancementApiConfigId: value })),
		setAutoApprovalEnabled: (value) => setState((prevState) => ({ ...prevState, autoApprovalEnabled: value })),
		handleInputChange,
		setCustomModes: (value) => setState((prevState) => ({ ...prevState, customModes: value })),
		checkpointsEnabled: state.checkpointsEnabled,
		setCheckpointsEnabled: (value) => setState((prevState) => ({ ...prevState, checkpointsEnabled: value })),
		currentCheckpoint,
		requestyModels: state.requestyModels,
		codebaseIndexEnabled,
		setCodebaseIndexEnabled,
		codebaseIndexAutoStart,
		setCodebaseIndexAutoStart,
		codebaseIndexExcludePaths,
		setCodebaseIndexExcludePaths,
		codebaseIndexIncludeTests,
		setCodebaseIndexIncludeTests,
		setEditorType: (value) => setState((prevState) => ({ ...prevState, editorType: value })),
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)
	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}
	return context
}
