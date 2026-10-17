# Grammar

The grammar of the expressions `parse` reads, in [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form): `{ x }` is `x` any number of times, `[ x ]` is `x` or nothing, and `(* ... *)` is a comment. [Syntax](./syntax.md) describes the same with examples.

## Tokens

Whitespace, a space, a tab or a line break, separates tokens and is otherwise left out, except around `-` and after the `:` of a map entry.

```ebnf
string      = '"' { character | '\"' } '"' ;      (* not a '"' or a line break *)
number      = [ "-" ] ( digits [ "." digits ] | "." digits ) ;
                                                  (* no whitespace after the "-" *)
word        = word start { word start | digit } ;
word start  = letter | "_" | "$" ;
data        = "data:" { letter | digit | "_" | "$" | "." | "-" } ;
                                                  (* one token, whitespace ends it *)
digits      = digit { digit } ;
```

The operators are `==` `!=` `<=` `>=` `?:` `=>` `&&` `||` `+` `-` `*` `/` `%` `<` `>` `!` `?`, and the punctuation `(` `)` `[` `]` `{` `}` `,` `:` `.`. A longer operator is read first, `<=` before `<`.

## Expressions

From the loosest to the tightest:

```ebnf
expression     = conditional ;

conditional    = or [ "?" expression ":" conditional
                    | "?:" conditional ] ;
or             = and { ( "or" | "||" ) and } ;
and            = membership { ( "and" | "&&" ) membership } ;
membership     = equality { [ "not" ] ( "in" | "contains" ) equality } ;
equality       = relational { ( "==" | "!=" | "eq" | "ne" ) relational } ;
relational     = additive { ( "<" | ">" | "<=" | ">=" | "lt" | "gt" | "lte" | "gte" ) additive } ;
additive       = multiplicative { ( "+" | "-" ) multiplicative } ;
                 (* a "-" has whitespace or ")" before it, whitespace or "(" after it *)
multiplicative = unary { ( "*" | "/" | "%" ) unary } ;

unary          = ( "!" | "not" ) unary
               | "-" unary                         (* right before "(", read without the "-" *)
               | postfix ;

postfix        = primary { "." word
                         | "[" expression "]"      (* on a data path *)
                         | lambda
                         | infix function value } ;
lambda         = lambda operator "(" word "=>" expression ")" ;

primary        = number | string | boolean | data
               | call
               | parameter
               | "(" expression ")"
               | list | set | map ;

call           = function "(" [ values ] ")" ;
parameter      = word ;                            (* the parameter of the innermost lambda *)
boolean        = "true" | "false" | "yes" | "no" ;
list           = "[" [ values ] "]" ;
set            = "{" [ values ] "}" ;
map            = "{" entry { "," entry } "}" ;
entry          = ( word | string ) ":" value ;     (* whitespace after the ":" *)

values         = value { "," value } ;
value          = unary ;
                 (* an operator, an infix function or a lambda only in parentheses *)
```

## Names

```ebnf
function        = "path" | "appendParams" | "params" | "snippet" | "fragment"
                | "resizeImage" | "sourceSet" | "format" ;
infix function  = "path" | "appendParams" | "params" | "snippet" | "fragment" | "format" ;
lambda operator = "filter" | "map" | "any" | "all" | "none" ;
```

After a lambda, `.` and an infix function need parentheses around it: `(data:a map (x => x)).first`. The `value` after an infix function takes the `postfix` that follows, so `data:a path "b" path "c"` is an error, written `(data:a path "b") path "c"`.

`true`, `false`, `yes`, `no`, `not`, `null` and `nil` are keywords, so a parameter can not be named like them. `null` and `nil` are errors: there is no literal for no value.

## Checked after parsing

These are not in the grammar, the parser checks them on what it read:

- The number of arguments of a function, and the type of those written as literals, see [Functions](./functions.md#arguments-when-parsing).
- `[index]` is only on a `data:` path, or on members and indexes of one.
