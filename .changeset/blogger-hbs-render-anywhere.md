---
"blogger-hbs": patch
---

Render anywhere with `blogger-hbs/runtime`: `createRenderer(theme)` sets up a compiled template once and renders it many times, in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, a browser), without the compiler or Node.js. The compiled module exports a `format`, checked by the renderer, and imports nothing
