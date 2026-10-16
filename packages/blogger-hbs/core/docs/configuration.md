# Configuration

The CLI reads `blogger-hbs.config.ts`, `.mts`, `.js` or `.mjs` from the root, or the file given with `--config`. A relative `root` in it is resolved from the directory of the file.

```ts
// blogger-hbs.config.ts
import { defineConfig } from "blogger-hbs";

export default defineConfig({
  entry: "src/index.hbs",
  alias: { "~": "src" },
  context: { title: "Blog" },
  output: { dir: "dist" },
});
```

The config can be a function of the environment, `({ env, command, envMode, meta: { watch } }) => config`, async too.

## Options

| Option     | Default                  | Description                                                                                              |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `root`     | the directory of the config, the working directory without one | Directory of the theme, the imports starting with `/` are relative to it, the `[root]` of the CLI goes over it |
| `entry`    | `index.hbs`              | The template rendered, relative to the root                                                              |
| `alias`    | `{}`                     | Directories by name, relative to the root, `{ "~": "src" }` for `{{import "~/header.hbs"}}`              |
| `plugins`  | `[]`                     | Compile plugins, see [Plugins](./plugins.md)                                                             |
| `rsbuild`  | `{}`                     | Rsbuild config for the scripts and styles, merged over the defaults, or a function of the defaults returning the config |
| `onWarn`   | the CLI shows them       | Called with the warnings of plugins                                                                      |
| `context`  | `{}`                     | What the templates read, `{{title}}`                                                                     |
| `output`   |                          | See below                                                                                                |
| `publicDir` | `public`, when it exists | Directory whose files are copied as they are into the output, relative to the root, `false` for none   |

The Rsbuild defaults are a production build, minified and without source maps. The entries, the output files and the chunks are set by `blogger-hbs` and can not be changed.

### `output`

| Option     | Default       | Description                                                                         |
| ---------- | ------------- | ----------------------------------------------------------------------------------- |
| `dir`      | `dist`        | Directory of the output, relative to the root                                       |
| `module`   | `compiled.js` | The compiled module, see [Rendering anywhere](./rendering.md), `false` to not write it |
| `template` | `theme.xml`   | The rendered theme, `false` to not render it                                        |
| `clean`    | `true`        | Whether the directory is emptied before the first build                             |
| `validate` | `true`        | Whether the rendered theme is validated, see [Validation and formatting](./validation.md) |
| `format`   | `true`        | Whether the rendered theme is formatted as Blogger saves it, it needs `validate`    |

The output directory is not cleaned when it is the root, the working directory, the directory of the entry or the target of an alias, or holds one of them.

## CLI

```sh
blogger-hbs [root] [options]
```

| Option                | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `-c, --config <file>` | The config file                                           |
| `--entry <file>`      | The entry template, relative to the root                  |
| `-o, --out-dir <dir>` | The output directory, relative to the root                |
| `--context <file>`    | A JSON file with the context, instead of the one of the config |
| `-w, --watch`         | Build again when a file changes, and restart when the config does |
| `--no-clean`          | Keep the files in the output directory                    |
| `--no-validate`       | Do not validate the rendered theme, nor format it         |
| `--no-format`         | Do not format the rendered theme                          |
| `-h, --help`          | All the options                                           |
| `-v, --version`       | The version                                               |

The options of the CLI go over those of the config. The templates and the partials of plugins are validated when compiling either way, `--no-validate` is about the rendered theme only.
