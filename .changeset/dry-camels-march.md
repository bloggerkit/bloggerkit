---
"blogger-images": patch
---

Prevent long regex literals by constructing the pattern from a `Set` of allowed values instead. This improves readability and maintainability while avoiding oversized regex definitions.

Also fix hostname matching logic to ensure hostnames are validated against the intended pattern and do not incorrectly match partial or invalid hostnames.
