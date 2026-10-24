---
"blogger-hbs": patch
---

`parseXml(xml, { path, cache })` reads a theme in one scan and never throws, and `checkXml`, `formatXml` and `inspectXml` read the document it gives, each done once for it, exported by `blogger-hbs/runtime` too. `checkXml` gives the `errors` and `warnings`, each with a `code`, a `severity`, a `message` and a `loc`, the warnings of the codes in `ignore` left out; `formatXml` the theme as Blogger saves it with its warnings placed in it, or the errors formatting does not fix; `inspectXml` what it is made of. Each expression is parsed once, across rebuilds with a `cache`, as the CLI does. Every rule runs whether the theme is formatted or not: a theme is checked as it is written, formatting fixes where its declarations are, and the warnings are in the order of the document and placed in the theme written, as is `info`. The docs are removed for now, the README has the basics
