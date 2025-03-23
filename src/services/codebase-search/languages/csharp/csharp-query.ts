/**
 * C#语言的Tree-sitter查询定义
 */

/**
 * 获取C#扩展查询
 */
export function getCSharpQuery(): string {
	return `
      ; 类定义
      (class_declaration
        name: (identifier) @name.definition.class) @definition.class
        
      ; 接口定义
      (interface_declaration
        name: (identifier) @name.definition.interface) @definition.interface
        
      ; 方法定义
      (method_declaration
        name: (identifier) @name.definition.method) @definition.method
        
      ; 属性定义
      (property_declaration
        name: (identifier) @name.definition.property) @definition.property
        
      ; 构造函数定义
      (constructor_declaration
        name: (identifier) @name.definition.constructor) @definition.constructor
        
      ; 字段定义
      (field_declaration
        declarator: (variable_declaration
          name: (identifier) @name.definition.field)) @definition.field
          
      ; 变量定义
      (variable_declaration
        name: (identifier) @name.definition.variable) @definition.variable
        
      ; 参数定义
      (parameter
        name: (identifier) @name.definition.parameter) @definition.parameter
        
      ; 枚举定义
      (enum_declaration
        name: (identifier) @name.definition.enum) @definition.enum
        
      ; 委托定义
      (delegate_declaration
        name: (identifier) @name.definition.delegate) @definition.delegate
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 成员访问引用
      (member_access_expression
        name: (identifier) @name.reference.member) @reference.member
        
      ; 方法调用引用
      (invocation_expression
        (member_access_expression
          name: (identifier) @name.reference.method)) @reference.method
          
      ; using语句 (导入)
      (using_directive
        name: (qualified_name) @import.namespace) @import
        
      ; 命名空间定义
      (namespace_declaration
        name: (qualified_name) @namespace.name) @namespace
        
      ; 文档注释
      (comment) @doc.comment
    `
}
