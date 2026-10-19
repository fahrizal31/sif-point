// Pisahkan CSS dan JavaScript besar agar HTML cepat diterima dan aset dapat di-cache.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, 'situs', 'index.html');
const assetsPath = join(root, 'situs', 'assets');
let html = readFileSync(htmlPath, 'utf8');
const originalBytes = Buffer.byteLength(html);
const asset = (content, extension) => {
  mkdirSync(assetsPath, { recursive: true });
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const name = `site-${digest}.${extension}`;
  writeFileSync(join(assetsPath, name), content);
  return `/assets/${name}`;
};

const style = html.match(/<style>([\s\S]*?)<\/style>/);
if (style && style[1].length > 10_000) {
  html = html.replace(style[0], `<link rel="stylesheet" href="${asset(style[1], 'css')}">`);
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .filter(match => match[1].length > 5_000);
if (scripts.length === 3) {
  const first = scripts[0];
  const last = scripts.at(-1);
  const span = html.slice(first.index, last.index + last[0].length);
  const onlyScripts = span.replace(/<script>[\s\S]*?<\/script>/g, '');
  if (onlyScripts.trim()) throw new Error('Ada markup di antara script; pemisahan dibatalkan');
  const combined = scripts.map(match => match[1]).join('\n;\n');
  html = html.replace(span, `<script defer src="${asset(combined, 'js')}"></script>`);
}

if (Buffer.byteLength(html) !== originalBytes) writeFileSync(htmlPath, html);
console.log(`CSS/JS inline dipisah: HTML ${originalBytes} → ${Buffer.byteLength(html)} byte`);
