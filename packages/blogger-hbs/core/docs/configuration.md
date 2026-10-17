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

| Option      | Default                                                        | Description                                                                                                             |
| ----------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `root`      | the directory of the config, the working directory without one | Directory of the theme, the imports starting with `/` are relative to it, the `[root]` of the CLI goes over it          |
| `entry`     | `index.hbs`                                                    | The template rendered, relative to the root                                                                             |
| `alias`     | `{}`                                                           | Directories by name, relative to the root, `{ "~": "src" }` for `{{import "~/header.hbs"}}`                             |
| `plugins`   | `[]`                                                           | Compile plugins, see [Plugins](./plugins.md)                                                                            |
| `rsbuild`   | `{}`                                                           | Rsbuild config for the scripts and styles, merged over the defaults, or a function of the defaults returning the config |
| `onWarn`    | the CLI shows them                                             | Called with the warnings of plugins                                                                                     |
| `context`   | `{}`                                                           | What the templates read, `{{title}}`                                                                                    |
| `output`    |                                                                | See below                                                                                                               |
| `publicDir` | `public`, when it exists                                       | Directory whose files are copied as they are into the output, relative to the root, `false` for none                    |

The Rsbuild defaults are a production build, minified and without source maps. The entries, the output files and the chunks are set by `blogger-hbs` and can not be changed.

### `output`

| Option     | Default       | Description                                                                               |
| ---------- | ------------- | ----------------------------------------------------------------------------------------- |
| `dir`      | `dist`        | Directory of the output, relative to the root                                             |
| `module`   | `compiled.js` | The compiled module, see [Rendering anywhere](./rendering.md), `false` to not write it    |
| `template` | `theme.xml`   | The rendered theme, `false` to not render it                                              |
| `clean`    | `true`        | Whether the directory is emptied before the first build                                   |
| `validate` | `true`        | Whether the rendered theme is validated, see [Validation and formatting](./validation.md) |
| `format`   | `true`        | Whether the rendered theme is formatted as Blogger saves it, it needs `validate`          |

The output directory is not cleaned when it is the root, the working directory, the directory of the entry or the target of an alias, or holds one of them.

## CLI

```sh
blogger-hbs [root] [options]       # build
blogger-hbs validate <file>        # validate a theme, see below
blogger-hbs format <file> [-o]     # format a theme, see below
```

| Option                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `-c, --config <file>` | The config file                                                    |
| `--entry <file>`      | The entry template, relative to the root                           |
| `-o, --out-dir <dir>` | The output directory, relative to the root                         |
| `--context <file>`    | A JSON file with the context, instead of the one of the config     |
| `-w, --watch`         | Build again when a file changes, and restart when the config does  |
| `--no-clean`          | Keep the files in the output directory                             |
| `--no-validate`       | Do not validate the rendered theme, nor format it                  |
| `--no-format`         | Do not format the rendered theme                                   |
| `-h, --help`          | All the options                                                    |
| `-v, --version`       | The version, the copyright, the license and the URL of the project |

The CLI shows its name and version first, `blogger-hbs v0.0.4`. After a build, it shows the files written, their size and gzipped size, and what the theme is made of: its scripts and styles, the bytes of each in the theme, a script or a style imported twice counting twice, the rest as markup, adding up to its size, and its templates, partials of plugins, sections and widgets. When watching, each rebuild starts with a line of its time and the file changed, `─── 14:32:05 · src/layout/header.hbs ───`, and shows the files written and what the theme is made of, each count and size followed by its change since the last build.

```

  blogger-hbs v0.0.4
────────────────────
✓ Compiled in 180ms
✓ Rendered in 4ms
✓ Formatted in 7ms

  Written               Size     Gzip
  dist/theme.xml     82.4 kB  18.1 kB  +1.2 kB
  dist/compiled.js  120.3 kB  25.0 kB

  In dist/theme.xml  Count     Size
  Scripts                3  41.2 kB
  Styles                 2   9.8 kB
  Markup                    31.4 kB
  Templates             12
  Plugin partials        8
  Sections               2
  Widgets                5

✓ Built in 191ms
```

Sizes are in kB of 1000 bytes.

The options of the CLI go over those of the config. The templates and the partials of plugins are validated when compiling either way, `--no-validate` is about the rendered theme only.

### Validating and formatting a theme

`validate` and `format` check an XML theme the way a build checks the rendered one, see [Validation and formatting](./validation.md):

```sh
blogger-hbs validate theme.xml                          # its warnings, or its errors
blogger-hbs format theme.xml                            # formatted, on stdout
blogger-hbs format theme.xml -o theme.formatted.xml     # formatted, written to the file
blogger-hbs format theme.xml -o theme.xml               # formatted in place
blogger-hbs validate theme.xml --json                   # the result as JSON
```

| Option             | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `-o, --out <file>` | `format`: write the formatted theme to this file, not stdout |
| `--json`           | Print the result as JSON, alone on stdout, see below         |

With the theme on stdout, only the warnings and the errors are printed besides it, on stderr. Nothing is written when the theme is not valid, and the command fails:

```
✗ theme.xml is not valid XML
  Caused by: Unknown element <b:foo> (theme.xml:3:7)
```

With `--json`, stdout has a single JSON object and nothing else. A valid theme has its `warnings` and its `info`, as [`processXml`](./validation.md#from-javascript) returns them, and, when formatted, the theme in `xml`, or the file it is written to in `written` with `--out`:

```json
{
  "valid": true,
  "warnings": [
    {
      "message": "<b:if> has the attribute 'rel', Blogger only reads 'cond'",
      "loc": { "path": "theme.xml", "line": 3794, "column": 71 }
    }
  ],
  "info": { "root": { "b:layoutsVersion": "3" }, "sections": [], "widgets": [] }
}
```

An invalid theme has every error, with its place, and the command fails. So does a theme that can not be read, its error without a place:

```json
{
  "valid": false,
  "errors": [
    {
      "message": "Unknown element <b:foo>",
      "loc": { "path": "theme.xml", "line": 3, "column": 7 }
    }
  ]
}
```
