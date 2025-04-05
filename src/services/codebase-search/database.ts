/**
 * SQLite数据库适配层 (使用@vscode/sqlite3原生实现)
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { toPosixPath, dirname, join } from "../../utils/path"
// 替换为@vscode/sqlite3
import * as sqlite3 from "@vscode/sqlite3"
import { getExtensionContext } from "./extension-context"
import * as os from "os"
import * as crypto from "crypto"

// 使用常量来标识测试模式
const TEST_MODE = Symbol("TEST_MODE")

// 数据库打开模式
const OPEN_MODE = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE

/**
 * SQLite数据库封装类
 */
export class Database {
	private db: sqlite3.Database | null = null
	private dbPath: string
	private isInitialized: boolean = false
	private isTestMode: boolean = false

	/**
	 * 构造函数
	 * @param dbPath 数据库文件路径或TEST_MODE标识
	 */
	constructor(dbPath: string | typeof TEST_MODE) {
		if (dbPath === TEST_MODE) {
			// 测试模式 - 在@vscode/sqlite3中使用":memory:"
			this.isTestMode = true
			this.dbPath = ":memory:"
		} else {
			// 正常文件模式
			this.isTestMode = false
			this.dbPath = toPosixPath(dbPath as string)
		}
	}

	/**
	 * 创建临时数据库文件路径
	 */
	private createTempDbPath(): string {
		const tempDir = os.tmpdir()
		const randomId = crypto.randomBytes(8).toString("hex")
		return toPosixPath(join(tempDir, `coolcline-temp-${randomId}.db`))
	}

	/**
	 * 初始化数据库连接
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// 确保目录存在(只在文件模式下)
			if (!this.isTestMode) {
				const dir = dirname(this.dbPath)
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true })
				}
			}

			// 创建并配置数据库连接 - 所有逻辑都在这个方法内处理
			const success = await this.createDatabaseConnection()

			this.isInitialized = success

			if (!success) {
				throw new Error("数据库初始化失败：连接创建失败")
			}
		} catch (err) {
			this.isInitialized = false
			console.error("数据库初始化失败:", err)
			throw new Error(`数据库初始化失败: ${err.message}`)
		}
	}

	/**
	 * 创建并配置数据库连接
	 * 包含所有连接、检查和配置逻辑
	 * @returns 是否成功创建并配置数据库
	 */
	private async createDatabaseConnection(): Promise<boolean> {
		try {
			// 测试模式 - 直接创建内存数据库
			if (this.isTestMode) {
				this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
					const db = new sqlite3.Database(":memory:", OPEN_MODE, (err) => {
						if (err) {
							reject(err)
						} else {
							resolve(db)
						}
					})
				})

				// 配置数据库
				await this.configureDatabaseSettings()
				return true
			}

			// 以下是文件模式的处理
			// 检查文件是否存在
			const fileExists = fs.existsSync(this.dbPath)

