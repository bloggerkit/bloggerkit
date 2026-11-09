import { getSections, getTopics } from '../content/sections';
import {
	docsRoute,
	getPageMarkdownUrl,
	getPageUrl,
	resources,
} from '../routes';
import { appName, site } from '../site';
import { BLOGGER_SOURCES } from '../ui/blogger-sources';
import { licenseNote } from './license-note';
import { webMcpToolNames } from './webmcp';

/** Also the folder under `/skills/`. Agent Skills allow only lowercase letters and hyphens. */
export const skillName = 'bloggerkit-docs';
export const skillPath = `/skills/${skillName}/SKILL.md`;
export const skillDescription = `Answer questions about building on Blogger, mainly Blogger theme XML (b: tags, expressions, data: values, widgets, the skin), from the ${appName} docs. Use it to look up a tag, an expression or a data value, to find working theme code, or to check whether a behavior is documented by Google or only observed.`;

/**
 * `SKILL.md` of the Agent Skill (https://agentskills.io/specification). Tells agents how to find and read pages,
 * with the current sections and topics.
 */
export function getSkill(): string {
	const url = (path: string) => new URL(path, site).href;
	const sections = getSections().map((section) => {
		const topics = getTopics(section).map((folder) => folder.name);
		return `- **${section.name}** (${url(section.url)}): ${section.description ?? ''}${topics.length > 0 ? ` Topics: ${topics.join(', ')}.` : ''}`;
	});
	return `---
name: ${skillName}
description: ${JSON.stringify(skillDescription)}
---

# ${appName} docs

${appName} documents building on Blogger, at ${url('/')}. Answer from these docs rather than from memory: much of how Blogger themes behave is not written down by Google, and the docs mark which facts are which.

## Sections

${sections.join('\n')}

## Finding a page

1. Read the index, ${url(resources.llms)}: every page by topic, with the URL of its Markdown and a one-line description. Pick the pages that match the question.
2. Read a page as Markdown: its URL with \`.md\` added. ${url(getPageUrl('theme-xml/tags/loops'))} is ${url(getPageMarkdownUrl('theme-xml/tags/loops'))}. A folder, such as ${url(getPageUrl('theme-xml/tags'))}, has no Markdown: its pages are in the index.
3. For a broad question, ${url(resources.llmsFull)} holds every page in one file. It is large: prefer the pages you need.

In a browser with WebMCP, the pages of the site register tools that do the same: ${webMcpToolNames.map((name) => `\`${name}\``).join(', ')}. \`search_docs\` searches the full text, \`read_page\` returns the Markdown of a page and \`get_code_examples\` its code blocks.

## Reading a page

- A fact can be marked with its source:
${[...BLOGGER_SOURCES.values()]
	.map((source) => `  - **${source.label}**: ${source.title}.`)
	.join('\n')}

  Say so when an answer rests on observed behavior, and do not recommend what is deprecated.
- Theme XML in the examples puts single quotes around attributes that hold expressions, as in \`<b:if cond='data:view.isPost'>\`; keep them when adapting an example.
- Link the pages you used, by their URL under ${url(docsRoute)}, so the reader can check them.
- ${licenseNote}
`;
}
