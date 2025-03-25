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

interface EditableMessageProps {
	message: CoolClineMessage
	isStreaming: boolean
	commitHash?: string
}

export const EditableMessage: React.FC<EditableMessageProps> = ({ message, isStreaming, commitHash }) => {
	const [isEditing, setIsEditing] = useState(false)
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

	// 当进入编辑模式时，聚焦文本框
	useEffect(() => {
		if (isEditing) {
			setTimeout(() => {
				const textField = document.querySelector("textarea") as HTMLElement
				if (textField) {
					textField.focus()
				}
			}, 0)
		}
	}, [isEditing])

	// 处理点击外部区域
	useEffect(() => {
		if (!isEditing) return

		const handleClickOutside = (event: MouseEvent) => {
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

	// 重新发送消息并尝试恢复checkpoint
	const handleSend = () => {
		if (editedText.trim() || selectedImages.length > 0) {
			// 1. 先发送新任务消息
			// vscode.postMessage({
			//   type: "askResponse",
			//   askResponse: "messageResponse",
			//   text: editedText.trim(),
			//   images: selectedImages
			// });

			// 2. 然后再发送恢复消息
			vscode.postMessage({
				type: "checkpointRestore",
				payload: {
					ts: message.ts,
					commitHash: commitHash || "", // 使用传入的commitHash，如果没有则使用空字符串
					mode: "restore_this_and_after_change",
					newUserMessage: {
						text: editedText.trim(),
						images: selectedImages,
					},
				},
			})
		}
		setIsEditing(false)
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
			)}

			{message.images && message.images.length > 0 && (
				<Thumbnails images={message.images} style={{ marginTop: "8px" }} />
			)}
		</div>
	)
}
