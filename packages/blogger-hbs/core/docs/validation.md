# Validation and formatting

## Templates, when compiling

Every template, and every partial a plugin provides, is checked as XML with its Handlebars in it, whatever the options:

- every tag it opens is closed, in the template itself: a template is a fragment, anything can be at its top
- expressions are where their output can be XML: in text, in quoted attribute values and between attributes
- the content of a block leaves the XML as it found it, except for the branches of `{{#if}}` and `{{#unless}}`, which can each open the same tag: `{{#if a}}<div class='a'>{{else}}<div>{{/if}}`
- the content of `{{#import}}`, `{{#> partial}}` and `{{#*inline}}` blocks is checked on its own, it is rendered elsewhere
- Blogger expressions (`b:if cond`, `expr:*`, ...) parse with [`blogger-expr`](../../../blogger-expr), unless their value has Handlebars in it, which is only known once rendered

```
✗ Invalid XML: expected </b> to close <b> (opened at 2:3), found </a> (./index.hbs:2:6)
```

## The rendered theme

With `output.validate`, `true` by default, the rendered theme is checked as Blogger reads it: well-formed XML, the XML declaration on the first line and the doctype on the second, and every expression parsing.

With `output.format`, `true` by default, it is then written as Blogger saves it:

- the XML declaration and the doctype added, or moved to the top
- start tags on a single line, line breaks in attribute values a space
- attributes sorted by name and quoted with single quotes
- expressions printed by `blogger-expr` on a single line, `data:a&amp;&amp;data:b` as `data:a and data:b`
- the children of `<b:widget>` and `<b:widget-settings>` each on a line, indented

Everything else is left as it is. `--no-format` and `--no-validate` turn them off in the CLI.

```
✗ The rendered template is not valid XML
  Caused by: The first line has to be the XML declaration, <?xml version="1.0" encoding="UTF-8" ?> (dist/theme.xml:1:1)
```

The theme is written even when it is not valid, to look at where it is not.

## From JavaScript

`validateXml(xml, { path? })` and `formatXml(xml, { path? })` do the same, from `blogger-hbs` or `blogger-hbs/runtime`, a Cloudflare Worker too. They throw an `XmlError`, its place in `loc`, see [Errors](./errors.md).

```ts
import { formatXml } from "blogger-hbs/runtime";

const xml = formatXml(await renderer.render(context));
```
