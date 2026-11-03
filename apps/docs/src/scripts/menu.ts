/**
 * Classes for a dropdown panel inside a `group/menu`. It fades in while the group has `data-open`.
 * `visibility` changes at once on open, so items can take focus, and only after the fade on close.
 * Callers add the transform origin, e.g. `origin-top-right`.
 */
export const menuPanel =
	'invisible absolute top-[calc(100%+0.375rem)] z-30 flex -translate-y-1 scale-95 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 opacity-0 shadow-xl shadow-black/10 transition-[opacity,scale,translate,visibility] duration-150 ease-out group-data-open/menu:visible group-data-open/menu:transition-[opacity,scale,translate] group-data-open/menu:translate-y-0 group-data-open/menu:scale-100 group-data-open/menu:opacity-100 motion-reduce:transition-none dark:shadow-black/40';

export const menuItem =
	'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-sm text-foreground no-underline outline-none transition-colors hover:bg-accent focus-visible:bg-accent';

/**
 * Sets up a dropdown menu. `root` needs a `[data-menu-button]` and a `[data-menu]` with `menuitem` items.
 * Handles arrow keys, Home, End, Escape, Tab and outside clicks. Listeners are removed when `signal` aborts.
 * Returns `open`, `close` and `isOpen` for menus that also open another way, such as on hover.
 */
export function setupMenu(root: HTMLElement, signal: AbortSignal) {
	const button = root.querySelector<HTMLButtonElement>('[data-menu-button]');
	const menu = root.querySelector<HTMLElement>('[data-menu]');
	if (!button || !menu) {
		throw new Error('setupMenu: no [data-menu-button] or [data-menu]');
	}
	const allItems = [
		...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
	];
	// Read on each use: a menu can hide items, like the header's "More" menu
	const items = () => allItems.filter((item) => !item.hidden);
	const isOpen = () => root.hasAttribute('data-open');

	// `none` opens without moving focus, e.g. when a menu opens on hover
	const open = (focus: 'checked' | 'first' | 'last' | 'none' = 'checked') => {
		root.setAttribute('data-open', '');
		button.ariaExpanded = 'true';
		if (focus === 'none') {
			return;
		}
		// Force a style flush so the panel is visible, since a hidden item can't take focus
		getComputedStyle(menu).visibility;
		const shown = items();
		const target =
			focus === 'first'
				? shown[0]
				: focus === 'last'
					? shown.at(-1)
					: shown.find((item) => item.ariaChecked === 'true');
		// Some browsers scroll the page to an item that is still animating in
		(target ?? shown[0])?.focus({ preventScroll: true });
	};
	const close = (refocus: boolean) => {
		if (!isOpen()) {
			return;
		}
		root.removeAttribute('data-open');
		button.ariaExpanded = 'false';
		if (refocus) {
			button.focus({ preventScroll: true });
		}
	};

	button.addEventListener('click', () => (isOpen() ? close(false) : open()), {
		signal,
	});
	// Up/Down on the button opens the menu (WAI-ARIA menu button pattern)
	button.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				open(event.key === 'ArrowDown' ? 'first' : 'last');
			}
		},
		{ signal },
	);
	// The item's own click handler runs first, then the menu closes
	for (const item of allItems) {
		item.addEventListener('click', () => close(true), { signal });
	}
	menu.addEventListener(
		'keydown',
		(event) => {
			const shown = items();
			if (shown.length === 0) {
				return;
			}
			const index = shown.indexOf(document.activeElement as HTMLElement);
			let next: number;
			switch (event.key) {
				case 'ArrowDown':
					next = index + 1;
					break;
				case 'ArrowUp':
					// With nothing focused yet, wrap to the last item
					next = index < 0 ? shown.length - 1 : index - 1;
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = shown.length - 1;
					break;
				case 'Tab':
					close(false);
					return;
				default:
					return;
			}
			event.preventDefault();
			shown[(next + shown.length) % shown.length].focus({
				preventScroll: true,
			});
		},
		{ signal },
	);
	// Escape closes the menu wherever focus is, e.g. still on the button after a click
	document.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Escape' && isOpen()) {
				event.preventDefault();
				close(true);
			}
		},
		{ signal },
	);
	document.addEventListener(
		'click',
		(event) => {
			if (!root.contains(event.target as Node)) {
				close(false);
			}
		},
		{ signal },
	);
	return { open, close, isOpen };
}
