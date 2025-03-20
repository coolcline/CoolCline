/**
 * SQLite数据库适配层
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { toPosixPath, dirname, join } from "../../utils/path"

// 声明模块，解决类型问题
/* 暂时注释，避免编译错误
declare module 'better-sqlite3' {
  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }

  export interface Statement {
    run(...params: any[]): { lastInsertRowid: number | bigint, changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  export default function(filename: string, options?: any): Database;
}
*/

// 由于SQLite需要原生依赖，我们将使用动态导入
let sqlite3: any = null

/**
 * SQLite数据库封装类
 */
export class Database {
	private db: any
	private dbPath: string
	private isInitialized: boolean = false

	/**
	 * 构造函数
	 * @param dbPath 数据库文件路径
	 */
	constructor(dbPath: string) {
		this.dbPath = toPosixPath(dbPath)
	}

	/**
	 * 初始化数据库连接
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// 确保目录存在
			const dir = dirname(this.dbPath)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}

			// 动态导入better-sqlite3
			if (!sqlite3) {
				try {
					// 优先尝试使用better-sqlite3
					// 暂时注释，避免编译错误
					// const betterSqlite3 = await import('better-sqlite3');
					// sqlite3 = betterSqlite3.default;
					console.log("SQLite功能暂时禁用")
				} catch (err) {
					console.error("Failed to load better-sqlite3:", err)
					throw new Error("SQLite数据库初始化失败: 无法加载better-sqlite3")
				}
			}

			// 打开数据库连接
			this.db = new sqlite3(this.dbPath, { fileMustExist: false })
			this.isInitialized = true
		} catch (err) {
			console.error("Database initialization failed:", err)
			throw new Error(`数据库初始化失败: ${err.message}`)
		}
	}

	/**
	 * 执行SQL语句
	 * @param sql SQL语句
	 */
	public async exec(sql: string): Promise<void> {
		await this.ensureInitialized()
		try {
			this.db.exec(sql)
		} catch (err) {
			console.error("SQL执行错误:", err)
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
			const stmt = this.db.prepare(sql)
			const result = stmt.run(...params)
			return {
				lastID: result.lastInsertRowid ? Number(result.lastInsertRowid) : 0,
				changes: result.changes || 0,
			}
		} catch (err) {
			console.error("SQL运行错误:", err)
			throw new Error(`SQL运行错误: ${err.message}`)
		}
	}

	/**
	 * 查询单行数据
	 * @param sql SQL语句
	 * @param params 参数数组
	 * @returns 查询结果对象
	 */
	public async get(sql: string, params: any[] = []): Promise<any> {
		await this.ensureInitialized()
		try {
			const stmt = this.db.prepare(sql)
			return stmt.get(...params)
		} catch (err) {
			console.error("SQL查询错误:", err)
			throw new Error(`SQL查询错误: ${err.message}`)
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
			const stmt = this.db.prepare(sql)
			return stmt.all(...params)
		} catch (err) {
			console.error("SQL查询错误:", err)
			throw new Error(`SQL查询错误: ${err.message}`)
		}
	}

	/**
	 * 开始事务
	 */
	public async beginTransaction(): Promise<void> {
		await this.exec("BEGIN TRANSACTION")
	}

	/**
	 * 提交事务
	 */
	public async commit(): Promise<void> {
		await this.exec("COMMIT")
	}

	/**
	 * 回滚事务
	 */
	public async rollback(): Promise<void> {
		await this.exec("ROLLBACK")
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
	 * 关闭数据库连接
	 */
	public async close(): Promise<void> {
		if (this.db) {
			this.db.close()
			this.isInitialized = false
		}
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
 * 创建数据库实例
 * @param workspacePath 工作区路径
 * @returns 数据库实例
 */
export async function createDatabase(workspacePath: string): Promise<Database> {
	// 创建数据库文件路径
	const dbPath = toPosixPath(join(workspacePath, ".coolcline", "indices", "codebase_search.db"))

	// 创建数据库实例
	const db = new Database(dbPath)
	await db.initialize()

	return db
}

/**
 * 创建内存数据库实例（用于测试）
 * @returns 内存数据库实例
 */
export async function createInMemoryDatabase(): Promise<Database> {
	const db = new Database(":memory:")
	await db.initialize()
	return db
}
