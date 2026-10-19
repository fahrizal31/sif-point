import { HttpError, bodyJson, json } from './util.js';
import { hmacHex } from './crypto.js';
import { kirimEmail } from './notif.js';
import { makeSession, sessionCookie, clearSessionCookie } from './session.js';

const emailValid = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const bootstrap = (env, email) => String(env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).includes(email);

async function allowed(env, email) {
  const account = await env.DB.prepare('SELECT aktif FROM pengguna WHERE email=?').bind(email).first();
  return !!(account?.aktif || (!account && bootstrap(env, email)));
}

async function rateLimit(env, request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const key = 'login|' + await hmacHex(env, ip);
  const window = String(Math.floor(Date.now() / 3600_000));
  const row = await env.DB.prepare('SELECT n,jendela FROM ratelimit WHERE kunci=?').bind(key).first();
  if (row && row.jendela === window && row.n >= 20) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi nanti.');
  await env.DB.prepare('INSERT INTO ratelimit (kunci,n,jendela) VALUES (?,1,?) ON CONFLICT(kunci) DO UPDATE SET n=CASE WHEN jendela=? THEN n+1 ELSE 1 END, jendela=?').bind(key, window, window, window).run();
}

export async function handleLogin(request, env, action) {
  if (env.AUTH_MODE !== 'session') throw new HttpError(404, 'Tidak ditemukan');
  if (request.method !== 'POST') throw new HttpError(405, 'Gunakan POST');
  if (action === 'logout') return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(new URL(request.url).protocol === 'https:') } });
  await rateLimit(env, request);
  const body = await bodyJson(request, 1000);
  const email = String(body.email || '').trim().toLowerCase();
  if (!emailValid(email) || email.length > 255) throw new HttpError(400, 'Alamat surel tidak valid');
  if (action === 'request') {
    if (!await allowed(env, email)) return json({ ok: true });
    const local = env.DEV_MODE === '1' && ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
    if (!local && (!env.RESEND_API_KEY || !env.MAIL_FROM)) throw new HttpError(503, 'Layanan email login belum dikonfigurasi');
    const now = Date.now();
    const old = await env.DB.prepare('SELECT sent_at,window_start,sent_count FROM login_code WHERE email=?').bind(email).first();
    if (old && now - Number(old.sent_at) < 60_000) throw new HttpError(429, 'Tunggu satu menit sebelum meminta kode lagi');
    const count = old && now - Number(old.window_start) < 3600_000 ? Number(old.sent_count) + 1 : 1;
    if (count > 5) throw new HttpError(429, 'Batas permintaan kode tercapai. Coba lagi satu jam lagi.');
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const hash = await hmacHex({ PII_KEY: env.SESSION_SECRET }, email + ':' + code);
    await env.DB.prepare('INSERT INTO login_code (email,code_hash,expires_at,attempts,sent_at,window_start,sent_count) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at,window_start=excluded.window_start,sent_count=excluded.sent_count')
      .bind(email, hash, now + 10 * 60_000, 0, now, count === 1 ? now : Number(old.window_start), count).run();
    const result = local ? 'terkirim' : await kirimEmail(env, email, '[SIF POINT BATARA] Kode masuk', `Kode masuk Anda: ${code}. Berlaku 10 menit. Jangan berikan kode ini kepada siapa pun.`);
    if (result !== 'terkirim') {
      await env.DB.prepare('DELETE FROM login_code WHERE email=?').bind(email).run();
      throw new HttpError(503, 'Kode gagal dikirim. Periksa konfigurasi layanan email.');
    }
    return json(local ? { ok: true, dev_code: code } : { ok: true });
  }
  if (action === 'verify') {
    const code = String(body.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Kode harus enam angka');
    const row = await env.DB.prepare('SELECT code_hash,expires_at,attempts FROM login_code WHERE email=?').bind(email).first();
    if (!row || Number(row.expires_at) < Date.now() || Number(row.attempts) >= 5) throw new HttpError(401, 'Kode salah atau kedaluwarsa');
    await env.DB.prepare('UPDATE login_code SET attempts=attempts+1 WHERE email=?').bind(email).run();
    const expected = await hmacHex({ PII_KEY: env.SESSION_SECRET }, email + ':' + code);
    if (row.code_hash !== expected || !await allowed(env, email)) throw new HttpError(401, 'Kode salah atau kedaluwarsa');
    await env.DB.prepare('DELETE FROM login_code WHERE email=?').bind(email).run();
    const token = await makeSession(env, email);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': sessionCookie(token, new URL(request.url).protocol === 'https:') } });
  }
  throw new HttpError(404, 'Tidak ditemukan');
}
