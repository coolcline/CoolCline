import React, { useState, useEffect, useRef, useMemo } from "react"
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import { CoolClineMessage } from "../../../../src/shared/ExtensionMessage"
import { highlightMentions } from "./TaskHeader"
import Thumbnails from "../common/Thumbnails"
import ChatTextArea from "./ChatTextArea"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { normalizeApiConfiguration } from "../settings/ApiOptions"
import { MAX_IMAGES_PER_MESSAGE } from "./ChatView"
import { ContextMenuOptionType } from "../../utils/context-mentions"
import { mentionRegex, mentionRegexGlobal } from "../../../../src/shared/context-mentions"

interface EditableMessageProps {
	message: CoolClineMessage
	isStreaming: boolean
	commitHash?: string
}

export const EditableMessage: React.FC<EditableMessageProps> = ({ message, isStreaming, commitHash }) => {
	const [isEditing, setIsEditing] = useState(false)
	const [pendingMessage, setPendingMessage] = useState<{ text: string; images: string[] } | null>(null)
	const [editedText, setEditedText] = useState(message.text || "")
	const [showRestoreDialog, setShowRestoreDialog] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>(message.images || [])
	const containerRef = useRef<HTMLDivElement>(null)

	// 获取ExtensionState上下文信息
	const { apiConfiguration } = useExtensionState()

	// 检查模型是否支持图像
	const { selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	// 决定是否禁用图像选择功能
	const shouldDisableImages = !selectedModelInfo.supportsImages || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	// 新增：提取消息中的mentions
	const extractedMentions = useMemo(() => {
		const mentions: Array<{ type: ContextMenuOptionType; value: string }> = []
		const matches = message.text?.match(mentionRegexGlobal) || []

		matches.forEach((match) => {
			// 移除@符号
			const value = match.substring(1)
			// 根据值确定类型
			let type = ContextMenuOptionType.File
			if (value === "problems") {
				type = ContextMenuOptionType.Problems
			} else if (value === "codebase") {
				type = ContextMenuOptionType.Codebase
			} else if (value === "git-changes" || /^[a-f0-9]{7,40}$/.test(value)) {
				type = ContextMenuOptionType.Git
			} else if (value.startsWith("/")) {
				type = value.endsWith("/") ? ContextMenuOptionType.Folder : ContextMenuOptionType.File
			}

			mentions.push({ type, value })
		})

		return mentions
	}, [message.text])

	// 新增：处理点击mention打开相应内容
	const handleOpenMention = (mention: { type: ContextMenuOptionType; value: string }) => {
		vscode.postMessage({
			type: "openMention",
			text: mention.value,
		})
	}

	// 当进入编辑模式时，聚焦文本框并将光标移到末尾
	useEffect(() => {
		if (isEditing) {
			setTimeout(() => {
				const textField = document.querySelector("textarea") as HTMLTextAreaElement
				if (textField) {
					textField.focus()
					// 将光标移到内容末尾
					const textLength = textField.value.length
					textField.setSelectionRange(textLength, textLength)
				}
			}, 0)
		}
	}, [isEditing])

	// 处理点击外部区域
	useEffect(() => {
		if (!isEditing) return

		const handleClickOutside = (event: MouseEvent) => {
			// 检查是否点击了context menu相关元素
			const isContextMenuOrButton =
				(event.target as Element)?.closest(".context-menu") ||
				(event.target as Element)?.closest(".mention-context-button") ||
				(event.target as Element)?.closest(".mention-context-textarea-highlight") ||
				// 检查是否点击了@按钮或已有的上下文标签
				String((event.target as Element)?.className || "").includes("codicon")

			if (isContextMenuOrButton) {
				return // 不处理上下文菜单相关的点击
			}

			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsEditing(false)
				setEditedText(message.text || "")
				setSelectedImages(message.images || [])
			}
		}

		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [isEditing, message.text, message.images])

	// 选择图片
	const handleSelectImages = () => {
		vscode.postMessage({ type: "selectImages" })
	}

	// 监听restore完成消息
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data.type === "checkpointRestoreComplete" && pendingMessage) {
				// 发送待处理的消息
				vscode.postMessage({
					type: "askResponse",
					askResponse: "messageResponse",
					text: pendingMessage.text,
					images: pendingMessage.images,
				})
				setPendingMessage(null)
			}
		}
		window.addEventListener("message", listener)
		return () => window.removeEventListener("message", listener)
	}, [pendingMessage])

	// 重新发送消息并尝试恢复checkpoint
	const handleSend = () => {
		if (editedText.trim() || selectedImages.length > 0) {
			// 保存待发送的消息
			setPendingMessage({
				text: editedText.trim(),
				images: selectedImages,
			})

			// 发送恢复消息
			vscode.postMessage({
				type: "checkpointRestore",
				payload: {
					ts: message.ts,
					commitHash: commitHash || "",
					mode: "restore_this_and_after_change",
				},
			})
		}
		setIsEditing(false)
		setEditedText("")
		setShowRestoreDialog(false)
	}

	// 准备重新发送，显示确认对话框
	const handlePrepareResend = () => {
		setShowRestoreDialog(true)
	}

	// 发送消息处理函数
	const handleSendMessage = (text: string, images: string[]) => {
		handlePrepareResend()
	}

	// 取消编辑
	const handleCancel = () => {
		setEditedText(message.text || "")
		setSelectedImages(message.images || [])
		setIsEditing(false)
		setShowRestoreDialog(false)
	}

	// 删除消息
	const handleDelete = (e: React.MouseEvent) => {
		e.stopPropagation()
		vscode.postMessage({
			type: "deleteMessage",
			value: message.ts,
		})
	}

	return (
		<div
			ref={containerRef}
			style={{
				backgroundColor: "var(--vscode-badge-background)",
				color: "var(--vscode-badge-foreground)",
				borderRadius: "3px",
				padding: "7px",
				whiteSpace: "pre-line",
				wordWrap: "break-word",
				position: "relative",
			}}
			onClick={() => !isEditing && !isStreaming && setIsEditing(true)}>
			{isEditing ? (
				<>
					<ChatTextArea
						inputValue={editedText}
						setInputValue={setEditedText}
						textAreaDisabled={false}
						placeholderText="Edit..."
						selectedImages={selectedImages}
						setSelectedImages={setSelectedImages}
						onSend={() => handleSendMessage(editedText, selectedImages)}
						onSelectImages={handleSelectImages}
						shouldDisableImages={shouldDisableImages}
						onHeightChange={() => {}}
						mode="default"
						setMode={() => {}}
					/>

					{showRestoreDialog && (
						<div
							style={{
								position: "fixed",
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
								backgroundColor: "rgba(0, 0, 0, 0.5)",
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								zIndex: 1000,
							}}>
							<div
								style={{
									backgroundColor: "var(--vscode-editor-background)",
									border: "1px solid var(--vscode-editorGroup-border)",
									padding: "16px",
									borderRadius: "3px",
									maxWidth: "min(calc(100vw - 10vw), 400px)",
									width: "100%",
								}}>
								<h3 style={{ margin: "0 0 12px 0", color: "var(--vscode-foreground)" }}>Confirm</h3>
								<p
									style={{
										margin: "0 0 16px 0",
										color: "var(--vscode-foreground)",
										fontSize: "13px",
										lineHeight: "1.4",
									}}>
									This operation will restore to the state of this message and delete all related
									messages after it. This operation cannot be undone. Are you sure you want to
									continue?
								</p>
								<VSCodeDivider />
								<div
									style={{
										display: "flex",
										justifyContent: "flex-end",
										gap: "8px",
										marginTop: "16px",
									}}>
									<VSCodeButton appearance="secondary" onClick={handleCancel}>
										Cancel
									</VSCodeButton>
									<VSCodeButton onClick={handleSend}>Confirm</VSCodeButton>
								</div>
							</div>
						</div>
					)}
				</>
			) : (
				<>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
							gap: "10px",
						}}>
						<span style={{ display: "block", flexGrow: 1, padding: "4px" }}>
							{highlightMentions(message.text || "")}
						</span>
						<div style={{ display: "flex", gap: "4px" }}>
							<VSCodeButton
								appearance="icon"
								style={{
									padding: "3px",
									flexShrink: 0,
									height: "24px",
									marginTop: "-3px",
									marginBottom: "-3px",
								}}
								disabled={isStreaming}
								onClick={(e) => {
									e.stopPropagation()
									setIsEditing(true)
								}}>
								<span className="codicon codicon-edit"></span>
							</VSCodeButton>
							{/* <VSCodeButton
              appearance="icon"
              style={{
                padding: "3px",
                flexShrink: 0,
                height: "24px",
                marginTop: "-3px",
                marginBottom: "-3px",
                marginRight: "-6px",
              }}
              disabled={isStreaming}
              onClick={handleDelete}>
              <span className="codicon codicon-trash"></span>
            </VSCodeButton> */}
						</div>
					</div>

					{/* 新增：显示消息中的mentions */}
					{extractedMentions.length > 0 && (
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: "4px",
								padding: "4px 4px 0 4px",
							}}>
							{extractedMentions.map((mention, index) => (
								<div
									key={`${mention.type}-${mention.value}-${index}`}
									style={{
										display: "flex",
										alignItems: "center",
										backgroundColor: "var(--vscode-editor-background)",
										color: "var(--vscode-foreground)",
										borderRadius: "3px",
										padding: "2px 6px",
										fontSize: "12px",
										position: "relative",
										transition: "all 0.2s ease",
										cursor: "pointer",
									}}
									title={`点击打开: ${mention.value}`}
									onClick={(e) => {
										e.stopPropagation()
										handleOpenMention(mention)
									}}>
									<i
										className={`codicon codicon-${
											mention.type === ContextMenuOptionType.File
												? "file"
												: mention.type === ContextMenuOptionType.Folder
													? "folder"
													: mention.type === ContextMenuOptionType.Problems
														? "warning"
														: mention.type === ContextMenuOptionType.Git
															? "git-commit"
															: mention.type === ContextMenuOptionType.Codebase
																? "search"
																: "file"
										}`}
										style={{
											marginRight: "4px",
											fontSize: "12px",
										}}
									/>
									<span>{mention.value}</span>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{message.images && message.images.length > 0 && (
				<Thumbnails images={message.images} style={{ marginTop: "8px" }} />
			)}
		</div>
	)
}
