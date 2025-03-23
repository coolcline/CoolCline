/*
- class declarations
- method declarations
- interface declarations
- references to identifiers
- method invocations
- import statements
*/
export default `
(class_declaration
  name: (identifier) @name.definition.class) @definition.class

(method_declaration
  name: (identifier) @name.definition.method) @definition.method

(interface_declaration
  name: (identifier) @name.definition.interface) @definition.interface

; 变量声明和字段声明
(variable_declarator
  name: (identifier) @name.definition.variable) @definition.variable

(field_declaration
  declarator: (variable_declarator
    name: (identifier) @name.definition.field)) @definition.field

; 引用捕获
(identifier) @name.reference

; 方法调用引用
(method_invocation
  name: (identifier) @name.reference.method) @reference.method

; 对象创建引用
(object_creation_expression
  type: (type_identifier) @name.reference.class) @reference.creation

; 导入语句
(import_declaration
  .
  (package_name) @import.package) @import

(import_declaration
  .
  (asterisk) @import.wildcard) @import.wildcard

(import_declaration
  .
  (identifier) @import.name) @import.single

; 单类型导入
(single_type_import
  (identifier) @import.class) @import.single

; 静态导入
(static_import_on_demand_declaration) @import.static

; 文档注释
(javadoc_comment) @doc.comment
`
