# %THEME_NAME%

A Blogger theme built with [blogger-hbs](https://www.npmjs.com/package/blogger-hbs).

```sh
npm run build   # dist/theme.xml, the theme to upload to Blogger
npm run watch   # build again when a file changes
```

Upload `dist/theme.xml` in Blogger: **Theme**, the menu next to **Customize**, **Restore**.

## Files

- `src/index.hbs` is the theme. It imports its parts with `{{import "~/layout/header.hbs"}}`, `~` being `src`, as set in `blogger-hbs.config.ts`.
- `src/data/site.json` holds the links of the footer, read with `{{#with (import "~/data/site.json")}}`. `context` in the config gives `{{theme.name}}` and `{{theme.version}}`, written in `b:templateVersion`.
- `src/styles/main.css` is bundled into `<b:skin>`, `src/scripts/main.ts` into a `<script defer>`.
- `src/widgets` has the Blog and Labels widgets.

Every template is checked as Blogger reads it when building, and the theme is written formatted as Blogger saves it.
