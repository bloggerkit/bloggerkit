---
"blogger-hbs": patch
---

Rendering does less work for every import: the newlines of CDATA sections are protected only where an import indents, imports are indented and the newlines restored in one pass each, and the output mode of a script or a style is read once
