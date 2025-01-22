# 贡献指南

> README: [English](README.md) | [简体中文](README_zh.md)
>
> CHANGELOG: [English](CHANGELOG.md) | [简体中文](CHANGELOG_zh.md)
>
> CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING_zh.md)

[CoolCline](https://gitee.com/coolcline/coolcline.git) 是一个融合了 [Cline](https://github.com/cline/cline.git)、[Roo Cline](https://github.com/RooVetGit/Roo-Code.git) 和 [Bao Cline](https://github.com/jnorthrup/Bao-Cline.git) 最佳特性的主动式编程助手。它能与你的**命令行界面**和**编辑器**无缝协作，带来最强大的 AI 开发体验。感谢所有 `CoolClines` 项目的贡献者！

感谢你考虑为 CoolCline 做出贡献！本指南将帮助你了解如何参与项目开发。

## Git 工作流程

我们采用标准的 `gitflow` 流程规范（推荐您也使用）：

线上线下分支

- `main` 分支：稳定的发布版本
- `develop` 分支：最新的开发版本

仅在您本地的分支

- `feature/*` 分支：新功能开发
- `docs/*` 分支：文档更新
- `hotfix/*` 分支：main 分支 bug 修复
- `devfix/*` 分支：develop 分支 bug 修复
- `release/*` 分支：版本发布准备

## Fork `coolcline` 仓库

- Gitee：[https://gitee.com/coolcline/coolcline.git](https://gitee.com/coolcline/coolcline.git)

- GitHub: [https://github.com/coolcline/coolcline.git](https://github.com/coolcline/coolcline.git)

点击 `fork` 按钮，将仓库 fork 到您的 Gitee 或 GitHub 账户下

## 克隆仓库

> 注意：develop 分支包含最新版本，main 分支是 develop 分支的发布版本：

```bash
# 在命令行中执行命令
git clone https://gitee.com/<your-gitee-username>/coolcline.git
# github
git clone https://github.com/<your-github-username>/coolcline.git
```

## 在 VSCode 中准备开发分支：

```bash
    # 在命令行中执行命令
    cd coolcline # 进入项目目录
    code coolcline # 打开项目

    # 继续在命令行中或在 VSCode 的终端界面执行命令
    git checkout develop # 切换到 develop 分支
    git pull origin develop # 拉取最新 develop 分支，确保您本地的 develop 分支是最新的

    # 创建分支，如：`feature/<your-feature-name>`, `docs/<your-docs-name>`, `hotfix/<your-hotfix-name>`, `devfix/<your-devfix-name>`, `release/<your-release-name>`
    git checkout -b feature/xx develop # 从 develop 分支创建 feature 分支
```

## 准备开发环境

> bun 目前比 npm 更受欢迎，推荐使用 bun 来安装依赖。注意如果换 npm 请修改 `package.json` 文件内命令部分。

1. 安装bun

   > 假如您还没有 bun，请先安装 bun，bun 官网：[https://bun.sh/](https://bun.sh/)
   >
   > macOS 安装 bun: `curl -fsSL https://bun.sh/install | bash`
   >
   > windows 安装 bun: `powershell -c "irm bun.sh/install.ps1 | iex"`

2. 安装依赖（必须）：

```bash
    # 在根目录执行命令，安装所有依赖，all 将同时安装根目录和 webview-ui/ 目录的依赖
    bun run install:all
```

## 调试

1. 执行测试命令

```bash
    # 在根目录执行命令，执行测试
    bun run test # 注意不是 `bun test`
```

2. 启动开发环境：
   按 `F5`（或在 vscode 顶部菜单栏点击 `运行` -> `开始调试`）来启动一个加载了扩展的新 VSCode 窗口。

   > 注意：如果构建时遇到问题，可能需要安装 [esbuild problem matchers 扩展](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers)。

## 如果需要安装测试 VSCode 扩展包

```bash
# 打开命令行，在根目录执行命令
# 安装 vsce
bun add -d vsce
# 构建扩展包
vsce package
# 安装扩展包
code --install-extension coolcline-4.0.1.vsix
```

## 贡献准则

欢迎任何爱好者为 CoolCline 贡献代码，但期望遵循以下准则：

1.  **保持 Pull Request 专注**

    - 将 PR 限制在单个功能或 bug 修复
    - 将较大的更改拆分成较小的相关 PR
    - 将更改分解为可以独立审查的逻辑提交

2.  **代码质量**

```bash
    # 提交前：

    # 在根目录执行命令，检查代码风格
    bun run lint # 解决提交前的任何 ESLint 警告或错误
    # 在根目录执行命令，格式化代码
    bun run format # 用 Prettier 格式化代码

    # 遵循 TypeScript 最佳实践并保持类型安全
```

3.  **测试**

    - 为新功能添加测试
    - 运行 `bun run test` 确保所有测试通过
    - 如果你的更改影响了现有测试,请更新它们
    - 在适当的情况下包含单元测试和集成测试

4.  **提交指南**

    - 编写清晰、描述性的提交消息
    - 使用约定式提交格式(例如:"feat:", "hotfix:", "devfix:", "release:", "docs:")
    - 在提交中使用 #issue-number 引用相关问题

5.  **提交前**

    - 在最新的 develop 分支上变基你的分支
    - 确保你的分支构建成功
    - 再次检查所有测试是否通过(`bun run test`，注意不是 `bun test`)
    - 检查更改中是否有调试代码或控制台日志

6.  **Pull Request 描述**
    - 清晰描述你的更改做了什么
    - 包含测试更改的步骤
    - 列出任何破坏性更改
    - 为 UI 更改添加截图

## 贡献协议

通过提交 pull request，你同意你的贡献将在相同的许可下获得许可([Apache 2.0](LICENSE))。

为 CoolCline 做贡献不仅仅是编写代码 - 这是成为一个正在塑造 AI 辅助开发未来的社区的一部分。让我们一起创造令人惊叹的东西! 🚀
