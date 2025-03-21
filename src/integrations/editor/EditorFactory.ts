import * as vscode from "vscode"
import { DiffViewProvider } from "./DiffViewProvider"
import { InlineDiffEditor } from "./InlineDiffEditor"
import { EditorInterface } from "./EditorInterface"
import { CoolClineProvider } from "../../core/webview/CoolClineProvider"

/**
 * 编辑器类型枚举
 */
export enum EditorType {
	/** 标准差异视图 */
	DIFF_VIEW = "diffView",
	/** 内联差异编辑器 */
	INLINE_DIFF = "inlineDiff",
}

/**
 * 编辑器工厂类，负责创建编辑器实例
 */
export class EditorFactory {
	/**
	 * 创建编辑器实例
	 * @param type 编辑器类型
	 * @param cwd 当前工作目录
	 * @returns 编辑器实例
	 */
	static createEditor(type: EditorType, cwd: string): EditorInterface {
		switch (type) {
			case EditorType.DIFF_VIEW:
				return new DiffViewProvider(cwd)
			case EditorType.INLINE_DIFF:
				return new InlineDiffEditor(cwd)
			default:
				// 默认返回内联差异编辑器
				return new InlineDiffEditor(cwd)
		}
	}

	/**
	 * 获取首选编辑器类型
	 * @returns 编辑器类型
	 */
	static getPreferredEditorType(): EditorType {
		// 由于 getGlobalState 是异步的，但我们需要同步返回
		// 所以默认返回内联差异编辑器
		// 如果有需要，可以考虑将此方法改为异步方法
		return EditorType.INLINE_DIFF
	}

	/**
	 * 异步获取首选编辑器类型
	 * @returns Promise<编辑器类型>
	 */
	static async getPreferredEditorTypeAsync(): Promise<EditorType> {
		// 尝试从 CoolClineProvider 获取编辑器类型
		const provider = CoolClineProvider.getVisibleInstance()
		if (provider) {
			try {
				const editorType = await provider.getGlobalState("editorType")
				if (editorType) {
					return editorType as EditorType
				}
			} catch (error) {
				console.error("获取编辑器类型失败:", error)
			}
		}

		// 默认返回内联差异编辑器
		return EditorType.INLINE_DIFF
	}

	/**
	 * 设置首选编辑器类型
	 * @param type 编辑器类型
	 * @returns Promise
	 */
	static async setPreferredEditorType(type: EditorType): Promise<void> {
		// 更新 CoolClineProvider 中的编辑器类型
		const provider = CoolClineProvider.getVisibleInstance()
		if (provider) {
			await provider.updateGlobalState("editorType", type)
		}
	}
}
