---
"blogger-hbs": patch
---

The `<Group>` and `<Variable>` tags of `<b:skin>`, the settings of the Theme Designer, are checked as Blogger reads them, from the text and the CDATA sections, the other tags being text: a unique `description` for each group, not empty, a unique `name` of letters, digits, dots and underscores for each variable, a `description` unique in its group and not empty, both read trimmed, a `type` Blogger has and a `default`, with the attributes of the type, every value in double quotes, as Blogger reads no other: `Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write type="length"`. Formatting keeps them as they are written, with a `value` added to each `<Variable>` without one, and `info` has them, `groups` and `variables`, each variable with the attributes of its type, `ColorVariable`, `LengthVariable` and the others of `SkinVariable`, by `type`
