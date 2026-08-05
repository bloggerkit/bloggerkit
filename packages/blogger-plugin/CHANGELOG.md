# blogger-plugin

## 0.0.14

### Patch Changes

- [`da07c1a`](https://github.com/bloggerkit/bloggerkit/commit/da07c1a8f627178f6110c9f283c20d3ad9f9eb50) Thanks [@kumardeo](https://github.com/kumardeo)! - feat!: migrate to pure ESM

## 0.0.13

### Patch Changes

- [#17](https://github.com/bloggerkit/bloggerkit/pull/17) [`ca7d3dd`](https://github.com/bloggerkit/bloggerkit/commit/ca7d3dded3cc69eb65654dbbc88937863fd52660) Thanks [@kumardeo](https://github.com/kumardeo)! - refactor: replace sync fs operations with fs/promises

## 0.0.12

### Patch Changes

- [#13](https://github.com/bloggerkit/blogger-plugin/pull/13) [`b98705e`](https://github.com/bloggerkit/blogger-plugin/commit/b98705e31997005f4c5f14fda85209800c94ae54) Thanks [@kumardeo](https://github.com/kumardeo)! - Ignore Vite internal requests (/@fs/, /@vite/, etc.) in middleware

## 0.0.11

### Patch Changes

- [`8236c2a`](https://github.com/bloggerkit/blogger-plugin/commit/8236c2a90124325e12599f994672fb3d0c49ed46) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: improve tailwindcss classes extraction

## 0.0.10

### Patch Changes

- [`b44c8fa`](https://github.com/bloggerkit/blogger-plugin/commit/b44c8fa15a07762a20e15bb4d1937e08ac6eae53) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: add option to generate minified xml

## 0.0.9

### Patch Changes

- [`8b0e288`](https://github.com/bloggerkit/blogger-plugin/commit/8b0e28873bb57087830f3b4c50c3bfe669416642) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: warn when `base` is not an absolute URL during build

- [`b6259a0`](https://github.com/bloggerkit/blogger-plugin/commit/b6259a0da5aa6dca7d00a7c3ceb541d3b7d322cd) Thanks [@kumardeo](https://github.com/kumardeo)! - chore: migrate to `tsdown` for bundling

## 0.0.8

### Patch Changes

- [`17d6641`](https://github.com/bloggerkit/blogger-plugin/commit/17d664108b3ae45c0b29624351324f2115d6ab02) Thanks [@kumardeo](https://github.com/kumardeo)! - fix: handle crossorigin attribute correctly

## 0.0.7

### Patch Changes

- [`19bd22a`](https://github.com/kumardeo/blogger-plugin/commit/19bd22a80cf28db519880e56257211b1a1483d40) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: check`sec-fetch-dest` and `sec-fetch-mode` before updating `.tailwind-classes.json` in dev or preview mode

## 0.0.6

### Patch Changes

- [`6f48c39`](https://github.com/kumardeo/blogger-plugin/commit/6f48c39a2005e658ad3b30e33d9ccfb56052954d) Thanks [@kumardeo](https://github.com/kumardeo)! - fix: correctly construct request url

## 0.0.5

### Patch Changes

- [`117d9dd`](https://github.com/kumardeo/blogger-plugin/commit/117d9dddcf637d4244ed74fb462a17f7bcdfd22c) Thanks [@kumardeo](https://github.com/kumardeo)! - chore: replace `entry` option with `modules`
  feat: add `styles` option
  fix: don't fallback to proxy blog if request pathname points to html entry

## 0.0.4

### Patch Changes

- [`7c5f274`](https://github.com/kumardeo/blogger-plugin/commit/7c5f274a71a0895c0d96116000e62489722dc7b1) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: generate `template-tags.xml`, it will only contain necessary tags and not contents from input `template.xml`

## 0.0.3

### Patch Changes

- [`60b7314`](https://github.com/kumardeo/blogger-plugin/commit/60b7314634bbe0f3cd1c48d0baafc7bef9ca4949) Thanks [@kumardeo](https://github.com/kumardeo)! - feat: support vite 8
  feat: add experimental tailwind css support

## 0.0.2

### Patch Changes

- [`cd57283`](https://github.com/kumardeo/blogger-plugin/commit/cd57283be6e961ff5a93e5290ab9fd60b49683c4) Thanks [@kumardeo](https://github.com/kumardeo)! - fix: template xml was being served instead of proxy blog html in preview mode

## 0.0.1

### Patch Changes

- [`61c9f74`](https://github.com/kumardeo/blogger-plugin/commit/61c9f74ccc9fd289f1fb6d123023779e08ed9081) Thanks [@kumardeo](https://github.com/kumardeo)! - chore: initial release
