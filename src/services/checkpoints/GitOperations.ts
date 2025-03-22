import fs from "fs/promises"
import { existsSync } from "fs"
import { SimpleGit, simpleGit, CleanOptions } from "simple-git"
import { PathUtils } from "./CheckpointUtils"
import { getLfsPatterns, writeExcludesFile, GIT_DISABLED_SUFFIX } from "./CheckpointExclusions"
import { CheckpointDiff, CheckpointMode } from "./types"

interface GitCommit {
	hash: string
	message: string
	date: string
}

const GitService = {
	async commit(git: SimpleGit, message: string): Promise<{ hash: string; timestamp: number }> {
		if (!message.includes("checkpoint:")) {
			throw new Error("无效的消息格式: 必须包含 checkpoint: 字段")
		}

		const info = GitOperations.parseMessage(message)
		if (!info.type) {
			throw new Error("无效的消息格式: checkpoint 字段值不能为空")
		}

		let result
		if (info.type === "create") {
			// 常规提交，需要包含文件变更
			result = await git.commit(message)
		} else if (info.type === "restore" || info.type === "undo_restore") {
			// 空提交，只记录操作
			const options = { "--allow-empty": null }
			result = await git.commit(message, options)
		} else {
			throw new Error(`未知的提交类型: ${info.type}`)
		}

		return {
			hash: result.commit,
			timestamp: Date.now(),
		}
	},
}

/**
 * GitOperations 类
 *
 * 处理 CoolCline 的 Checkpoints 系统的 Git 特定操作。
 *
 * 主要职责：
 * - Git 仓库初始化和配置
 * - Git 设置管理（用户、LFS 等）
 * - 文件暂存和 checkpoint 创建
 * - 嵌套 git 仓库管理
 */
export class GitOperations {
	private static readonly USER_NAME = "CoolCline"
	private static readonly USER_EMAIL = "checkpoint@coolcline.com"
	private readonly vscodeGlobalStorageCoolClinePath: string
	private readonly userProjectPath: string

	/**
	 * 创建一个新的 GitOperations 实例。
	 *
	 * @param vscodeGlobalStorageCoolClinePath - VSCode 全局存储路径
	 * @param userProjectPath - Git 操作的当前工作目录
	 */
	constructor(vscodeGlobalStorageCoolClinePath: string, userProjectPath: string) {
		this.vscodeGlobalStorageCoolClinePath = PathUtils.normalizePath(vscodeGlobalStorageCoolClinePath)
		this.userProjectPath = PathUtils.normalizePath(userProjectPath)
	}

	private getGit(gitDirPath: string): SimpleGit {
		const workingDir = PathUtils.dirname(gitDirPath)
		return simpleGit(workingDir)
	}

	/**
	 * 初始化或验证用于 checkpoint 跟踪的 shadow Git 仓库。
	 *
	 * @param coolclineShadowGitPath - .git 目录的路径
	 * @returns Promise<string> 初始化的 .git 目录的路径
	 */
	public async initShadowGit(coolclineShadowGitPath: string): Promise<string> {
		// console.info("GitOperations: 开始初始化 shadow git, 路径:", coolclineShadowGitPath)
		// /Users/zhaoyu/Library/Application Support/Code/User/globalStorage/coolcline.coolcline/shadow-git/06c0bd08/.git

		const normalizedProjectPath = PathUtils.normalizePath(this.userProjectPath)
		const checkpointsDir = PathUtils.dirname(coolclineShadowGitPath)
		const git = this.getGit(coolclineShadowGitPath)

		// 检查是否已经存在 shadow Git 仓库的 .git 目录
		if (existsSync(coolclineShadowGitPath)) {
			// 验证 core.worktree 配置是否正确
			const worktree = await git.getConfig("core.worktree")
			if (!PathUtils.pathsEqual(worktree.value || "", normalizedProjectPath)) {
				throw new Error("Checkpoints 只能在原始工作区中使用: " + worktree.value)
			}
			return coolclineShadowGitPath
		}

		// 如果 .git 目录不存在，则执行初始化
		try {
			await fs.mkdir(checkpointsDir, { recursive: true })
			await git.init()
			await git.addConfig("core.worktree", normalizedProjectPath)
			await this.initGitConfig(git)

			const lfsPatterns = await getLfsPatterns(normalizedProjectPath)
			await writeExcludesFile(coolclineShadowGitPath, lfsPatterns)
			await this.createInitialCommit(git)
		} catch (error) {
			// 如果目录已经存在，检查 core.worktree 配置
			const worktree = await git.getConfig("core.worktree")
			if (!PathUtils.pathsEqual(worktree.value || "", normalizedProjectPath)) {
				throw new Error("Checkpoints 只能在原始工作区中使用: " + worktree.value)
			}
		}

		return coolclineShadowGitPath
	}

