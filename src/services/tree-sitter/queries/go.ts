/*
- function declarations (with associated comments)
- method declarations (with associated comments)
- type specifications
- references to identifiers
- import statements
- function calls
*/
export default `
(
  (comment)* @doc
  .
  (function_declaration
    name: (identifier) @name.definition.function) @definition.function
  (#strip! @doc "^//\\s*")
  (#set-adjacent! @doc @definition.function)
)

(
  (comment)* @doc
  .
  (method_declaration
    name: (field_identifier) @name.definition.method) @definition.method
  (#strip! @doc "^//\\s*")
  (#set-adjacent! @doc @definition.method)
)

(type_spec
  name: (type_identifier) @name.definition.type) @definition.type

; 变量声明
(var_declaration 
  (var_spec 
    name: (identifier) @name.definition.variable)) @definition.variable

; 常量声明
(const_declaration 
  (const_spec 
    name: (identifier) @name.definition.constant)) @definition.constant

; 引用捕获
(identifier) @name.reference
(field_identifier) @name.reference.field
(type_identifier) @name.reference.type

; 函数调用
(call_expression 
  function: [
    (identifier) @name.reference.call
    (selector_expression 
      field: (field_identifier) @name.reference.method)
  ]) @reference.call

; 导入语句
(import_declaration 
  (import_spec
    path: (interpreted_string_literal) @import.path)) @import

(import_declaration 
  (import_spec
    name: (package_identifier) @import.alias
    path: (interpreted_string_literal) @import.path)) @import.aliased

; 包声明
(package_clause
  (package_identifier) @package.name) @package
`
