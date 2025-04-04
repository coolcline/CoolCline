/**
 * @vscode/sqlite3 类型定义文件
 */
declare module "@vscode/sqlite3" {
	export interface NodeBindingOptions {
		/**
		 * 是否使用 node-sqlite3 的共享缓存模式
		 */
		readonly useSharedNodeCache?: boolean
	}

	export interface NodeBinding {
		readonly useSharedNodeCache: boolean
		readonly open: (path: string, mode?: number) => number
		readonly close: (db: number) => void
		readonly prepare: (db: number, sql: string) => number
		readonly step: (stmt: number) => boolean
		readonly finalize: (stmt: number) => void
		readonly reset: (stmt: number) => boolean
		readonly exec: (db: number, sql: string) => void
		readonly bind: (stmt: number, index: number, value: any) => void
		readonly get: (stmt: number, column: number) => any
		readonly getColumnName: (stmt: number, column: number) => string
		readonly getColumnCount: (stmt: number) => number
		readonly lastInsertRowId: (db: number) => number
		readonly changes: (db: number) => number
	}

	export interface RunResult {
		lastID: number
		changes: number
	}

	export interface GetCallback<T> {
		(err: Error | null, row: T): void
	}

	export interface AllCallback<T> {
		(err: Error | null, rows: T[]): void
	}

	export interface EachCallback<T> {
		(err: Error | null, row: T): void
	}

	export interface CompleteCallback {
		(err: Error | null, count: number): void
	}

	export interface ExecCallback {
		(err: Error | null): void
	}

	export interface CloseCallback {
		(err: Error | null): void
	}

	export interface PrepareCallback {
		(err: Error | null, stmt: Statement): void
	}

	export interface Statement {
		bind(params: any[], callback?: (err: Error | null) => void): this
		bind(...params: any[]): this

		reset(callback?: (err: Error | null) => void): this

		finalize(callback?: (err: Error | null) => void): void

		run(params: any[], callback?: (err: Error | null) => void): this
		run(...params: any[]): this

		get(params: any[], callback: GetCallback<any>): this
		get(...params: any[]): this

		all(params: any[], callback: AllCallback<any>): this
		all(...params: any[]): this

		each(params: any[], callback: EachCallback<any>, complete?: CompleteCallback): this
		each(...params: any[]): this
	}

	// Database类
	export class Database {
		constructor(filename: string, mode?: number, callback?: (err: Error | null) => void)

		run(sql: string, params: any[], callback: (this: RunResult, err: Error | null) => void): this
		run(sql: string, callback: (this: RunResult, err: Error | null) => void): this

		get(sql: string, params: any[], callback: GetCallback<any>): this
		get(sql: string, callback: GetCallback<any>): this

		all(sql: string, params: any[], callback: AllCallback<any>): this
		all(sql: string, callback: AllCallback<any>): this

		each(sql: string, params: any[], callback: EachCallback<any>, complete?: CompleteCallback): this
		each(sql: string, callback: EachCallback<any>, complete?: CompleteCallback): this

		exec(sql: string, callback?: ExecCallback): this

		prepare(sql: string, params: any[], callback: PrepareCallback): this
		prepare(sql: string, callback: PrepareCallback): this

		close(callback?: CloseCallback): void

		// SQLite常用函数
		serialize(callback?: () => void): void
		parallelize(callback?: () => void): void
		configure(option: string, value: any): void

		// 扩展方法
		on(event: string, listener: (...args: any[]) => void): this
		once(event: string, listener: (...args: any[]) => void): this
	}

	export function verbose(): Database

	export const OPEN_READONLY: number
	export const OPEN_READWRITE: number
	export const OPEN_CREATE: number
	export const OPEN_FULLMUTEX: number
	export const OPEN_URI: number
	export const OPEN_SHAREDCACHE: number
	export const OPEN_PRIVATECACHE: number
}
