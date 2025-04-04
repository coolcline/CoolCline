/**
 * 从索引中删除文件的工具函数
 */
import { Database } from "./database"
import { TransactionManager } from "./transaction-manager"

/**
 * 从索引中删除文件
 * @param db 数据库实例
 * @param filePath 文件路径
 * @param inTransaction 是否已在事务中
 */
export async function removeFileFromIndex(
	db: Database,
	filePath: string,
	inTransaction: boolean = false,
): Promise<void> {
	// 执行删除操作的实际函数
	const deleteOperation = async () => {
		try {
			// 获取文件ID
			const file = await db.get("SELECT id FROM files WHERE path = ?", [filePath])
			if (!file) {
				return // 文件不在索引中，跳过
			}

			// 先删除依赖关系，避免外键约束错误
			// 删除符号关系
			await db.run("DELETE FROM symbol_relations WHERE source_id IN (SELECT id FROM symbols WHERE file_id = ?)", [
				file.id,
			])

			// 删除符号内容
			await db.run("DELETE FROM symbol_contents WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)", [
				file.id,
			])

			// 删除关键词
			await db.run("DELETE FROM keywords WHERE symbol_id IN (SELECT id FROM symbols WHERE file_id = ?)", [
				file.id,
			])

			// 删除符号
			await db.run("DELETE FROM symbols WHERE file_id = ?", [file.id])

			// 最后删除文件记录
			await db.run("DELETE FROM files WHERE id = ?", [file.id])
		} catch (error) {
			console.error(`删除文件索引失败: ${filePath}`, error)
			throw error
		}
	}

	if (inTransaction) {
		// 如果已在事务中，直接执行
		await deleteOperation()
	} else {
		// 否则创建新事务
		const transactionManager = TransactionManager.getInstance(db)
		await transactionManager.executeInTransaction(deleteOperation)
	}
}

/**
 * 批量删除多个文件索引
 * @param db 数据库实例
 * @param filePaths 文件路径数组
 */
export async function removeFilesFromIndex(db: Database, filePaths: string[]): Promise<void> {
	if (filePaths.length === 0) {
		return // 没有文件需要删除，直接返回
	}

	// 使用事务管理器执行批量删除
	const transactionManager = TransactionManager.getInstance(db)
	await transactionManager.executeInTransaction(async () => {
		for (const filePath of filePaths) {
			await removeFileFromIndex(db, filePath, true) // 在事务中执行
		}
	})
}
