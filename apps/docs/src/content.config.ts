import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { contentDir, fileToSlug } from './lib/routes';
import { levelNames } from './lib/ui/levels';
import { type IconName, isIconName } from './lib/ui/lucide';

const githubUsername = z
	.string()
	.regex(/^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/, {
		message: 'not a GitHub username',
	});

/**
 * A GitHub username, or `{ name?, github?, url? }` with a name, a username or both. The username gives the photo.
 * It also stands in for a missing name, and its profile for a missing `url`.
 */
const pageAuthor = z.union(
	[
		githubUsername.transform((github) => ({ github })),
		z
			.object({
				name: z.string().trim().min(1).optional(),
				github: githubUsername.optional(),
				url: z.url().optional(),
			})
			.refine((who) => who.name !== undefined || who.github !== undefined, {
				message: 'an author needs a `name`, a `github` username, or both',
			}),
	],
	{
		error:
			'an author is a GitHub username, `kumardeo`, or `{ name, github, url }` with a name, a username or both: `{ name: Jane Doe, github: janedoe }`',
	},
);

/** Invalid or future dates fail the build, so search engines never see an impossible date. */
const pageDate = (field: string) =>
	z.coerce
		.date({ error: `\`${field}\` must be a date: \`${field}: 2026-10-26\`` })
		.refine((date) => date <= new Date(), {
			message: `\`${field}\` is in the future`,
		});

export const collections = {
	docs: defineCollection({
		loader: glob({
			pattern: '**/[^_]*.{md,mdx}',
			base: contentDir,
			// `theme-xml/tags/loops.mdx` → `docs/theme-xml/tags/loops`, served at `/docs/...`
			generateId: ({ entry }) => `docs/${fileToSlug(entry)}`.replace(/\/$/, ''),
		}),
		schema: z
			.object({
				title: z.string(),
				description: z
					.string()
					.max(160, {
						message:
							'`description` is longer than 160 characters, search engines cut it',
					})
					.optional(),
				/** Lucide icon name for the sidebar, e.g. `Info`. */
				icon: z
					.custom<IconName>(
						(name) => typeof name === 'string' && isIconName(name),
						{ message: 'Unknown Lucide icon, see https://lucide.dev/icons' },
					)
					.optional(),
				level: z.enum(levelNames).optional(),
				/** Slugs of pages to read first, e.g. `theme-xml/tags/loops`. */
				prerequisites: z.array(z.string()).optional(),
				/** Becomes `datePublished` in the structured data. */
				published: pageDate('published'),
				/**
				 * Set when facts or examples change, not for typo fixes. Used for `dateModified` and the sitemap
				 * `lastmod`, which fall back to `published`.
				 */
				updated: pageDate('updated').optional(),
				/** Defaults to the site author in `site.ts`. */
				authors: z.array(pageAuthor).min(1).optional(),
			})
			.refine(
				(page) => page.updated === undefined || page.updated > page.published,
				{
					message: '`updated` must be later than `published`',
					path: ['updated'],
				},
			),
	}),
};
