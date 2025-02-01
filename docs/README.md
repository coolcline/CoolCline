# Goated Cline Offline Documentation

## Overview

Goated Cline is a proactive programming assistant that combines the best features of Cline, Roo Code, and Bao Cline. It seamlessly collaborates with your command line interface and editor, providing the most powerful AI development experience.

## Key Features

### Optimize Your Queries

Click the ✨ button at the bottom of the chat input box to help optimize your input.

### Quickly Switch LLM Provider

- You can switch LLM Provider at the bottom of the chat input box.
- You can open the `Settings` page, where you will see the settings area at the top. Through the settings, you will get the dropdown list you want, supporting adding, renaming, and deleting (this feature will not delete the LLM Provider configuration). Before adding, please configure your LLM Provider below, as the dropdown list will remember the currently configured LLM Provider, such as selecting the Provider, apikey, model, etc. It is recommended to associate the alias with the Provider and Model for easy identification.

### Auto-Approve

Goated Cline communicates in **natural language** and suggests actions—file edits, terminal commands, browser tests, etc. You can choose how it behaves:

- **Manual Approve**: Review and approve each step to maintain full control.
- **Autonomous/Auto-Approve**: Grant Goated Cline the ability to run tasks without interruption, speeding up daily workflows (set by checking or unchecking the `Auto-Approve` options above the chat input box or on the settings page).
- **Hybrid**: Automatically approve specific actions (e.g., file writes) but require confirmation for higher-risk tasks (e.g., deploying code).

Regardless of your preference, you always have the final say on Goated Cline's actions.

### Configure LLM Provider

Before using Goated Cline, you need to configure the LLM Provider on the `Settings` page at the top right corner of the extension (mandatory):

