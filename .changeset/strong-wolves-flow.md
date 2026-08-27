---
"blogger-images": patch
---

refactor: split	`ImageParams` out of `BloggerImage`

Move all param getters/setters into a standalone `ImageParams` base class.
`BloggerImage` now extends `ImageParams` and only handles URL matching
and serialization, keeping param logic reusable.
