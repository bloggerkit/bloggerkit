---
"blogger-hbs": patch
---

More built-in helpers:

- to compare: `ne`, `new`, `gt`, `lte` and `gte`
- for logic: `and`, `or`, `not`, `default` and `iif`
- for strings: `concat`, `lower`, `upper`, `trim`, `replace` (the first occurrence), `replaceAll`, `startsWith`, `endsWith`, `split`, `truncate`, `padStart`, `padEnd`, `repeat`, `capitalize`, `slugify`, `encodeUri` and `encodeUriComponent`
- for numbers: `add`, `sub`, `mul`, `div`, `mod`, `min`, `max`, `round`, `floor`, `ceil`, `abs` and `clamp`
- for arrays, strings and objects: `length`, `includes`, `first`, `last`, `slice`, `join`, `keys`, `values`, `range`, `reverse`, `unique` and `entries`

Every built-in helper checks its arguments the same way, `typeOf`, `eq`, `fromJson`, `toJson` and the others too: `Helper 'fromJson': Expected argument 1 to be a string, got: 1 (./index.hbs:2:3)`. They do not convert values, `{{add "1" 2}}` is an error.
