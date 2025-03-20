import {
	arePathsEqual,
	getReadablePath,
	toRelativePath,
	toPosixPath,
	extname,
	dirname,
	join,
	relative,
	isAbsolute,
} from "../path"
import * as path from "path"
import os from "os"

describe("Path Utilities", () => {
	const originalPlatform = process.platform

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
		})
	})

	describe("toPosixPath", () => {
		it("should convert backslashes to forward slashes", () => {
			const windowsPath = "C:\\Users\\test\\file.txt"
			expect(toPosixPath(windowsPath)).toBe("C:/Users/test/file.txt")
		})

		it("should not modify paths with forward slashes", () => {
			const unixPath = "/home/user/file.txt"
			expect(toPosixPath(unixPath)).toBe("/home/user/file.txt")
		})

		it("should preserve extended-length Windows paths", () => {
			const extendedPath = "\\\\?\\C:\\Very\\Long\\Path"
			expect(toPosixPath(extendedPath)).toBe("\\\\?\\C:\\Very\\Long\\Path")
		})

		it("should handle mixed separators", () => {
			const mixedPath = "C:\\Users/test\\Documents/file.txt"
			expect(toPosixPath(mixedPath)).toBe("C:/Users/test/Documents/file.txt")
		})
	})

	describe("String.prototype.toPosix", () => {
		it("should be available on string instances", () => {
			const path = "C:\\test\\path"
			expect(path.toPosix()).toBe("C:/test/path")
		})
	})

	describe("arePathsEqual", () => {
		describe("on Windows", () => {
			beforeEach(() => {
				Object.defineProperty(process, "platform", {
					value: "win32",
				})
			})

			it("should compare paths case-insensitively", () => {
				expect(arePathsEqual("C:\\Users\\Test", "c:\\users\\test")).toBe(true)
			})

			it("should handle different path separators", () => {
				expect(arePathsEqual("C:\\Users\\Test", "C:/Users/Test")).toBe(true)
			})

			it("should normalize paths with ../", () => {
				expect(arePathsEqual("C:\\Users\\Test\\..\\Test", "C:\\Users\\Test")).toBe(true)
			})

			it("should handle mixed separators", () => {
				expect(arePathsEqual("C:\\Users/Test", "C:/Users\\Test")).toBe(true)
			})
		})

		describe("on POSIX", () => {
			beforeEach(() => {
				Object.defineProperty(process, "platform", {
					value: "darwin",
				})
			})

			it("should compare paths case-sensitively", () => {
				expect(arePathsEqual("/Users/Test", "/Users/test")).toBe(false)
			})

			it("should normalize paths", () => {
				expect(arePathsEqual("/Users/./Test", "/Users/Test")).toBe(true)
			})

			it("should handle trailing slashes", () => {
				expect(arePathsEqual("/Users/Test/", "/Users/Test")).toBe(true)
			})
		})

		describe("edge cases", () => {
			it("should handle undefined paths", () => {
				expect(arePathsEqual(undefined, undefined)).toBe(true)
				expect(arePathsEqual("/test", undefined)).toBe(false)
				expect(arePathsEqual(undefined, "/test")).toBe(false)
			})

			it("should handle root paths with trailing slashes", () => {
				expect(arePathsEqual("/", "/")).toBe(true)
				expect(arePathsEqual("C:\\", "C:\\")).toBe(true)
			})
		})
	})

	describe("getReadablePath", () => {
		it("should throw error when cwd is not provided", () => {
			expect(() => getReadablePath("" as any)).toThrow("cwd is required")
		})

		it("should return basename when path equals cwd", () => {
			const cwd = "/Users/test/project"
			expect(getReadablePath(cwd, cwd)).toBe("project")
		})

		it("should return relative path when inside cwd", () => {
			const cwd = "/Users/test/project"
			const filePath = "/Users/test/project/src/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("src/file.txt")
		})

		it("should return absolute path when outside cwd", () => {
			const cwd = "/Users/test/project"
			const filePath = "/Users/test/other/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("/Users/test/other/file.txt")
		})

		it("should handle parent directory traversal", () => {
			const cwd = "/Users/test/project"
			const filePath = "../../other/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("/Users/other/file.txt")
		})

		it("should normalize paths with redundant segments", () => {
			const cwd = "/Users/test/project"
			const filePath = "/Users/test/project/./src/../src/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("src/file.txt")
		})

		it("should handle mixed separators", () => {
			const cwd = "C:\\Users\\test"
			const filePath = "C:\\Users\\test/docs\\file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("docs/file.txt")
		})

		it("should handle undefined relative path", () => {
			const cwd = "/Users/test/project"
			expect(getReadablePath(cwd)).toBe("project")
		})

		it("should handle root paths", () => {
			expect(getReadablePath("/")).toBe("")
			expect(getReadablePath("/", "file.txt")).toBe("file.txt")
		})
	})

	describe("toRelativePath", () => {
		it("should convert absolute path to relative", () => {
			const filePath = "/Users/test/project/file.txt"
			const cwd = "/Users/test"
			expect(toRelativePath(filePath, cwd)).toBe("project/file.txt")
		})

		it("should handle mixed path separators", () => {
			const filePath = "C:\\Users/test\\file.txt"
			const cwd = "C:\\Users\\test"
			expect(toRelativePath(filePath, cwd)).toBe("file.txt")
		})

		it("should preserve trailing slash", () => {
			const filePath = "/Users/test/dir/"
			const cwd = "/Users/test"
			expect(toRelativePath(filePath, cwd)).toBe("dir/")
		})

		it("should handle Windows backslash trailing separator", () => {
			const filePath = "C:\\Users\\test\\dir\\"
			const cwd = "C:\\Users\\test"
			expect(toRelativePath(filePath, cwd)).toBe("dir/")
		})
	})

	describe("extname", () => {
		it("should return the correct file extension with dot", () => {
			expect(extname("file.txt")).toBe(".txt")
			expect(extname("/path/to/file.js")).toBe(".js")
			expect(extname("C:\\path\\to\\file.tsx")).toBe(".tsx")
		})

		it("should return empty string for files without extension", () => {
			expect(extname("file")).toBe("")
			expect(extname("/path/to/file")).toBe("")
		})

		it("should handle paths with multiple dots", () => {
			expect(extname("file.test.js")).toBe(".js")
			expect(extname("/path/to/archive.tar.gz")).toBe(".gz")
		})

		it("should handle mixed separators", () => {
			expect(extname("C:\\path/to/file.md")).toBe(".md")
		})
	})

	describe("dirname", () => {
		it("should return the directory name of a path", () => {
			expect(dirname("/path/to/file.txt")).toBe("/path/to")
			expect(dirname("C:\\path\\to\\file.txt")).toBe("C:/path/to")
		})

		it("should handle paths with mixed separators", () => {
			expect(dirname("C:\\path/to/file.txt")).toBe("C:/path/to")
		})

		it("should handle root paths", () => {
			expect(dirname("/file.txt")).toBe("/")
			expect(dirname("C:\\file.txt")).toBe("C:/")
		})
	})

	describe("join", () => {
		it("should join path segments correctly", () => {
			expect(join("path", "to", "file.txt")).toBe("path/to/file.txt")
			expect(join("/path", "to", "file.txt")).toBe("/path/to/file.txt")
			expect(join("C:\\path", "to", "file.txt")).toBe("C:/path/to/file.txt")
		})

		it("should handle empty path segments", () => {
			expect(join("path", "", "file.txt")).toBe("path/file.txt")
		})

		it("should normalize paths", () => {
			expect(join("path", "..", "file.txt")).toBe("file.txt")
			expect(join("/path", "to", "..", "file.txt")).toBe("/path/file.txt")
		})

		it("should handle mixed separators", () => {
			expect(join("path\\to", "dir/subdir", "file.txt")).toBe("path/to/dir/subdir/file.txt")
		})
	})

	describe("relative", () => {
		it("should return correct relative path", () => {
			expect(relative("/path/to", "/path/to/file.txt")).toBe("file.txt")
			expect(relative("C:\\path\\to", "C:\\path\\to\\dir\\file.txt")).toBe("dir/file.txt")
		})

		it("should handle paths outside base directory", () => {
			expect(relative("/path/to", "/path/other/file.txt")).toBe("../other/file.txt")
		})

		it("should handle identical paths", () => {
			expect(relative("/path/to", "/path/to")).toBe("")
		})

		it("should handle mixed separators", () => {
			expect(relative("C:/path\\to", "C:\\path\\other\\file.txt")).toBe("../other/file.txt")
		})
	})

	describe("isAbsolute", () => {
		it("should correctly identify absolute paths", () => {
			expect(isAbsolute("/path/to/file")).toBe(true)
			expect(isAbsolute("C:\\path\\to\\file")).toBe(true)
		})

		it("should correctly identify relative paths", () => {
			expect(isAbsolute("path/to/file")).toBe(false)
			expect(isAbsolute("./path/to/file")).toBe(false)
			expect(isAbsolute("../path/to/file")).toBe(false)
		})

		it("should handle mixed separators", () => {
			expect(isAbsolute("C:/path\\to/file")).toBe(true)
		})
	})
})
