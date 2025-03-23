/**
 * Rust语言的Tree-sitter查询定义
 */

/**
 * 获取Rust扩展查询
 */
export function getRustQuery(): string {
	return `
      ; 函数定义
      (function_item
        name: (identifier) @name.definition.function) @definition.function
        
      ; 结构体定义
      (struct_item
        name: (type_identifier) @name.definition.struct) @definition.struct
        
      ; 枚举定义
      (enum_item
        name: (type_identifier) @name.definition.enum) @definition.enum
        
      ; 特征定义 (类似于接口)
      (trait_item
        name: (type_identifier) @name.definition.trait) @definition.trait
        
      ; impl块 - 结构体方法实现
      (impl_item
        type: (type_identifier) @impl.type) @implementation
        
      ; 特征实现
      (impl_item
        trait: (type_identifier) @impl.trait
        type: (type_identifier) @impl.for) @trait.implementation
        
      ; 结构体方法定义
      (impl_item
        (function_item
          name: (identifier) @name.definition.method)) @definition.method
          
      ; 结构体字段定义
      (field_declaration
        name: (field_identifier) @name.definition.field) @definition.field
        
      ; 变量定义
      (let_declaration
        pattern: (identifier) @name.definition.variable) @definition.variable
        
      ; 常量定义
      (const_item
        name: (identifier) @name.definition.constant) @definition.constant
        
      ; 静态项定义
      (static_item
        name: (identifier) @name.definition.static) @definition.static
        
      ; 模块定义
      (mod_item
        name: (identifier) @name.definition.module) @definition.module
        
      ; 宏定义
      (macro_definition
        name: (identifier) @name.definition.macro) @definition.macro
        
      ; 使用声明 (导入)
      (use_declaration
        path: (path) @use.path) @import
        
      ; 嵌套模块中的函数定义
      (mod_item
        body: (declaration_list
          (function_item
            name: (identifier) @name.definition.nested.function))) @nested.module.function
            
      ; 嵌套模块中的结构体定义
      (mod_item
        body: (declaration_list
          (struct_item
            name: (type_identifier) @name.definition.nested.struct))) @nested.module.struct
            
      ; 嵌套模块中的特征定义
      (mod_item
        body: (declaration_list
          (trait_item
            name: (type_identifier) @name.definition.nested.trait))) @nested.module.trait
            
      ; 结构体中的嵌套类型定义（关联类型）
      (impl_item
        type: (type_identifier) @parent.type
        body: (declaration_list
          (type_item
            name: (type_identifier) @name.definition.nested.type))) @nested.struct.type
            
      ; 特征中定义的关联类型
      (trait_item
        body: (declaration_list
          (associated_type
            name: (type_identifier) @name.definition.associated.type))) @trait.associated.type
            
      ; 结构体中的嵌套方法
      (impl_item
        type: (type_identifier) @parent.type
        body: (declaration_list
          (function_item
            name: (identifier) @name.definition.nested.method))) @nested.struct.method
            
      ; 特征中定义的方法
      (trait_item
        body: (declaration_list
          (function_item
            name: (identifier) @name.definition.trait.method))) @trait.method

      ; 引用捕获
      (identifier) @name.reference
      (type_identifier) @name.reference.type
      (field_identifier) @name.reference.field
      
      ; 方法调用
      (call_expression
        function: (field_expression
          field: (field_identifier) @name.reference.method)) @reference.method
          
      ; 函数调用
      (call_expression
        function: (identifier) @name.reference.function) @reference.function
        
      ; 路径引用
      (scoped_identifier
        path: (identifier) @name.reference.namespace
        name: (identifier) @name.reference.namespace.member) @reference.namespace
        
      ; 模块路径引用
      (scoped_identifier
        path: (scoped_identifier) @name.reference.module.path
        name: (identifier) @name.reference.module.member) @reference.module
        
      ; 嵌套模块中的函数引用
      (call_expression
        function: (scoped_identifier
          path: (identifier) @parent.module
          name: (identifier) @name.reference.nested.function)) @reference.nested.function
          
      ; 结构体方法嵌套调用
      (call_expression
        function: (field_expression
          object: (identifier) @parent.struct
          field: (field_identifier) @name.reference.nested.method)) @reference.nested.method
          
      ; 关联类型引用
      (generic_type
        type: (type_identifier) @parent.type
        arguments: (type_arguments
          (type_identifier) @name.reference.associated.type)) @reference.associated.type
        
      ; use声明 (导入)
      (use_declaration) @import
      (use_wildcard) @import.all
      
      ; 宏调用
      (macro_invocation
        macro: (identifier) @name.reference.macro) @reference.macro
        
      ; 注释
      (line_comment) @doc.comment
      (block_comment) @doc.comment
    `
}
