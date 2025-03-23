import { CodebaseSearchService } from "../search-service"
import { IndexOptions } from "../types"
import { CodebaseIndexService } from "../index-service"
import * as fs from "fs"
import * as os from "os"
import { ResultType } from "../types"
import { generateWorkspaceId } from "../database"
import { getExtensionContext } from "../extension-context"
import { beforeAllTests, afterAllTests } from "./test-cleanup"
import { join, toPosixPath } from "../../../utils/path"

// 确保使用正确的vscode mock
jest.mock("vscode")

// 模拟扩展上下文
jest.mock("../extension-context")

describe.skip("搜索服务集成测试", () => {
	let tempDir: string
	let searchService: CodebaseSearchService
	let indexService: CodebaseIndexService
	let dbFilePath: string

	// 创建测试文件
	const createTestFiles = async () => {
		// 用户模型
		const userModel = `
/**
 * 用户模型
 */
export class User {
  id: string
  name: string
  email: string
  role: string
  
  constructor(data: Partial<User>) {
    Object.assign(this, data)
  }
  
  isAdmin(): boolean {
    return this.role === 'admin'
  }
}
`

		// 用户服务
		const userService = `
import { User } from '../models/user'

/**
 * 用户服务类
 */
export class UserService {
  private users: Map<string, User> = new Map()
  
  /**
   * 获取用户信息
   */
  async getUserData(userId: string): Promise<User | null> {
    const user = this.users.get(userId)
    return user || null
  }
  
  /**
   * 保存用户信息
   */
  async saveUserData(user: User): Promise<void> {
    this.users.set(user.id, user)
  }
}
`

		// 身份验证服务
		const authService = `
import { User } from '../models/user'

/**
 * 身份验证服务
 */
export class AuthenticationService {
  private sessions: Map<string, string> = new Map()
  
  /**
   * 登录
   */
  async login(username: string, password: string): Promise<string | null> {
    // 简化的认证逻辑
    if (username && password) {
      const sessionId = Math.random().toString(36).substring(2)
      this.sessions.set(sessionId, username)
      return sessionId
    }
    return null
  }
  
  /**
   * 验证会话
   */
  async validateSession(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId)
  }
}
`

		// 创建文件结构
		const modelsDir = join(tempDir, "src", "models")
		const servicesDir = join(tempDir, "src", "services")

		await fs.promises.mkdir(modelsDir, { recursive: true })
		await fs.promises.mkdir(servicesDir, { recursive: true })

		await fs.promises.writeFile(join(modelsDir, "user.ts"), userModel)
		await fs.promises.writeFile(join(servicesDir, "user-service.ts"), userService)
		await fs.promises.writeFile(join(servicesDir, "auth-service.ts"), authService)
	}

	// 设置测试环境
	beforeAll(async () => {
		// 先清理之前可能残留的测试数据
		await beforeAllTests()

		// 创建临时目录
		tempDir = join(os.tmpdir(), `search-test-${Date.now()}`)
		await fs.promises.mkdir(tempDir, { recursive: true })

		// 创建测试文件
		await createTestFiles()

		// 计算数据库文件路径
		const workspaceId = generateWorkspaceId(tempDir)
		const extensionContext = getExtensionContext()
		if (extensionContext && extensionContext.globalStorageUri) {
			const dbDir = join(extensionContext.globalStorageUri.fsPath, "workspace_indexing")
			dbFilePath = join(dbDir, `${workspaceId}.db`)
		}

		// 创建搜索服务和索引服务
		searchService = new CodebaseSearchService(tempDir)
		indexService = new CodebaseIndexService(tempDir)

		// 执行索引
		const indexOptions: IndexOptions = {
			includePaths: ["src/**/*.ts"],
			excludePaths: [],
			includeTests: false,
		}

		await indexService.startIndexing(indexOptions)

		// 等待索引完成
		let indexCompleted = false
		const maxWaitTime = 60000 // 最多等待60秒
		const startTime = Date.now()

		while (!indexCompleted && Date.now() - startTime < maxWaitTime) {
			const progress = indexService.progress
			if (progress.status === "completed" || progress.status === "error") {
				indexCompleted = true
			} else {
				// 等待100毫秒
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}

		if (!indexCompleted) {
			throw new Error("索引超时")
		}
	})

	// 清理测试环境
	afterAll(async () => {
		// 关闭服务
		try {
			await indexService.close()
			// 确保资源彻底释放
			await new Promise((resolve) => setTimeout(resolve, 1000))
		} catch (error) {
			console.error("关闭索引服务失败:", error)
		}

		// 直接删除数据库文件
		if (dbFilePath && fs.existsSync(dbFilePath)) {
			try {
				// 尝试删除数据库文件
				for (let i = 0; i < 3; i++) {
					try {
						fs.unlinkSync(dbFilePath)
						console.log(`已删除数据库文件: ${dbFilePath}`)
						break
					} catch (err) {
						console.error(`删除数据库文件失败 (尝试 ${i + 1}/3): ${err.message}`)
						if (i < 2) {
							await new Promise((resolve) => setTimeout(resolve, 500))
						}
					}
				}
			} catch (err) {
				console.error(`无法删除数据库文件: ${err.message}`)
			}
		}

		// 删除临时目录
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true })
		} catch (error) {
			console.error("删除临时目录失败:", error)
		}

		// 使用辅助函数彻底清理
		await afterAllTests()
	})

	// 搜索测试 - 在测试环境中跳过
	it("应该能够搜索用户类", async () => {
		const results = await searchService.search("user class")

		expect(results.length).toBeGreaterThan(0)
		expect(results.some((r) => r.symbol === "User")).toBe(true)
	})

	it("应该能够搜索身份验证服务", async () => {
		const results = await searchService.search("authentication login")

		expect(results.length).toBeGreaterThan(0)
		expect(results.some((r) => r.symbol === "AuthenticationService")).toBe(true)
		expect(results.some((r) => r.symbol === "login")).toBe(true)
	})

	it("应该能够使用同义词扩展搜索", async () => {
		const results = await searchService.search("auth service")

		expect(results.length).toBeGreaterThan(0)
		expect(
			results.some((r) => r.symbol === "AuthenticationService" || r.context.includes("AuthenticationService")),
		).toBe(true)
	})

	it("应该能够按符号类型过滤结果", async () => {
		const results = await searchService.search("user", {
			resultType: [ResultType.Class],
		})

		expect(results.length).toBeGreaterThan(0)
		expect(results.every((r) => r.type === ResultType.Class)).toBe(true)
	})

	it("应该能够精确匹配符号名称", async () => {
		const results = await searchService.search('"getUserData"')

		expect(results.length).toBeGreaterThan(0)
		expect(results.some((r) => r.symbol === "getUserData")).toBe(true)
	})
})
