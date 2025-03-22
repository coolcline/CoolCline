import {
	Mode,
	modes,
	CustomModePrompts,
	PromptComponent,
	getRoleDefinition,
	defaultModeSlug,
	ModeConfig,
	getModeBySlug,
} from "../../shared/modes"
import { DiffStrategy } from "../diff/DiffStrategy"
import { McpHub } from "../../services/mcp/McpHub"
import { getToolDescriptionsForMode } from "./tools"
import * as vscode from "vscode"
import {
	getRulesSection,
	getSystemInfoSection,
	getObjectiveSection,
	getSharedToolUseSection,
	getMcpServersSection,
	getToolUseGuidelinesSection,
	getCapabilitiesSection,
	getModesSection,
	addCustomInstructions,
	getDebuggingSection,
	getCommunicationSection,
} from "./sections"

interface PromptConfig {
	context?: vscode.ExtensionContext // VS Code 扩展上下文，可能用于访问 VS Code 的 API
	preferredLanguage?: string // 首选语言，用于生成提示词的语言设置
	cwd?: string // 当前工作目录，可能用于指定某些操作的基础路径
	enableBaseObjective?: boolean // 启用基础工作目标（默认为true）
	supportsComputerUse?: boolean // 是否支持计算机使用，可能影响提示词的生成
	browserViewportSize?: string // 浏览器视口大小，可能影响提示词的生成
	enableMcpServerCreation?: boolean // 是否启用需要 AI 创建 MCP 服务器，可能影响提示词的生成
	mcpHub?: McpHub // MCP Hub，可能用于访问 MCP 服务器
	diffStrategy?: DiffStrategy // 差异策略，可能影响提示词的生成
	diffEnabled?: boolean // 差异是否启用，可能影响提示词的生成
	allowAIToCreateMode?: boolean // 是否允许 AI 创建模式
	promptComponent?: PromptComponent // 提示组件，可能包含自定义的提示词
	customModeConfigs?: ModeConfig[] // 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
	customModePrompts?: CustomModePrompts // 获取终端用户自定义roleDefinition和customInstructions
	globalCustomInstructions?: string // 全局自定义指令，可能包含自定义的指令
	experiments?: Record<string, boolean> // 实验设置，可能影响提示词的生成
	enableToolUse?: boolean // 是否启用工具使用部分
	enableToolGuidelines?: boolean // 是否启用工具使用指南部分
	enableDebugging?: boolean // 是否启用调试指导部分，默认启用
	enableCommunication?: boolean // 是否启用沟通风格指南，默认启用
}

// 接收两个参数，并调用提示词组装方法`generatePrompt`并把结果`sections`返回
export const SYSTEM_PROMPT = async (config: PromptConfig, mode: Mode = defaultModeSlug): Promise<string> => {
	return generatePrompt(config, mode)
}

