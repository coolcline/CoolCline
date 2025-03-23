/**
 * Java语言的Tree-sitter查询定义
 */

/**
 * 获取Java扩展查询
 */
export function getJavaQuery(): string {
	return `
      ; 定义
      (class_declaration
        name: (identifier) @name.definition.class) @definition.class
        
      (method_declaration
        name: (identifier) @name.definition.method) @definition.method
        
      (constructor_declaration
        name: (identifier) @name.definition.constructor) @definition.constructor
      
      (interface_declaration
        name: (identifier) @name.definition.interface) @definition.interface

      (field_declaration
        declarator: (variable_declarator
          name: (identifier) @name.definition.field)) @definition.field
      
      ; 变量定义
      (local_variable_declaration
        declarator: (variable_declarator
          name: (identifier) @name.definition.variable)) @definition.variable
          
      ; 方法参数
      (formal_parameter
        name: (identifier) @name.definition.parameter) @definition.parameter
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (field_access
        field: (identifier) @name.reference.field) @reference.field
      
      ; 方法调用
      (method_invocation
        name: (identifier) @name.reference.method) @reference.method
        
      ; 导入语句
      (import_declaration
        name: (identifier) @import.name) @import
        
      (import_declaration
        .
        (scoped_identifier) @import.path) @import.scoped
      
      ; 包声明
      (package_declaration
        name: (identifier) @package.name) @package
        
      ; 文档注释
      (line_comment) @doc.comment
      (block_comment) @doc.comment
    `
}
