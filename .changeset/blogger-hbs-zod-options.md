---
"blogger-hbs": patch
---

Validate the config, the compile and watch options and what plugin hooks return with zod, with the same messages as before, `Invalid 'runtime.options.list[1]' of plugin 'p', ...` pointing at the value inside the options. `blogger-hbs/runtime` does not depend on zod
