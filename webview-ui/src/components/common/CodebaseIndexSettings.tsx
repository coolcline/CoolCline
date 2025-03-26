import { VSCodeButton, VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useState, useEffect, useCallback, memo } from "react"
import { useTranslation } from "react-i18next"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { ConfirmDialog } from "../ui"

/**
 * 代码库索引状态接口
 */
interface IndexStats {
	filesCount: number
	symbolsCount: number
	keywordsCount: number
	lastIndexed: string | null
	status: string
}

/**
 * 索引进度接口
 */
interface IndexProgress {
	completed: number
	total: number
	status: string
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
		codebaseIndexLoading, // 添加loading状态
	} = useExtensionState()

	// 初始状态
	const [indexStats, setIndexStats] = useState<IndexStats>({
		filesCount: 0,
		symbolsCount: 0,
		keywordsCount: 0,
		lastIndexed: null,
		status: "idle",
	})

	const [indexProgress, setIndexProgress] = useState<IndexProgress>({
		completed: 0,
		total: 0,
		status: "idle",
	})

	// 确认对话框状态
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

	// 本地操作跟踪状态 - 用于按钮立即反馈
	const [isPendingAction, setIsPendingAction] = useState(false)
	const [pendingActionType, setPendingActionType] = useState<string | null>(null)

	// 添加一个状态来跟踪待定操作开始时间
	const [pendingActionStartTime, setPendingActionStartTime] = useState<number | null>(null)

	// 获取索引状态
	const fetchIndexStatus = useCallback(() => {
		vscode.postMessage({
			type: "codebaseSearch",
			action: "getStats",
		})
	}, [])

	// 处理后端消息
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data

			// 处理索引状态更新消息
			if (message.type === "codebaseIndexStats") {
				// 清除待定操作标记
				setIsPendingAction(false)
				setPendingActionType(null)

				if (message.stats) {
					setIndexStats({
						filesCount: message.stats.filesCount,
						symbolsCount: message.stats.symbolsCount,
						keywordsCount: message.stats.keywordsCount,
						lastIndexed: message.stats.lastIndexed
							? new Date(message.stats.lastIndexed).toLocaleString()
							: null,
						status: message.stats.status,
					})
				}

				if (message.progress) {
					setIndexProgress({
						total: message.progress.total,
						completed: message.progress.completed,
						status: message.progress.status,
					})
				}

				if (message.error) {
					console.error("索引错误:", message.error)
				}
			}

			// 处理扩展状态更新
			if (message.type === "extensionState") {
				if (message.state) {
					if (message.state.codebaseIndexEnabled !== undefined) {
						setCodebaseIndexEnabled(message.state.codebaseIndexEnabled)
					}
					if (message.state.codebaseIndexAutoStart !== undefined) {
						setCodebaseIndexAutoStart(message.state.codebaseIndexAutoStart)
					}
					if (message.state.codebaseIndexExcludePaths !== undefined) {
						setCodebaseIndexExcludePaths(message.state.codebaseIndexExcludePaths)
					}
					if (message.state.codebaseIndexIncludeTests !== undefined) {
						setCodebaseIndexIncludeTests(message.state.codebaseIndexIncludeTests)
					}
				}
			}
		}

		window.addEventListener("message", handleMessage)

		// 初始获取索引状态
		fetchIndexStatus()

		// 定期获取索引状态更新 - 但不要在暂停状态下频繁获取
		const intervalId = setInterval(() => {
			// 如果当前状态是暂停状态，并且不是因为刚点击暂停而处于待定状态，则减少更新频率
			if (indexProgress.status === "paused" && !isPendingAction) {
				// 在暂停状态下，我们仍然需要偶尔检查，因为暂停可能在其他地方被恢复
				// 但频率可以大大降低，例如每10秒检查一次
				const now = Date.now()
				if (now % 10000 < 2000) {
					// 每10秒左右检查一次
					fetchIndexStatus()
				}
			} else {
				fetchIndexStatus()
			}
		}, 2000)

		// 当索引状态为特定状态时，使用更短的间隔获取进度
		const fastUpdateIntervalId = setInterval(() => {
			if (
				(indexProgress.status === "indexing" || indexProgress.status === "scanning") &&
				!isPendingAction // 避免刚暂停时继续频繁更新
			) {
				fetchIndexStatus()
			} else if (isPendingAction) {
				// 如果有待处理操作，也要频繁更新，但只有最多10秒
				const pendingTimeLimit = 10000 // 10秒
				const now = Date.now()
				if (pendingActionStartTime && now - pendingActionStartTime < pendingTimeLimit) {
					fetchIndexStatus()
				}
			}
		}, 500)

		return () => {
			window.removeEventListener("message", handleMessage)
			clearInterval(intervalId)
			clearInterval(fastUpdateIntervalId)
		}
	}, [fetchIndexStatus, indexProgress.status, isPendingAction, pendingActionStartTime])

	// 开始索引
	const handleStartIndex = () => {
		// 立即更新UI状态
		setIsPendingAction(true)
		setPendingActionType("start")
		setPendingActionStartTime(Date.now())

		// 更新进度状态
		setIndexProgress({
			...indexProgress,
			status: "scanning",
		})

		// 同步更新统计数据状态，但保留原有统计数字
		setIndexStats({
			...indexStats,
			status: "scanning",
		})

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
		// 立即更新UI状态
		setIsPendingAction(true)
		setPendingActionType("refresh")
		setPendingActionStartTime(Date.now())

		// 更新进度状态
		setIndexProgress({
			...indexProgress,
			status: "scanning",
		})

		// 同步更新统计数据状态，但保留原有统计数字
		setIndexStats({
			...indexStats,
			status: "scanning",
		})

		vscode.postMessage({
			type: "codebaseSearch",
			action: "refreshIndex",
			settings: {
				excludePaths: codebaseIndexExcludePaths,
				includeTests: codebaseIndexIncludeTests,
			},
		})
	}

	// 暂停索引
	const handlePauseIndexing = () => {
		// 立即更新UI状态
		setIsPendingAction(true)
		setPendingActionType("pause")
		setPendingActionStartTime(Date.now())

		// 更新进度状态为暂停
		setIndexProgress({
			...indexProgress,
			status: "paused",
		})

		// 同步更新统计数据状态，但保留原有统计数字
		setIndexStats({
			...indexStats,
			status: "paused",
		})

		vscode.postMessage({
			type: "codebaseSearch",
			action: "pauseIndexing",
		})
	}

	// 恢复索引
	const handleResumeIndexing = () => {
		// 立即更新UI状态
		setIsPendingAction(true)
		setPendingActionType("resume")
		setPendingActionStartTime(Date.now())

		// 更新进度状态为索引中
		setIndexProgress({
			...indexProgress,
			status: "indexing",
		})

		// 同步更新统计数据状态，但保留原有统计数字
		setIndexStats({
			...indexStats,
			status: "indexing",
		})

		vscode.postMessage({
			type: "codebaseSearch",
			action: "resumeIndexing",
		})
	}

	// 停止索引 (向后兼容)
	const handleStopIndexing = () => {
		// 使用新的暂停功能
		handlePauseIndexing()
	}

	// 清除索引 - 打开确认对话框
	const handleClearIndex = () => {
		setConfirmDialogOpen(true)
	}

	// 确认清除索引
	const handleConfirmClearIndex = () => {
		// 立即更新UI状态
		setIsPendingAction(true)
		setPendingActionType("clear")

		// 同时清空进度和统计数据
		setIndexProgress({
			...indexProgress,
			status: "idle",
			completed: 0,
			total: 0,
		})

		// 重要：同时清空统计数据
		setIndexStats({
			...indexStats,
			filesCount: 0,
			symbolsCount: 0,
			keywordsCount: 0,
			status: "idle",
		})

		vscode.postMessage({
			type: "codebaseSearch",
			action: "clearIndex",
		})
		setConfirmDialogOpen(false)
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

	// 根据索引状态确定按钮类型和文本
	const getIndexActionButton = () => {
		const status = indexProgress.status

		if (status === "indexing" || status === "scanning") {
			return (
				<VSCodeButton
					className={`codicon codicon-debug-pause`}
					style={{ display: "flex", alignItems: "center", padding: "0 8px" }}
					onClick={handlePauseIndexing}>
					{t("settings.codebaseIndex.actions.pause").toString() || "暂停索引"}
				</VSCodeButton>
			)
		} else if (status === "paused") {
			return (
				<VSCodeButton
					className={`codicon codicon-debug-continue`}
					style={{ display: "flex", alignItems: "center", padding: "0 8px" }}
					onClick={handleResumeIndexing}>
					{t("settings.codebaseIndex.actions.resume").toString() || "继续索引"}
				</VSCodeButton>
			)
		} else {
			return (
				<VSCodeButton
					className={`codicon codicon-debug-start`}
					style={{ display: "flex", alignItems: "center", padding: "0 8px" }}
					onClick={handleStartIndex}>
					{t("settings.codebaseIndex.actions.start").toString() || "开始索引"}
				</VSCodeButton>
			)
		}
	}

	// 如果正在加载中，显示加载提示
	if (codebaseIndexLoading) {
		return (
			<div>
				<h2 style={{ margin: "0 0 15px 0", fontWeight: "500" }}>
					{t("settings.codebaseIndex.title").toString() || "代码库搜索索引"}
				</h2>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
					<div className="codicon codicon-loading codicon-modifier-spin" style={{ marginRight: "8px" }}></div>
					<span>loading...</span>
				</div>
			</div>
		)
	}

	return (
		<div>
			<h2 style={{ margin: "0 0 15px 0", fontWeight: "500" }}>
				{t("settings.codebaseIndex.title").toString() || "代码库搜索索引"}
			</h2>

			{/* 确认对话框 */}
			<ConfirmDialog
				isOpen={confirmDialogOpen}
				onClose={() => setConfirmDialogOpen(false)}
				onConfirm={handleConfirmClearIndex}
				title={t("settings.codebaseIndex.deleteConfirmTitle").toString() || "确认清除索引"}
				description={
					t("settings.codebaseIndex.deleteConfirm").toString() || "确定要删除索引吗？这将移除所有索引数据。"
				}
			/>

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
											case "paused":
												return t("settings.codebaseIndex.status.paused").toString() || "已暂停"
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

						{/* 进度条 - 移除条件显示逻辑，始终显示进度条 */}
						<div style={{ margin: "10px 0" }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									fontSize: 13,
									marginBottom: 5,
								}}>
								<span>{t("settings.codebaseIndex.status.progress").toString() || "进度"}</span>
								<span>
									{indexProgress.status === "scanning"
										? t("settings.codebaseIndex.status.scanning").toString() || "正在扫描..."
										: indexProgress.status === "indexing"
											? indexProgress.total > 0
												? `${Math.floor((indexProgress.completed / indexProgress.total) * 100)}% (${indexProgress.completed}/${indexProgress.total})`
												: t("settings.codebaseIndex.status.indexing").toString() ||
													"正在索引..."
											: indexProgress.status === "paused"
												? t("settings.codebaseIndex.status.paused").toString() || "已暂停"
												: indexProgress.status === "error"
													? t("settings.codebaseIndex.status.error").toString() || "索引错误"
													: indexProgress.status === "completed"
														? "100% - " +
															(t("settings.codebaseIndex.status.completed").toString() ||
																"索引完成")
														: t("settings.codebaseIndex.status.idle").toString() || "空闲"}
								</span>
							</div>
							<div
								style={{
									width: "100%",
									height: 8,
									backgroundColor: "var(--vscode-list-hoverBackground)",
									borderRadius: 4,
									overflow: "hidden",
								}}>
								{(() => {
									// 计算进度条宽度
									let width = "0%"
									let color = "var(--vscode-button-background)" // 默认蓝色

									if (indexProgress.status === "completed") {
										width = "100%"
										color = "var(--vscode-testing-iconPassed)" // 绿色
									} else if (indexProgress.status === "paused" && indexProgress.total > 0) {
										const percentage = Math.floor(
											(indexProgress.completed / indexProgress.total) * 100,
										)
										width = `${percentage}%`
										color = "var(--vscode-descriptionForeground)" // 暂停为灰色
									} else if (indexProgress.status === "indexing" && indexProgress.total > 0) {
										const percentage = Math.floor(
											(indexProgress.completed / indexProgress.total) * 100,
										)
										width = `${percentage}%`
									} else if (indexProgress.status === "scanning") {
										width = "5%" // 扫描中时显示一点进度
									} else if (indexProgress.status === "error") {
										width = "100%"
										color = "var(--vscode-inputValidation-errorBorder)" // 错误时为红色
									}

									return (
										<div
											style={{
												height: "100%",
												width: width,
												backgroundColor: color,
												transition: "width 0.3s ease",
											}}></div>
									)
								})()}
							</div>
						</div>

						{/* 操作按钮 */}
						<div style={{ display: "flex", gap: 10, marginTop: 15 }}>
							{getIndexActionButton()}
							<VSCodeButton
								className={`codicon codicon-trash`}
								style={{ display: "flex", alignItems: "center", padding: "0 8px" }}
								appearance="secondary"
								onClick={handleClearIndex}
								disabled={indexProgress.status === "indexing" || indexProgress.status === "scanning"}>
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
								placeholder="node_modules,dist,build,.git"
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
