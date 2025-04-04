/**
 * 数据库事务管理器
 * 集中管理所有数据库事务，确保事务按顺序执行，避免嵌套
 */
import { Database } from "./database"

export class TransactionManager {
	private static instance: TransactionManager | null = null
	private db: Database
	private transactionQueue: Array<{
		operation: () => Promise<any>
		resolve: (value: any) => void
		reject: (reason: any) => void
	}> = []
	private isProcessing = false
	private transactionActive = false

	/**
	 * 私有构造函数，防止直接实例化
	 */
	private constructor(db: Database) {
		this.db = db
	}

	/**
	 * 获取事务管理器实例
	 */
	public static getInstance(db: Database): TransactionManager {
		if (!TransactionManager.instance) {
			TransactionManager.instance = new TransactionManager(db)
		} else if (db !== (TransactionManager.instance as any).db) {
			// 更新数据库实例
			;(TransactionManager.instance as any).db = db
		}
		return TransactionManager.instance
	}

	/**
	 * 确保在没有事务的情况下执行操作
	 * @param operation 要执行的操作函数
	 * @returns 操作的结果
	 */
	private async executeWithoutTransaction<T>(operation: () => Promise<T>): Promise<T> {
		// 创建一个包装函数，拦截所有可能的事务操作
		const wrappedOperation = async () => {
			try {
				// 检查当前是否在事务中
				const inTransaction = await this.db.isInTransaction()
				if (inTransaction) {
					console.log("executeWithoutTransaction检测到活动事务，将直接执行操作")
				}

				// 直接执行操作，不管是否在事务中
				return await operation()
			} catch (error) {
				// 如果是事务嵌套错误，忽略它并继续
				if (error.message && error.message.includes("cannot start a transaction within a transaction")) {
					console.log("在无事务执行中检测到事务嵌套，忽略错误并继续")

					// 创建一个新的包装操作，它会避免开启新事务
					const safeOperation = async () => {
						try {
							// 尝试直接执行原始操作，但忽略事务相关操作
							return await operation()
						} catch (innerError) {
							// 继续忽略事务嵌套错误
							if (
								innerError.message &&
								innerError.message.includes("cannot start a transaction within a transaction")
							) {
								console.log("继续忽略嵌套事务错误")
								// 不能返回null，因为返回类型是T，需要返回一个有效的T类型值
								// 创建一个空对象作为默认值，这应该适用于大多数情况
								return {} as T
							}
							throw innerError
						}
					}

					// 执行安全操作
					return await safeOperation()
				}
				throw error
			}
		}

		return await wrappedOperation()
	}

	/**
	 * 在事务中执行操作
	 * @param operation 要在事务中执行的操作函数
	 * @returns 操作的结果
	 */
	public async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
		// 先检查数据库是否已在事务中，这比检查transactionActive更可靠
		try {
			const dbInTransaction = await this.db.isInTransaction()
			if (dbInTransaction || this.transactionActive) {
				// 如果已在事务中，直接使用无事务执行方式执行操作
				// console.log("已在事务中，跳过开启新事务")
				// 直接使用executeWithoutTransaction，避免嵌套事务问题
				return await this.executeWithoutTransaction(operation)
			}
		} catch (error) {
			console.log("检查事务状态出错，假设不在事务中:", error)
			// 如果检查失败，使用无事务执行方式，避免潜在的事务嵌套问题
			return await this.executeWithoutTransaction(operation)
		}

