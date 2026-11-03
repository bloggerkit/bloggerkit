import type { icons } from '@lucide/astro';

/** E.g. `FileCode`, see https://lucide.dev/icons. */
export type IconName = keyof typeof icons;

/** As stored in each icon module of `@lucide/astro`. */
interface LucideIconData {
	/** Kebab-case, e.g. `file-code`, used in the `lucide-*` classes. */
	name: string;
	/** Former names, also added as `lucide-*` classes. */
	aliases?: string[];
	/** View box size. */
	size?: number;
	/** SVG children as `[tag, attributes]`. */
	node: [string, Record<string, string>][];
}

// Read icons from the package files as text instead of importing them. Importing anything from `@lucide/astro`
// loads all ~1,900 icon modules, which added seconds to every build. Each file loads only when needed
const iconSources = import.meta.glob<string>(
	'/node_modules/@lucide/astro/src/icons/*.ts',
	{ query: '?raw', import: 'default' },
);
const iconSource = (file: string) =>
	iconSources[`/node_modules/@lucide/astro/src/icons/${file}.ts`]?.();
const ICON_DATA = /^const iconData: LucideIconData = (\{.*\});$/m;

// `FileCode` → `file-code`, from the package's `icons/index.ts`. Read at module load (top-level `await`) so
// `isIconName()` stays synchronous for the content schema
const iconIndex = await iconSource('index');
if (iconIndex === undefined) {
	throw new Error('Could not find the Lucide icon index in @lucide/astro');
}
const iconFiles = new Map(
	[
		...iconIndex.matchAll(
			/export \{ default as (\w+) \} from '\.\/([\w-]+)';/g,
		),
	].map(([, name, file]) => [name, file]),
);
const loaded = new Map<string, Promise<LucideIconData>>();

export function isIconName(name: string): name is IconName {
	return iconFiles.has(name);
}

async function readIcon(name: string, file: string): Promise<LucideIconData> {
	const source = await iconSource(file);
	const json = source && ICON_DATA.exec(source)?.[1];
	if (json === undefined) {
		throw new Error(`Could not read the Lucide icon ${name} from ${file}.ts`);
	}
	return JSON.parse(json) as LucideIconData;
}

/** Returns `undefined` for an unknown name. Each icon file is read once. */
export function findLucideIcon(
	name: string,
): Promise<LucideIconData | undefined> {
	const file = iconFiles.get(name);
	if (file === undefined) {
		return Promise.resolve(undefined);
	}
	let icon = loaded.get(file);
	if (icon === undefined) {
		icon = readIcon(name, file);
		loaded.set(file, icon);
	}
	return icon;
}
