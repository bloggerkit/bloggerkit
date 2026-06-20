import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type MinifyOptions, minify } from 'minify-xml';
import type {
	MinimalPluginContextWithoutEnvironment,
	Plugin,
	PreviewServer,
	ResolvedConfig,
	UserConfig,
	ViteDevServer,
} from 'vite';
import {
	DEFAULT_MODULE_FILES,
	DEFAULT_TEMPLATE_FILES,
	TAILWIND_CACHE_FILE,
	TEMPLATE_MINIFIED_OUT_FILE,
	TEMPLATE_OUT_FILE,
	TEMPLATE_TAGS_OUT_FILE,
	VITE_BUNDLER_KEY,
} from './constants';
import { TailwindCache } from './tailwind';
import {
	errorHtml,
	fsExists,
	getBloggerPluginHeadComment,
	getRequestUrl,
	isTailwindPlugin,
	replaceBloggerPluginHeadComment,
	replaceHost,
	toWebHeaders,
	unescapeHTML,
} from './utils';

export interface XMLOptions {
	tags?: boolean;
	minify?: boolean;
}

export interface BloggerPluginOptions {
	modules?: string[];
	styles?: string[];
	template?: string;
	proxyBlog: string;
	xml?: XMLOptions;
}

export default function blogger(userOptions: BloggerPluginOptions): Plugin {
	const ctx = new BloggerPluginContext(userOptions);

	return {
		name: '@blogger-plugin/vite',
		async config(config) {
			// resolve plugin context
			await ctx.resolve(config);

			// modify vite config
			config.build ||= {};
			config.build[VITE_BUNDLER_KEY] ||= {};
			const bundlerOptions = config.build[VITE_BUNDLER_KEY];
			if (Array.isArray(bundlerOptions.input)) {
				bundlerOptions.input = [...bundlerOptions.input, ctx.input];
			} else if (
				typeof bundlerOptions.input === 'object' &&
				bundlerOptions.input !== null
			) {
				bundlerOptions.input[ctx.input] = ctx.input;
			} else {
				bundlerOptions.input = ctx.input;
			}

			// remove contents between comments from template
			const originalTemplateXmlContent = await fs.readFile(
				ctx.template,
				'utf8',
			);
			const modifiedTemplateXmlContent = replaceBloggerPluginHeadComment(
				replaceBloggerPluginHeadComment(originalTemplateXmlContent, ''),
				'',
				true,
			);

			await fs.writeFile(ctx.template, modifiedTemplateXmlContent, 'utf-8');
		},
		async configResolved(config) {
			ctx.viteConfig = config;

			const hasTailwindPlugin = config.plugins
				.flat(Number.POSITIVE_INFINITY)
				.some((plugin) => isTailwindPlugin(plugin));
			const tailwindCache = new TailwindCache(
				path.resolve(ctx.root, TAILWIND_CACHE_FILE),
			);

			if (hasTailwindPlugin) {
				ctx.tailwindCache = tailwindCache;
			}

			if (hasTailwindPlugin) {
				await tailwindCache.clear();

				if (config.command === 'build') {
					const xmlContent = await fs.readFile(ctx.template, 'utf-8');
					const unescapedXmlContent = unescapeHTML(xmlContent, true);
					await tailwindCache.update(unescapedXmlContent, 'xml');
				}
			} else {
				await tailwindCache.remove();
			}
		},
		resolveId(source) {
			if (source === ctx.input) {
				return ctx.input;
			}
		},
		load(id) {
			if (id === ctx.input) {
				return ctx.html;
			}
		},
		buildStart() {
			if (
				ctx.viteConfig.command === 'build' &&
				!/^https?:\/\//.test(ctx.viteConfig.base)
			) {
				this.warn(`"base" should be a CDN URL in production
----------------------
Blogger cannot serve static assets (JS, CSS, etc.), so you must use
an absolute URL (http:// or https://).

Current value:
  base: "${ctx.viteConfig.base}"

Quick fix:
  VITE_BASE=https://cdn.jsdelivr.net/gh/<username>/<repository>@latest/dist/ npm run build

Vite config (recommended):
  export default defineConfig({
    base: process.env.VITE_BASE ?? "/"
  });

Without this, your assets may fail to load in Blogger.
----------------------`);
			}
		},
		async writeBundle(_, bundle) {
			if (!(ctx.input in bundle)) {
				return;
			}
			const asset = bundle[ctx.input];
			delete bundle[ctx.input];

			if (asset.type !== 'asset' || typeof asset.source !== 'string') {
				return;
			}
			const regex =
				/<!DOCTYPE html>\s*<html[^>]*>\s*<head>([\s\S]*?)<!--head-->([\s\S]*?)<\/head>\s*<body>([\s\S]*?)<!--body-->([\s\S]*?)<\/body>\s*<\/html>/i;
			const match = asset.source.match(regex);
			if (!match) {
				return;
			}

			const afterHeadBegin = match[1];
			const beforeHeadEnd = match[2];
			const afterBodyBegin = match[3];
			const beforeBodyEnd = match[4];

			const headContent = (afterHeadBegin + beforeHeadEnd)
				.replace(/<[^>]+>/g, (openingTag: string) => {
					return (
						openingTag
							// boolean attributes to empty string
							.replace(
								/\b(crossorigin|defer|async|disabled|checked)\b(?!\s*=)/g,
								(_, $1: string) =>
									$1 === 'crossorigin' ? 'crossorigin="anonymous"' : `${$1}=""`,
							)
							// convert attributes to single quotes safely
							.replace(/(\w+)=(".*?"|'.*?')/g, (_, $1: string, $2: string) => {
								const v = $2
									// remove quotes
									.slice(1, -1)
									// escape special XML chars
									.replace(/&/g, '&amp;')
									.replace(/'/g, '&apos;')
									.replace(/"/g, '&quot;')
									.replace(/</g, '&lt;')
									.replace(/>/g, '&gt;');
								return `${$1}='${v}'`;
							})
					);
				})
				// self-close void tags
				.replace(
					/<(link|meta|img|br|hr|input)([^>]*?)>/gi,
					(_, $1: string, $2: string) => `<${$1}${$2}/>`,
				)
				// remove whitespace between tags
				.replace(/>\s+</g, '><')
				// trim overall
				.trim();

			const originalTemplateXmlContent = await fs.readFile(
				ctx.template,
				'utf8',
			);
			const modifiedTemplateXmlContent = replaceBloggerPluginHeadComment(
				originalTemplateXmlContent,
				headContent,
				true,
			);

			await fs.writeFile(
				path.resolve(ctx.viteConfig.build.outDir, TEMPLATE_OUT_FILE),
				modifiedTemplateXmlContent,
			);

			if (ctx.xml.tags) {
				const templateTagsXmlContent = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html>
<head>
  <!--head:afterbegin:begin-->

  <!--head:afterbegin:end-->

  <!--head:beforeend:begin-->
  ${headContent}
  <!--head:beforeend:end-->
</head>
<body>
  <!--body:afterbegin:begin-->
  ${afterBodyBegin.trim()}
  <!--body:afterbegin:end-->

  <!--body:beforeend:begin-->
  ${beforeBodyEnd.trim()}
  <!--body:beforeend:end-->
</body>
</html>`;
				await fs.writeFile(
					path.resolve(ctx.viteConfig.build.outDir, TEMPLATE_TAGS_OUT_FILE),
					templateTagsXmlContent,
				);
			}

			if (ctx.xml.minify) {
				const minifiedTemplateXmlContent = minify(modifiedTemplateXmlContent, {
					removeComments: false,
					shortenNamespaces: false,
					removeUnusedNamespaces: false,
					removeUnusedDefaultNamespace: false,
					ignoreCData: true,
				} as MinifyOptions);
				await fs.writeFile(
					path.resolve(ctx.viteConfig.build.outDir, TEMPLATE_MINIFIED_OUT_FILE),
					minifiedTemplateXmlContent,
				);
			}
		},
		async closeBundle() {
			const htmlDir = path.resolve(
				ctx.viteConfig.build.outDir,
				'virtual:blogger-plugin',
			);

			const exists = await fsExists(htmlDir);

			if (exists) {
				await fs.rm(htmlDir, { recursive: true });
			}
		},
		configureServer(server) {
			return useServerMiddleware(server, ctx, this);
		},
		configurePreviewServer(server) {
			return useServerMiddleware(server, ctx, this);
		},
	};
}

class BloggerPluginContext {
	private options: BloggerPluginOptions;
	root: string;
	modules: string[];
	styles: string[];
	template: string;
	name: string;
	proxyBlog: URL;
	xml: Required<XMLOptions>;
	viteConfig: ResolvedConfig;
	tailwindCache: TailwindCache | null;
	input: string;
	html: string;
	headTags: string[];

	constructor(options: BloggerPluginOptions) {
		if (
			typeof options.template !== 'undefined' &&
			typeof options.template !== 'string'
		) {
			throw new Error("Option 'template' must be a string");
		}
		if (
			typeof options.modules !== 'undefined' &&
			!Array.isArray(options.modules)
		) {
			throw new Error("Option 'modules' must be an array");
		}
		if (
			typeof options.styles !== 'undefined' &&
			!Array.isArray(options.styles)
		) {
			throw new Error("Option 'styles' must be an array");
		}
		if (typeof options.proxyBlog !== 'string') {
			throw new Error("Option 'proxyBlog' must be a string");
		}
		let proxyBlog: URL;
		try {
			proxyBlog = new URL(options.proxyBlog);
		} catch {
			throw new Error("Option 'proxyBlog' must be a valid url");
		}

		this.options = options;
		this.root = process.cwd();
		this.modules = [];
		this.styles = [];
		this.template = undefined as unknown as string;
		this.name = undefined as unknown as string;
		this.proxyBlog = proxyBlog;
		this.xml = {
			tags: options.xml?.tags ?? false,
			minify: options.xml?.minify ?? false,
		};
		this.viteConfig = undefined as unknown as ResolvedConfig;
		this.tailwindCache = null;
		this.input = undefined as unknown as string;
		this.headTags = [];
		this.html = undefined as unknown as string;
	}

	async resolve(config: UserConfig): Promise<void> {
		this.root = config.root ? path.resolve(config.root) : this.root;

		if (this.options.modules) {
			for (let i = 0; i < this.options.modules.length; i++) {
				const module = this.options.modules[i];
				const modulePath = path.resolve(this.root, module);
				if (this.modules.includes(modulePath)) {
					continue;
				}
				if (await fsExists(modulePath)) {
					this.modules.push(modulePath);
				} else {
					throw new Error(
						`The path provided at modules[${i}] does not exist: ${modulePath}`,
					);
				}
			}
		} else {
			for (const module of DEFAULT_MODULE_FILES) {
				const modulePath = path.resolve(this.root, module);
				if (await fsExists(modulePath)) {
					this.modules.push(modulePath);
					break;
				}
			}
		}

		if (this.options.styles) {
			for (let i = 0; i < this.options.styles.length; i++) {
				const style = this.options.styles[i];
				const stylePath = path.resolve(this.root, style);
				if (this.styles.includes(stylePath)) {
					continue;
				}
				if (await fsExists(stylePath)) {
					this.styles.push(stylePath);
				} else {
					throw new Error(
						`The path provided at styles[${i}] does not exist: ${stylePath}`,
					);
				}
			}
		}

		if (this.options.template) {
			const templatePath = path.resolve(this.root, this.options.template);
			if (await fsExists(templatePath)) {
				this.template = templatePath;
			} else {
				throw new Error(
					`Provided template file does not exist: ${templatePath}`,
				);
			}
		} else {
			for (const file of DEFAULT_TEMPLATE_FILES) {
				const fullPath = path.resolve(this.root, file);
				if (await fsExists(fullPath)) {
					this.template = fullPath;
					break;
				}
			}

			if (!this.template) {
				throw new Error(
					'No template file found.\n' +
						`Tried: ${[...DEFAULT_TEMPLATE_FILES].join(', ')}\n` +
						'👉 Tip: You can pass a custom template as shown:\n' +
						'   blogger({ template: "src/my-template.xml" })',
				);
			}
		}

		this.name = path.basename(this.template, path.extname(this.template));

		for (const modulePath of this.modules) {
			this.headTags.push(
				`<script type="module" src="/${path.relative(this.root, modulePath).replaceAll('\\', '/')}"></script>`,
			);
		}
		for (const stylePath of this.styles) {
			this.headTags.push(
				`<link rel="stylesheet" href="/${path.relative(this.root, stylePath).replaceAll('\\', '/')}">`,
			);
		}

		this.input = `virtual:blogger-plugin/${this.name}.html`;
		this.html = `<!DOCTYPE html>
<html>
<head>
  <!--head-->${this.headTags.length > 0 ? `\n  ${this.headTags.join('\n  ')}` : ''}
</head>
<body>
  <!--body-->
</body>
</html>`;
	}
}

function useServerMiddleware(
	server: ViteDevServer | PreviewServer,
	ctx: BloggerPluginContext,
	_this: MinimalPluginContextWithoutEnvironment,
): () => void {
	const input = ctx.viteConfig.build[VITE_BUNDLER_KEY].input;
	const htmlPathnames: string[] = [];
	for (const entry of Array.isArray(input)
		? input
		: typeof input === 'object'
			? Object.values(input)
			: typeof input === 'string'
				? [input]
				: []) {
		if (entry === ctx.input) {
			continue;
		}
		const entryPath = path.resolve(ctx.root, entry);
		if (!entryPath.endsWith('.html')) {
			continue;
		}
		const relativePath = path.relative(ctx.root, entry).replaceAll('\\', '/');
		htmlPathnames.push(`/${relativePath}`);
		if (relativePath.endsWith('index.html')) {
			htmlPathnames.push(`/${relativePath.replace(/index\.html$/, '')}`);
		}
	}

	return () => {
		server.httpServer?.once('listening', () => {
			setTimeout(() => {
				_this.info(
					`Unhandled requests will be proxied to ${ctx.proxyBlog.origin}`,
				);
			}, 0);
		});

		server.middlewares.use(async (req, res, next) => {
			const url = getRequestUrl(req);

			if (
				!req.url ||
				!req.originalUrl ||
				!url ||
				!req.method ||
				!['GET', 'HEAD'].includes(req.method.toUpperCase()) ||
				htmlPathnames.includes(url.pathname.replace(/\/+/g, '/')) ||
				url.pathname.startsWith('/@')
			) {
				next();
				return;
			}

			const start = Date.now();

			const proxyUrl = new URL(`${ctx.proxyBlog.origin}${req.originalUrl}`);

			const viewParam = proxyUrl.searchParams.get('view');
			proxyUrl.searchParams.set(
				'view',
				`${isViteDevServer(server) ? '-DevServer' : '-PreviewServer'}${viewParam?.startsWith('-') ? viewParam : ''}`,
			);

			const proxyRequest = new Request(proxyUrl, {
				method: req.method,
				headers: toWebHeaders(req.headers),
				redirect: 'manual',
			});

			const proxyResponse = await fetch(proxyRequest).catch((error) => {
				if (error instanceof Error) {
					_this.warn({
						message: `${error.name}: ${error.message}`,
						cause: error.cause,
						stack: error.stack,
					});
				} else {
					_this.warn('Fetch failed');
				}
				return null;
			});

			if (proxyResponse) {
				res.statusCode = proxyResponse.status;
				res.statusMessage = proxyResponse.statusText;

				proxyResponse.headers.forEach((value, key) => {
					if (key === 'location') {
						const redirectUrl = new URL(value, proxyUrl);
						if (
							redirectUrl.host === url.host ||
							redirectUrl.host === proxyUrl.host
						) {
							redirectUrl.host = url.host;
							redirectUrl.protocol = url.protocol;
							const viewParam = redirectUrl.searchParams
								.get('view')
								?.replaceAll('-DevServer', '')
								.replaceAll('-PreviewServer', '');
							if (viewParam) {
								redirectUrl.searchParams.set('view', viewParam);
							} else {
								redirectUrl.searchParams.delete('view');
							}
							res.setHeader(
								'location',
								redirectUrl.pathname + redirectUrl.search + redirectUrl.hash,
							);
						} else {
							res.setHeader('location', redirectUrl.href);
						}
					} else if (
						['content-type', 'x-robots-tag', 'date', 'location'].includes(key)
					) {
						res.setHeader(key, value);
					}
				});

				const contentType = proxyResponse.headers.get('content-type');

				if (contentType?.startsWith('text/html')) {
					let htmlTemplateContent = await proxyResponse.text();

					const secFetchDestHeader = req.headers['sec-fetch-dest'];
					const secFetchModeHeader = req.headers['sec-fetch-mode'];
					if (
						ctx.tailwindCache &&
						isViteDevServer(server) &&
						secFetchDestHeader === 'document' &&
						secFetchModeHeader === 'navigate'
					) {
						await ctx.tailwindCache.update(htmlTemplateContent, 'html');
					}

					htmlTemplateContent = replaceHost(
						htmlTemplateContent,
						proxyUrl.host,
						url.host,
						url.protocol,
					);

					if (isViteDevServer(server)) {
						const template = await server.transformIndexHtml(
							req.url,
							replaceBloggerPluginHeadComment(
								htmlTemplateContent,
								ctx.headTags.join(''),
							),
							req.originalUrl,
						);

						res.end(template);
					} else {
						const xmlTemplateContent = await fs.readFile(
							path.resolve(ctx.viteConfig.build.outDir, TEMPLATE_OUT_FILE),
							'utf8',
						);

						const htmlTagsStr = getBloggerPluginHeadComment(
							xmlTemplateContent,
							true,
						);

						const template = replaceBloggerPluginHeadComment(
							htmlTemplateContent,
							htmlTagsStr ?? '',
						);

						res.end(template);
					}
				} else if (
					contentType &&
					/^(text\/)|(application\/(.*\+)?(xml|json))/.test(contentType)
				) {
					const content = await proxyResponse.text();

					res.end(replaceHost(content, proxyUrl.host, url.host, url.protocol));
				} else {
					res.end(new Uint8Array(await proxyResponse.arrayBuffer()));
				}
			} else {
				res.statusCode = 500;
				res.statusMessage = 'Internal Server Error';

				res.setHeader('Content-Type', 'text/html');

				res.end(errorHtml(proxyUrl.href));
			}

			const duration = Date.now() - start;

			_this.info(
				`${req.method} ${req.originalUrl} -> ${res.statusCode} ${res.statusMessage} (${duration}ms)`,
			);
		});
	};
}

function isViteDevServer(
	server: ViteDevServer | PreviewServer,
): server is ViteDevServer {
	return (
		'hot' in server &&
		'transformRequest' in server &&
		'transformIndexHtml' in server
	);
}
