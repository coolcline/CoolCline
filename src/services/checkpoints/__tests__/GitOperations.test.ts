import { jest } from "@jest/globals"
import { GitOperations } from "../GitOperations"
import { createTestEnvironment, TestEnvironment } from "./test-utils"
import { SimpleGit } from "simple-git"
import * as fs from "fs/promises"
import { getShadowGitPath, PathUtils, hashWorkingDir, setExtensionContext } from "../CheckpointUtils"
import { CheckpointDiff, CheckpointMode, CheckpointRestoreMode } from "../types"
import * as vscode from "vscode"
import { Uri } from "vscode"

describe("GitOperations", () => {
	let env: TestEnvironment
	let gitOps: GitOperations
	let gitPath: string
	let mockContext: vscode.ExtensionContext

	beforeEach(async () => {
		// 设置模拟的扩展上下文
		mockContext = {
			globalStorageUri: Uri.file("/tmp/test-storage"),
			extensionUri: Uri.file("/tmp/test-workspace"),
			subscriptions: [],
			workspaceState: {
				get: jest.fn(),
				update: jest.fn(),
			},
			globalState: {
				get: jest.fn(),
				update: jest.fn(),
			},
			extensionPath: "/tmp/test-workspace",
			asAbsolutePath: (relativePath: string) => `/tmp/test-workspace/${relativePath}`,
			storageUri: Uri.file("/tmp/test-storage"),
			logUri: Uri.file("/tmp/test-storage/logs"),
			extensionMode: 1,
			name: "test-extension",
		} as unknown as vscode.ExtensionContext

		setExtensionContext(mockContext)

		env = await createTestEnvironment()
		gitOps = new GitOperations(env.globalStoragePath, env.workspaceRoot)
		const cwdHash = hashWorkingDir(env.workspaceRoot)
		gitPath = await getShadowGitPath(env.globalStoragePath, "test-task", cwdHash)
		await gitOps.initShadowGit(gitPath)
	})

	afterEach(async () => {
		await env.cleanup()
	})

	describe("基本操作", () => {
		it("应该能够初始化 shadow git 仓库", async () => {
			const newWorkspaceHash = hashWorkingDir("new-workspace")
			const newGitPath = await getShadowGitPath(env.globalStoragePath, "test-task", newWorkspaceHash)
			const result = await gitOps.initShadowGit(newGitPath)
			expect(result).toBe(newGitPath)
		})
	})

	describe("提交操作", () => {
		it("应该能够创建检查点", async () => {
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "test content")

			const message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const result = await gitOps.saveCheckpoint(gitPath, message)

			expect(typeof result.hash).toBe("string")
			expect(result.hash).toMatch(/^[a-f0-9]{40}$/)
			expect(typeof result.timestamp).toBe("number")
		})

		it("应该能够获取提交历史", async () => {
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "test content")

			const message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const result = await gitOps.saveCheckpoint(gitPath, message)

			const commits = await gitOps.getCommits(gitPath)
			expect(commits.length).toBeGreaterThan(0)
			expect(commits[0].hash).toBe(result.hash)
			expect(commits[0].message).toContain(message)
		})
	})

	describe("恢复操作", () => {
		it("应该能够执行 restore_this_change 操作", async () => {
			// 创建初始文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "initial content")
			const initialMessage = `checkpoint:create,task:test-task,time:${Date.now()}`
			await gitOps.saveCheckpoint(gitPath, initialMessage)

			// 修改文件并创建检查点
			await fs.writeFile(testFile, "modified content")
			const modifyMessage = `checkpoint:create,task:test-task,time:${Date.now()}`
			const modifyResult = await gitOps.saveCheckpoint(gitPath, modifyMessage)

			// 执行恢复操作（应该恢复到 initial content，因为 modifyResult 的前一个提交是 initial content）
			const restoreMessage = `checkpoint:restore,task:test-task,target:${modifyResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			await gitOps.restoreCheckpoint(gitPath, restoreMessage)

			const content = await fs.readFile(testFile, "utf-8")
			expect(content).toBe("initial content")
		})

		it("应该能够执行 restore_this_and_after_change 操作", async () => {
			// 创建初始文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "initial content")
			const initialMessage = `checkpoint:create,task:test-task,time:${Date.now()}`
			await gitOps.saveCheckpoint(gitPath, initialMessage)

			// 创建多个修改
			await fs.writeFile(testFile, "modified content 1")
			const modify1Message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const modify1Result = await gitOps.saveCheckpoint(gitPath, modify1Message)

			await fs.writeFile(testFile, "modified content 2")
			const modify2Message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const modify2Result = await gitOps.saveCheckpoint(gitPath, modify2Message)

			// 执行恢复操作（应该恢复到 initial content，因为 modify1Result 的前一个提交是 initial content）
			const restoreMessage = `checkpoint:restore,task:test-task,target:${modify1Result.hash},restoreMode:restore_this_and_after_change,time:${Date.now()}`
			await gitOps.restoreCheckpoint(gitPath, restoreMessage)

			const content = await fs.readFile(testFile, "utf-8")
			expect(content).toBe("modified content 1")
		})
	})

	describe("撤销操作", () => {
		it("应该能够执行撤销恢复操作", async () => {
			// 创建初始检查点
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "initial content")
			const createMessage = `checkpoint:create,task:test-task,time:${Date.now()}`
			const createResult = await gitOps.saveCheckpoint(gitPath, createMessage)

			// 修改文件并创建新检查点
			await fs.writeFile(testFile, "modified content")
			const modifyMessage = `checkpoint:create,task:test-task,time:${Date.now()}`
			const modifyResult = await gitOps.saveCheckpoint(gitPath, modifyMessage)

			// 执行恢复操作
			const restoreMessage = `checkpoint:restore,task:test-task,target:${createResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			const restoreResult = await gitOps.saveCheckpoint(gitPath, restoreMessage)

			// 执行撤销操作
			const undoMessage = `checkpoint:undo_restore,task:test-task,target:${restoreResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			const undoResult = await gitOps.saveCheckpoint(gitPath, undoMessage)

			const content = await fs.readFile(testFile, "utf-8")
			expect(content).toBe("modified content")
		})
	})

	describe("性能测试", () => {
		it("应该能够处理大量文件", async () => {
			const fileCount = 100
			const files: string[] = []

			for (let i = 0; i < fileCount; i++) {
				const filePath = PathUtils.joinPath(env.workspaceRoot, `test-${i}.txt`)
				await fs.writeFile(filePath, `content-${i}`)
				files.push(filePath)
			}

			const message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const result = await gitOps.saveCheckpoint(gitPath, message)
			expect(result.hash).toMatch(/^[a-f0-9]{40}$/)

			const commits = await gitOps.getCommits(gitPath)
			expect(commits.length).toBeGreaterThan(0)
			expect(commits[0].message).toContain(message)
		})

		it("应该能够处理大文件", async () => {
			const largeFilePath = PathUtils.joinPath(env.workspaceRoot, "large-file.txt")
			const content = "x".repeat(5 * 1024 * 1024) // 5MB
			await fs.writeFile(largeFilePath, content)

			const message = `checkpoint:create,task:test-task,time:${Date.now()}`
			const result = await gitOps.saveCheckpoint(gitPath, message)
			expect(result.hash).toMatch(/^[a-f0-9]{40}$/)

			const commits = await gitOps.getCommits(gitPath)
			expect(commits.length).toBeGreaterThan(0)
			expect(commits[0].message).toContain(message)
		})
	})
})
