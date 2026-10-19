import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, 'public');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination);
cpSync(join(root, 'situs'), destination, { recursive: true });
rmSync(join(destination, '_worker.js'), { force: true });
console.log('public/ siap untuk Vercel');
