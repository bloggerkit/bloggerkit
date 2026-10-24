---
"blogger-expr": patch
---

`contains` and `in` with a string no longer warn that the data searched may not be text: the data can be a list, and the fix it gave, `(data:list + "")`, broke a search in a list
