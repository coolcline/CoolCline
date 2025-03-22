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

export const DIFF_VIEW_URI_SCHEME = "coolcline-diff"

export class DiffViewProvider implements EditorInterface {
	editType?: "create" | "modify"
	isEditing = false
	originalContent: string | undefined
	private createdDirs: string[] = []
	private documentWasOpen = false
	private relPath?: string
	private newContent?: string
	private activeEditor?: vscode.TextEditor
	private fadedOverlayController?: DecorationController
	private activeLineController?: DecorationController
	private streamedLines: string[] = []
	private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []
	private readonlyDecorationType: vscode.TextEditorDecorationType

	constructor(private cwd: string) {
		// 创建一个只读的装饰器类型
		this.readonlyDecorationType = vscode.window.createTextEditorDecorationType({
			// 使用半透明背景表示只读
			backgroundColor: "rgba(128, 128, 128, 0.1)",
			// 禁用光标
			cursor: "not-allowed",
		})
	}

	private async openEditor(): Promise<vscode.TextEditor> {
		if (!this.relPath) {
			throw new Error("No file path set")
		}
		const uri = vscode.Uri.file(PathUtils.normalizePath(PathUtils.joinPath(this.cwd, this.relPath)))

		// 打开编辑器但不激活它
		const editor = await vscode.window.showTextDocument(uri, {
			preview: true,
			preserveFocus: true,
			viewColumn: vscode.ViewColumn.Beside,
			selection: new vscode.Range(0, 0, 0, 0), // 将光标放在开始位置
		})

		// 应用只读装饰器
		editor.setDecorations(this.readonlyDecorationType, [new vscode.Range(0, 0, editor.document.lineCount, 0)])

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
		this.fadedOverlayController = new DecorationController("fadedOverlay", this.activeEditor)
		this.activeLineController = new DecorationController("activeLine", this.activeEditor)
		this.fadedOverlayController.addLines(0, this.activeEditor.document.lineCount)
		this.scrollEditorToLine(0)
		this.streamedLines = []
	}

	async update(accumulatedContent: string, isFinal: boolean) {
		if (!this.relPath || !this.activeLineController || !this.fadedOverlayController) {
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
		this.activeLineController.setActiveLine(endLine)
		this.fadedOverlayController.updateOverlayAfterLine(endLine, document.lineCount)
		this.scrollEditorToLine(endLine)

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
			this.fadedOverlayController.clear()
			this.activeLineController.clear()
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
		await this.closeAllDiffViews()

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
			await this.closeAllDiffViews()
			await fs.unlink(absolutePath)
			for (let i = this.createdDirs.length - 1; i >= 0; i--) {
				await fs.rmdir(this.createdDirs[i])
			}
		} else {
			const edit = new vscode.WorkspaceEdit()
			const fullRange = new vscode.Range(
				updatedDocument.positionAt(0),
				updatedDocument.positionAt(updatedDocument.getText().length),
			)
			edit.replace(updatedDocument.uri, fullRange, this.originalContent ?? "")
			await vscode.workspace.applyEdit(edit)
			await updatedDocument.save()
			if (this.documentWasOpen) {
				await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {
					preview: false,
					preserveFocus: true,
				})
			}
			await this.closeAllDiffViews()
		}

		await this.reset()
	}

	private async closeAllDiffViews() {
		try {
			const tabs = vscode.window.tabGroups.all
				.flatMap((tg) => tg.tabs)
				.filter(
					(tab) =>
						tab.input instanceof vscode.TabInputTextDiff &&
						tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME,
				)
			for (const tab of tabs) {
				if (!tab.isDirty) {
					try {
						await vscode.window.tabGroups.close(tab)
					} catch (err) {
						console.log(`Error closing diff tab: ${err.message || err}`)
						// 忽略关闭标签页时出现的错误，通常是由于标签页已被关闭
					}
				}
			}
		} catch (err) {
			console.log(`Error in closeAllDiffViews: ${err.message || err}`)
			// 忽略 tabGroups 相关的任何错误，确保流程继续
		}
	}

	private scrollEditorToLine(line: number) {
		if (this.activeEditor) {
			const scrollLine = line + 4
			this.activeEditor.revealRange(
				new vscode.Range(scrollLine, 0, scrollLine, 0),
				vscode.TextEditorRevealType.InCenter,
			)
		}
	}

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
				return
			}
			if (!part.removed) {
				lineCount += part.count || 0
			}
		}
	}

	async reset() {
		if (this.activeEditor) {
			this.activeEditor.setDecorations(this.readonlyDecorationType, [])
		}
		this.editType = undefined
		this.isEditing = false
		this.originalContent = undefined
		this.createdDirs = []
		this.documentWasOpen = false
		this.activeEditor = undefined
		this.fadedOverlayController = undefined
		this.activeLineController = undefined
		this.streamedLines = []
		this.preDiagnostics = []
	}

	async showDiff(): Promise<void> {
		if (!this.relPath || !this.originalContent || !this.activeEditor) {
			return
		}
		const uri = this.activeEditor.document.uri
		const fileName = PathUtils.basename(uri.fsPath)
		await vscode.commands.executeCommand(
			"vscode.diff",
			vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
				query: Buffer.from(this.originalContent).toString("base64"),
			}),
			uri,
			`${fileName}: ${this.editType === "modify" ? "Original ↔ CoolCline's Changes" : "New File"} (Editable)`,
			{
				preview: true,
				preserveFocus: true,
			},
		)
	}
}
