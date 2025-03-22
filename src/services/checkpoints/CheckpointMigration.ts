import fs from "fs/promises"
import * as vscode from "vscode"
import { fileExists, PathUtils } from "./CheckpointUtils"
import * as path from "../../utils/path"
import { CheckpointMode, CheckpointRestoreMode } from "./types"
import { exec } from "child_process"
import { promisify } from "util"
import simpleGit from "simple-git"

const execAsync = promisify(exec)

interface MigrationOptions {
	gitPath: string
	backupPath: string
	tasksPath: string
}

interface HashMapping {
	oldHash: string
	newHash: string
	timestamp: number
	type: CheckpointMode
	restoreMode?: CheckpointRestoreMode
	message: string
}

interface HistoryUpdate {
	taskId: string
	updates: {
		oldHash: string
		newHash: string
		type: CheckpointMode
		restoreMode?: CheckpointRestoreMode
		timestamp: number
	}[]
}

export class CheckpointMigration {
	// ... existing code ...

	/**
	 * 执行从多分支到单分支的迁移
	 */
	async migrateToTimeline(options: MigrationOptions): Promise<void> {
		try {
			// 1. 创建备份
			await this.createBackup(options)

			// 2. 获取所有提交并按时间排序
			const commits = await this.getAllCommitsSortedByTime(options.backupPath)

			// 3. 清理原仓库并初始化
			await this.clearRepository(options.gitPath)
			await this.initRepository(options.gitPath)

			// 4. 创建初始提交
			await this.createInitialCommit(options.gitPath)

			// 5. 重建提交
			const hashMappings = await this.recreateCommits(commits, options.gitPath)

			// 6. 更新历史记录
			await this.updateTaskHistory(options.tasksPath, hashMappings)

			vscode.window.showInformationMessage("迁移成功完成！")
		} catch (error) {
			vscode.window.showErrorMessage(`迁移失败: ${error.message}`)
			throw error
		}
	}

	async createBackup(options: MigrationOptions): Promise<void> {
		try {
			// 检查并删除旧的备份目录
			try {
				await fs.access(options.backupPath)
				await fs.rm(options.backupPath, { recursive: true, force: true })
				// 等待文件系统操作完成
				await new Promise((resolve) => setTimeout(resolve, 100))
			} catch (error) {
				// 如果目录不存在，忽略错误
			}

			// 创建新的备份目录
			await fs.mkdir(options.backupPath, { recursive: true })

			// 克隆仓库
			await new Promise<void>((resolve, reject) => {
				exec(`git clone ${options.gitPath} ${options.backupPath}`, (error) => {
					if (error) {
						reject(error)
					} else {
						resolve()
					}
				})
			})

			// 初始化 simpleGit
			const git = simpleGit(options.backupPath)

			// 获取所有远程分支
			await git.fetch(["--all"])
			const { all: remoteBranches } = await git.branch(["-r"])

			// 检出每个远程分支
			for (const branch of remoteBranches) {
				if (branch === "origin/HEAD") continue
				const localBranch = branch.replace("origin/", "")
				await git.checkout(["-b", localBranch, branch])
			}

			// 删除 origin 远程仓库
			await git.remote(["remove", "origin"])
		} catch (error) {
			throw new Error(`创建备份失败: ${error.message}`)
		}
	}

	private async getAllCommitsSortedByTime(backupPath: string): Promise<any[]> {
		try {
			// 确保在 git 仓库中执行命令
			const { stdout } = await execAsync(`cd ${backupPath} && git log --pretty=format:'%H|%ct|%s' --all`, {
				cwd: backupPath,
			})

			if (!stdout.trim()) {
				return []
			}

			return stdout
				.split("\n")
				.map((line) => {
					const [hash, timestamp, message] = line.split("|")
					return {
						hash,
						timestamp: parseInt(timestamp, 10) * 1000,
						message,
					}
				})
				.sort((a, b) => a.timestamp - b.timestamp)
		} catch (error) {
			throw new Error(`获取提交历史失败: ${error.message}`)
		}
	}

	private async clearRepository(gitPath: string): Promise<void> {
		try {
			await fs.rm(gitPath, { recursive: true, force: true })
			await fs.mkdir(gitPath, { recursive: true })
		} catch (error) {
			throw new Error(`清理仓库失败: ${error.message}`)
		}
	}

	private async initRepository(gitPath: string): Promise<void> {
		try {
			await execAsync("git init", { cwd: gitPath })
		} catch (error) {
			throw new Error(`初始化仓库失败: ${error.message}`)
		}
	}

	private async createInitialCommit(gitPath: string): Promise<void> {
		try {
			await execAsync('git commit --allow-empty -m "Initial commit"', { cwd: gitPath })
		} catch (error) {
			throw new Error(`创建初始提交失败: ${error.message}`)
		}
	}

