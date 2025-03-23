/**
 * Java语言的Tree-sitter查询定义
 */

/**
 * 获取Java扩展查询
 */
export function getJavaQuery(): string {
	return `
      ; 定义
      (class_declaration
        name: (identifier) @name.definition.class) @definition.class
      
      ; 嵌套/内部类定义  
      (class_declaration
        parent: (class_declaration) 
        name: (identifier) @name.definition.nested.class) @definition.nested.class
        
      ; 静态内部类
      (class_declaration
        (modifiers 
          (modifier) @static 
          (#eq? @static "static"))
        parent: (class_declaration)
        name: (identifier) @name.definition.nested.static.class) @definition.nested.static.class
        
      (method_declaration
        name: (identifier) @name.definition.method) @definition.method
        
      ; 嵌套方法的定义（类方法）
      (method_declaration
        parent: (class_declaration)
        name: (identifier) @name.definition.nested.method) @definition.nested.method
        
      (constructor_declaration
        name: (identifier) @name.definition.constructor) @definition.constructor
      
      (interface_declaration
        name: (identifier) @name.definition.interface) @definition.interface
        
      ; 嵌套接口定义（内部接口）
      (interface_declaration
        parent: (class_declaration)
        name: (identifier) @name.definition.nested.interface) @definition.nested.interface

      (field_declaration
        declarator: (variable_declarator
          name: (identifier) @name.definition.field)) @definition.field
      
      ; 变量定义
      (local_variable_declaration
        declarator: (variable_declarator
          name: (identifier) @name.definition.variable)) @definition.variable
          
      ; 方法参数
      (formal_parameter
        name: (identifier) @name.definition.parameter) @definition.parameter
        
      ; 引用捕获
      (identifier) @name.reference
      
      ; 属性访问引用
      (field_access
        field: (identifier) @name.reference.field) @reference.field
      
      ; 方法调用
      (method_invocation
        name: (identifier) @name.reference.method) @reference.method
        
      ; 嵌套类引用 - 通过限定符访问
      (field_access
        object: (identifier) @parent
        field: (identifier) @name.reference.nested.class) @reference.nested.class
        
      ; 嵌套方法调用 - 对象方法调用
      (method_invocation
        object: (identifier) @parent
        name: (identifier) @name.reference.nested.method) @reference.nested.method
        
      ; 带点号的类型访问 - 嵌套类访问
      (type_identifier
        scope: (identifier) @parent
        name: (identifier) @name.reference.nested.type) @reference.nested.type
        
      ; 导入语句
      (import_declaration
        name: (identifier) @import.name) @import
        
      (import_declaration
        .
        (scoped_identifier) @import.path) @import.scoped
      
      ; 包声明
      (package_declaration
        name: (identifier) @package.name) @package
        
      (package_declaration
        name: (scoped_identifier) @package.path) @package.scoped
        
      ; 完全限定引用 - 用于包路径中的类引用
      (scoped_identifier
        name: (identifier) @name.reference.qualified) @reference.qualified
        
      ; 文档注释
      (line_comment) @doc.comment
      (block_comment) @doc.comment
    `
}
