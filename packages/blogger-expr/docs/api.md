# JavaScript API

| Export                                    | Does                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `parse(expression)`                       | parses an expression into a tree, a `Node`. Throws a `LexError` or a `ParseError` when it is invalid |
| `evaluate(expression, options?)`          | returns the value of an expression or of a tree, see [Evaluation](./evaluation.md)                   |
| `evaluateNode(node, options?)`            | returns the value of a tree                                                                          |
| `new Evaluator(options?).evaluate(node)`  | the same, to evaluate several trees with the same options                                            |
| `print(node, options?)`                   | turns a tree back into an expression, see [Printing](./printing.md)                                  |
| `tokenize(expression)`                    | splits an expression into tokens, `Token[]`, the last of them `EOF`                                  |
| `isTruthy(value)`                         | tells whether a value is true, as `b:if` reads it                                                    |
| `valuesEqual(a, b)`                       | tells whether two values are equal, as `==` compares them                                            |
| `new RichValue(value, properties?)`       | a string or a list with properties, see [Evaluation](./evaluation.md#images-urls-and-widgets)        |
| `imageValue(url, size?)`, `urlValue(url)` | an image and a URL, as Blogger gives them                                                            |
| `plain(value)`                            | the string or list of a `RichValue`, any other value as it is                                        |

## Options

| `evaluate` option | Default | Is                                                                                     |
| ----------------- | ------- | -------------------------------------------------------------------------------------- |
| `data`            | `{}`    | the object that `data:` paths read                                                     |
| `strict`          | `false` | whether missing data, and values an operator can't use, throw instead of giving `null` |

| `print` option | Default | Is                                                                |
| -------------- | ------- | ----------------------------------------------------------------- |
| `indent`       | `0`     | the number of spaces of one indentation, `0` to print on one line |
| `printWidth`   | `80`    | the width to fit lines in, when `indent` is set                   |

## Errors

| Error           | Thrown by           | Has                                                                                |
| --------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `LexError`      | `tokenize`, `parse` | `position`, where the error is in the expression, from 0                           |
| `ParseError`    | `parse`             | `position`                                                                         |
| `EvaluateError` | `evaluate`          | `node`, the node being evaluated                                                   |
| `PrintError`    | `print`             | `node`, the node that can't be printed, and its `path` in the tree, `root.args[1]` |

A function given a value it can't use throws a `TypeError`: `resizeImage(): argument 2 must be an integer of 0 or more, a number or a string of digits only, 640 or "640", got: -1`.

## Types

`Node` is the type of a tree: a union with one type for each kind of node, told apart by `type`, such as `DataReference`, `MemberExpression`, `BinaryExpression` and `LambdaExpression`. Every node has a `span`, `{ start, end }`, its place in the expression.

```ts
import { type Node, parse } from "blogger-expr";

const node: Node = parse("data:post.title");
// { type: "MemberExpression", object: { type: "DataReference", name: "post", ... }, property: "title", ... }
```

`Value` is the type of what evaluating returns, a `RichValue` included, `Token` and `TokenType` are those of the tokens, and `EvaluatorOptions` and `PrintOptions` those of the options of `evaluate` and `print`.
