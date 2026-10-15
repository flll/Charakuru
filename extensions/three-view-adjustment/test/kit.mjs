import path from 'node:path';
import {pathToFileURL} from 'node:url';

if (!process.env.CHARAKURU_DIR) throw Error('Set CHARAKURU_DIR to a fresh official v1.0.4 kit. See README.md.');
export const kit = path.resolve(process.env.CHARAKURU_DIR);
export const kitURL = relative => pathToFileURL(path.join(kit, relative));
