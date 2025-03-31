# CoolCline

> README: [English](README.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/README_zh.md) CHANGELOG: [English](CHANGELOG.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CHANGELOG_zh.md) CONTRIBUTING: [English](CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)
>
> Detailed Documentation: [English](docs/user-docs/en/index.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/docs/user-docs/zh/index.md)

---

[CoolCline](https://gitee.com/coolcline/coolcline.git) is a proactive programming assistant that combines the best features of `Cline` and `Roo Code`, offering the following modes:

- `Agent` Mode: An autonomous AI programming agent with comprehensive capabilities in code understanding, generation, and project management (automatic code reading/editing, command execution, context understanding, task analysis/decomposition, and tool usage, note: this mode is not affected by the checkboxes in the auto-approval area)
- `Code` Mode: Helps you write, refactor, fix code and run commands (write code, execute commands)
- `Architect` Mode: Suitable for high-level technical design and system architecture discussions (this mode cannot write code or execute commands)
- `Ask` Mode: Suitable for codebase-related questions and concept exploration (this mode cannot write code or execute commands)

---

## ![chat](assets/docs/chat.png)

## ![codebase](assets/docs/codebase.jpg)

## Getting Started

### Install VSCode Extension

- Search for `CoolCline` in the VSCode extension marketplace and install

### Configure Language

- If you're installing `CoolCline` for the first time or clicked the `Reset` button at the bottom of the `Settings`⚙️ page, you'll see the `Welcome` page where you can set the `Language` (default is English, supports Chinese, Russian, and other major languages)
- If you've already configured an LLM Provider, you will not see the `Welcome` page, to further configure language, you can access the `Settings`⚙️ page from the extension's top-right corner

### Configure LLM Provider

You need to configure at least one LLM Provider before using CoolCline (Required)

- If you're installing `CoolCline` for the first time or clicked the `Reset` button at the bottom of the `Settings`⚙️ page, you'll see the `Welcome` page where you can configure `LLM Provider`
- Based on your chosen LLM Provider, fill in the API Key, Model, and other parameters (some LLM Providers have quick links below the API Key input field to apply for an API Key)
- If you've already configured an LLM Provider, you will not see the `Welcome` page, but you can access the `Settings`⚙️ page from the extension's top-right corner to further configure it or other options
- The same configurations are synchronized and shared across different pages

---

## Main Features

> I'll mark three levels of using CoolCline: `Basic`, `Advanced`, and `Expert`. These should be interpreted as suggested focus areas rather than strict or rigid standards.

### Role Mode Management

Different role modes adapt to your workflow needs:

#### Built-in Modes (Basic):

- Select different role modes at the bottom of the chat input box
- Autonomous Agent (`Agent` mode): A proactive AI programming agent with the following capabilities:

    1. Context Analysis Capabilities:
        - Uses codebase search for broad understanding
        - Automatically uses file reading for detailed inspection
        - Uses definition name lists to understand code structure
        - Uses file lists to explore project organization
        - Uses codebase-wide search to quickly locate relevant code
    2. Task Management Capabilities:
        - Automatically breaks down complex tasks into steps
        - Uses new task tools to manage major subtasks
        - Tracks progress and dependencies
        - Uses task completion tools to verify task status
    3. Code Operation Capabilities:
        - Uses search and replace for systematic code changes
        - Automatically uses file editing for precise modifications
        - Uses diff application for complex changes
        - Uses content insertion tools for code block management
        - Validates changes and checks for errors
        - **Git Snapshot Feature**:
            - Uses `save_checkpoint` to save code state snapshots, automatically recording important modification points
            - Uses `restore_checkpoint` to roll back to previous snapshots when needed
            - Uses `get_checkpoint_diff` to view specific changes between snapshots
            - Snapshot feature is independent for each task, not affecting your main Git repository
            - All snapshot operations are performed on hidden branches, keeping the main branch clean
            - You can start by sending one or more of the following messages:
                - "Create a git snapshot before starting this task"
                - "Save current changes as a git snapshot with description 'completed basic functionality'"
                - "Show me the changes between the last two git snapshots"
                - "This change is problematic, roll back to the previous git snapshot"
                - "Compare the differences between the initial git snapshot and current state"
    4. Research and Integration Capabilities:

        - Automatically uses browser operations to research solutions and best practices (requires model support for Computer Use)
        - Automatically uses commands (requires manual configuration of allowed commands in `Settings`⚙️ page)
        - Automatically uses MCP tools to access external resources and data (requires manual configuration of MCP servers in the `MCP Servers` page)

    5. Communication and Validation Capabilities: - Provides clear explanations for each operation - Uses follow-up questions for clarification - Records important changes - Uses appropriate tests to validate results
       Note: `Agent` mode is not affected by the checkboxes in the auto-approval area

- Code Assistant (`Code` mode): For writing, refactoring, fixing code, and running commands
- Software Architect (`Architect` mode): For high-level technical design and system architecture (cannot write code or execute commands)
- Technical Assistant (`Ask` mode): For codebase queries and concept discussions (cannot write code or execute commands)

#### Custom Modes (Expert):

- Access the `Prompts` page from CoolCline's top-right corner to create custom role modes
- Custom chat modes appear below the `Ask` mode
- Custom roles are saved locally and persist between CoolCline sessions

---

### Quick LLM Provider Switching (Advanced)

The switch button is located at the bottom center of the input box.

> Dropdown list options are maintained on the `Settings` page.

- You can open the `Settings`⚙️ page, and in the top area, you will see the settings location, which has a `default` option. By setting this, you will get the dropdown list you want.
- Here, you can create and manage multiple LLM Provider options.
    - You can even create separate options for different models of the same LLM Provider, each option saving the complete configuration information of the current LLM Provider.
    - After creation, you can switch configurations in real-time at the bottom of the chat input box.
    - Configuration information includes: LLM Provider, API Key, Model, and other configuration items related to the LLM Provider.
    - The steps to create an LLM Provider option are as follows (steps 4 can be interchanged with 2 and 3):
        1.  Click the + button, the system will automatically `copy` an option based on the current configuration information, named xx (copy);
        2.  Click the ✏️ icon to modify the option name;
        3.  Click the ☑️ to save the option name;
        4.  Adjust core parameters such as Model as needed (the edit box will automatically save when it loses focus).
    - Naming suggestions for option names: It is recommended to use the structure "Provider-ModelVersion-Feature", for example: openrouter-deepseek-v3-free; openrouter-deepseek-r1-free; deepseek-v3-official; deepseek-r1-official.

---

### Enhance Your Input (Basic)

After entering a question in the input box, you can click the ✨ button at the bottom, which will enhance your question content. You can set the LLM Provider used for `Prompt Enhancement` in the `Auxiliary Function Prompt Configuration` section on the `Prompts` page.

---

### Context Mentions (Basic)

> Associate the most relevant context to save your token budget

Type `@` in the input box when you need to explicitly provide context:

- `@Problems` – Provide workspace errors/warnings for CoolCline to fix
- `@Paste URL to fetch contents` – Fetch documentation from URL and convert to Markdown, no need to manually type `@`, just paste the link
- `@Add Folder` – Provide folders to CoolCline, after typing `@`, you can directly enter the folder name for fuzzy search and quick selection
- `@Add File` – Provide files to CoolCline, after typing `@`, you can directly enter the file name for fuzzy search and quick selection
- `@Git Commits` – Provide Git commits or diff lists for CoolCline to analyze code history
- `Add Terminal Content to Context` - No `@` needed, select content in terminal interface, right-click, and click `CoolCline:Add Terminal Content to Context`

---

### Auto Approval (Advanced)

To use CoolCline assistance in a controlled manner (preventing uncontrolled actions), the application provides three approval options:

- Manual Approval: Review and approve each step to maintain full control, click allow or cancel in application prompts for saves, command execution, etc.
- Auto Approval: Grant CoolCline the ability to run tasks without interruption (recommended in Agent mode for full autonomy)
- Auto Approval Settings: Check or uncheck options you want to control above the chat input box or in settings page
- For allowing automatic command approval: You need to go to the `Settings` page, in the `Command Line` area, add commands you want to auto-approve, like `npm install`, `npm run`, `npm test`, etc.
- Hybrid: Auto-approve specific operations (like file writes) but require confirmation for higher-risk tasks (strongly recommended to `not` configure git add, git commit, etc., these should be done manually).

Regardless of your preference, you always have final control over CoolCline's operations.

---

### Mode Best Practices (Advanced)

#### Effective Use of Agent Mode

- Use LLM Provider and Model with good capabilities
- Start with clear high-level task descriptions
- Use `@` to provide clearer, more accurate context from codebase, files, URLs, Git commits, etc.
- Utilize Git snapshot feature to manage important changes:
  You can start by sending one or more of these messages:
    - "Create a git snapshot before starting this task"
    - "Save current changes as a git snapshot with description 'completed basic functionality'"
    - "Show me the changes between the last two git snapshots"
    - "This change is problematic, roll back to the previous git snapshot"
    - "Compare the differences between the initial git snapshot and current state"
- Configure allowed commands in the `Settings` page and MCP servers in the `MCP Servers` page, Agent will automatically use these commands and MCP servers
- It's recommended to `not` set `git add`, `git commit` commands in the command settings interface, you should control these manually
- Consider switching to specialized modes (Code/Architect/Ask) for specific subtasks when needed

#### Using Other Modes

- Code Mode: Best for direct coding tasks and implementation
- Architect Mode: Suitable for planning and design discussions
- Ask Mode: Perfect for learning and exploring concepts

---

## Other Features

### Browser Automation (Expert)

#### Browser Features

CoolCline can also open `browser` sessions to:

- Launch local or remote web applications
- Click, type, scroll, and take screenshots
- Collect console logs to debug runtime or UI/UX issues

Perfect for `end-to-end testing` or visually verifying changes without constant copy-pasting.

#### Enable Browser Automation

- Check `Approve Browser Operations` in the `Auto Approval` area (requires LLM Provider support for Computer Use)
- In the `Settings` page, you can set other options in the `Browser Settings` area

---

### Use MCP to Add Tools (Expert)

- MCP Official Documentation: https://modelcontextprotocol.io/introduction

Extend CoolCline through the `Model Context Protocol (MCP)` with commands like:

- "Add a tool to manage AWS EC2 resources."
- "Add a tool to query company Jira."
- "Add a tool to pull latest PagerDuty events."

CoolCline can autonomously build and configure new tools (with your approval) to immediately expand its capabilities.

---

## Notification Settings (Basic)

- In the `Settings` page, you can enable sound effects and volume, so you'll get audio notifications when tasks complete (allowing you to multitask while CoolCline works)

---

### Advanced Settings (Expert)

- In the `Settings` page, you can configure other options

---

## Installation

Two installation methods, choose one:

- Search for `CoolCline` in the editor's extension panel to install directly
- Or get the `.vsix` file from [Marketplace](https://marketplace.visualstudio.com/items?itemName=CoolCline.coolcline) / [Open-VSX](https://open-vsx.org/extension/CoolCline/coolcline) and `drag and drop` it into the editor

> **Tips**:
>
> - For better experience, move the extension to the right side of the screen: Right-click on the CoolCline extension icon -> Move to -> Secondary Sidebar
> - If you close the `Secondary Sidebar` and don't know how to reopen it, click the `Toggle Secondary Sidebar` button in the top-right corner of VSCode, or use the keyboard shortcut ctrl + shift + L.

---

## Local Setup and Development

Refer to the instructions in the CONTRIBUTING file: [English](./CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)

---

## Contributing

We welcome community contributions! Here's how to participate:
CONTRIBUTING: [English](./CONTRIBUTING.md) | [简体中文](https://gitee.com/coolcline/coolcline/blob/main/CONTRIBUTING_zh.md)

> [CoolCline](https://gitee.com/coolcline/coolcline.git) draws inspiration from the excellent features of the `Clines` open source community (thanks to all `Clines` project contributors!).

---

## Disclaimer

**Please note** that CoolCline makes no representations or warranties of any kind concerning any code, models, or other tools provided, any related third-party tools, or any output results. You assume **all risk** of using any such tools or output; such tools are provided on an **"as is"** and **"as available"** basis. Such risks may include but are not limited to intellectual property infringement, network vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or output, including but not limited to their legality, appropriateness, and results.

---

## License

[Apache 2.0 CoolCline](./LICENSE)

---
