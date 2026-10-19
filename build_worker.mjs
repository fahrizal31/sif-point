// Perekat modul sederhana (tanpa paket luar): menggabungkan src/worker.js dan src/lib/*.js menjadi situs/_worker.js.
// Jalankan: node build_worker.mjs   (Node 18+)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(root, 'src/worker.js');
const order = [], seen = new Set();
const impRe = /^import\s+\{([^}]*)\}\s+from\s+'([^']+)';?\s*$/gm;
function visit(file) {
  if (seen.has(file)) return; seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(impRe)) visit(path.resolve(path.dirname(file), m[2]));
  order.push(file);
}
visit(entry);
const id = f => path.relative(path.join(root, 'src'), f);
let out = '// BERKAS HASIL BUILD (jangan disunting). Sumber: src/. Dibuat dengan: node build_worker.mjs\nconst __m = {};\n';
for (const f of order) {
  let src = fs.readFileSync(f, 'utf8'), names = [];
  src = src.replace(impRe, (_, list, from) => {
    const items = list.split(',').map(s => s.trim()).filter(Boolean).map(s => s.includes(' as ') ? s.replace(/^(\S+)\s+as\s+(\S+)$/, '$1: $2') : s);
    return `const { ${items.join(', ')} } = __m[${JSON.stringify(id(path.resolve(path.dirname(f), from)))}];`;
  });
  if (f === entry) { out += src.replace(/^export default /m, 'const __default = ') + '\nexport default __default;\n'; continue; }
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
  if (/^export\s+(default|\{)/m.test(src)) throw new Error('export bentuk lain belum didukung: ' + f);
  out += `__m[${JSON.stringify(id(f))}] = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}
fs.mkdirSync(path.join(root, 'situs'), { recursive: true });
fs.writeFileSync(path.join(root, 'situs/_worker.js'), out);
console.log('situs/_worker.js', out.length, 'byte dari', order.length, 'berkas');
