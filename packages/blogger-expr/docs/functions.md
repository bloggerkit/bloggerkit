# Functions

These are the functions of Blogger. No other function can be called.

| Function                            | Infix | Gives                                                                   |
| ----------------------------------- | ----- | ----------------------------------------------------------------------- |
| `path(url, path)`                   | yes   | `url` with its path replaced, its query and fragment kept               |
| `appendParams(url, params)`         | yes   | `url` with `params` added to its query                                  |
| `params(url, params)`               | yes   | `url` with its query replaced by `params`                               |
| `fragment(url, name)`               | yes   | `url` with its `#fragment` replaced, removed for `""`                   |
| `snippet(text, options?)`           | yes   | an excerpt of `text`, see below                                         |
| `format(date, pattern)`             | yes   | a date written with a pattern, see below                                |
| `resizeImage(image, width, ratio?)` | no    | an image of Blogger at `width`, cropped to `ratio`, `"16:9"`, see below |
| `sourceSet(image, widths, ratio?)`  | no    | a `srcset` of the image at each of `widths`                             |

An infix function can also be written between its two arguments: `data:url path "search"` is `path(data:url, "search")`.

```
path(data:blog.homepageUrl.canonical, "search")            https://example.blogspot.com/search
appendParams("https://a.com/?x=1#h", { y: 2 })             https://a.com/?x=1&y=2#h
params("https://a.com/?x=1", { y: 2 })                     https://a.com/?y=2
fragment(data:post.url, "comments")                        https://example.blogspot.com/a.html#comments
resizeImage(data:post.featuredImage, 640, "16:9")          https://blogger.googleusercontent.com/img/b/.../w640-h360-p-k-no-nu/a.jpg
sourceSet(data:post.featuredImage, [400, 800], "1:1")      .../w400-h400-p-k-no-nu/a.jpg 400w, .../w800-h800-p-k-no-nu/a.jpg 800w
```

`resizeImage` and `sourceSet` only change images hosted by Blogger, on `blogger.googleusercontent.com` or `bp.blogspot.com`. Any other URL is returned unchanged.

## Arguments, when parsing

When parsing, the number of arguments is checked, and so is the type of every argument written as a literal, a negative number included. The value of a `data:` path is only known when evaluating, so it is checked then:

| Argument                                                   | Has to be                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `url`, `path`, `name`, `image`, `pattern`, `ratio`, `text` | a string                                                                                     |
| `params`, `options`                                        | a map                                                                                        |
| `width`                                                    | an integer of 0 or more, a number or a string of digits only: `640` or `"640"`, not `" 640"` |
| `widths`                                                   | a list of widths                                                                             |
| `date`                                                     | anything                                                                                     |

```
resizeImage(data:image, "wide")     resizeImage(): argument 2 must be an integer of 0 or more, a number or a string of digits only, 640 or "640"
sourceSet(data:image, [400, "x"])   sourceSet(): item 2 of argument 2 must be an integer of 0 or more, a number or a string of digits only, 640 or "640"
path("https://example.com")         path() expects 2 argument(s), got 1
```

## `resizeImage`

`resizeImage(image, width, ratio?)` sets the width of an image hosted by Blogger, and crops it to `ratio` when Blogger supports it. The width is an integer of 0 or more, `640` or `"640"`:

| Ratio                                        | URL                                    | `.height` |
| -------------------------------------------- | -------------------------------------- | --------- |
| none                                         | `.../w640/a.jpg`                       | `null`    |
| as wide as tall, or wider: `"16:9"`, `"1:1"` | `.../w640-h360-p-k-no-nu/a.jpg`        | `360`     |
| taller than wide: `"9:16"`                   | `.../w640/a.jpg`, the ratio is ignored | `null`    |

A ratio is two positive integers, with spaces allowed around them: `" 16 : 9 "`. Anything else, `"wide"`, `"1:0"` or `"1.5:1"`, is an error, as Blogger does not render it.

The result is an image, see [Evaluation](./evaluation.md#images-urls-and-widgets): it is the URL, with `.isResizable`, `.width` and `.height`. An image not hosted by Blogger is returned unchanged, with `.isResizable` false and no size.

`sourceSet` resizes the image to each of its widths the same way, and an error names the item: `item 2 of argument 2`. An empty list gives an empty string.

## `snippet`

`snippet` makes a plain-text excerpt of HTML, with its tags removed:

| Option       | Default | Is                                                                                     |
| ------------ | ------- | -------------------------------------------------------------------------------------- |
| `length`     | `150`   | at most this many characters, cut at the end of a word                                 |
| `ellipsis`   | `true`  | `...` after it when it is cut                                                          |
| `links`      | `true`  | `<a>` tags kept, `false` keeps only their text                                         |
| `linebreaks` | `true`  | line breaks, `<br>` and the end of a paragraph, as `<br/>`, `false` makes them a space |

```
snippet(data:post.body, { length: 100, links: false })
data:post.body snippet { length: 100 }
```

## `format`

`format` writes a date in UTC, using the pattern letters of Blogger, which are those of Java. The date can be an ISO string, a timestamp in milliseconds or a `Date`:

| Letters                    | Are                                    |
| -------------------------- | -------------------------------------- |
| `yyyy`, `yy`, `YYYY`, `YY` | the year, `2026`, `26`                 |
| `MMMM`, `MMM`, `MM`, `M`   | the month, `January`, `Jan`, `01`, `1` |
| `dd`, `d`                  | the day of the month, `05`, `5`        |
| `EEEE`, `EEE`              | the day of the week, `Monday`, `Mon`   |
| `HH`, `H`, `hh`, `h`       | the hour, 24 or 12 hours, `09`, `9`    |
| `mm`, `m`, `ss`, `s`       | the minutes and seconds                |
| `a`                        | `AM` or `PM`                           |

Text in single quotes is written as it is, and `''` writes a single quote:

```
format(data:post.date, "MMMM d, yyyy 'at' h:mm a")    January 5, 2026 at 10:20 AM
```
