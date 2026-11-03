import { defineMeta } from '@/lib/content/meta';

export default defineMeta({
	title: 'Data',
	description:
		'Everything a theme can read: the blog, the page, posts, comments, widgets, messages and the skin.',
	icon: 'Database',
	pages: [
		'index',
		'blog',
		'view',
		'post',
		'comments',
		'widgets',
		'messages',
		'skin',
		'page-types',
	],
});
