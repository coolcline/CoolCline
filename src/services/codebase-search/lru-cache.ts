/**
 * 简单的LRU缓存实现
 * 用于缓存查询结果，提高性能
 */

/**
 * LRU缓存项
 */
interface CacheItem<T> {
	key: string
	value: T
	timestamp: number
}

/**
 * LRU缓存（最近最少使用）
 * 当缓存达到容量上限时，会移除最久未使用的项目
 */
export class LRUCache<T> {
	private cache: Map<string, CacheItem<T>> = new Map()
	private capacity: number
	private readonly TTL_MS: number

	/**
	 * 构造函数
	 * @param capacity 缓存容量
	 * @param ttlMinutes 缓存项有效时间（分钟），默认60分钟
	 */
	constructor(capacity: number, ttlMinutes: number = 60) {
		this.capacity = capacity
		this.TTL_MS = ttlMinutes * 60 * 1000
	}

	/**
	 * 获取缓存项
	 * @param key 缓存键
	 * @returns 缓存值或undefined
	 */
	public get(key: string): T | undefined {
		const item = this.cache.get(key)

		if (!item) {
			return undefined
		}

		// 检查是否过期
		if (this.isExpired(item)) {
			this.cache.delete(key)
			return undefined
		}

		// 更新访问时间
		item.timestamp = Date.now()
		return item.value
	}

	/**
	 * 设置缓存项
	 * @param key 缓存键
	 * @param value 缓存值
	 */
	public set(key: string, value: T): void {
		// 如果已存在，先删除
		if (this.cache.has(key)) {
			this.cache.delete(key)
		}
		// 如果达到容量上限，移除最久未使用的项目
		else if (this.cache.size >= this.capacity) {
			this.evictOldest()
		}

		// 添加新项目
		this.cache.set(key, {
			key,
			value,
			timestamp: Date.now(),
		})
	}

	/**
	 * 移除最久未使用的缓存项
	 */
	private evictOldest(): void {
		let oldestKey: string | null = null
		let oldestTime = Infinity

		// 查找最旧的项目
		for (const [key, item] of this.cache.entries()) {
			if (item.timestamp < oldestTime) {
				oldestKey = key
				oldestTime = item.timestamp
			}
		}

		// 移除最旧的项目
		if (oldestKey) {
			this.cache.delete(oldestKey)
		}
	}

	/**
	 * 检查缓存项是否过期
	 */
	private isExpired(item: CacheItem<T>): boolean {
		const now = Date.now()
		return now - item.timestamp > this.TTL_MS
	}

	/**
	 * 判断键是否存在于缓存中
	 */
	public has(key: string): boolean {
		const item = this.cache.get(key)

		if (!item) {
			return false
		}

		// 检查是否过期
		if (this.isExpired(item)) {
			this.cache.delete(key)
			return false
		}

		return true
	}

	/**
	 * 从缓存中删除项目
	 */
	public delete(key: string): boolean {
		return this.cache.delete(key)
	}

	/**
	 * 清空缓存
	 */
	public clear(): void {
		this.cache.clear()
	}

	/**
	 * 获取缓存项数量
	 */
	public get size(): number {
		return this.cache.size
	}

	/**
	 * 返回所有缓存的键
	 */
	public keys(): string[] {
		return Array.from(this.cache.keys())
	}

	/**
	 * 清理过期项目
	 * 可以定期调用以释放内存
	 * @returns 清理的项目数
	 */
	public cleanExpired(): number {
		const now = Date.now()
		let count = 0

		for (const [key, item] of this.cache.entries()) {
			if (now - item.timestamp > this.TTL_MS) {
				this.cache.delete(key)
				count++
			}
		}

		return count
	}
}
