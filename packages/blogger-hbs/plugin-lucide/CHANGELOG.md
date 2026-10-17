# @blogger-hbs/plugin-lucide

## 0.0.6

### Patch Changes

- Updated dependencies [[`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea), [`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea), [`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea), [`6403d07`](https://github.com/bloggerkit/bloggerkit/commit/6403d07e47ddeac12fd6e2fb7662a728d227e9f5)]:
  - blogger-hbs@0.0.8

## 0.0.5

### Patch Changes

- Updated dependencies [[`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5), [`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5), [`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5)]:
  - blogger-hbs@0.0.7

## 0.0.4

### Patch Changes

- Updated dependencies [[`173bedb`](https://github.com/bloggerkit/bloggerkit/commit/173bedbe31d1e58e20796613214c49b27299ffbb)]:
  - blogger-hbs@0.0.6

## 0.0.3

### Patch Changes

- [#36](https://github.com/bloggerkit/bloggerkit/pull/36) [`c783447`](https://github.com/bloggerkit/bloggerkit/commit/c783447687096d524058c6d732e1bda135b2611b) Thanks [@kumardeo](https://github.com/kumardeo)! - Errors read as the others, `Plugin 'lucide': Unknown icon: 'mneu' (./index.hbs:2:3), did you mean 'menu'?`
- Updated dependencies [[`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7), [`c783447`](https://github.com/bloggerkit/bloggerkit/commit/c783447687096d524058c6d732e1bda135b2611b), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7), [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`c783447`](https://github.com/bloggerkit/bloggerkit/commit/c783447687096d524058c6d732e1bda135b2611b), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7)]:
  - blogger-hbs@0.0.5

## 0.0.2

### Patch Changes

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - `{{> lucide}}` is reported as a main partial lucide does not provide, an icon is `{{> lucide.name}}`

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - The plugin is `pluginLucide()`. Report unknown props, `{{> lucide.menu sise=16}}`, and point errors at the line and column where an icon is used
- Updated dependencies [[`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3)]:
  - blogger-hbs@0.0.4

## 0.0.1

### Patch Changes

- [#32](https://github.com/bloggerkit/bloggerkit/pull/32) [`d117656`](https://github.com/bloggerkit/bloggerkit/commit/d117656fae0a06e614f656a668336add2ceb4b1b) Thanks [@kumardeo](https://github.com/kumardeo)! - Add `@blogger-hbs/plugin-lucide`: Lucide icons for `blogger-hbs` themes as partials, `{{> lucide.house}}`, rendered by a single `<b:includable>` with only the icons used. Unknown icon names fail the build with where they are used and the closest name.
