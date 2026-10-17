---
"blogger-hbs": patch
---

`processXml(xml, { path, format })` validates a theme, formats it with `format`, and returns it with its `warnings`, `{ message, loc }` in the output, and `info`, what it is made of: the `b:` attributes of `<html>`, its sections, its widgets with their section, and its scripts and styles with the bytes in them. Every error is reported at once, in `XmlError.errors`, with a syntax error stopping the scan. The CLI lists them under `Caused by`, and shows the scripts, styles, sections and widgets of the theme from `info`
