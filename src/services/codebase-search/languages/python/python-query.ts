/**
 * Python语言的Tree-sitter查询定义
 */

/**
 * 获取Python扩展查询
 */
export function getPythonQuery(): string {
	return `
      ; 定义
      (function_definition
        name: (identifier) @name.definition.function) @definition.function
        
      (class_definition
        name: (identifier) @name.definition.class) @definition.class
        
      ; 变量定义
      (assignment
        left: (identifier) @name.definition.variable) @definition.variable
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (attribute
        attribute: (identifier) @name.reference.property) @reference.property
        
      ; 导入语句
      (import_statement
        name: (dotted_name) @import.module) @import
        
      (import_from_statement
        module_name: (dotted_name) @import.source
        name: (dotted_name) @import.name) @import.from
        
      ; 文档字符串
      (expression_statement
        (string) @doc.comment)
    `
}
