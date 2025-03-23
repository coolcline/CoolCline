/*
- function definitions
- class definitions
- method definitions
- import statements
- references to identifiers
- attribute access references
*/
export default `
; 定义捕获（保持原有查询不变）
(function_definition
  name: (identifier) @name.definition.function) @definition.function
  
(class_definition
  name: (identifier) @name.definition.class) @definition.class
  
(class_definition
  body: (block
    (function_definition
      name: (identifier) @name.definition.method))) @definition.class.methods

; 变量定义
(assignment
  left: (identifier) @name.definition.variable) @definition.variable

; 引用捕获
(identifier) @name.reference

; 属性访问引用
(attribute
  attribute: (identifier) @name.reference.attribute) @reference.attribute

; 方法调用引用
(call
  function: [
    (identifier) @name.reference.call
    (attribute 
      attribute: (identifier) @name.reference.method)
  ]) @reference.call

; 导入语句
(import_statement
  name: (dotted_name
    (identifier) @import.module)) @import

; 导入别名
(import_from_statement
  module_name: (dotted_name
    (identifier) @import.module)
  name: (dotted_name
    (identifier) @import.name)) @import.from

; 导入from语句
(import_from_statement
  module_name: (relative_import) @import.relative
  name: (dotted_name
    (identifier) @import.name)) @import.from.relative

; 星号导入
(import_from_statement
  module_name: (dotted_name)
  name: (wildcard_import) @import.wildcard) @import.from.wildcard

; 文档字符串
(expression_statement
  (string) @doc.string) @doc

; 函数或类的文档字符串
[
  (function_definition
    body: (block
      (expression_statement
        (string) @doc.function)))
  (class_definition
    body: (block
      (expression_statement
        (string) @doc.class)))
]
`
