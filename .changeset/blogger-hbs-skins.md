---
"blogger-hbs": patch
---

A theme has one `<b:skin>`, with only text and CDATA sections in it, and `<b:template-skin>` only with `b:layoutsVersion` on `<html>`, where a comment is kept as Blogger keeps it: `The theme has to have a <b:skin>`, `<b:skin> can only have text and CDATA in it, found a comment`. Formatting puts what is in them in a single CDATA section, as Blogger saves it, the entities of the text decoded
