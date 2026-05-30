# blogger-images

Utilities for detecting and transforming Blogger-hosted image URLs (`googleusercontent.com` / `bp.blogspot.com`).

This tiny, dependency-free package parses common Blogger image parameters and provides a fluent API
for resizing, cropping, changing formats, and other built-in transformations supported by
Google-hosted images.

## Features

- Parse existing Blogger / Google image parameters
- Resize by width, height, or size; control cropping and padding
- Convert image format to `jpeg`, `png`, `webp`, `gif`, `mp4` and more
- Flip, rotate, round corners, set borders and background colors
- Optionally preserve unsupported URLs (`passThrough` mode) instead of throwing
- Works in Node and browser environments (pure TypeScript)

## Installation

Install with your preferred package manager:

```bash
npm install blogger-images
```

```bash
yarn add blogger-images
```

```bash
pnpm add blogger-images
```

## Quick Start

```ts
import { BloggerImage } from "blogger-images";

const img = new BloggerImage(
  "https://1.bp.blogspot.com/path/to/image/s72-c/image.jpg",
);

// resize and convert to webp
const url = img.width(400).height(300).webp(true).url();
console.log(url);
```

## API

### `new BloggerImage(url, options?)`

Create an image helper for a Blogger-hosted image URL.

- `url: string | URL` — image URL
- `options?: { existing?: boolean; passThrough?: boolean }`
  - `existing` (default: `true`) — keep existing params when parsing
  - `passThrough` (default: `false`) — return original URL for unsupported hosts instead of throwing

### Common methods

- `isSupported()` — returns `true` if the URL is a supported Blogger / Google image
- `width(n)` / `height(n)` / `size(n)` — set numeric dimensions
- `crop()` / `circularCrop()` / `squareCrop()` — crop helpers
- `jpeg(true)` / `png(true)` / `webp(true)` — request output format
- `flipHorizontally()` / `flipVertically()` / `rotate(90|180|270)` — transforms
- `color('0xrrggbb')` / `backgroundColor('0xrrggbb')` / `pad()` — styling helpers
- `url()` — build the transformed image URL

For a full list of available methods and semantics, see the exported `BloggerImage` class.