- Supported models include: OpenRouter, Anthropic, Glama, OpenAI, OpenAI Compatible, Google Gemini, AWS Bedrock, Azure, GCP Vertex, or local models (LM Studio/Ollama) or any model **compatible with OpenAI** SDK (OpenAI Compatible).
- Recommendation: Currently, the most cost-effective models are DeepSeek v3 (deepseek-chat) or DeepSeek R1 (deepseek-reasoner) from [DeepSeek](https://platform.deepseek.com/usage). They release new models immediately on the API, so you will find that the models do not have version numbers.
- **Usage Tracking**: Goated Cline helps you monitor token and cost usage for each session.

### Chat Modes

You can now select different chat modes at the bottom of the chat input box to better suit your workflow. The available modes are:

Built-in:

- **Code**: (current behavior) Default mode, Goated Cline helps you write code and perform tasks.
- **Architect**: "You are Goated Cline, a software architecture expert..." Suitable for high-level technical design and system architecture thinking (this mode cannot write code or run commands).
- **Ask**: "You are Goated Cline, a knowledgeable technical assistant..." Suitable for asking questions about the codebase or discussing concepts in-depth (this mode cannot write code or run commands).
- Management: Manage them on the `Prompts` page at the top right corner of the Goated Cline extension.

### File and Editor Operations

Goated Cline can:

- **Create and edit** files in the project (showing differences).
- **Automatically respond** to linting or compilation errors (missing imports, syntax errors, etc.).
- **Track changes through the editor's timeline**, so you can review or revert when needed.

### Command Line Integration

On the Goated Cline settings page, you can preset commands allowed to be executed automatically, such as `npm install`, `npm run`, `npm test`, etc. When the LLM needs to execute these commands, Goated Cline will not wait for your approval.

### Browser Automation

Goated Cline can also open **browser** sessions to:

- Launch local or remote web applications.
- Click, type, scroll, and take screenshots.
- Collect console logs to debug runtime or UI/UX issues.

Ideal for **end-to-end testing** or visually verifying changes without constant copy-pasting.

### Add Tools with MCP

- MCP official documentation: https://modelcontextprotocol.io/introduction

Extend Goated Cline through the **Model Context Protocol (MCP)**, such as:

- "Add a tool to manage AWS EC2 resources."
- "Add a tool to query the company's Jira."
- "Add a tool to fetch the latest PagerDuty incidents."

Goated Cline can autonomously build and configure new tools (with your approval) to immediately expand its capabilities.

### Context Mentions

When you need to provide explicit context, type the `@` symbol in the input box:

> Associating the most relevant context can save your token budget.

- **@Problems** – Provide workspace errors/warnings for Goated Cline to fix.
- **@Paste URL to fetch contents** – Fetch documents from a URL and convert them to Markdown.
- **@Add Folder** – Provide a folder to Goated Cline.
- **@Add File** – Provide a file to Goated Cline.
- **@Git Commits** – Provide Git commits or diff lists for Goated Cline to analyze code history.

## Local Features

Goated Cline includes several local features that do not require paid mods:

- **Offline Documentation**: Access comprehensive offline documentation for all features and tools.
- **Interactive Tutorials**: Follow interactive tutorials and guides without an internet connection.
- **Example Projects**: Explore and modify example projects and code snippets locally.

## Web3 Capabilities

Goated Cline supports Web3 development:

- **Web3 Libraries**: Integrate Web3 libraries for blockchain interactions.
- **Smart Contracts**: Add support for smart contracts.
- **DApps**: Develop decentralized applications (dApps).
- **DeFi**: Add support for decentralized finance (DeFi) applications.

## Interactive Tutorials

Goated Cline provides interactive tutorials and guides that can be accessed without an internet connection. These tutorials are designed to help users understand and utilize the various features and capabilities of Goated Cline.

### Available Tutorials

#### Getting Started with Goated Cline

This tutorial covers the basics of installing, configuring, and using Goated Cline for the first time.

1. **Installation**: Learn how to install Goated Cline.
2. **Configuration**: Configure your LLM Provider on the `Settings` page.
3. **First Task**: Start a new task by clicking the `New Task` button.

#### Using Web3 Capabilities

This tutorial demonstrates how to integrate and use Web3 capabilities in Goated Cline.

1. **Integrate Web3 Libraries**: Learn how to integrate Web3 libraries for blockchain interactions.
2. **Smart Contracts**: Add support for smart contracts.
3. **DApps**: Develop decentralized applications (dApps).
4. **DeFi**: Add support for decentralized finance (DeFi) applications.

#### Local Features

This tutorial explains the local features of Goated Cline that do not require paid mods.

1. **Offline Documentation**: Access comprehensive offline documentation for all features and tools.
2. **Interactive Tutorials**: Follow interactive tutorials and guides without an internet connection.
3. **Example Projects**: Explore and modify example projects and code snippets locally.

### How to Access Tutorials

To access the interactive tutorials, navigate to the `Tutorials` section in the Goated Cline interface. Select the tutorial you want to follow and start learning.

### Feedback

We welcome your feedback on the tutorials. If you have any suggestions or encounter any issues, please let us know through the feedback form in the Goated Cline interface.

## Example Projects and Code Snippets

Goated Cline provides example projects and code snippets that users can explore and modify locally. These examples are designed to help users understand how to use Goated Cline's features and capabilities effectively.

### Available Example Projects

#### Web3 DApp Example

This example project demonstrates how to build a decentralized application (dApp) using Goated Cline's Web3 capabilities.

1. **Setup**: Learn how to set up the project.
2. **Smart Contracts**: Explore the smart contracts used in the project.
3. **Frontend**: Understand the frontend code and how it interacts with the blockchain.
4. **Deployment**: Learn how to deploy the dApp to a blockchain network.

#### Local Development Tools Example

This example project showcases the enhanced local development tools provided by Goated Cline.

1. **Built-in Code Editor**: Explore the built-in code editor with syntax highlighting and linting capabilities.
2. **Local Server**: Learn how to use the integrated local server for testing web applications.
3. **Local Database Management**: Understand how to use the local database management tool for development and testing purposes.

### How to Access Example Projects

To access the example projects, navigate to the `Examples` section in the Goated Cline interface. Select the example project you want to explore and start learning.

### Feedback

We welcome your feedback on the example projects. If you have any suggestions or encounter any issues, please let us know through the feedback form in the Goated Cline interface.
