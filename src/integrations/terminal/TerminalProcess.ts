import { EventEmitter } from "events"
import stripAnsi from "strip-ansi"
import * as vscode from "vscode"
import { logger } from "../../utils/logging"

const PROCESS_HOT_TIMEOUT_NORMAL = 2_000
const PROCESS_HOT_TIMEOUT_COMPILING = 1000 * 60 * 60 // 1小时

export class TerminalProcess extends EventEmitter {
	private isListening: boolean = true
	private buffer: string = ""
	private fullOutput: string = ""
	private lastRetrievedIndex: number = 0
	isHot: boolean = false
	private hotTimer: NodeJS.Timeout | null = null
	private command: string = ""
	private outputBuffer: string[] = []
	private lastPromptIndex: number = -1
	private static isTestMode: boolean = false

	private static readonly OUTPUT_CHECK_CONFIG = {
		maxAttempts: 60 * 60,
		intervalMs: 1000,
		minWaitMs: 100,
		maxWaitMs: 2000,
		stableCount: 3,
	}

	private static readonly SHELL_PROMPTS = {
		zsh: ["%", "$", "➜", "❯"],
		bash: ["$", "#", "@", "❯"],
		fish: ["›", "$", "❯", "→"],
		powershell: [">", "PS>", "PS❯", "PWD>"],
		cmd: [">", "C:\\>", "D:\\>"],
		generic: ["$", ">", "#", "❯", "→", "➜"],
	}

	private static readonly MAX_OUTPUT_LENGTH = 1000000
	private static readonly MAX_OUTPUT_PREVIEW_LENGTH = 100000

