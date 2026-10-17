# blogger-expr

Parser, evaluator and printer for the expressions of Blogger themes, the `cond='...'` and `expr:href='...'` of `<b:if>`, `<b:eval>` and the others.

> [!WARNING]
> `blogger-expr` is experimental. Its API, options and output can change in any release, without a major version bump, and it can have bugs. Pin an exact version and check the output before relying on it.

- Parse an expression into a tree, with the place of what is wrong: `parse('data:view.isPost and data:post.title')`.
- Evaluate it with your data: `evaluate('data:post.labels map (l => l.name)', { data })`.
- Print a tree back, on a single line or broken to fit a width, and it parses back to the same tree.
- The functions of Blogger, `path`, `resizeImage`, `snippet` and the others, checked when parsing.
- Runs in any JavaScript runtime.

## Usage

```sh
pnpm add blogger-expr
```

```ts
import { evaluate, parse, print } from "blogger-expr";

evaluate('data:blog.title + " - " + data:post.title', {
  data: { blog: { title: "My blog" }, post: { title: "Hello" } },
}); // "My blog - Hello"

const tree = parse('data:view.isPost  and   data:post.allowComments');
print(tree); // "data:view.isPost and data:post.allowComments"
```

The expression is what is in the attribute with its entities decoded: `cond='data:a &amp;&amp; data:b'` is `data:a && data:b`.

## Documentation

- [Syntax](./docs/syntax.md): values, `data:` paths, operators and lambdas.
- [Grammar](./docs/grammar.md): the exact rules of the syntax, in EBNF.
- [Functions](./docs/functions.md): `path`, `resizeImage`, `snippet` and the others.
- [Evaluation](./docs/evaluation.md): what an expression gives, truthiness, equality and missing data.
- [Printing](./docs/printing.md): writing a tree back, on a line or indented.
- [JavaScript API](./docs/api.md): the functions, classes, errors and types.

## Compatibility

Blogger does not provide an official specification or grammar for its XML expression language. Consequently, this project has been developed by carefully observing Blogger's behavior through extensive experimentation, reverse engineering, and trial and error.

The parser and evaluator are designed to be as compatible with Blogger as possible and have been tested against hundreds of real-world expressions extracted from production Blogger themes (i.e. Plus UI). Many undocumented language features and edge cases are supported where their behavior could be reliably determined.

However, **100% compatibility cannot be guaranteed**. Blogger's implementation is proprietary, undocumented, and may change without notice. Some expressions may behave differently, particularly if they depend on undocumented quirks, parser bugs, or implementation details that have not yet been identified.

If you discover an expression that behaves differently from Blogger, please open an issue with a minimal reproducible example. Compatibility improvements are always welcome.
