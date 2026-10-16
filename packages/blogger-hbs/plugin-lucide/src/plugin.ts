import type { LucideIconData } from '@lucide/icons';
import { lucideDynamicIconImports } from '@lucide/icons/dynamic';
import {
	type CompilePlugin,
	type Location,
	type PartialRequest,
	PluginError,
} from 'blogger-hbs';

type IconName = keyof typeof lucideDynamicIconImports;
type IconNode = LucideIconData['node'][number];

export interface LucideOptions {
	/** Id of the includable rendering the icons, `@lucide` by default. */
	id?: string;
	/**
	 * Icon rendered for a name the includable does not know, which can only
	 * happen when the name comes from data. `circle-slash` by default, `false`
	 * to render an empty icon.
	 */
	fallback?: IconName | false;
	/** Default width and height, `24` by default. */
	size?: number;
	/** Default stroke color, `currentColor` by default. */
	stroke?: string;
	/** Default stroke width, `2` by default. */
	strokeWidth?: number;
}

const PLUGIN_NAME = 'lucide';
const INCLUDABLE = 'includable';

/**
 * Props of `{{> lucide.house size=16 class="icon"}}` passed on to the
 * includable.
 */
const PROPS = ['size', 'stroke', 'strokeWidth', 'class'];

const ICON_NAMES = Object.keys(lucideDynamicIconImports);

/** Icon data by name, kept between compilations, for example when watching. */
const cache = new Map<string, Promise<LucideIconData>>();

/**
 * Lucide icons as partials, `{{> lucide.house}}`, rendered by a single
 * includable that has to be in the theme once, `{{> lucide.includable}}`. Only
 * the icons used are in it.
 */
export function pluginLucide(options: LucideOptions = {}): CompilePlugin {
	const {
		id = '@lucide',
		fallback = 'circle-slash',
		size = 24,
		stroke = 'currentColor',
		strokeWidth = 2,
	} = options;

	if (typeof id !== 'string' || !/^[\w@.-]+$/.test(id)) {
		throw new PluginError(`Invalid lucide includable id '${String(id)}'`);
	}
	if (fallback !== false && !isIcon(fallback)) {
		throw new PluginError(
			unknownIcons([{ name: fallback, usages: [] }], 'fallback icon'),
		);
	}

	return {
		name: PLUGIN_NAME,

		provide({ requests }, plugin) {
			const icons = requests.filter(({ name }) => name !== INCLUDABLE);
			const unknown = icons.filter(({ name }) => !isIcon(name));
			if (unknown.length > 0) {
				plugin.error(unknownIcons(unknown, 'icon'));
			}

			for (const { name, usages } of icons) {
				for (const usage of usages) {
					for (const prop of Object.keys(usage.hash)) {
						if (!PROPS.includes(prop)) {
							const match = closest(prop, PROPS);
							plugin.error(
								`Unknown prop '${prop}' of lucide icon '${name}'${match ? `, did you mean '${match}'?` : ''} The props are ${PROPS.join(', ')}`,
								usage,
							);
						}
					}
				}
			}

			return Object.fromEntries(
				icons.map(({ name }) => [name, iconPartial(id, name)]),
			);
		},

		// the includable needs every icon used, which is only known now
		async finalize({ provided, missing, requests }, plugin) {
			const icons = provided.filter((name) => name !== INCLUDABLE).sort();

			if (!missing.includes(INCLUDABLE)) {
				if (icons.length > 0) {
					const first = requests.find(({ name }) => name !== INCLUDABLE);
					plugin.error(
						`Lucide icons are used (${icons.join(', ')}) but not '{{> ${PLUGIN_NAME}.${INCLUDABLE}}}', which renders them. Add it once to the theme`,
						first?.usages[0],
					);
				}
				return;
			}

			const cases = await Promise.all(
				icons.map(
					async (name) =>
						`      <b:case value='${name}'/>\n      ${await iconBody(name)}\n\n`,
				),
			);
			const fallbackBody =
				fallback === false ? '' : `      ${await iconBody(fallback)}\n`;

			return {
				[INCLUDABLE]: `<b:includable id='${id}' var='props'>
  <svg aria-hidden='true' expr:height='data:props.size ?: ${size}' expr:stroke='data:props.stroke ?: "${escapeXml(stroke)}"' expr:stroke-width='data:props.strokeWidth ?: ${strokeWidth}' expr:width='data:props.size ?: ${size}' fill='none' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
    <b:class cond='data:props.class' expr:name='data:props.class'/>
    <b:switch var='data:props.name'>
${cases.join('')}      <b:default/>
${fallbackBody}    </b:switch>
  </svg>
</b:includable>
`,
			};
		},
	};
}

function isIcon(name: string): name is IconName {
	return Object.hasOwn(lucideDynamicIconImports, name);
}

function loadIcon(name: IconName): Promise<LucideIconData> {
	let icon = cache.get(name);
	if (icon === undefined) {
		icon = lucideDynamicIconImports[name]().then((module) => module.default);
		cache.set(name, icon);
	}
	return icon;
}

/** `{{> lucide.house size=16}}` includes the includable with the props given. */
function iconPartial(id: string, name: string): string {
	const props = PROPS.map(
		(prop) => `{{#if ${prop}}}, ${prop}: "{{${prop}}}"{{/if}}`,
	).join('');
	return `<b:include data='{ name: "${name}"${props} }' name='${id}'/>\n`;
}

/** The elements of the icon. */
async function iconBody(name: string): Promise<string> {
	const icon = await loadIcon(name as IconName);
	return icon.node.map(nodeToXml).join('');
}

function nodeToXml([name, props = {}, children = []]: IconNode): string {
	const attributes = Object.entries(props)
		.filter(([prop, value]) => prop !== 'key' && value != null)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([prop, value]) => ` ${prop}='${escapeXml(String(value))}'`)
		.join('');
	const content = (children as IconNode[]).map(nodeToXml).join('');

	return content
		? `<${name}${attributes}>${content}</${name}>`
		: `<${name}${attributes}/>`;
}

const XML_ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;',
};

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);
}

/** Lists the unknown icons with where they are first used and the closest names. */
function unknownIcons(icons: readonly PartialRequest[], label: string): string {
	const lines = icons.map(({ name, usages }) => {
		const [first] = usages;
		const match = closest(name, ICON_NAMES);
		return `  '${name}'${first ? ` (${describe(first)})` : ''}${match ? `, did you mean '${match}'?` : ''}`;
	});

	return `Unknown lucide ${label}${icons.length > 1 ? 's' : ''}:\n${lines.join('\n')}\nSee the icons at https://lucide.dev/icons`;
}

function describe({ path, line, column }: Location): string {
	return line > 0 ? `${path}:${line}:${column}` : path;
}

/** The candidate closest to `name`, when it is close enough to be a typo. */
function closest(
	name: string,
	candidates: readonly string[],
): string | undefined {
	let best: string | undefined;
	let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;

	for (const candidate of candidates) {
		if (Math.abs(candidate.length - name.length) >= bestDistance) {
			continue;
		}
		const distance = editDistance(name, candidate);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}

	return best;
}

/** Edits between two names, swapping two letters counts as one, `mneu` is `menu`. */
function editDistance(a: string, b: string): number {
	let beforePrevious: number[] = [];
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
			}
		}
		beforePrevious = previous;
		previous = current;
	}

	return previous[b.length];
}
