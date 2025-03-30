import { SimpleGit, simpleGit } from "simple-git"
import * as vscode from "vscode"
import { CheckpointTracker } from "./CheckpointTracker"
import { CheckpointMigration } from "./CheckpointMigration"
import { GitOperations } from "./GitOperations"
import { getWorkingDirectory, PathUtils, getShadowGitPath, hashWorkingDir } from "./CheckpointUtils"
import { StorageProvider, CheckpointDiff, CheckpointServiceOptions } from "./types"

/**
 * Checkpoint 恢复模式
 */
// export type RestoreMode = "files" | "messages" | "files_and_messages"
export type DiffMode = "full" | "checkpoint" | "cross_task"

export interface CrossTaskDiffOptions {
	fromTaskId: string
	fromHash: string
	toTaskId: string
	toHash: string
}

/**
 * Checkpoint 服务类
 * 作为唯一的对外接口，整合所有 checkpoint 相关功能
 */
export class CheckpointService {
	private static readonly USER_NAME = "CoolCline"
	private static readonly USER_EMAIL = "support@coolcline.com"
	private static readonly CLEANUP_THRESHOLD = 50 // 检查点数量阈值
	private static readonly MAX_DIFF_SIZE = 1024 * 1024 * 10 // 10MB

	private readonly outputChannel: vscode.OutputChannel
	private readonly tracker: CheckpointTracker
	private readonly gitOps: GitOperations
	private git: SimpleGit
	private readonly vscodeGlobalStorageCoolClinePath: string
	private readonly userProjectPath: string
	private readonly _taskId: string
	private readonly log: (message: string) => void
	private gitPath?: string
	private isInitialized = false // 添加初始化状态标志

	constructor(options: CheckpointServiceOptions) {
		this.vscodeGlobalStorageCoolClinePath = PathUtils.normalizePath(
			options.provider?.context.globalStorageUri.fsPath ?? "",
		)
		this.userProjectPath = PathUtils.normalizePath(options.userProjectPath)
		this.git = options.git || simpleGit(this.vscodeGlobalStorageCoolClinePath)
		this._taskId = options.taskId
		this.log = options.log || console.log
		this.outputChannel = vscode.window.createOutputChannel("Checkpoint Service")
		this.tracker = new CheckpointTracker(this.vscodeGlobalStorageCoolClinePath, this._taskId, this.userProjectPath)
		this.gitOps = new GitOperations(this.vscodeGlobalStorageCoolClinePath, this.userProjectPath)
	}

	get taskId(): string {
		return this._taskId
	}

	/**
	 * 创建 CheckpointService 实例
	 * 核心职责：
	 * 1. 获取用户项目路径（通过 getWorkingDirectory）
	 * 2. 规范化全局存储路径（使用 PathUtils）
	 * 3. 构造服务实例（依赖注入）
	 */
	public static async create(taskId: string, provider: StorageProvider): Promise<CheckpointService> {
		const userProjectPath = await getWorkingDirectory()
		return new CheckpointService({
			userProjectPath: PathUtils.normalizePath(userProjectPath),
			vscodeGlobalStorageCoolClinePath: PathUtils.normalizePath(provider.context.globalStorageUri.fsPath),
			taskId,
			provider,
			log: console.log,
		})
	}

	/**
	 * 初始化 checkpoint 服务
	 * CoolCline.ts 中先调用 create，之后才用 create 的服务 initialize，伪代码为
	 * const service = await CheckpointService.create(...)
	 * await service.initialize()
	 *
	 * 核心职责：
	 * 1. 执行数据迁移（当前注释掉）
	 * 2. 初始化 tracker 组件
	 * 3. 处理服务启动逻辑
	 */
	public async initialize(): Promise<void> {
		try {
			// 暂时跳过迁移步骤
			// await CheckpointMigration.cleanupLegacyCheckpoints(this.userProjectPath, this.outputChannel)
			// await CheckpointMigration.migrateToNewStructure(this.userProjectPath, this.outputChannel)

			// 直接初始化 tracker
			try {
				await this.tracker.initialize()
				this.isInitialized = true // 初始化成功后设置标志
			} catch (error) {
				this.outputChannel.appendLine(`tracker 初始化失败: ${error}`)
				throw error
			}

			// 获取 shadow git 路径
			const coolclineShadowGitPath = await getShadowGitPath(
				this.vscodeGlobalStorageCoolClinePath,
				this._taskId,
				hashWorkingDir(this.userProjectPath),
			)
			this.gitPath = coolclineShadowGitPath
		} catch (error) {
			this.outputChannel.appendLine(`初始化失败: ${error}`)
			throw error
		}
	}

	/**
	 * 保存检查点
	 */
	public async saveCheckpoint(message: string): Promise<{ hash: string; timestamp: number }> {
		if (!this.gitPath) {
			throw new Error("Checkpoint 服务未初始化")
		}

		if (!this.isInitialized) {
			await this.tracker.initialize()
		}

		return await this.gitOps.saveCheckpoint(this.gitPath, message)
	}

	/**
	 * 恢复检查点
	 */
	public async restoreCheckpoint(message: string): Promise<{ hash: string; timestamp: number }> {
		if (!this.gitPath) {
			throw new Error("Checkpoint 服务未初始化")
		}

		return await this.gitOps.restoreCheckpoint(this.gitPath, message)
	}

	/**
	 * 撤销恢复操作
	 */
	public async undoRestore(message: string): Promise<{ hash: string; timestamp: number }> {
		if (!this.gitPath) {
			throw new Error("Checkpoint 服务未初始化")
		}

		return await this.gitOps.undoRestore(this.gitPath, message)
	}

	/**
	 * 比较当前差异
	 * @param fromHash 起始 commit hash
	 * @param toHash 结束 commit hash，如果不提供则与工作区比较
	 * 当没有传 toHash 时会执行与工作区的比较
	 */
	public async getDiff(fromHash: string): Promise<CheckpointDiff[]> {
		if (!this.gitPath) {
			throw new Error("Checkpoint 服务未初始化")
		}
		const changes = await this.gitOps.getDiff(this.gitPath, fromHash)
		return this.optimizeDiff(changes)
	}

	// getDiffToLatest
	/**
	 * 比较之后的所有差异
	 * @param fromHash 起始 commit hash
	 */
	public async getDiffToLatest(fromHash: string): Promise<CheckpointDiff[]> {
		if (!this.gitPath) {
			throw new Error("Checkpoint 服务未初始化")
		}
		const changes = await this.gitOps.getDiffToLatest(this.gitPath, fromHash)
		return this.optimizeDiff(changes)
	}

	private optimizeDiff(changes: CheckpointDiff[]): CheckpointDiff[] {
		let totalSize = 0
		return changes.filter((change) => {
			const size = change.before.length + change.after.length
			if (totalSize + size > CheckpointService.MAX_DIFF_SIZE) {
				return false
			}
			totalSize += size
			return true
		})
	}
}
