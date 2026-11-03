import { badgeTones } from './badges';

/** Values of the `level` frontmatter field, easiest first. */
export const levelNames = ['beginner', 'intermediate', 'advanced'] as const;

export type Level = (typeof levelNames)[number];

export const LEVELS = new Map<
	Level,
	{ label: string; title: string; class: string }
>([
	[
		'beginner',
		{
			label: 'Beginner',
			title: 'For a first theme: no knowledge of the theme language needed',
			class: badgeTones.green,
		},
	],
	[
		'intermediate',
		{
			label: 'Intermediate',
			title: 'Builds on the Basics and the common tags',
			class: badgeTones.blue,
		},
	],
	[
		'advanced',
		{
			label: 'Advanced',
			title:
				'For theme authors who know the language: the pages under "Read first" set it up',
			class: badgeTones.violet,
		},
	],
]);
