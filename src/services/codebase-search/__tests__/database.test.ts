import { Database } from "../database"
import { join, dirname, extname } from "path"
import * as fs from "fs"
import { expect } from "chai"
import * as SQLiteDatabase from "better-sqlite3"

describe("Database", () => {
	let db: Database
	let testDbPath: string

	beforeAll(async () => {
		// 检查 SQLite 依赖
		if (!SQLiteDatabase) {
			throw new Error("better-sqlite3 依赖未安装。请运行: npm install better-sqlite3 @types/better-sqlite3")
		}

		testDbPath = join(__dirname, "test.db")
		db = new Database(testDbPath)
		await db.initialize()
	})

	afterAll(async () => {
		await db.close()
		if (fs.existsSync(testDbPath)) {
			fs.unlinkSync(testDbPath)
		}
	})

	describe("数据库初始化测试", () => {
		it("应该能够正确初始化数据库连接", async () => {
			const integrity = await db.checkIntegrity()
			expect(integrity).to.be.true
		})
	})

	describe("SQL操作测试", () => {
		it("应该能够执行SQL语句", async () => {
			await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
			const result = await db.run("INSERT INTO test (name) VALUES (?)", ["test"])
			expect(result.changes).to.equal(1)
			expect(result.lastID).to.equal(1)
		})

		it("应该能够查询数据", async () => {
			const row = await db.get("SELECT * FROM test WHERE id = ?", [1])
			expect(row).to.deep.equal({ id: 1, name: "test" })
		})

		it("应该能够查询多行数据", async () => {
			await db.run("INSERT INTO test (name) VALUES (?)", ["test2"])
			const rows = await db.all("SELECT * FROM test")
			expect(rows).to.have.length(2)
		})
	})

	describe("事务测试", () => {
		it("应该能够正确处理事务", async () => {
			await db.beginTransaction()
			try {
				await db.run("INSERT INTO test (name) VALUES (?)", ["transaction"])
				await db.commit()
			} catch (error) {
				await db.rollback()
				throw error
			}

			const row = await db.get("SELECT * FROM test WHERE name = ?", ["transaction"])
			expect(row).to.exist
		})
	})

	describe("错误处理测试", () => {
		it("应该能够处理SQL错误", async () => {
			try {
				await db.exec("INVALID SQL")
				expect.fail("应该抛出错误")
			} catch (error) {
				expect(error.message).to.include("SQL执行错误")
			}
		})
	})
})
