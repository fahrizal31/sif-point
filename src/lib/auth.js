// Identitas admin berasal dari sesi bertanda tangan di Vercel atau Cloudflare Access.
import { HttpError, nowIso } from './util.js';
import { readSession, readSessionData } from './session.js';
let jwksCache = { t: 0, keys: null };
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

async function jwks(env) {
  if (jwksCache.keys && Date.now() - jwksCache.t < 3600e3) return jwksCache.keys;
  const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!r.ok) throw new HttpError(503, 'Gagal mengambil kunci Cloudflare Access');
  jwksCache = { t: Date.now(), keys: (await r.json()).keys };
  return jwksCache.keys;
}
export async function verifyAccessJwt(token, env) {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) throw new HttpError(401, 'Token tidak valid');
  const head = JSON.parse(new TextDecoder().decode(b64u(h))), pay = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (head.alg !== 'RS256') throw new HttpError(401, 'Algoritma token tidak diterima');
  const k = (await jwks(env)).find(x => x.kid === head.kid);
  if (!k) { jwksCache.t = 0; throw new HttpError(401, 'Kunci token tidak dikenal'); }
  const key = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new HttpError(401, 'Tanda tangan token salah');
  const aud = [].concat(pay.aud || []);
  if (!env.ACCESS_AUD || !aud.includes(env.ACCESS_AUD)) throw new HttpError(401, 'Audiens token tidak sesuai');
  if (pay.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new HttpError(401, 'Penerbit token tidak sesuai');
  if (!pay.exp || pay.exp * 1000 < Date.now()) throw new HttpError(401, 'Sesi berakhir, muat ulang halaman');
  if (!pay.email) throw new HttpError(401, 'Token tanpa surel');
  return String(pay.email).toLowerCase();
}
export async function emailDariRequest(request, env) {
  const url = new URL(request.url);
  // Mode uji lokal: hanya bila DEV_MODE=1 DAN host localhost. Jangan pernah diatur pada produksi.
  if (env.DEV_MODE === '1' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
    const e = request.headers.get('x-dev-email');
    if (e) return e.toLowerCase();
  }
  if (env.AUTH_MODE === 'session') {
    const email = await readSession(env, request.headers.get('cookie'));
    if (!email) throw new HttpError(401, 'Sesi berakhir. Masuk kembali melalui halaman login.');
    return email;
  }
  const tok = request.headers.get('cf-access-jwt-assertion');
  if (!tok) throw new HttpError(401, 'Belum masuk. Halaman ini harus dibuka lewat Cloudflare Access.');
  return verifyAccessJwt(tok, env);
}
export async function authenticate(request, env) {
  const email = await emailDariRequest(request, env);
  const boot = String(env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  let u = await env.DB.prepare('SELECT * FROM pengguna WHERE email=?').bind(email).first();
  if (!u && boot.includes(email)) {
    await env.DB.prepare('INSERT INTO pengguna (email,nama,jabatan,instansi,peran,aktif,terima_email,dibuat) VALUES (?,?,?,?,?,1,1,?)')
      .bind(email, email.split('@')[0], 'Super Admin (awal)', 'DPMPTSP', 'super', nowIso()).run();
    u = await env.DB.prepare('SELECT * FROM pengguna WHERE email=?').bind(email).first();
  }
  if (!u || !u.aktif) throw new HttpError(403, 'Akun Anda belum terdaftar sebagai admin SIF POINT BATARA. Hubungi Super Admin.');
  if (env.AUTH_MODE === 'session' && !(env.DEV_MODE === '1' && request.headers.get('x-dev-email') && ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname))) {
    const session = await readSessionData(env, request.headers.get('cookie'));
    const credential = await env.DB.prepare('SELECT versi FROM kredensial WHERE email=?').bind(email).first();
    if (!session || !credential || Number(session.version) !== Number(credential.versi)) throw new HttpError(401, 'Sesi berakhir. Masuk kembali melalui halaman login.');
  }
  await env.DB.prepare('UPDATE pengguna SET terakhir_masuk=? WHERE email=?').bind(nowIso(), email).run();
  return u;
}
export function csrf(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const o = request.headers.get('origin'), host = new URL(request.url).host;
  if (o && new URL(o).host !== host) throw new HttpError(403, 'Asal permintaan tidak diizinkan');
  if (request.headers.get('x-sif') !== '1') throw new HttpError(403, 'Header keamanan tidak ada');
}
export const isSuper = u => u.peran === 'super';
export const isVerif = u => u.peran === 'verifikator' || u.peran === 'super';
