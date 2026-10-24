# blogger-hbs

## 0.0.9

### Patch Changes

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - `checkXml` and `formatXml` check and format a theme as Blogger was found to save and render it. What Blogger refuses, or fails on when rendering, is an error: a section id blank, with spaces around it or the same as another once its entities are decoded, `expr:id` on a section, a widget id over `HTML1000`, a second widget of a type a blog has one of, a section in `<head>` or in a widget, a skin in `<body>`, `<b:template-skin>` without `b:layoutsVersion`, an includable id twice in a widget, as XML reads ids, a `b:defaultmarkup` type it does not have, a `<b:attr>`, `<b:class>` or `<b:tag>` name it can not render, more than 40 `<b:with>` and `<b:loop>` one in another. What it removes when saving, or does not render, is a warning, so it can be removed: comments in sections and widgets and processing instructions, what is not a widget in a section, the attributes it removes from a widget, what is in `<b:else>`, `<b:default>`, `<b:case>`, `<b:elseif>`, `<b:eval>`, `<b:attr>`, `<b:class>`, `<b:param>` or a data tag, a branch after the `<b:else>` or `<b:default>` that ends it, two includables of a widget of which Blogger keeps one, their ids the same once trimmed. What Blogger accepts is accepted, as the root attributes, the XML declaration and the doctype it rewrites, an unknown `b:` element out of widgets, two template skins, `expr:var` and `expr:index` on `<b:loop>`, which win over `var` and `index`, and the Theme Designer variables it reads, only `<Group>` and `<Variable>` with their values in double quotes. The defaults of color, length and background variables are checked as Blogger checks them. Formatting writes what Blogger saves: values decoded and escaped as it escapes them, expressions printed on one line by `blogger-expr`, which Blogger saves as they are written, text with `&`, `<`, `>`, `"` and `'` escaped and the characters past ASCII that are not letters or digits as decimal references, in comments too, settings trimmed and in a CDATA section when they have markup, the declarations without a doctype added, the children of sections and widgets ordered and indented and their end tags on their own lines, the attributes of widgets added and removed, `expr:` ones too, empty skins as an empty CDATA section, and a `value` added to each `<Variable>` without one

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - A second `<b:else>` or `<b:default>` is a warning, no longer an error, as Blogger saves it and never renders what comes after it, and so is what is in `<b:attr>`, `<b:class>`, `<b:eval>`, `<b:elseif>`, `<b:else>`, `<b:case>`, `<b:default>` and `<b:param>`, as Blogger does not render it: `Blogger does not render what is in <b:else>, write it after <b:else/>`; only `<b:include>` has to be empty. Two `<b:template-skin>` are accepted, and a comment in one is kept, as Blogger keeps it. In `<b:skin>`, only `<Group>` and `<Variable>` are read, the other tags being text, a variable name can have underscores, and every value has to be in double quotes, as Blogger reads no other: `Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write type="length"`. Formatting keeps the `<Variable>` tags as they are written, with a `value` added to those without one, and each variable of `info` has the attributes of its type, `ColorVariable`, `LengthVariable` and the others of `SkinVariable`, by `type`

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - Expressions are checked as Blogger checks them, with `blogger-expr`: besides their syntax, a theme is refused for what Blogger would not accept, the type of an operand (`[1] - 1`), a condition that is not one (`5 ? a : b`), an expression that costs more than 40, a range anywhere but the whole `b:loop values`. Formatting prints an expression on one line with `blogger-expr`, keeping how it is spelled, `&&` and `eq` included, and its parentheses. What is accepted but may not do what it looks like is a warning, where it is in the expression, in the formatted theme too, and with how to fix it: ``Expression in the attribute 'cond' of <b:if>: `data:x` may not be text. Fix: turn it into text where it is used: (data:x + "")``

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - An element named like a property of JavaScript objects, `<constructor>` or `<toString>`, no longer crashes validation

