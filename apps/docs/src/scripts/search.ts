/**
 * Search dialog logic for `Search.astro`.
 * Set up only once, because the header and its dialog persist across page swaps.
 */
import type { SectionTopics } from '../lib/content/sections';
import { setupMenu } from './menu';
import {
	cleanUrl,
	loadPagefind,
	type PagefindResult,
	pagefindFilters,
} from './pagefind';

const optionClass =
	'flex gap-3 rounded-lg px-3 py-2 no-underline aria-selected:bg-accent [&_mark]:rounded-sm [&_mark]:bg-primary/15 [&_mark]:px-0.5 [&_mark]:text-foreground';

function renderOption(
	url: string,
	title: string,
	excerpt: string,
	icon: HTMLTemplateElement,
	label?: string,
) {
	const link = document.createElement('a');
	link.href = cleanUrl(url);
	link.role = 'option';
	link.className = optionClass;
	const svg = icon.content.firstElementChild?.cloneNode(true);
	if (svg instanceof Element) {
		svg.classList.add('mt-1', 'shrink-0', 'text-muted-foreground');
		link.append(svg);
	}
	const text = document.createElement('span');
	text.className = 'flex min-w-0 flex-col gap-0.5';
	const head = document.createElement('span');
	head.className =
		'flex items-center gap-2 text-sm font-medium text-foreground';
	head.textContent = title;
	if (label) {
		const chip = document.createElement('span');
		chip.className =
			'rounded bg-muted px-1.5 text-meta font-normal text-muted-foreground';
		chip.textContent = label;
		head.append(chip);
	}
	const snippet = document.createElement('span');
	snippet.className =
		'line-clamp-2 text-meta leading-snug text-muted-foreground';
	// Safe as HTML: Pagefind escapes the excerpt and only adds <mark> around matches
	snippet.innerHTML = excerpt;
	text.append(head, snippet);
	link.append(text);
	return link;
}

interface ResultContext {
	term: string;
	icons: { page: HTMLTemplateElement; heading: HTMLTemplateElement };
	/** With a single section, results don't repeat its name. */
	sectionCount: number;
}

/** A page result, followed by up to three matching headings. */
function renderResult(
	result: PagefindResult,
	{ term, icons, sectionCount }: ResultContext,
): HTMLLIElement {
	const item = document.createElement('li');
	item.role = 'presentation';
	item.className = 'flex flex-col';
	const title = result.meta.title ?? cleanUrl(result.url);
	const label =
		sectionCount > 1
			? [result.meta.section, result.meta.folder].filter(Boolean).join(' · ')
			: result.meta.folder;
	item.append(
		renderOption(result.url, title, result.excerpt, icons.page, label),
	);
	const headings = result.sub_results
		.filter((sub) => sub.url.includes('#'))
		.slice(0, 3);
	if (term && headings.length > 0) {
		const group = document.createElement('div');
		group.role = 'group';
		group.ariaLabel = `Sections of ${title}`;
		group.className = 'ms-5 flex flex-col border-s border-border ps-2';
		for (const sub of headings) {
			group.append(
				renderOption(sub.url, sub.title, sub.excerpt, icons.heading),
			);
		}
		item.append(group);
	}
	return item;
}

/** Whether this is an Apple device, where the search shortcut is ⌘K rather than Ctrl+K. */
function isApple(): boolean {
	const { userAgentData } = navigator as Navigator & {
		userAgentData?: { platform: string };
	};
	return /Mac|iPhone|iPad/i.test(userAgentData?.platform ?? navigator.platform);
}

/** The last three elements are missing in `astro dev`, which has no search index. */
interface Elements {
	dialog: HTMLDialogElement;
	input: HTMLInputElement;
	topics: HTMLElement;
	body: HTMLElement;
	icons: ResultContext['icons'];
	empty: HTMLElement | null;
	status: HTMLElement | null;
	list: HTMLUListElement | null;
}

/** Sets up the dialog and every `[data-open-search]` trigger. Call once. */
export function setupSearch(dialog: HTMLDialogElement): void {
	const input = dialog.querySelector<HTMLInputElement>('[data-search-input]');
	const topics = dialog.querySelector<HTMLElement>('[data-search-topics]');
	const body = dialog.querySelector<HTMLElement>('[data-search-body]');
	const page = dialog.querySelector<HTMLTemplateElement>('[data-icon-page]');
	const heading = dialog.querySelector<HTMLTemplateElement>(
		'[data-icon-heading]',
	);
	if (!input || !topics || !body || !page || !heading) {
		return;
	}
	wire({
		dialog,
		input,
		topics,
		body,
		icons: { page, heading },
		empty: dialog.querySelector<HTMLElement>('[data-search-empty]'),
		status: dialog.querySelector<HTMLElement>('[data-search-status]'),
		list: dialog.querySelector<HTMLUListElement>('[data-search-results]'),
	});
}