	private async recreateCommits(commits: any[], gitPath: string): Promise<HashMapping[]> {
		const hashMappings: HashMapping[] = []

		for (const commit of commits) {
			try {
				// 跳过初始提交
				if (commit.message === "Initial commit") {
					continue
				}

				// 解析提交类型和模式
				const info = this.parseOldCommitMessage(commit.message)

				// 如果是 restore 操作，需要先找到目标提交的新 hash
				let targetNewHash = info.targetHash
				if (info.type === "restore" && info.targetHash) {
					const targetMapping = hashMappings.find((m) => m.oldHash === info.targetHash)
					if (!targetMapping) {
						throw new Error(`找不到目标提交的新 hash，原始 hash: ${info.targetHash}`)
					}
					targetNewHash = targetMapping.newHash
				}

				// 构建新的提交消息
				const newMessage =
					info.type === "restore"
						? `checkpoint:restore,task:${info.taskId},target:${targetNewHash},restoreMode:restore_this_and_after_change,time:${commit.timestamp}`
						: `checkpoint:create,task:${info.taskId},time:${commit.timestamp}`

				try {
					// 应用更改
					await execAsync(`git cherry-pick --force ${commit.hash}`, { cwd: gitPath })

					// 修改提交消息并获取新 hash
					const { stdout: newHash } = await execAsync(`git commit --amend -m "${newMessage}" --no-edit`, {
						cwd: gitPath,
					})

					hashMappings.push({
						oldHash: commit.hash,
						newHash: newHash.trim().split(" ")[1], // 提取新的 commit hash
						timestamp: commit.timestamp,
						type: info.type,
						restoreMode: info.restoreMode,
						message: commit.message,
					})
				} catch (error) {
					// 如果 cherry-pick 失败，尝试中止操作并继续处理下一个提交
					try {
						await execAsync("git cherry-pick --abort", { cwd: gitPath })
					} catch (abortError) {
						// 如果没有正在进行的 cherry-pick 操作，忽略错误
						if (!abortError.message.includes("拣选或还原操作并未进行")) {
							throw abortError
						}
					}
					console.error(`重建提交失败: ${commit.hash}, 错误: ${error}`)
				}
			} catch (error) {
				console.error(`处理提交失败: ${commit.hash}, 错误: ${error}`)
			}
		}

		return hashMappings
	}

	private parseOldCommitMessage(message: string): {
		type: CheckpointMode
		restoreMode?: CheckpointRestoreMode
		taskId: string
		targetHash?: string
	} {
		// 处理旧格式的 create 消息
		const createMatch = message.match(/Task: ([^,]+), Time: (\d+)/)
		if (createMatch) {
			return {
				type: "create",
				taskId: createMatch[1],
			}
		}

		// 处理旧格式的 restore 消息
		const restoreMatch = message.match(/task:([^,]+),restore:([^,]+),Time:(\d+)/)
		if (restoreMatch) {
			return {
				type: "restore",
				taskId: restoreMatch[1],
				targetHash: restoreMatch[2],
				restoreMode: "restore_this_and_after_change",
			}
		}

		throw new Error(`无法解析的提交消息格式: ${message}`)
	}

	private async updateTaskHistory(tasksPath: string, hashMappings: HashMapping[]): Promise<void> {
		try {
			// 确保 tasks 目录存在
			await fs.mkdir(tasksPath, { recursive: true })

			// 获取所有任务目录
			const taskDirs = await fs.readdir(tasksPath)

			// 按任务ID分组整理更新
			const updatesByTask = new Map<string, HistoryUpdate>()
			for (const mapping of hashMappings) {
				try {
					const info = this.parseOldCommitMessage(mapping.message)
					const taskId = info.taskId

					if (!updatesByTask.has(taskId)) {
						updatesByTask.set(taskId, {
							taskId,
							updates: [],
						})
					}

					updatesByTask.get(taskId)?.updates.push({
						oldHash: mapping.oldHash,
						newHash: mapping.newHash,
						type: mapping.type,
						restoreMode: mapping.restoreMode,
						timestamp: mapping.timestamp,
					})
				} catch (error) {
					console.error(`处理提交映射失败: ${mapping.message}, 错误: ${error}`)
					continue
				}
			}

			// 处理每个任务的历史记录
			for (const taskDir of taskDirs) {
				const taskId = taskDir
				const updates = updatesByTask.get(taskId)
				if (!updates) {
					continue
				}

				const taskPath = path.join(tasksPath, taskDir)

				// 更新 api_conversation_history.json
				const apiHistoryPath = path.join(taskPath, "api_conversation_history.json")
				if (await fileExists(apiHistoryPath)) {
					const apiHistory = JSON.parse(await fs.readFile(apiHistoryPath, "utf-8"))
					let modified = false

					for (const message of apiHistory) {
						if (message.type === "checkpoint") {
							const update = updates.updates.find((u) => u.oldHash === message.hash)
							if (update) {
								message.hash = update.newHash
								if (message.targetHash) {
									const targetUpdate = updates.updates.find((u) => u.oldHash === message.targetHash)
									if (targetUpdate) {
										message.targetHash = targetUpdate.newHash
									}
								}
								modified = true
							}
						}
					}

					if (modified) {
						await fs.writeFile(apiHistoryPath, JSON.stringify(apiHistory, null, 2))
					}
				}

				// 更新 ui_messages.json
				const uiMessagesPath = path.join(taskPath, "ui_messages.json")
				if (await fileExists(uiMessagesPath)) {
					const uiMessages = JSON.parse(await fs.readFile(uiMessagesPath, "utf-8"))
					let modified = false

					for (const message of uiMessages) {
						if (message.type === "checkpoint") {
							const update = updates.updates.find((u) => u.oldHash === message.hash)
							if (update) {
								message.hash = update.newHash
								if (message.targetHash) {
									const targetUpdate = updates.updates.find((u) => u.oldHash === message.targetHash)
									if (targetUpdate) {
										message.targetHash = targetUpdate.newHash
									}
								}
								// 更新 restore 操作的模式
								if (message.restoreMode && update.type === "restore") {
									message.restoreMode = "restore_this_and_after_change"
								}
								modified = true
							}
						}
					}

					if (modified) {
						await fs.writeFile(uiMessagesPath, JSON.stringify(uiMessages, null, 2))
					}
				}
			}
		} catch (error) {
			throw new Error(`更新历史记录失败: ${error.message}`)
		}
	}
}
