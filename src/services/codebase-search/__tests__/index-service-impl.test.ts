import * as fs from "fs"
import { expect } from "chai"
import * as path from "path"

// 在运行测试前模拟VS Code API
jest.mock(
	"vscode",
	() => ({
		window: {
			showInformationMessage: jest.fn(),
			showErrorMessage: jest.fn(),
		},
		workspace: {
			workspaceFolders: [
				{
					uri: { fsPath: path.join(__dirname, "test-workspace") },
					name: "test",
					index: 0,
				},
			],
			createFileSystemWatcher: jest.fn().mockReturnValue({
				onDidCreate: jest.fn(),
				onDidChange: jest.fn(),
				onDidDelete: jest.fn(),
				dispose: jest.fn(),
			}),
		},
	}),
	{ virtual: true },
)

// 然后导入依赖其他模块的对象
import { CodebaseIndexService } from "../index-service"
import { setExtensionContext } from "../extension-context"

// 设置模拟的扩展上下文
const mockContext = {
	globalStorageUri: { fsPath: path.join(__dirname, "test-storage") },
	workspaceState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	globalState: {
		get: jest.fn(),
		update: jest.fn(),
	},
	subscriptions: [],
	extensionPath: path.join(__dirname),
	extensionUri: { fsPath: path.join(__dirname) },
	environmentVariableCollection: {},
	extensionMode: 1,
	logUri: { fsPath: path.join(__dirname, "logs") },
	logPath: path.join(__dirname, "logs"),
	storageUri: { fsPath: path.join(__dirname, "storage") },
	storagePath: path.join(__dirname, "storage"),
	asAbsolutePath: (p: string) => path.join(__dirname, p),
}

describe("CodebaseIndexService", () => {
	let service: CodebaseIndexService
	let testWorkspacePath: string

	beforeAll(async () => {
		// 设置模拟的扩展上下文
		setExtensionContext(mockContext as any)

		// 创建临时测试工作区和存储目录
		testWorkspacePath = path.join(__dirname, "test-workspace")
		if (!fs.existsSync(testWorkspacePath)) {
			fs.mkdirSync(testWorkspacePath, { recursive: true })
		}

		// 创建测试存储目录
		const storageDir = path.join(__dirname, "test-storage", "workspace_indexing")
		if (!fs.existsSync(storageDir)) {
			fs.mkdirSync(storageDir, { recursive: true })
		}

		service = new CodebaseIndexService(testWorkspacePath)
	})

	beforeEach(async () => {
		// 清理测试文件
		const files = fs.readdirSync(testWorkspacePath)
		for (const file of files) {
			fs.unlinkSync(path.join(testWorkspacePath, file))
		}

		// 清理索引
		await service.clearIndex()
	})

	afterAll(async () => {
		// 确保关闭索引服务
		try {
			await service.close()
		} catch (error) {
			console.error("关闭索引服务时出错", error)
		}

		// 清理测试工作区
		if (fs.existsSync(testWorkspacePath)) {
			fs.rmSync(testWorkspacePath, { recursive: true, force: true })
		}

		// 清理测试存储目录
		const storageDir = path.join(__dirname, "test-storage")
		if (fs.existsSync(storageDir)) {
			fs.rmSync(storageDir, { recursive: true, force: true })
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
			const testFile = path.join(testWorkspacePath, "test.ts")
			fs.writeFileSync(testFile, 'function test() { console.log("test"); }')

			await service.startIndexing()
			// 索引可能很快完成，所以接受"completed"或"indexing"状态
			expect(["indexing", "completed"]).to.include(service.progress.status)
		})
	})

	describe("文件索引测试", () => {
		it("应该能够索引单个文件", async () => {
			const testFile = path.join(testWorkspacePath, "single.ts")
			fs.writeFileSync(testFile, 'function single() { console.log("single"); }')

			await service.indexFile(testFile)
			const stats = await service.getIndexStats()
			// 不验证具体数量，而是验证字段存在
			expect(stats).to.have.property("filesCount")
			expect(stats.filesCount).to.equal(2)
		})

		it("应该能够从索引中移除文件", async () => {
			const testFile = path.join(testWorkspacePath, "remove.ts")
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
			const testFile = path.join(testWorkspacePath, "refresh.ts")
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
				const testFile = path.join(testWorkspacePath, `test${i}.ts`)
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
