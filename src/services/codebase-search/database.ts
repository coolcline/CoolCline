/**
 * SQLite数据库适配层 (使用sql.js WebAssembly实现)
 */
import * as fs from "fs"
import * as vscode from "vscode"
import { toPosixPath, dirname, join } from "../../utils/path"
// 替换为sql.js
import initSqlJs from "sql.js"
import type { Database as SqlJsDatabase } from "sql.js"
import { getExtensionContext } from "./extension-context"
import * as os from "os"
import * as crypto from "crypto"

// 全局变量用于存储SQL.js初始化状态
let SQL: any = null
let sqlJsInitPromise: Promise<any> | null = null

// 使用常量来标识内存数据库模式，避免使用特殊文件名
const MEMORY_DB_MODE = Symbol("MEMORY_DB_MODE")

/**
 * 获取SQL.js WASM文件路径
 */
function getSqlJsWasmPath(): string {
	// 首先尝试从扩展上下文获取路径
	try {
		const extensionPath = vscode.extensions.getExtension("CoolCline.coolcline")?.extensionPath
		if (extensionPath) {
			const wasmPath = join(extensionPath, "node_modules", "sql.js", "dist", "sql-wasm.wasm")
			if (fs.existsSync(wasmPath)) {
				return wasmPath
			}
		}
	} catch (error) {
		console.error("Error getting extension path:", error)
	}

	// 如果无法从扩展路径获取，尝试使用当前文件所在的目录结构推断
	try {
		// 尝试使用当前模块所在目录
		const currentDir = __dirname
		const possiblePaths = [
			// 正常的node_modules路径
			join(currentDir, "..", "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
			// 打包后可能的路径
			join(currentDir, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
			// 扩展根目录下可能的路径
			join(currentDir, "..", "..", "sql-wasm.wasm"),
		]

		for (const possiblePath of possiblePaths) {
			if (fs.existsSync(possiblePath)) {
				return possiblePath
			}
		}
	} catch (error) {
		console.error("Error finding WASM file path:", error)
	}

	// 如果找不到，返回默认路径，依赖sql.js自己的定位功能
	return "sql-wasm.wasm"
}

/**
 * 初始化SQL.js一次
 */
async function initSqlJsOnce(): Promise<any> {
	if (SQL) {
		return SQL
	}

	if (sqlJsInitPromise) {
		return sqlJsInitPromise
	}

	const wasmPath = getSqlJsWasmPath()

	sqlJsInitPromise = initSqlJs({
		// 定位WebAssembly文件
		locateFile: (filename: string) => {
			if (filename === "sql-wasm.wasm") {
				// 尝试使用绝对路径
				if (fs.existsSync(wasmPath) && wasmPath.startsWith("/")) {
					return `file://${wasmPath}`
				}
				// 使用相对路径
				return wasmPath
			}
			return filename
		},
	}).catch((error: Error) => {
		console.error("SQL.js initialization failed:", error)

		// 如果自定义路径失败，尝试默认初始化方式
		sqlJsInitPromise = null
		return initSqlJs()
	})

	try {
		SQL = await sqlJsInitPromise
		return SQL
	} catch (error) {
		console.error("SQL.js initialization failed with default options:", error)
		sqlJsInitPromise = null
		throw error
	}
}

/**
 * SQLite数据库封装类
 */
export class Database {
	private db: SqlJsDatabase | null = null
	private dbPath: string
	private isInitialized: boolean = false
	private isMemoryMode: boolean = false
	private tempFilePath: string | null = null

	/**
	 * 构造函数
	 * @param dbPath 数据库文件路径或MEMORY_DB_MODE标识
	 */
	constructor(dbPath: string | typeof MEMORY_DB_MODE) {
		if (dbPath === MEMORY_DB_MODE) {
			// 内存模式 - 使用临时文件
			this.isMemoryMode = true
			this.tempFilePath = this.createTempDbPath()
			this.dbPath = this.tempFilePath
		} else {
			// 正常文件模式
			this.isMemoryMode = false
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
			// 确保目录存在
			const dir = dirname(this.dbPath)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}

			// 初始化SQL.js
			const SQL = await initSqlJsOnce()

			// 尝试从文件读取数据库内容
			if (!this.isMemoryMode && fs.existsSync(this.dbPath)) {
				try {
					const data = fs.readFileSync(this.dbPath)
					this.db = new SQL.Database(data)
				} catch (readError) {
					console.error(`读取数据库文件失败: ${readError.message}`)
					this.db = new SQL.Database()
				}
			} else {
				// 创建新的数据库
				this.db = new SQL.Database()

				// 如果不是内存数据库，立即保存空数据库文件
				if (!this.isMemoryMode) {
					await this.saveToFile()
				}
			}

			this.isInitialized = true
		} catch (err) {
			console.error("数据库初始化失败:", err)
			throw new Error(`数据库初始化失败: ${err.message}`)
		}
	}

	/**
	 * 保存数据库到文件
	 */
	private async saveToFile(): Promise<void> {
		if (!this.db) return

		try {
			const data = this.db.export()
			fs.writeFileSync(this.dbPath, Buffer.from(data))
		} catch (err) {
			console.error("Failed to save database:", err)
			throw new Error(`保存数据库失败: ${err.message}`)
		}
	}

	/**
	 * 执行SQL语句
	 * @param sql SQL语句
	 */
	public async exec(sql: string): Promise<void> {
		await this.ensureInitialized()
		try {
			this.db!.exec(sql)

			// 检查是否在事务中，如果不在事务中则保存文件
			// 如果在事务中，会在commit时保存
			const inTransaction = await this.isInTransaction()
			if (!inTransaction) {
				await this.saveToFile()
			}
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
			// 执行SQL并获取结果
			// sql.js与better-sqlite3的API不同，需要使用exec或prepare+step
			const statement = this.db!.prepare(sql)
			statement.bind(params)
			statement.step()
			statement.free()

			// 获取最后一个插入的ID
			const lastIDResult = this.db!.exec("SELECT last_insert_rowid() as lastID")
			const lastID =
				lastIDResult.length > 0 && lastIDResult[0].values.length > 0 ? Number(lastIDResult[0].values[0][0]) : 0

			// 获取影响的行数
			const changesResult = this.db!.exec("SELECT changes() as changes")
			const changes =
				changesResult.length > 0 && changesResult[0].values.length > 0
					? Number(changesResult[0].values[0][0])
					: 0

			// 检查是否在事务中，如果不在事务中则保存文件
			// 如果在事务中，会在commit时保存
			const inTransaction = await this.isInTransaction()
			if (!inTransaction) {
				await this.saveToFile()
			}

			return { lastID, changes }
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
			const statement = this.db!.prepare(sql)
			statement.bind(params)

			// 获取单行结果
			const result = statement.step() ? this.rowToObject(statement) : null
			statement.free()
			return result
		} catch (err) {
			console.error("SQL查询错误:", err)
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
			const statement = this.db!.prepare(sql)
			statement.bind(params)

			const results: any[] = []
			while (statement.step()) {
				results.push(this.rowToObject(statement))
			}
			statement.free()
			return results
		} catch (err) {
			console.error("SQL查询错误:", err)
			throw new Error(`SQL查询错误: ${err.message}`)
		}
	}

	/**
	 * 将语句当前行转换为对象
	 * @param statement SQL语句对象
	 * @returns 对象形式的行数据
	 */
	private rowToObject(statement: any): any {
		const columns = statement.getColumnNames()
		const values = statement.get()
		const result: Record<string, any> = {}

		columns.forEach((col: string, i: number) => {
			result[col] = values[i]
		})

		return result
	}

	/**
	 * 开始事务
	 */
	public async beginTransaction(): Promise<void> {
		await this.ensureInitialized()
		try {
			this.db!.exec("BEGIN TRANSACTION")
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
			// sql.js 中如果没有活动的事务，commit 会失败
			// 先检查是否有活动的事务
			const inTransaction = await this.isInTransaction()
			if (inTransaction) {
				this.db!.exec("COMMIT")
				await this.saveToFile() // 提交后保存
			} else {
				// console.warn("尝试提交事务，但当前没有活动的事务")
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
			// sql.js 中如果没有活动的事务，rollback 会失败
			// 先检查是否有活动的事务
			const inTransaction = await this.isInTransaction()
			if (inTransaction) {
				this.db!.exec("ROLLBACK")
				await this.saveToFile() // 回滚后保存
			} else {
				console.warn("尝试回滚事务，但当前没有活动的事务")
			}
		} catch (err) {
			console.error("事务回滚错误:", err)
			throw new Error(`事务回滚错误: ${err.message}`)
		}
	}

	/**
	 * 检查是否在事务中
	 * @returns 是否在事务中
	 */
	private async isInTransaction(): Promise<boolean> {
		try {
			// SQL.js 的 transaction_active 可能不起作用，使用额外检查
			const result = await this.get("PRAGMA transaction_active")

			// 如果返回值有效，直接使用它
			if (result && result.transaction_active !== undefined) {
				return result.transaction_active === 1
			}

			// 尝试执行一个只在事务外才能执行的操作
			try {
				// 这将抛出错误如果在事务中，因为不能嵌套事务
				const stmt = this.db!.prepare("BEGIN IMMEDIATE")
				try {
					stmt.step()
					// 如果能执行，说明不在事务中
					// 需要立即提交这个临时事务
					this.db!.exec("COMMIT")
					return false
				} finally {
					stmt.free()
				}
			} catch (err) {
				// 如果抛出错误，可能在事务中
				return true
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
	 * 关闭数据库连接
	 */
	public async close(): Promise<void> {
		if (this.db) {
			this.db.close()
			this.db = null
		}

		// 如果是内存模式，删除临时文件
		if (this.isMemoryMode && this.tempFilePath && fs.existsSync(this.tempFilePath)) {
			try {
				fs.unlinkSync(this.tempFilePath)
			} catch (error) {
				console.error(`删除临时数据库文件失败: ${error.message}`)
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
 * 创建数据库实例
 * @param workspacePath 工作区路径
 * @returns 数据库实例
 */
export async function createDatabase(workspacePath: string): Promise<Database> {
	// 获取扩展上下文
	const extensionContext = getExtensionContext()
	if (!extensionContext) {
		throw new Error("扩展上下文未初始化，无法创建数据库")
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

	// 检查数据库文件是否存在
	const dbExists = fs.existsSync(dbPath)

	// 创建数据库实例
	const db = new Database(dbPath)
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
				content_hash TEXT
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
function generateWorkspaceId(workspacePath: string): string {
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

/**
 * 创建内存数据库实例（用于测试）
 * @returns 内存数据库实例
 */
export async function createInMemoryDatabase(): Promise<Database> {
	const db = new Database(MEMORY_DB_MODE)
	await db.initialize()
	return db
}
