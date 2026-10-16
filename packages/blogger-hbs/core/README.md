# blogger-hbs

Build Blogger themes from Handlebars templates, with bundled scripts and styles.

> [!WARNING]
> `blogger-hbs` is experimental. Its API, options and output can change in any release, without a major version bump, and it can have bugs. Pin an exact version and check the output before relying on it.

- Split a theme into templates with `{{import "./header.hbs"}}`, data with `{{import "./data.json"}}`.
- Import scripts and styles, bundled with [Rsbuild](https://rsbuild.rs) and inlined: `{{import "./main.ts"}}`.
- Every template is validated as XML, and the rendered theme is validated and formatted as Blogger saves it.
- Compile plugins provide partials and data, runtime plugins provide helpers.

## Usage

```sh
pnpm add -D blogger-hbs
```

```ts
// blogger-hbs.config.ts
import { defineConfig } from 'blogger-hbs';

export default defineConfig({
	entry: 'src/index.hbs',
	alias: { '~': 'src' },
	context: {},
});
```

```sh
blogger-hbs          # build to dist/theme.xml
blogger-hbs --watch  # build again on changes
blogger-hbs --help   # all the options
```

The same is available from JavaScript with `compileTemplate`, `watchTemplate` and `renderTemplate`.
