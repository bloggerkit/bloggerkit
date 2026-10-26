---
"blogger-expr": patch
---

The keys of a map literal that Blogger reads differently than they look are warned about: a key written twice, of which the last value is read, ``The key `a` is in the map twice: the last value, `2`, is the one read``, a quoted key, which keeps its quotes in its name, so `{ "x": 1 }.x` reads nothing, ``Fix: write it unquoted: x``, and a quoted key with characters a name can not have, `{ "a b": 1 }`, only read as `."a b"`