	/**
	 * 初始化 Git 配置
	 * 处理全局和本地配置，确保正确的用户信息
	 */
	private async initGitConfig(git: SimpleGit): Promise<void> {
		// 获取全局配置
		const globalUserName = await git.getConfig("user.name", "global")
		const globalUserEmail = await git.getConfig("user.email", "global")

		// 仅在未配置时设置用户信息
		if (!globalUserName.value) {
			await git.addConfig("user.name", GitOperations.USER_NAME)
		}

		if (!globalUserEmail.value) {
			await git.addConfig("user.email", GitOperations.USER_EMAIL)
		}

		// 禁用 GPG 签名
		await git.addConfig("commit.gpgSign", "false")
	}

	/**
	 * 创建初始提交
	 * 使用空提交而不是创建 .gitkeep 文件
	 */
	private async createInitialCommit(git: SimpleGit): Promise<void> {
		// 直接创建一个空的初始提交，不需要 .gitkeep 文件
		await git.commit("Initial commit", ["--allow-empty"])
	}

	/**
	 * 暂存当前更改
	 * 包括未跟踪的文件
	 */
	public async stashChanges(gitPath: string): Promise<boolean> {
		const git = this.getGit(gitPath)
		const status = await git.status()
		if (status.files.length > 0) {
			await git.stash(["-u"]) // 包含未跟踪的文件
			return true
		}
		return false
	}

	/**
	 * 应用最近的 stash
	 */
	public async applyStash(gitPath: string): Promise<boolean> {
		const git = this.getGit(gitPath)
		const stashList = await git.stashList()
		if (stashList.all.length > 0) {
			await git.stash(["apply"])
			return true
		}
		return false
	}

	/**
	 * 弹出最近的 stash
	 */
	public async popStash(gitPath: string): Promise<boolean> {
		const git = this.getGit(gitPath)
		const stashList = await git.stashList()
		if (stashList.all.length > 0) {
			await git.stash(["pop", "--index"])
			return true
		}
		return false
	}

	/**
	 * 重命名嵌套的 Git 仓库，临时禁用它们
	 *
	 * @param disable - 是否禁用嵌套的 Git 仓库
	 */
	public async renameNestedGitRepos(disable: boolean) {
		try {
			const gitDirs = await this.findNestedGitDirs()

			for (const gitDir of gitDirs) {
				const disabledPath = PathUtils.joinPath(
					PathUtils.normalizePath(PathUtils.dirname(gitDir)),
					`.git${GIT_DISABLED_SUFFIX}`,
				)

				if (disable) {
					if (existsSync(gitDir) && !existsSync(disabledPath)) {
						await fs.rename(gitDir, disabledPath)
					}
				} else {
					if (!existsSync(gitDir) && existsSync(disabledPath)) {
						await fs.rename(disabledPath, gitDir)
					}
				}
			}
		} catch (error) {
			console.error((disable ? "禁用" : "启用") + "嵌套 git 仓库失败:", error)
		}
	}

	/**
	 * 查找所有嵌套的 .git 目录
	 */
	private async findNestedGitDirs(): Promise<string[]> {
		const git = simpleGit(this.userProjectPath)
		const result = await git.raw(["ls-files", "--others", "--exclude-standard", "-z"])
		const files = result.split("\0").filter(Boolean)

		return files
			.filter((file) => file.includes("/.git/") || file === ".git")
			.map((file) => PathUtils.joinPath(this.userProjectPath, file))
	}

