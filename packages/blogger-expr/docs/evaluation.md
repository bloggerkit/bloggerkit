# Evaluation

`evaluate(expression, { data })` returns the value of an expression. `data` is the object that `data:` paths read:

```ts
import { evaluate } from "blogger-expr";

evaluate("data:post.labels map (l => l.name)", {
  data: { post: { labels: [{ name: "a" }, { name: "b" }] } },
}); // ["a", "b"]
```

A value is a string, a number, a boolean, `null`, a list or a map. Sets are evaluated to lists.

## Missing data

A path that is not in the data is `null`, which Blogger renders as nothing: `data:post.nothing.x` is `null`. With `strict: true`, it throws an `EvaluateError` instead. So does an operator given values it can't use, and membership in something that is not a string, a list or a map.

## Truthiness

`false`, `null`, `0`, `NaN` and `""` are false. Everything else is true, including an empty list or map.

`and` and `or` return one of their operands, as in JavaScript: `data:a or "default"` is `"default"` when `data:a` is false.

## Equality

`==` and `!=` compare lists and maps item by item, and a number with a string by the number's text: `5 == "5"` is true. Any other values are equal only if they are the same: `true == 1` is false.

## Numbers and strings

| Operator             | Works on                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `+`                  | joins as text when either side is a string, with `null` as `""`; adds numbers otherwise                      |
| `-`, `*`, `/`, `%`   | numbers: a string holding a number is read as one, `true` and `false` as `1` and `0`, anything else as `NaN` |
| `<`, `>`, `<=`, `>=` | compares two strings as text and two numbers as numbers, and anything else as numbers                        |

```
"Page " + 2              "Page 2"
"5" * 2                  10
"10" < 9                 false
```

## Membership

`a in b` and `b contains a` mean the same:

| When `b` is | `a in b` is true when                          |
| ----------- | ---------------------------------------------- |
| a string    | `a` is a string found in it: `"log" in "blog"` |
| a list      | one of its items is equal to `a`               |
| a map       | `a` is one of its keys                         |

For anything else it is false, or an error with `strict`.

## Lists, maps and strings

| Expression                                      | Is                                                    |
| ----------------------------------------------- | ----------------------------------------------------- |
| `data:list.length`                              | the number of items, or of characters for a string    |
| `data:list.first`, `data:list.last`             | the first and the last item, `null` for an empty list |
| `data:list[1]`, `data:list["1"]`, `data:list.1` | an item, by an integer index                          |
| `data:map.key`                                  | a value of a map; `[...]` is only for lists           |

## Images, URLs and widgets

Some values of Blogger are strings or lists with properties of their own: an image has `.width`, a URL has `.canonical`, and the widgets of a page have `.Blog1`. A `RichValue` is one of these. It is its string or list wherever one is used, in `+`, `==`, `in`, a lambda or a function, and `.name` reads its properties after the built-in ones, `.length`, `.first` and `.last`:

```ts
import { evaluate, imageValue, RichValue, urlValue } from "blogger-expr";

const blog1 = { id: "Blog1", title: "Posts" };

evaluate("data:widgets.Blog1.title", {
  data: { widgets: new RichValue([blog1], { Blog1: blog1, Blog: [blog1] }) },
}); // "Posts", and data:widgets[0] is blog1 too
```

| Helper                                 | Gives                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `imageValue(url, { width?, height? })` | an image: `.isResizable`, whether Blogger hosts it, and `.width` and `.height`, `null` when unknown    |
| `urlValue(url)`                        | a URL: `.canonical`, without the country domain of Blogger, and `.http` and `.https`, with that scheme |
| `new RichValue(value, properties)`     | any other string or list with properties, a property being a value or a function computing it          |

`resizeImage` returns an image, see [Functions](./functions.md#resizeimage). The result of `evaluate` can be a `RichValue`: `String(value)` and `JSON.stringify` give its string or list, and `plain(value)` returns it.

## Lambdas

In the body of a lambda, its parameter can be read as a word, `l.name`, or as `data:l.name`. A parameter named like a key of the data hides that key.
