import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration, validateModelId } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "./ApiOptions"
import ExperimentalFeature from "./ExperimentalFeature"
import { EXPERIMENT_IDS, experimentConfigsMap } from "../../../../src/shared/experiments"
import ApiConfigManager from "./ApiConfigManager"
import { Dropdown } from "vscrui"
import type { DropdownOption } from "vscrui"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import LanguageSelector from "../common/LanguageSelector"
import CodebaseIndexSettings from "../common/CodebaseIndexSettings"

type SettingsViewProps = {
	onDone: () => void
}

const SettingsView = ({ onDone }: SettingsViewProps) => {
	const { t } = useTranslation()
	const {
		apiConfiguration,
		version,
		alwaysAllowReadOnly,
		setAlwaysAllowReadOnly,
		alwaysAllowWrite,
		setAlwaysAllowWrite,
		alwaysAllowExecute,
		setAlwaysAllowExecute,
		alwaysAllowBrowser,
		setAlwaysAllowBrowser,
		alwaysAllowMcp,
		setAlwaysAllowMcp,
		soundEnabled,
		setSoundEnabled,
		soundVolume,
		setSoundVolume,
		diffEnabled,
		setDiffEnabled,
		browserViewportSize,
		setBrowserViewportSize,
		openRouterModels,
		glamaModels,
		setAllowedCommands,
		allowedCommands,
		fuzzyMatchThreshold,
		setFuzzyMatchThreshold,
		writeDelayMs,
		setWriteDelayMs,
		screenshotQuality,
		setScreenshotQuality,
		terminalOutputLineLimit,
		setTerminalOutputLineLimit,
		mcpEnabled,
		alwaysApproveResubmit,
		setAlwaysApproveResubmit,
		requestDelaySeconds,
		setRequestDelaySeconds,
		rateLimitSeconds,
		setRateLimitSeconds,
		currentApiConfigName,
		listApiConfigMeta,
		experiments,
		setExperimentEnabled,
		alwaysAllowModeSwitch,
		setAlwaysAllowModeSwitch,
		checkpointsEnabled,
		setCheckpointsEnabled,
	} = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const [commandInput, setCommandInput] = useState("")
	const [showErrorDialog, setShowErrorDialog] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string>("")

	const handleSubmit = async () => {
		// Focus the active element's parent to trigger blur
		document.activeElement?.parentElement?.focus()

		// Small delay to let blur events complete
		await new Promise((resolve) => setTimeout(resolve, 50))

		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, glamaModels, openRouterModels)

		setApiErrorMessage(apiValidationResult)
		setModelIdErrorMessage(modelIdValidationResult)

		if (apiValidationResult || modelIdValidationResult) {
			setErrorMessage(apiValidationResult || modelIdValidationResult || "")
			setShowErrorDialog(true)
			return
		}

		vscode.postMessage({
			type: "apiConfiguration",
			apiConfiguration,
		})
		vscode.postMessage({ type: "alwaysAllowReadOnly", bool: alwaysAllowReadOnly })
		vscode.postMessage({ type: "alwaysAllowWrite", bool: alwaysAllowWrite })
		vscode.postMessage({ type: "alwaysAllowExecute", bool: alwaysAllowExecute })
		vscode.postMessage({ type: "alwaysAllowBrowser", bool: alwaysAllowBrowser })
		vscode.postMessage({ type: "alwaysAllowMcp", bool: alwaysAllowMcp })
		vscode.postMessage({ type: "allowedCommands", commands: allowedCommands ?? [] })
		vscode.postMessage({ type: "soundEnabled", bool: soundEnabled })
		vscode.postMessage({ type: "soundVolume", value: soundVolume })
		vscode.postMessage({ type: "diffEnabled", bool: diffEnabled })
		vscode.postMessage({ type: "browserViewportSize", text: browserViewportSize })
		vscode.postMessage({ type: "fuzzyMatchThreshold", value: fuzzyMatchThreshold ?? 1.0 })
		vscode.postMessage({ type: "writeDelayMs", value: writeDelayMs })
		vscode.postMessage({ type: "screenshotQuality", value: screenshotQuality ?? 75 })
		vscode.postMessage({ type: "terminalOutputLineLimit", value: terminalOutputLineLimit ?? 500 })
		vscode.postMessage({ type: "mcpEnabled", bool: mcpEnabled })
		vscode.postMessage({ type: "alwaysApproveResubmit", bool: alwaysApproveResubmit })
		vscode.postMessage({ type: "requestDelaySeconds", value: requestDelaySeconds })
		vscode.postMessage({ type: "rateLimitSeconds", value: rateLimitSeconds })
		vscode.postMessage({ type: "currentApiConfigName", text: currentApiConfigName })
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration,
		})

		vscode.postMessage({
			type: "updateExperimental",
			values: experiments,
		})

		vscode.postMessage({ type: "alwaysAllowModeSwitch", bool: alwaysAllowModeSwitch })
		vscode.postMessage({ type: "checkpointsEnabled", bool: checkpointsEnabled })
		onDone()
	}

	useEffect(() => {
		setApiErrorMessage(undefined)
		setModelIdErrorMessage(undefined)
	}, [apiConfiguration])

	// Initial validation on mount
	useEffect(() => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, glamaModels, openRouterModels)
		setApiErrorMessage(apiValidationResult)
		setModelIdErrorMessage(modelIdValidationResult)
	}, [apiConfiguration, glamaModels, openRouterModels])

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleAddCommand = () => {
		const currentCommands = allowedCommands ?? []
		if (commandInput && !currentCommands.includes(commandInput)) {
			const newCommands = [...currentCommands, commandInput]
			setAllowedCommands(newCommands)
			setCommandInput("")
			vscode.postMessage({
				type: "allowedCommands",
				commands: newCommands,
			})
		}
	}

	const sliderLabelStyle = {
		minWidth: "45px",
		textAlign: "right" as const,
		lineHeight: "20px",
		paddingBottom: "2px",
	}

	const sliderStyle = {
		flexGrow: 1,
		maxWidth: "80%",
		accentColor: "var(--vscode-button-background)",
		height: "2px",
	}

	const handleSave = useCallback(() => {
		// ... existing code ...
		vscode.postMessage({ type: "checkpointsEnabled", bool: checkpointsEnabled })
		// ... existing code ...
	}, [, /* ... existing dependencies ... */ checkpointsEnabled])

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				padding: "10px 0px 0px 20px",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "17px",
					paddingRight: 17,
				}}>
				<h1 style={{ fontWeight: "800", fontSize: 15, margin: 0 }}>{t("settings.title").toString()}</h1>
				<VSCodeButton onClick={handleSubmit}>{t("settings.done").toString()}</VSCodeButton>
			</div>
			<div
				style={{ flexGrow: 1, overflowY: "scroll", paddingRight: 8, display: "flex", flexDirection: "column" }}>
				{/* 语言组件 */}
				<div style={{ fontWeight: "500" }}>
					<LanguageSelector />
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* 代码库索引设置 */}
				<div style={{ fontWeight: "500" }}>
					<CodebaseIndexSettings />
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* LLM Provider 配置 */}
				<div style={{ marginBottom: 0 }}>
					<h2 style={{ margin: "0 0 15px 0", fontWeight: "500" }}>
						{t("settings.provider.title").toString()}
					</h2>
					<div style={{ marginBottom: 0 }}>
						<ApiConfigManager
							currentApiConfigName={currentApiConfigName}
							listApiConfigMeta={listApiConfigMeta}
							onSelectConfig={(configName: string) => {
								vscode.postMessage({
									type: "loadApiConfiguration",
									text: configName,
								})
							}}
							onDeleteConfig={(configName: string) => {
								vscode.postMessage({
									type: "deleteApiConfiguration",
									text: configName,
								})
							}}
							onRenameConfig={(oldName: string, newName: string) => {
								vscode.postMessage({
									type: "renameApiConfiguration",
									values: { oldName, newName },
									apiConfiguration,
								})
							}}
							onUpsertConfig={(configName: string) => {
								vscode.postMessage({
									type: "upsertApiConfiguration",
									text: configName,
									apiConfiguration,
								})
							}}
						/>
						<ApiOptions apiErrorMessage={apiErrorMessage} modelIdErrorMessage={modelIdErrorMessage} />
					</div>
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* 自动批准 */}
				<div style={{ marginBottom: 0 }}>
					<h3 style={{ margin: "0 0 15px 0", fontWeight: "500" }}>
						{t("settings.autoApprove.title").toString()}
					</h3>
					<p style={{ fontSize: "12px", marginBottom: 15, color: "var(--vscode-descriptionForeground)" }}>
						{t("settings.autoApprove.description").toString()}
					</p>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowReadOnly}
							onChange={(e: any) => setAlwaysAllowReadOnly(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.readOnly.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.readOnly.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowWrite}
							onChange={(e: any) => setAlwaysAllowWrite(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.write.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.write.description").toString()}
						</p>
						{alwaysAllowWrite && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
									<input
										type="range"
										min="0"
										max="5000"
										step="100"
										value={writeDelayMs}
										onChange={(e) => setWriteDelayMs(parseInt(e.target.value))}
										style={{
											flex: 1,
											accentColor: "var(--vscode-button-background)",
											height: "2px",
										}}
									/>
									<span style={{ minWidth: "45px", textAlign: "left" }}>{writeDelayMs}ms</span>
								</div>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									{t("settings.autoApprove.write.delay.description").toString()}
								</p>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowBrowser}
							onChange={(e: any) => setAlwaysAllowBrowser(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.browser.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.browser.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysApproveResubmit}
							onChange={(e: any) => setAlwaysApproveResubmit(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.retry.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							{t("settings.autoApprove.retry.description").toString()}
						</p>
						{alwaysApproveResubmit && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
									<input
										type="range"
										min="5"
										max="100"
										step="1"
										value={requestDelaySeconds}
										onChange={(e) => setRequestDelaySeconds(parseInt(e.target.value))}
										style={{
											flex: 1,
											accentColor: "var(--vscode-button-background)",
											height: "2px",
										}}
									/>
									<span style={{ minWidth: "45px", textAlign: "left" }}>{requestDelaySeconds}s</span>
								</div>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									{t("settings.autoApprove.retry.delay.description").toString()}
								</p>
							</div>
						)}
					</div>

					<div style={{ marginBottom: 5 }}>
						<VSCodeCheckbox
							checked={alwaysAllowMcp}
							onChange={(e: any) => setAlwaysAllowMcp(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>{t("settings.autoApprove.mcp.title").toString()}</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.mcp.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowModeSwitch}
							onChange={(e: any) => setAlwaysAllowModeSwitch(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.modeSwitch.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.modeSwitch.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={alwaysAllowExecute}
							onChange={(e: any) => setAlwaysAllowExecute(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.autoApprove.execute.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.autoApprove.execute.description").toString()}
						</p>

						{alwaysAllowExecute && (
							<div
								style={{
									marginTop: 10,
									paddingLeft: 10,
									borderLeft: "2px solid var(--vscode-button-background)",
								}}>
								<span>{t("settings.autoApprove.execute.commands.title").toString()}</span>
								<p
									style={{
										fontSize: "12px",
										marginTop: "5px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									{t("settings.autoApprove.execute.commands.description").toString()}
								</p>

								<div style={{ display: "flex", gap: "5px", marginTop: "10px" }}>
									<VSCodeTextField
										value={commandInput}
										onInput={(e: any) => setCommandInput(e.target.value)}
										onKeyDown={(e: any) => {
											if (e.key === "Enter") {
												e.preventDefault()
												handleAddCommand()
											}
										}}
										placeholder={t("settings.autoApprove.execute.commands.placeholder").toString()}
										style={{ flexGrow: 1 }}
									/>
									<VSCodeButton onClick={handleAddCommand}>
										{t("settings.autoApprove.execute.commands.add").toString()}
									</VSCodeButton>
								</div>

								<div
									style={{
										marginTop: "10px",
										display: "flex",
										flexWrap: "wrap",
										gap: "5px",
									}}>
									{(allowedCommands ?? []).map((cmd, index) => (
										<div
											key={index}
											style={{
												display: "flex",
												alignItems: "center",
												gap: "5px",
												backgroundColor: "var(--vscode-button-background)",
												color: "var(--vscode-button-foreground)",
												padding: "2px 6px",
												borderRadius: "4px",
												border: "1px solid var(--vscode-button-secondaryBorder)",
												height: "24px",
											}}>
											<span>{cmd}</span>
											<VSCodeButton
												appearance="icon"
												style={{
													padding: 0,
													margin: 0,
													height: "20px",
													width: "20px",
													minWidth: "20px",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: "var(--vscode-button-foreground)",
												}}
												onClick={() => {
													const newCommands = (allowedCommands ?? []).filter(
														(_, i) => i !== index,
													)
													setAllowedCommands(newCommands)
													vscode.postMessage({
														type: "allowedCommands",
														commands: newCommands,
													})
												}}>
												<span className="codicon codicon-close" />
											</VSCodeButton>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* 浏览器设置 */}
				<div style={{ marginBottom: 0 }}>
					<h3 style={{ margin: "0 0 15px 0", fontWeight: "600" }}>
						{t("settings.browser.title").toString()}
					</h3>
					<div style={{ marginBottom: 15 }}>
						<label style={{ display: "block", marginBottom: 5 }}>
							{t("settings.browser.viewport.title").toString()}
						</label>
						<div className="dropdown-container">
							<Dropdown
								value={browserViewportSize}
								onChange={(value: unknown) => {
									setBrowserViewportSize((value as DropdownOption).value)
								}}
								style={{ width: "100%" }}
								options={[
									{
										value: "1280x800",
										label: t("settings.browser.viewport.options.largeDesktop").toString(),
									},
									{
										value: "900x600",
										label: t("settings.browser.viewport.options.smallDesktop").toString(),
									},
									{
										value: "768x1024",
										label: t("settings.browser.viewport.options.tablet").toString(),
									},
									{
										value: "360x640",
										label: t("settings.browser.viewport.options.mobile").toString(),
									},
								]}
							/>
						</div>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.browser.viewport.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 0 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span>{t("settings.browser.screenshot.title").toString()}</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="1"
									max="100"
									step="1"
									value={screenshotQuality ?? 75}
									onChange={(e) => setScreenshotQuality(parseInt(e.target.value))}
									style={{
										...sliderStyle,
									}}
								/>
								<span style={{ ...sliderLabelStyle }}>{screenshotQuality ?? 75}%</span>
							</div>
						</div>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.browser.screenshot.description").toString()}
						</p>
					</div>
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* 通知设置 */}
				<div style={{ marginBottom: 0 }}>
					<h3 style={{ margin: "0 0 15px 0", fontWeight: "600" }}>
						{t("settings.notification.title").toString()}
					</h3>
					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox checked={soundEnabled} onChange={(e: any) => setSoundEnabled(e.target.checked)}>
							<span style={{ fontWeight: "500" }}>
								{t("settings.notification.sound.title").toString()}
							</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.notification.sound.description").toString()}
						</p>
					</div>
					{soundEnabled && (
						<div
							style={{
								marginLeft: 0,
								paddingLeft: 10,
								borderLeft: "2px solid var(--vscode-button-background)",
							}}>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<span style={{ fontWeight: "500", minWidth: "100px" }}>
									{t("settings.notification.sound.volume").toString()}
								</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={soundVolume ?? 0.5}
									onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
									style={{
										flexGrow: 1,
										accentColor: "var(--vscode-button-background)",
										height: "2px",
									}}
									aria-label={t("settings.notification.sound.volume").toString()}
								/>
								<span style={{ minWidth: "35px", textAlign: "left" }}>
									{((soundVolume ?? 0.5) * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					)}
				</div>

				{/* 分割线 - 使用双边框样式 */}
				<div
					style={{
						margin: "40px 0",
						height: "1px",
						background: "linear-gradient(to bottom, var(--vscode-panel-border), transparent)",
						borderTop: "1px solid var(--vscode-panel-border)",
						width: "100%",
					}}></div>

				{/* 高级设置 */}
				<div style={{ marginBottom: 40 }}>
					<h3 style={{ margin: "0 0 15px 0", fontWeight: "600" }}>
						{t("settings.advanced.title").toString()}
					</h3>
					<div style={{ marginBottom: 15 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span>{t("settings.advanced.rateLimit.title").toString()}</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="0"
									max="60"
									step="1"
									value={rateLimitSeconds}
									onChange={(e) => setRateLimitSeconds(parseInt(e.target.value))}
									style={{ ...sliderStyle }}
								/>
								<span style={{ ...sliderLabelStyle }}>{rateLimitSeconds}s</span>
							</div>
						</div>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							{t("settings.advanced.rateLimit.description").toString()}
						</p>
					</div>
					<div style={{ marginBottom: 15 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
							<span>{t("settings.advanced.terminalOutput.title").toString()}</span>
							<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
								<input
									type="range"
									min="100"
									max="5000"
									step="100"
									value={terminalOutputLineLimit ?? 500}
									onChange={(e) => setTerminalOutputLineLimit(parseInt(e.target.value))}
									style={{ ...sliderStyle }}
								/>
								<span style={{ ...sliderLabelStyle }}>{terminalOutputLineLimit ?? 500}</span>
							</div>
						</div>
						<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
							{t("settings.advanced.terminalOutput.description").toString()}
						</p>
					</div>

					<div style={{ marginBottom: 40 }}>
						<h3 style={{ color: "var(--vscode-foreground)", margin: "0 0 5px 0", fontWeight: "600" }}>
							{t("settings.advanced.checkpoints.title")}
						</h3>
						<div style={{ marginBottom: 15 }}>
							<VSCodeCheckbox
								checked={checkpointsEnabled}
								onChange={(e: any) => {
									setCheckpointsEnabled(e.target.checked)
									vscode.postMessage({ type: "checkpointsEnabled", bool: e.target.checked })
								}}>
								<span style={{ fontWeight: "500" }}>{t("settings.advanced.checkpoints.enable")}</span>
							</VSCodeCheckbox>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								{t("settings.advanced.checkpoints.description")}
							</p>
							{checkpointsEnabled && (
								<ul
									style={{
										fontSize: "12px",
										marginTop: "10px",
										color: "var(--vscode-descriptionForeground)",
										paddingLeft: "20px",
										listStyleType: "disc",
									}}>
									{Object.keys(
										t("settings.advanced.checkpoints.features", { returnObjects: true }),
									).map((key) => (
										<li key={key} style={{ marginBottom: "4px" }}>
											{t(`settings.advanced.checkpoints.features.${key}`)}
										</li>
									))}
								</ul>
							)}
						</div>
					</div>

					<div style={{ marginBottom: 15 }}>
						<VSCodeCheckbox
							checked={diffEnabled}
							onChange={(e: any) => {
								setDiffEnabled(e.target.checked)
								if (!e.target.checked) {
									// Reset experimental strategy when diffs are disabled
									setExperimentEnabled(EXPERIMENT_IDS.DIFF_STRATEGY, false)
								}
							}}>
							<span style={{ fontWeight: "500" }}>{t("settings.advanced.diff.title").toString()}</span>
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							{t("settings.advanced.diff.description").toString()}
						</p>

						{diffEnabled && (
							<div style={{ marginTop: 10 }}>
								<div style={{ marginTop: 10 }}>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "5px",
											marginTop: "15px",
										}}>
										<span>{t("settings.advanced.diff.matchPrecision.title").toString()}</span>
										<div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
											<input
												type="range"
												min="0.8"
												max="1"
												step="0.005"
												value={fuzzyMatchThreshold ?? 1.0}
												onChange={(e) => {
													setFuzzyMatchThreshold(parseFloat(e.target.value))
												}}
												style={{
													...sliderStyle,
												}}
											/>
											<span style={{ ...sliderLabelStyle }}>
												{Math.round((fuzzyMatchThreshold || 1) * 100)}%
											</span>
										</div>
									</div>
									<p
										style={{
											fontSize: "12px",
											marginTop: "5px",
											color: "var(--vscode-descriptionForeground)",
										}}>
										{t("settings.advanced.diff.matchPrecision.description").toString()}
									</p>
									<ExperimentalFeature
										key={EXPERIMENT_IDS.DIFF_STRATEGY}
										{...experimentConfigsMap.DIFF_STRATEGY}
										enabled={experiments[EXPERIMENT_IDS.DIFF_STRATEGY] ?? false}
										onChange={(enabled) =>
											setExperimentEnabled(EXPERIMENT_IDS.DIFF_STRATEGY, enabled)
										}
									/>
								</div>
							</div>
						)}
						{Object.entries(experimentConfigsMap)
							.filter((config) => config[0] !== "DIFF_STRATEGY")
							.map((config) => (
								<ExperimentalFeature
									key={config[0]}
									{...config[1]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ?? false
									}
									onChange={(enabled) =>
										setExperimentEnabled(
											EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
											enabled,
										)
									}
								/>
							))}
					</div>
				</div>

				<div
					style={{
						textAlign: "center",
						color: "var(--vscode-descriptionForeground)",
						fontSize: "12px",
						lineHeight: "1.2",
						marginTop: "auto",
						padding: "10px 8px 15px 0px",
					}}>
					<p style={{ wordWrap: "break-word", margin: 0, padding: 0 }}>
						{t("settings.footer.description").toString()} {" GitHub :"}
						<VSCodeLink href="https://github.com/CoolCline/CoolCline" style={{ display: "inline" }}>
							github.com/CoolCline/CoolCline
						</VSCodeLink>{" "}
						or Gitee{": "}
						<VSCodeLink href="https://gitee.com/coolcline/coolcline/" style={{ display: "inline" }}>
							gitee.com/coolcline/coolcline
						</VSCodeLink>
					</p>
					<p style={{ fontStyle: "italic", margin: "10px 0 0 0", padding: 0, marginBottom: 100 }}>
						v{version}
					</p>

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.footer.resetStateDescription").toString()}
					</p>

					<VSCodeButton
						onClick={handleResetState}
						appearance="secondary"
						style={{ marginTop: "5px", width: "auto" }}>
						{t("settings.footer.resetState").toString()}
					</VSCodeButton>
				</div>
			</div>

			<Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
				<DialogContent className="w-[90%] sm:w-[400px]">
					<DialogHeader>
						<DialogTitle>{String(t("common.status.error"))}</DialogTitle>
					</DialogHeader>
					<div className="text-destructive">{errorMessage}</div>
					<div className="flex justify-end mt-4">
						<VSCodeButton onClick={() => setShowErrorDialog(false)}>
							{String(t("common.cancel"))}
						</VSCodeButton>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default memo(SettingsView)
