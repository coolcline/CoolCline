---
title: Language Support
nav_order: 5
parent: Basic Features
---

# Programming Language Support

CoolCline supports code analysis and indexing for multiple programming languages, helping you browse, understand, and write code more effectively.

## Supported Programming Languages

| Language   | Basic Definition | Reference Finding | Import Parsing | Nested Structure Support | File Extensions         |
| ---------- | ---------------- | ----------------- | -------------- | ------------------------ | ----------------------- |
| TypeScript | ✅               | ✅                | ✅             | ⚠️ Partial               | .ts, .tsx               |
| JavaScript | ✅               | ✅                | ✅             | ⚠️ Partial               | .js, .jsx               |
| Python     | ✅               | ✅                | ✅             | ⚠️ Partial               | .py                     |
| Java       | ✅               | ✅                | ✅             | ⚠️ Partial               | .java                   |
| Go         | ✅               | ✅                | ✅             | ✅                       | .go                     |
| C#         | ✅               | ✅                | ✅             | ⚠️ Partial               | .cs                     |
| Ruby       | ✅               | ✅                | ✅             | ⚠️ Partial               | .rb                     |
| PHP        | ✅               | ✅                | ✅             | ⚠️ Partial               | .php                    |
| C/C++      | ✅               | ✅                | ✅             | ❌                       | .c, .cpp, .cc, .h, .hpp |
| Rust       | ✅               | ✅                | ✅             | ❌                       | .rs                     |
| Swift      | ✅               | ✅                | ✅             | ❌                       | .swift                  |
| Kotlin     | ✅               | ✅                | ✅             | ❌                       | .kt, .kts               |

## Feature Description

- **Basic Definition**: Identifies definitions of program elements such as variables, functions, and classes
- **Reference Finding**: Locates where variables, functions, classes, etc. are referenced in the code
- **Import Parsing**: Parses import statements in code and tracks module dependencies
- **Nested Structure Support**: Understands complex structures such as nested classes and inner functions

## How to Use

When using CoolCline, simply develop your code normally, and the system will automatically recognize the file type and apply the appropriate language parser. You can leverage language support features in the following ways:

1. **Code Navigation**: In code files, you can use the AI assistant to find symbol definitions and references
2. **Intelligent Completion**: The AI assistant will provide more accurate code suggestions based on language rules
3. **Context Understanding**: When referencing code, the AI assistant will provide deeper analysis based on language features

## Language Indexing Settings

You can configure codebase indexing features in the settings page to optimize your code analysis experience:

1. Open the settings page (⚙️ icon in the top right)
2. In the "Codebase Search Index" section:
    - Enable/disable code indexing
    - Configure automatic indexing settings
    - Set exclusion paths (e.g., node_modules,dist,build,.git)
    - Choose whether to index test files

## Notes

- Advanced feature support for some languages is still under development
- Indexing extremely large codebases may take longer; consider configuring appropriate exclusion paths
- Language parsing is based on file extensions, so make sure files use the correct extensions
