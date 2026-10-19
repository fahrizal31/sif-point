// Pintu masuk Cloudflare Pages (mode lanjutan _worker.js): /api/* ditangani backend, sisanya berkas statis.
// Halaman admin dilindungi dua lapis: Cloudflare Access (di depan) dan pemeriksaan token + akun di sini.
import { handle } from './lib/router.js';
import { emailDariRequest } from './lib/auth.js';
const HALAMAN_ADMIN = ['/admin.html', '/publish.html', '/status.html', '/admin', '/publish', '/status'];
const HDR = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handle(request, env);
    if (HALAMAN_ADMIN.includes(url.pathname)) {
      try {
        const email = await emailDariRequest(request, env);
        const u = await env.DB.prepare('SELECT aktif FROM pengguna WHERE email=?').bind(email).first();
        const boot = String(env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).includes(email);
        if (!(u && u.aktif) && !boot) return new Response('Akun belum terdaftar sebagai admin SIF POINT BATARA. Hubungi Super Admin.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', ...HDR } });
      } catch (e) {
        return new Response('Halaman ini hanya untuk petugas dan harus dibuka lewat Cloudflare Access.', { status: e.status || 401, headers: { 'content-type': 'text/plain; charset=utf-8', ...HDR } });
      }
      const r = await env.ASSETS.fetch(request), h = new Headers(r.headers);
      Object.entries(HDR).forEach(([k, v]) => h.set(k, v)); h.set('cache-control', 'no-store'); h.set('x-frame-options', 'DENY'); h.set('x-robots-tag', 'noindex, nofollow');
      return new Response(r.body, { status: r.status, headers: h });
    }
    const r = await env.ASSETS.fetch(request), h = new Headers(r.headers);
    Object.entries(HDR).forEach(([k, v]) => h.set(k, v));
    return new Response(r.body, { status: r.status, headers: h });
  }
};
