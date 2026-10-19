import assert from 'node:assert/strict';
import { bukaDb } from '../dev/d1shim.mjs';
import worker from '../situs/_worker.js';
const db = bukaDb(':memory:', ['db/schema.sql', 'db/seed.sql']);
const env = { DB: db, DEV_MODE: '1', PII_KEY: Buffer.alloc(32, 3).toString('base64'), SUPER_ADMIN_EMAILS: 'super@x.go.id', ASSETS: { fetch: async r => new Response('<html>' + new URL(r.url).pathname + '</html>', { headers: { 'content-type': 'text/html' } }) } };
const get = (p, h = {}, host = 'localhost') => worker.fetch(new Request('http://' + host + p, { headers: h }), env);
let r = await get('/api/public/peluang.csv'); assert.equal(r.status, 200); assert.equal((await r.text()).trim().split('\r\n').length, 14);
r = await get('/'); assert.equal(r.status, 200); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
for (const p of ['/admin.html', '/publish.html', '/status.html']) {
  assert.equal((await get(p)).status, 401, p + ' tanpa login');
  assert.equal((await get(p, { 'x-dev-email': 'asing@x.id' })).status, 403, p + ' akun asing');
  const ok = await get(p, { 'x-dev-email': 'super@x.go.id' }); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store'); assert.equal(ok.headers.get('x-frame-options'), 'DENY');
}
assert.equal((await get('/admin.html', { 'x-dev-email': 'super@x.go.id' }, 'sif.example.go.id')).status, 401, 'DEV header tak berlaku di domain asli');
console.log('worker OK');
