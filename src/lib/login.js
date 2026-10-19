import { HttpError, bodyJson, nowIso } from './util.js';
import { hmacHex } from './crypto.js';
import { hashPassword, validPassword, validUsername, verifyPassword } from './password.js';
import { makeSession, readSessionData, sessionCookie, clearSessionCookie } from './session.js';

const DUMMY_HASH = 'pbkdf2-sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
const INVALID = 'Username atau password salah';

async function limit(env, key, max) {
  const k = 'login|' + await hmacHex(env, key);
  const window = String(Math.floor(Date.now() / 3600_000));
  const row = await env.DB.prepare('SELECT n,jendela FROM ratelimit WHERE kunci=?').bind(k).first();
  if (row && row.jendela === window && Number(row.n) >= max) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi nanti.');
  await env.DB.prepare('INSERT INTO ratelimit (kunci,n,jendela) VALUES (?,1,?) ON CONFLICT(kunci) DO UPDATE SET n=CASE WHEN jendela=? THEN n+1 ELSE 1 END, jendela=?').bind(k, window, window, window).run();
}

export async function handleLogin(request, env, action) {
  if (env.AUTH_MODE !== 'session') throw new HttpError(404, 'Tidak ditemukan');
  if (request.method !== 'POST') throw new HttpError(405, 'Gunakan POST');
  const secure = new URL(request.url).protocol === 'https:';
  if (action === 'logout') return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': clearSessionCookie(secure) } });
  if (action === 'change-password') {
    const session = await readSessionData(env, request.headers.get('cookie'));
    if (!session) throw new HttpError(401, 'Sesi berakhir. Masuk kembali.');
    const body = await bodyJson(request, 2048);
    if (!validPassword(body.password_baru)) throw new HttpError(400, 'Password baru minimal 12 dan maksimal 128 karakter');
    const row = await env.DB.prepare('SELECT password_hash,versi FROM kredensial WHERE email=?').bind(session.email).first();
    if (!row || Number(row.versi) !== Number(session.version) || !await verifyPassword(body.password_lama, row.password_hash)) throw new HttpError(401, 'Password lama salah');
    const hash = await hashPassword(body.password_baru);
    const changed = await env.DB.prepare('UPDATE kredensial SET password_hash=?,versi=versi+1,diubah=? WHERE email=? AND versi=?').bind(hash, nowIso(), session.email, row.versi).run();
    if (!changed.meta.changes) throw new HttpError(409, 'Password sudah berubah. Masuk kembali.');
    const token = await makeSession(env, session.email, Number(row.versi) + 1);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': sessionCookie(token, secure) } });
  }
  if (action !== 'login') throw new HttpError(404, 'Tidak ditemukan');
  const body = await bodyJson(request, 2048);
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  await limit(env, 'ip:' + ip, 30);
  if (!validUsername(username) || !validPassword(password)) throw new HttpError(401, INVALID);
  await limit(env, 'user:' + username, 20);
  const row = await env.DB.prepare('SELECT k.email,k.password_hash,k.versi,p.aktif FROM kredensial k JOIN pengguna p ON p.email=k.email WHERE k.username=?').bind(username).first();
  const ok = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !row.aktif || !ok) throw new HttpError(401, INVALID);
  await env.DB.prepare('UPDATE pengguna SET terakhir_masuk=? WHERE email=?').bind(nowIso(), row.email).run();
  const token = await makeSession(env, row.email, Number(row.versi));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': sessionCookie(token, secure) } });
}
