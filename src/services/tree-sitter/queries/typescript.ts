/*
- function signatures and declarations
- method signatures and definitions
- abstract method signatures
- class declarations (including abstract classes)
- module declarations
- references to identifiers
- property access references
- import statements and declarations
*/
export default `
(function_signature
  name: (identifier) @name.definition.function) @definition.function

(method_signature
  name: (property_identifier) @name.definition.method) @definition.method

(abstract_method_signature
  name: (property_identifier) @name.definition.method) @definition.method

(abstract_class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

(module
  name: (identifier) @name.definition.module) @definition.module

(function_declaration
  name: (identifier) @name.definition.function) @definition.function

(method_definition
  name: (property_identifier) @name.definition.method) @definition.method

(class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

(variable_declarator
  name: (identifier) @name.definition.variable) @definition.variable

(variable_declarator
  name: (array_pattern 
    (identifier) @name.definition.variable)) @definition.variable

(identifier) @name.reference

(property_identifier) @name.reference.property

(call_expression
  function: [
    (identifier) @name.reference.call
    (member_expression
      property: (property_identifier) @name.reference.method)
  ])

(import_statement
  source: (string) @import.source) @import

(import_clause
  (named_imports
    (import_specifier
      name: (identifier) @import.name))) @import.clause

(import_clause
  (identifier) @import.default) @import.default.clause

(import_clause
  (namespace_import
    (identifier) @import.namespace)) @import.namespace.clause

(type_annotation
  (type_identifier) @name.reference.type) @type.annotation

(comment) @doc.comment
`
