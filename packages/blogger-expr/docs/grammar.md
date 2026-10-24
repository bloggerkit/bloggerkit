# Grammar

The grammar `parse` implements, in EBNF: `{ x }` is `x` any number of times, `[ x ]` is `x` or nothing, `(* … *)` is a comment. `src/lexer.ts` reads the tokens, `src/parser.ts` the rest; `src/checker.ts` adds the rules listed at the end.

## Tokens

Whitespace separates tokens and is otherwise ignored, except where noted.

```ebnf
number      = [ "-" ] ( digits [ "." digits ] | "." digits ) ;
              (* "-" right before the digits; "1e5" is not a number *)
string      = '"' { character | '\"' } '"' ;
              (* not a '"' or a line break; '\"' is the only escape *)
data        = "data:" { letter | digit | "_" | "$" | "." | "-" } ;
              (* one token: whitespace ends it; before whitespace, "data" and ":" are
                 read as "data:" alone where a value is expected, so "{ data: 1 }" keeps
                 its key and "data: x" is two values *)
word        = word start { word start | digit | "-" word start | "-" digit } ;
word start  = letter | "_" | "$" ;
digits      = digit { digit } ;
```

Operators and punctuation, the longest first: `?:` `=>` `==` `!=` `<=` `>=` `&&` `||` `..` `(` `)` `[` `]` `{` `}` `,` `:` `?` `+` `-` `*` `/` `%` `<` `>` `!` `.`

A `.` followed by a digit is a number (`.5`), unless it comes right after a value with no space: `[1, 2].1` is a property.

## Expressions

From the loosest to the tightest.

```ebnf
expression    = group ;
group         = conditional { property of all conditional rest } ;
              (* the top level, the inside of ( ), of [index], a lambda body *)

conditional   = or [ "?" conditional ":" conditional ] ;
or            = and { ( "or" | "||" ) and } ;
and           = equality { ( "and" | "&&" ) equality } ;
equality      = membership { ( "==" | "!=" | "eq" | "neq" ) membership } ;
membership    = comparison { [ "not" ] ( "in" | "contains" ) comparison } ;
comparison    = additive { ( "<" | ">" | "<=" | ">=" | "lt" | "gt" | "lte" | "gte" ) additive } ;
additive      = multiplicative { ( "+" | minus ) multiplicative } ;
              (* "a + b + c" is one chain; "-" ends it *)
minus         = "-" ;
              (* a space or ")" before it, a space or "(" after it *)
multiplicative = fallback { ( "*" | "/" | "%" ) fallback } ;
fallback      = chain [ "?:" fallback ] ;
chain         = unary { lambda | take or skip | infix call } ;
              (* an infix call here only after a lambda, take or skip *)
unary         = ( "!" | "not" ) unary | postfix ;
postfix       = primary { "." name | "[" group "]" | infix call } ;
              (* "[" only on a data path or a parameter; one infix call only;
                 a "." right after a string, or after a number, data or a word
                 with a space before it, is a property of all, read by group *)

property of all = "." name | ".." digits ;
              (* applies to everything read so far in the group: "x" + "ab".length
                 is ("x" + "ab").length; "1 ..3" is 1 with the property ".3" *)
conditional rest = (* the operators that follow, with the property as their first operand *) ;

lambda        = lambda word ( "(" word "=>" group ")" | word "=>" group ) ;
              (* without parentheses, the body runs to the end or to ")" *)
lambda word   = "filter" | "where" | "map" | "select" | "any" | "all" | "none" | "count" | "first" ;
take or skip  = ( "take" | "limit" | "skip" | "offset" ) count ;
count         = number | data | parameter | "(" group ")" ;
infix call    = infix word primary ;
infix word    = "path" | "params" | "appendParams" | "fragment" | "snippet" | "format" | "resizeImage" | "sourceSet" ;

primary       = number | string | boolean | data | parameter
              | "(" group ")"
              | "[" [ values ] "]"
              | "{" [ values ] "}"                       (* a list too *)
              | "{" entry { "," entry } [ "," ] "}"     (* a map *)
              | call | operator call ;
boolean       = "true" | "false" | "yes" | "no" ;        (* any case *)
parameter     = word ;                                   (* of the innermost lambda *)
entry         = ( word | string | digits ) ":" value ;   (* whitespace after ":" *)
call          = function word "(" [ values ] ")" ;
function word = infix word | "take" | "limit" | "skip" | "offset" ;
operator call = operator "(" [ values ] ")" ;
              (* no space before "(", except "-" *)
operator      = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "?:"
              | "and" | "or" | "in" | "contains" | "eq" | "neq" | "lt" | "gt" | "lte" | "gte" ;

values        = value { "," value } [ "," ] ;
value         = ( "!" | "not" ) value | primary { path property } ;
              (* a single value: properties only on a data path or a parameter *)
name          = word | digits | string ;
```