- [#47](https://github.com/bloggerkit/bloggerkit/pull/47) [`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3) Thanks [@kumardeo](https://github.com/kumardeo)! - `parseXml(xml, { path, cache })` reads a theme in one scan and never throws, and `checkXml`, `formatXml` and `inspectXml` read the document it gives, each done once for it, exported by `blogger-hbs/runtime` too. `checkXml` gives the `errors` and `warnings`, each with a `code`, a `severity`, a `message` and a `loc`, the warnings of the codes in `ignore` left out; `formatXml` the theme as Blogger saves it with its warnings placed in it, or the errors formatting does not fix; `inspectXml` what it is made of. Each expression is parsed once, across rebuilds with a `cache`, as the CLI does. Every rule runs whether the theme is formatted or not: a theme is checked as it is written, formatting fixes where its declarations are, and the warnings are in the order of the document and placed in the theme written, as is `info`. The docs are removed for now, the README has the basics
- Updated dependencies [[`58bc939`](https://github.com/bloggerkit/bloggerkit/commit/58bc939cd08324b401b64f58b5e2814fbd41a1e3)]:
  - blogger-expr@0.0.3

## 0.0.8

### Patch Changes

- [#44](https://github.com/bloggerkit/bloggerkit/pull/44) [`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea) Thanks [@kumardeo](https://github.com/kumardeo)! - `<b:elseif>` and `<b:else>` are only in a `<b:if>`, with at most one `<b:else>`, after every `<b:elseif>`, and `<b:case>` and `<b:default>` only in a `<b:switch>`, with at most one `<b:default>`, after every `<b:case>`: `<b:else> can only be in a <b:if>, it is in <div>`, `<b:case> can not come after the <b:default> of its <b:switch>`. `<b:message>` has only `<b:param>` in it, and `<b:param>` is only in a `<b:message>`. `<b:attr>`, `<b:class>`, `<b:eval>`, `<b:elseif>`, `<b:else>`, `<b:case>`, `<b:default>`, `<b:include>` and `<b:param>` have to be empty: `<b:else> has to be empty, as <b:else/>`

- [#44](https://github.com/bloggerkit/bloggerkit/pull/44) [`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea) Thanks [@kumardeo](https://github.com/kumardeo)! - The `<Group>` and `<Variable>` tags of `<b:skin>`, the settings of the Theme Designer, are checked as Blogger reads them, from the text and the CDATA sections, where `<` and a name starts a tag that has to be well-formed, `<x` is an error, `< x` text: a unique `description` for each group, not empty, a unique `name` of letters, digits and dots for each variable, a `description` unique in its group and not empty, both read trimmed, a `type` Blogger has and a `default`, with the attributes of the type. Formatting writes them as the other tags, `name` and `description` trimmed, and `info` has them, `groups` and `variables`

- [#44](https://github.com/bloggerkit/bloggerkit/pull/44) [`3dd4d3f`](https://github.com/bloggerkit/bloggerkit/commit/3dd4d3ffd25c187b5d98a6d7473f924ce3eb42ea) Thanks [@kumardeo](https://github.com/kumardeo)! - A theme has one `<b:skin>` and at most one `<b:template-skin>`, with only text and CDATA sections in them: `The theme has to have a <b:skin>`, `<b:skin> can only have text and CDATA in it, found a comment`. Formatting puts what is in them in a single CDATA section, as Blogger saves it, the entities of the text decoded

- [#46](https://github.com/bloggerkit/bloggerkit/pull/46) [`6403d07`](https://github.com/bloggerkit/bloggerkit/commit/6403d07e47ddeac12fd6e2fb7662a728d227e9f5) Thanks [@kumardeo](https://github.com/kumardeo)! - Every `<b:section>` has an `id`, not blank, and not an expression, different from those of the other sections, and every `<b:widget>` an `id` different from those of the other widgets: `There can only be one <b:widget> with the id 'HTML1'`

## 0.0.7

### Patch Changes

- [#42](https://github.com/bloggerkit/bloggerkit/pull/42) [`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5) Thanks [@kumardeo](https://github.com/kumardeo)! - Compiling bundles the scripts and styles and the runtimes of the plugins side by side, and resolves the imports of a template together

- [#42](https://github.com/bloggerkit/bloggerkit/pull/42) [`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5) Thanks [@kumardeo](https://github.com/kumardeo)! - Rendering does less work for every import: the newlines of CDATA sections are protected only where an import indents, imports are indented and the newlines restored in one pass each, and the output mode of a script or a style is read once

- [#42](https://github.com/bloggerkit/bloggerkit/pull/42) [`9c022f1`](https://github.com/bloggerkit/bloggerkit/commit/9c022f15f7354a9ee80f0b0c2ef8100e688314c5) Thanks [@kumardeo](https://github.com/kumardeo)! - Resolving reads each directory once instead of trying every extension of an import with its own file system call, the file system still deciding the case of a name as an import does. In watch mode one resolver is kept, cleared before every compilation. Like an import, a file reached through a symlink resolves to the real file, so it is one chunk however it is reached, a file in the root keeping the root as it is given

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
