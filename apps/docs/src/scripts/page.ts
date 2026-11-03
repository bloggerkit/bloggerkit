/**
 * Runs `setup` on the first page and on every page the client router swaps in.
 * Listeners added with `signal` are removed on the next navigation, so they don't pile up.
 */
export function onPage(setup: (signal: AbortSignal) => void) {
	let controller: AbortController | undefined;
	document.addEventListener('astro:page-load', () => {
		controller?.abort();
		controller = new AbortController();
		setup(controller.signal);
	});
}

export function prefersReducedMotion(): boolean {
	return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