			if (!fileExists) {
				// 文件不存在，直接创建新数据库
				this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
					const db = new sqlite3.Database(this.dbPath, OPEN_MODE, (err) => {
						if (err) {
							reject(err)
						} else {
							resolve(db)
						}
					})
				})

				// 配置数据库
				await this.configureDatabaseSettings()
				return true
			}

			// 文件存在，检查兼容性
			const canOpen = await this.tryOpenDatabase()

			if (!canOpen) {
				// 文件存在但无法打开，可能是旧格式，删除它
				console.log("检测到旧格式数据库文件，正在删除...", this.dbPath)
				fs.unlinkSync(this.dbPath)

				// 创建新数据库
				this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
					const db = new sqlite3.Database(this.dbPath, OPEN_MODE, (err) => {
						if (err) {
							reject(err)
						} else {
							resolve(db)
						}
					})
				})

				// 配置数据库
				await this.configureDatabaseSettings()
				return true
			} else {
				// 可以正常打开，无需重新配置
				return true
			}
		} catch (error) {
			// 出现异常，清理并重新创建
			console.error("创建数据库连接时出错:", error)

			// 如果是文件模式且文件存在，尝试删除
			if (!this.isTestMode && fs.existsSync(this.dbPath)) {
				try {
					fs.unlinkSync(this.dbPath)
				} catch (unlinkErr) {
					console.error("删除损坏的数据库文件失败:", unlinkErr)
				}
			}

			// 尝试重新创建数据库
			try {
				this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
					const db = new sqlite3.Database(this.isTestMode ? ":memory:" : this.dbPath, OPEN_MODE, (err) => {
						if (err) {
							reject(err)
						} else {
							resolve(db)
						}
					})
				})

				// 配置数据库
				await this.configureDatabaseSettings()
				return true
			} catch (retryErr) {
				console.error("重试创建数据库失败:", retryErr)
				return false
			}
		}
	}

	/**
	 * 配置数据库设置
	 */
	private async configureDatabaseSettings(): Promise<void> {
		try {
			// 设置PRAGMA配置
			await new Promise<void>((resolve, reject) => {
				this.db!.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;", (err) => {
					if (err) {
						console.error("设置数据库配置失败:", err)
						reject(err)
					} else {
						resolve()
					}
				})
			})
		} catch (err) {
			console.error("配置数据库设置失败:", err)
			throw err
		}
	}

	/**
	 * 尝试打开数据库文件，检查是否为有效的SQLite文件
	 * @returns 是否成功打开
	 */
	private async tryOpenDatabase(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			try {
				// 尝试打开数据库
				const testDb = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE, (err) => {
					if (err) {
						// 打开失败，可能是文件不存在或格式不兼容
						resolve(false)
						return
					}

					// 尝试执行完整性检查
					testDb.get("PRAGMA integrity_check", (integrityErr, result) => {
						if (integrityErr || !result || result.integrity_check !== "ok") {
							// 完整性检查失败
							// 关闭测试连接
							testDb.close(() => {})
							resolve(false)
						} else {
							// 文件有效，继续使用
							this.db = testDb
							// console.log("数据库完整性检查通过，连接已保存")
							resolve(true)
						}
					})
				})
			} catch (error) {
				// 出现异常，无法打开
				resolve(false)
			}
		})
	}

	/**
	 * 执行SQL语句
	 * @param sql SQL语句
	 */
	public async exec(sql: string): Promise<void> {
		await this.ensureInitialized()
		try {
			await new Promise<void>((resolve, reject) => {
				this.db!.exec(sql, (err) => {
					if (err) {
						reject(err)
					} else {
						resolve()
					}
				})
			})
		} catch (err) {
			// console.error("SQL执行错误:", err)
			throw new Error(`SQL执行错误: ${err.message}`)
		}
	}

	/**
	 * 执行带参数的SQL语句
	 * @param sql SQL语句
	 * @param params 参数数组
	 * @returns 影响的行数和最后插入的ID
	 */
	public async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
		await this.ensureInitialized()
		try {
			return await new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
				this.db!.run(sql, params, function (err) {
					if (err) {
						reject(err)
					} else {
						resolve({ lastID: this.lastID, changes: this.changes })
					}
				})
			})
		} catch (err) {
			console.error("SQL运行错误:", err)
			// 返回默认结果，而不是抛出异常
			return { lastID: 0, changes: 0 }
		}
	}

	/**
	 * 查询单行数据
	 * @param sql SQL语句
	 * @param params 参数数组
	 * @returns 查询结果对象或null（如果查询出错或未找到）
	 */
	public async get(sql: string, params: any[] = []): Promise<any | null> {
		await this.ensureInitialized()
		try {
			return await new Promise<any>((resolve, reject) => {
				this.db!.get(sql, params, (err, row) => {
					if (err) {
						reject(err)
					} else {
						resolve(row || null)
					}
				})
			})
		} catch (err) {
			// console.error("SQL查询错误:", err)
			// console.error("SQL查询错误sql:", sql)
			// console.error("SQL查询错误params:", params)
			// 不抛出异常，而是返回null
			return null
		}
	}

	/**
	 * 查询多行数据
	 * @param sql SQL语句
	 * @param params 参数数组
	 * @returns 查询结果数组
	 */
	public async all(sql: string, params: any[] = []): Promise<any[]> {
		await this.ensureInitialized()
		try {
			return await new Promise<any[]>((resolve, reject) => {
				this.db!.all(sql, params, (err, rows) => {
					if (err) {
						reject(err)
					} else {
						resolve(rows)
					}
				})
			})
		} catch (err) {
			// console.error("SQL查询错误:", err)
			throw new Error(`SQL查询错误: ${err.message}`)
		}
	}

	/**
	 * 为兼容性保留此方法，但在@vscode/sqlite3中不需要
	 */
	private rowToObject(statement: any): any {
		return statement
	}

	/**
	 * 开始事务
	 */
	public async beginTransaction(): Promise<void> {
		await this.ensureInitialized()
		try {
			// 严格检查事务状态
			const inTransaction = await this.get("PRAGMA transaction_active")
			if (inTransaction && inTransaction.transaction_active === 1) {
				console.log("数据库已在事务中，跳过开始新事务")
				return
			}

			// 尝试执行BEGIN IMMEDIATE来检测嵌套事务
			try {
				await this.exec("BEGIN IMMEDIATE")
			} catch (beginErr) {
				if (beginErr.message && beginErr.message.includes("within a transaction")) {
					console.log("检测到事务嵌套，跳过开始新事务")
					return
				}
				throw beginErr
			}
		} catch (err) {
			console.error("事务开始错误:", err)
			throw new Error(`事务开始错误: ${err.message}`)
		}
	}

	/**
	 * 提交事务
	 */
	public async commit(): Promise<void> {
		await this.ensureInitialized()
		try {
			const inTransaction = await this.isInTransaction()
			if (inTransaction) {
				await this.exec("COMMIT")
			}
		} catch (err) {
			console.error("事务提交错误:", err)
			throw new Error(`事务提交错误: ${err.message}`)
		}
	}

	/**
	 * 回滚事务
	 */
	public async rollback(): Promise<void> {
		await this.ensureInitialized()
		try {
			const inTransaction = await this.isInTransaction()
			if (inTransaction) {
				await this.exec("ROLLBACK")
			} else {
				console.warn("尝试回滚事务，但当前没有活动的事务")
			}
		} catch (err) {
			console.error("事务回滚错误:", err)
			throw new Error(`事务回滚错误: ${err.message}`)
		}
	}

	/**
	 * 为兼容性保留此方法
	 */
	private async _isInTransaction(): Promise<boolean> {
		return this.isInTransaction()
	}

	/**
	 * 检查是否在事务中
	 * @returns 是否在事务中
	 */
	public async isInTransaction(): Promise<boolean> {
		await this.ensureInitialized()
		try {
			// 使用BEGIN IMMEDIATE和ROLLBACK来检测事务状态
			try {
				await this.exec("BEGIN IMMEDIATE")
				await this.exec("ROLLBACK")
				return false
			} catch (err) {
				if (err.message && err.message.includes("within a transaction")) {
					return true
				}
				throw err
			}
		} catch (err) {
			console.error("检查事务状态错误:", err)
			return false
		}
	}

	/**
	 * 检查数据库完整性
	 * @returns 是否通过完整性检查
	 */
	public async checkIntegrity(): Promise<boolean> {
		try {
			const result = await this.get("PRAGMA integrity_check")
			return result && result.integrity_check === "ok"
		} catch (err) {
			console.error("数据库完整性检查失败:", err)
			return false
		}
	}

	/**
	 * 保存数据库到文件 - @vscode/sqlite3 自动处理，此方法仅为兼容性保留
	 */
	private async saveToFile(): Promise<void> {
		// @vscode/sqlite3 自动管理文件，不需要手动保存
		return
	}

	/**
	 * 关闭数据库连接
	 */
	public async close(): Promise<void> {
		if (this.db) {
			try {
				// 确保所有未完成的事务被回滚
				if (await this.isInTransaction()) {
					await this.rollback()
				}

				// 关闭数据库连接
				await new Promise<void>((resolve, reject) => {
					this.db!.close((err) => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					})
				})
				this.db = null
			} catch (error) {
				console.error(`关闭数据库时出错: ${error.message}`)

				// 即使出错也尝试关闭
				if (this.db) {
					try {
						this.db.close(() => {})
					} catch (e) {
						// 忽略二次错误
					}
					this.db = null
				}
			}
		}

		this.isInitialized = false
	}

	/**
	 * 确保数据库已初始化
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize()
		}
	}
}

/**
 * 获取数据库实例
 * @param workspacePath 工作区路径
 * @returns 数据库实例
 */
