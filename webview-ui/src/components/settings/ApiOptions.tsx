import { Checkbox, Dropdown, Pane } from "vscrui"
import type { DropdownOption } from "vscrui"
import { VSCodeLink, VSCodeRadio, VSCodeRadioGroup, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react"
import { useEvent, useInterval } from "react-use"
import {
	anthropicDefaultModelId,
	anthropicModels,
	ApiConfiguration,
	azureOpenAiDefaultApiVersion,
	bedrockDefaultModelId,
	bedrockModels,
	deepSeekDefaultModelId,
	deepSeekModels,
	geminiDefaultModelId,
	geminiModels,
	glamaDefaultModelId,
	glamaDefaultModelInfo,
	mistralDefaultModelId,
	mistralModels,
	ModelInfo,
	openAiModelInfoSaneDefaults,
	openAiNativeDefaultModelId,
	openAiNativeModels,
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	unboundDefaultModelId,
	unboundModels,
	vertexDefaultModelId,
	vertexModels,
	requestyDefaultModelId,
	requestyDefaultModel,
} from "../../../../src/shared/api"
import { ExtensionMessage } from "../../../../src/shared/ExtensionMessage"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import * as vscodemodels from "vscode"
import VSCodeButtonLink from "../common/VSCodeButtonLink"
import OpenRouterModelPicker from "./OpenRouterModelPicker"
import OpenAiModelPicker from "./OpenAiModelPicker"
import GlamaModelPicker from "./GlamaModelPicker"
import { useTranslation } from "react-i18next"
import { TemperatureControl } from "./TemperatureControl"
import { ModelDescriptionMarkdown } from "../SearchModelPicker/ModelDescriptionMarkdown"
import { DROPDOWN_Z_INDEX } from "../ui/dropdown"
import RequestyModelPicker from "./RequestyModelPicker"

interface ApiOptionsProps {
	apiErrorMessage?: string
	modelIdErrorMessage?: string
}

const ApiOptions = ({ apiErrorMessage, modelIdErrorMessage }: ApiOptionsProps) => {
	const { t } = useTranslation()
	const { apiConfiguration, uriScheme, handleInputChange } = useExtensionState()
	const [ollamaModels, setOllamaModels] = useState<string[]>([])
	const [lmStudioModels, setLmStudioModels] = useState<string[]>([])
	const [vsCodeLmModels, setVsCodeLmModels] = useState<vscodemodels.LanguageModelChatSelector[]>([])
	const [anthropicBaseUrlSelected, setAnthropicBaseUrlSelected] = useState(!!apiConfiguration?.anthropicBaseUrl)
	const [azureApiVersionSelected, setAzureApiVersionSelected] = useState(!!apiConfiguration?.azureApiVersion)
	const [openRouterBaseUrlSelected, setOpenRouterBaseUrlSelected] = useState(!!apiConfiguration?.openRouterBaseUrl)
	const [lmStudioBaseUrlSelected, setLmStudioBaseUrlSelected] = useState(!!apiConfiguration?.lmStudioBaseUrl)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

	const { selectedProvider, selectedModelId, selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	// Poll ollama/lmstudio models
	const requestLocalModels = useCallback(() => {
		if (selectedProvider === "ollama") {
			vscode.postMessage({
				type: "requestOllamaModels",
				text: apiConfiguration?.ollamaBaseUrl,
			})
		} else if (selectedProvider === "lmstudio") {
			vscode.postMessage({
				type: "requestLmStudioModels",
				text: apiConfiguration?.lmStudioBaseUrl,
			})
		} else if (selectedProvider === "vscode-lm") {
			vscode.postMessage({ type: "requestVsCodeLmModels" })
		}
	}, [selectedProvider, apiConfiguration?.ollamaBaseUrl, apiConfiguration?.lmStudioBaseUrl])
	useEffect(() => {
		if (selectedProvider === "ollama" || selectedProvider === "lmstudio" || selectedProvider === "vscode-lm") {
			requestLocalModels()
		}
	}, [selectedProvider, requestLocalModels])
	useInterval(
		requestLocalModels,
		selectedProvider === "ollama" || selectedProvider === "lmstudio" || selectedProvider === "vscode-lm"
			? 2000
			: null,
	)
	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "ollamaModels" && message.ollamaModels) {
			setOllamaModels(message.ollamaModels)
		} else if (message.type === "lmStudioModels" && message.lmStudioModels) {
			setLmStudioModels(message.lmStudioModels)
		} else if (message.type === "vsCodeLmModels" && message.vsCodeLmModels) {
			setVsCodeLmModels(message.vsCodeLmModels)
		}
	}, [])
	useEvent("message", handleMessage)

	const createDropdown = (models: Record<string, ModelInfo>) => {
		const options: DropdownOption[] = [
			{
				value: "",
				label: t("settings.provider.model.selectPlaceholder").toString(),
			},
			...Object.keys(models).map((modelId) => ({
				value: modelId,
				label: modelId,
			})),
		]
		return (
			<Dropdown
				id="model-id"
				value={selectedModelId}
				onChange={(value: unknown) => {
					handleInputChange("apiModelId")({
						target: {
							value: (value as DropdownOption).value,
						},
					})
				}}
				style={{ width: "100%", position: "relative", zIndex: DROPDOWN_Z_INDEX + 1 }}
				options={options}
			/>
		)
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<div className="dropdown-container">
				<label htmlFor="api-provider">
					<span style={{ fontWeight: 600 }}>{t("settings.provider.llmProvider").toString()}</span>
				</label>
				<Dropdown
					id="api-provider"
					value={selectedProvider}
					onChange={(value: unknown) => {
						handleInputChange(
							"llmProvider",
							true,
						)({
							target: {
								value: (value as DropdownOption).value,
							},
						})
					}}
					style={{
						minWidth: 180,
						width: "100%",
						position: "relative",
						zIndex: DROPDOWN_Z_INDEX + 1,
					}}
					options={[
						{
							value: "vscode-lm",
							label: t("settings.provider.providers.vscode.name").toString(),
						},
						{
							value: "openrouter",
							label: t("settings.provider.providers.openRouter.name").toString(),
						},
						{
							value: "anthropic",
							label: t("settings.provider.providers.anthropic.name").toString(),
						},
						{
							value: "gemini",
							label: t("settings.provider.providers.gemini.name").toString(),
						},
						{
							value: "deepseek",
							label: t("settings.provider.providers.deepseek.name").toString(),
						},
						{
							value: "openai-native",
							label: t("settings.provider.providers.openaiNative.name").toString(),
						},
						{
							value: "openai",
							label: t("settings.provider.providers.openai.name").toString(),
						},
						{
							value: "vertex",
							label: t("settings.provider.providers.vertex.name").toString(),
						},
						{
							value: "bedrock",
							label: t("settings.provider.providers.bedrock.name").toString(),
						},
						{
							value: "glama",
							label: t("settings.provider.providers.glama.name").toString(),
						},
						{
							value: "mistral",
							label: t("settings.provider.providers.mistral.name").toString(),
						},
						{
							value: "lmstudio",
							label: t("settings.provider.providers.lmstudio.name").toString(),
						},
						{
							value: "ollama",
							label: t("settings.provider.providers.ollama.name").toString(),
						},
						{
							value: "unbound",
							label: t("settings.provider.providers.unbound.name").toString(),
						},
						{
							value: "requesty",
							label: t("settings.provider.providers.requesty.name").toString(),
						},
					]}
				/>
			</div>

			{selectedProvider === "anthropic" && (
				<div>
					<Checkbox
						checked={anthropicBaseUrlSelected}
						style={{ width: "100%", marginTop: 8, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							setAnthropicBaseUrlSelected(checked)
							if (!checked) {
								handleInputChange("anthropicBaseUrl")({
									target: {
										value: "",
									},
								})
							}
						}}>
						{t("settings.provider.providers.anthropic.useCustomBaseUrl").toString()}
					</Checkbox>

					{anthropicBaseUrlSelected && (
						<VSCodeTextField
							value={apiConfiguration?.anthropicBaseUrl || ""}
							style={{ width: "100%", marginTop: 3 }}
							type="url"
							onBlur={handleInputChange("anthropicBaseUrl")}
							placeholder={t("settings.provider.customBaseUrl.placeholder", {
								defaultUrl: "https://api.anthropic.com",
							}).toString()}
						/>
					)}

					<VSCodeTextField
						value={apiConfiguration?.apiKey || ""}
						style={{ marginTop: 8, width: "100%" }}
						type="password"
						onBlur={handleInputChange("apiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span style={{ fontWeight: 500 }}>
							{t("settings.provider.providers.anthropic.title").toString()}
						</span>
					</VSCodeTextField>

					{!apiConfiguration?.apiKey && (
						<VSCodeButtonLink
							href="https://console.anthropic.com/settings/keys"
							style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.anthropic.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>
				</div>
			)}

			{selectedProvider === "glama" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.glamaApiKey || ""}
						style={{ width: "100%", marginTop: 8 }}
						type="password"
						onBlur={handleInputChange("glamaApiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span style={{ fontWeight: 500 }}>
							{t("settings.provider.providers.glama.title").toString()}
						</span>
					</VSCodeTextField>

					{!apiConfiguration?.glamaApiKey && (
						<VSCodeButtonLink href={getGlamaAuthUrl(uriScheme)} style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.glama.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>
				</div>
			)}

			{selectedProvider === "openai-native" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.openAiNativeApiKey || ""}
						style={{ width: "100%", marginTop: 8 }}
						type="password"
						onBlur={handleInputChange("openAiNativeApiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span>{t("settings.provider.providers.openaiNative.title").toString()}</span>
					</VSCodeTextField>

					{!apiConfiguration?.openAiNativeApiKey && (
						<VSCodeButtonLink href={getopenAiNativeAuthUrl(uriScheme)} style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.openaiNative.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>
				</div>
			)}

			{selectedProvider === "mistral" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.mistralApiKey || ""}
						style={{ width: "100%", marginTop: 8 }}
						type="password"
						onBlur={handleInputChange("mistralApiKey")}
						placeholder={t("settings.provider.providers.mistral.placeholder").toString()}>
						<span style={{ fontWeight: 500 }}>
							{t("settings.provider.providers.mistral.title").toString()}
						</span>
					</VSCodeTextField>

					{!apiConfiguration?.mistralApiKey && (
						<VSCodeButtonLink href="https://console.mistral.ai/codestral/" style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.mistral.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>
				</div>
			)}

			{selectedProvider === "openrouter" && (
				<div>
					<Checkbox
						checked={openRouterBaseUrlSelected}
						style={{ width: "100%", marginTop: 5, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							setOpenRouterBaseUrlSelected(checked)
							if (!checked) {
								handleInputChange("openRouterBaseUrl")({
									target: {
										value: "",
									},
								})
							}
						}}>
						{t("settings.provider.providers.openRouter.useCustomBaseUrl").toString()}
					</Checkbox>

					{openRouterBaseUrlSelected && (
						<VSCodeTextField
							value={apiConfiguration?.openRouterBaseUrl || ""}
							style={{ width: "100%", marginTop: 3 }}
							type="url"
							onBlur={handleInputChange("openRouterBaseUrl")}
							placeholder={t("settings.provider.customBaseUrl.placeholder", {
								defaultUrl: "https://openrouter.ai/api",
							}).toString()}
						/>
					)}

					<VSCodeTextField
						value={apiConfiguration?.openRouterApiKey || ""}
						style={{ width: "100%", marginTop: 8 }}
						type="password"
						onBlur={handleInputChange("openRouterApiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span>{t("settings.provider.providers.openRouter.title").toString()}</span>
					</VSCodeTextField>

					{!apiConfiguration?.openRouterApiKey && (
						<VSCodeButtonLink href={getOpenRouterAuthUrl(uriScheme)} style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.openRouter.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>
					<Checkbox
						checked={apiConfiguration?.openRouterUseMiddleOutTransform || false}
						style={{ width: "100%", marginTop: 8, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							handleInputChange("openRouterUseMiddleOutTransform")({
								target: { value: checked },
							})
						}}>
						{t("settings.provider.providers.openRouter.compressPrompts").toString()} <br />
						<VSCodeLink href="https://openrouter.ai/docs/transforms">
							{t("settings.provider.providers.openRouter.transforms").toString()}
						</VSCodeLink>
					</Checkbox>
					<br />
				</div>
			)}

			{selectedProvider === "bedrock" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.awsAccessKey || ""}
						style={{ width: "100%", marginTop: 8 }}
						type="text"
						onInput={handleInputChange("awsAccessKey")}
						placeholder={t("settings.provider.providers.bedrock.accessKey").toString()}>
						<span>{t("settings.provider.providers.bedrock.title").toString()}</span>
					</VSCodeTextField>

					<VSCodeTextField
						value={apiConfiguration?.awsSecretKey || ""}
						style={{ width: "100%", marginTop: 3 }}
						type="password"
						onInput={handleInputChange("awsSecretKey")}
						placeholder={t("settings.provider.providers.bedrock.secretKey").toString()}
					/>

					<VSCodeTextField
						value={apiConfiguration?.awsSessionToken || ""}
						style={{ width: "100%", marginTop: 3 }}
						type="password"
						onInput={handleInputChange("awsSessionToken")}
						placeholder={t("settings.provider.providers.bedrock.sessionToken").toString()}
					/>

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>

					<div className="dropdown-container" style={{ marginTop: 8 }}>
						<label htmlFor="bedrock-region">
							<span>{t("settings.provider.providers.bedrock.region").toString()}</span>
						</label>
						<Dropdown
							id="bedrock-region"
							value={apiConfiguration?.awsRegion || "us-east-1"}
							onChange={(value: unknown) => {
								handleInputChange("awsRegion")({
									target: {
										value: (value as DropdownOption).value,
									},
								})
							}}
							style={{ minWidth: 180, width: "100%" }}
							options={[
								{
									value: "us-east-1",
									label: "US East (N. Virginia)",
								},
								{
									value: "us-west-2",
									label: "US West (Oregon)",
								},
								{
									value: "ap-northeast-1",
									label: "Asia Pacific (Tokyo)",
								},
								{
									value: "eu-central-1",
									label: "Europe (Frankfurt)",
								},
							]}
						/>
					</div>

					<Checkbox
						checked={apiConfiguration?.awsUseCrossRegionInference}
						style={{
							width: "100%",
							marginTop: 8,
							fontWeight: 300,
							color: "var(--vscode-descriptionForeground)",
						}}
						onChange={(checked: boolean) => {
							handleInputChange("awsUseCrossRegionInference")({
								target: {
									value: checked,
								},
							})
						}}>
						{t("settings.provider.providers.bedrock.useCrossRegion").toString()}
					</Checkbox>
				</div>
			)}

			{selectedProvider === "vertex" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.vertexProjectId || ""}
						style={{ width: "100%" }}
						type="text"
						onBlur={handleInputChange("vertexProjectId")}
						placeholder={t("settings.provider.providers.vertex.enterProjectId").toString()}>
						<span style={{ marginTop: 8 }}>
							{t("settings.provider.providers.vertex.projectId").toString()}
						</span>
					</VSCodeTextField>

					<div className="dropdown-container" style={{ marginTop: 5 }}>
						<label htmlFor="vertex-region">
							<span style={{ marginTop: 8 }}>
								{t("settings.provider.providers.vertex.region").toString()}
							</span>
						</label>
						<Dropdown
							id="vertex-region"
							value={apiConfiguration?.vertexRegion || "us-central1"}
							onChange={(value: unknown) => {
								handleInputChange("vertexRegion")({
									target: {
										value: (value as DropdownOption).value,
									},
								})
							}}
							style={{ minWidth: 180, width: "100%" }}
							options={[
								{
									value: "us-central1",
									label: "US Central (Iowa)",
								},
								{
									value: "us-east4",
									label: "US East (N. Virginia)",
								},
								{
									value: "europe-west4",
									label: "Europe West (Netherlands)",
								},
								{
									value: "asia-southeast1",
									label: "Asia Southeast (Singapore)",
								},
								{
									value: "us-east5",
									label: "US East (South Carolina)",
								},
								{
									value: "europe-west1",
									label: "Europe West (Belgium)",
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
						{t("settings.provider.providers.vertex.description").toString()}
					</p>
				</div>
			)}

			{selectedProvider === "gemini" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.geminiApiKey || ""}
						style={{ width: "100%", marginTop: 3 }}
						type="password"
						onBlur={handleInputChange("geminiApiKey")}
						placeholder={t("settings.provider.providers.gemini.placeholder").toString()}>
						<span>{t("settings.provider.providers.gemini.title").toString()}</span>
					</VSCodeTextField>

					{!apiConfiguration?.geminiApiKey && (
						<VSCodeButtonLink href="https://aistudio.google.com/apikey/" style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.gemini.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}.
					</p>
				</div>
			)}

			{selectedProvider === "openai" && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						rowGap: "5px",
					}}>
					<VSCodeTextField
						value={apiConfiguration?.openAiBaseUrl || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="text"
						onBlur={handleInputChange("openAiBaseUrl")}
						placeholder={t("settings.provider.providers.openai.enterBaseUrl").toString()}>
						<span>{t("settings.provider.providers.openai.baseUrl").toString()}</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.openAiApiKey || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="password"
						onBlur={handleInputChange("openAiApiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span>{t("settings.provider.providers.openai.title").toString()}</span>
					</VSCodeTextField>
					<OpenAiModelPicker />
					<div style={{ display: "flex", alignItems: "center" }}>
						<Checkbox
							checked={apiConfiguration?.openAiStreamingEnabled ?? true}
							style={{ width: "100%", marginTop: 8, color: "var(--vscode-descriptionForeground)" }}
							onChange={(checked: boolean) => {
								handleInputChange("openAiStreamingEnabled")({
									target: { value: checked },
								})
							}}>
							{t("settings.provider.providers.openai.streaming").toString()}
						</Checkbox>
					</div>
					<Checkbox
						checked={apiConfiguration?.openAiUseAzure ?? false}
						style={{ width: "100%", marginTop: 8, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							handleInputChange("openAiUseAzure")({
								target: { value: checked },
							})
						}}>
						{t("settings.provider.providers.openai.useAzure").toString()}
					</Checkbox>
					<Checkbox
						checked={azureApiVersionSelected}
						style={{ width: "100%", marginTop: 8, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							setAzureApiVersionSelected(checked)
							if (!checked) {
								handleInputChange("azureApiVersion")({
									target: {
										value: "",
									},
								})
							}
						}}>
						{t("settings.provider.providers.openai.setAzureVersion").toString()}
					</Checkbox>
					{azureApiVersionSelected && (
						<VSCodeTextField
							value={apiConfiguration?.azureApiVersion || ""}
							style={{ width: "100%", marginTop: 3 }}
							onBlur={handleInputChange("azureApiVersion")}
							placeholder={`Default: ${azureOpenAiDefaultApiVersion}`}
						/>
					)}

					<div style={{ marginTop: "10px" }}>
						<TemperatureControl
							value={apiConfiguration?.modelTemperature}
							onChange={(value) => {
								handleInputChange("modelTemperature")({
									target: { value },
								})
							}}
							maxValue={2}
						/>
					</div>

					<div
						style={{
							marginTop: 15,
						}}
					/>
					<Pane
						title={t("settings.provider.providers.openai.modelConfig.title").toString()}
						open={false}
						actions={[
							{
								iconName: "refresh",
								onClick: () =>
									handleInputChange("openAiCustomModelInfo")({
										target: {
											value: openAiModelInfoSaneDefaults,
										},
									}),
							},
						]}>
						<div
							style={{
								padding: 15,
								backgroundColor: "var(--vscode-editor-background)",
							}}>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "0 0 15px 0",
									lineHeight: "1.4",
								}}>
								{t(
									"settings.provider.providers.openai.modelConfig.capabilities.description",
								).toString()}
								<br />
								{t("settings.provider.providers.openai.modelConfig.capabilities.warning").toString()}
							</p>

							{/* Capabilities Section */}
							<div
								style={{
									marginBottom: 20,
									padding: 12,
									backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
									borderRadius: 4,
								}}>
								<span
									style={{
										fontWeight: 500,
										fontSize: "12px",
										display: "block",
										marginBottom: 12,
										color: "var(--vscode-editor-foreground)",
									}}>
									{t("settings.provider.providers.openai.modelConfig.capabilities.title").toString()}
								</span>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 12,
									}}>
									<div
										className="token-config-field"
										style={{
											backgroundColor: "var(--vscode-editor-background)",
											padding: "12px",
											borderRadius: "4px",
											marginTop: "8px",
											border: "1px solid var(--vscode-input-border)",
											transition: "background-color 0.2s ease",
										}}>
										<VSCodeTextField
											value={
												apiConfiguration?.openAiCustomModelInfo?.maxTokens?.toString() ||
												openAiModelInfoSaneDefaults.maxTokens?.toString() ||
												""
											}
											type="text"
											style={{
												width: "100%",
												borderColor: (() => {
													const value = apiConfiguration?.openAiCustomModelInfo?.maxTokens
													if (!value) {
														return "var(--vscode-input-border)"
													}
													return value > 0
														? "var(--vscode-charts-green)"
														: "var(--vscode-errorForeground)"
												})(),
											}}
											title={t(
												"settings.provider.providers.openai.modelConfig.capabilities.maxTokens.description",
											).toString()}
											onChange={(e: any) => {
												const value = parseInt(e.target.value)
												handleInputChange("openAiCustomModelInfo")({
													target: {
														value: {
															...(apiConfiguration?.openAiCustomModelInfo ||
																openAiModelInfoSaneDefaults),
															maxTokens: isNaN(value) ? undefined : value,
														},
													},
												})
											}}
											placeholder={t(
												"settings.provider.modelConfig.capabilities.maxTokens.example",
												{ value: "4096" },
											).toString()}>
											<span style={{ fontWeight: 500 }}>
												{t(
													"settings.provider.providers.openai.modelConfig.capabilities.maxTokens.title",
												).toString()}
											</span>
										</VSCodeTextField>
										<div
											style={{
												fontSize: "11px",
												color: "var(--vscode-descriptionForeground)",
												marginTop: 4,
												display: "flex",
												alignItems: "center",
												gap: 4,
											}}>
											<i className="codicon codicon-info" style={{ fontSize: "12px" }}></i>
											<span>
												{t(
													"settings.provider.providers.openai.modelConfig.capabilities.maxTokens.description",
												).toString()}
												<br />
												{t(
													"settings.provider.providers.openai.modelConfig.capabilities.maxTokens.note",
												).toString()}
											</span>
										</div>
									</div>

									<div
										className="token-config-field"
										style={{
											backgroundColor: "var(--vscode-editor-background)",
											padding: "12px",
											borderRadius: "4px",
											marginTop: "8px",
											border: "1px solid var(--vscode-input-border)",
											transition: "background-color 0.2s ease",
										}}>
										<VSCodeTextField
											value={
												apiConfiguration?.openAiCustomModelInfo?.contextWindow?.toString() ||
												openAiModelInfoSaneDefaults.contextWindow?.toString() ||
												""
											}
											type="text"
											style={{
												width: "100%",
												borderColor: (() => {
													const value = apiConfiguration?.openAiCustomModelInfo?.contextWindow
													if (!value) {
														return "var(--vscode-input-border)"
													}
													return value > 0
														? "var(--vscode-charts-green)"
														: "var(--vscode-errorForeground)"
												})(),
											}}
											title={t(
												"settings.provider.providers.openai.modelConfig.capabilities.contextWindow.description",
											).toString()}
											onChange={(e: any) => {
												const parsed = parseInt(e.target.value)
												handleInputChange("openAiCustomModelInfo")({
													target: {
														value: {
															...(apiConfiguration?.openAiCustomModelInfo ||
																openAiModelInfoSaneDefaults),
															contextWindow:
																e.target.value === ""
																	? undefined
																	: isNaN(parsed)
																		? openAiModelInfoSaneDefaults.contextWindow
																		: parsed,
														},
													},
												})
											}}
											placeholder={t(
												"settings.provider.modelConfig.capabilities.contextWindow.example",
												{ value: "128000" },
											).toString()}>
											<span style={{ fontWeight: 500 }}>
												{t(
													"settings.provider.providers.openai.modelConfig.capabilities.contextWindow.title",
												).toString()}
											</span>
										</VSCodeTextField>
										<div
											style={{
												fontSize: "11px",
												color: "var(--vscode-descriptionForeground)",
												marginTop: 4,
												display: "flex",
												alignItems: "center",
												gap: 4,
											}}>
											<i className="codicon codicon-info" style={{ fontSize: "12px" }}></i>
											<span>
												{t(
													"settings.provider.providers.openai.modelConfig.capabilities.contextWindow.description",
												).toString()}
											</span>
										</div>
									</div>

									<div
										style={{
											backgroundColor: "var(--vscode-editor-background)",
											padding: "12px",
											borderRadius: "4px",
											marginTop: "8px",
											border: "1px solid var(--vscode-input-border)",
											transition: "background-color 0.2s ease",
										}}>
										<span
											style={{
												fontSize: "11px",
												fontWeight: 500,
												color: "var(--vscode-editor-foreground)",
												display: "block",
												marginBottom: "10px",
											}}>
											{t(
												"settings.provider.providers.openai.modelConfig.features.title",
											).toString()}
										</span>

										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: "12px",
											}}>
											<div className="feature-toggle">
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: "8px",
													}}>
													<Checkbox
														checked={
															apiConfiguration?.openAiCustomModelInfo?.supportsImages ??
															openAiModelInfoSaneDefaults.supportsImages
														}
														style={{
															width: "100%",
															marginTop: 8,
															color: "var(--vscode-descriptionForeground)",
														}}
														onChange={(checked: boolean) => {
															handleInputChange("openAiCustomModelInfo")({
																target: {
																	value: {
																		...(apiConfiguration?.openAiCustomModelInfo ||
																			openAiModelInfoSaneDefaults),
																		supportsImages: checked,
																	},
																},
															})
														}}>
														<span>
															{t(
																"settings.provider.providers.openai.modelConfig.features.imageSupport.title",
															).toString()}
														</span>
													</Checkbox>
													<i
														className="codicon codicon-info"
														title={t(
															"settings.provider.providers.openai.modelConfig.features.imageSupport.description",
														).toString()}
														style={{
															fontSize: "12px",
															color: "var(--vscode-descriptionForeground)",
															cursor: "help",
														}}
													/>
												</div>
												<p
													style={{
														fontSize: "11px",
														color: "var(--vscode-descriptionForeground)",
														marginLeft: "24px",
														marginTop: "4px",
														lineHeight: "1.4",
													}}>
													{t(
														"settings.provider.providers.openai.modelConfig.features.imageSupport.note",
													).toString()}
												</p>
											</div>

											<div
												className="feature-toggle"
												style={{
													borderTop: "1px solid var(--vscode-input-border)",
													paddingTop: "12px",
												}}>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: "8px",
													}}>
													<Checkbox
														checked={
															apiConfiguration?.openAiCustomModelInfo
																?.supportsComputerUse ?? false
														}
														style={{
															width: "100%",
															marginTop: 8,
															color: "var(--vscode-descriptionForeground)",
														}}
														onChange={(checked: boolean) => {
															handleInputChange("openAiCustomModelInfo")({
																target: {
																	value: {
																		...(apiConfiguration?.openAiCustomModelInfo ||
																			openAiModelInfoSaneDefaults),
																		supportsComputerUse: checked,
																	},
																},
															})
														}}>
														<span>
															{t(
																"settings.provider.providers.openai.modelConfig.features.computerUse.title",
															).toString()}
														</span>
													</Checkbox>
													<i
														className="codicon codicon-info"
														title={t(
															"settings.provider.providers.openai.modelConfig.features.computerUse.description",
														).toString()}
														style={{
															fontSize: "12px",
															color: "var(--vscode-descriptionForeground)",
															cursor: "help",
														}}
													/>
												</div>
												<p
													style={{
														fontSize: "11px",
														color: "var(--vscode-descriptionForeground)",
														marginLeft: "24px",
														marginTop: "4px",
														lineHeight: "1.4",
													}}>
													{t(
														"settings.provider.providers.openai.modelConfig.features.computerUse.note",
													).toString()}
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							{/* Pricing Section */}
							<div
								style={{
									backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
									padding: "12px",
									borderRadius: "4px",
									marginTop: "15px",
								}}>
								<div style={{ marginBottom: "12px" }}>
									<span
										style={{
											fontWeight: 500,
											fontSize: "12px",
											color: "var(--vscode-editor-foreground)",
											display: "block",
											marginBottom: "4px",
										}}>
										{t("settings.provider.providers.openai.modelConfig.pricing.title").toString()}
									</span>
									<span
										style={{
											fontSize: "11px",
											color: "var(--vscode-descriptionForeground)",
											display: "block",
										}}>
										{t(
											"settings.provider.providers.openai.modelConfig.pricing.description",
										).toString()}
									</span>
								</div>

								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: "12px",
										backgroundColor: "var(--vscode-editor-background)",
										padding: "12px",
										borderRadius: "4px",
									}}>
									<div className="price-input">
										<VSCodeTextField
											value={
												apiConfiguration?.openAiCustomModelInfo?.inputPrice?.toString() ??
												openAiModelInfoSaneDefaults.inputPrice?.toString() ??
												""
											}
											type="text"
											style={{
												width: "100%",
												borderColor: (() => {
													const value = apiConfiguration?.openAiCustomModelInfo?.inputPrice
													if (!value && value !== 0) {
														return "var(--vscode-input-border)"
													}
													return value >= 0
														? "var(--vscode-charts-green)"
														: "var(--vscode-errorForeground)"
												})(),
											}}
											onChange={(e: any) => {
												const parsed = parseFloat(e.target.value)
												handleInputChange("openAiCustomModelInfo")({
													target: {
														value: {
															...(apiConfiguration?.openAiCustomModelInfo ??
																openAiModelInfoSaneDefaults),
															inputPrice:
																e.target.value === ""
																	? undefined
																	: isNaN(parsed)
																		? openAiModelInfoSaneDefaults.inputPrice
																		: parsed,
														},
													},
												})
											}}
											placeholder={t("settings.provider.modelConfig.pricing.inputPrice.example", {
												value: "0.0001",
											}).toString()}>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "4px",
												}}>
												<span style={{ fontWeight: 500 }}>
													{t(
														"settings.provider.providers.openai.modelConfig.pricing.inputPrice.title",
													).toString()}
												</span>
												<i
													className="codicon codicon-info"
													title={t(
														"settings.provider.providers.openai.modelConfig.pricing.inputPrice.description",
													).toString()}
													style={{
														fontSize: "12px",
														color: "var(--vscode-descriptionForeground)",
														cursor: "help",
													}}
												/>
											</div>
										</VSCodeTextField>
									</div>

									<div className="price-input">
										<VSCodeTextField
											value={
												apiConfiguration?.openAiCustomModelInfo?.outputPrice?.toString() ||
												openAiModelInfoSaneDefaults.outputPrice?.toString() ||
												""
											}
											type="text"
											style={{
												width: "100%",
												borderColor: (() => {
													const value = apiConfiguration?.openAiCustomModelInfo?.outputPrice
													if (!value && value !== 0) {
														return "var(--vscode-input-border)"
													}
													return value >= 0
														? "var(--vscode-charts-green)"
														: "var(--vscode-errorForeground)"
												})(),
											}}
											onChange={(e: any) => {
												const parsed = parseFloat(e.target.value)
												handleInputChange("openAiCustomModelInfo")({
													target: {
														value: {
															...(apiConfiguration?.openAiCustomModelInfo ||
																openAiModelInfoSaneDefaults),
															outputPrice:
																e.target.value === ""
																	? undefined
																	: isNaN(parsed)
																		? openAiModelInfoSaneDefaults.outputPrice
																		: parsed,
														},
													},
												})
											}}
											placeholder={t(
												"settings.provider.modelConfig.pricing.outputPrice.example",
												{ value: "0.0002" },
											).toString()}>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "4px",
												}}>
												<span style={{ fontWeight: 500 }}>
													{t(
														"settings.provider.providers.openai.modelConfig.pricing.outputPrice.title",
													).toString()}
												</span>
												<i
													className="codicon codicon-info"
													title={t(
														"settings.provider.providers.openai.modelConfig.pricing.outputPrice.description",
													).toString()}
													style={{
														fontSize: "12px",
														color: "var(--vscode-descriptionForeground)",
														cursor: "help",
													}}
												/>
											</div>
										</VSCodeTextField>
									</div>
								</div>
							</div>
						</div>
					</Pane>
					<div
						style={{
							marginTop: 15,
						}}
					/>

					{/* end Model Info Configuration */}

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							({t("settings.provider.common.modelCapabilityNote").toString()})
						</span>
					</p>
				</div>
			)}

			{selectedProvider === "lmstudio" && (
				<div>
					<Checkbox
						checked={lmStudioBaseUrlSelected}
						style={{ width: "100%", marginTop: 5, color: "var(--vscode-descriptionForeground)" }}
						onChange={(checked: boolean) => {
							setLmStudioBaseUrlSelected(checked)
							if (!checked) {
								handleInputChange("lmStudioBaseUrl")({
									target: {
										value: "",
									},
								})
							}
						}}>
						{t("settings.provider.providers.lmstudio.useCustomBaseUrl").toString()}
					</Checkbox>

					{lmStudioBaseUrlSelected && (
						<VSCodeTextField
							value={apiConfiguration?.lmStudioBaseUrl || ""}
							style={{ width: "100%", marginTop: 3 }}
							type="url"
							onBlur={handleInputChange("lmStudioBaseUrl")}
							placeholder={t("settings.provider.customBaseUrl.placeholder", {
								defaultUrl: "http://localhost:1234/v1",
							}).toString()}></VSCodeTextField>
					)}

					<VSCodeTextField
						value={apiConfiguration?.lmStudioModelId || ""}
						style={{ width: "100%" }}
						onBlur={handleInputChange("lmStudioModelId")}
						placeholder={t("settings.provider.providers.lmstudio.enterModelId").toString()}>
						<span style={{ fontWeight: 500 }}>
							{t("settings.provider.providers.lmstudio.modelId").toString()}
						</span>
					</VSCodeTextField>
					{lmStudioModels.length > 0 && (
						<VSCodeRadioGroup
							value={
								lmStudioModels.includes(apiConfiguration?.lmStudioModelId || "")
									? apiConfiguration?.lmStudioModelId
									: ""
							}
							onChange={(e) => {
								const value = (e.target as HTMLInputElement)?.value
								// need to check value first since radio group returns empty string sometimes
								if (value) {
									handleInputChange("lmStudioModelId")({
										target: { value },
									})
								}
							}}>
							{lmStudioModels.map((model) => (
								<VSCodeRadio
									key={model}
									value={model}
									checked={apiConfiguration?.lmStudioModelId === model}>
									{model}
								</VSCodeRadio>
							))}
						</VSCodeRadioGroup>
					)}
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.providers.lmstudio.description").toString()}
						<br />
						<VSCodeLink href="https://lmstudio.ai/docs" style={{ display: "inline", fontSize: "inherit" }}>
							{t("settings.provider.providers.lmstudio.quickstartGuide").toString()}
						</VSCodeLink>
						<br />
						<VSCodeLink
							href="https://lmstudio.ai/docs/basics/server"
							style={{ display: "inline", fontSize: "inherit" }}>
							{t("settings.provider.providers.lmstudio.localServer").toString()}
						</VSCodeLink>
						<br />
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							({t("settings.provider.common.modelCapabilityNote").toString()})
						</span>
					</p>
				</div>
			)}

			{selectedProvider === "deepseek" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.deepSeekApiKey || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="password"
						onBlur={handleInputChange("deepSeekApiKey")}
						placeholder={t("settings.provider.providers.deepseek.placeholder").toString()}>
						<span>{t("settings.provider.providers.deepseek.title").toString()}</span>
					</VSCodeTextField>

					{!apiConfiguration?.deepSeekApiKey && (
						<VSCodeButtonLink href="https://platform.deepseek.com/" style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.deepseek.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}.
					</p>
				</div>
			)}

			{selectedProvider === "vscode-lm" && (
				<div>
					<div className="dropdown-container">
						<label htmlFor="vscode-lm-model">
							<span>{t("settings.provider.providers.vscode.modelSelector").toString()}</span>
						</label>
						{vsCodeLmModels.length > 0 ? (
							<Dropdown
								id="vscode-lm-model"
								value={
									apiConfiguration?.vsCodeLmModelSelector
										? `${apiConfiguration.vsCodeLmModelSelector.vendor ?? ""}/${
												apiConfiguration.vsCodeLmModelSelector.family ?? ""
											}`
										: ""
								}
								onChange={(value: unknown) => {
									const valueStr = (value as DropdownOption)?.value
									if (!valueStr) {
										return
									}
									const [vendor, family] = valueStr.split("/")
									handleInputChange("vsCodeLmModelSelector")({
										target: {
											value: { vendor, family },
										},
									})
								}}
								style={{ width: "100%" }}
								options={[
									{
										value: "",
										label: t("settings.provider.providers.vscode.selectModel").toString(),
									},
									...vsCodeLmModels.map((model) => ({
										value: `${model.vendor}/${model.family}`,
										label: `${model.vendor} - ${model.family}`,
									})),
								]}
							/>
						) : (
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-errorForeground)",
								}}>
								{t("settings.provider.providers.vscode.noModels").toString()}
							</p>
						)}

						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
								fontWeight: 500,
							}}>
							{t("chat.task.seeMore").toString()} :{" "}
							<VSCodeLink href="https://github.com/coolcline/coolcline/blob/main/docs/user-docs/en/configuration/provides.md">
								en
							</VSCodeLink>
							{" | "}
							<VSCodeLink href="https://gitee.com/coolcline/coolcline/blob/main/docs/user-docs/zh/configuration/provides.md">
								简体中文
							</VSCodeLink>
							<br />
							<br />
							{t("settings.provider.providers.vscode.experimentalNote").toString()}
						</p>
					</div>
				</div>
			)}

			{selectedProvider === "ollama" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.ollamaBaseUrl || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="url"
						onBlur={handleInputChange("ollamaBaseUrl")}
						placeholder={t("settings.provider.providers.ollama.enterBaseUrl").toString()}>
						<span>{t("settings.provider.providers.ollama.baseUrl").toString()}</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={apiConfiguration?.ollamaModelId || ""}
						style={{ width: "100%", marginTop: 5 }}
						onBlur={handleInputChange("ollamaModelId")}
						placeholder={t("settings.provider.providers.ollama.enterModelId").toString()}>
						<span>{t("settings.provider.providers.ollama.modelId").toString()}</span>
					</VSCodeTextField>
					{ollamaModels.length > 0 && (
						<VSCodeRadioGroup
							value={
								ollamaModels.includes(apiConfiguration?.ollamaModelId || "")
									? apiConfiguration?.ollamaModelId
									: ""
							}
							onChange={(e) => {
								const value = (e.target as HTMLInputElement)?.value
								// need to check value first since radio group returns empty string sometimes
								if (value) {
									handleInputChange("ollamaModelId")({
										target: { value },
									})
								}
							}}>
							{ollamaModels.map((model) => (
								<VSCodeRadio
									key={model}
									value={model}
									checked={apiConfiguration?.ollamaModelId === model}>
									{model}
								</VSCodeRadio>
							))}
						</VSCodeRadioGroup>
					)}
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Ollama allows you to run models locally on your computer. For instructions on how to get
						started, see their
						<VSCodeLink
							href="https://github.com/coolcline/coolcline/blob/main/README.md"
							style={{ display: "inline" }}>
							en
						</VSCodeLink>
						{"|"}
						<VSCodeLink
							href="https://gitee.com/coolcline/coolcline/blob/main/README_zh.md"
							style={{ display: "inline" }}>
							简体中文
						</VSCodeLink>
						<br />
						<span style={{ color: "var(--vscode-errorForeground)" }}>
							({t("settings.provider.common.modelCapabilityNote").toString()})
						</span>
					</p>
				</div>
			)}

			{selectedProvider === "unbound" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.unboundApiKey || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="password"
						onChange={handleInputChange("unboundApiKey")}
						placeholder="Enter API Key...">
						<span>Unbound API Key</span>
					</VSCodeTextField>
					{!apiConfiguration?.unboundApiKey && (
						<VSCodeButtonLink href="https://gateway.getunbound.ai" style={{ margin: "5px 0 0 0" }}>
							Get Unbound API Key
						</VSCodeButtonLink>
					)}
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}.
					</p>
				</div>
			)}

			{selectedProvider === "requesty" && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.requestyApiKey || ""}
						style={{ width: "100%", marginTop: 5 }}
						type="password"
						onBlur={handleInputChange("requestyApiKey")}
						placeholder={t("settings.provider.apiKey.placeholder").toString()}>
						<span>{t("settings.provider.providers.requesty.title").toString()}</span>
					</VSCodeTextField>

					{!apiConfiguration?.requestyApiKey && (
						<VSCodeButtonLink href="https://app.requesty.ai/router" style={{ margin: "5px 0 0 0" }}>
							{t("settings.provider.providers.requesty.getKey").toString()}
						</VSCodeButtonLink>
					)}

					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{t("settings.provider.apiKey.storedLocally").toString()}
					</p>

					<RequestyModelPicker />
				</div>
			)}

			{apiErrorMessage && (
				<p
					style={{
						margin: "0px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{apiErrorMessage}
				</p>
			)}

			{selectedProvider === "glama" && <GlamaModelPicker />}

			{selectedProvider === "openrouter" && <OpenRouterModelPicker />}

			{selectedProvider !== "glama" &&
				selectedProvider !== "openrouter" &&
				selectedProvider !== "openai" &&
				selectedProvider !== "ollama" &&
				selectedProvider !== "lmstudio" &&
				selectedProvider !== "vscode-lm" &&
				selectedProvider !== "requesty" && (
					<>
						<div className="dropdown-container">
							<label htmlFor="model-id">
								<span>Model</span>
							</label>
							{selectedProvider === "anthropic" && createDropdown(anthropicModels)}
							{selectedProvider === "bedrock" && createDropdown(bedrockModels)}
							{selectedProvider === "vertex" && createDropdown(vertexModels)}
							{selectedProvider === "gemini" && createDropdown(geminiModels)}
							{selectedProvider === "openai-native" && createDropdown(openAiNativeModels)}
							{selectedProvider === "deepseek" && createDropdown(deepSeekModels)}
							{selectedProvider === "mistral" && createDropdown(mistralModels)}
							{selectedProvider === "unbound" && createDropdown(unboundModels)}
						</div>

						<ModelInfoView
							selectedModelId={selectedModelId}
							modelInfo={selectedModelInfo}
							isDescriptionExpanded={isDescriptionExpanded}
							setIsDescriptionExpanded={setIsDescriptionExpanded}
						/>
					</>
				)}

			<div style={{ marginTop: "10px" }}>
				<TemperatureControl
					value={apiConfiguration?.modelTemperature}
					onChange={(value) => {
						handleInputChange("modelTemperature")({
							target: { value },
						})
					}}
					maxValue={2}
				/>
			</div>

			{modelIdErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{modelIdErrorMessage}
				</p>
			)}
		</div>
	)
}

