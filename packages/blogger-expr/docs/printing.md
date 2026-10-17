# Printing

`print(tree)` turns a tree back into an expression, on a single line, as it would be written in a theme:

```ts
import { parse, print } from "blogger-expr";

print(parse("(data:a and data:b) or (data:c + (1 * 2))"));
// "data:a and data:b or data:c + 1 * 2"
```

- Parentheses are written only where they are needed, or where the grammar requires them, such as around an operator used as a function argument.
- Spacing is consistent: one space around operators and after commas.
- Each operator is written one way: `eq` as `==`, `not` as `!`, `&&` and `||` as `and` and `or`, and `yes` and `no` as `true` and `false`.
- Numbers are written with a digit before the point, `.5` as `0.5`, a negative one with its `-`, `-5`, and a minus between values with a space on each side, `5 - -3`.
- Blogger reads `-(...)` without its `-`, so it is written without it: `-(5)` as `5`.
- A number in a tree made by hand is written without an exponent too, `1e21` as `1000000000000000000000`, as the syntax has none.

Parsing what `print` writes gives back the same tree.

## Indented

With `indent`, a part that doesn't fit in `printWidth` is broken across lines, indented by `indent` spaces:

```ts
print(
  parse('data:links filter (l => l.name == "icon" and l.target != "") map (l => l.target)'),
  { indent: 2, printWidth: 40 },
);
```

```
data:links
  filter (l =>
    l.name == "icon" and l.target != ""
  )
  map (l => l.target)
```

| Option       | Default | Is                                                  |
| ------------ | ------- | --------------------------------------------------- |
| `indent`     | `0`     | the spaces of an indentation, `0` for a single line |
| `printWidth` | `80`    | the width to fit in, with `indent`                  |

## Trees made by hand

A tree that `parse` could never produce throws a `PrintError`: for example a string with a line break, an identifier outside its lambda, or a node that contains itself. The error has the `node` that can't be printed and its `path` in the tree:

```
A string can not have a line break, strings can not span lines (at root.right)
```
