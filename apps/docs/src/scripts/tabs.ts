/**
 * Accessible tabs for `<Tabs>` and `<CodeTabs>`. Arrow keys, Home and End move between tabs. Groups sharing a
 * `syncKey` select the same label everywhere, across pages (persisted in `localStorage`).
 */
interface TabsOptions {
	/** The `role="tablist"` element; its children are replaced with one button per panel. */
	list: HTMLElement;
	panels: HTMLElement[];
	/** Tab labels; also the value a `syncKey` stores. */
	labels: string[];
	/** Prefix for generated tab ids, and for panel ids when a panel has none. */
	baseId: string;
	syncKey?: string;
	/** Style the selected tab with `aria-selected`. */
	tabClass: string;
	/** Adds content before a tab's label, e.g. an icon. */
	decorate?: (tab: HTMLButtonElement, index: number) => void;
	/** Called on every selection, including the initial one. */
	onSelect?: (index: number) => void;
	/** Removes the sync listener when the page is swapped out. */
	signal: AbortSignal;
}

const syncEvent = 'tabs:sync';
const storageKey = (key: string) => `tabs:${key}`;

/** Builds the tab buttons for `panels` and selects the stored (synced) tab, or the first. */
export function setupTabs({
	list,
	panels,
	labels,
	baseId,
	syncKey,
	tabClass,
	decorate,
	onSelect,
	signal,
}: TabsOptions): void {
	list.replaceChildren();
	const tabs = panels.map((panel, i) => {
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.role = 'tab';
		tab.className = tabClass;
		decorate?.(tab, i);
		tab.append(labels[i]);
		tab.id = `${baseId}-tab-${i}`;
		panel.id ||= `${baseId}-panel-${i}`;
		// Panel roles are set here, so without JavaScript the panels render as plain blocks
		panel.role = 'tabpanel';
		panel.setAttribute('aria-labelledby', tab.id);
		tab.setAttribute('aria-controls', panel.id);
		tab.addEventListener('click', () => select(i, true));
		tab.addEventListener('keydown', (event) => {
			const last = panels.length - 1;
			let next: number;
			switch (event.key) {
				case 'ArrowRight':
					next = i === last ? 0 : i + 1;
					break;
				case 'ArrowLeft':
					next = i === 0 ? last : i - 1;
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = last;
					break;
				default:
					return;
			}
			event.preventDefault();
			select(next, true);
			tabs[next].focus();
		});
		list.append(tab);
		return tab;
	});

	function select(index: number, sync: boolean) {
		tabs.forEach((tab, i) => {
			tab.ariaSelected = String(i === index);
			tab.tabIndex = i === index ? 0 : -1;
			panels[i].hidden = i !== index;
		});
		onSelect?.(index);
		if (!sync || !syncKey) {
			return;
		}
		try {
			localStorage.setItem(storageKey(syncKey), labels[index]);
		} catch {}
		document.dispatchEvent(
			new CustomEvent(syncEvent, {
				detail: { syncKey, label: labels[index] },
			}),
		);
	}

	let stored: string | null = null;
	try {
		stored = syncKey ? localStorage.getItem(storageKey(syncKey)) : null;
	} catch {}
	select(Math.max(stored === null ? -1 : labels.indexOf(stored), 0), false);

	if (syncKey) {
		document.addEventListener(
			syncEvent,
			(event) => {
				if (!(event instanceof CustomEvent)) {
					return;
				}
				const i = labels.indexOf(event.detail.label);
				if (event.detail.syncKey === syncKey && i !== -1) {
					select(i, false);
				}
			},
			{ signal },
		);
	}
}
