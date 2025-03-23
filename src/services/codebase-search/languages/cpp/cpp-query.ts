/**
 * C/C++语言的Tree-sitter查询定义
 */

/**
 * 获取C/C++扩展查询
 */
export function getCPPQuery(): string {
	return `
      ; 函数定义
      (function_definition
        declarator: (function_declarator
          declarator: (identifier) @name.definition.function)) @definition.function
        
      ; 类定义
      (class_specifier
        name: (type_identifier) @name.definition.class) @definition.class
        
      ; 结构体定义
      (struct_specifier
        name: (type_identifier) @name.definition.struct) @definition.struct
        
      ; 枚举定义
      (enum_specifier
        name: (type_identifier) @name.definition.enum) @definition.enum
        
      ; 类方法定义
      (function_definition
        declarator: (function_declarator
          declarator: (qualified_identifier
            scope: (namespace_identifier)
            name: (identifier) @name.definition.method))) @definition.method
            
      ; 构造函数定义
      (function_definition
        declarator: (function_declarator
          declarator: (qualified_identifier
            scope: (namespace_identifier) @class.name
            name: (identifier) @name.definition.constructor))) @definition.constructor
            
      ; 类成员变量定义
      (field_declaration
        declarator: (field_identifier) @name.definition.field) @definition.field
        
      ; 全局变量定义
      (declaration
        declarator: (identifier) @name.definition.variable) @definition.variable
        
      ; 命名空间定义
      (namespace_definition
        name: (identifier) @name.definition.namespace) @definition.namespace
        
      ; 模板定义
      (template_declaration
        (class_specifier
          name: (type_identifier) @name.definition.template.class)) @definition.template
          
      ; 引用捕获
      (identifier) @name.reference
      (type_identifier) @name.reference.type
      (namespace_identifier) @name.reference.namespace
      (field_identifier) @name.reference.field
      
      ; 类方法调用
      (call_expression
        function: (field_expression
          field: (field_identifier) @name.reference.method)) @reference.method
          
      ; 函数调用
      (call_expression
        function: (identifier) @name.reference.function) @reference.function
        
      ; 命名空间成员引用
      (qualified_identifier
        scope: (namespace_identifier) @name.reference.namespace
        name: (identifier) @name.reference.namespace.member) @reference.namespace
        
      ; #include语句
      (preproc_include
        path: (string_literal) @import.path.string) @import
        
      ; <系统库>
      (preproc_include
        path: (system_lib_string) @import.path.system) @import.system
        
      ; 注释
      (comment) @doc.comment
    `
}
