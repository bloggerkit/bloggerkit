import * as fs from 'node:fs/promises';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { Connect } from 'vite';

export async function fsExists(path: string): Promise<boolean> {
	return fs.access(path, fs.constants.F_OK).then(
		() => true,
		() => false,
	);
}

export function escapeHtml(str: string): string {
	if (str === '') {
		return '';
	}
	return str.replace(/[&<>"'`]/g, (ch) => {
		switch (ch) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			case '`':
				return '&#96;';
			default:
				return ch;
		}
	});
}

export function unescapeHTML(str: string, xml = false): string {
	if (str === '') {
		return '';
	}
	const regex = new RegExp(
		`&(?:amp|lt|gt|quot${xml ? '|apos' : ''}|#39|#96);`,
		'g',
	);
	return str.replace(regex, (entity) => {
		switch (entity) {
			case '&amp;':
				return '&';
			case '&lt;':
				return '<';
			case '&gt;':
				return '>';
			case '&quot;':
				return '"';
			case '&apos;':
			case '&#39;':
				return "'";
			case '&#96;':
				return '`';
			default:
				return entity;
		}
	});
}

export function escapeRegex(str: string): string {
	return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}

export function toWebHeaders(
	httpHeaders: IncomingHttpHeaders | OutgoingHttpHeaders,
): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(httpHeaders)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(name, item);
			}
		} else {
			headers.set(name, String(value ?? ''));
		}
	}
	return headers;
}

export const BLOGGER_PLUGIN_HEAD_COMMENT_REGEX =
	/(<!--blogger-plugin:head:begin-->)([\s\S]*?)(<!--blogger-plugin:head:end-->)/;

export const BLOGGER_PLUGIN_HEAD_BCOMMENT_REGEX =
	/(<b:comment><!--blogger-plugin:head:begin--><\/b:comment>)([\s\S]*?)(<b:comment><!--blogger-plugin:head:end--><\/b:comment>)/;

export function replaceBloggerPluginHeadComment(
	input: string,
	replacement: string,
	bcomment = false,
): string {
	if (bcomment) {
		return input.replace(
			BLOGGER_PLUGIN_HEAD_BCOMMENT_REGEX,
			(_, start: string, _content: string, end: string) =>
				`${start}${replacement}${end}`,
		);
	}
	return input.replace(
		BLOGGER_PLUGIN_HEAD_COMMENT_REGEX,
		(_, start: string, _content: string, end: string) =>
			`${start}${replacement}${end}`,
	);
}

export function getBloggerPluginHeadComment(
	input: string,
	bcomment = false,
): string | null {
	if (bcomment) {
		return input.match(BLOGGER_PLUGIN_HEAD_BCOMMENT_REGEX)?.[2] ?? null;
	}
	return input.match(BLOGGER_PLUGIN_HEAD_COMMENT_REGEX)?.[2] ?? null;
}

export function replaceHost(
	input: string,
	oldHost: string,
	newHost: string,
	newProtocol?: string,
): string {
	return input.replace(
		new RegExp(`(https?:)?(\\/\\/|\\\\/\\\\/)${escapeRegex(oldHost)}`, 'g'),
		(_, protocol, slash) =>
			`${protocol ? (newProtocol ?? protocol) : ''}${slash ?? ''}${newHost}`,
	);
}

export function getRequestUrl(req: Connect.IncomingMessage): URL | null {
	const xForwardedProtoHeader = req.headers['x-forwarded-proto'];
	const xForwardedHostHeader = req.headers['x-forwarded-host'];
	const hostHeader = req.headers.host;

	const protocol = Array.isArray(xForwardedProtoHeader)
		? xForwardedProtoHeader[0]
		: (xForwardedProtoHeader ??
			(req.socket && 'encrypted' in req.socket && req.socket.encrypted
				? 'https'
				: 'http'));
	const host = Array.isArray(xForwardedHostHeader)
		? xForwardedHostHeader[0]
		: (xForwardedHostHeader ?? hostHeader);

	if (host && req.originalUrl) {
		return new URL(`${protocol}://${host}${req.originalUrl}`);
	}

	return null;
}

export function isBloggerPath(path: string): boolean {
	return (
		path === '/' ||
		path === '/search' ||
		/^\/search\/label(\/[^/]+)?\/?$/.test(path) ||
		/^p\/.+\.html$/.test(path) ||
		/^\/\d{4}\/\d{2}(\/?|\/[^/\s]+\.html)$/.test(path)
	);
}

const TAILWIND_PLUGIN_NAMES = new Set(['@tailwindcss/vite:scan']);

export function isTailwindPlugin(plugin: { name: string }): boolean {
	return TAILWIND_PLUGIN_NAMES.has(plugin.name);
}

export function errorHtml(reqUrl: string): string {
	return `<!DOCTYPE html>
<html>

<head>
  <meta charset='UTF-8'/>
  <meta content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes' name='viewport'/>
  <title>500 Internal Server Error</title>
  <link rel='icon' href='data:,' />
  <style>
    *, ::before, ::after {
      box-sizing: border-box;
    }
    body {
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji";
    }
    .card {
      padding: 24px;
      background-color: #ffffff;
      border: 1px solid #e5e5e5;
      max-width: 448px;
      border-radius: 14px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .card-content {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .card-title {
      font-weight: 600;
    }
    .card-description {
      font-size: 14px;
      opacity: 0.85;
    }
    .card-footer {
      display: flex;
      align-items: center;
    }
    .button {
      display: inline-flex;
      white-space: nowrap;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      font-weight: 500;
      background-color: #171717;
      outline: none;
      border: none;
      color: #ffffff;
      border-radius: 8px;
      min-height: 36px;
    }
    .button:hover {
      opacity: 0.9;
    }
    .button svg {
      wiheadersdth: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .card-footer .button {
      flex-grow: 1;
    }
  </style>
</head>

<body>
  <div class='card'>
    <div class='card-content'>
      <div class='card-title'>500 Internal Server Error</div>
      <div class='card-description'>Failed to fetch: ${escapeHtml(reqUrl)}</div>
    </div>
    <div class='card-footer'>
      <button class='button' type='button'>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>
        Reload
      </button>
    </div>
  </div>
  <script>
    const button = document.getElementsByTagName('button')[0];
    button.addEventListener('click', () => {
      window.location.reload();
    });
  </script>
</body>

</html>`;
}
