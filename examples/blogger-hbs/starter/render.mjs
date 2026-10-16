// Renders the compiled theme with `blogger-hbs/runtime` only, as a Cloudflare
// Worker, Deno or a browser would: run `pnpm build` first.
import { createRenderer, formatXml } from 'blogger-hbs/runtime';
import * as theme from './dist/compiled.js';

const renderer = createRenderer(theme);

// any context, here another name and version than in the config
const xml = await renderer.render({
	theme: { name: 'Starter (rendered)', version: '1.0.0' },
});

console.log(formatXml(xml));
