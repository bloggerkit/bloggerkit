---
"blogger-expr": patch
---

Read `-` as Blogger does: a negative number is a literal, `-5`, a minus between two values has a space or a parenthesis on each side, `5 - 3`, `(5)- 3`, `5 -(3)`, and `-(...)` with no value before it is read without its `-`. `- 5`, `-data:n`, `--5`, `5-3` and `5 -3` are errors, and `UnaryOperator` is only `!`

Messages say `An operator expression must be wrapped in parentheses`, with the right article, and the docs have the grammar