	/**
	 * 获取差异
	 * @param gitPath - .git 目录的路径
	 * @param hash1 - 第一个 commit hash（前端传入的当前检查点）
	 */
	async getDiff(gitPath: string, hash1: string): Promise<CheckpointDiff[]> {
		if (!hash1) {
			throw new Error("请点击正确的 checkpoint")
		}

		const git = this.getGit(gitPath)

		// 由于现在是编辑完成生成检查点
		// // 将 hash1 往前移动一个检查点
		// 因为现在是编辑文件内容结束才创建检查点
		const hash_one = await this.getAdjacentCheckpoint(gitPath, hash1, "previous")
		const hash_two = hash1
		if (!hash_one) {
			throw new Error("这是第一个检查点，无法比较差异")
		}

		const summary = await git.diffSummary([hash_one, hash_two])
		const result: CheckpointDiff[] = []

		for (const file of summary.files) {
			const relativePath = file.file
			const absolutePath = PathUtils.joinPath(this.userProjectPath, relativePath)

			let before = ""
			let after = ""

			try {
				before = await git.show([`${hash_one}:${file.file}`])
			} catch (error) {
				// 文件在 previousHash 中不存在
			}

			try {
				after = await git.show([`${hash_two}:${file.file}`])
			} catch (error) {
				// 文件在 hash2 中不存在
			}

			const diff: CheckpointDiff = {
				relativePath,
				absolutePath,
				before,
				after,
			}
			result.push(diff)
		}

		// 检查是否有未提交的变更（工作区和暂存区）
		const status = await git.status()
		if (status.files.length > 0) {
			for (const file of status.files) {
				const relativePath = file.path
				const absolutePath = PathUtils.joinPath(this.userProjectPath, relativePath)
				let before = ""
				let after = ""

				// 获取最新提交的文件内容作为"之前"
				try {
					before = await git.show([`${hash_two}:${relativePath}`])
				} catch (error) {
					// 如果文件是新增的，在 hash_two 中不存在
				}

				// 获取当前工作区的文件内容作为"之后"
				try {
					// 如果文件已被删除，这将抛出错误
					const filePath = PathUtils.joinPath(this.userProjectPath, relativePath)
					after = await fs.readFile(filePath, { encoding: "utf8" })
				} catch (error) {
					// 文件可能已被删除
				}

				// 检查是否已有此文件的差异（避免重复）
				const existingDiffIndex = result.findIndex((diff) => diff.relativePath === relativePath)

				if (existingDiffIndex >= 0) {
					// 更新现有差异
					result[existingDiffIndex].after = after
				} else {
					// 添加新差异
					const diff: CheckpointDiff = {
						relativePath,
						absolutePath,
						before,
						after,
					}
					result.push(diff)
				}
			}
		}

		return result
	}

	/**
	 * 获取从指定检查点到最新检查点的所有修改
	 * @param gitPath - .git 目录的路径
	 * @param fromHash - 起始检查点的 hash
	 */
	public async getDiffToLatest(gitPath: string, fromHash: string): Promise<CheckpointDiff[]> {
		if (!gitPath || !fromHash) {
			throw new Error("参数不能为空")
		}

		const git = this.getGit(gitPath)

		// 由于现在是编辑完成生成检查点
		const hash_one = await this.getAdjacentCheckpoint(gitPath, fromHash, "previous")

		// 获取最新的检查点
		const hash_two = await git.revparse(["HEAD"])
		if (!hash_two) {
			throw new Error("无法获取最新检查点")
		}

		const summary = await git.diffSummary([hash_one, hash_two])
		const result: CheckpointDiff[] = []

		for (const file of summary.files) {
			const relativePath = file.file
			const absolutePath = PathUtils.joinPath(this.userProjectPath, relativePath)

			let before = ""
			let after = ""

			try {
				before = await git.show([`${hash_one}:${file.file}`])
			} catch (error) {
				// 文件在 previousHash 中不存在
			}

			try {
				after = await git.show([`${hash_two}:${file.file}`])
			} catch (error) {
				// 文件在 hash2 中不存在
			}

			const diff: CheckpointDiff = {
				relativePath,
				absolutePath,
				before,
				after,
			}
			result.push(diff)
		}

		// 检查是否有未提交的变更（工作区和暂存区）
		const status = await git.status()
		if (status.files.length > 0) {
			for (const file of status.files) {
				const relativePath = file.path
				const absolutePath = PathUtils.joinPath(this.userProjectPath, relativePath)
				let before = ""
				let after = ""

				// 获取最新提交的文件内容作为"之前"
				try {
					before = await git.show([`${hash_two}:${relativePath}`])
				} catch (error) {
					// 如果文件是新增的，在 hash_two 中不存在
				}

				// 获取当前工作区的文件内容作为"之后"
				try {
					// 如果文件已被删除，这将抛出错误
					const filePath = PathUtils.joinPath(this.userProjectPath, relativePath)
					after = await fs.readFile(filePath, { encoding: "utf8" })
				} catch (error) {
					// 文件可能已被删除
				}

				// 检查是否已有此文件的差异（避免重复）
				const existingDiffIndex = result.findIndex((diff) => diff.relativePath === relativePath)

				if (existingDiffIndex >= 0) {
					// 更新现有差异
					result[existingDiffIndex].after = after
				} else {
					// 添加新差异
					const diff: CheckpointDiff = {
						relativePath,
						absolutePath,
						before,
						after,
					}
					result.push(diff)
				}
			}
		}

		return result
	}

