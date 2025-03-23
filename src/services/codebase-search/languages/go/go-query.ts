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
        
      ; 方法接收器 - 捕获方法所属的类型
      (method_declaration
        receiver: (parameter_list
          (parameter_declaration
            type: [(type_identifier) (pointer_type)] @receiver.type))
        name: (field_identifier) @name.definition.struct.method) @definition.struct.method
        
      ; 结构体定义
      (type_declaration
        (type_spec
          name: (identifier) @name.definition.type
          type: (struct_type))) @definition.struct
          
      ; 结构体字段定义
      (field_declaration
        name: (field_identifier) @name.definition.field) @definition.field
          
      ; 接口定义
      (type_declaration
        (type_spec
          name: (identifier) @name.definition.type
          type: (interface_type))) @definition.interface
          
      ; 接口方法定义
      (interface_type
        (method_spec
          name: (field_identifier) @name.definition.interface.method)) @definition.interface.method
          
      ; 嵌入式结构体
      (struct_type
        (field_declaration
          type: (type_identifier) @name.embedded)) @embedded.struct
          
      ; 变量定义
      (var_declaration
        (var_spec
          name: (identifier) @name.definition.variable)) @definition.variable
          
      ; 常量定义
      (const_declaration
        (const_spec
          name: (identifier) @name.definition.constant)) @definition.constant
          
      ; 基本引用捕获
      (identifier) @name.reference
      (field_identifier) @name.reference.property
      
      ; 结构体方法调用 - 特定对象上的方法
      (call_expression
        function: (selector_expression
          operand: (identifier) @parent
          field: (field_identifier) @name.reference.struct.method)) @reference.struct.method
          
      ; 结构体字段访问 - 特定对象上的字段
      (selector_expression
        operand: (identifier) @parent
        field: (field_identifier) @name.reference.struct.field) @reference.struct.field
        
      ; 嵌入结构体字段访问 - 通过嵌入结构体访问字段
      (selector_expression
        operand: (selector_expression
          operand: (identifier) @parent.parent
          field: (field_identifier)) @parent
        field: (field_identifier) @name.reference.embedded.field) @reference.embedded.field
        
      ; 接口方法实现 - 结构体实现接口方法
      (method_declaration
        receiver: (parameter_list
          (parameter_declaration
            type: [(type_identifier) (pointer_type)] @receiver.type))
        name: (field_identifier) @name.reference.interface.method) @reference.interface.method
          
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
