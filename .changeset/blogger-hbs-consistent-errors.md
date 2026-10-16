---
"blogger-hbs": patch
---

Errors say what they are about and where, in the same way: `Plugin 'p': message (./index.hbs:2:3)`, `Helper 'eq': message (./index.hbs:2:6)`, `Invalid XML: message (./b.hbs:3:1)` and `Failed to resolve './b.hbs' (./index.hbs:1:4)`.

- `PluginError`, `HelperError`, `CompileError` and `XmlError` have the place in `loc`, `{ path, line, column }` with 1-based columns. The path is the id of the template, `./index.hbs`, when compiling as when rendering, the name of a partial of a plugin, `p.x`, or the file of a document.
- `PluginError` has the `plugin`, `HelperError` the `helper`. What a plugin reports with `plugin.error()`, or throws as a `PluginError`, says which plugin it is, and so does invalid XML in its partials.
- An error a helper throws, `throw new TypeError('Expected a date')`, is a `HelperError` with its message, `Helper 'format': Expected a date (./index.hbs:2:6)`, and the error as its cause. An error thrown in a hook of a plugin is a `PluginError`, `Plugin 'p' failed in 'provide'`, with the error as its cause.
- Invalid names of partials of plugins and inline partials with a name of a plugin are `CompileError`s, errors of the template.
- `validateXml` and `formatXml` take the `path` of the document. The CLI reports an invalid rendered template as `The rendered template is not valid XML`, caused by where it is, `(dist/theme.xml:1:1)`, and does not repeat a cause the message already has.
