import * as fs from "fs"
import { expect } from "chai"
import { beforeAllTests, afterAllTests } from "./test-cleanup"
import { join, relative } from "../../../utils/path"

// 确保使用正确的vscode mock
jest.mock("vscode")

// 使用内存临时路径代替真实文件系统路径
const TEST_MEMORY_PATH = "/mem/temp"

// 然后导入依赖其他模块的对象
import { CodebaseIndexService } from "../index-service"
import { setExtensionContext } from "../extension-context"

// 设置模拟的扩展上下文 - 使用内存路径避免创建文件
const mockContext = {
	globalStorageUri: { fsPath: TEST_MEMORY_PATH },
	workspaceState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	globalState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	subscriptions: [],
	extensionPath: TEST_MEMORY_PATH,
	extensionUri: { fsPath: TEST_MEMORY_PATH },
	environmentVariableCollection: {},
	extensionMode: 1,
	logUri: { fsPath: join(TEST_MEMORY_PATH, "logs") },
	logPath: join(TEST_MEMORY_PATH, "logs"),
	storageUri: { fsPath: join(TEST_MEMORY_PATH, "storage") },
	storagePath: join(TEST_MEMORY_PATH, "storage"),
	asAbsolutePath: (p: string) => join(TEST_MEMORY_PATH, p),
}

describe("CodebaseIndexService", () => {
	let service: CodebaseIndexService
	let testWorkspacePath: string

	beforeAll(async () => {
		console.log("开始测试准备...")
		// 设置环境变量
		process.env.NODE_ENV = "test"

		// 设置模拟的扩展上下文 - 必须在初始化前设置
		setExtensionContext(mockContext as any)

		// 创建临时测试工作区
		testWorkspacePath = join(__dirname, "test-workspace")
		if (!fs.existsSync(testWorkspacePath)) {
			fs.mkdirSync(testWorkspacePath, { recursive: true })
		}

		// 创建测试文件
		const testFile = join(testWorkspacePath, "test.ts")
		fs.writeFileSync(testFile, 'function test() { console.log("test"); }')

		// 创建服务实例 - 使用内存数据库
		service = new CodebaseIndexService(testWorkspacePath, { useTestMode: true })
	})

	beforeEach(async () => {
		// 清理索引，保持干净状态
		await service.clearIndex()

		// 确保每个测试有一个干净的文件
		const testFile = join(testWorkspacePath, "test.ts")
		if (!fs.existsSync(testFile)) {
			fs.writeFileSync(testFile, 'function test() { console.log("test"); }')
		}
	})

	afterAll(async () => {
		// 关闭服务
		await service.close()

		// 清理工作区
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
			await service.startIndexing()
			// 索引可能很快完成，所以接受"completed"或"indexing"状态
			expect(["indexing", "completed"]).to.include(service.progress.status)
		})
	})

	describe("文件索引测试", () => {
		it("应该能够索引单个文件", async () => {
			const testFile = join(testWorkspacePath, "single.ts")
			fs.writeFileSync(testFile, 'function single() { console.log("single"); }')

			await service.indexFile(testFile)
			const stats = await service.getIndexStats()
			expect(stats).to.have.property("filesCount")
			expect(stats.filesCount).to.be.greaterThan(0)
		})

		it("应该能够从索引中移除文件", async () => {
			const testFile = join(testWorkspacePath, "remove.ts")
			fs.writeFileSync(testFile, 'function remove() { console.log("remove"); }')

			await service.clearIndex()
			await service.indexFile(testFile)
			const statsAfterIndex = await service.getIndexStats()
			expect(statsAfterIndex.filesCount).to.equal(1)

			await service.removeFileFromIndex(testFile)
			const statsAfterRemove = await service.getIndexStats()
			expect(statsAfterRemove.filesCount).to.equal(0)
		})
	})

	describe("增量索引测试", () => {
		it("应该能够刷新索引", async () => {
			const testFile = join(testWorkspacePath, "refresh.ts")
			fs.writeFileSync(testFile, 'function refresh() { console.log("refresh"); }')

			await service.startIndexing()
			await service.refreshIndex()
			expect(["indexing", "completed"]).to.include(service.progress.status)
		})
	})

	describe("性能测试", () => {
		it("应该能够处理大量文件", async () => {
			// 创建多个测试文件
			for (let i = 0; i < 5; i++) {
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
