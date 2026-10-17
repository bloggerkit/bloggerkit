---
"blogger-hbs": patch
---

Check the layout of the rendered theme as Blogger does: the root element is `<html>` with only the `b:` attributes Blogger knows, `b:css`, `b:js` and `b:responsive` `'true'` or `'false'`, `b:defaultwidgetversion` `'1'` or `'2'`, `b:layoutsVersion` `'2'` or `'3'`, `b:templateUrl` and `b:templateVersion`, `<b:widget>` only in a `<b:section>`, with at most one `<b:widget-settings>` and `<b:includable>`s, `<b:widget-setting>` only in a `<b:widget-settings>`, only the `b:` elements Blogger knows, `Unknown element <b:includeable>, did you mean <b:includable>?`, and their attributes, `<b:loop>` with `values` and `var` and maybe `index`, each also as `expr:name`, with the line and column of what is wrong. An attribute written both as `x` and `expr:x` is a warning, Blogger uses `expr:x`