	// 不同终端类型的提示符正则
	private readonly PROMPT_PATTERNS = {
		// Unix-like (bash/zsh)
		bash: /^[\w-]+@[\w-]+[^%$#>]+[$#>]/, // username@hostname path $
		zsh: /^[\w-]+@[\w-]+[^%$#>]+[%$#>]/, // username@hostname path %
		bashBracket: /^\[[\w-]+@[\w-]+[^\]]+\][$#>]/, // [username@hostname path]$
		bashSimple: /^-(?:bash|zsh)-[\d.]+[$#>]/, // -bash-3.2$ 或 -zsh-5.8$
		ohmyzsh: /^➜\s+[^$#%>]*/, // oh-my-zsh theme
		starship: /^[^>]*[❯→➜]/, // starship prompt

		// Windows
		cmd: /^[A-Z]:\\[^>]+>/, // C:\path>
		cmdSimple: /^[^>]+>/, // path>
		powershell: /^PS\s+[A-Z]:\\[^>]+>/, // PS C:\path>
		powershellSimple: /^PS>/, // PS>

		// 通用格式
		simple: /^[%$#>]\s*/, // 简单提示符
		git: /^[\w-]+@[\w-]+[^(]+\([\w-/]+\)[$#>]/, // git branch in prompt
		time: /^\[\d{2}:\d{2}:\d{2}\][$#>]/, // time in prompt
	}

	// 为测试添加的方法
	private emitIfEol(chunk: string) {
		this.buffer += chunk
		let lineEndIndex: number
		while ((lineEndIndex = this.buffer.indexOf("\n")) !== -1) {
			let line = this.buffer.slice(0, lineEndIndex).trimEnd()
			this.emit("line", line)
			this.buffer = this.buffer.slice(lineEndIndex + 1)
		}
	}

	private emitRemainingBufferIfListening() {
		if (this.buffer && this.isListening) {
			const remainingBuffer = this.removeLastLineArtifacts(this.buffer)
			if (remainingBuffer) {
				this.emit("line", remainingBuffer)
			}
			this.buffer = ""
			this.lastRetrievedIndex = this.fullOutput.length
		}
	}

	private removeLastLineArtifacts(output: string): string {
		const lines = output.trimEnd().split("\n")
		if (lines.length > 0) {
			const lastLine = lines[lines.length - 1]
			lines[lines.length - 1] = lastLine.replace(/[%$#>]\s*$/, "")
		}
		return lines.join("\n").trimEnd()
	}

	continue() {
		this.emitRemainingBufferIfListening()
		this.isListening = false
		this.removeAllListeners("line")
		this.emit("continue")
	}

	static setTestMode(enabled: boolean) {
		this.isTestMode = enabled
	}

	async run(terminal: vscode.Terminal, command: string) {
		this.command = command
		this.isHot = true
		const commandPreview = command.length > 30 ? command.substring(0, 30) + "..." : command

		// 在测试模式下直接返回结果
		if (TerminalProcess.isTestMode) {
			this.emit("line", "test output")
			this.emit("completed")
			this.emit("continue")
			this.isHot = false
			return
		}

		return new Promise<void>((resolve, reject) => {
			let timeoutId: NodeJS.Timeout | undefined
			let disposable: vscode.Disposable | undefined

			const cleanup = () => {
				// logger.debug("清理资源", { ctx: "terminal" })
				if (timeoutId) clearTimeout(timeoutId)
				if (disposable) disposable.dispose()
				this.isHot = false
			}

			try {
				const shellIntegration = (terminal as any).shellIntegration
				const hasExecuteCommand = typeof shellIntegration?.executeCommand === "function"

				if (hasExecuteCommand) {
					// logger.debug("使用 shell integration 执行命令", {
					// 	ctx: "terminal",
					// 	command: commandPreview,
					// })

					//先启动监听命令输出,再执行命令,防止执行速度太快或慢漏了监听的东西
					disposable = vscode.window.onDidEndTerminalShellExecution(async (event): Promise<void> => {
						if (event.execution === execution) {
							try {
								// logger.debug("命令执行完成", {
								// 	ctx: "terminal",
								// 	exitCode: event.exitCode,
								// })

								// 获取最终输出
								const finalOutput = await this.getTerminalContents()
								if (finalOutput) {
									// logger.debug("获取到最终输出", {
									// 	ctx: "terminal",
									// 	outputLength: finalOutput.length,
									// })

									const lines = finalOutput.split("\n")
									// 重组命令行（因为终端显示内容时，如果终端宽度窄，命令会被截断，而换行，所有无法找到命令
									// 1. 找到最后一个提示符行
									let lastPromptLineIndex = lines.length - 1
									while (lastPromptLineIndex >= 0 && !this.isPromptLine(lines[lastPromptLineIndex])) {
										lastPromptLineIndex--
									}

									if (lastPromptLineIndex < 0) {
										console.log("没有找到提示符行，返回 null")
									}

									const promptText = this.extractPromptText(lines[lastPromptLineIndex])

									// 2. 找命令所在行
									let commandIndex = -1
									for (let i = lastPromptLineIndex - 1; i >= 0; i--) {
										if (lines[i].includes(promptText)) {
											commandIndex = i
											break
										}
									}

									// 3. 重组命令行（如果命令被换行）,只处理最后一个命令
									const reconstructLines = await this.reconstructCommandLines(
										lines.slice(commandIndex),
										this.command,
										promptText,
									)

									// 只处理新的输出部分
									this.processOutput(reconstructLines.join("\n"))
								}

								// 命令执行完成
								this.emit("completed")
								this.emit("continue")
								cleanup()
								resolve()
							} catch (error) {
								// logger.error("处理命令输出时发生错误", {
								// 	ctx: "terminal",
								// 	error: error instanceof Error ? error : new Error(String(error)),
								// })
								cleanup()
								reject(error)
							}
						}
					})

					// 再执行命令
					const execution = shellIntegration.executeCommand(command)

					// 设置超时（在测试模式下禁用）
					if (!TerminalProcess.isTestMode) {
						timeoutId = setTimeout(() => {
							// logger.warn("命令执行超时", {
							// 	ctx: "terminal",
							// 	command: commandPreview,
							// })
							cleanup()
							reject(new Error("Command execution timeout"))
						}, PROCESS_HOT_TIMEOUT_COMPILING)
					}
				} else {
					// 使用传统方式
					// logger.debug("使用传统方式执行命令", {
					// 	ctx: "terminal",
					// 	command: commandPreview,
					// })

					// 触发 no_shell_integration 事件
					this.emit("no_shell_integration")

					this.fullOutput = ""
					this.buffer = ""
					this.outputBuffer = []

					// 发送命令
					terminal.sendText(command, true)

					// 设置较短的超时时间（在测试模式下禁用）
					if (!TerminalProcess.isTestMode) {
						timeoutId = setTimeout(() => {
							// logger.warn("传统方式执行超时", {
							// 	ctx: "terminal",
							// 	command: commandPreview,
							// })
							cleanup()
							reject(new Error("Command execution timeout"))
						}, PROCESS_HOT_TIMEOUT_COMPILING)
					}

					// 等待命令完成
					this.waitForCommandCompletion()
						.then((output) => {
							if (output) {
								if (output.length > TerminalProcess.MAX_OUTPUT_LENGTH) {
									// logger.warn("命令输出超过限制", {
									// 	ctx: "terminal",
									// 	length: output.length,
									// 	limit: TerminalProcess.MAX_OUTPUT_LENGTH,
									// })

									const truncatedOutput =
										output.substring(0, TerminalProcess.MAX_OUTPUT_PREVIEW_LENGTH) +
										"\n\n... [输出内容过长，已截断。建议使用其他工具查看完整输出，" +
										"比如将输出重定向到文件：command > output.txt]"

									this.emit("line", "")
									this.emit("line", truncatedOutput)
								} else {
									this.emit("line", "")
									this.processOutput(output)
								}
							}

							this.emit("completed")
							this.emit("continue")
							cleanup()
							resolve()
						})
						.catch((error) => {
							cleanup()
							reject(error)
						})
				}
			} catch (error) {
				// logger.error("命令执行失败", {
				// 	ctx: "terminal",
				// 	error: error instanceof Error ? error : new Error(String(error)),
				// })
				cleanup()
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		})
	}

	private processOutput(output: string) {
		// logger.debug("开始处理终端输出", {
		// 	ctx: "terminal",
		// 	outputLength: output.length,
		// })

		// 移除 ANSI 转义序列
		const cleanOutput = stripAnsi(output)

		// 处理输出内容
		const lines = this.processTerminalOutput(cleanOutput)
		if (!lines || lines.length === 0) {
			return
		}

		// 更新完整输出
		this.fullOutput += lines.join("\n") + "\n"

		// 发送每一行
		for (const line of lines) {
			this.emit("line", line)
		}
	}

	/**
	 * 处理终端输出
	 * 考虑到了前后无效内容，前有无效回显，后有无效空行
	 */
	private processTerminalOutput(fullOutput: string): string[] | null {
		// console.log("处理终端输出:", fullOutput)
		// 1. 去掉尾部空行
		let lines = this.removeTrailingEmptyLines(fullOutput)
		if (lines.length === 0) {
			return null
		}

		// 4. 处理每一行，移除控制字符等
		lines = lines.map((line) => {
			return this.cleanTerminalLine(line)
		})

		// 5. 过滤不需要的行
		lines = this.filterOutputLines(lines)

		return lines.length > 0 ? lines : null
	}

	/*
	 * 重建命令行
	 */
	private async reconstructCommandLines(lines: string[], command: string, promptText: string): Promise<string[]> {
		// 第一行就包含完整命令
		if (lines[0] === promptText + " " + command) {
			return lines
		} else {
			// 命令被截断了
			let newcommandline = ""
			let i = 0
			let newLines: string[] = []
			for (i = 0; i < lines.length; i++) {
				newcommandline = newcommandline + lines[i]
				if (newcommandline === promptText + " " + command) {
					newLines = lines.slice(i + 1)
					newLines.unshift(promptText + " " + command)
					break
				}
			}
			return newLines
		}
	}

	/**
	 * 清理终端行内容
	 */
	private cleanTerminalLine(line: string): string {
		return line
			.replace(/\[(\?2004[hl]|K)\]/g, "") // 移除终端控制序列
			.replace(/\]633;[^]*?\\/g, "") // 移除 shell integration 序列
			.replace(/\x1B\[[0-9;]*[JKmsu]/g, "") // 移除 ANSI 颜色和控制字符
			.replace(/^n/, "") // 移除开头的 n
			.replace(/\r/g, "") // 移除回车符
			.trim()
	}

	/**
	 * 过滤输出行
	 */
	private filterOutputLines(lines: string[]): string[] {
		return lines.filter((line) => {
			// 空行过滤
			if (!line) return false

			// 控制序列过滤
			if (line.startsWith(";")) return false
			if (line.includes("633;")) return false

			// 提示符过滤
			if (this.isPromptLine(line)) return false

			// 命令本身过滤
			if (line === this.command) return false

			// 其他特殊字符过滤
			if (/^\x1b[\[\(].*[\)\]]$/.test(line)) return false // 控制序列
			if (/^[\x00-\x1F\x7F]+$/.test(line)) return false // 不可打印字符

			return true
		})
	}

	/**
	 * 检查是否是提示符行
	 */
	private isPromptLine(line: string): boolean {
		return Object.values(this.PROMPT_PATTERNS).some((pattern) => pattern.test(line))
	}

	/**
	 * 从终端输出中提取提示符
	 */
	private extractPromptText(promptLine: string): string {
		let promptText = ""
		Object.values(this.PROMPT_PATTERNS).find((pattern) => {
			const match = promptLine.match(pattern)
			if (match) {
				promptText = match[0]
				return true
			}
			return false
		})
		return promptText
	}

	/**
	 * 去掉尾部空行
	 */
	private removeTrailingEmptyLines(fullOutput: string): string[] {
		let lines = fullOutput.split("\n")
		while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
			lines.pop()
		}
		return lines
	}

	private async waitForCommandCompletion(): Promise<string> {
		// 在测试模式下立即返回
		if (TerminalProcess.isTestMode) {
			return "test output"
		}

		const config = TerminalProcess.OUTPUT_CHECK_CONFIG
		let lastOutput = ""
		let stableCount = 0
		let attempt = 0

		while (attempt < config.maxAttempts) {
			attempt++
			await new Promise((resolve) => setTimeout(resolve, config.intervalMs))

			const currentOutput = await this.getTerminalContents()

			// 提取实际的命令输出
			if (currentOutput) {
				const lines = currentOutput.split("\n")
				// 重组命令行（因为终端显示内容时，如果终端宽度窄，命令会被截断，而换行，所有无法找到命令
				// 1. 找到最后一个提示符行
				let lastPromptLineIndex = lines.length - 1
				while (lastPromptLineIndex >= 0 && !this.isPromptLine(lines[lastPromptLineIndex])) {
					lastPromptLineIndex--
				}

				if (this.extractPromptText(lines[lastPromptLineIndex]).trim() !== lines[lastPromptLineIndex].trim()) {
					// 还没有找到提示符行，继续下一个循环
					continue
				} else {
					const promptText = this.extractPromptText(lines[lastPromptLineIndex])

					// 2. 找命令所在行
					let commandIndex = -1
					for (let i = lastPromptLineIndex - 1; i >= 0; i--) {
						if (lines[i].includes(promptText)) {
							commandIndex = i
							break
						}
					}

					// 3. 重组命令行（如果命令被换行）,只处理最后一个命令
					const reconstructLines = await this.reconstructCommandLines(
						lines.slice(commandIndex),
						this.command,
						promptText,
					)
					lastOutput = reconstructLines.join("\n")
					break
				}
			}
		}

		// logger.warn("命令执行超时", {
		// 	ctx: "terminal",
		// 	attempts: attempt,
		// })
		return lastOutput
	}

	private async getTerminalContents(): Promise<string> {
		try {
			// 保存原始剪贴板内容
			const originalClipboard = await vscode.env.clipboard.readText()

			// 清除当前选择
			await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")

			// 选择到上一个命令
			await vscode.commands.executeCommand("workbench.action.terminal.selectAll")

			// 复制选中内容
			await vscode.commands.executeCommand("workbench.action.terminal.copySelection")

			// 获取复制的内容
			const clipboardContent = await vscode.env.clipboard.readText()

			// 恢复原始剪贴板内容
			await vscode.env.clipboard.writeText(originalClipboard)

			// 清除选择
			await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")

			return clipboardContent
		} catch (error) {
			logger.error("获取终端内容失败", {
				ctx: "terminal",
				error: error instanceof Error ? error : new Error(String(error)),
			})
			return ""
		}
	}

	getUnretrievedOutput(): string {
		const output = this.fullOutput.slice(this.lastRetrievedIndex)
		this.lastRetrievedIndex = this.fullOutput.length
		return output
	}
}

export type TerminalProcessResultPromise = Promise<void> & {
	on: (event: string, listener: (...args: any[]) => void) => TerminalProcessResultPromise
	once: (event: string, listener: (...args: any[]) => void) => TerminalProcessResultPromise
	continue: () => void
}

export function mergePromise(process: TerminalProcess, promise: Promise<void>): TerminalProcessResultPromise {
	const resultPromise = promise as TerminalProcessResultPromise
	resultPromise.on = (event: string, listener: (...args: any[]) => void) => {
		process.on(event, listener)
		return resultPromise
	}
	resultPromise.once = (event: string, listener: (...args: any[]) => void) => {
		process.once(event, listener)
		return resultPromise
	}
	resultPromise.continue = () => {
		process.emit("continue")
	}
	return resultPromise
}
