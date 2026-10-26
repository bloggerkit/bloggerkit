// marks the link of the page shown, for the styles and screen readers
for (const link of document.querySelectorAll<HTMLAnchorElement>('.links a')) {
	if (new URL(link.href).pathname === location.pathname) {
		link.setAttribute('aria-current', 'page');
	}
}
