// opens and closes the navigation on small screens
const header = document.querySelector<HTMLElement>('.header');
const button = header?.querySelector<HTMLButtonElement>('.menu-button');
const nav = header?.querySelector<HTMLElement>('.nav');

if (header && button && nav) {
	const setOpen = (open: boolean) => {
		header.classList.toggle('is-open', open);
		button.setAttribute('aria-expanded', String(open));
		button.setAttribute(
			'aria-label',
			open ? 'Close the menu' : 'Open the menu',
		);
	};
	const isOpen = () => header.classList.contains('is-open');

	button.addEventListener('click', () => setOpen(!isOpen()));

	// a link is chosen
	nav.addEventListener('click', (event) => {
		if ((event.target as Element).closest('a')) {
			setOpen(false);
		}
	});

	// a click anywhere else
	document.addEventListener('click', (event) => {
		if (isOpen() && !header.contains(event.target as Node)) {
			setOpen(false);
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && isOpen()) {
			setOpen(false);
			button.focus();
		}
	});
}
