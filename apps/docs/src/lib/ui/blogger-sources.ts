import { badgeTones } from './badges';

export type BloggerSourceKind = 'official' | 'observed' | 'deprecated';

/** Where a fact about Blogger comes from, shown by `<BloggerSource>`. */
export const BLOGGER_SOURCES = new Map<
	BloggerSourceKind,
	{ label: string; title: string; class: string }
>([
	[
		'official',
		{
			label: 'Google',
			title: 'Documented by Google in the Blogger Help Center or blogs',
			class: badgeTones.green,
		},
	],
	[
		'observed',
		{
			label: 'Observed',
			title:
				'Not documented by Google, known from developing and testing themes on Blogger',
			class: badgeTones.blue,
		},
	],
	[
		'deprecated',
		{
			label: 'Deprecated',
			title: 'Documented once, Blogger no longer uses it',
			class: `${badgeTones.neutral} line-through`,
		},
	],
]);
