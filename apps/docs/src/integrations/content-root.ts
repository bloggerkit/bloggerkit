import { resolve } from 'node:path';
import { contentDir } from '../lib/routes';

/** The content folder's absolute path, for integrations that read the files. */
export const contentRoot = resolve(process.cwd(), contentDir);
