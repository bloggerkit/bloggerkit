---
"blogger-expr": patch
---

`RichValue`, `imageValue` and `urlValue` for Blogger's images, URLs and widgets: a string or a list with properties, read after the built-in ones, `.length`, `.first` and `.last`. An image has `.isResizable`, `.width` and `.height`, a URL `.canonical`, `.http` and `.https`.

`resizeImage` and `sourceSet` resize as Blogger does: `w640` without a ratio, a ratio of two positive integers at least as wide as tall, `"16:9"`, a taller one ignored, and a width that is an integer of 0 or more, as a number or a string of digits only. An error names the bad item of a list of widths, and `resizeImage` returns an image
