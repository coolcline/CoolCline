# CoolCline

> README: [English](README.md) | [简体中文](README_zh.md)
>
> CHANGELOG: [English](CHANGELOG.md) | [简体中文](CHANGELOG_zh.md)
>
> CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING_zh.md)

---

[Cool Cline](https://gitee.com/coolcline/coolcline.git) is a proactive programming assistant that combines the best features of [Cline](https://github.com/cline/cline.git), [Roo Code](https://github.com/RooVetGit/Roo-Code.git), and [Bao Cline](https://github.com/jnorthrup/Bao-Cline.git) (thanks to all contributors of the `Clines` projects!). It seamlessly collaborates with your command line interface and editor, providing the most powerful AI development experience.

---

## Key Features

### Optimize Your Queries

Click the ✨ button at the bottom of the chat input box to help optimize your input.

### Quickly Switch LLM Provider

- You can switch LLM Provider at the bottom of the chat input box.
- You can open the `Settings` page, where you will see the settings area at the top. Through the settings, you will get the dropdown list you want, supporting adding, renaming, and deleting (this feature will not delete the LLM Provider configuration). Before adding, please configure your LLM Provider below, as the dropdown list will remember the currently configured LLM Provider, such as selecting the Provider, apikey, model, etc. It is recommended to associate the alias with the Provider and Model for easy identification.

### Auto-Approve

CoolCline communicates in **natural language** and suggests actions—file edits, terminal commands, browser tests, etc. You can choose how it behaves:

- **Manual Approve**: Review and approve each step to maintain full control.
- **Autonomous/Auto-Approve**: Grant CoolCline the ability to run tasks without interruption, speeding up daily workflows (set by checking or unchecking the `Auto-Approve` options above the chat input box or on the settings page).
- **Hybrid**: Automatically approve specific actions (e.g., file writes) but require confirmation for higher-risk tasks (e.g., deploying code).

Regardless of your preference, you always have the final say on CoolCline's actions.

---

### Configure LLM Provider

Before using CoolCline, you need to configure the LLM Provider on the `Settings` page at the top right corner of the extension (mandatory):

- Supported models include: OpenRouter, Anthropic, Glama, OpenAI, OpenAI Compatible, Google Gemini, AWS Bedrock, Azure, GCP Vertex, or local models (LM Studio/Ollama) or any model **compatible with OpenAI** SDK (OpenAI Compatible).
- Recommendation: Currently, the most cost-effective models are DeepSeek v3 (deepseek-chat) or DeepSeek R1 (deepseek-reasoner) from [DeepSeek](https://platform.deepseek.com/usage). They release new models immediately on the API, so you will find that the models do not have version numbers.
- **Usage Tracking**: CoolCline helps you monitor token and cost usage for each session.

---

### Chat Modes

You can now select different chat modes at the bottom of the chat input box to better suit your workflow. The available modes are:

Built-in:

- **Code**: (current behavior) Default mode, CoolCline helps you write code and perform tasks.
- **Architect**: "You are CoolCline, a software architecture expert..." Suitable for high-level technical design and system architecture thinking (this mode cannot write code or run commands).
- **Ask**: "You are CoolCline, a knowledgeable technical assistant..." Suitable for asking questions about the codebase or discussing concepts in-depth (this mode cannot write code or run commands).
- Management: Manage them on the `Prompts` page at the top right corner of the CoolCline extension.

---

### File and Editor Operations

CoolCline can:

- **Create and edit** files in the project (showing differences).
- **Automatically respond** to linting or compilation errors (missing imports, syntax errors, etc.).
- **Track changes through the editor's timeline**, so you can review or revert when needed.

---

### Command Line Integration

On the CoolCline settings page, you can preset commands allowed to be executed automatically, such as `npm install`, `npm run`, `npm test`, etc. When the LLM needs to execute these commands, CoolCline will not wait for your approval.

---

### Browser Automation

CoolCline can also open **browser** sessions to:

- Launch local or remote web applications.
- Click, type, scroll, and take screenshots.
- Collect console logs to debug runtime or UI/UX issues.

Ideal for **end-to-end testing** or visually verifying changes without constant copy-pasting.

---

### Add Tools with MCP

- MCP official documentation: https://modelcontextprotocol.io/introduction

Extend CoolCline through the **Model Context Protocol (MCP)**, such as:

- "Add a tool to manage AWS EC2 resources."
- "Add a tool to query the company's Jira."
- "Add a tool to fetch the latest PagerDuty incidents."

CoolCline can autonomously build and configure new tools (with your approval) to immediately expand its capabilities.

---

### Context Mentions

When you need to provide explicit context, type the `@` symbol in the input box:

> Associating the most relevant context can save your token budget.

- **@Problems** – Provide workspace errors/warnings for CoolCline to fix.
- **@Paste URL to fetch contents** – Fetch documents from a URL and convert them to Markdown.
- **@Add Folder** – Provide a folder to CoolCline.
- **@Add File** – Provide a file to CoolCline.
- **@Git Commits** – Provide Git commits or diff lists for CoolCline to analyze code history.

---

## Installation

Two installation methods, choose one:

- Search for `CoolCline` in the editor's extension panel to install directly.
- Or get the `.vsix` file from [Marketplace](https://marketplace.visualstudio.com/items?itemName=CoolCline.coolcline) / [Open-VSX](https://open-vsx.org/extension/CoolCline/coolcline) and `drag and drop` it into the editor.

> **Tip**:
>
> - Moving the extension to the right side of the screen provides a better experience: Right-click on the CoolCline extension icon -> Move to -> Secondary Sidebar.
> - Closing the `Secondary Sidebar` might make it unclear how to reopen it. You can click the `Toggle Secondary Sidebar` button at the top right corner of vscode, or use the keyboard shortcut ctrl + shift + L.

---

## Local Setup and Development

Refer to the instructions in the CONTRIBUTING file: [English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING_zh.md)

---

## Contributing

We welcome community contributions! Here’s how to get involved:
CONTRIBUTING: [English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING_zh.md)

---

## Disclaimer

**Please note**, CoolCline makes no representations or warranties regarding any code, models, or other tools provided, any related third-party tools, or any results output. You assume **all risks** associated with the use of any such tools or output; such tools are provided on an **“as-is”** and **“as-available”** basis. Such risks may include, but are not limited to, intellectual property infringement, cybersecurity vulnerabilities or attacks, biases, inaccuracies, errors, defects, viruses, downtime, property damage or loss, and/or personal injury. You bear full responsibility for the use of any such tools or output (including but not limited to their legality, appropriateness, and results).

---

## License

[Apache 2.0 CoolCline](./LICENSE)

---
