---
"blogger-hbs": patch
---

`<b:elseif>` and `<b:else>` are only in a `<b:if>`, and `<b:case>` and `<b:default>` only in a `<b:switch>`, `<b:case>` not after `<b:default>`: `<b:else> can only be in a <b:if>, it is in <div>`, `<b:case> can not come after the <b:default> of its <b:switch>`. A branch after the `<b:else>` or `<b:default>` that ends it is a warning, as Blogger never renders it. `<b:message>` has only `<b:param>` in it, and `<b:param>` is only in a `<b:message>`. `<b:include>` has to be empty; what is in `<b:attr>`, `<b:class>`, `<b:eval>`, `<b:elseif>`, `<b:else>`, `<b:case>`, `<b:default>` and `<b:param>` is a warning, as Blogger does not render it: `Blogger does not render what is in <b:else>, write it after <b:else/>`