export async function getDatabaseInstance(workspacePath: string): Promise<Database> {
	// 获取扩展上下文
	const extensionContext = getExtensionContext()
	if (!extensionContext) {
		throw new Error("扩展上下文未初始化，无法获取数据库实例")
	}

	// 从工作区路径生成唯一标识符(哈希)
	const workspaceId = generateWorkspaceId(workspacePath)

	// 创建数据库文件路径 (使用工作区ID作为文件名)
	const dbPath = toPosixPath(
		join(extensionContext.globalStorageUri.fsPath, "workspace_indexing", `${workspaceId}.db`),
	)

	// 检查目录是否存在，不存在则创建
	const dbDir = dirname(dbPath)
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true })
	}

	// 简单的标记文件，用于识别数据库版本
	const versionMarkerPath = toPosixPath(
		join(extensionContext.globalStorageUri.fsPath, "workspace_indexing", `${workspaceId}.v1`),
	)

	// 检查数据库文件是否存在但没有版本标记，如果是则删除重建
	if (fs.existsSync(dbPath) && !fs.existsSync(versionMarkerPath)) {
		console.log("检测到可能是旧版本的数据库，将删除并重建")
		try {
			fs.unlinkSync(dbPath)
		} catch (e) {
			console.error("删除旧数据库文件失败:", e)
		}
	}

	// 创建数据库实例
	const db = new Database(dbPath)
	await db.initialize()

	// 初始化数据库表结构
	await initDatabaseSchema(db)

	// 设置数据库版本标记
	await db.exec("PRAGMA user_version = 1")

	// 创建版本标记文件
	try {
		fs.writeFileSync(versionMarkerPath, "v1", { encoding: "utf8" })
	} catch (e) {
		console.warn("创建版本标记文件失败:", e)
	}

	return db
}

