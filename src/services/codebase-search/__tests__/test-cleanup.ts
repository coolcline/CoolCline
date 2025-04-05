/**
 * 测试清理辅助工具
 */
import * as fs from "fs"
import * as path from "path"

/**
 * 查找并删除所有测试数据库文件
 */
export async function cleanupTestDatabases(): Promise<void> {
	const testStoragePath = path.join(__dirname, "test-storage")

	// 延长等待时间以确保所有数据库连接已经关闭
	await new Promise((resolve) => setTimeout(resolve, 1500))

	// 如果测试存储目录存在
	if (fs.existsSync(testStoragePath)) {
		// 先检查并删除workspace_indexing子目录中的.db文件
		const indexingDir = path.join(testStoragePath, "workspace_indexing")
		if (fs.existsSync(indexingDir)) {
			try {
				// 删除所有.db文件
				const files = fs.readdirSync(indexingDir)
				for (const file of files) {
					if (file.endsWith(".db") || file.endsWith(".db-journal")) {
						const dbPath = path.join(indexingDir, file)
						try {
							// 先尝试使用rmSync强制删除
							fs.rmSync(dbPath, { force: true })
							console.log(`已删除测试数据库文件: ${dbPath}`)
						} catch (err) {
							console.error(`rmSync删除失败: ${dbPath}`, err)
							// 作为备选方案尝试unlinkSync
							try {
								fs.unlinkSync(dbPath)
								console.log(`使用unlink删除数据库文件: ${dbPath}`)
							} catch (innerErr) {
								console.error(`所有删除方法都失败: ${dbPath}`, innerErr)
							}
						}
					}
				}
				// 尝试删除目录本身
				try {
					fs.rmdirSync(indexingDir)
					console.log(`已删除索引目录: ${indexingDir}`)
				} catch (err) {
					console.error(`删除索引目录失败: ${indexingDir}`, err)
				}
			} catch (err) {
				console.error(`处理索引目录失败: ${indexingDir}`, err)
			}
		}

		// 直接删除68496b9.db文件及其可能的journal文件
		const specificDbPath = path.join(testStoragePath, "workspace_indexing", "68496b9.db")
		if (fs.existsSync(specificDbPath)) {
			try {
				fs.rmSync(specificDbPath, { force: true })
				console.log(`已删除特定数据库文件: ${specificDbPath}`)
			} catch (err) {
				console.error(`删除特定数据库文件失败: ${specificDbPath}`, err)
			}
		}

		// 也检查journal文件
		const specificJournalPath = path.join(testStoragePath, "workspace_indexing", "68496b9.db-journal")
		if (fs.existsSync(specificJournalPath)) {
			try {
				fs.rmSync(specificJournalPath, { force: true })
				console.log(`已删除特定数据库日志文件: ${specificJournalPath}`)
			} catch (err) {
				console.error(`删除特定数据库日志文件失败: ${specificJournalPath}`, err)
			}
		}
	}
}

/**
 * 在所有测试之前运行的清理函数
 */
export async function beforeAllTests(): Promise<void> {
	console.log("运行测试前清理...")
	// 清理测试数据库
	await cleanupTestDatabases()

	// 确保测试存储目录被完全删除并重新创建
	const testStoragePath = path.join(__dirname, "test-storage")
	if (fs.existsSync(testStoragePath)) {
		try {
			fs.rmSync(testStoragePath, { recursive: true, force: true })
			console.log(`已删除测试存储目录: ${testStoragePath}`)
		} catch (err) {
			console.error(`删除测试存储目录失败: ${testStoragePath}`, err)
		}
	}

	// 等待一段时间确保文件系统操作完成
	await new Promise((resolve) => setTimeout(resolve, 500))

	// 重新创建测试目录结构
	try {
		fs.mkdirSync(path.join(__dirname, "test-storage", "workspace_indexing"), { recursive: true })
		console.log("已创建干净的测试目录结构")
	} catch (err) {
		console.error("创建测试目录结构失败", err)
	}
}

/**
 * 在所有测试之后运行的清理函数
 */
export async function afterAllTests(): Promise<void> {
	console.log("运行测试后清理...")
	// 确保所有资源释放
	await new Promise((resolve) => setTimeout(resolve, 1500))

	// 清理测试数据库
	await cleanupTestDatabases()

	// 尝试删除整个测试存储目录
	const testStoragePath = path.join(__dirname, "test-storage")
	if (fs.existsSync(testStoragePath)) {
		try {
			fs.rmSync(testStoragePath, { recursive: true, force: true })
			console.log(`已删除测试存储目录: ${testStoragePath}`)
		} catch (err) {
			console.error(`删除测试存储目录失败: ${testStoragePath}`, err)
		}
	}

	// 最后清理节点的全局对象缓存，尽量释放资源
	if (global.gc) {
		try {
			global.gc()
			console.log("手动触发垃圾回收完成")
		} catch (err) {
			console.error("手动触发垃圾回收失败", err)
		}
	}
}
