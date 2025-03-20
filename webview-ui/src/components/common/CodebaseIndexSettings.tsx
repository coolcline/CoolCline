import { VSCodeButton, VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useState, useEffect, useCallback, memo } from "react"
import { useTranslation } from "react-i18next"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"

/**
 * 代码库索引状态接口
 */
interface IndexStats {
	filesCount: number
	symbolsCount: number
	lastIndexed: string | null
	status: string
}

/**
 * 索引进度接口
 */
interface IndexProgress {
	completed: number
	total: number
	percent: number
}

/**
 * 代码库索引设置组件
 */
const CodebaseIndexSettings = () => {
	const { t } = useTranslation()

	// 从扩展状态获取配置
	const {
		codebaseIndexEnabled,
		setCodebaseIndexEnabled,
		codebaseIndexAutoStart,
		setCodebaseIndexAutoStart,
		codebaseIndexExcludePaths,
		setCodebaseIndexExcludePaths,
		codebaseIndexIncludeTests,
		setCodebaseIndexIncludeTests,
	} = useExtensionState()

	// 索引状态
	const [indexStats, setIndexStats] = useState<IndexStats>({
		filesCount: 0,
		symbolsCount: 0,
		lastIndexed: null,
		status: "idle",
	})

	// 索引进度
	const [indexProgress, setIndexProgress] = useState<IndexProgress>({
		completed: 0,
		total: 0,
		percent: 0,
	})

	// 获取索引状态
	const fetchIndexStatus = useCallback(() => {
		vscode.postMessage({
			type: "codebaseSearch",
			action: "getStats",
		})
	}, [])

	// 监听来自扩展的消息
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "codebaseIndexStats") {
				setIndexStats({
					filesCount: message.stats.filesCount || 0,
					symbolsCount: message.stats.symbolsCount || 0,
					lastIndexed: message.stats.lastIndexed
						? new Date(message.stats.lastIndexed).toLocaleString()
						: null,
					status: message.stats.status || "idle",
				})

				if (message.progress) {
					const percent =
						message.progress.total > 0
							? Math.floor((message.progress.completed / message.progress.total) * 100)
							: 0

					setIndexProgress({
						completed: message.progress.completed || 0,
						total: message.progress.total || 0,
						percent: percent,
					})
				}
			}
		}

		window.addEventListener("message", handleMessage)

		// 初始获取索引状态
		fetchIndexStatus()

		// 定期获取索引状态更新
		const intervalId = setInterval(fetchIndexStatus, 2000)

		return () => {
			window.removeEventListener("message", handleMessage)
			clearInterval(intervalId)
		}
	}, [fetchIndexStatus])

	// 启动索引
	const handleStartIndex = () => {
		vscode.postMessage({
			type: "codebaseSearch",
			action: "refreshIndex",
			settings: {
				excludePaths: codebaseIndexExcludePaths,
				includeTests: codebaseIndexIncludeTests,
			},
		})
	}

	// 刷新索引
	const handleRefreshIndex = () => {
		vscode.postMessage({
			type: "codebaseSearch",
			action: "refreshIndex",
			settings: {
				excludePaths: codebaseIndexExcludePaths,
				includeTests: codebaseIndexIncludeTests,
			},
		})
	}

	// 清除索引
	const handleClearIndex = () => {
		if (window.confirm(t("codebaseIndex.deleteConfirm").toString() || "确定要删除索引吗？这将移除所有索引数据。")) {
			vscode.postMessage({
				type: "codebaseSearch",
				action: "clearIndex",
			})
		}
	}

	// 切换启用状态
	const handleToggleEnabled = (enabled: boolean) => {
		setCodebaseIndexEnabled(enabled)
		vscode.postMessage({
			type: "codebaseSearch",
			action: "updateSettings",
			settings: {
				enabled: enabled,
			},
		})
	}

	return (
		<div>
			<h2 style={{ margin: "0 0 15px 0", fontWeight: "500" }}>
				{t("settings.codebaseIndex.title").toString() || "代码库搜索索引"}
			</h2>

			<div style={{ marginBottom: 15 }}>
				<VSCodeCheckbox
					checked={codebaseIndexEnabled}
					onChange={(e: any) => handleToggleEnabled(e.target.checked)}>
					<span style={{ fontWeight: "500" }}>
						{t("settings.codebaseIndex.enable.title").toString() || "启用代码搜索索引"}
					</span>
				</VSCodeCheckbox>
				<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
					{t("settings.codebaseIndex.enable.description").toString() ||
						"启用后将为工作区代码建立索引，提供更智能的代码搜索功能"}
				</p>
			</div>

			{codebaseIndexEnabled && (
				<>
					{/* 索引状态显示 */}
					<div
						style={{
							marginTop: 10,
							padding: 12,
							backgroundColor: "var(--vscode-list-hoverBackground)",
							borderRadius: 4,
						}}>
						<h3 style={{ margin: "0 0 10px 0", fontWeight: "500", fontSize: 14 }}>
							{t("settings.codebaseIndex.status.title").toString() || "索引状态"}
						</h3>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
								gap: 10,
							}}>
							<div>
								<div style={{ fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
									{t("settings.codebaseIndex.status.filesCount").toString() || "已索引文件数"}
								</div>
								<div
									style={{
										fontSize: 18,
										fontWeight: "bold",
										color: "var(--vscode-button-background)",
									}}>
									{indexStats.filesCount}
								</div>
							</div>

							<div>
								<div style={{ fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
									{t("settings.codebaseIndex.status.symbolsCount").toString() || "已索引符号数"}
								</div>
								<div
									style={{
										fontSize: 18,
										fontWeight: "bold",
										color: "var(--vscode-button-background)",
									}}>
									{indexStats.symbolsCount}
								</div>
							</div>

							<div>
								<div style={{ fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
									{t("settings.codebaseIndex.status.lastIndexed").toString() || "最后索引时间"}
								</div>
								<div style={{ fontSize: 14, color: "var(--vscode-foreground)" }}>
									{indexStats.lastIndexed || "从未"}
								</div>
							</div>

							<div>
								<div style={{ fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
									{t("settings.codebaseIndex.status.current").toString() || "当前状态"}
								</div>
								<div style={{ fontSize: 14, color: "var(--vscode-foreground)" }}>
									{(() => {
										switch (indexStats.status) {
											case "idle":
												return t("settings.codebaseIndex.status.idle").toString() || "空闲"
											case "scanning":
												return (
													t("settings.codebaseIndex.status.scanning").toString() || "扫描中"
												)
											case "indexing":
												return (
													t("settings.codebaseIndex.status.indexing").toString() || "索引中"
												)
											case "completed":
												return (
													t("settings.codebaseIndex.status.completed").toString() || "已完成"
												)
											case "error":
												return t("settings.codebaseIndex.status.error").toString() || "错误"
											default:
												return indexStats.status
										}
									})()}
								</div>
							</div>
						</div>

						{/* 进度条 */}
						{indexStats.status === "indexing" && (
							<div style={{ marginTop: 15 }}>
								<div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
									<span>{t("settings.codebaseIndex.status.progress").toString() || "进度"}</span>
									<span>
										{indexProgress.percent}% ({indexProgress.completed}/{indexProgress.total})
									</span>
								</div>
								<div
									style={{
										height: 4,
										backgroundColor: "var(--vscode-progressBar-background)",
										borderRadius: 2,
										marginTop: 5,
										overflow: "hidden",
									}}>
									<div
										style={{
											height: "100%",
											width: `${indexProgress.percent}%`,
											backgroundColor: "var(--vscode-button-background)",
											transition: "width 0.3s ease",
										}}></div>
								</div>
							</div>
						)}

						{/* 操作按钮 */}
						<div style={{ display: "flex", gap: 8, marginTop: 15 }}>
							<VSCodeButton
								appearance="primary"
								onClick={handleStartIndex}
								disabled={indexStats.status === "indexing" || indexStats.status === "scanning"}>
								{t("settings.codebaseIndex.actions.start").toString() || "开始索引"}
							</VSCodeButton>

							<VSCodeButton
								onClick={handleRefreshIndex}
								disabled={indexStats.status === "indexing" || indexStats.status === "scanning"}>
								{t("settings.codebaseIndex.actions.refresh").toString() || "刷新索引"}
							</VSCodeButton>

							<VSCodeButton
								appearance="secondary"
								onClick={handleClearIndex}
								disabled={indexStats.status === "indexing" || indexStats.status === "scanning"}>
								{t("settings.codebaseIndex.actions.clear").toString() || "清除索引"}
							</VSCodeButton>
						</div>
					</div>

					{/* 索引配置选项 */}
					<div style={{ marginTop: 15 }}>
						<div style={{ marginBottom: 15 }}>
							<VSCodeCheckbox
								checked={codebaseIndexAutoStart}
								onChange={(e: any) => {
									setCodebaseIndexAutoStart(e.target.checked)
									vscode.postMessage({
										type: "codebaseSearch",
										action: "updateSettings",
										settings: {
											autoIndexOnStartup: e.target.checked,
										},
									})
								}}>
								<span style={{ fontWeight: "500" }}>
									{t("settings.codebaseIndex.autoStart.title").toString() || "启动时自动索引"}
								</span>
							</VSCodeCheckbox>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								{t("settings.codebaseIndex.autoStart.description").toString() ||
									"编辑器启动时自动开始索引"}
							</p>
						</div>

						<div style={{ marginBottom: 15 }}>
							<VSCodeCheckbox
								checked={codebaseIndexIncludeTests}
								onChange={(e: any) => {
									setCodebaseIndexIncludeTests(e.target.checked)
									vscode.postMessage({
										type: "codebaseSearch",
										action: "updateSettings",
										settings: {
											includeTests: e.target.checked,
										},
									})
								}}>
								<span style={{ fontWeight: "500" }}>
									{t("settings.codebaseIndex.includeTests.title").toString() || "索引测试文件"}
								</span>
							</VSCodeCheckbox>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								{t("settings.codebaseIndex.includeTests.description").toString() || "是否索引测试文件"}
							</p>
						</div>

						<div style={{ marginBottom: 15 }}>
							<label style={{ display: "block", marginBottom: 5, fontWeight: "500" }}>
								{t("settings.codebaseIndex.excludePaths.title").toString() || "排除路径"}
							</label>
							<VSCodeTextField
								value={codebaseIndexExcludePaths}
								onInput={(e: any) => {
									setCodebaseIndexExcludePaths(e.target.value)
									vscode.postMessage({
										type: "codebaseSearch",
										action: "updateSettings",
										settings: {
											excludePaths: e.target.value,
										},
									})
								}}
								placeholder="node_modules,dist,build"
								style={{ width: "100%" }}
							/>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								{t("settings.codebaseIndex.excludePaths.description").toString() ||
									"不进行索引的路径，使用逗号分隔"}
							</p>
						</div>
					</div>
				</>
			)}
		</div>
	)
}

export default memo(CodebaseIndexSettings)
