/**
 * Code block buttons: line numbers, wrapping and copy.
 * Loaded once by the layouts. Inside `CodeBlock.astro`, Astro added it several times on pages with tabs.
 */
import { onPage } from './page';

/** Each toggle: the button's attribute, the state it sets on the block, and the button titles when on and off. */
const toggles = [
	[
		'data-code-line-numbers',
		'data-line-numbers',
		'Hide line numbers',
		'Show line numbers',
	],
	[
		'data-code-wrap',
		'data-line-wrapped',
		'Disable line wrapping',
		'Enable line wrapping',
	],
] as const;

// Toggles the state on the block; in `<CodeTabs>`, every block of the group follows the clicked one
function toggle(
	button: HTMLButtonElement,
	buttonAttribute: string,
	state: string,
	on: string,
	off: string,
) {
	const figure = button.closest<HTMLElement>('[data-code]');
	if (!figure) {
		return;
	}
	const enabled = !figure.hasAttribute(state);
	const group = figure.closest('[data-code-tabs]');
	const figures = group
		? group.querySelectorAll<HTMLElement>(':scope > [data-code]')
		: [figure];
	for (const item of figures) {
		item.toggleAttribute(state, enabled);
		const itemButton = item.querySelector<HTMLButtonElement>(
			`[${buttonAttribute}]`,
		);
		if (itemButton) {
			itemButton.ariaPressed = String(enabled);
			itemButton.title = enabled ? on : off;
		}
	}
}

onPage((signal) => {
	for (const [buttonAttribute, state, on, off] of toggles) {
		for (const button of document.querySelectorAll<HTMLButtonElement>(
			`[${buttonAttribute}]`,
		)) {
			button.addEventListener(
				'click',
				() => toggle(button, buttonAttribute, state, on, off),
				{ signal },
			);
		}
	}
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		'[data-code-copy]',
	)) {
		let reset: ReturnType<typeof setTimeout> | undefined;
		let copying = false;
		button.addEventListener(
			'click',
			async () => {
				if (copying) {
					return;
				}
				copying = true;
				// Skip lines a diff marks as removed
				const lines = [
					...(button.closest('[data-code]')?.querySelectorAll('pre .line') ??
						[]),
				];
				const code = lines
					.filter((line) => !line.classList.contains('remove'))
					.map((line) => line.textContent ?? '')
					.join('\n');
				// Update after the result is known, so repeated clicks keep the check visible longer
				const copied = await navigator.clipboard.writeText(code).then(
					() => true,
					// Fails on insecure origins, with denied permission or an unfocused document
					() => false,
				);
				copying = false;
				clearTimeout(reset);
				button.toggleAttribute('data-copied', copied);
				button.toggleAttribute('data-copy-failed', !copied);
				button.title = copied ? 'Copied' : 'Copy failed';
				reset = setTimeout(() => {
					button.removeAttribute('data-copied');
					button.removeAttribute('data-copy-failed');
					button.title = 'Copy code';
				}, 1500);
			},
			{ signal },
		);
	}
});
