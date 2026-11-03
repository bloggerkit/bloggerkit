/**
 * The user's theme choice is stored in `localStorage`. The resolved theme is set as `data-theme` on `<html>`.
 * Shared by `init.ts`, the header's theme menu and the WebMCP `set_theme` tool.
 */

export const themeChoices = ['light', 'dark', 'auto'] as const;
export type ThemeChoice = (typeof themeChoices)[number];
export type Theme = Exclude<ThemeChoice, 'auto'>;

/** Browser `theme-color` per theme; must match `--background` in `src/styles/globals.css`. */
export const themeColors: Record<Theme, string> = {
	dark: '#121212',
	light: '#f5f5f5',
};

const storageKey = 'theme';
/** Fired on `document` when the choice changes in this tab. */
export const themeChangeEvent = 'theme-change';

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
	themeChoices.includes(value as ThemeChoice);

/** Returns `auto` if nothing is stored or storage is blocked. */
export function readChoice(): ThemeChoice {
	try {
		const stored = localStorage.getItem(storageKey);
		return isThemeChoice(stored) ? stored : 'auto';
	} catch {
		return 'auto';
	}
}

/** `auto` follows the system preference. */
export function resolveTheme(choice: ThemeChoice): Theme {
	if (choice !== 'auto') {
		return choice;
	}
	return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Also used on the incoming document during a client-router swap. */
export function applyTheme(doc: Document, theme: Theme): void {
	doc.documentElement.setAttribute('data-theme', theme);
	doc
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', themeColors[theme]);
}

/** Stores the choice and fires `themeChangeEvent`. */
export function chooseTheme(choice: ThemeChoice): void {
	try {
		localStorage.setItem(storageKey, choice);
	} catch {}
	document.dispatchEvent(new CustomEvent(themeChangeEvent));
}

/** Calls `listener` when the choice changes in another tab or the system theme changes. */
export function onExternalThemeChange(listener: () => void): void {
	matchMedia('(prefers-color-scheme: light)').addEventListener(
		'change',
		listener,
	);
	addEventListener('storage', (event) => {
		if (event.key === storageKey) {
			listener();
		}
	});
}