	/**
	 * 保存检查点（创建检查点）
	 */
	public async saveCheckpoint(gitPath: string, message: string): Promise<{ hash: string; timestamp: number }> {
		if (!gitPath) {
			throw new Error("gitPath 不能为空")
		}

		const git = this.getGit(gitPath)
		await git.add(".")
		const commitMessage = `${message},time:${Date.now()}`
		return await GitService.commit(git, commitMessage)
	}

	/**
	 * 获取相邻的检查点
	 * @param gitPath - .git 目录的路径
	 * @param currentHash - 当前检查点的 hash
	 * @param direction - 查找方向：'previous' 或 'next'
	 */
	private async getAdjacentCheckpoint(
		gitPath: string,
		currentHash: string,
		direction: "previous" | "next",
	): Promise<string> {
		const git = this.getGit(gitPath)

		// 使用 git rev-list 命令高效查找相邻的检查点
		const args = ["--max-count=1", direction === "previous" ? "--parents" : "--children", currentHash]

		const result = await git.raw(["rev-list", ...args])
		const hashes = result.trim().split(/\s+/)

		if (direction === "previous") {
			// 对于 previous，取第二个 hash（父提交）
			return hashes[1] || ""
		} else {
			// 对于 next，取第一个子提交
			return hashes[0] || ""
		}
	}

	/**
	 * 恢复检查点
	 */
	public async restoreCheckpoint(gitPath: string, message: string): Promise<{ hash: string; timestamp: number }> {
		if (!gitPath) {
			throw new Error("gitPath 不能为空")
		}

		const git = this.getGit(gitPath)
		const info = GitOperations.parseMessage(message)

		// 获取前一个检查点
		// 由于我们现在改为编辑完成生成检查点，所以 restore 是要还原到上一个提交
		const previousHash = await this.getAdjacentCheckpoint(gitPath, info.targetHash!, "previous")
		if (!previousHash) {
			throw new Error("这是第一个检查点，无法恢复")
		}

		if (info.restoreMode === "restore_this_change") {
			try {
				await this.revertCheckpoint(git, info.targetHash!)
			} catch (error) {
				throw error
			}
		} else if (info.restoreMode === "restore_this_and_after_change") {
			// 清理工作区中未跟踪的文件
			await git.clean([CleanOptions.FORCE, CleanOptions.RECURSIVE])

			// 恢复到前一个检查点
			await git.reset(["--hard", previousHash])
		} else {
			throw new Error("无效的 restore 模式")
		}

		const commitMessage = `${message},time:${Date.now()}`
		return await GitService.commit(git, commitMessage)
	}

