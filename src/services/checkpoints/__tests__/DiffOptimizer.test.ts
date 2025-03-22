import { jest } from "@jest/globals"
import { DiffOptimizer } from "../DiffOptimizer"
import { simpleGit, SimpleGit } from "simple-git"
import { createTestEnvironment, TestEnvironment } from "./test-utils"
import fs from "fs/promises"
import { PathUtils } from "../CheckpointUtils"

describe("DiffOptimizer", () => {
	let env: TestEnvironment
	let git: SimpleGit
	let optimizer: DiffOptimizer

	beforeEach(async () => {
		env = await createTestEnvironment()
		git = simpleGit(env.workspaceRoot)
		await git.init()
		optimizer = new DiffOptimizer(git)
	})

	afterEach(async () => {
		await env.cleanup()
	})

	describe("差异计算", () => {
		it("应该能够计算简单的文本差异", async () => {
			// 创建初始文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "Hello\nWorld\n")
			await git.add("test.txt")
			const firstCommit = (await git.commit("Initial commit")).commit

			// 修改文件
			await fs.writeFile(testFile, "Hello\nBeautiful\nWorld\n")
			await git.add("test.txt")
			const secondCommit = (await git.commit("Modified")).commit

			// 计算差异
			const diff = await optimizer.computeDiff(firstCommit, secondCommit)

			expect(diff).toHaveLength(1)
			expect(diff[0].relativePath).toBe("test.txt")
			expect(diff[0].before).toBe("Hello\nWorld\n")
			expect(diff[0].after).toBe("Hello\nBeautiful\nWorld\n")
		})

		it("应该能够处理大规模文本变更", async () => {
			// 创建大文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "large.txt")
			const longText = Array(1000).fill("line\n").join("")
			await fs.writeFile(testFile, longText)
			await git.add("large.txt")
			const firstCommit = (await git.commit("Initial large file")).commit

			// 修改文件
			const modifiedText = longText.replace("line\n", "modified\n")
			await fs.writeFile(testFile, modifiedText)
			await git.add("large.txt")
			const secondCommit = (await git.commit("Modified large file")).commit

			// 计算差异
			const diff = await optimizer.computeDiff(firstCommit, secondCommit)

			expect(diff).toHaveLength(1)
			expect(diff[0].relativePath).toBe("large.txt")
			expect(diff[0].before).toBe(longText)
			expect(diff[0].after).toBe(modifiedText)
		})

		it("应该能够处理多文件变更", async () => {
			// 创建多个文件
			await Promise.all([
				fs.writeFile(PathUtils.joinPath(env.workspaceRoot, "file1.txt"), "Original1"),
				fs.writeFile(PathUtils.joinPath(env.workspaceRoot, "file2.txt"), "Original2"),
			])
			await git.add(["file1.txt", "file2.txt"])
			const firstCommit = (await git.commit("Initial files")).commit

			// 修改文件
			await Promise.all([
				fs.writeFile(PathUtils.joinPath(env.workspaceRoot, "file1.txt"), "Modified1"),
				fs.writeFile(PathUtils.joinPath(env.workspaceRoot, "file2.txt"), "Modified2"),
			])
			await git.add(["file1.txt", "file2.txt"])
			const secondCommit = (await git.commit("Modified files")).commit

			// 计算差异
			const diff = await optimizer.computeDiff(firstCommit, secondCommit)

			expect(diff).toHaveLength(2)
			const sortedDiff = diff.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
			expect(sortedDiff[0].relativePath).toBe("file1.txt")
			expect(sortedDiff[1].relativePath).toBe("file2.txt")
		})
	})

	describe("增量差异计算", () => {
		it("应该能够计算增量差异", async () => {
			// 创建初始文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "Version 1")
			await git.add("test.txt")
			const commit1 = (await git.commit("Version 1")).commit

			// 第一次修改
			await fs.writeFile(testFile, "Version 2")
			await git.add("test.txt")
			const commit2 = (await git.commit("Version 2")).commit

			// 第二次修改
			await fs.writeFile(testFile, "Version 3")
			await git.add("test.txt")
			const commit3 = (await git.commit("Version 3")).commit

			// 计算增量差异
			const diff = await optimizer.computeIncrementalDiff(commit1, commit3, commit2)

			expect(diff).toHaveLength(1)
			expect(diff[0].before).toBe("Version 2")
			expect(diff[0].after).toBe("Version 3")
		})
	})

	describe("缓存管理", () => {
		it("应该能够缓存差异结果", async () => {
			// 创建测试文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			await fs.writeFile(testFile, "Original")
			await git.add("test.txt")
			const commit1 = (await git.commit("Original")).commit

			// 修改文件
			await fs.writeFile(testFile, "Modified")
			await git.add("test.txt")
			const commit2 = (await git.commit("Modified")).commit

			// 第一次计算差异
			const start1 = Date.now()
			await optimizer.computeDiff(commit1, commit2)
			const duration1 = Date.now() - start1

			// 第二次计算差异（应该使用缓存）
			const start2 = Date.now()
			await optimizer.computeDiff(commit1, commit2)
			const duration2 = Date.now() - start2

			expect(duration2).toBeLessThan(duration1)
		})

		it("应该能够预热缓存", async () => {
			// 创建一系列提交
			const testFile = PathUtils.joinPath(env.workspaceRoot, "test.txt")
			const commits = []

			for (let i = 1; i <= 3; i++) {
				await fs.writeFile(testFile, `Version ${i}`)
				await git.add("test.txt")
				const commit = (await git.commit(`Version ${i}`)).commit
				commits.push(commit)
			}

			// 预热缓存
			await optimizer.warmupCache(commits)

			// 验证缓存是否生效
			const start = Date.now()
			await optimizer.computeDiff(commits[0], commits[2])
			const duration = Date.now() - start

			expect(duration).toBeLessThan(200) // 应该很快，因为使用了缓存
		})
	})

	describe("性能测试", () => {
		it("应该能够高效处理大量文件", async () => {
			// 创建多个文件
			const fileCount = 50
			for (let i = 0; i < fileCount; i++) {
				await fs.writeFile(PathUtils.joinPath(env.workspaceRoot, `file${i}.txt`), `Original ${i}`)
			}
			await git.add(".")
			const commit1 = (await git.commit("Original files")).commit

			// 修改所有文件
			for (let i = 0; i < fileCount; i++) {
				await fs.writeFile(PathUtils.joinPath(env.workspaceRoot, `file${i}.txt`), `Modified ${i}`)
			}
			await git.add(".")
			const commit2 = (await git.commit("Modified files")).commit

			// 计算差异
			const start = Date.now()
			const diff = await optimizer.computeDiff(commit1, commit2)
			const duration = Date.now() - start

			expect(diff).toHaveLength(fileCount)
			expect(duration).toBeLessThan(5000) // 应该在 5 秒内完成
		})

		it("应该能够处理大文件", async () => {
			// 创建大文件
			const testFile = PathUtils.joinPath(env.workspaceRoot, "large.txt")
			const largeContent = "x".repeat(1024 * 1024) // 1MB
			await fs.writeFile(testFile, largeContent)
			await git.add("large.txt")
			const commit1 = (await git.commit("Large file")).commit

			// 修改文件
			const modifiedContent = largeContent.replace("x".repeat(1000), "y".repeat(1000))
			await fs.writeFile(testFile, modifiedContent)
			await git.add("large.txt")
			const commit2 = (await git.commit("Modified large file")).commit

			// 计算差异
			const start = Date.now()
			const diff = await optimizer.computeDiff(commit1, commit2)
			const duration = Date.now() - start

			expect(diff).toHaveLength(1)
			expect(duration).toBeLessThan(10000) // 应该在 10 秒内完成
		})
	})
})