export function getGlamaAuthUrl(uriScheme?: string) {
	// ${publisher}.${name}，${publisher} 是发布者，${name} 是扩展名，注意是要用 package.json 中的 publisher 和 name，区分大小写
	const callbackUrl = `${uriScheme || "vscode"}://CoolCline.coolcline/glama`

	return `https://glama.ai/oauth/authorize?callback_url=${encodeURIComponent(callbackUrl)}`
}

export function getopenAiNativeAuthUrl(uriScheme?: string) {
	return `https://openai.com/api/auth/callback?callback_url=${uriScheme || "vscode"}://CoolCline.coolcline/openai-native`
}

export function getOpenRouterAuthUrl(uriScheme?: string) {
	// ${publisher}.${name}，${publisher} 是发布者，${name} 是扩展名，注意是要用 package.json 中的 publisher 和 name，区分大小写
	return `https://openrouter.ai/auth?callback_url=${uriScheme || "vscode"}://CoolCline.coolcline/openrouter`
}

export const formatPrice = (price: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(price)
}

export const ModelInfoView = ({
	selectedModelId,
	modelInfo,
	isDescriptionExpanded,
	setIsDescriptionExpanded,
}: {
	selectedModelId: string
	modelInfo: ModelInfo
	isDescriptionExpanded: boolean
	setIsDescriptionExpanded: (isExpanded: boolean) => void
}) => {
	const isGemini = Object.keys(geminiModels).includes(selectedModelId)

	const infoItems = [
		modelInfo.description && (
			<ModelDescriptionMarkdown
				key="description"
				markdown={modelInfo.description}
				modelId={selectedModelId}
				isExpanded={isDescriptionExpanded}
				setIsExpanded={setIsDescriptionExpanded}
			/>
		),
		<ModelInfoSupportsItem
			key="supportsImages"
			isSupported={modelInfo.supportsImages ?? false}
			supportsLabel="Supports images"
			doesNotSupportLabel="Does not support images"
		/>,
		<ModelInfoSupportsItem
			key="supportsComputerUse"
			isSupported={modelInfo.supportsComputerUse ?? false}
			supportsLabel="Supports computer use"
			doesNotSupportLabel="Does not support computer use"
		/>,
		!isGemini && (
			<ModelInfoSupportsItem
				key="supportsPromptCache"
				isSupported={modelInfo.supportsPromptCache}
				supportsLabel="Supports prompt caching"
				doesNotSupportLabel="Does not support prompt caching"
			/>
		),
		modelInfo.maxTokens !== undefined && modelInfo.maxTokens > 0 && (
			<span key="maxTokens">
				<span style={{ fontWeight: 500 }}>Max output:</span> {modelInfo.maxTokens?.toLocaleString()} tokens
			</span>
		),
		modelInfo.inputPrice !== undefined && modelInfo.inputPrice > 0 && (
			<span key="inputPrice">
				<span style={{ fontWeight: 500 }}>Input price:</span> {formatPrice(modelInfo.inputPrice)}/million tokens
			</span>
		),
		modelInfo.supportsPromptCache && modelInfo.cacheWritesPrice && (
			<span key="cacheWritesPrice">
				<span style={{ fontWeight: 500 }}>Cache writes price:</span>{" "}
				{formatPrice(modelInfo.cacheWritesPrice || 0)}/million tokens
			</span>
		),
		modelInfo.supportsPromptCache && modelInfo.cacheReadsPrice && (
			<span key="cacheReadsPrice">
				<span style={{ fontWeight: 500 }}>Cache reads price:</span>{" "}
				{formatPrice(modelInfo.cacheReadsPrice || 0)}/million tokens
			</span>
		),
		modelInfo.outputPrice !== undefined && modelInfo.outputPrice > 0 && (
			<span key="outputPrice">
				<span style={{ fontWeight: 500 }}>Output price:</span> {formatPrice(modelInfo.outputPrice)}/million
				tokens
			</span>
		),
		isGemini && (
			<span key="geminiInfo" style={{ fontStyle: "italic" }}>
				* Free up to {selectedModelId && selectedModelId.includes("flash") ? "15" : "2"} requests per minute.
				After that, billing depends on prompt size.{" "}
				<VSCodeLink href="https://ai.google.dev/pricing" style={{ display: "inline", fontSize: "inherit" }}>
					For more info, see pricing details.
				</VSCodeLink>
			</span>
		),
	].filter(Boolean)

	return (
		<p
			style={{
				fontSize: "12px",
				marginTop: "2px",
				color: "var(--vscode-descriptionForeground)",
			}}>
			{infoItems.map((item, index) => (
				<Fragment key={index}>
					{item}
					{index < infoItems.length - 1 && <br />}
				</Fragment>
			))}
		</p>
	)
}

