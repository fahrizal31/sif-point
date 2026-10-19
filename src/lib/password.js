// Password admin disimpan sebagai PBKDF2-HMAC-SHA256 dengan salt acak per akun.
const enc = new TextEncoder();
const ITERATIONS = 600000;
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g) || [], pair => parseInt(pair, 16));

export function validUsername(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9._-]{2,39}$/.test(value);
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && enc.encode(value).length <= 256;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Password minimal 12 dan maksimal 128 karakter');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${hex(salt)}$${hex(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password, stored) {
  if (!validPassword(password)) return false;
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || !/^\d+$/.test(parts[1]) || !/^[0-9a-f]{32}$/.test(parts[2]) || !/^[0-9a-f]{64}$/.test(parts[3])) return false;
  const iterations = Number(parts[1]);
  if (iterations < 600000 || iterations > 2000000) return false;
  const expected = unhex(parts[3]), actual = await derive(password, unhex(parts[2]), iterations);
  return actual.reduce((diff, byte, index) => diff | (byte ^ expected[index]), 0) === 0;
}
