# @blogger-hbs/plugin-lucide

## 0.0.2

### Patch Changes

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - `{{> lucide}}` is reported as a main partial lucide does not provide, an icon is `{{> lucide.name}}`

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - The plugin is `pluginLucide()`. Report unknown props, `{{> lucide.menu sise=16}}`, and point errors at the line and column where an icon is used
- Updated dependencies [[`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3), [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3)]:
  - blogger-hbs@0.0.4

## 0.0.1

### Patch Changes

- [#32](https://github.com/bloggerkit/bloggerkit/pull/32) [`d117656`](https://github.com/bloggerkit/bloggerkit/commit/d117656fae0a06e614f656a668336add2ceb4b1b) Thanks [@kumardeo](https://github.com/kumardeo)! - Add `@blogger-hbs/plugin-lucide`: Lucide icons for `blogger-hbs` themes as partials, `{{> lucide.house}}`, rendered by a single `<b:includable>` with only the icons used. Unknown icon names fail the build with where they are used and the closest name.
