---
"blogger-hbs": patch
---

`<b:elseif>` and `<b:else>` are only in a `<b:if>`, with at most one `<b:else>`, after every `<b:elseif>`, and `<b:case>` and `<b:default>` only in a `<b:switch>`, with at most one `<b:default>`, after every `<b:case>`: `<b:else> can only be in a <b:if>, it is in <div>`, `<b:case> can not come after the <b:default> of its <b:switch>`. `<b:message>` has only `<b:param>` in it, and `<b:param>` is only in a `<b:message>`. `<b:attr>`, `<b:class>`, `<b:eval>`, `<b:elseif>`, `<b:else>`, `<b:case>`, `<b:default>`, `<b:include>` and `<b:param>` have to be empty: `<b:else> has to be empty, as <b:else/>`
