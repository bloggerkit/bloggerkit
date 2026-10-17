# Syntax

An expression combines values, data read with `data:`, operators and functions:

```
data:view.isPost and data:post.labels any (l => l.name == "news")
```

This page describes the language with examples. [Grammar](./grammar.md) has its exact rules.

## Values

| Value   | Written as                                        |
| ------- | ------------------------------------------------- |
| string  | `"text"`                                          |
| number  | `12`, `1.5`, `.5`, `-12`                          |
| boolean | `true` or `false`, and `yes` or `no` for the same |
| list    | `[1, 2, 3]`                                       |
| set     | `{"a", "b"}`, and `{}` for an empty set           |
| map     | `{ name: "x", "data-id": 2 }`                     |

- Strings use double quotes only, and stay on one line. `\"` writes a quote, and any other backslash is kept as it is: `"a\n"` is the three characters `a`, `\` and `n`.
- Numbers have no exponent, `1e5` is not a number. A negative number has its `-` right before the digits: `-12` is a number, `- 12` is an error. See [Minus](#minus).
- A map key is a word or a string, and its `:` is followed by a space: `{ a: 1 }`, not `{ a:1 }`.
- There is no literal for no value: `null` and `nil` are errors.

## Data

`data:` reads the data, along a path of segments separated by `.`:

```
data:blog.title
data:post.author-name
data:widgets.Blog.first.posts
```

- A segment is made of letters, digits, `_`, `$` and `-`, so `data:post.0` and `data:author-name` are paths.
- The path is one word, and whitespace ends it: `data: x` is not `data:x`.
- Empty segments are ignored, `data:a..b` is `data:a.b`. `data:` and `data:.` read nothing, and are `null`.

`[index]` reads an item of a list, and is only allowed on a `data:` path: `data:links[0]`, `data:links[data:i]`. `[1, 2][0]` is an error.

A word on its own is an error, unless it is a keyword, a function or the parameter of a lambda: write `data:title`, not `title`.

## Operators

From the loosest to the tightest:

| Operators                                           | Meaning                                                         |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `a ? b : c`, `a ?: b`                               | `b` if `a` is true, else `c`; `a` unless it is `null`, else `b` |
| `or`, `\|\|`                                        | either                                                          |
| `and`, `&&`                                         | both                                                            |
| `in`, `contains`, `not in`, `not contains`          | membership, see [Evaluation](./evaluation.md#membership)        |
| `==`, `!=`, `eq`, `ne`                              | equal, not equal                                                |
| `<`, `>`, `<=`, `>=`, `lt`, `gt`, `lte`, `gte`      | comparison                                                      |
| `+`, `-`                                            | sum or difference, and `+` joins strings                        |
| `*`, `/`, `%`                                       | product, quotient, remainder                                    |
| `!`, `not`                                          | not                                                             |
| `.name`, `[index]`, calls, lambdas, infix functions | member, item, call                                              |

`a ? b : c` and `a ?: b` group to the right, every other operator to the left. Parentheses group anything: `(data:a or data:b) and data:c`.

## Minus

`-` is also part of names, `data:n-3` reads the data named `n-3`, and it starts negative numbers, `-3`. So a minus between two values needs a space or `)` before it, and a space or `(` after it:

| Expression                              | Is                                            |
| --------------------------------------- | --------------------------------------------- |
| `5 - 3`, `(5)- 3`, `5 -(3)`, `5 - -3`   | a subtraction                                 |
| `5-3`, `5 -3`, `(5)-3`, `5-(3)`, `5--3` | an error                                      |
| `data:n-3`                              | the data `n-3`; `data:n - 3` is a subtraction |

A `-` with no value before it is only allowed in a negative number, or right before parentheses. Before parentheses Blogger ignores it: `-(5)` is `5`, and `-(-5)` is `-5`. So `-data:n`, `--5` and `- 5` are errors; write `0 - data:n` for the negative of `data:n`.

The other operators need no spaces: `5+3` is `5 + 3`.

## Functions

The functions are those of Blogger, and no others, see [Functions](./functions.md). They are called as `name(a, b)`:

```
path(data:blog.homepageUrl.canonical, "search")
resizeImage(data:post.featuredImage, 640, "16:9")
```

Some can also be written between their two arguments, as Blogger themes often do:

```
data:blog.homepageUrl.canonical path "search"
```

An infix function binds as tightly as `.`, so `data:a + data:b path "x"` is `data:a + (data:b path "x")`. Its right side takes everything that binds as tightly after it: `data:a path "x".b` is `data:a path ("x".b)`, and `data:a path "b" path "c"` is an error, written `(data:a path "b") path "c"`.

## Lambdas

`filter`, `map`, `any`, `all` and `none` go through a list, with a parameter for its items:

```
data:post.labels filter (l => l.name != "draft") map (l => l.url)
```

| Lambda   | Gives                                          |
| -------- | ---------------------------------------------- |
| `filter` | the items for which the body is true           |
| `map`    | the body's value for each item                 |
| `any`    | whether the body is true for at least one item |
| `all`    | whether the body is true for every item        |
| `none`   | whether the body is true for no item           |

In the body, the parameter is a word, `l.name`. Only the parameter of the innermost lambda can be used as a word; in a nested lambda, the outer one is read with `data:` and its name:

```
data:sections filter (s => data:widgets any (w => w.sectionId == data:s.id))
```

The parameter is a word in lists and maps in the body too: `data:links map (l => { title: l.name })`.

A lambda can be followed by another lambda, but `.` or an infix function after it needs parentheses around it: `(data:links map (l => l.url)).first`.

## Parentheses around a value

Function arguments, list and set items, map values and the right side of an infix function are single values. An operator, an infix function or a lambda needs parentheses there:

```
path(data:url, data:a + "x")    ✗ an error
path(data:url, (data:a + "x"))  ✓
```

## Errors

A `LexError` or a `ParseError` says what is wrong, and its `position` is where it is in the expression, counted from 0:

| Expression                        | Error                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `title`                           | `Unknown identifier 'title' — values must be accessed as 'data:title' (no lambda parameter is in scope here) (at position 0)`   |
| `{ a:1 }`                         | `Expected a space after ':' in map entry 'a' (at position 4)`                                                                   |
| `resizeImage(data:image, "wide")` | `resizeImage(): argument 2 must be an integer of 0 or more, a number or a string of digits only, 640 or "640" (at position 24)` |

When parsing, the arguments of a function are checked too: their number, and the type of those written as literals. See [Functions](./functions.md#arguments-when-parsing).
