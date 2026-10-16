# Templates

A theme is Handlebars templates, `.hbs`, `.handlebars`, `.xml` or `.html`, written as the XML Blogger saves: Blogger tags (`<b:if>`, `<b:widget>`, ...) and expressions (`expr:href='data:post.url'`) are left as they are, Handlebars runs before Blogger does.

```hbs
<html>
  <body>
    {{import "~/layout/header.hbs"}}
    <b:section id='main'>...</b:section>
    {{import "~/scripts/main.ts" script:defer=true}}
  </body>
</html>
```

## `import`

`{{import "specifier"}}` puts a template, a script, a style or data in its place, its kind is its extension:

| Kind     | Extensions                                               | `{{import}}` is                                      |
| -------- | -------------------------------------------------------- | ---------------------------------------------------- |
| template | `.hbs` `.handlebars` `.xml` `.html`                      | the template rendered with the same context          |
| script   | `.ts` `.tsx` `.mts` `.js` `.jsx` `.mjs` `.cjs`           | a `<script>`, with a `<style>` for the CSS it imports |
| style    | `.css` `.scss` `.sass` `.less` `.styl` `.stylus` `.postcss` | a `<style>`                                     |
| data     | `.json`                                                  | the value, `{{#with (import "./site.json")}}`        |

The specifier is a string written in the template, not a value:

- `./header.hbs`, `../header.hbs`: relative to the template importing it
- `/src/header.hbs`: relative to the root
- `~/header.hbs`: through an [alias](./configuration.md#options)
- `some-package/theme.css`: a file of a package of the root

The extension can be left out, `./header` is `./header.hbs` when it exists, and a directory is its `index` template or script, `./card` for `./card/index.hbs`.

### Templates

An import alone on its line is indented as the line is, every line of what it renders:

```hbs
<body>
  {{import "./header.hbs"}}
</body>
```

A block import renders its content where the template has `{{> @partial-block}}`, for layouts:

```hbs
{{#import "./card.hbs"}}<p>The content</p>{{/import}}
```

```hbs
<!-- card.hbs -->
<div class='card'>{{> @partial-block}}</div>
```

### Data

A JSON file is read when compiling, its value is in the compiled theme:

```hbs
{{#with (import "~/data/site.json")}}
  {{#each nav}}<a href='{{url}}'>{{label}}</a>{{/each}}
{{/with}}
```

### Scripts and styles

Scripts and styles are bundled with [Rsbuild](https://rsbuild.rs), once however many times they are imported, and inlined in a CDATA section:

```hbs
{{import "./main.ts"}}
<!-- <script>/*<![CDATA[*/ ... /*]]>*/</script> -->
```

| Option                                     | Renders                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| `script:defer=true`, `script:type="module"` | the attribute on the `<script>`, `style:media="print"` on the `<style>` |
| `script=(object type="module" defer=true)` | the attributes of the object, `script:name` ones go over them |
| `script:only=true`, `style:only=true`      | only the `<script>`, or only the `<style>` of a script      |
| `script:raw=true`, `style:raw=true`        | only the code, without a tag, for a `<b:skin>`              |
| `depends-on="./a.ts, ./b.css"`             | a script loaded after those it depends on, which are imported too |

A style is usually in the `<b:skin>` of the theme:

```hbs
<b:skin><![CDATA[{{import "~/styles/main.css" style:raw=true}}]]></b:skin>
```

Scripts depending on each other share a runtime, put once before the first of them.

## Partials and data of plugins

Plugins provide partials, `{{> lucide.menu}}`, and data, `{{@site.name}}`, see [Plugins](./plugins.md). Helpers, built-in or of plugins, are in [Helpers](./helpers.md).

## Validation

Every template is checked as XML when compiling, with its Handlebars in it, see [Validation and formatting](./validation.md).
