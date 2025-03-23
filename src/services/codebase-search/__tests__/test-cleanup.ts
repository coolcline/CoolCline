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

	// 删除前先确保服务器资源释放
	await new Promise((resolve) => setTimeout(resolve, 500))

	// 如果测试存储目录存在
	if (fs.existsSync(testStoragePath)) {
		// 先检查并删除workspace_indexing子目录中的.db文件
		const indexingDir = path.join(testStoragePath, "workspace_indexing")
		if (fs.existsSync(indexingDir)) {
			try {
				// 删除所有.db文件
				const files = fs.readdirSync(indexingDir)
				for (const file of files) {
					if (file.endsWith(".db")) {
						const dbPath = path.join(indexingDir, file)
						try {
							// 强行删除
							fs.unlinkSync(dbPath)
							console.log(`已删除测试数据库文件: ${dbPath}`)
						} catch (err) {
							console.error(`删除数据库文件失败: ${dbPath}`, err)
							// 尝试使用rmSync
							try {
								fs.rmSync(dbPath, { force: true })
								console.log(`使用rmSync删除数据库文件: ${dbPath}`)
							} catch (innerErr) {
								console.error(`rmSync删除也失败: ${dbPath}`, innerErr)
							}
						}
					}
				}
			} catch (err) {
				console.error(`处理索引目录失败: ${indexingDir}`, err)
			}
		}

		// 直接删除68496b9.db文件
		const specificDbPath = path.join(testStoragePath, "workspace_indexing", "68496b9.db")
		if (fs.existsSync(specificDbPath)) {
			try {
				fs.unlinkSync(specificDbPath)
				console.log(`已删除特定数据库文件: ${specificDbPath}`)
			} catch (err) {
				console.error(`删除特定数据库文件失败: ${specificDbPath}`, err)
			}
		}
	}
}

/**
 * 在所有测试之前运行的清理函数
 */
export async function beforeAllTests(): Promise<void> {
	// 清理测试数据库
	await cleanupTestDatabases()
}

/**
 * 在所有测试之后运行的清理函数
 */
export async function afterAllTests(): Promise<void> {
	// 确保所有资源释放
	await new Promise((resolve) => setTimeout(resolve, 1000))

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
}
