// Fungsi bantu umum. Zona waktu acuan: WIB (UTC+7).
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const bad = (m, s = 400) => { throw new HttpError(s, m); };
export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });
export const nowIso = () => new Date().toISOString();
// Tanggal/jam WIB sebagai objek {y,m,d,h,iso:'YYYY-MM-DD'}
export function wib(date = new Date()) {
  const t = new Date(date.getTime() + 7 * 3600 * 1000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  const p = n => String(n).padStart(2, '0');
  return { y, m, d, h: t.getUTCHours(), dow: t.getUTCDay(), iso: `${y}-${p(m)}-${p(d)}` };
}
// Triwulan data yang paling akhir berakhir (data wajib disampaikan paling lambat tanggal 10 bulan pertama triwulan berikutnya; Keputusan Bupati, Diktum KEENAM).
export function periodeData(date = new Date()) {
  const { y, m } = wib(date);
  const q = Math.ceil(m / 3); // triwulan berjalan
  const tw = q === 1 ? 4 : q - 1, tahun = q === 1 ? y - 1 : y;
  const bulanTenggat = q === 1 ? 1 : (q - 1) * 3 + 1; // Jan, Apr, Jul, Okt
  const tahunTenggat = y;
  const p = n => String(n).padStart(2, '0');
  return { id: `${tahun}-TW${tw}`, tahun, tw, buka: `${tahunTenggat}-${p(bulanTenggat)}-01`, tenggat: `${tahunTenggat}-${p(bulanTenggat)}-10`, label: `Triwulan ${['I','II','III','IV'][tw - 1]} ${tahun}` };
}
export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(cols, rows) {
  return [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\r\n') + '\r\n';
}
export const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
export const str = (v, max = 2000) => (v == null ? '' : String(v)).slice(0, max).trim();
export async function bodyJson(request, maxBytes = 200000) {
  const t = await request.text();
  if (t.length > maxBytes) bad('Isi permintaan terlalu besar', 413);
  try { return t ? JSON.parse(t) : {}; } catch { bad('Format JSON tidak valid'); }
}
export const randId = (n = 4) => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => A[b % A.length]).join(''); };
