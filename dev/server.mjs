// Server uji lokal: melayani berkas statis + /api dengan basis data SQLite lokal. Peran diuji lewat header X-Dev-Email (hanya localhost).
// Pakai: node dev/server.mjs [port]   (butuh Node 22+)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { bukaDb } from './d1shim.mjs'; import { handle } from '../src/lib/router.js';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), root = path.join(base, 'situs');
const port = +process.argv[2] || 8788;
const dbFile = process.env.DB_FILE || ':memory:';
const db = bukaDb(dbFile, [path.join(base, 'db/schema.sql')]);
if (!db._raw.prepare('SELECT COUNT(*) n FROM baris').get().n) db.exec(fs.readFileSync(path.join(base, 'db/seed.sql'), 'utf8'));
const env = { DB: db, DEV_MODE: '1', AUTH_MODE: 'session', SESSION_SECRET: process.env.SESSION_SECRET || 'sif-local-only-session-secret-32-chars', PII_KEY: process.env.PII_KEY || Buffer.alloc(32, 7).toString('base64'), SUPER_ADMIN_EMAILS: process.env.SUPER_ADMIN_EMAILS || 'super@contoh.go.id', SITE_URL: 'http://localhost:' + port };
export { env, db };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp4': 'video/mp4', '.css': 'text/css' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:' + port);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500); res.end('error'); }
}).listen(port, '127.0.0.1', () => console.log('SIF POINT BATARA uji lokal: http://localhost:' + port));
