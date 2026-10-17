---
"blogger-hbs": patch
---

Accept only the widget types Blogger has in `type` of `<b:widget>`, `Unknown widget type 'Html', did you mean 'HTML'?`, and an `id` that is the type and a number, `HTML1`. Blogger reads `id` and `type` of `<b:widget>`, `id` of `<b:includable>` and `var` and `index` of `<b:loop>` when saving, `expr:name` of these is not used, with a warning
