/**
 * Go语言的Tree-sitter查询定义
 */

/**
 * 获取Go扩展查询
 */
export function getGoQuery(): string {
	return `
      ; 函数定义
      (function_declaration
        name: (identifier) @name.definition.function) @definition.function
        
      ; 方法定义
      (method_declaration
        name: (field_identifier) @name.definition.method) @definition.method
        
      ; 结构体定义
      (type_declaration
        (type_spec
          name: (identifier) @name.definition.type
          type: (struct_type))) @definition.struct
          
      ; 接口定义
      (type_declaration
        (type_spec
          name: (identifier) @name.definition.type
          type: (interface_type))) @definition.interface
          
      ; 变量定义
      (var_declaration
        (var_spec
          name: (identifier) @name.definition.variable)) @definition.variable
          
      ; 常量定义
      (const_declaration
        (const_spec
          name: (identifier) @name.definition.constant)) @definition.constant
          
      ; 引用捕获
      (identifier) @name.reference
      (field_identifier) @name.reference.property
      
      ; 导入语句
      (import_declaration
        (import_spec
          path: (interpreted_string_literal) @import.path)) @import
          
      ; 包声明
      (package_clause
        (package_identifier) @package.name) @package
        
      ; 文档注释
      (comment) @doc.comment
    `
}
