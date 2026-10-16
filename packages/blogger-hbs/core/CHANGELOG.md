# blogger-hbs

## 0.0.4

### Patch Changes

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - Give compile plugins more control: a plugin context as the last argument of every hook (`root`, `entry`, `mode`, `watch`, `resolve`, `addWatchFile`, `warn`, `error` with a location), every place a partial is used with its hash (`requests`), `buildStart` and `buildEnd`, `enforce: 'pre' | 'post'`, and a `runtime` half bundled into the compiled module (the runtimes of all the plugins together, sharing the modules they import) with helpers, an async `prepare` adding data before every render and `transform` for the output. The helpers of a theme come from the `runtime` of a plugin, `plugins: [{ name: 'theme', runtime: { entry: './src/runtime.ts' } }]`, and the host rendering a theme can add runtime plugins with `createRenderer(theme, { plugins })`

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - A plugin `p` provides its main partial `{{> p}}` with the key `.` and partials with names separated by single dots, `{{> p.a.b}}` with `a.b`. The names of the partials of a plugin are checked as they are written, `{{> p..a}}` that Handlebars reads as `{{> p}}` is an error where it is, and an inline partial can not have a name of a plugin. The partials and imports in an inline partial are found too

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - Render anywhere with `blogger-hbs/runtime`: `createRenderer(theme)` sets up a compiled template once and renders it many times, in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, a browser), without the compiler or Node.js. The compiled module exports a `format`, checked by the renderer, and imports nothing

- [#34](https://github.com/bloggerkit/bloggerkit/pull/34) [`f3e69f0`](https://github.com/bloggerkit/bloggerkit/commit/f3e69f0526f22f5f09a3171baa94414340a483e3) Thanks [@kumardeo](https://github.com/kumardeo)! - Validate the config, the compile and watch options and what plugin hooks return with zod, with the same messages as before, `Invalid 'runtime.options.list[1]' of plugin 'p', ...` pointing at the value inside the options. `blogger-hbs/runtime` does not depend on zod

## 0.0.3

### Patch Changes

- [#29](https://github.com/bloggerkit/bloggerkit/pull/29) [`29dff62`](https://github.com/bloggerkit/bloggerkit/commit/29dff62d1493b837e778908132e1f2c20e21e032) Thanks [@kumardeo](https://github.com/kumardeo)! - Exit watch mode without `process.exit` on Ctrl+C, so rspack's native bindings no longer warn `ObjectRef is not unref, it considered as a memory leak`

## 0.0.2

### Patch Changes

- [#27](https://github.com/bloggerkit/bloggerkit/pull/27) [`92bc2c9`](https://github.com/bloggerkit/bloggerkit/commit/92bc2c96acbcd59d50b163607bf8b3ac7b087946) Thanks [@kumardeo](https://github.com/kumardeo)! - Validate Blogger expressions (`b:if cond`, `expr:*`, ...) with `blogger-expr`: when compiling, those without Handlebars in them, and in the rendered template when XML validation is enabled. When formatting is enabled, the expressions are printed by `blogger-expr` on a single line

## 0.0.1

### Patch Changes

- [#25](https://github.com/bloggerkit/bloggerkit/pull/25) [`32d26b1`](https://github.com/bloggerkit/bloggerkit/commit/32d26b1007dd777fdb856ffe14c3ab8215850ee0) Thanks [@kumardeo](https://github.com/kumardeo)! - Add `blogger-hbs`: build Blogger themes from Handlebars templates, with bundled scripts and styles, XML validation and formatting, a CLI and watch mode.
