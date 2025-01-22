# Contributing to CoolCline

> README: [English](README.md) | [简体中文](README_zh.md)
>
> CHANGELOG: [English](CHANGELOG.md) | [简体中文](CHANGELOG_zh.md)
>
> CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING_zh.md)

[`CoolCline`](https://github.com/coolcline/coolcline.git) is an agentic coding assistant that combines the best features of [Cline](https://github.com/cline/cline.git), [Roo Cline](https://github.com/RooVetGit/Roo-Code.git) and [Bao Cline](https://github.com/jnorthrup/Bao-Cline.git). Working seamlessly with your **Command Line Interface** and **Editor**, it brings you the most powerful AI development experience. Thanks to all their `CoolClines` contributors!

Thank you for considering contributing to CoolCline! This guide will help you understand how to participate in project development.

## Git Workflow

We follow the standard `gitflow` workflow (recommended):

Remote and local branches:

- `main` branch: Stable release versions
- `develop` branch: Latest development version

Local-only branches:

- `feature/*` branches: New feature development
- `docs/*` branches: Documentation updates
- `hotfix/*` branches: Bug fixes for main branch
- `devfix/*` branches: Bug fixes for develop branch
- `release/*` branches: Release preparation

## Fork the `coolcline` Repository

- Gitee: [https://gitee.com/coolcline/coolcline.git](https://gitee.com/coolcline/coolcline.git)
- GitHub: [https://github.com/coolcline/coolcline.git](https://github.com/coolcline/coolcline.git)

Click the `fork` button to fork the repository to your Gitee or GitHub account.

## Clone the Repository

> Note: The develop branch contains the latest version, while the main branch is the release version of the develop branch:

```bash
# Execute in command line
# gitee
git clone https://gitee.com/<your-gitee-username>/coolcline.git
# github
git clone https://github.com/<your-github-username>/coolcline.git
```

## Prepare Development Branch in VSCode:

```bash
# Execute in command line
cd coolcline # Enter project directory
code coolcline # Open project

# Continue in command line or VSCode terminal
git checkout develop # Switch to develop branch
git pull origin develop # Pull latest develop branch

# Create branch like: `feature/<your-feature-name>`, `docs/<your-docs-name>`, `hotfix/<your-hotfix-name>`, `devfix/<your-devfix-name>`, `release/<your-release-name>`
git checkout -b feature/xx develop # Create feature branch from develop
```

## Setup Development Environment

> bun is currently more popular than npm, we recommend using bun to install dependencies. Note: if you switch to npm, please modify the commands in `package.json`.

1. Install bun

   > If you don't have bun yet, please install it first. bun website: [https://bun.sh/](https://bun.sh/)
   >
   > macOS install bun: `curl -fsSL https://bun.sh/install | bash`
   >
   > windows install bun: `powershell -c "irm bun.sh/install.ps1 | iex"`

2. Install dependencies (required):

```bash
# Execute in root directory to install all dependencies
# 'all' will install dependencies for both root and webview-ui/ directories
bun run install:all
```

## Debugging

1. Run tests:

```bash
# Execute in root directory
bun run test # Note: not `bun test`
```

2. Start development environment:
   Press `F5` (or click `Run` -> `Start Debugging` in VSCode top menu) to launch a new VSCode window with the extension loaded.

   > Note: If you encounter build issues, you may need to install the [esbuild problem matchers extension](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers).

## Contributing Guidelines

Anyone can contribute code to CoolCline, but we ask that you follow these guidelines:

1. **Keep Pull Requests Focused**

   - Limit PRs to a single feature or bug fix
   - Split larger changes into smaller, related PRs
   - Break changes into logical commits that can be reviewed independently

2. **Code Quality**

```bash
    # Before submitting:

    # Execute in root directory to check code style
    bun run lint # Address any ESLint warnings or errors before submitting
    # Execute in root directory to format code
    bun run format # Format code with Prettier

    # Follow TypeScript best practices and maintain type safety
```

3. **Testing**

   - Add tests for new features
   - Run `bun run test` to ensure all tests pass
   - Update existing tests if your changes affect them
   - Include both unit tests and integration tests where appropriate

4. **Commit Guidelines**

   - Write clear, descriptive commit messages
   - Use conventional commit format (e.g., "feat:", "hotfix:", "devfix:", "release:", "docs:")
   - Reference relevant issues in commits using #issue-number

5. **Before Submitting**

   - Rebase your branch on the latest develop branch
   - Ensure your branch builds successfully
   - Double-check all tests are passing (`bun run test`, note: not `bun test`)
   - Review your changes for any debugging code or console logs

6. **Pull Request Description**
   - Clearly describe what your changes do
   - Include steps to test the changes
   - List any breaking changes
   - Add screenshots for UI changes

## Contribution Agreement

By submitting a pull request, you agree that your contributions will be licensed under the same license as the project ([Apache 2.0](LICENSE)).

Hey: Contributing to CoolCline isn't just about writing code - it's about being part of a community that's shaping the future of AI-assisted development. Let's build something amazing together! 🚀
