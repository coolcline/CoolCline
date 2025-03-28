/*
- Enhanced C# definitions and references
*/
export default `
; 基本标识符
(identifier) @definition

; 方法调用
(invocation_expression) @call

; 使用声明 - 确保匹配所有形式
(using_directive (identifier) @using)
(using_directive (qualified_name (identifier) @using))
(using_directive (qualified_name (qualified_name (identifier) @using (identifier) @using)))

; 变量声明
(variable_declaration) @variable

; 字段声明
(field_declaration) @field

; 属性声明
(property_declaration) @property

; 类声明
(class_declaration) @class

; 接口声明 - 只匹配声明部分
(interface_declaration 
  name: (identifier) @interface
  (#match? @interface "^[A-Z]")
)

; 结构体声明
(struct_declaration) @struct

; 方法声明
(method_declaration) @method
(operator_declaration) @method
(conversion_operator_declaration) @method

; 命名空间声明
(namespace_declaration) @namespace

; 构造函数声明
(constructor_declaration) @constructor

; 对象创建
(object_creation_expression) @new

; 委托和事件
(delegate_declaration) @delegate
(event_declaration) @event
(event_field_declaration) @event

; 泛型
(type_parameter_list) @type_parameters
(type_argument_list) @type_arguments

; 异常处理
(catch_clause) @catch
(try_statement) @try
(throw_statement) @throw
(finally_clause) @finally
(throw_expression) @throw

; Lambda 表达式和匿名方法
(lambda_expression) @lambda
(anonymous_method_expression) @anonymous_method

; 特性
(attribute_list) @attributes
(attribute) @attribute

; 数组
(array_creation_expression) @array_creation
(array_type) @array_type
(array_rank_specifier) @array_rank

; 字符串相关
(interpolated_string_expression) @string_interpolation
(interpolation) @interpolation

; 参数相关
(parameter) @parameter
(argument) @argument
(parameter_list) @parameter_list
(argument_list) @argument_list

; 运算符和表达式
(assignment_expression) @assignment
(binary_expression) @binary_expression
(conditional_expression) @conditional

; 基本控制流
(if_statement) @if
(switch_statement) @switch
(switch_expression) @switch_expr
(for_each_statement) @foreach
(for_statement) @for
(while_statement) @while
(do_statement) @do
(break_statement) @break
(continue_statement) @continue
(return_statement) @return

; 异步相关
(await_expression) @await
(method_declaration 
  (modifier) @async 
  (#eq? @async "async"))

; 代码块
(block) @block

; 本地变量声明
(variable_declaration) @local_var
(implicit_type) @var

; 访问修饰符
(modifier) @modifier

; 类修饰符
(class_declaration (modifier) @class_modifier)

; 枚举
(enum_declaration) @enum
(enum_member_declaration) @enum_member

; 元组
(tuple_pattern) @tuple_pattern
(tuple_expression) @tuple_expr

; 转换
(cast_expression) @cast
`
