const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));

function secret(env) {
  const value = env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET minimal 32 karakter');
  return value;
}

async function sign(env, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

export async function makeSession(env, email) {
  const payload = b64u(enc.encode(JSON.stringify({ email, exp: Date.now() + 12 * 3600_000 })));
  return payload + '.' + await sign(env, payload);
}

export async function readSession(env, cookieHeader) {
  const token = String(cookieHeader || '').split(';').map(x => x.trim()).find(x => x.startsWith('sif_session='))?.slice(12);
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = await sign(env, payload);
  const a = enc.encode(signature), b = enc.encode(expected);
  if (a.length !== b.length || a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0)) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    return value.exp > Date.now() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email) ? value.email : null;
  } catch { return null; }
}

export const sessionCookie = (token, secure = true) => `sif_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? '; Secure' : ''}`;
export const clearSessionCookie = (secure = true) => `sif_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