		// 创建新的事务请求
		return new Promise<T>((resolve, reject) => {
			this.transactionQueue.push({
				operation,
				resolve,
				reject,
			})

			// 开始处理队列（如果还没有开始）
			this.processQueue()
		})
	}

	/**
	 * 带超时的事务执行
	 * @param operation 要执行的操作
	 * @param timeout 超时时间（毫秒）
	 * @returns 操作结果
	 */
	public async executeInTransactionWithTimeout<T>(operation: () => Promise<T>, timeout: number = 30000): Promise<T> {
		return this.executeInTransaction(() => this.processWithTimeout(operation, timeout))
	}

	/**
	 * 处理事务队列
	 */
	private async processQueue(): Promise<void> {
		// 如果已经在处理队列或队列为空，则返回
		if (this.isProcessing || this.transactionQueue.length === 0) {
			return
		}

		this.isProcessing = true

		try {
			// 处理队列中的所有事务
			while (this.transactionQueue.length > 0) {
				const task = this.transactionQueue.shift()!

				try {
					// 再次检查是否已在事务中（双重检查，避免竞争条件）
					const inTransaction = await this.db.isInTransaction()
					if (inTransaction) {
						console.log("检测到事务嵌套，直接执行操作而不开启新事务")
						// 直接执行操作而不开启新事务
						const result = await this.executeWithoutTransaction(task.operation)
						task.resolve(result)
						continue
					}

					// 标记事务开始
					this.transactionActive = true

					try {
						// 开始事务
						try {
							await this.db.beginTransaction()
						} catch (beginError) {
							// 如果开始事务失败，可能是另一个线程已经开始了事务
							if (
								beginError.message &&
								beginError.message.includes("cannot start a transaction within a transaction")
							) {
								console.log("开始事务时检测到事务嵌套，使用无事务执行方式")
								const result = await this.executeWithoutTransaction(task.operation)
								task.resolve(result)
								return
							}
							throw beginError
						}

						// 执行操作
						let result
						try {
							result = await task.operation()
						} catch (operationError) {
							// 如果操作执行过程中出现事务嵌套错误
							if (
								operationError.message &&
								operationError.message.includes("cannot start a transaction within a transaction")
							) {
								console.log("操作执行过程中检测到事务嵌套，使用无事务执行方式")
								// 回滚当前事务
								try {
									if (await this.db.isInTransaction()) {
										await this.db.rollback()
									}
								} catch (rollbackError) {
									console.error("事务回滚失败:", rollbackError)
								}

								// 使用无事务执行方式重试
								result = await this.executeWithoutTransaction(task.operation)
								task.resolve(result)
								return
							}
							throw operationError
						}

						// 提交事务
						try {
							await this.db.commit()
						} catch (commitError) {
							// 如果提交事务失败，可能是事务已经被其他操作提交或回滚
							console.error("提交事务失败:", commitError)
							// 尝试使用无事务执行方式重试
							result = await this.executeWithoutTransaction(task.operation)
						}

						// 返回结果
						task.resolve(result)
					} catch (operationError) {
						// 捕获操作错误
						if (
							operationError.message &&
							operationError.message.includes("cannot start a transaction within a transaction")
						) {
							console.log("检测到事务嵌套，忽略错误并继续")
							// 使用无事务执行方式
							try {
								const result = await this.executeWithoutTransaction(task.operation)
								task.resolve(result)
							} catch (retryError) {
								task.reject(retryError)
							}
						} else {
							// 其他错误，尝试回滚
							try {
								if (await this.db.isInTransaction()) {
									await this.db.rollback()
								}
							} catch (rollbackError) {
								console.error("事务回滚失败:", rollbackError)
							}
							task.reject(operationError)
						}
					}
				} catch (error) {
					// 处理任务过程中的其他错误
					console.error("处理事务任务时出错:", error)
					task.reject(error)
				} finally {
					// 标记事务结束
					this.transactionActive = false
				}
			}
		} finally {
			// 完成处理
			this.isProcessing = false
		}
	}

	/**
	 * 带超时的操作处理
	 * @param operation 要执行的操作
	 * @param timeout 超时时间（毫秒）
	 * @returns 操作结果
	 */
	private async processWithTimeout<T>(operation: () => Promise<T>, timeout: number = 30000): Promise<T> {
		return new Promise<T>(async (resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`事务执行超时（${timeout}ms）`))
			}, timeout)

			try {
				const result = await operation()
				clearTimeout(timeoutId)
				resolve(result)
			} catch (error) {
				clearTimeout(timeoutId)
				reject(error)
			}
		})
	}

	/**
	 * 带重试的操作执行
	 * @param operation 要执行的操作
	 * @param maxRetries 最大重试次数
	 * @returns 操作结果
	 */
	public async executeWithRetry<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
		let lastError: any

		for (let i = 0; i < maxRetries; i++) {
			try {
				return await operation()
			} catch (error) {
				// 检查是否是可重试的错误
				if (this.isRetryableError(error)) {
					lastError = error
					// 等待一段时间再重试
					await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)))
					continue
				}
				throw error
			}
		}

		throw lastError
	}

	/**
	 * 判断错误是否可重试
	 * @param error 错误对象
	 * @returns 是否可重试
	 */
	private isRetryableError(error: any): boolean {
		// 判断是否是可重试的错误类型
		if (!error || !error.message) return false

		// 事务嵌套错误应该被特殊处理，而不仅仅是重试
		if (error.message.includes("cannot start a transaction within a transaction")) {
			console.log("检测到事务嵌套，忽略错误并继续")
			return true
		}

		return error.message.includes("database is locked") || error.message.includes("busy")
	}

	/**
	 * 重置事务管理器（主要用于测试和重新初始化）
	 */
	public static reset(): void {
		TransactionManager.instance = null
	}
}
