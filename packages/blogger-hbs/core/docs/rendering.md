# Rendering anywhere

The build writes `dist/compiled.js`, an ES module that imports nothing: the templates, scripts, styles and the runtimes of the plugins are all in it. `blogger-hbs/runtime` renders it in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, a browser) without the compiler or Node.js.

```ts
// a Cloudflare Worker
import { createRenderer } from "blogger-hbs/runtime";
import * as theme from "./dist/compiled.js";

// set up once, render many times, each render on its own
const renderer = createRenderer(theme);

export default {
  async fetch() {
    // the XML of the theme, as Blogger reads it
    const xml = await renderer.render({ title: "Blog" });
    return new Response(xml, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  },
};
```

`createRenderer(theme, { plugins })` takes runtime plugins of the host rendering the theme, for example with data of the request in `prepare`. The helpers of the theme itself are in `compiled.js`, see [Helpers of the theme](./helpers.md#helpers-of-the-theme). `processXml` is in `blogger-hbs/runtime` as well. A compiled module is rendered by the version of `blogger-hbs` it is compiled with, `createRenderer` checks it.
