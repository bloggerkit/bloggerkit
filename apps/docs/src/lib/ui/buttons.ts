/**
 * Large buttons on the home and 404 pages. Combine with `class:list`. Works on `<a>` and `<button>`; add
 * `cursor-pointer` to a `<button>`.
 */

export const buttonBase =
	'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium no-underline transition-colors';

export const buttonPrimary =
	'bg-primary text-primary-foreground hover:opacity-90';

/** Add a background matching the surface: `bg-card` on the page, `bg-background` on a card. */
export const buttonSecondary =
	'border border-border text-foreground hover:bg-accent';
