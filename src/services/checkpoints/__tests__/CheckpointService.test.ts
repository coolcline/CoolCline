// npx jest src/services/checkpoints/__tests__/CheckpointService.test.ts

import { jest } from "@jest/globals"
import * as fs from "fs/promises"
import "../../../utils/path"
import { CheckpointService } from "../CheckpointService"
import { createTestEnvironment, createTestService, TestEnvironment } from "./test-utils"
import { PathUtils } from "../CheckpointUtils"
import { CheckpointMode, CheckpointRestoreMode } from "../types"
import * as vscode from "vscode"
import { setExtensionContext } from "../CheckpointUtils"
import { Uri } from "vscode"

jest.setTimeout(30000)

describe("CheckpointService", () => {
	let env: TestEnvironment
	let service: CheckpointService
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
		service = await createTestService(env)
	})

	afterEach(async () => {
		await env.cleanup()
	})

	describe("初始化", () => {
		it("应该能够正确初始化服务", async () => {
			await service.initialize()
			expect(service.taskId).toBe("test-task-1")
		})

		it("应该能够处理重复初始化", async () => {
			await service.initialize()
			await service.initialize() // 不应该抛出错误
		})
	})

	describe("检查点操作", () => {
		beforeEach(async () => {
			await service.initialize()
		})

		it("应该能够创建检查点", async () => {
			const message = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const result = await service.saveCheckpoint(message)
			expect(result).toBeDefined()
			expect(result.hash).toBeDefined()
			expect(result.timestamp).toBeDefined()
		})

		it("应该能够恢复检查点 - restore_this_change", async () => {
			// 创建初始文件
			await fs.writeFile(env.testFilePath, "initial content")
			const initialMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			await service.saveCheckpoint(initialMessage)

			// 修改文件并创建检查点
			await fs.writeFile(env.testFilePath, "modified content")
			const modifyMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const modifyResult = await service.saveCheckpoint(modifyMessage)

			// 恢复到初始检查点（应该恢复到 initial content，因为 modifyResult 的前一个提交是 initial content）
			const restoreMessage = `checkpoint:restore,task:test-task-1,target:${modifyResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			const restoreResult = await service.restoreCheckpoint(restoreMessage)

			expect(restoreResult).toBeDefined()
			expect(restoreResult.hash).toBeDefined()
			expect(restoreResult.timestamp).toBeDefined()

			// 验证文件内容已恢复
			const content = await fs.readFile(env.testFilePath, "utf-8")
			expect(content).toBe("initial content")
		})

		it("应该能够恢复检查点 - restore_this_and_after_change", async () => {
			// 创建初始文件
			await fs.writeFile(env.testFilePath, "initial content")
			const initialMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			await service.saveCheckpoint(initialMessage)

			// 创建多个修改
			await fs.writeFile(env.testFilePath, "modified content 1")
			const modify1Message = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const modify1Result = await service.saveCheckpoint(modify1Message)

			await fs.writeFile(env.testFilePath, "modified content 2")
			const modify2Message = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const modify2Result = await service.saveCheckpoint(modify2Message)

			// 恢复到第一次修改（应该恢复到 initial content，因为 modify1Result 的前一个提交是 initial content）
			const restoreMessage = `checkpoint:restore,task:test-task-1,target:${modify1Result.hash},restoreMode:restore_this_and_after_change,time:${Date.now()}`
			const restoreResult = await service.restoreCheckpoint(restoreMessage)

			expect(restoreResult).toBeDefined()
			expect(restoreResult.hash).toBeDefined()
			expect(restoreResult.timestamp).toBeDefined()

			// 验证文件内容已恢复
			const content = await fs.readFile(env.testFilePath, "utf-8")
			expect(content).toBe("modified content 1")
		})

		it("应该能够撤销恢复操作", async () => {
			// 创建初始文件
			await fs.writeFile(env.testFilePath, "initial content")
			const initialMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			await service.saveCheckpoint(initialMessage)

			// 修改文件并创建检查点
			await fs.writeFile(env.testFilePath, "modified content")
			const modifyMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const modifyResult = await service.saveCheckpoint(modifyMessage)

			// 恢复到初始检查点
			const restoreMessage = `checkpoint:restore,task:test-task-1,target:${modifyResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			const restoreResult = await service.restoreCheckpoint(restoreMessage)

			// 撤销恢复操作
			const undoMessage = `checkpoint:undo_restore,task:test-task-1,target:${restoreResult.hash},restoreMode:restore_this_change,time:${Date.now()}`
			const undoResult = await service.undoRestore(undoMessage)

			expect(undoResult).toBeDefined()
			expect(undoResult.hash).toBeDefined()
			expect(undoResult.timestamp).toBeDefined()

			// 验证文件内容已恢复到修改后的状态
			const content = await fs.readFile(env.testFilePath, "utf-8")
			expect(content).toBe("initial content")
		})
	})

	describe("错误处理", () => {
		it("应该能够处理无效的检查点哈希", async () => {
			await expect(
				service.restoreCheckpoint(
					`checkpoint:restore,task:test-task-1,target:invalid-hash,restoreMode:restore_this_change,time:${Date.now()}`,
				),
			).rejects.toThrow()
		})

		it("应该能够处理未初始化的服务", async () => {
			await expect(
				service.saveCheckpoint(`checkpoint:create,task:test-task-1,time:${Date.now()}`),
			).rejects.toThrow()
		})

		it("应该能够处理撤销非恢复操作", async () => {
			await service.initialize()
			const createMessage = `checkpoint:create,task:test-task-1,time:${Date.now()}`
			const createResult = await service.saveCheckpoint(createMessage)

			await expect(
				service.undoRestore(
					`checkpoint:undo_restore,task:test-task-1,target:${createResult.hash},restoreMode:restore_this_change,time:${Date.now()}`,
				),
			).rejects.toThrow("目标不是一个 restore 记录，不能执行撤销")
		})
	})
})
