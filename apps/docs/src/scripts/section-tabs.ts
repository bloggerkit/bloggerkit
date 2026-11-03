/**
 * Moves the header's section tabs that don't fit into the "More" menu: other sections from the end first, then
 * "All docs", never the current section. Used by `SectionTabs.astro`.
 */
export function fitSectionTabs(nav: HTMLElement): void {
	const row = nav.querySelector<HTMLElement>('[data-tabs-row]');
	const more = nav.querySelector<HTMLElement>('[data-tabs-more]');
	if (!row || !more) {
		return;
	}
	const tabs = [...row.querySelectorAll<HTMLElement>('[data-tab]')];
	const setInMenu = (tab: HTMLElement, inMenu: boolean) => {
		tab.hidden = inMenu;
		const item = more.querySelector<HTMLElement>(
			`[data-menu-tab="${tab.getAttribute('data-tab')}"]`,
		);
		if (item) {
			item.hidden = !inMenu;
		}
	};

	for (const tab of tabs) {
		setInMenu(tab, false);
	}
	more.hidden = true;
	row.scrollLeft = 0;
	if (row.scrollWidth > row.clientWidth) {
		more.hidden = false;
		const candidates = [...tabs.slice(1).reverse(), tabs[0]].filter(
			(tab) => tab && !tab.hasAttribute('aria-current'),
		);
		for (const tab of candidates) {
			if (row.scrollWidth <= row.clientWidth) {
				break;
			}
			setInMenu(tab, true);
		}
	}
	const count = more.querySelector('[data-more-count]');
	if (count) {
		count.textContent = String(tabs.filter((tab) => tab.hidden).length);
	}
}
