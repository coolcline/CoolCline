---
title: 语言支持
nav_order: 5
parent: 基础功能
---

# 编程语言支持

CoolCline支持多种编程语言的代码分析和索引功能，帮助您更有效地浏览、理解和编写代码。

## 已支持的编程语言

| 语言       | 基本定义 | 引用查找 | 导入解析 | 嵌套结构支持 | 文件扩展名              |
| ---------- | -------- | -------- | -------- | ------------ | ----------------------- |
| TypeScript | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .ts, .tsx               |
| JavaScript | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .js, .jsx               |
| Python     | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .py                     |
| Java       | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .java                   |
| Go         | ✅       | ✅       | ✅       | ✅           | .go                     |
| C#         | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .cs                     |
| Ruby       | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .rb                     |
| PHP        | ✅       | ✅       | ✅       | ⚠️ 部分支持  | .php                    |
| C/C++      | ✅       | ✅       | ✅       | ❌           | .c, .cpp, .cc, .h, .hpp |
| Rust       | ✅       | ✅       | ✅       | ❌           | .rs                     |
| Swift      | ✅       | ✅       | ✅       | ❌           | .swift                  |
| Kotlin     | ✅       | ✅       | ✅       | ❌           | .kt, .kts               |

## 功能说明

- **基本定义**：识别变量、函数、类等程序元素的定义
- **引用查找**：找到代码中变量、函数、类等被引用的位置
- **导入解析**：解析代码中的导入语句，跟踪模块依赖关系
- **嵌套结构支持**：理解嵌套类、内部函数等复杂结构

## 如何使用

在使用CoolCline时，只需正常开发您的代码，系统会自动识别文件类型并应用相应的语言解析器。您可以通过以下方式利用语言支持功能：

1. **代码导航**：在代码文件中，您可以使用AI助手查找符号定义和引用
2. **智能完成**：AI助手会基于语言规则提供更准确的代码建议
3. **上下文理解**：引用代码时，AI助手会基于语言特性提供更深入的分析

## 语言索引设置

您可以在设置页面中配置代码库索引功能，优化代码分析体验：

1. 打开设置页面（右上角⚙️图标）
2. 在"代码库搜索索引"部分：
    - 启用/禁用代码索引功能
    - 配置自动索引设置
    - 设置排除路径（例如：node_modules,dist,build,.git）
    - 选择是否索引测试文件

## 注意事项

- 部分语言的高级特性支持仍在开发中
- 极大型代码库的索引可能需要较长时间，建议适当配置排除路径
- 语言解析基于文件扩展名，请确保文件使用正确的扩展名