// 提示词组装方法
async function generatePrompt(config: PromptConfig, mode: Mode): Promise<string> {
	// 如果没有传入任何参数，返回空字符串
	if (Object.keys(config).length === 0) {
		return ""
	}
	// 根据传入的参数组装提示词
	const sections: string[] = []

	// 语言
	if (config.preferredLanguage) {
		sections.push(`Language Preference:\nYou MUST ALWAYS respond ONLY in the ${config.preferredLanguage} language.`)
	}

	// 沟通风格指南 `src/core/prompts/sections/communication.ts`
	if (config.enableCommunication !== false) {
		// 默认启用
		sections.push(getCommunicationSection())
	}

	// 定义了 AI 助手的工作目标和行为准则 `src/core/prompts/sections/objective.ts`
	if (config.enableBaseObjective === true) {
		sections.push(getObjectiveSection())
	}

	// 表示系统中正在使用的差异处理策略（Diff Strategy）`src/core/diff/DiffStrategy.ts`
	// 如果 diff 未启用，不传入 diffStrategy
	// 现在有 getMcpServersSection，getToolDescriptionsForMode，getRulesSection，getCapabilitiesSection
	// 后面可能要考虑重构，单独抽出
	const effectiveDiffStrategy = config.diffEnabled ? config.diffStrategy : undefined

	// 能力部分 `src/core/prompts/sections/capabilities.ts`
	// 告诉AI助手它可以使用哪些工具和执行哪些操作
	if (config.cwd !== undefined && config.supportsComputerUse !== undefined) {
		sections.push(
			getCapabilitiesSection(config.cwd, config.supportsComputerUse, config.mcpHub, effectiveDiffStrategy),
		)
	}

	// 定义 AI 的"操作"能力，如调用什么工具编辑，什么操作规则 `src/core/prompts/sections/rules.ts`
	if (config.cwd !== undefined && config.supportsComputerUse !== undefined) {
		sections.push(
			getRulesSection(config.cwd, config.supportsComputerUse, effectiveDiffStrategy, config.experiments),
		)
	}

	// 系统信息部分 `src/core/prompts/sections/system-info.ts`
	// 生成系统信息部分的函数，用于构建提示词中的系统信息部分，如系统，shell，目录
	if (config.cwd !== undefined) {
		sections.push(getSystemInfoSection(config.cwd, mode, config.customModeConfigs))
	}

	// MCP 服务器部分 - 只显示现有服务器连接信息 `src/core/prompts/sections/mcp-servers.ts`
	if (config.mcpHub !== undefined) {
		const mcpServersSection = await getMcpServersSection(config.mcpHub, effectiveDiffStrategy, false) // 始终传递 false 以禁用创建说明
		sections.push(mcpServersSection)
	}

	// MCP 创建部分 - 单独控制是否包含让 AI 创建 MCP 的说明 `src/core/prompts/sections/mcp-servers.ts`
	if (config.mcpHub !== undefined && config.enableMcpServerCreation === true) {
		const mcpCreationSection = await getMcpServersSection(config.mcpHub, effectiveDiffStrategy, true) // 专门获取创建部分
		// 仅添加创建部分的差异内容，避免重复显示已有服务器信息
		const baseSection = await getMcpServersSection(config.mcpHub, effectiveDiffStrategy, false)
		const creationOnlyContent = mcpCreationSection.replace(baseSection, "").trim()
		if (creationOnlyContent) {
			sections.push(creationOnlyContent)
		}
	}

	// 工具使用部分 `src/core/prompts/sections/tool-use.ts`
	if (config.enableToolUse === true) {
		// 默认启用
		sections.push(getSharedToolUseSection())
	}
	// 工具使用指南 `src/core/prompts/sections/tool-use-guidelines.ts`
	if (config.enableToolGuidelines === true) {
		// 默认启用
		sections.push(getToolUseGuidelinesSection())
	}

	// 工具描述部分 `src/core/prompts/tools/index.ts`
	// 这个文件是整个系统中工具描述的管理中心，负责：
	// 集中管理所有工具的描述
	// 根据 Mode 角色模式筛选可用工具
	// 生成工具使用说明
	// 导出各个工具的描述函数供其他地方使用
	if (config.enableToolUse === true && config.cwd !== undefined && config.supportsComputerUse !== undefined) {
		sections.push(
			getToolDescriptionsForMode(
				mode,
				config.cwd,
				config.supportsComputerUse,
				effectiveDiffStrategy,
				config.browserViewportSize,
				config.mcpHub,
				config.customModeConfigs, // 自定义模式配置，包含slug、name、roleDefinition、groups等
				config.experiments,
			),
		)
	}

	// 用于通过 AI 来创建自定义角色模式 `src/core/prompts/sections/modes.ts`
	if (config.allowAIToCreateMode === true && config.context) {
		sections.push(await getModesSection(config.context))
	}

	// 角色提示词开始
	// 本项目，角色模式是必有的，所以这不必判断参数是否有 mode
	// 获取提示组件，作用是类型安全检查
	const getPromptComponent = (value: unknown) => {
		if (typeof value === "object" && value !== null) {
			return value as PromptComponent
		}
		return undefined
	}

	// 按传入模式去查询是否是用户创建的新模式或用户对预设的做了修改 （因为支持用户创建角色模式）
	const promptComponent = getPromptComponent(config.customModePrompts?.[mode])

	// 按传入模式去查询开发者预设，预设是指开发者在`src/shared/modes.ts`定义了 mode 相关的配置
	const modeConfig = getModeBySlug(mode, config.customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0]

	// 角色提示词，使用 if else 达到有自定义则覆盖预设的效果
	if (promptComponent?.roleDefinition) {
		// 获取终端用户自定义roleDefinition和customInstructions
		sections.push(promptComponent.roleDefinition)
	} else if (modeConfig.roleDefinition) {
		// 获取开发者预设的模式配置，包含slug、name、roleDefinition、groups等
		sections.push(modeConfig.roleDefinition)
	}
	// 角色提示词结束

	// 自定义指令部分 `src/core/prompts/sections/custom-instructions.ts`
	// 处理用户自定义指令，会加载各种`.xx` 的文件进行组装，另外提示词页面通用提示词会追加
	if (config.cwd !== undefined) {
		if (promptComponent?.customInstructions || config.globalCustomInstructions) {
			const customInstructions = await addCustomInstructions(
				// Mode-specific Instructions
				// 后面 agent 模式要实现结伴模式要重构这里，传入三个模型类型的提示词，然后在`custom-instructions.ts`根据条件组装
				promptComponent?.customInstructions || "",
				// 全局自定义指令，对应UI中的"General Prompt Instructions"输入框
				// 它是追加模式，系统的提示词是这些
				// 基础目标部分（如果启用），能力部分，规则部分，系统信息部分，MCP服务器部分，工具使用部分和指南，工具描述部分
				config.globalCustomInstructions || "",
				config.cwd,
				mode, // 传 mode 是为了组装 `.coolclinerules-${mode}`
			)
			if (customInstructions) {
				sections.push(customInstructions)
			}
		}
	}

	// 调试指导部分 `src/core/prompts/sections/debugging.ts`
	if (config.enableDebugging !== false) {
		// 默认启用
		sections.push(getDebuggingSection())
	}

	return sections.join("\n\n")
}
