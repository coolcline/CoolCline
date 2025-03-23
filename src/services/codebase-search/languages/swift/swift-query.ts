/**
 * Swift语言的Tree-sitter查询定义
 */

/**
 * 获取Swift扩展查询
 */
export function getSwiftQuery(): string {
	return `
      ; 函数定义
      (function_declaration
        name: (identifier) @name.definition.function) @definition.function
        
      ; 类定义
      (class_declaration
        name: (type_identifier) @name.definition.class) @definition.class
        
      ; 结构体定义
      (struct_declaration
        name: (type_identifier) @name.definition.struct) @definition.struct
        
      ; 枚举定义
      (enum_declaration
        name: (type_identifier) @name.definition.enum) @definition.enum
        
      ; 协议定义
      (protocol_declaration
        name: (type_identifier) @name.definition.protocol) @definition.protocol
        
      ; 扩展定义
      (extension_declaration
        (simple_type_identifier) @name.definition.extension) @definition.extension
        
      ; 类方法定义
      (function_declaration
        (modifiers
          (public_modifier))
          name: (identifier) @name.definition.method) @definition.method
          
      ; 属性定义
      (variable_declaration
        (pattern
          (identifier) @name.definition.property)) @definition.property
          
      ; 计算属性定义
      (computed_property
        name: (identifier) @name.definition.computed_property) @definition.computed_property
          
      ; 类型别名定义
      (typealias_declaration
        name: (type_identifier) @name.definition.typealias) @definition.typealias
        
      ; 常量定义
      (constant_declaration
        (pattern
          (identifier) @name.definition.constant)) @definition.constant
          
      ; 闭包参数定义
      (closure_parameter
        (identifier) @name.definition.parameter) @definition.parameter
        
      ; 引用捕获
      (identifier) @name.reference
      (type_identifier) @name.reference.type
      
      ; 方法调用
      (call_expression
        function: (member_expression
          name: (identifier) @name.reference.method)) @reference.method
          
      ; 属性访问
      (member_expression
        name: (identifier) @name.reference.property) @reference.property
        
      ; 函数调用
      (call_expression
        function: (identifier) @name.reference.function) @reference.function
        
      ; 导入语句
      (import_declaration
        path: (identifier) @import.path) @import
        
      ; 导入语句带组件
      (import_declaration
        (import_path_component) @import.component) @import.component
        
      ; 类型继承
      (inheritance_clause
        (inheritance_specifier
          (type_identifier) @name.reference.inherited)) @inheritance
          
      ; 类型遵循协议
      (inheritance_clause
        (inheritance_specifier
          (type_identifier) @name.reference.protocol)) @protocol.conformance
          
      ; 注释
      (comment) @doc.comment
      (multi_line_comment) @doc.comment
    `
}
