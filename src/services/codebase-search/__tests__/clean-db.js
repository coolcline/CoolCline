#!/usr/bin/env node
/**
 * 手动清理测试数据库文件的工具脚本
 * 此脚本可以直接从命令行运行
 */
const fs = require("fs")
const path = require("path")

// 测试存储路径
const testStoragePath = path.join(__dirname, "test-storage")

/**
 * 删除目录及其内容
 */
function removeDirectory(dirPath) {
	if (!fs.existsSync(dirPath)) return

	try {
		// 遍历目录
		fs.readdirSync(dirPath).forEach((file) => {
			const curPath = path.join(dirPath, file)

			// 如果是目录，递归删除
			if (fs.statSync(curPath).isDirectory()) {
				removeDirectory(curPath)
			} else {
				// 删除文件，特别关注.db文件
				if (file.endsWith(".db")) {
					console.log(`删除数据库文件: ${curPath}`)
				}
				try {
					fs.unlinkSync(curPath)
				} catch (err) {
					console.error(`无法删除文件: ${curPath}`, err)
				}
			}
		})

		// 删除空目录
		fs.rmdirSync(dirPath)
		console.log(`已删除目录: ${dirPath}`)
	} catch (err) {
		console.error(`处理目录时出错: ${dirPath}`, err)
	}
}

/**
 * 直接删除特定数据库文件
 */
function deleteSpecificDbFile() {
	const specificDbPath = path.join(testStoragePath, "workspace_indexing", "68496b9.db")
	if (fs.existsSync(specificDbPath)) {
		try {
			fs.unlinkSync(specificDbPath)
			console.log(`已删除特定数据库文件: ${specificDbPath}`)
			return true
		} catch (err) {
			console.error(`删除特定数据库文件失败: ${specificDbPath}`, err)
			return false
		}
	}
	return false
}

/**
 * 主函数 - 清理测试存储
 */
function cleanTestStorage() {
	console.log("开始清理测试存储...")

	// 先尝试删除特定的数据库文件
	const specificDeleted = deleteSpecificDbFile()

	// 然后尝试删除整个测试存储目录
	if (fs.existsSync(testStoragePath)) {
		// 如果特定文件删除失败，先暂停一下再尝试删除整个目录
		if (!specificDeleted) {
			console.log("等待资源释放...")
			setTimeout(() => {
				removeDirectory(testStoragePath)
				console.log("清理完成！")
			}, 1000)
		} else {
			removeDirectory(testStoragePath)
			console.log("清理完成！")
		}
	} else {
		console.log("测试存储目录不存在，无需清理。")
	}
}

// 执行清理
cleanTestStorage()
