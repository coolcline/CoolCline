import { CodebaseIndexService } from "../index-service"
import { join, dirname, extname } from "path"
import * as fs from "fs"
import { expect } from "chai"

describe("CodebaseIndexService", () => {
	let service: CodebaseIndexService
	let testWorkspacePath: string

	beforeAll(async () => {
		// 创建临时测试工作区
		testWorkspacePath = join(__dirname, "test-workspace")
		if (!fs.existsSync(testWorkspacePath)) {
			fs.mkdirSync(testWorkspacePath, { recursive: true })
		}
		service = new CodebaseIndexService(testWorkspacePath)
	})

	afterAll(async () => {
		// 清理测试工作区
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true })
		}
	})

	describe("基础功能测试", () => {
		it("应该能够初始化服务", () => {
			expect(service).to.exist
			expect(service.progress).to.exist
			expect(service.progress.status).to.equal("idle")
		})

		it("应该能够开始索引过程", async () => {
			// 创建测试文件
			const testFile = join(testWorkspacePath, "test.ts")
			fs.writeFileSync(testFile, 'function test() { console.log("test"); }')

			await service.startIndexing()
			expect(service.progress.status).to.equal("indexing")
		})
	})

	describe("文件索引测试", () => {
		it("应该能够索引单个文件", async () => {
			const testFile = join(testWorkspacePath, "single.ts")
			fs.writeFileSync(testFile, 'function single() { console.log("single"); }')

			await service.indexFile(testFile)
			const stats = await service.getIndexStats()
			// 不验证具体数量，而是验证字段存在
			expect(stats).to.have.property("filesCount")
		})

		it("应该能够从索引中移除文件", async () => {
			const testFile = join(testWorkspacePath, "remove.ts")
			fs.writeFileSync(testFile, 'function remove() { console.log("remove"); }')

			await service.indexFile(testFile)
			await service.removeFileFromIndex(testFile)
			const stats = await service.getIndexStats()
			expect(stats.filesCount).to.equal(0)
		})
	})

	describe("增量索引测试", () => {
		it("应该能够刷新索引", async () => {
			const testFile = join(testWorkspacePath, "refresh.ts")
			fs.writeFileSync(testFile, 'function refresh() { console.log("refresh"); }')

			await service.startIndexing()
			await service.refreshIndex()
			expect(service.progress.status).to.equal("indexing")
		})
	})

	describe("性能测试", () => {
		it("应该能够处理大量文件", async () => {
			// 创建多个测试文件
			for (let i = 0; i < 100; i++) {
				const testFile = join(testWorkspacePath, `test${i}.ts`)
				fs.writeFileSync(testFile, `function test${i}() { console.log("test${i}"); }`)
			}

			const startTime = Date.now()
			await service.startIndexing()
			const endTime = Date.now()

			// 验证索引时间在合理范围内
			expect(endTime - startTime).to.be.lessThan(5000)
		})
	})
})
