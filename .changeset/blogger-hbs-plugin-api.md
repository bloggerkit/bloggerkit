---
"blogger-hbs": patch
---

Give compile plugins more control: a plugin context as the last argument of every hook (`root`, `entry`, `mode`, `watch`, `resolve`, `addWatchFile`, `warn`, `error` with a location), every place a partial is used with its hash (`requests`), `buildStart` and `buildEnd`, `enforce: 'pre' | 'post'`, and a `runtime` half bundled into the compiled module (the runtimes of all the plugins together, sharing the modules they import) with helpers, an async `prepare` adding data before every render and `transform` for the output. The helpers of a theme come from the `runtime` of a plugin, `plugins: [{ name: 'theme', runtime: { entry: './src/runtime.ts' } }]`, and the host rendering a theme can add runtime plugins with `createRenderer(theme, { plugins })`
