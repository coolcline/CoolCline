/*
- class declarations
- interface declarations
- method declarations
- namespace declarations
- property declarations
- field declarations
- references
- using statements
*/
export default `
;; 定义
(class_declaration
 name: (identifier) @name.definition.class
) @definition.class

(interface_declaration
 name: (identifier) @name.definition.interface
) @definition.interface

(method_declaration
 name: (identifier) @name.definition.method
) @definition.method

(namespace_declaration
 name: (identifier) @name.definition.namespace
) @definition.namespace

(property_declaration
 name: (identifier) @name.definition.property
) @definition.property

(field_declaration
 (variable_declarator
   name: (identifier) @name.definition.field)
) @definition.field

(struct_declaration
 name: (identifier) @name.definition.struct
) @definition.struct

(enum_declaration
 name: (identifier) @name.definition.enum
) @definition.enum

(constructor_declaration
 name: (identifier) @name.definition.constructor
) @definition.constructor

(record_declaration
 name: (identifier) @name.definition.record
) @definition.record

;; 引用
(identifier) @name.reference

;; 使用语句和导入
(using_directive
 name: (qualified_name) @import.source) @import

(using_directive
 (qualified_name 
   (identifier) @import.name)) @import
`
