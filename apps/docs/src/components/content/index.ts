// Components passed to MDX: replacements for h2–h4 and `<pre>`, plus the components every page can use
import * as mdx from '@/components/mdx';
import H2 from './H2.astro';
import H3 from './H3.astro';
import H4 from './H4.astro';
import Pre from './Pre.astro';

export const components = { ...mdx, h2: H2, h3: H3, h4: H4, pre: Pre };
