/**
 * TypeScript语言的Tree-sitter查询定义
 */

/**
 * 获取TypeScript扩展查询
 */
export function getTypeScriptQuery(): string {
	// 基础 TypeScript 查询 + 引用和导入捕获
	return `
      ; 定义 (保持与现有查询兼容)
      (function_signature
        name: (identifier) @name.definition.function) @definition.function

      (method_signature
        name: (property_identifier) @name.definition.method) @definition.method

      (abstract_method_signature
        name: (property_identifier) @name.definition.method) @definition.method

      (abstract_class_declaration
        name: (type_identifier) @name.definition.class) @definition.class

      (module
        name: (identifier) @name.definition.module) @definition.module

      (function_declaration
        name: (identifier) @name.definition.function) @definition.function

      (method_definition
        name: (property_identifier) @name.definition.method) @definition.method

      (class_declaration
        name: (type_identifier) @name.definition.class) @definition.class
        
      ; 变量定义
      (variable_declarator
        name: (identifier) @name.definition.variable) @definition.variable
        
      ; 接口定义
      (interface_declaration
        name: (type_identifier) @name.definition.interface) @definition.interface
        
      ; 类型定义
      (type_alias_declaration
        name: (type_identifier) @name.definition.type) @definition.type

      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (property_identifier) @name.reference.property
      
      ; 类型引用
      (type_identifier) @name.reference.type
      
      ; 导入语句
      (import_statement
        source: (string) @import.source) @import
      
      ; 导入声明
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.name
            alias: (identifier)? @import.alias))) @import.clause
            
      ; 文档注释
      (comment) @doc.comment
    `
}

/**
 * 获取JavaScript扩展查询
 */
export function getJavaScriptQuery(): string {
	// 类似 TypeScript 但适用于 JavaScript 的查询
	return `
      ; 定义
      (function_declaration
        name: (identifier) @name.definition.function) @definition.function
        
      (method_definition
        name: (property_identifier) @name.definition.method) @definition.method
        
      (class_declaration
        name: (identifier) @name.definition.class) @definition.class
        
      (variable_declarator
        name: (identifier) @name.definition.variable) @definition.variable
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (property_identifier) @name.reference.property
      
      ; 导入语句
      (import_statement
        source: (string) @import.source) @import
      
      ; 导入声明
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.name
            alias: (identifier)? @import.alias))) @import.clause
            
      ; 文档注释
      (comment) @doc.comment
    `
}