const ModelInfoSupportsItem = ({
	isSupported,
	supportsLabel,
	doesNotSupportLabel,
}: {
	isSupported: boolean
	supportsLabel: string
	doesNotSupportLabel: string
}) => (
	<span
		style={{
			fontWeight: 500,
			color: isSupported ? "var(--vscode-charts-green)" : "var(--vscode-errorForeground)",
		}}>
		<i
			className={`codicon codicon-${isSupported ? "check" : "x"}`}
			style={{
				marginRight: 4,
				marginBottom: isSupported ? 1 : -1,
				fontSize: isSupported ? 11 : 13,
				fontWeight: 700,
				display: "inline-block",
				verticalAlign: "bottom",
			}}></i>
		{isSupported ? supportsLabel : doesNotSupportLabel}
	</span>
)

export function normalizeApiConfiguration(apiConfiguration?: ApiConfiguration) {
	const provider = apiConfiguration?.llmProvider || "anthropic"
	const modelId = apiConfiguration?.apiModelId

	const getProviderData = (models: Record<string, ModelInfo>, defaultId: string) => {
		let selectedModelId: string
		let selectedModelInfo: ModelInfo
		if (modelId && modelId in models) {
			selectedModelId = modelId
			selectedModelInfo = models[modelId]
		} else {
			selectedModelId = defaultId
			selectedModelInfo = models[defaultId]
		}
		return {
			selectedProvider: provider,
			selectedModelId,
			selectedModelInfo,
		}
	}
	switch (provider) {
		case "anthropic":
			return getProviderData(anthropicModels, anthropicDefaultModelId)
		case "bedrock":
			return getProviderData(bedrockModels, bedrockDefaultModelId)
		case "vertex":
			return getProviderData(vertexModels, vertexDefaultModelId)
		case "gemini":
			return getProviderData(geminiModels, geminiDefaultModelId)
		case "deepseek":
			return getProviderData(deepSeekModels, deepSeekDefaultModelId)
		case "openai-native":
			return getProviderData(openAiNativeModels, openAiNativeDefaultModelId)
		case "glama":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
				selectedModelInfo: apiConfiguration?.glamaModelInfo || glamaDefaultModelInfo,
			}
		case "mistral":
			return getProviderData(mistralModels, mistralDefaultModelId)
		case "openrouter":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
				selectedModelInfo: apiConfiguration?.openRouterModelInfo || openRouterDefaultModelInfo,
			}
		case "openai":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.openAiModelId || "",
				selectedModelInfo: apiConfiguration?.openAiCustomModelInfo || openAiModelInfoSaneDefaults,
			}
		case "ollama":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.ollamaModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "lmstudio":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.lmStudioModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "vscode-lm":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.vsCodeLmModelSelector
					? `${apiConfiguration.vsCodeLmModelSelector.vendor}/${apiConfiguration.vsCodeLmModelSelector.family}`
					: "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					supportsImages: false, // VSCode LM API currently doesn't support images
				},
			}
		case "unbound":
			return getProviderData(unboundModels, unboundDefaultModelId)
		case "requesty":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
				selectedModelInfo: apiConfiguration?.requestyModelInfo || requestyDefaultModel,
			}
		default:
			return getProviderData(anthropicModels, anthropicDefaultModelId)
	}
}

export default memo(ApiOptions)
