// Sets the theme before first paint. BaseLayout inlines this script in <head>.
// It runs only once, so the swap listener below themes later pages
import { applyTheme, readChoice, resolveTheme } from './state';

applyTheme(document, resolveTheme(readChoice()));
// Theme the incoming document before it is shown, to avoid a flash
document.addEventListener('astro:before-swap', (event) =>
	applyTheme(event.newDocument, resolveTheme(readChoice())),
);