There is no negation: `-(x)` is the operator call `-` with one value, which gives it back; `-data:x` and `- 5` are errors.

## Loop values

The `values` of `<b:loop>`, parsed with `{ context: 'loop-values' }`:

```ebnf
loop values   = integer ".." integer      (* no spaces, nothing else *)
              | group "to" group           (* one "to" *)
              | group ;
integer       = [ "-" ] digits ;
```

A range is the root of the tree or nothing: `parse` returns a `LoopRange` (`start`, `end`, `notation`) only as the whole value, and no other node holds one. `to` is looser than every operator, `? :` included: the start is everything before it and the end everything after it, `true ? 1 : 2 to 3` is `(true ? 1 : 2) to 3` and `1 to 3 take 2` is `1 to (3 take 2)`; a start or an end that is a ternary, `?:`, a condition, a comparison, a lambda, `take`, `skip` or an infix call is warned about (`range-reach`). `..` anywhere else, `to` outside the root and either form outside `loop-values` are `range-outside-loop`. `(1)..3` is `(1)` with the property `.3`, as `1 ..3` is: an empty loop, warned about (`member-dots`).

## Nodes

Each rule makes the node of `src/ast.ts` named here. Every node has its `span` and its `loc` (`line`, `column` from 1, `offset` from 0); operators and keywords are `{ name, spelling, span }`, keys and property names `{ text, quoted, span }`.

| Rule | Node |
| --- | --- |
| `number`, `string`, `boolean` | `NumberLiteral`, `StringLiteral`, `BooleanLiteral`, with `raw` and `value` |
| `"[" values "]"`, `"{" values "}"` | `ListLiteral`, `notation` `brackets` or `braces` |
| `"{" entry … "}"` | `MapLiteral` of `entries` |
| `data` | `DataPath`: `root` and `properties` |
| `parameter` | `Parameter` |
| `"." name`, `property of all` | `PropertyAccess`, `appliesTo` `value` or `everythingBefore` |
| `"[" group "]"` | `IndexAccess` |
| `"(" group ")"` | `Parenthesized` |
| `unary` | `LogicalNot` |
| `or`, `and` | `Logical` |
| `equality` | `Equality` |
| `membership` | `Membership`, with `negated` |
| `comparison` | `Comparison` |
| `additive` | `PlusChain` for `+`, `Arithmetic` for `-` |
| `multiplicative` | `Arithmetic` |
| `fallback` | `Fallback` |
| `conditional` | `Conditional` |
| `lambda` | `LambdaOperation`, `notation` `parenthesized` or `bare` |
| `take or skip` | `TakeOrSkip` |
| `call`, `infix call` | `FunctionCall`, `notation` `prefix` or `infix` |
| `operator call` | `OperatorFunctionCall` |
| `loop values` ranges | `LoopRange`, `start`, `end`, `notation` `to` or `dots`: only as the root |

## Checked after parsing

`src/checker.ts` reports these as errors:

- the number of arguments of each function, and literal arguments of the wrong kind (`path(url, 5)`, `params(url, {})`, `resizeImage(img, "wide")`, `format("2026", …)`);
- operator calls with too few values: `-`, `*`, `/`, `%` need 1, `==`, `!=`, `<`, `>`, `<=`, `>=`, `?:` need 2, `in` and `contains` exactly 2;
- conditions made in the expression that are never booleans: `5 ? …`, `!"x"`, `(a - b) and …`, `filter (x => 1)`; a map is a condition, and true. The right side of `and` and `or` is not checked when a left side without data decides: `false and 5`;
- operands whose kind is known from the expression (literals, lists and maps, computed numbers, comparisons): `- * / % < > <= >=` take numbers or strings of digits; `+` without a string takes numbers only; `in` and `contains` search a string or a list, never for a list, and for a map in a list only;
- lambdas, `take` and `skip` on a number, string, boolean or map literal; `take` counts that are strings, negative, or 0 after rounding;
- division or remainder by a literal 0; a negative literal width with a ratio;
- integer ends of `..`;
- more than 40 nodes in the expression, or in an index (`src/cost.ts`).
