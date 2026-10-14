# blogger-hbs

## 0.0.2

### Patch Changes

- [#27](https://github.com/bloggerkit/bloggerkit/pull/27) [`92bc2c9`](https://github.com/bloggerkit/bloggerkit/commit/92bc2c96acbcd59d50b163607bf8b3ac7b087946) Thanks [@kumardeo](https://github.com/kumardeo)! - Validate Blogger expressions (`b:if cond`, `expr:*`, ...) with `blogger-expr`: when compiling, those without Handlebars in them, and in the rendered template when XML validation is enabled. When formatting is enabled, the expressions are printed by `blogger-expr` on a single line

## 0.0.1

### Patch Changes

- [#25](https://github.com/bloggerkit/bloggerkit/pull/25) [`32d26b1`](https://github.com/bloggerkit/bloggerkit/commit/32d26b1007dd777fdb856ffe14c3ab8215850ee0) Thanks [@kumardeo](https://github.com/kumardeo)! - Add `blogger-hbs`: build Blogger themes from Handlebars templates, with bundled scripts and styles, XML validation and formatting, a CLI and watch mode.
