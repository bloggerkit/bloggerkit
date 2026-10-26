---
"blogger-hbs": patch
---

`blogger-hbs init [dir]` writes a new theme from a starter: templates for the layout and the Blog and Labels widgets, each widget with the includables Blogger would add to it empty, styles, a script, a config, and a `package.json` depending on this version of blogger-hbs, named after the directory or `--name`. It refuses a directory that is not empty but with `--force`, never deletes a file, and prints what to run next with the package manager it is run with
