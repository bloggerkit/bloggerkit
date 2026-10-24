# blogger-expr

Parser, checker, evaluator and formatter for the expressions of Blogger themes, the `cond='...'` and `expr:href='...'` of `<b:if>`, `<b:eval>` and the others.

> [!WARNING]
> `blogger-expr` is experimental. Its API, options and output can change in any release, without a major version bump, and it can have bugs. Pin an exact version and check the output before relying on it.

## Usage

```sh
pnpm add blogger-expr
```

```ts
import { evaluate, parse, print, toText } from 'blogger-expr';

const result = parse('"Page " + data:n + " of " + data:total');
result.errors; // why Blogger would not accept the expression, with where and how to fix it
result.warnings; // what is accepted but may not do what it looks like
result.cost; // its size: Blogger accepts at most 40

const value = evaluate(result, { data: { n: 2, total: 5 } });
toText(value); // "Page 2 of 5", as Blogger prints it
print(result.ast, { printWidth: 40 }); // the expression again, formatted
```

The language is described in [docs/grammar.md](./docs/grammar.md).
