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
      
      ; 嵌套类中的方法定义
      (class_declaration
        body: (declaration_list
          (method_declaration
            name: (name) @name.definition.nested.method))) @nested.class.method
      
      ; 嵌套类中的属性定义
      (class_declaration
        body: (declaration_list
          (property_declaration
            (property_element
              name: (variable_name) @name.definition.nested.property)))) @nested.class.property
      
      ; 命名空间中的类定义
      (namespace_definition
        body: (namespace_body
          (class_declaration
            name: (name) @name.definition.namespaced.class))) @namespaced.class
      
      ; 命名空间中的接口定义
      (namespace_definition
        body: (namespace_body
          (interface_declaration
            name: (name) @name.definition.namespaced.interface))) @namespaced.interface
      
      ; 命名空间中的特征(trait)定义
      (namespace_definition
        body: (namespace_body
          (trait_declaration
            name: (name) @name.definition.namespaced.trait))) @namespaced.trait
      
      ; 命名空间中的函数定义
      (namespace_definition
        body: (namespace_body
          (function_definition
            name: (name) @name.definition.namespaced.function))) @namespaced.function
      
      ; 类继承关系
      (class_declaration
        (base_clause
          (name) @extends.class)) @inherits
      
      ; 接口实现关系
      (class_declaration
        (implements_clause
          (name) @implements.interface)) @implements
      
      ; 嵌套上下文中的方法调用
      (member_access_expression
        object: (name) @name.reference.object
        name: (name) @name.reference.nested.method) @reference.nested.method
      
      ; 完全限定名称引用
      (qualified_name
        (name) @name.reference.namespace) @reference.qualified.name
        
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
