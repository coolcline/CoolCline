/*
- class declarations
- function definitions
- method declarations
- 变量和函数引用
- require/include导入语句
*/
export default `
(class_declaration
  name: (name) @name.definition.class) @definition.class

(function_definition
  name: (name) @name.definition.function) @definition.function

(method_declaration
  name: (name) @name.definition.function) @definition.function

; 变量引用
(variable_name) @name.reference.variable

; 函数调用引用
(function_call_expression
  function: (name) @name.reference.function)

; 方法调用引用
(method_call_expression
  name: (name) @name.reference.method)

; 类引用
(class_constant_access_expression
  class_name: (name) @name.reference.class)

; 命名空间引用
(namespace_name_as_prefix) @name.reference.namespace

; 静态方法调用
(scoped_call_expression
  scope: (name) @name.reference.class
  name: (name) @name.reference.method)

; PHP的导入语句
(
  expression_statement
  (function_call_expression
    function: (name) @include.function
    arguments: (arguments
      (argument
        (string) @import.source)))
  (#match? @include.function "^(require|require_once|include|include_once)$")
)

; 命名空间使用语句
(namespace_use_declaration
  (namespace_use_clause
    (namespace_name
      (name) @import.namespace)))
`
