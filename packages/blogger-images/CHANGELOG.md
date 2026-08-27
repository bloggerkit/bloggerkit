# blogger-images

## 0.0.4

### Patch Changes

- [`3070225`](https://github.com/bloggerkit/bloggerkit/commit/30702259f178988df12025a1aa1c77f468bced5c) Thanks [@kumardeo](https://github.com/kumardeo)! - refactor: split `ImageParams` out of `BloggerImage`

  Move all param getters/setters into a standalone `ImageParams` base class.
  `BloggerImage` now extends `ImageParams` and only handles URL matching
  and serialization, keeping param logic reusable.

## 0.0.3

### Patch Changes

- [`3636157`](https://github.com/bloggerkit/bloggerkit/commit/36361574cdcf3379751d97d531f0d679018410d4) Thanks [@kumardeo](https://github.com/kumardeo)! - Prevent long regex literals by constructing the pattern from a `Set` of allowed values instead. This improves readability and maintainability while avoiding oversized regex definitions.

  Also fix hostname matching logic to ensure hostnames are validated against the intended pattern and do not incorrectly match partial or invalid hostnames.

## 0.0.2

### Patch Changes

- [`da07c1a`](https://github.com/bloggerkit/bloggerkit/commit/da07c1a8f627178f6110c9f283c20d3ad9f9eb50) Thanks [@kumardeo](https://github.com/kumardeo)! - feat!: migrate to pure ESM

## 0.0.1

### Patch Changes

- [`565a24e`](https://github.com/bloggerkit/bloggerkit/commit/565a24ef9c96eb9859320e2eb36703bbd674b92c) Thanks [@kumardeo](https://github.com/kumardeo)! - chore: moved from `@deox/google-image`
