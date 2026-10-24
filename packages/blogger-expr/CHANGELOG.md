# blogger-expr

## 0.0.3

### Patch Changes

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - A new parser, checker, evaluator and formatter, following what Blogger accepts and prints. `parse(source, { context })` never throws: it returns the tree, its cost, and the `errors` and `warnings`, each with a code, a message, its cause, a fix and where it is. The tree is descriptive (`PlusChain`, `Membership`, `LambdaOperation`, `TakeOrSkip`, literals with `raw` and `value`, operators with their spelling and place, `loc` on every node), and a range of `b:loop values` is only its root. `evaluate` returns values (`Decimal`, `TextBoolean`, `RichValue`, dates, lists, maps) and throws an `ExpressionError` with a diagnostic, `toText` prints them as Blogger does, and `print` formats like Prettier, to a `printWidth`, keeping how the expression is spelled. `LexError`, `ParseError`, `PrintError`, `EvaluateError`, `Evaluator`, `evaluateNode`, `valuesEqual`, `tokenize`, `imageValue`, `urlValue`, `plain` and `RichProperty` are removed, `EvaluatorOptions` is `EvaluateOptions`, it no longer depends on `blogger-images`, and the docs are only the grammar for now

## 0.0.2

### Patch Changes

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - Faster tokenizing, parsing and printing, with the same results

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - Read `-` as Blogger does: a negative number is a literal, `-5`, a minus between two values has a space or a parenthesis on each side, `5 - 3`, `(5)- 3`, `5 -(3)`, and `-(...)` with no value before it is read without its `-`. `- 5`, `-data:n`, `--5`, `5-3` and `5 -3` are errors, and `UnaryOperator` is only `!`
  
  Messages say `An operator expression must be wrapped in parentheses`, with the right article, and the docs have the grammar

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - Export the `PrintOptions` type, and add docs: syntax, functions, evaluation, printing and the JavaScript API

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - `RichValue`, `imageValue` and `urlValue` for Blogger's images, URLs and widgets: a string or a list with properties, read after the built-in ones, `.length`, `.first` and `.last`. An image has `.isResizable`, `.width` and `.height`, a URL `.canonical`, `.http` and `.https`.
  
  `resizeImage` and `sourceSet` resize as Blogger does: `w640` without a ratio, a ratio of two positive integers at least as wide as tall, `"16:9"`, a taller one ignored, and a width that is an integer of 0 or more, as a number or a string of digits only. An error names the bad item of a list of widths, and `resizeImage` returns an image