function wire({
	dialog,
	input,
	topics,
	body,
	icons,
	empty,
	status,
	list,
}: Elements): void {
	const catalog: SectionTopics[] = JSON.parse(
		dialog.getAttribute('data-topics') ?? '[]',
	);
	const sectionCount = catalog.length;
	const topicNames = new Map(
		catalog.flatMap((entry) =>
			entry.topics.map((item) => [item.id, item.name] as const),
		),
	);
	let section: string | undefined;
	/** A topic id, e.g. `theme-xml/tags`. */
	let topic: string | undefined;
	/** The page section the filters were last scoped to, see `open()`. */
	let scopedTo: string | undefined;
	/** Highlighted option index, or -1. */
	let active = -1;
	/** Increases with each search, so stale results can be dropped. */
	let request = 0;

	const picker = dialog.querySelector<HTMLElement>('[data-search-section]');
	const pickerLabel = picker?.querySelector('[data-section-label]');
	const pickerIcons = [
		...(picker?.querySelectorAll<HTMLElement>('[data-section-icon]') ?? []),
	];
	const sectionOptions = [
		...(picker?.querySelectorAll<HTMLElement>('[data-section-option]') ?? []),
	];
	const divider = dialog.querySelector<HTMLElement>('[data-topics-divider]');
	const allChip = topics.querySelector<HTMLButtonElement>('[data-chip="all"]');
	const chips = [
		...topics.querySelectorAll<HTMLButtonElement>('[data-chip="topic"]'),
	];
	if (picker) {
		// The dialog lives for the whole visit, so the menu is never torn down
		setupMenu(picker, new AbortController().signal);
	}

	// Fade the edge of the topic row that has more chips beyond it
	function updateFade() {
		const end = topics.scrollWidth - topics.clientWidth - topics.scrollLeft;
		topics.toggleAttribute('data-fade-start', topics.scrollLeft > 1);
		topics.toggleAttribute('data-fade-end', end > 1);
	}

	// Topic chips show only for the chosen section (or the only one), so same-named topics never mix
	function syncChips() {
		const showTopicsOf = sectionCount > 1 ? section : catalog[0]?.name;
		const shown = chips.filter(
			(chip) => chip.getAttribute('data-section') === showTopicsOf,
		);
		if (
			topic &&
			!shown.some((chip) => chip.getAttribute('data-value') === topic)
		) {
			topic = undefined;
		}
		for (const chip of chips) {
			chip.hidden = !shown.includes(chip);
			chip.ariaPressed = String(chip.getAttribute('data-value') === topic);
		}
		if (allChip) {
			allChip.hidden = shown.length === 0;
			allChip.ariaPressed = String(topic === undefined);
		}
		if (divider) {
			divider.hidden = !picker || shown.length === 0;
		}
		for (const option of sectionOptions) {
			option.ariaChecked = String(
				(option.getAttribute('data-section-option') || undefined) === section,
			);
		}
		if (pickerLabel) {
			pickerLabel.textContent = section ?? 'All sections';
		}
		for (const icon of pickerIcons) {
			icon.hidden =
				(icon.getAttribute('data-section-icon') || undefined) !== section;
		}
		topics.scrollLeft = 0;
		updateFade();
		// The browse view (empty query) shows only the chosen section
		for (const group of dialog.querySelectorAll<HTMLElement>(
			'[data-browse-section]',
		)) {
			group.hidden =
				section !== undefined &&
				group.getAttribute('data-browse-section') !== section;
		}
	}
	syncChips();

	const options = () => [
		...(list?.querySelectorAll<HTMLAnchorElement>('[role="option"]') ?? []),
	];

	// Leaving the results state clears the list and the active option
	function show(state: 'empty' | 'status' | 'results', message = '') {
		empty?.classList.toggle('hidden', state !== 'empty');
		status?.classList.toggle('hidden', state !== 'status');
		list?.classList.toggle('hidden', state !== 'results');
		list?.classList.toggle('flex', state === 'results');
		if (status) {
			status.textContent = message;
		}
		input.ariaExpanded = String(state === 'results');
		if (state !== 'results') {
			list?.replaceChildren();
			active = -1;
			input.removeAttribute('aria-activedescendant');
		}
	}

	/** Wraps around at both ends and updates `aria-activedescendant`. */
	function select(index: number, scroll = true) {
		const all = options();
		active = all.length === 0 ? -1 : (index + all.length) % all.length;
		all.forEach((link, i) => {
			link.ariaSelected = String(i === active);
		});
		const current = all[active];
		if (current) {
			input.setAttribute('aria-activedescendant', current.id);
			if (scroll) {
				current.scrollIntoView({ block: 'nearest' });
			}
		} else {
			input.removeAttribute('aria-activedescendant');
		}
	}

	async function run() {
		if (!list) {
			return;
		}
		const term = input.value.trim();
		const id = ++request;
		// No words and no topic: show the browse view
		if (term === '' && !topic) {
			show('empty');
			return;
		}
		try {
			const pagefind = await loadPagefind();
			const filters: Record<string, string> = {};
			if (topic) {
				filters[pagefindFilters.topic] = topic;
			}
			if (section) {
				filters[pagefindFilters.section] = section;
			}
			const search = await pagefind.debouncedSearch(
				term || null,
				{ filters },
				150,
			);
			// A newer search started while this one ran
			if (search === null || id !== request) {
				return;
			}
			const results = await Promise.all(
				search.results.slice(0, 12).map((result) => result.data()),
			);
			if (id !== request) {
				return;
			}
			if (results.length === 0) {
				const scope = [section, topic && topicNames.get(topic)]
					.filter(Boolean)
					.join(' › ');
				show(
					'status',
					term
						? `No results for “${term}”${scope ? ` in ${scope}` : ''}.`
						: 'No pages.',
				);
				// The search is scoped to a section by default, so offer to widen it
				if (term && section && status) {
					const widen = document.createElement('button');
					widen.type = 'button';
					widen.textContent = 'Search all sections';
					widen.className =
						'ms-1 cursor-pointer font-medium text-foreground underline underline-offset-2 hover:opacity-80';
					widen.addEventListener('click', () => {
						section = undefined;
						syncChips();
						run();
						input.focus();
					});
					status.append(' ', widen);
				}
				return;
			}
			list.replaceChildren(
				...results.map((result) =>
					renderResult(result, { term, icons, sectionCount }),
				),
			);
			options().forEach((link, i) => {
				link.id = `search-option-${i}`;
			});
			show('results');
			body.scrollTop = 0;
			select(0);
		} catch {
			// The index or the search failed; the next search retries
			if (id === request) {
				show('status', 'Search is unavailable.');
			}
		}
	}

	function open(query?: string) {
		if (!dialog.open) {
			dialog.showModal();
		}
		// Widths are only known once the dialog is shown
		updateFade();
		// Scope to the page's section by default. Re-scope only when that section changed, so picked filters
		// survive reopening
		const pageSection =
			document
				.querySelector<HTMLMetaElement>(
					`meta[data-pagefind-filter="${pagefindFilters.section}[content]"]`,
				)
				?.getAttribute('content') ?? undefined;
		if (sectionCount > 1 && pageSection !== scopedTo) {
			scopedTo = pageSection;
			section = pageSection;
			topic = undefined;
			syncChips();
		}
		if (query) {
			input.value = query;
			input.focus();
			run();
		} else {
			input.select();
		}
		if (!import.meta.env.DEV) {
			// Preload the index for a fast first search
			loadPagefind().catch(() => {});
		}
	}

	input.addEventListener('input', () => run());
	input.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			select(active + (event.key === 'ArrowDown' ? 1 : -1));
		} else if (event.key === 'Enter') {
			const link = options()[active];
			if (link) {
				event.preventDefault();
				link.click();
			}
		}
	});
	topics.addEventListener('click', (event) => {
		const chip =
			event.target instanceof Element
				? event.target.closest<HTMLElement>('[data-chip]')
				: null;
		if (!chip) {
			return;
		}
		// "All topics" clears the topic; clicking the chosen topic again does too
		const value = chip.getAttribute('data-value') ?? undefined;
		topic = value === undefined || value === topic ? undefined : value;
		syncChips();
		run();
		input.focus();
	});
	for (const option of sectionOptions) {
		option.addEventListener('click', () => {
			section = option.getAttribute('data-section-option') || undefined;
			syncChips();
			run();
			// The menu returns focus to its button first; continue typing in the search box
			input.focus();
		});
	}
	topics.addEventListener('scroll', updateFade, { passive: true });
	// A mouse wheel scrolls the topic row sideways
	topics.addEventListener(
		'wheel',
		(event) => {
			if (
				Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
				topics.scrollWidth > topics.clientWidth
			) {
				event.preventDefault();
				topics.scrollLeft += event.deltaY;
			}
		},
		{ passive: false },
	);
	list?.addEventListener('mousemove', (event) => {
		const option =
			event.target instanceof Element
				? event.target.closest<HTMLAnchorElement>('[role="option"]')
				: null;
		if (option) {
			select(options().indexOf(option), false);
		}
	});
	// Close on backdrop clicks and result links. A same-page anchor only scrolls, so it needs an explicit close
	dialog.addEventListener('click', (event) => {
		if (
			event.target === dialog ||
			(event.target instanceof Element && event.target.closest('a'))
		) {
			dialog.close();
		}
	});
	dialog
		.querySelector('[data-close-search]')
		?.addEventListener('click', () => dialog.close());

	// Delegated on document, so triggers on pages swapped in by the client router work too
	document.addEventListener('click', (event) => {
		const trigger =
			event.target instanceof Element
				? event.target.closest<HTMLElement>('[data-open-search]')
				: null;
		if (trigger) {
			open(trigger.getAttribute('data-search-query') ?? undefined);
		}
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			dialog.open ? dialog.close() : open();
		} else if (
			event.key === '/' &&
			!dialog.open &&
			!(
				event.target instanceof Element &&
				event.target.closest('input, textarea, select')
			)
		) {
			event.preventDefault();
			open();
		}
	});

	if (isApple()) {
		document.querySelector('[data-shortcut-ctrl]')?.classList.add('invisible');
		document
			.querySelector('[data-shortcut-meta]')
			?.classList.remove('invisible');
	}
}
