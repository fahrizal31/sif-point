import assert from 'node:assert/strict';
import { bukaDb } from '../dev/d1shim.mjs';
import { handle } from '../src/lib/router.js';
import { readSession } from '../src/lib/session.js';
import { mysqlSql } from '../src/lib/tidb.js';
import { forwardApiRequest } from '../api/handler.js';

const DB = bukaDb(':memory:', ['db/schema.sql', 'db/seed.sql']);
const env = { DB, AUTH_MODE: 'session', PII_KEY: Buffer.alloc(32, 7).toString('base64'), SESSION_SECRET: 'local-test-secret-at-least-32-characters', SUPER_ADMIN_EMAILS: 'super@contoh.go.id', RESEND_API_KEY: 'test', MAIL_FROM: 'test@example.com' };
let sent;
const realFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => { sent = JSON.parse(options.body); return new Response('{}', { status: 200 }); };
const post = (path, body, cookie = '') => handle(new Request('https://example.com/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sif': '1', origin: 'https://example.com', cookie }, body: JSON.stringify(body) }), env);
try {
  assert.match(mysqlSql('INSERT OR IGNORE INTO x (a) VALUES (?)'), /^INSERT IGNORE/);
  assert.match(mysqlSql('INSERT INTO x VALUES (?) ON CONFLICT(a) DO UPDATE SET b=excluded.b'), /ON DUPLICATE KEY UPDATE b=VALUES\(b\)/);
  const csv = await forwardApiRequest(new Request('https://example.com/api/handler?path=public%2Fpeluang.csv'), env);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const request = await post('auth/request', { email: 'super@contoh.go.id' });
  assert.equal(request.status, 200);
  assert.equal(sent.to[0], 'super@contoh.go.id');
  const code = sent.text.match(/\b\d{6}\b/)[0];
  assert.equal((await post('auth/verify', { email: 'super@contoh.go.id', code: code === '000000' ? '111111' : '000000' })).status, 401);
  const verify = await post('auth/verify', { email: 'super@contoh.go.id', code });
  assert.equal(verify.status, 200);
  const cookie = verify.headers.get('set-cookie').split(';')[0];
  assert.equal(await readSession(env, cookie), 'super@contoh.go.id');
  const me = await handle(new Request('https://example.com/api/me', { headers: { cookie } }), env);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).peran, 'super');
  assert.equal((await post('auth/verify', { email: 'super@contoh.go.id', code })).status, 401);
  const logout = await post('auth/logout', {}, cookie);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  console.log('Vercel auth dan konversi SQL OK');
} finally { globalThis.fetch = realFetch; }
