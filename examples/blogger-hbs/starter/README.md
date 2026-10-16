# blogger-hbs starter

A small Blogger theme built with [blogger-hbs](../../../packages/blogger-hbs/core): a header with navigation, a grid of posts, a sidebar with labels and a footer.

```sh
pnpm build   # dist/theme.xml, to upload to Blogger, and dist/compiled.js
pnpm dev     # build again on changes
pnpm render  # render dist/compiled.js with blogger-hbs/runtime only
```

## What it shows

- **Templates split into files**: `src/index.hbs` imports the parts with `{{import "~/layout/header.hbs"}}`, `~` being an alias of `src` in `blogger-hbs.config.ts`.
- **Data**: `src/data/site.json` is imported for the navigation, `{{#with (import "~/data/site.json")}}`, and `context` in the config gives `{{theme.name}}` and `{{theme.version}}`.
- **Styles and scripts**: `src/styles/main.css` is bundled into `<b:skin>` with `style:raw=true`, `src/scripts/main.ts` into a `<script defer>`.
- **Icons**: [`@blogger-hbs/plugin-lucide`](../../../packages/blogger-hbs/plugin-lucide) renders `{{> lucide.menu}}` and the others. Its includable is in `<b:defaultmarkup type='Common'>`, so the icons can be used anywhere, in widgets and outside them.
- **Widgets**: `src/widgets` has the Blog and Labels widgets, Blogger markup with Handlebars where needed.
- **Rendering anywhere**: `render.mjs` renders `dist/compiled.js` with another context, the way a Cloudflare Worker would.

Every template is validated as XML and its Blogger expressions are checked when compiling, the rendered theme is formatted as Blogger saves it.
