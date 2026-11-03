/**
 * Dates the print footer and opens closed accordions for browsers without `::details-content`, then closes them after.
 * The rest of print is CSS in `src/styles/print.css`, which still holds when Chrome redraws the preview after
 * `afterprint`. Runs once, because the window keeps its listeners across page swaps.
 */
let opened: HTMLDetailsElement[] = [];

addEventListener('beforeprint', () => {
	const today = new Date().toLocaleDateString('en-US', { dateStyle: 'medium' });
	for (const date of document.querySelectorAll('[data-print-date]')) {
		date.textContent = `Printed ${today}`;
	}
	opened = [
		...document.querySelectorAll<HTMLDetailsElement>('.markdown details'),
	].filter((details) => !details.open);
	for (const details of opened) {
		details.open = true;
	}
});

addEventListener('afterprint', () => {
	for (const details of opened) {
		details.open = false;
	}
	opened = [];
});
