# @blogger-hbs/plugin-lucide

[Lucide](https://lucide.dev) icons for [blogger-hbs](../core) themes.

> [!WARNING]
> `@blogger-hbs/plugin-lucide` is experimental, like `blogger-hbs`. Its API, options and output can change in any release.

- Icons are partials, `{{> lucide.house}}`, rendered by a single `<b:includable>` that only contains the icons used.
- Unknown icon names fail the build with where they are used and the closest name.

## Usage

```sh
pnpm add -D blogger-hbs @blogger-hbs/plugin-lucide
```

```ts
// blogger-hbs.config.ts
import { compilePluginLucide } from '@blogger-hbs/plugin-lucide';
import { defineConfig } from 'blogger-hbs';

export default defineConfig({
	entry: 'src/index.hbs',
	plugins: [compilePluginLucide()],
});
```

Add the includable once to the theme, then use the icons anywhere:

```hbs
{{> lucide.includable}}

{{> lucide.house}}
{{> lucide.menu size=16 class="icon"}}
```

Each icon becomes `<b:include data='{ name: "menu", size: "16", class: "icon" }' name='@lucide'/>`. The props are `size`, `stroke`, `strokeWidth` and `class`.

## Options

| Option        | Default          | Description                                                                          |
| ------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `id`          | `'@lucide'`      | Id of the includable rendering the icons.                                            |
| `fallback`    | `'circle-slash'` | Icon rendered for a name the includable does not know, `false` for an empty icon.    |
| `size`        | `24`             | Default width and height.                                                            |
| `stroke`      | `'currentColor'` | Default stroke color.                                                                |
| `strokeWidth` | `2`              | Default stroke width.                                                                |
