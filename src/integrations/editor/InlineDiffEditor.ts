import * as vscode from "vscode"
import * as fs from "fs/promises"
import { createDirectoriesForFile } from "../../utils/fs"
import { arePathsEqual } from "../../utils/path"
import { formatResponse } from "../../core/prompts/responses"
import { DecorationController } from "./DecorationController"
import * as diff from "diff"
import { diagnosticsToProblemsString, getNewDiagnostics } from "../diagnostics"
import { PathUtils } from "../../services/checkpoints/CheckpointUtils"
import { EditorInterface } from "./EditorInterface"

/**
 * 内联差异编辑器，在单一编辑器窗口中显示内联差异
 */
export class InlineDiffEditor implements EditorInterface {
	editType?: "create" | "modify"
	isEditing = false
	originalContent: string | undefined
	private createdDirs: string[] = []
	private documentWasOpen = false
	private relPath?: string
	private newContent?: string
	private activeEditor?: vscode.TextEditor
	private activeLineController?: DecorationController
	private streamedLines: string[] = []
	private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []
	private readonlyDecorationType: vscode.TextEditorDecorationType
	private addedDecorationType: vscode.TextEditorDecorationType
	private changedDecorationType: vscode.TextEditorDecorationType

	constructor(private cwd: string) {
		console.log("InlineDiffEditor initialized")
		// 创建只读装饰器类型
		this.readonlyDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(128, 128, 128, 0.1)",
			cursor: "not-allowed",
		})

		// 创建添加内容的装饰器类型，使用更明显的绿色背景
		this.addedDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(155, 185, 85, 0.3)",
			isWholeLine: true,
			borderColor: "rgba(155, 185, 85, 0.7)",
			borderStyle: "solid",
			borderWidth: "0 0 0 2px",
		})

		// 创建修改内容的装饰器类型，使用更明显的蓝色背景
		this.changedDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(90, 93, 168, 0.3)",
			isWholeLine: true,
			borderColor: "rgba(90, 93, 168, 0.7)",
			borderStyle: "solid",
			borderWidth: "0 0 0 2px",
		})
		console.log("Decorations created successfully")
	}

	/**
	 * 在编辑器中显示内联差异
	 * @param editor 编辑器
	 * @param originalContent 原始内容
	 */
	private showInlineChanges(editor: vscode.TextEditor, originalContent: string) {
		console.log("showInlineChanges called")
		const document = editor.document
		const currentContent = document.getText()

		// 计算差异
		const changes = diff.diffLines(originalContent, currentContent)
		console.log(`Diff calculated, found ${changes.length} change segments`)

		// 应用装饰
		const addedRanges: vscode.Range[] = []
		const changedRanges: vscode.Range[] = []

		// 分析差异并创建范围
		let lineOffset = 0
		for (const part of changes) {
			if (part.added) {
				// 标记为添加的行
				const startLine = lineOffset
				const endLine = lineOffset + part.count!
				console.log(`Added segment from line ${startLine} to ${endLine}`)
				for (let i = startLine; i < endLine; i++) {
					// 使用整行范围而不是零宽度范围
					addedRanges.push(new vscode.Range(i, 0, i, document.lineAt(i).text.length))
				}
				lineOffset += part.count!
			} else if (part.removed) {
				// 对已移除的行不处理，因为它们在当前文档中不存在
				console.log(`Removed segment (skipped), count: ${part.count}`)
			} else {
				// 未修改的行，只更新计数
				console.log(`Unchanged segment, lines: ${part.count}`)
				lineOffset += part.count!
			}
		}

		// 尝试另一种方法计算修改的行
		lineOffset = 0
		const originalLines = originalContent.split("\n")
		const currentLines = currentContent.split("\n")

		// 计算修改的行（不是添加的，而是修改的）
		for (let i = 0; i < Math.min(originalLines.length, currentLines.length); i++) {
			if (originalLines[i] !== currentLines[i]) {
				console.log(`发现修改的行: ${i}, 原内容: ${originalLines[i]}, 新内容: ${currentLines[i]}`)
				changedRanges.push(new vscode.Range(i, 0, i, currentLines[i].length))
			}
		}

		console.log(`Applying decorations: ${addedRanges.length} added ranges, ${changedRanges.length} changed ranges`)
		// 移除现有装饰器
		editor.setDecorations(this.addedDecorationType, [])
		editor.setDecorations(this.changedDecorationType, [])

		// 应用新装饰器
		editor.setDecorations(this.addedDecorationType, addedRanges)
		editor.setDecorations(this.changedDecorationType, changedRanges)
		console.log("Decorations applied")
	}

	private async openEditor(): Promise<vscode.TextEditor> {
		if (!this.relPath) {
			throw new Error("No file path set")
		}
		const uri = vscode.Uri.file(PathUtils.normalizePath(PathUtils.joinPath(this.cwd, this.relPath)))
		console.log(`Opening editor for file: ${uri.fsPath}`)
		console.log(`Using view column: ${vscode.ViewColumn.Active} (强制使用Active而非Beside)`)

		// 尝试使用Active而不是Beside，看是否能避免分屏效果
		const editor = await vscode.window.showTextDocument(uri, {
			preview: true,
			preserveFocus: true,
			viewColumn: vscode.ViewColumn.Active, // 改为使用当前活动视图
			selection: new vscode.Range(0, 0, 0, 0), // 将光标放在开始位置
		})
		console.log(`Editor opened, viewColumn: ${editor.viewColumn}, document: ${editor.document.uri.fsPath}`)
		console.log(`打开的编辑器数量: ${vscode.window.visibleTextEditors.length}`)
		vscode.window.visibleTextEditors.forEach((e, i) => {
			console.log(`编辑器 ${i}: 文件=${e.document.uri.fsPath}, 视图=${e.viewColumn}`)
		})

		// 应用只读装饰器
		editor.setDecorations(this.readonlyDecorationType, [new vscode.Range(0, 0, editor.document.lineCount, 0)])
		console.log(`Applied readonly decorations to entire document`)

		return editor
	}

	async open(relPath: string): Promise<void> {
		this.relPath = relPath
		const fileExists = this.editType === "modify"
		const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(this.cwd, relPath))
		this.isEditing = true
		if (fileExists) {
			const existingDocument = vscode.workspace.textDocuments.find((doc) =>
				arePathsEqual(doc.uri.fsPath, absolutePath),
			)
			if (existingDocument && existingDocument.isDirty) {
				await existingDocument.save()
			}
		}

		this.preDiagnostics = vscode.languages.getDiagnostics()

		if (fileExists) {
			this.originalContent = await fs.readFile(absolutePath, "utf-8")
		} else {
			this.originalContent = ""
		}
		this.createdDirs = await createDirectoriesForFile(absolutePath)
		if (!fileExists) {
			await fs.writeFile(absolutePath, "")
		}
		this.documentWasOpen = false
		const tabs = vscode.window.tabGroups.all
			.map((tg) => tg.tabs)
			.flat()
			.filter(
				(tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, absolutePath),
			)
		for (const tab of tabs) {
			if (!tab.isDirty) {
				try {
					await vscode.window.tabGroups.close(tab)
				} catch (err) {
					console.log(`Error closing tab during open: ${err.message || err}`)
					// 忽略关闭标签页时出现的错误
				}
			}
			this.documentWasOpen = true
		}
		this.activeEditor = await this.openEditor()
		this.activeLineController = new DecorationController("activeLine", this.activeEditor)
		this.activeLineController.addLines(0, this.activeEditor.document.lineCount)
		this.scrollEditorToLine(0)
		this.streamedLines = []
	}

	async update(accumulatedContent: string, isFinal: boolean): Promise<void> {
		if (!this.relPath || !this.activeLineController) {
			throw new Error("Required values not set")
		}
		this.newContent = accumulatedContent
		const accumulatedLines = accumulatedContent.split("\n")
		if (!isFinal) {
			accumulatedLines.pop()
		}

		const editor = this.activeEditor
		const document = editor?.document
		if (!editor || !document) {
			throw new Error("User closed text editor, unable to edit file...")
		}

		const beginningOfDocument = new vscode.Position(0, 0)
		editor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

		const endLine = accumulatedLines.length
		const edit = new vscode.WorkspaceEdit()
		const rangeToReplace = new vscode.Range(0, 0, endLine + 1, 0)
		const contentToReplace = accumulatedLines.slice(0, endLine + 1).join("\n") + "\n"
		edit.replace(document.uri, rangeToReplace, contentToReplace)
		await vscode.workspace.applyEdit(edit)

		// 更新活动行
		this.activeLineController.setActiveLine(endLine)
		this.scrollEditorToLine(endLine)

		// 显示内联差异
		if (this.originalContent) {
			console.log("调用update中的showInlineChanges")
			this.showInlineChanges(editor, this.originalContent)
		}

		this.streamedLines = accumulatedLines
		if (isFinal) {
			if (this.streamedLines.length < document.lineCount) {
				const edit = new vscode.WorkspaceEdit()
				edit.delete(document.uri, new vscode.Range(this.streamedLines.length, 0, document.lineCount, 0))
				await vscode.workspace.applyEdit(edit)
			}
			const hasEmptyLastLine = this.originalContent?.endsWith("\n")
			if (hasEmptyLastLine && !accumulatedContent.endsWith("\n")) {
				accumulatedContent += "\n"
			}
			const finalEdit = new vscode.WorkspaceEdit()
			finalEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), accumulatedContent)
			await vscode.workspace.applyEdit(finalEdit)

			// 最后一次显示内联差异
			if (this.originalContent) {
				console.log("最终更新，调用showInlineChanges")
				this.showInlineChanges(editor, this.originalContent)
			}

			if (this.activeLineController) {
				this.activeLineController.clear()
			}
		}
	}

	async saveChanges(): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}> {
		if (!this.relPath || !this.newContent || !this.activeEditor) {
			return { newProblemsMessage: undefined, userEdits: undefined, finalContent: undefined }
		}
		const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(this.cwd, this.relPath))
		const updatedDocument = this.activeEditor.document
		const editedContent = updatedDocument.getText()
		if (updatedDocument.isDirty) {
			await updatedDocument.save()
		}

		await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {
			preview: false,
			preserveFocus: true,
		})

		// 清除装饰器
		this.activeEditor.setDecorations(this.addedDecorationType, [])
		this.activeEditor.setDecorations(this.changedDecorationType, [])
		this.activeEditor.setDecorations(this.readonlyDecorationType, [])

		const postDiagnostics = vscode.languages.getDiagnostics()
		const newProblems = diagnosticsToProblemsString(
			getNewDiagnostics(this.preDiagnostics, postDiagnostics),
			[vscode.DiagnosticSeverity.Error],
			this.cwd,
		)
		const newProblemsMessage =
			newProblems.length > 0 ? `\n\nNew problems detected after saving the file:\n${newProblems}` : ""

		const newContentEOL = this.newContent.includes("\r\n") ? "\r\n" : "\n"
		const normalizedEditedContent = editedContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL
		const normalizedNewContent = this.newContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL
		if (normalizedEditedContent !== normalizedNewContent) {
			const userEdits = formatResponse.createPrettyPatch(
				this.relPath.toPosix(),
				normalizedNewContent,
				normalizedEditedContent,
			)
			return { newProblemsMessage, userEdits, finalContent: normalizedEditedContent }
		} else {
			return { newProblemsMessage, userEdits: undefined, finalContent: normalizedEditedContent }
		}
	}

	async revertChanges(): Promise<void> {
		if (!this.relPath || !this.activeEditor) {
			return
		}
		const fileExists = this.editType === "modify"
		const updatedDocument = this.activeEditor.document
		const absolutePath = PathUtils.normalizePath(PathUtils.joinPath(this.cwd, this.relPath))
		if (!fileExists) {
			if (updatedDocument.isDirty) {
				await updatedDocument.save()
			}

			// 清除装饰器
			this.activeEditor.setDecorations(this.addedDecorationType, [])
			this.activeEditor.setDecorations(this.changedDecorationType, [])
			this.activeEditor.setDecorations(this.readonlyDecorationType, [])

			await fs.unlink(absolutePath)
			for (let i = this.createdDirs.length - 1; i >= 0; i--) {
				await fs.rmdir(this.createdDirs[i])
				console.log(`Directory ${this.createdDirs[i]} has been deleted.`)
			}
			console.log(`File ${absolutePath} has been deleted.`)
		} else {
			const edit = new vscode.WorkspaceEdit()
			const fullRange = new vscode.Range(
				updatedDocument.positionAt(0),
				updatedDocument.positionAt(updatedDocument.getText().length),
			)
			edit.replace(updatedDocument.uri, fullRange, this.originalContent ?? "")
			await vscode.workspace.applyEdit(edit)
			await updatedDocument.save()
			console.log(`File ${absolutePath} has been reverted to its original content.`)
			if (this.documentWasOpen) {
				await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {
					preview: false,
					preserveFocus: true,
				})
			}

			// 清除装饰器
			this.activeEditor.setDecorations(this.addedDecorationType, [])
			this.activeEditor.setDecorations(this.changedDecorationType, [])
			this.activeEditor.setDecorations(this.readonlyDecorationType, [])
		}

		await this.reset()
	}

	/**
	 * 滚动编辑器到指定行
	 */
	private scrollEditorToLine(line: number) {
		if (this.activeEditor) {
			const scrollLine = Math.max(0, line - 1)
			this.activeEditor.revealRange(
				new vscode.Range(scrollLine, 0, scrollLine, 0),
				vscode.TextEditorRevealType.InCenter,
			)
		}
	}

	/**
	 * 滚动到第一个差异处
	 */
	scrollToFirstDiff() {
		if (!this.activeEditor) {
			return
		}
		const currentContent = this.activeEditor.document.getText()
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
		let lineCount = 0
		for (const part of diffs) {
			if (part.added || part.removed) {
				this.activeEditor.revealRange(
					new vscode.Range(lineCount, 0, lineCount, 0),
					vscode.TextEditorRevealType.InCenter,
				)
				break
			} else {
				lineCount += part.count || 0
			}
		}
	}

	async reset(): Promise<void> {
		if (this.activeEditor) {
			// 清除所有装饰器
			this.activeEditor.setDecorations(this.readonlyDecorationType, [])
			this.activeEditor.setDecorations(this.addedDecorationType, [])
			this.activeEditor.setDecorations(this.changedDecorationType, [])
		}
		this.editType = undefined
		this.isEditing = false
		this.originalContent = undefined
		this.createdDirs = []
		this.documentWasOpen = false
		this.activeEditor = undefined
		this.activeLineController = undefined
		this.streamedLines = []
		this.preDiagnostics = []
	}

	// 这个方法在内联编辑器中可选实现
	async showDiff(): Promise<void> {
		console.log("showDiff called in InlineDiffEditor")
		if (!this.relPath || !this.originalContent || !this.activeEditor) {
			console.log("Cannot show diff: missing required properties", {
				hasRelPath: !!this.relPath,
				hasOriginalContent: !!this.originalContent,
				hasActiveEditor: !!this.activeEditor,
			})
			return
		}

		console.log("使用内联差异显示方式")
		// 直接使用内联差异方式，避免调用vscode.diff命令
		this.showInlineChanges(this.activeEditor, this.originalContent)

		// 确保滚动到第一个差异处，增强用户体验
		this.scrollToFirstDiff()

		console.log("内联差异显示完成")
	}
}
