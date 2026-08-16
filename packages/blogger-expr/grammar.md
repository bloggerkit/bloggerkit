Covers the grammar used inside:

- `b:if cond='...'`, `b:elseif cond='...'`
- `expr:attr='...'`
- `b:with value='...' var='...'`
- `b:loop values='...' var='...'`
- `b:eval expr='...'`

## Grammar (informal, precedence low -> high):

```
  expr        := conditional
  conditional := logicalOr ( "?:" conditional | "?" expr ":" conditional )?
  logicalOr   := logicalAnd ( ("||" | "or") logicalAnd )*
  logicalAnd  := membership ( ("&&" | "and") membership )*
  membership  := equality ( (("not")? ("in" | "contains")) equality )*
  equality    := relational ( ("==" | "!=" | "eq" | "ne") relational )*
  relational  := additive ( ("<" | ">" | "<=" | ">=" | "lt" | "gt" | "lte" | "gte") additive )*
  additive    := multiplicative ( ("+" | "-") multiplicative )*
  multiplicative := unary ( ("*" | "/" | "%") unary )*
  unary       := ("!" | "not" | "-") unary | postfix
  postfix     := primary ( "." IDENT
                          | "(" args? ")"                                   -- only on a FUNCTION_NAME
                          | "[" expr "]"                                    -- only on a data: chain
                          | ("filter"|"map"|"any"|"all"|"none") "(" IDENT "=>" expr ")"
                          | INFIX_FUNCTION_NAME unary                       -- e.g. `x path "y"`
                          )*
  primary     := NUMBER | STRING | "true" | "false"
               | "data:" PATH?
               | IDENT                                 -- only a lambda param currently in scope
               | "(" expr ")"
               | "[" list? "]"                         -- ListLiteral
               | "{" (mapEntries | setElements)? "}"   -- MapLiteral | SetLiteral
```

## Fixed function set

There is no way to call anything other than the built-in functions in — no custom/user-supplied functions, and no calling arbitrary expressions (`someExpr()` is a parse error unless `someExpr` is literally one of those
names).
`path`, `appendParams`, `params`, `snippet`, `fragment`, and `format` additionally support infix syntax: `data:url path "x"` is sugar for `path(data:url, "x")`. `resizeImage` and `sourceSet` are call-only.

Every call is arity- and (where the argument is a literal) type-checked at
parse time — see `FUNCTION_SIGNATURES` in `parser.ts`. When an argument is
a non-literal expression (a `data:` reference, another call, etc.) its
runtime type can't be known while parsing, so only the literal case is
checked; the rest is still checked for correct arity.

## `data:` path semantics

`data:` path parsing is deliberately lenient about `.` placement, matching
observed real-world behavior: `data:.foo` and `data:foo..bar` are accepted
(collapsing to `data:foo` and `data:foo.bar`), and a path with no segments
at all (`data:.`) evaluates to `null` rather than erroring. A space
anywhere inside the path (including right after the colon) ends the path
there, so `data: foo` is a `data:` reference to nothing (-> null) followed
by a stray `foo` token — which correctly fails to parse as a complete
expression rather than silently being treated as `data:foo`.

Index access (`data:list[0]`) is only ever attached to something already
rooted in a `data:` reference (`DataReference` / `MemberExpression` /
`IndexExpression`) — `["a","b"][0]` and `someFn()[0]` are parse errors, and
even on a valid `data:` chain, indexing only works when the runtime value
is actually an array; indexing into a map is a runtime `EvalError`.

## Variable access and lambda scope

A value can only ever be reached through `data:...` — a bare identifier is
_only_ legal when it names the parameter of a lambda you're currently
(directly) inside, e.g. the `l` in `data:links filter (l => l.name ==
  "x")`. That bare-access permission still works inside `{...}` and `[...]`
literals nested in the same lambda body. It's only shadowed by entering a
_new, nested_ lambda, where the inner param takes over for that lambda's
body — an outer lambda's param can't be reached from inside a nested one.
This is tracked while parsing (see `Parser`'s `activeParam`), so an
out-of-scope bare identifier is a parse-time error, not a runtime `null`.
