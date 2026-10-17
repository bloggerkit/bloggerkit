# blogger-hbs

Build Blogger themes from Handlebars templates, with bundled scripts and styles.

> [!WARNING]
> `blogger-hbs` is experimental. Its API, options and output can change in any release, without a major version bump, and it can have bugs. Pin an exact version and check the output before relying on it.

- Split a theme into templates with `{{import "./header.hbs"}}`, data with `{{import "./data.json"}}`.
- Import scripts and styles, bundled with [Rsbuild](https://rsbuild.rs) and inlined: `{{import "./main.ts"}}`.
- Every template is validated as XML, and the rendered theme is validated and formatted as Blogger saves it.
- Plugins provide partials, data and helpers, bundled into the theme.
- The compiled theme renders in any JavaScript runtime, a Cloudflare Worker too, with `blogger-hbs/runtime`.

## Usage

```sh
pnpm add -D blogger-hbs
```

```ts
// blogger-hbs.config.ts
import { defineConfig } from "blogger-hbs";

export default defineConfig({
  entry: "src/index.hbs",
  alias: { "~": "src" },
  context: {},
});
```

```sh
blogger-hbs                              # build to dist/theme.xml
blogger-hbs --watch                      # build again on changes
blogger-hbs validate theme.xml           # validate a theme
blogger-hbs format theme.xml -o out.xml  # format it
blogger-hbs --help                       # all the options
```

The same is available from JavaScript with `compileTemplate`, `watchTemplate` and `renderTemplate`.

## Documentation

- [Configuration](./docs/configuration.md): the options of the config and of the CLI.
- [Templates](./docs/templates.md): importing templates, data, scripts and styles.
- [Helpers](./docs/helpers.md): the built-in helpers and those of a theme.
- [Plugins](./docs/plugins.md): partials, data, hooks and runtimes of plugins.
- [Validation and formatting](./docs/validation.md): what is checked, and how the theme is written.
- [Rendering anywhere](./docs/rendering.md): `blogger-hbs/runtime` and `createRenderer`.
- [JavaScript API](./docs/api.md): `compileTemplate`, `watchTemplate` and the others.
- [Errors](./docs/errors.md): what errors say and how to throw them.
