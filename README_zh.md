# CoolCline

> README: [English](README.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/README_zh.md) CHANGELOG: [English](CHANGELOG.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CHANGELOG_zh.md) CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)
>
> 详细文档: [English](docs/user-docs/en/index.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/docs/user-docs/zh/index.md)

---

[CoolCline](https://gitee.com/coolcline/coolcline.git) 是一个主动编程助手，结合了 `Cline` 和 `Roo Code` 的最佳特性，并提供了以下几种模式：

- `Agent` 模式：一个具有代码理解、生成和项目管理全面能力的自主 AI 编程代理（自动阅读、编辑代码，自动执行命令，自动上下文理解，自动任务理解及分解，自动工具使用，注意：此模式不受自动批准的勾选或取消勾选的限制）
- `Code` 模式：帮助你编写、重构、修复代码和运行命令（编写代码，执行命令）
- `Architect` 模式：适用于高层技术设计和系统架构讨论（此模式不能编写代码或执行命令）
- `Ask` 模式：适用于代码库相关问题和概念探索（此模式不能编写代码或执行命令）

---

<div style="text-align: center;">
  <img src="assets/docs/chat.png" alt="chat" width="40%">
</div>

---

<div style="text-align: center;">
  <img src="assets/docs/codebase.png" alt="codebase" width="40%">
</div>

---

## 准备工作

### 安装 VSCode 插件

- 在 VSCode 插件市场搜索 `CoolCline`，安装即可

### 界面语言配置

- 如果您是第一次安装`CoolCline`或您在`Settings`⚙️ 页面底部点击了`重置`按钮，您将看到`Welcome`页面，页面上可以设置`语言`(默认是English，可以设置简体中文，俄语等主流语言)
- 如果您已经配置过 LLM Provider，将看不到`Welcome`页面，想进一步配置语言，您可以从扩展右上角的`Settings`⚙️ 页面进入，可以设置`语言`
- 相同配置在不同页面是同步和共享的

### 配置 LLM Provider

使用 CoolCline 前您需要提前至少配置好一个 LLM Provider（必须）

- 如果您是第一次安装`CoolCline`或您在`Settings`⚙️ 页面底部点击了`重置`按钮，您将看到`Welcome`页面，页面上可以配置`LLM Provider`
- 根据选择的 LLM Provider，填写 API Key 和 Model 等参数（一些 LLM Provider 可以从 API Key 输入框底部的链接快速打开申请 API Key 的页面）
- 如果您已经配置过 LLM Provider，将看不到`Welcome`页面，想进一步配置 LLM Provider 或其他选项，您需要从扩展右上角的`Settings`⚙️ 页面进入
- 相同配置在不同页面是同步和共享的

---

## 主要功能

> 我将标注使用 CoolCline 的三个层级，`基础`，`进阶`，以及`高级`，这应该被解读为关注的建议，而不是硬性或严格的标准。

### 角色模式管理

不同的角色模式适应您的工作流程需求：

#### 内置模式（基础）：

- 在聊天输入框底部选择不同的角色模式
- 自主代理（`Agent` 模式）：一个主动型 AI 编程代理，它具备以下能力：

    1. 上下文分析能力：
        - 使用代码库搜索进行广泛理解
        - 自动使用文件读取进行详细检查
        - 使用定义名称列表了解代码结构
        - 使用文件列表探索项目组织
        - 使用代码库范围搜索快速定位相关代码
    2. 任务管理能力：
        - 自动分解复杂任务为小步骤
        - 使用新任务工具管理主要子任务
        - 跟踪进度和依赖关系
        - 使用任务完成工具验证任务状态
    3. 代码操作能力：
        - 使用搜索和替换进行系统性代码更改
        - 自动使用文件编辑进行精确修改
        - 使用差异应用进行复杂更改
        - 使用内容插入工具进行代码块管理
        - 验证更改并检查错误
        - **Git 快照功能**：
            - 使用 `save_checkpoint` 保存代码状态快照，自动记录重要修改点
            - 使用 `restore_checkpoint` 在需要时回滚到之前的快照
            - 使用 `get_checkpoint_diff` 查看快照之间的具体改动
            - 快照功能对每个任务独立，不会影响你的主要 Git 仓库
            - 所有快照操作都在隐藏分支上进行，保证主分支干净
            - 您可以发送下面某句话或多句话开始：
                - "在开始这个任务前，先创建一个 git 快照"
                - "保存当前修改为 git 快照，描述为'完成基础功能实现'"
                - "让我看看最近两个 git 快照之间的改动"
                - "这个改动有问题，回滚到上一个 git 快照"
                - "对比一下初始 git 快照和当前状态的区别"
    4. 研究和集成能力：

        - 自动使用浏览器操作研究解决方案和最佳实践（需要模型支持 Computer Use）
        - 自动使用命令（需要在`Settings`⚙️ 页面手工设置允许的命令）
        - 自动使用 MCP 工具访问外部资源和数据（需要在`MCP Servers `页面手工配置 MCP 服务器）

    5. 沟通和验证能力：- 为每个操作提供清晰解释 - 使用跟进问题进行澄清 - 记录重要更改 - 使用适当的测试验证结果
        > 注意：`Agent` 模式不受自动批准的勾选或取消勾选的限制

- 代码助手（`Code` 模式）：用于编写、重构、修复代码和运行命令
- 软件架构师（`Architect` 模式）：用于高层技术设计和系统架构（不能编写代码或执行命令）
- 技术助手（`Ask` 模式）：用于代码库查询和概念讨论（不能编写代码或执行命令）

#### 自定义模式（专家）：

- 从 CoolCline 的右上角访问 `Prompts` 页面来创建自定义角色模式
- 自定义聊天模式会出现在 `Ask` 模式下方
- 自定义角色会本地保存，在 CoolCline 会话之间保持不变

---

### 快速切换 LLM Provider（进阶）

切换按钮在输入框底部中间位置

下拉列表选项在`Settings`页面管理：

- 您可以打开`Settings`⚙️页面，在顶部区域可以看到设置的地方，就是有个`default`选项那个地方，通过设置您将得到您要的下拉列表
- 在这里，您可以创建和管理多个 LLM Provider 选项
    - 您甚至可以为同一个 LLM Provider 的不同 Model 创建单独的选项，每个选项保存当前 LLM Provider 的完整配置信息。
    - 创建后，您可以在聊天输入框底部实时切换配置
    - 配置信息包含： LLM Provider、 API Key、 Model 以及与 LLM Provider 有关的其他配置项
    - 创建 LLM Provider 选项的步骤如下（步骤 4 可以与 2 和 3 顺序调换）：
        1.  点击 + 按钮，系统会自动根据当前配置信息`复制`一个选项，名字为 xx (copy)；
        2.  点击 ✏️ 图标修改选项名称；
        3.  点击 ☑️ 保存选项名称；
        4.  按需要调整 Model 等核心参数（编辑框失去焦点后会自动保存）。
    - 选项名称的命名建议： 推荐采用「服务商-模型版本-特性」结构，例如： openrouter-deepseek-v3-free； openrouter-deepseek-r1-free； deepseek-v3-官方； deepseek-r1-官方。

---

### 增强您输入的问题（基础）

当您在输入框中输入问题后，可以点击底部的 ✨ 按钮，它会增强您的问题内容。您可以在 `Prompts` 页面的 `辅助功能 Prompt 配置` 区域中设置 `Prompt 增强` 使用的 LLM Provider。

---

### 上下文提及（基础）

> 关联最相关的上下文，能节约您的令牌预算

需要明确提供上下文时，在输入框输入`@`符号：

- `@Problems` – 提供工作区错误/警告供 CoolCline 修复。
- `@Paste URL to fetch contents` – 从 URL 获取文档，将其转换为 Markdown，这不用手工输入`@`符号，直接粘贴链接即可。
- `@Add Folder` – 提供文件夹给 CoolCline，输入`@`符号后，可以直接输入文件夹名称，它将模糊搜索，然后您就可以快速选择您需要的。
- `@Add File` – 提供文件给 CoolCline，输入`@`符号后，可以直接输入文件名称，它将模糊搜索，然后您就可以快速选择您需要的。
- `@Git Commits` – 提供 Git 提交或差异列表供 CoolCline 分析代码历史。
- `添加终端界面内容到上下文` - 这不用`@`符号，在终端界面选中要添加的内容，然后点右键，点击`CoolCline:Add Terminal Content to Context`

---

### 自动批准（进阶）

为了让您可控（防止失控）的使用 CoolCline 协助您开发，应用提供了三种批准选项：

- 手动批准：由您审查并批准每一步，以保持完全控制，在应用弹窗提示时由您点击允许或取消，如保存、执行命令等。
- 自动批准：由您提前授予 CoolCline 无中断运行任务的能力（推荐在 Agent 模式下启用以实现完全自主）
- 自动批准的设置方式：在聊天输入框上方或设置页面勾选或去掉勾选您想控制的选项
- 其中允许自动批准命令：您还需要到`设置`页面，在`命令行`区域，添加您想自动批准的命令，如`npm install`、`npm run`、`npm test`等。
- 混合：自动批准特定操作（例如文件写入），但需要确认风险较高的任务（如强烈建议`不能`配置 git add，git commit 等，应该手工做这个）。

无论您的偏好如何，您始终对 CoolCline 的操作拥有最终决定权。

---

### 角色模式（进阶）

#### 使用 Agent 模式

- 在`Prompts`页面为`agent`模式设置拥有良好能力的 LLM Provider 选项
- 从清晰的高层任务描述开始
- 使用`@`提供更清晰准确的代码库、文件、URL、Git 提交等上下文
- 利用 Git 快照功能管理重要更改：
  您可以发送下面某句话或多句话开始：
    - "在开始这个任务前，先创建一个 git 快照"
    - "保存当前修改为 git 快照，描述为'完成基础功能实现'"
    - "让我看看最近两个 git 快照之间的改动"
    - "这个改动有问题，回滚到上一个 git 快照"
    - "对比一下初始 git 快照和当前状态的区别"
- 在` Settings`页面配置一些允许的命令、在`MCP Servers`页面配置一些 MCP 服务器，Agent 将自动调用这些命令和 MCP 服务器
- 命令设置界面建议`不要`设置`git add`，`git commit`命令，您应用手动控制它们
- 在需要时考虑切换到专门的模式（Code/Architect/Ask）处理特定子任务

#### 使用其他模式

- Code 模式：最适合直接编码任务和实现
- Architect 模式：适合规划和设计讨论
- Ask 模式：非常适合学习和探索概念

---

## 其他功能

### 浏览器自动化（高级）

#### 浏览器功能

CoolCline 还可以打开`浏览器`会话以：

- 启动本地或远程 Web 应用。
- 点击、输入、滚动和截屏。
- 收集控制台日志以调试运行时或 UI/UX 问题。

非常适合`端到端测试`或在不需要不断复制粘贴的情况下视觉验证更改。

#### 启用浏览器自动化

- `自动批准`区域勾选 `批准浏览器操作`(需要 LLM Provider 支持 Computer Use 功能)
- 在`设置`页面，在`浏览器设置`区域，您还可以设置其他选项

---

### 使用 MCP 添加工具（高级）

- MCP 官方文档: https://modelcontextprotocol.io/introduction

通过`模型上下文协议 (MCP)` 扩展 CoolCline，如：

- “添加一个管理 AWS EC2 资源的工具。”
- “添加一个查询公司 Jira 的工具。”
- “添加一个拉取最新 PagerDuty 事件的工具。”

CoolCline 可以自主构建和配置新工具（需要您的批准），以立即扩展其功能。

---

## 通知设置（基础）

- 在`设置`页面，您可以启用音效和音量，这样当某个任务完成后会有音效提醒您（这样你就可以在 CoolCline 工作时摸鱼）

---

### 高级设置（高级）

- 在`设置`页面，您可以设置其他选项

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

参考 CONTRIBUTING 文件中的说明 : [English](./CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)

---

## 贡献

我们欢迎社区贡献！以下是参与方式：
CONTRIBUTING: [English](./CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)

> [CoolCline](https://gitee.com/coolcline/coolcline.git) 借鉴了 `Clines` 开源社区的优秀功能（感谢所有`Clines`项目的贡献者！ ）。

---

## 免责声明

**请注意**，CoolCline 不对提供的任何代码、模型或其他工具，任何相关的第三方工具或任何结果输出做出任何陈述或保证。您承担使用任何此类工具或输出的 **所有风险**；此类工具按 **“原样”** 和 **“可用”** 基础提供。此类风险可能包括但不限于知识产权侵权、网络漏洞或攻击、偏见、不准确、错误、缺陷、病毒、停机、财产损失或损害和/或人身伤害。您对使用任何此类工具或输出（包括但不限于其合法性、适当性和结果）负全部责任。

---

## 许可证

[Apache 2.0 CoolCline](./LICENSE)

---
