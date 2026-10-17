# blogger-hbs

## 0.0.6

### Patch Changes

- [#40](https://github.com/bloggerkit/bloggerkit/pull/40) [`173bedb`](https://github.com/bloggerkit/bloggerkit/commit/173bedbe31d1e58e20796613214c49b27299ffbb) Thanks [@kumardeo](https://github.com/kumardeo)! - `blogger-hbs validate <file>` validates an XML theme, and `blogger-hbs format <file>` formats it, written to stdout or with `-o, --out <file>` to a file, as a build does with the rendered theme. With `--json`, the result is printed as JSON: the warnings and info of a valid theme, with the formatted theme or where it is written, or every error
  
  `--version` shows the copyright, the license, the URL of the project, and the version of Node.js and the platform

## 0.0.5

### Patch Changes

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - An attribute Blogger does not read on a `b:` element is a warning, not an error, `<b:if> has the attribute 'rel', Blogger only reads 'cond'`, and it is kept. `<b:section>` and `<b:tag>` can still have any

- [#38](https://github.com/bloggerkit/bloggerkit/pull/38) [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7) Thanks [@kumardeo](https://github.com/kumardeo)! - The CLI shows its name and version first, then after a build the size of the files it writes, gzipped too, and what the theme is made of: the size of its scripts, styles and markup, adding up to its size, and its templates, plugin partials, sections and widgets. When watching, each rebuild starts with a line of its time and the file changed, and shows the files written and what the theme is made of, each count and size followed by its change since the last build. `watchTemplate` gives `onStart` the files changed

- [#36](https://github.com/bloggerkit/bloggerkit/pull/36) [`c783447`](https://github.com/bloggerkit/bloggerkit/commit/c783447687096d524058c6d732e1bda135b2611b) Thanks [@kumardeo](https://github.com/kumardeo)! - Errors say what they are about and where, in the same way: `Plugin 'p': message (./index.hbs:2:3)`, `Helper 'eq': message (./index.hbs:2:6)`, `Invalid XML: message (./b.hbs:3:1)` and `Failed to resolve './b.hbs' (./index.hbs:1:4)`.
  
  - `PluginError`, `HelperError`, `CompileError` and `XmlError` have the place in `loc`, `{ path, line, column }` with 1-based columns. The path is the id of the template, `./index.hbs`, when compiling as when rendering, the name of a partial of a plugin, `p.x`, or the file of a document.
  - `PluginError` has the `plugin`, `HelperError` the `helper`. What a plugin reports with `plugin.error()`, or throws as a `PluginError`, says which plugin it is, and so does invalid XML in its partials.
  - An error a helper throws, `throw new TypeError('Expected a date')`, is a `HelperError` with its message, `Helper 'format': Expected a date (./index.hbs:2:6)`, and the error as its cause. An error thrown in a hook of a plugin is a `PluginError`, `Plugin 'p' failed in 'provide'`, with the error as its cause.
  - Invalid names of partials of plugins and inline partials with a name of a plugin are `CompileError`s, errors of the template.
  - The CLI reports an invalid rendered template as `The rendered template is not valid XML`, caused by where it is, `(dist/theme.xml:1:1)`, and does not repeat a cause the message already has.

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - Check default markups as Blogger does: `<b:defaultmarkups>` has only `<b:defaultmarkup>` in it, `<b:defaultmarkup>` only `<b:includable>` and is only in a `<b:defaultmarkups>`, and `<b:includable>` is only in a `<b:defaultmarkup>` or a `<b:widget>`

- [#38](https://github.com/bloggerkit/bloggerkit/pull/38) [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7) Thanks [@kumardeo](https://github.com/kumardeo)! - Indent the widgets of a `<b:section>` as Blogger does

- [#38](https://github.com/bloggerkit/bloggerkit/pull/38) [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7) Thanks [@kumardeo](https://github.com/kumardeo)! - Check the layout of the rendered theme as Blogger does: the root element is `<html>` with only the `b:` attributes Blogger knows, `b:css`, `b:js` and `b:responsive` `'true'` or `'false'`, `b:defaultwidgetversion` `'1'` or `'2'`, `b:layoutsVersion` `'2'` or `'3'`, `b:templateUrl` and `b:templateVersion`, `<b:widget>` only in a `<b:section>`, with at most one `<b:widget-settings>` and `<b:includable>`s, `<b:widget-setting>` only in a `<b:widget-settings>`, only the `b:` elements Blogger knows, `Unknown element <b:includeable>, did you mean <b:includable>?`, and their attributes, `<b:loop>` with `values` and `var` and maybe `index`, each also as `expr:name`, with the line and column of what is wrong. An attribute written both as `x` and `expr:x` is a warning, Blogger uses `expr:x`

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - Accept only the widget types Blogger has in `type` of `<b:widget>`, `Unknown widget type 'Html', did you mean 'HTML'?`, and an `id` that is the type and a number, `HTML1`. Blogger reads `id` and `type` of `<b:widget>`, `id` of `<b:includable>` and `var` and `index` of `<b:loop>` when saving, `expr:name` of these is not used, with a warning

- [#36](https://github.com/bloggerkit/bloggerkit/pull/36) [`c783447`](https://github.com/bloggerkit/bloggerkit/commit/c783447687096d524058c6d732e1bda135b2611b) Thanks [@kumardeo](https://github.com/kumardeo)! - More built-in helpers:
  
  - to compare: `ne`, `new`, `gt`, `lte` and `gte`
  - for logic: `and`, `or`, `not`, `default` and `iif`
  - for strings: `concat`, `lower`, `upper`, `trim`, `replace` (the first occurrence), `replaceAll`, `startsWith`, `endsWith`, `split`, `truncate`, `padStart`, `padEnd`, `repeat`, `capitalize`, `slugify`, `encodeUri` and `encodeUriComponent`
  - for numbers: `add`, `sub`, `mul`, `div`, `mod`, `min`, `max`, `round`, `floor`, `ceil`, `abs` and `clamp`
  - for arrays, strings and objects: `length`, `includes`, `first`, `last`, `slice`, `join`, `keys`, `values`, `range`, `reverse`, `unique` and `entries`
  
  Every built-in helper checks its arguments the same way, `typeOf`, `eq`, `fromJson`, `toJson` and the others too: `Helper 'fromJson': Expected argument 1 to be a string, got: 1 (./index.hbs:2:3)`. They do not convert values, `{{add "1" 2}}` is an error.

- [#39](https://github.com/bloggerkit/bloggerkit/pull/39) [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c) Thanks [@kumardeo](https://github.com/kumardeo)! - `processXml(xml, { path, format })` validates a theme, formats it with `format`, and returns it with its `warnings`, `{ message, loc }` in the output, and `info`, what it is made of: the `b:` attributes of `<html>`, its sections, its widgets with their section, and its scripts and styles with the bytes in them. Every error is reported at once, in `XmlError.errors`, with a syntax error stopping the scan. The CLI lists them under `Caused by`, and shows the scripts, styles, sections and widgets of the theme from `info`

- [#38](https://github.com/bloggerkit/bloggerkit/pull/38) [`a5811e2`](https://github.com/bloggerkit/bloggerkit/commit/a5811e2c8fa726910758ddbbb4ef75ba9a9d3df7) Thanks [@kumardeo](https://github.com/kumardeo)! - Self-close the elements with nothing in them, as Blogger does, `<a></a>` as `<a/>`
- Updated dependencies [[`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c), [`87e585d`](https://github.com/bloggerkit/bloggerkit/commit/87e585d8297b53f5ac734cc72a8c659dc3ae225c)]:
  - blogger-expr@0.0.2

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
