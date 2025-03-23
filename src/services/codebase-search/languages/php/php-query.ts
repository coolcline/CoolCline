/**
 * PHP语言的Tree-sitter查询定义
 */

/**
 * 获取PHP扩展查询
 */
export function getPHPQuery(): string {
	return `
      ; 类定义
      (class_declaration
        name: (name) @name.definition.class) @definition.class
        
      ; 接口定义
      (interface_declaration
        name: (name) @name.definition.interface) @definition.interface
        
      ; 特征(trait)定义
      (trait_declaration
        name: (name) @name.definition.trait) @definition.trait
        
      ; 方法定义
      (method_declaration
        name: (name) @name.definition.method) @definition.method
        
      ; 属性定义
      (property_declaration
        (property_element
          name: (variable_name) @name.definition.property)) @definition.property
          
      ; 函数定义
      (function_definition
        name: (name) @name.definition.function) @definition.function
        
      ; 命名空间定义
      (namespace_definition
        name: (namespace_name) @namespace.name) @namespace
        
      ; 变量定义
      (variable_name) @name.reference.variable
      
      ; 引用捕获
      (name) @name.reference
      
      ; 成员访问引用
      (member_access_expression
        name: (name) @name.reference.member) @reference.member
        
      ; 方法调用引用
      (method_invocation
        name: (name) @name.reference.method) @reference.method
        
      ; use语句 (导入)
      (namespace_use_declaration
        (namespace_use_clause
          name: (qualified_name) @import.namespace)) @import
          
      ; 命名空间别名
      (namespace_aliasing_clause
        (name) @alias.name) @alias
        
      ; 文档注释
      (comment) @doc.comment
    `
}
