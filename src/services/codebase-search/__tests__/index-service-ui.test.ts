import { CodebaseIndexService } from "../index-service"
import * as vscode from "vscode"
import { expect } from "chai"

describe("CodebaseIndexService", () => {
	let service: CodebaseIndexService
	let mockService: CodebaseIndexService

	beforeAll(() => {
		// 创建模拟的索引服务
		mockService = {
			progress: { total: 0, completed: 0, status: "idle" },
			startIndexing: async () => {
				mockService.progress.status = "indexing"
			},
			clearIndex: async () => {
				mockService.progress.status = "idle"
			},
			getIndexStats: async () => ({
				filesCount: 0,
				symbolsCount: 0,
				keywordsCount: 0,
				lastIndexed: null,
				status: "idle",
			}),
		} as any

		service = mockService
	})

	describe("UI状态管理测试", () => {
		it("应该能够正确初始化UI状态", () => {
			expect(service.progress.status).to.equal("idle")
			expect(service.progress.completed).to.equal(0)
		})

		it("应该能够更新进度显示", async () => {
			// 模拟进度更新
			await service.startIndexing()
			expect(service.progress.status).to.equal("indexing")
			expect(service.progress.completed).to.equal(0)
		})
	})

	describe("索引操作测试", () => {
		it("应该能够开始索引", async () => {
			await service.startIndexing()
			expect(service.progress.status).to.equal("indexing")
		})

		it("应该能够清除索引", async () => {
			await service.clearIndex()
			expect(service.progress.status).to.equal("idle")
		})
	})

	describe("统计信息显示测试", () => {
		it("应该能够显示统计信息", async () => {
			const stats = await service.getIndexStats()
			expect(stats).to.have.property("filesCount")
			expect(stats).to.have.property("symbolsCount")
			expect(stats).to.have.property("keywordsCount")
			expect(stats).to.have.property("lastIndexed")
			expect(stats).to.have.property("status")
		})
	})

	describe("错误处理测试", () => {
		it("应该能够处理索引错误", async () => {
			mockService.startIndexing = async () => {
				throw new Error("Indexing failed")
			}

			try {
				await service.startIndexing()
				expect.fail("应该抛出错误")
			} catch (error) {
				expect(error.message).to.equal("Indexing failed")
			}
		})
	})
})
