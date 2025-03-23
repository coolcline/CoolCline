/*
- method definitions (including singleton methods and aliases, with associated comments)
- class definitions (including singleton classes, with associated comments)
- module definitions
- 变量和方法引用
- require和require_relative导入语句
*/
export default `
(
  (comment)* @doc
  .
  [
    (method
      name: (_) @name.definition.method) @definition.method
    (singleton_method
      name: (_) @name.definition.method) @definition.method
  ]
  (#strip! @doc "^#\\s*")
  (#select-adjacent! @doc @definition.method)
)

(alias
  name: (_) @name.definition.method) @definition.method

(
  (comment)* @doc
  .
  [
    (class
      name: [
        (constant) @name.definition.class
        (scope_resolution
          name: (_) @name.definition.class)
      ]) @definition.class
    (singleton_class
      value: [
        (constant) @name.definition.class
        (scope_resolution
          name: (_) @name.definition.class)
      ]) @definition.class
  ]
  (#strip! @doc "^#\\s*")
  (#select-adjacent! @doc @definition.class)
)

(
  (module
    name: [
      (constant) @name.definition.module
      (scope_resolution
        name: (_) @name.definition.module)
    ]) @definition.module
)

; 变量引用
(identifier) @name.reference
(constant) @name.reference.constant

; 方法调用引用
(call
  method: [(identifier) @name.reference.method (constant) @name.reference.method]) 

; 作用域解析引用
(scope_resolution
  name: (constant) @name.reference.class
  scope: (constant) @name.reference.namespace)

; Ruby 的导入语句
(call
  method: (identifier) @require
  arguments: (argument_list 
    (string (string_content) @import.source)))
  (#match? @require "^(require|require_relative)$")
`
