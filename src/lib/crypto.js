// Enkripsi tingkat kolom (AES-256-GCM) untuk data pribadi/rahasia (UU 27/2022): kontak mitra, permintaan data, pendaftaran mitra.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function key(env, usage) {
  if (!env.PII_KEY) throw new Error('PII_KEY belum diatur');
  const raw = unb64(env.PII_KEY);
  if (raw.length !== 32) throw new Error('PII_KEY harus 32 byte (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}
export async function sealJson(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env, 'encrypt'), enc.encode(JSON.stringify(obj))));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}
export async function openJson(env, s) {
  const [v, iv, ct] = String(s).split('.');
  if (v !== 'v1') throw new Error('format tidak dikenal');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env, 'decrypt'), unb64(ct));
  return JSON.parse(dec.decode(pt));
}
export async function hmacHex(env, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.PII_KEY || 'dev'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
