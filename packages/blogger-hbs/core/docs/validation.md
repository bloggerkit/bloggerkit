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

With `output.validate`, `true` by default, the rendered theme is checked as Blogger reads it: well-formed XML, the XML declaration on the first line and the doctype on the second, `<html>` as the root element, and every expression parsing. Every error is reported at once, but nothing after a syntax error, an unclosed tag or an invalid entity, can be checked:

```
✗ The rendered template is not valid XML
  Caused by: 2 errors:
    Unknown widget type 'Html', did you mean 'HTML'? (dist/theme.xml:12:31)
    <b:section> can only have <b:widget> in it, found <div> (dist/theme.xml:20:5)
```

The `b:` attributes of `<html>` are those Blogger knows, with the values it accepts, the others are left as they are:

| Attribute                            | Accepts           |
| ------------------------------------ | ----------------- |
| `b:css`, `b:js`, `b:responsive`      | `true` or `false` |
| `b:defaultwidgetversion`             | `1` or `2`        |
| `b:layoutsVersion`                   | `2` or `3`        |
| `b:templateUrl`, `b:templateVersion` | anything          |

Its layout is checked as Blogger does when saving it, whitespace and comments aside:

- `<b:section>` has only `<b:widget>` in it, and a `<b:widget>` is only in a `<b:section>`
- `<b:widget>` has at most one `<b:widget-settings>` and any `<b:includable>`, nothing else, and a `<b:widget-settings>` is only in a `<b:widget>`
- `<b:widget-settings>` has only `<b:widget-setting>` in it, and a `<b:widget-setting>` is only in a `<b:widget-settings>`
- `<b:defaultmarkups>` has only `<b:defaultmarkup>` in it, and a `<b:defaultmarkup>` is only in a `<b:defaultmarkups>`
- `<b:defaultmarkup>` has only `<b:includable>` in it, and a `<b:includable>` is only in a `<b:defaultmarkup>` or a `<b:widget>`

```
✗ The rendered template is not valid XML
  Caused by: <b:widget> can only have one <b:widget-settings> (dist/theme.xml:12:5)
```

Only the `b:` elements Blogger knows are accepted. An attribute Blogger does not read on one is a warning, `<b:if> has the attribute 'rel', Blogger only reads 'cond'`, and it is kept, except on `<b:section>` and `<b:tag>`, which can have any. Every attribute but those below can be written as `expr:name` as well, `expr:value='data:x'`. With both, on any element, Blogger uses `expr:name` and a warning says so:

| Element            | Has to have     | Can have                                        |
| ------------------ | --------------- | ----------------------------------------------- |
| `b:attr`           | `name`, `value` | `cond`                                          |
| `b:case`           | `value`         |                                                 |
| `b:class`          | `name`          | `cond`                                          |
| `b:defaultmarkup`  | `type`          |                                                 |
| `b:elseif`         | `cond`          |                                                 |
| `b:eval`           | `expr`          |                                                 |
| `b:if`             | `cond`          |                                                 |
| `b:include`        | `name`          | `data`, `cond`                                  |
| `b:includable`     | `id`            | `var`                                           |
| `b:loop`           | `values`, `var` | `index`                                         |
| `b:message`        | `name`          |                                                 |
| `b:param`          | `name`, `value` |                                                 |
| `b:section`        | `id`            | any other attribute                             |
| `b:skin`           |                 | `version`                                       |
| `b:switch`         | `var`           |                                                 |
| `b:tag`            | `name`          | any other attribute, for the tag it renders     |
| `b:widget`         | `id`, `type`    | `locked`, `title`, `version`, `visible`, `cond` |
| `b:widget-setting` | `name`          |                                                 |
| `b:with`           | `var`, `value`  |                                                 |

`b:comment`, `b:default`, `b:defaultmarkups`, `b:else`, `b:template-skin` and `b:widget-settings` have no attributes.

Some attributes are read by Blogger when saving, it ignores `expr:name` for them, with a warning: `id` and `type` of `<b:widget>`, `id` of `<b:includable>`, and `var` and `index` of `<b:loop>`. With both, Blogger uses `name`.

`type` of `<b:widget>` is a widget type Blogger has: `AdSense`, `Attribution`, `Blog`, `BlogArchive`, `BloggerButton`, `BlogList`, `BlogSearch`, `ContactForm`, `FeaturedPost`, `Feed`, `Followers`, `Header`, `HTML`, `Image`, `Label`, `LinkList`, `PageList`, `PopularPosts`, `Profile`, `ReportAbuse`, `Stats`, `Subscribe`, `Text`, `TextList`, `Translate` or `Wikipedia`.

`id` of `<b:widget>` is its type and a number, `HTML1` or `Blog000`.

```
✗ The rendered template is not valid XML
  Caused by: Unknown element <b:includeable>, did you mean <b:includable>? (dist/theme.xml:8:7)
```

With `output.format`, `true` by default, it is then written as Blogger saves it:

- the XML declaration and the doctype added, or moved to the top
- start tags on a single line, line breaks in attribute values a space
- elements with nothing in them self-closed, `<b:include name='x'></b:include>` as `<b:include name='x'/>`, a space or a line break in them is something
- attributes sorted by name and quoted with single quotes
- expressions printed by `blogger-expr` on a single line, `data:a&amp;&amp;data:b` as `data:a and data:b`
- the children of `<b:section>`, `<b:widget>` and `<b:widget-settings>` each on a line, indented

Everything else is left as it is. `--no-format` and `--no-validate` turn them off in the CLI.

```
✗ The rendered template is not valid XML
  Caused by: The first line has to be the XML declaration, <?xml version="1.0" encoding="UTF-8" ?> (dist/theme.xml:1:1)
```

The theme is written even when it is not valid, to look at where it is not.

## From JavaScript

`processXml(xml, { path?, format? })` does the same, from `blogger-hbs` or `blogger-hbs/runtime`, a Cloudflare Worker too. It validates the theme, formats it with `format`, and returns it with its warnings and what it is made of. It throws an `XmlError` with every error in `errors`, see [Errors](./errors.md).

```ts
import { processXml } from "blogger-hbs/runtime";

const { xml, warnings, info } = processXml(await renderer.render(context), {
  path: "theme.xml",
  format: true,
});
```

| Result     | Is                                                                   |
| ---------- | -------------------------------------------------------------------- |
| `xml`      | the theme, formatted with `format`                                   |
| `warnings` | `{ message, loc }`, in `xml`, so the places are in the theme written |
| `info`     | what `xml` is made of, the CLI shows it after a build                |

| `info`     | Is                                                                                  |
| ---------- | ----------------------------------------------------------------------------------- |
| `root`     | the `b:` attributes of `<html>`, `{ 'b:layoutsVersion': '3' }`                      |
| `sections` | `{ id, loc }` of every `<b:section>`                                                |
| `widgets`  | `{ id, type, section, loc }` of every `<b:widget>`, `section` the id of its section |
| `scripts`  | `{ count, size }` of the `<script>` elements, `size` the bytes in them              |
| `styles`   | `{ count, size }` of the `<style>`, `<b:skin>` and `<b:template-skin>` elements     |
