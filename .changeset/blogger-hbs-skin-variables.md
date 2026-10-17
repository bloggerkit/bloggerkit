---
"blogger-hbs": patch
---

The `<Group>` and `<Variable>` tags of `<b:skin>`, the settings of the Theme Designer, are checked as Blogger reads them, from the text and the CDATA sections, where `<` and a name starts a tag that has to be well-formed, `<x` is an error, `< x` text: a unique `description` for each group, not empty, a unique `name` of letters, digits and dots for each variable, a `description` unique in its group and not empty, both read trimmed, a `type` Blogger has and a `default`, with the attributes of the type. Formatting writes them as the other tags, `name` and `description` trimmed, and `info` has them, `groups` and `variables`
