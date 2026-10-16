---
"blogger-hbs": patch
---

The CLI shows its name and version first, then after a build the size of the files it writes, gzipped too, and what the theme is made of: the size of its scripts, styles and markup, adding up to its size, and its templates, plugin partials, sections and widgets. When watching, each rebuild starts with a line of its time and the file changed, and shows the files written and what the theme is made of, each count and size followed by its change since the last build. `watchTemplate` gives `onStart` the files changed