/**
 * 获取测试用数据库实例
 * @returns 测试用数据库实例
 */
export async function getTestDatabaseInstance(): Promise<Database> {
	const db = new Database(TEST_MODE)
	await db.initialize()

	// 初始化数据库表结构
	await initDatabaseSchema(db)

	return db
}

/**
 * 初始化数据库表结构
 * @param db 数据库实例
 */
async function initDatabaseSchema(db: Database): Promise<void> {
	try {
		// 创建所需的表
		await db.exec(`
			-- 工作区元数据表
			CREATE TABLE IF NOT EXISTS workspace_meta (
				key TEXT PRIMARY KEY,
				value TEXT,
				updated_at INTEGER
			);

			-- 文件索引表
			CREATE TABLE IF NOT EXISTS files (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				path TEXT UNIQUE,
				language TEXT,
				last_modified INTEGER,
				indexed_at INTEGER,
				content_hash INTEGER
			);

			-- 符号表
			CREATE TABLE IF NOT EXISTS symbols (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				file_id INTEGER,
				name TEXT,
				type TEXT,
				signature TEXT,
				line INTEGER,
				column INTEGER,
				parent_id INTEGER,
				FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
			);

			-- 符号内容表(存储上下文)
			CREATE TABLE IF NOT EXISTS symbol_contents (
				symbol_id INTEGER PRIMARY KEY,
				content TEXT,
				FOREIGN KEY(symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
			);

			-- 关键词-符号关联表(倒排索引)
			CREATE TABLE IF NOT EXISTS keywords (
				keyword TEXT,
				symbol_id INTEGER,
				relevance REAL,
				PRIMARY KEY(keyword, symbol_id),
				FOREIGN KEY(symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
			);

			-- 符号关系表
			CREATE TABLE IF NOT EXISTS symbol_relations (
				source_id INTEGER,
				target_id INTEGER,
				relation_type TEXT,
				PRIMARY KEY(source_id, target_id, relation_type),
				FOREIGN KEY(source_id) REFERENCES symbols(id) ON DELETE CASCADE,
				FOREIGN KEY(target_id) REFERENCES symbols(id) ON DELETE CASCADE
			);
		`)

		// 创建性能索引
		await db.exec(`
			-- 文件路径索引
			CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
			CREATE INDEX IF NOT EXISTS idx_content_hash ON files(content_hash);

			-- 符号索引
			CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
			CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
			CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
			CREATE INDEX IF NOT EXISTS idx_symbols_parent ON symbols(parent_id);

			-- 关键词索引
			CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
			CREATE INDEX IF NOT EXISTS idx_keywords_symbol ON keywords(symbol_id);

			-- 符号关系索引
			CREATE INDEX IF NOT EXISTS idx_symbol_relations_source ON symbol_relations(source_id);
			CREATE INDEX IF NOT EXISTS idx_symbol_relations_target ON symbol_relations(target_id);
			CREATE INDEX IF NOT EXISTS idx_symbol_relations_type ON symbol_relations(relation_type);
		`)

		// 初始化工作区元数据
		await db.run("INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)", [
			"schema_version",
			"1.0",
			Date.now(),
		])
	} catch (error) {
		console.error("初始化数据库表结构失败:", error)
		throw error
	}
}

/**
 * 生成工作区唯一标识符
 * @param workspacePath 工作区路径
 * @returns 唯一标识符
 */
export function generateWorkspaceId(workspacePath: string): string {
	// 简单方法：使用路径的哈希值
	let hash = 0
	for (let i = 0; i < workspacePath.length; i++) {
		const char = workspacePath.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // 转换为32位整数
	}

	// 确保是正数并转为十六进制
	const positiveHash = Math.abs(hash).toString(16)
	return positiveHash
}
