# Blogger Kit docs

The documentation of Blogger Kit, live at https://blogger.fineshop.app. Every page is an MDX file in `src/content/docs`.

The site is `apps/docs` in the Blogger Kit monorepo. Install from the repository root with `pnpm install`, then in `apps/docs`:

```sh
pnpm dev                                        # http://localhost:4321
pnpm check && pnpm typecheck && pnpm build      # before you push
pnpm run deploy                                 # build and deploy to Cloudflare
```

## Sections

Every folder of `src/content/docs` with `section: true` in its `meta.ts` is a section, with its own sidebar and a card on the home page. `theme-xml` documents Blogger itself and never mentions a package. Package sections link to it instead of explaining Blogger again.

### Adding a package

1. Create `src/content/docs/<package>/meta.ts`:

   ```ts
   import { defineMeta } from '@/lib/content/meta';

   export default defineMeta({
   	title: 'blogger-expr',
   	description: 'Parse, evaluate and print Blogger expressions.',
   	icon: 'Braces',
   	section: true,
   	pages: ['index', 'getting-started', '---Guides---', '...'],
   });
   ```

   `pages` sets the sidebar order: `---Title---` starts a group, `...` is every page not listed. `icon` is a [Lucide](https://lucide.dev/icons) name. Every subfolder also needs a `meta.ts` with a `title` and a one-sentence `description`.

2. Add `index.mdx` (what the package is for) and `getting-started.mdx` (installing it and using it once). Then add guides by task, then reference pages (API, options, errors).
3. Add the folder to `pages` in `src/content/docs/meta.ts`.

## Adding a page

1. Create the file in the folder of its topic: `src/content/docs/theme-xml/tags/my-page.mdx` is served at `/docs/theme-xml/tags/my-page`.
2. Add the frontmatter (see below).
3. List the page in `pages` of the folder's `meta.ts`. A page missing from the sidebar fails the build.
4. When you later change the facts or examples of a page, set its `updated` to that day.

```mdx
---
title: b:loop
description: Repeat markup for every item of a list or a range of numbers.
published: 2026-10-26
authors:
  - kumardeo
level: beginner
---
```

| Field           | Required | Notes                                                                                                                  |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `title`         | yes      |                                                                                                                        |
| `description`   | no       | Strongly recommended. 160 characters at most. Shown under the title, in search results and in shares                   |
| `published`     | yes      | The day the page goes live: `2026-10-26`, or `2026-10-26T14:30:00+05:30`                                               |
| `updated`       | no       | When the facts or examples change, not for typos. Must be later than `published`                                       |
| `authors`       | no       | GitHub usernames, or `{ name, github, url }` objects, see below. Add yourself when you write or largely rewrite a page |
| `level`         | no       | `beginner`, `intermediate` or `advanced`                                                                               |
| `prerequisites` | no       | Slugs of pages to read first, `theme-xml/tags/loops`                                                                   |
| `icon`          | no       | A Lucide name, for pages at the top of a section's sidebar                                                             |

An author needs a `name`, a `github` username, or both. The GitHub username gives the photo, and the name when `name` is left out. The name links to `url`, or to the GitHub profile without one:

```yaml
authors:
  - janedoe
  - name: Jane Doe
    github: janedoe
    url: https://janedoe.dev
```

## Writing style

- **Code.** Fence with the language, and a title when the file matters. Use `xml` for Blogger themes, `handlebars` for `.hbs`, `ts` for config and code, `sh` for commands.
- **Attributes and options.** Use a table with `Attribute`, `Required`, `Value`, `Default` and `Description`, or `<TypeTable>`. Give an attribute its own `###` section when there is more than a line to say.
- **Examples.** Prefer markup that works in Blogger as it is. Show the rendered HTML next to the template when it helps.
- **Errors.** Quote the message exactly as the tool prints it, in a `txt` block.
- **Links.** Use relative file paths: `[b:include](./includables.mdx#binclude)`. A broken link fails the build.
- **Callouts.** `<Callout type="warn">` for what breaks a theme, `<Callout>` for notes.

## Facts about Blogger

Blogger has no specification of its theme language. Mark where every attribute, value and data field comes from, with `<BloggerSource>`. `<BloggerSourceLegend />` lists the kinds:

| Source                                | Meaning                                                               |
| ------------------------------------- | --------------------------------------------------------------------- |
| `<BloggerSource kind="official" />`   | Documented by Google, in the Blogger Help Center or the Blogger blogs |
| `<BloggerSource kind="observed" />`   | Not documented by Google, known from developing and testing themes    |
| `<BloggerSource kind="deprecated" />` | Documented once, no longer used by Blogger                            |

When sources disagree, say so and name them. Check examples from the Blogger Help Center before you copy them: several have typos.

## Code blocks

Options go on the fence line, after the language:

| Option          | Example                      | Effect                                                          |
| --------------- | ---------------------------- | --------------------------------------------------------------- |
| `title="…"`     | ` ```xml title="theme.xml" ` | A title above the block                                         |
| `{lines}`       | ` ```xml {2,4-6} `           | Highlights those lines                                          |
| `/word/`        | ` ```xml /data:post/ `       | Highlights every match of the word                              |
| `icon="…"`      | ` ```xml icon="blogger" `    | A [Simple Icons](https://simpleicons.org) slug or a Lucide name |
| `lineNumbers=N` | ` ```xml lineNumbers=10 `    | Numbers the lines from `N`                                      |
| `noLineNumbers` | ` ```xml noLineNumbers `     | Starts without line numbers                                     |
| `wrap`          | ` ```xml wrap `              | Starts with the lines wrapped                                   |

Notations go in a comment at the end of a line, or alone on the line before it. They are removed from the page and from copied code:

| Notation                           | Effect                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `[!code ++]`, `[!code --]`         | A line added or removed. Copying leaves removed lines out                     |
| `[!code add]`, `[!code remove]`    | The same, for XML and HTML, whose comments can't contain `--`                 |
| `[!code highlight]`                | Highlights the line. `[!code highlight:3]` includes the next 2                |
| `[!code focus]`                    | Blurs the other lines until the block is hovered                              |
| `[!code error]`, `[!code warning]` | Marks the line in red or orange                                               |
| `[!code word:text]`                | Highlights `text` in the following lines. `[!code word:text:2]` in the next 2 |

```xml
<b:loop values='data:posts' var='post'>
  <h2><data:post.title/></h2> <!-- [!code remove] -->
  <h2><a expr:href='data:post.url'><data:post.title/></a></h2> <!-- [!code add] -->
</b:loop>
```

Write `[\!code …]` to show a notation as text.

## Components

You can use these in every page without importing them:

| Component                                  | Use                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `<Callout type title>`                     | A note. `type`: `info`, `warn`, `error`, `success`, `idea`                  |
| `<Tabs>`, `<Tab>`                          | Tabbed content                                                              |
| `<CodeTabs>`                               | Code blocks in one frame, a tab for each, named by `title` or language      |
| `<Steps>`, `<Step>`                        | Numbered steps                                                              |
| `<Cards>`, `<Card>`                        | Linked cards                                                                |
| `<Accordions>`, `<Accordion>`              | Collapsible sections                                                        |
| `<Files>`, `<Folder>`, `<File>`            | A file tree                                                                 |
| `<TypeTable>`                              | A table of options or attributes                                            |
| `<BloggerSource>`, `<BloggerSourceLegend>` | Where a fact about Blogger comes from (see above)                           |
| `<CodeBlock>`                              | A code block from a string: `<CodeBlock code={'…'} lang="xml" title="…" />` |

`<Tabs>` and `<CodeTabs>` with the same `syncKey` keep the same tab selected on every page:

````mdx
<CodeTabs syncKey="theme-part">

```xml title="theme.xml"
<b:skin><![CDATA[ body { margin: 0; } ]]></b:skin>
```

```css title="style.css"
body {
  margin: 0;
}
```

</CodeTabs>
````

## License

Copyright (c) 2026-present [Deo Kumar](https://github.com/kumardeo) ([Fineshop Design](https://fineshopdesign.com)) and [Blogger Kit contributors](https://github.com/bloggerkit/bloggerkit).

- The text of the docs, the pages in `src/content/docs` and the files made from them, is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): you may share and adapt it, with credit to Blogger Kit and a link.
- The code examples in the docs and the source of the site are under the MIT License.

By contributing, you license your text under CC BY 4.0 and your code under the MIT License. See [LICENSE.md](./LICENSE.md).
