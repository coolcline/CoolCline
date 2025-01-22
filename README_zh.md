# CoolCline

> README: [English](README.md) | [简体中文](README_zh.md)
>
> CHANGELOG: [English](CHANGELOG.md) | [简体中文](CHANGELOG_zh.md)
>
> CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING_zh.md)

---

[Cool Cline](https://gitee.com/coolcline/coolcline.git) 是一个融合了 [Cline](https://github.com/cline/cline.git)、[Roo Code](https://github.com/RooVetGit/Roo-Code.git) 和 [Bao Cline](https://github.com/jnorthrup/Bao-Cline.git) 最佳特性的主动式编程助手（感谢所有`Clines`项目的贡献者！）。它能与你的命令行界面和编辑器无缝协作，带来最强大的 AI 开发体验。

---

## 主要功能

### 优化您的问题

点击聊天输入框底部的 ✨ 按钮，它将帮您优化您的输入。

### 快速切换 LLM Provider

- 在聊天输入框底部可以切换 LLM Provider。
- 您可以打开`设置`页面，在顶部区域可以看到设置的地方，通过设置您将得到您要的下拉列表，支持新增，改名，删除（此功能不会删除 LLM Provider 的配置）。新增前请先在下方配置好您的 LLM Provider，因为配置的下拉列表将记住当前您配置的 LLM Provider，比如选好 Provider，apikey，model 等，取的别名建议与 Provider 和 Model 关联，这样就方便您识别。

### 自动批准

CoolCline 以 **自然语言** 交流并提出操作建议——文件编辑、终端命令、浏览器测试等。您可以选择它的行为方式：

- **手动批准**：审查并批准每一步，以保持完全控制。
- **自主/自动批准**：授予 CoolCline 无中断运行任务的能力，加快日常工作流程（设置方式：在聊天输入框上方或设置页面勾选或去掉勾选`Auto-Approve`下面相关的选项）。
- **混合**：自动批准特定操作（例如文件写入），但需要确认风险较高的任务（如部署代码）。

无论您的偏好如何，您始终对 CoolCline 的操作拥有最终决定权。

---

### 配置 LLM Provider

使用 CoolCline 前您需要在扩展右上角的`设置`页面配置 LLM Provider（必须）：

- 支持的一些模型：OpenRouter、Anthropic、Glama、OpenAI、OpenAI Compatible、Google Gemini、AWS Bedrock、Azure、GCP Vertex 或本地模型（LM Studio/Ollama）或任何 **兼容 OpenAI** sdk 的模型（OpenAI Compatible）。
- 推荐：目前性价比最好的是 [DeepSeek](https://platform.deepseek.com/usage) 的 DeepSeek v3（deepseek-chat）或 DeepSeek R1（deepseek-reasoner），他们家有新的模型，会立即在 api 上上线，所以您会发现模型上不会带版本号。
- **使用跟踪**：CoolCline 会帮您监控每个会话的令牌和成本使用情况。

---

### 聊天模式

您现在可以在聊天输入框底部选择不同的聊天模式，以更好地适应您的工作流程。以下是可用的模式：

内置：

- **Code**：（现有行为）默认模式，CoolCline 帮助您编写代码和执行任务。
- **Architect**：“你是 CoolCline，一名软件架构专家……” 适合思考高层次的技术设计和系统架构（此模式不能编写代码或运行命令）。
- **Ask**：“你是 CoolCline，一名知识渊博的技术助理……” 适合询问代码库相关问题或深入探讨概念（此模式不能编写代码或运行命令）。
- 管理：在 CoolCline 扩展右上角的`Prompts`页面可以管理它们。

---

### 文件和编辑器操作

CoolCline 可以：

- **创建和编辑** 项目中的文件（显示差异）。
- **自动响应** linting 或编译时错误（缺少导入、语法错误等）。
- **通过编辑器的时间线跟踪更改**，以便您可以审查或需要时恢复。

---

### 命令行集成

在 CoolCline 的设置页面，您可以预设允许自动执行的命令，比如`npm install`、`npm run`、`npm test`等。当 LLM 需要执行这些命令时 CoolCline 就不用等你批准。

---

### 浏览器自动化

CoolCline 还可以打开 **浏览器** 会话以：

- 启动本地或远程 Web 应用。
- 点击、输入、滚动和截屏。
- 收集控制台日志以调试运行时或 UI/UX 问题。

非常适合 **端到端测试** 或在不需要不断复制粘贴的情况下视觉验证更改。

---

### 使用 MCP 添加工具

- MCP 官方文档: https://modelcontextprotocol.io/introduction

通过 **模型上下文协议 (MCP)** 扩展 CoolCline，如：

- “添加一个管理 AWS EC2 资源的工具。”
- “添加一个查询公司 Jira 的工具。”
- “添加一个拉取最新 PagerDuty 事件的工具。”

CoolCline 可以自主构建和配置新工具（需要您的批准），以立即扩展其功能。

---

### 上下文提及

需要明确提供上下文时，在输入框输入`@`符号：

> 关联最相关的上下文，能节约您的令牌预算。

- **@Problems** – 提供工作区错误/警告供 CoolCline 修复。
- **@Paste URL to fetch contents** – 从 URL 获取文档，将其转换为 Markdown。
- **@Add Folder** – 提供文件夹给 CoolCline。
- **@Add File** – 提供文件给 CoolCline。
- **@Git Commits** – 提供 Git 提交或差异列表供 CoolCline 分析代码历史。

---

## 安装

两个安装方式，任选一种：

- 在编辑器的扩展面板中搜索`CoolCline` 以直接安装。
- 或从 [Marketplace](https://marketplace.visualstudio.com/items?itemName=CoolCline.coolcline) / [Open-VSX](https://open-vsx.org/extension/CoolCline/coolcline) 获取 `.vsix` 文件并 `拖放` 到编辑器中。

> **提示**：
>
> - 可以将扩展移动到屏幕右侧体验更佳：在 CoolCline 扩展图标上点鼠标右键 -> 移动到 -> 辅助侧边栏。
> - 关闭`辅助侧边栏`可能会让你不知道怎么打开，可以点击 vscode 右上角的 `切换辅助侧边栏`按钮，又会打开，或者用键盘快捷键 ctrl + shift + L 组合键。

---

## 本地设置和开发

参考 CONTRIBUTING 文件中的说明 : [English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING_zh.md)

---

## 贡献

我们欢迎社区贡献！以下是参与方式：
CONTRIBUTING: [English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING_zh.md)

---

## 免责声明

**请注意**，CoolCline 不对提供的任何代码、模型或其他工具，任何相关的第三方工具或任何结果输出做出任何陈述或保证。您承担使用任何此类工具或输出的 **所有风险**；此类工具按 **“原样”** 和 **“可用”** 基础提供。此类风险可能包括但不限于知识产权侵权、网络漏洞或攻击、偏见、不准确、错误、缺陷、病毒、停机、财产损失或损害和/或人身伤害。您对使用任何此类工具或输出（包括但不限于其合法性、适当性和结果）负全部责任。

---

## 许可证

[Apache 2.0 CoolCline](./LICENSE)

---