	/**
	 * 撤销恢复操作
	 */
	public async undoRestore(gitPath: string, message: string): Promise<{ hash: string; timestamp: number }> {
		if (!gitPath) {
			throw new Error("gitPath 不能为空")
		}

		const git = this.getGit(gitPath)
		const info = GitOperations.parseMessage(message)

		// 获取目标提交的信息
		const targetCommit = await git.raw(["show", "--format=%s", "-s", info.targetHash!])
		const targetInfo = GitOperations.parseMessage(targetCommit.toString().trim())

		// 检查目标提交是否是恢复操作
		if (targetInfo.type !== "restore") {
			throw new Error("目标不是一个 restore 记录，不能执行撤销")
		}

		// 获取下一个检查点
		const nextHash = await this.getAdjacentCheckpoint(gitPath, info.targetHash!, "next")
		if (!nextHash) {
			throw new Error("这是最新的检查点，无法撤销恢复")
		}

		// 获取恢复操作的目标提交
		const restoreTargetHash = targetInfo.targetHash
		if (!restoreTargetHash) {
			throw new Error("无法获取恢复操作的目标提交")
		}

		// 根据原始恢复操作的模式执行不同的撤销操作
		if (targetInfo.restoreMode === "restore_this_change") {
			try {
				await this.revertCheckpoint(git, info.targetHash!)
			} catch (error) {
				throw error
			}
		} else if (targetInfo.restoreMode === "restore_this_and_after_change") {
			// 清理工作区中未跟踪的文件
			await git.clean([CleanOptions.FORCE, CleanOptions.RECURSIVE])

			// 恢复到恢复操作的目标提交的下一个提交
			const restoreNextHash = await this.getAdjacentCheckpoint(gitPath, restoreTargetHash, "next")
			if (!restoreNextHash) {
				throw new Error("无法获取恢复操作的目标提交的下一个提交")
			}
			await git.reset(["--hard", restoreNextHash])
		} else {
			throw new Error("无效的 restore 模式")
		}

		// 记录撤销操作
		return await GitService.commit(git, message)
	}

	/**
	 * 尝试撤销指定 checkpoint 的修改
	 * 如果后续修改与目标 checkpoint 有冲突，将放弃操作并抛出错误
	 * @param git SimpleGit 实例
	 * @param hash 要撤销的 checkpoint 的 hash
	 * @throws {Error} 当发生冲突时抛出带有明确提示信息的错误
	 */
	private async revertCheckpoint(git: SimpleGit, hash: string): Promise<void> {
		try {
			await git.revert(hash, { "--no-commit": null })
		} catch (error) {
			// 发生冲突，中止 revert
			await git.raw(["revert", "--abort"])
			throw new Error(
				"无法撤销这个检查点的修改，因为后续的修改与之存在冲突。请从后往前 restore 或使用 restore_this_and_after_change 模式全部撤销之后的修改。",
			)
		}
	}

	/**
	 * 解析消息
	 */
	public static parseMessage(message: string) {
		const parts = message.split(",")
		const info: {
			type?: CheckpointMode
			taskId?: string
			targetHash?: string
			restoreMode?: string
		} = {}

		for (const part of parts) {
			const [key, value] = part.split(":")
			if (key === "checkpoint") {
				info.type = value as CheckpointMode
			} else if (key === "task") {
				info.taskId = value
			} else if (key === "target") {
				info.targetHash = value
			} else if (key === "restoreMode") {
				info.restoreMode = value
			}
		}

		return info
	}

	// 查看提交历史（git log）
	async getCommits(gitPath: string): Promise<GitCommit[]> {
		if (!gitPath) {
			throw new Error("gitPath 不能为空")
		}

		const git = this.getGit(gitPath)
		const log = await git.log()
		return log.all.map((commit) => ({
			hash: commit.hash,
			message: commit.message,
			date: commit.date,
		}))
	}

	/**
	 * 清理旧的 checkpoints
	 * @param gitPath - .git 目录的路径
	 * @param hashes - 要清理的 checkpoint hash 列表
	 */
	public async cleanupCheckpoints(gitPath: string, hashes: string[]): Promise<void> {
		if (!gitPath) {
			throw new Error("gitPath 不能为空")
		}

		const git = this.getGit(gitPath)
		try {
			for (const hash of hashes) {
				await git.raw(["update-ref", "-d", `refs/checkpoints/${hash}`])
			}
			await git.raw(["gc", "--prune=now"])
		} catch (error) {
			console.error("Failed to cleanup checkpoints:", error)
			throw error
		}
	}
}
