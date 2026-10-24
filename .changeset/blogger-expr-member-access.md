---
"blogger-expr": patch
---

A member read is checked as Blogger reads it: a space after its dot is an error, `data:blog . title` and `data:blog. title`, as Blogger refuses it, and what Blogger reads but is not written plainly is a warning with how it reads, empty segments and dots at the end, `data:blog..title` and `data:blog.title.`, and a space before the dot of a single value, `data:blog .title`: ``Fix: write it as it reads: data:blog.title``. A key of a map can start and end with a dash, and have two, `{ -c: 1, c-: 2, a--b: 3 }`, as Blogger reads them
