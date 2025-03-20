/**
 * 数据库测试
 */
import * as fs from "fs"
import { expect } from "chai"
import { join } from "../../../utils/path"
import { Database, createInMemoryDatabase } from "../database"

describe("数据库", () => {
	// 创建临时测试文件路径
	const tempPath = join(__dirname, "test.db")
	let db: Database

	// 使用随机后缀生成唯一的表名，避免冲突
	const getUniqueTableName = (base: string) => `${base}_${Math.floor(Math.random() * 100000)}`

	// 测试前检查依赖
	beforeAll(() => {
		// 确保存在sql.js依赖，这可以通过是否能成功导入Database类来判断
		if (!Database) {
			throw new Error("数据库模块未正确加载。请确认已安装sql.js依赖")
		}
	})

	// 每个测试前准备环境
	beforeEach(async () => {
		// 确保不存在残留的测试数据库
		if (fs.existsSync(tempPath)) {
			fs.unlinkSync(tempPath)
		}

		// 创建测试数据库
		db = new Database(tempPath)
		await db.initialize()
	})

	// 每个测试后清理环境
	afterEach(async () => {
		// 关闭数据库连接
		await db.close()

		// 删除测试数据库文件
		if (fs.existsSync(tempPath)) {
			fs.unlinkSync(tempPath)
		}
	})

	// 测试数据库初始化
	it("应该能够初始化数据库", async () => {
		expect(db).to.exist
	})

	// 测试执行简单SQL
	it("应该能够执行SQL语句", async () => {
		const tableName = getUniqueTableName("test")
		await db.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`)
		await db.exec(`INSERT INTO ${tableName} (name) VALUES ('test1')`)
		await db.exec(`INSERT INTO ${tableName} (name) VALUES ('test2')`)

		const results = await db.all(`SELECT * FROM ${tableName}`)
		expect(results.length).to.equal(2)
		expect(results[0].name).to.equal("test1")
		expect(results[1].name).to.equal("test2")
	})

	// 测试带参数的SQL
	it("应该能够执行带参数的SQL语句", async () => {
		const tableName = getUniqueTableName("test")
		await db.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`)

		const result = await db.run(`INSERT INTO ${tableName} (name) VALUES (?)`, ["测试名称"])
		expect(result.lastID).to.be.greaterThan(0)

		const row = await db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [result.lastID])
		expect(row).to.exist
		expect(row.name).to.equal("测试名称")
	})

	// 测试事务支持
	it("应该支持事务操作", async () => {
		const tableName = getUniqueTableName("test")
		await db.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`)

		// 手动检查事务状态 (直接执行操作而不依赖isInTransaction)

		// 测试提交事务
		await db.beginTransaction()

		await db.run(`INSERT INTO ${tableName} (name) VALUES (?)`, ["事务1"])
		await db.commit()

		let count = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`)
		expect(count.count).to.equal(1)

		// 测试回滚事务
		await db.beginTransaction()

		await db.run(`INSERT INTO ${tableName} (name) VALUES (?)`, ["事务2"])

		// 检查数据暂时存在
		let tempResult = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`)
		expect(tempResult.count).to.equal(2)

		// 回滚事务
		await db.rollback()

		// 检查数据被回滚
		count = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`)
		expect(count.count).to.equal(1)
	})

	// 测试内存数据库
	it("应该能够创建内存数据库", async () => {
		const tableName = getUniqueTableName("memtest")
		const memDb = await createInMemoryDatabase()

		await memDb.exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, value TEXT)`)
		await memDb.run(`INSERT INTO ${tableName} (value) VALUES (?)`, ["内存测试"])

		const row = await memDb.get(`SELECT * FROM ${tableName}`)
		expect(row).to.exist
		expect(row.value).to.equal("内存测试")

		await memDb.close()
	})
})
