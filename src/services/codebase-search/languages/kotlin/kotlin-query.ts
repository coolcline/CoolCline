/**
 * Kotlin语言的Tree-sitter查询定义
 */

/**
 * 获取Kotlin扩展查询
 */
export function getKotlinQuery(): string {
	return `
      ; 函数定义
      (function_declaration
        name: (simple_identifier) @name.definition.function) @definition.function
        
      ; 类定义
      (class_declaration
        name: (type_identifier) @name.definition.class) @definition.class
        
      ; 数据类定义
      (class_declaration
        (modifiers
          (annotation
            name: (simple_identifier) @data.annotation (#eq? @data.annotation "data")))
        name: (type_identifier) @name.definition.data_class) @definition.data_class
        
      ; 接口定义
      (interface_declaration
        name: (type_identifier) @name.definition.interface) @definition.interface
        
      ; 对象定义
      (object_declaration
        name: (simple_identifier) @name.definition.object) @definition.object
        
      ; 伴生对象定义
      (object_declaration
        (modifiers
          (modifier) @companion.modifier (#eq? @companion.modifier "companion"))
        name: (simple_identifier) @name.definition.companion_object) @definition.companion_object
        
      ; 枚举定义
      (enum_class
        name: (type_identifier) @name.definition.enum) @definition.enum
        
      ; 类方法定义
      (class_body
        (function_declaration
          name: (simple_identifier) @name.definition.method)) @definition.method
          
      ; 主构造函数参数定义
      (class_parameter
        name: (simple_identifier) @name.definition.parameter) @definition.parameter
        
      ; 属性定义
      (property_declaration
        name: (simple_identifier) @name.definition.property) @definition.property
        
      ; 变量定义
      (variable_declaration
        name: (simple_identifier) @name.definition.variable) @definition.variable
        
      ; 常量定义
      (property_declaration
        (modifiers
          (modifier) @const.modifier (#eq? @const.modifier "const"))
        name: (simple_identifier) @name.definition.constant) @definition.constant
        
      ; 扩展函数定义
      (function_declaration
        receiver: (type_reference) @extension.receiver
        name: (simple_identifier) @name.definition.extension_function) @definition.extension_function
        
      ; 引用捕获
      (simple_identifier) @name.reference
      (type_identifier) @name.reference.type
      
      ; 方法调用
      (call_expression
        function: (navigation_expression
          name: (simple_identifier) @name.reference.method)) @reference.method
          
      ; 属性访问
      (navigation_expression
        name: (simple_identifier) @name.reference.property) @reference.property
        
      ; 函数调用
      (call_expression
        function: (simple_identifier) @name.reference.function) @reference.function
        
      ; 导入语句
      (import_header
        identifier: (identifier) @import.path) @import
        
      ; 包声明
      (package_header
        identifier: (identifier) @package.name) @package
        
      ; 类型引用
      (type_reference
        (user_type
          (type_identifier) @name.reference.type_usage)) @reference.type
          
      ; 继承
      (supertype_entry
        (user_type
          (type_identifier) @name.reference.supertype)) @inheritance
          
      ; 实现接口
      (supertype_entry
        (user_type
          (type_identifier) @name.reference.interface)) @implementation
          
      ; 注释
      (comment) @doc.comment
    `
}
