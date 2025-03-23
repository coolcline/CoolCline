/**
 * Ruby语言的Tree-sitter查询定义
 */

/**
 * 获取Ruby扩展查询
 */
export function getRubyQuery(): string {
	return `
      ; 方法定义
      (method
        name: (identifier) @name.definition.method) @definition.method
        
      ; 单例方法定义
      (singleton_method
        name: (identifier) @name.definition.method) @definition.method
        
      ; 类定义
      (class
        name: (constant) @name.definition.class) @definition.class
        
      ; 模块定义
      (module
        name: (constant) @name.definition.module) @definition.module
        
      ; 常量定义
      (assignment
        left: (constant) @name.definition.constant) @definition.constant
        
      ; 变量定义
      (assignment
        left: (identifier) @name.definition.variable) @definition.variable
        
      ; 实例变量定义
      (assignment
        left: (instance_variable) @name.definition.instance_variable) @definition.instance_variable
        
      ; 类变量定义
      (assignment
        left: (class_variable) @name.definition.class_variable) @definition.class_variable
        
      ; 引用捕获
      (identifier) @name.reference
      (constant) @name.reference.constant
      (instance_variable) @name.reference.instance_variable
      (class_variable) @name.reference.class_variable
      
      ; 方法调用中的属性访问
      (call
        method: (identifier) @name.reference.method) @reference.method
        
      ; 导入语句
      (call
        method: (identifier) @import.method
        arguments: (argument_list
          (string) @import.path)) @import.statement
        
      ; 文档注释
      (comment) @doc.comment
    `
}
