---
"blogger-hbs": patch
---

A theme has one `<b:skin>` and at most one `<b:template-skin>`, with only text and CDATA sections in them: `The theme has to have a <b:skin>`, `<b:skin> can only have text and CDATA in it, found a comment`. Formatting puts what is in them in a single CDATA section, as Blogger saves it, the entities of the text decoded
