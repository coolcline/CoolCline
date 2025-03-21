import * as vscode from "vscode"

/**
 * 编辑器接口，定义了编辑器必须实现的方法
 */
export interface EditorInterface {
	/** 编辑类型：创建新文件或修改现有文件 */
	editType?: "create" | "modify"
	/** 是否正在编辑中 */
	isEditing: boolean
	/** 原始内容 */
	originalContent?: string

	/**
	 * 打开文件进行编辑
	 * @param relPath 相对于工作目录的文件路径
	 */
	open(relPath: string): Promise<void>

	/**
	 * 更新编辑器内容
	 * @param accumulatedContent 累积的内容
	 * @param isFinal 是否是最终内容
	 */
	update(accumulatedContent: string, isFinal: boolean): Promise<void>

	/**
	 * 保存更改
	 * @returns 新问题消息，用户编辑，最终内容
	 */
	saveChanges(): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}>

	/**
	 * 恢复更改
	 */
	revertChanges(): Promise<void>

	/**
	 * 重置编辑器状态
	 */
	reset(): Promise<void>

	/**
	 * 显示差异视图
	 */
	showDiff?(): Promise<void>

	/**
	 * 滚动到第一个差异处
	 */
	scrollToFirstDiff?(): void
}
