# Helpers

## Built-in helpers

Besides those of Handlebars (`if`, `unless`, `each`, `with`, `lookup`, `log`) and `import`:

| Kind                     | Helpers                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Comparison               | `eq` `ne` (`===`, `!==`), `eqw` `new` (`==`, `!=`), `lt` `lte` `gt` `gte`                                                                        |
| Logic | `and` `or` (two or more values, the deciding one as `&&` and `\|\|`), `not`, `default` (the first value that is not `null`, `undefined` or `''`), `iif` (`{{iif featured "a" "b"}}`, `''` without the last value) |
| Strings                  | `concat`, `lower`, `upper`, `trim`, `replace` (the first occurrence), `replaceAll`, `startsWith`, `endsWith`, `split`, `truncate` (`…` by default), `padStart` `padEnd` (a number too, `{{padStart 7 3 "0"}}` is `007`), `repeat`, `capitalize`, `slugify`, `encodeUri`, `encodeUriComponent` |
| Numbers                  | `add`, `sub`, `mul`, `div`, `mod`, `min`, `max`, `round` (decimals, none by default), `floor`, `ceil`, `abs`, `clamp` |
| Arrays, strings, objects | `length`, `includes`, `first`, `last`, `slice`, `join` (`, ` by default), `keys`, `values`, `array`, `hash` (or `object`), `range` (both ends included, `{{#each (range 1 5)}}`), `reverse`, `unique`, `entries` (`{ key, value }` of every key) |
| Values                   | `typeOf`, `toJson`, `fromJson`                                                                                                                   |

```hbs
{{#if (and post.featured (not post.draft))}}…{{/if}}
{{default author.name "Anonymous"}}
{{truncate post.title 60}}
{{#each (slice posts 0 3)}}{{add @index 1}}. {{title}}{{/each}}
{{#each (range 1 5)}}★{{/each}}
<a class='{{iif featured "card is-featured" "card"}}' href='/search/label/{{encodeUriComponent label}}'>
```

A value is truthy for `and`, `or` and `not` as for `{{#if}}`: an empty array is not. The helpers do not convert values, `{{add "1" 2}}` is an error, `Helper 'add': Expected argument 1 to be a number, got: '1' (./index.hbs:2:3)`.

## Helpers of the theme

Helpers are given by the runtime of a plugin, which is bundled into `compiled.js`: the theme renders with them wherever it is rendered. A plugin of the theme itself only needs a name and its runtime.

```ts
// blogger-hbs.config.ts
export default defineConfig({
  plugins: [{ name: "theme", runtime: { entry: "./src/runtime.ts" } }],
});
```

```ts
// src/runtime.ts
import { defineRuntimePlugin } from "blogger-hbs/runtime";

export default defineRuntimePlugin((api) => ({
  helpers: {
    upper: (text: string) => text.toUpperCase(),
  },
}));
```
