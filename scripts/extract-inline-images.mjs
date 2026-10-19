// Pindahkan gambar base64 dari HTML agar dokumen utama cepat diterima browser.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, 'situs', 'index.html');
const assetsPath = join(root, 'situs', 'assets');
const html = readFileSync(htmlPath, 'utf8');
const pattern = /data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)/g;
let extracted = 0;
const updated = html.replace(pattern, (_, format, encoded) => {
  const data = Buffer.from(encoded, 'base64');
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const extension = format === 'jpeg' ? 'jpg' : format;
  const name = `inline-${digest}.${extension}`;
  mkdirSync(assetsPath, { recursive: true });
  writeFileSync(join(assetsPath, name), data);
  extracted++;
  return `/assets/${name}`;
});
if (extracted) writeFileSync(htmlPath, updated);
console.log(`Gambar inline dipisah: ${extracted}; HTML ${Buffer.byteLength(html)} → ${Buffer.byteLength(updated)} byte`);
