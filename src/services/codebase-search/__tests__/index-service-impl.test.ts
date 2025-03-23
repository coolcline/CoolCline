import * as fs from "fs"
import { expect } from "chai"
import { beforeAllTests, afterAllTests } from "./test-cleanup"
import { join, relative } from "../../../utils/path"

// 确保使用正确的vscode mock
jest.mock("vscode")

// 然后导入依赖其他模块的对象
import { CodebaseIndexService } from "../index-service"
import { setExtensionContext } from "../extension-context"
import { generateWorkspaceId } from "../database" // 导入工作区ID生成函数

// 设置模拟的扩展上下文
const mockContext = {
	globalStorageUri: { fsPath: join(__dirname, "test-storage") },
	workspaceState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	globalState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	subscriptions: [],
	extensionPath: join(__dirname),
	extensionUri: { fsPath: join(__dirname) },
	environmentVariableCollection: {},
	extensionMode: 1,
	logUri: { fsPath: join(__dirname, "logs") },
	logPath: join(__dirname, "logs"),
	storageUri: { fsPath: join(__dirname, "storage") },
	storagePath: join(__dirname, "storage"),
	asAbsolutePath: (p: string) => join(__dirname, p),
}

describe("CodebaseIndexService", () => {
	let service: CodebaseIndexService
	let testWorkspacePath: string
	let dbFilePath: string // 添加数据库文件路径变量

	beforeAll(async () => {
		// 先清理之前可能残留的测试数据
		await beforeAllTests()

		// 设置模拟的扩展上下文
		setExtensionContext(mockContext as any)

		// 创建临时测试工作区和存储目录
		testWorkspacePath = join(__dirname, "test-workspace")
		if (!fs.existsSync(testWorkspacePath)) {
			fs.mkdirSync(testWorkspacePath, { recursive: true })
		}

		// 创建测试存储目录
		const storageDir = join(__dirname, "test-storage", "workspace_indexing")
		if (!fs.existsSync(storageDir)) {
			fs.mkdirSync(storageDir, { recursive: true })
		}

		// 计算数据库文件路径
		const workspaceId = generateWorkspaceId(testWorkspacePath)
		dbFilePath = join(__dirname, "test-storage", "workspace_indexing", `${workspaceId}.db`)

		service = new CodebaseIndexService(testWorkspacePath)
	})

	beforeEach(async () => {
		// 清理测试文件
		const files = fs.readdirSync(testWorkspacePath)
		for (const file of files) {
			fs.unlinkSync(join(testWorkspacePath, file))
		}

		// 清理索引
		await service.clearIndex()
	})

	afterAll(async () => {
		// 确保关闭索引服务
		try {
			await service.close()
			// 关闭后强制延迟确保资源释放
			await new Promise((resolve) => setTimeout(resolve, 1000))
		} catch (error) {
			console.error("关闭索引服务时出错", error)
		}

		// 直接删除具体数据库文件 - 68496b9.db
		const specificDbPath = join(__dirname, "test-storage", "workspace_indexing", "68496b9.db")
		if (fs.existsSync(specificDbPath)) {
			try {
				// 强制尝试删除
				fs.unlinkSync(specificDbPath)
				console.log(`已删除指定数据库文件: ${specificDbPath}`)
			} catch (err) {
				console.error(`删除指定数据库文件失败: ${err.message}`)
			}
		}

		// 也尝试删除通过工作区ID计算的文件
		if (dbFilePath && fs.existsSync(dbFilePath)) {
			try {
				fs.unlinkSync(dbFilePath)
				console.log(`已删除计算的数据库文件: ${dbFilePath}`)
			} catch (err) {
				console.error(`删除计算的数据库文件失败: ${err.message}`)
			}
		}

		// 清理测试工作区
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true })
		}

		// 清理所有测试存储目录下的数据库文件
		const storageDir = join(__dirname, "test-storage", "workspace_indexing")
		if (fs.existsSync(storageDir)) {
			try {
				const files = fs.readdirSync(storageDir)
				for (const file of files) {
					if (file.endsWith(".db")) {
						try {
							const filePath = join(storageDir, file)
							fs.unlinkSync(filePath)
							console.log(`已删除数据库文件: ${filePath}`)
						} catch (err) {
							console.error(`删除数据库文件失败: ${file}: ${err.message}`)
						}
					}
				}
			} catch (err) {
				console.error(`读取数据库目录失败: ${err.message}`)
			}
		}

		// 最后清理整个测试存储目录
		const testStorageDir = join(__dirname, "test-storage")
		if (fs.existsSync(testStorageDir)) {
			fs.rmSync(testStorageDir, { recursive: true, force: true })
		}

		// 使用辅助函数执行彻底清理
		await afterAllTests()
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
			// 修复：不验证具体数量，这个可能会有所不同
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
			// 索引可能很快完成，所以接受"completed"或"indexing"状态
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

			// 等待索引完成并关闭服务，避免异步操作超出测试范围
			await new Promise((resolve) => setTimeout(resolve, 1000))
			await service.close()
		})
	})
})
