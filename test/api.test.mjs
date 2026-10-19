import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bukaDb } from '../dev/d1shim.mjs';
import { handle } from '../src/lib/router.js';
import { jalankanPengingat } from '../src/lib/notif.js';
import { verifyAccessJwt } from '../src/lib/auth.js';
const db = bukaDb(':memory:', ['db/schema.sql', 'db/seed.sql']);
const env = { DB: db, DEV_MODE: '1', PII_KEY: Buffer.alloc(32, 9).toString('base64'), SUPER_ADMIN_EMAILS: 'super@x.go.id' };
let ok = 0; const t = (n, c) => { ok++; };
async function api(method, path, { as, body, noCsrf, headers = {} } = {}) {
  const h = { ...headers }; if (as) h['x-dev-email'] = as; if (method !== 'GET' && !noCsrf) h['x-sif'] = '1';
  const r = await handle(new Request('http://localhost' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { s: r.status, j, txt };
}
const S = 'super@x.go.id';
// --- akun
assert.equal((await api('GET', '/api/me')).s, 401, 'tanpa login ditolak'); t();
assert.equal((await api('GET', '/api/me', { as: 'asing@x.id' })).s, 403, 'tidak terdaftar ditolak'); t();
assert.equal((await api('GET', '/api/me', { as: S })).j.peran, 'super'); t();
const mk = async (email, peran, instansi) => assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email, nama: email.split('@')[0], peran, instansi } })).s, 200);
await mk('distan@x.go.id', 'pic', 'DISTAN'); await mk('dagrin@x.go.id', 'pic', 'DISDAGRIN'); await mk('dlh@x.go.id', 'pic', 'DLH'); await mk('nakertrans@x.go.id', 'pic', 'DISNAKERTRANSKOP');
await mk('v1@x.go.id', 'verifikator', 'DPMPTSP'); await mk('v2@x.go.id', 'verifikator', 'DPMPTSP'); await mk('kominfo@x.go.id', 'super', 'DISKOMINFOSANDI');
assert.equal((await api('POST', '/api/pengguna', { as: 'distan@x.go.id', body: { email: 'z@x.id', peran: 'super', instansi: 'DPMPTSP' } })).s, 403); t();
assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email: 'bapp@x.go.id', peran: 'pic', instansi: 'BAPPERIDA' } })).s, 400, 'Bapperida bukan admin pengisi'); t();
assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email: 'x@x.go.id', peran: 'verifikator', instansi: 'DISTAN' } })).s, 400); t();
assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email: S, peran: 'pic', instansi: 'DISTAN' } })).s, 409, 'tidak bisa turunkan diri'); t();
assert.equal((await api('POST', '/api/me', { as: S, noCsrf: true })).s, 403); t();
// --- CSV publik
let pel = await api('GET', '/api/public/peluang.csv'); assert.equal(pel.s, 200);
assert.equal(pel.txt.trim().split('\r\n').length - 1, 13, '13 peluang publik'); t();
let prod = await api('GET', '/api/public/produksi.csv');
assert.equal(prod.txt.trim().split('\r\n').length - 1, 118, 'hanya baris terbit=ya (118)'); t();
assert.equal((await api('GET', '/api/public/mitra.csv')).txt.trim().split('\r\n').length, 1); t();
assert.equal((await api('GET', '/api/public/log_penerimaan.csv')).s, 404); t();
assert.equal((await api('GET', '/api/public/kontak_mitra.csv')).s, 404); t();
// --- wali data
const dsd = (await api('GET', '/api/datasets', { as: 'distan@x.go.id' })).j.datasets.map(d => d.kode).sort();
assert.deepEqual(dsd, ['kecamatan', 'penunjang', 'produksi']); t();
const dsm = (await api('GET', '/api/datasets', { as: 'dagrin@x.go.id' })).j.datasets.map(d => d.kode).sort();
assert.deepEqual(dsm, ['kecamatan', 'penunjang']); t();
assert.equal((await api('GET', '/api/data/peluang', { as: 'distan@x.go.id' })).s, 403); t();
const kecs = (await api('GET', '/api/data/kecamatan', { as: 'distan@x.go.id' })).j;
assert.deepEqual(kecs.kolom_edit, ['komoditas_utama']); t();
const k1 = kecs.baris[0];
assert.equal((await api('POST', '/api/usulan', { as: 'distan@x.go.id', body: { dataset: 'kecamatan', baris_id: k1.id, data: { pasar: 'x' } } })).s, 403, 'kolom milik Disdagrin'); t();
assert.equal((await api('POST', '/api/usulan', { as: 'dagrin@x.go.id', body: { dataset: 'kecamatan', baris_id: k1.id, data: { pasar: 'pasar uji 1' } } })).s, 200); t();
// --- alur usulan produksi
const pr = (await api('GET', '/api/data/produksi?q=durian', { as: 'distan@x.go.id' })).j.baris;
const row = pr.find(r => r.terbit === 'ya'), pubAwal = (await api('GET', '/api/public/produksi.csv')).txt;
const u = await api('POST', '/api/usulan', { as: 'distan@x.go.id', body: { dataset: 'produksi', baris_id: row.id, data: { produksi_ton: '9999,9' } } }); assert.equal(u.s, 200);
assert.equal((await api('POST', '/api/usulan', { as: 'distan@x.go.id', body: { dataset: 'produksi', baris_id: row.id, data: { produksi_ton: 'abc' } } })).s, 400, 'angka tidak valid'); t();
assert.equal((await api('POST', '/api/usulan/' + u.j.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'setujui' } })).s, 409, 'draf belum diajukan'); t();
const aj = await api('POST', '/api/usulan/ajukan', { as: 'distan@x.go.id', body: {} }); assert.equal(aj.j.diajukan, 1);
const nv = (await api('GET', '/api/notifikasi', { as: 'v1@x.go.id' })).j.notifikasi; assert.ok(nv.some(n => /usulan data dari DISTAN/.test(n.judul)), 'verifikator dapat notifikasi'); t();
assert.equal((await api('POST', '/api/usulan/' + u.j.id + '/verifikasi', { as: 'distan@x.go.id', body: { aksi: 'setujui' } })).s, 403, 'PIC tidak boleh verifikasi'); t();
assert.equal((await api('POST', '/api/usulan/' + u.j.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'kembalikan' } })).s, 400, 'catatan wajib'); t();
assert.equal((await api('POST', '/api/usulan/' + u.j.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'kembalikan', catatan: 'cek satuan' } })).j.status, 'dikembalikan');
assert.ok((await api('GET', '/api/notifikasi', { as: 'distan@x.go.id' })).j.notifikasi.some(n => /dikembalikan/.test(n.judul))); t();
await api('POST', '/api/usulan', { as: 'distan@x.go.id', body: { dataset: 'produksi', baris_id: row.id, data: { produksi_ton: '9999,9' } } });
await api('POST', '/api/usulan/ajukan', { as: 'distan@x.go.id', body: {} });
assert.equal((await api('POST', '/api/usulan/' + u.j.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'setujui' } })).j.status, 'terverifikasi');
assert.equal((await api('GET', '/api/public/produksi.csv')).txt, pubAwal, 'publik tidak berubah sebelum terbit'); t();
assert.equal((await api('POST', '/api/terbit', { as: 'v1@x.go.id', body: { dataset: 'produksi', nomor_ba: 'BA/1', tanggal_mutakhir: '2026-10-18' } })).s, 403, 'verifikator tidak boleh terbit'); t();
assert.equal((await api('POST', '/api/terbit', { as: S, body: { dataset: 'produksi', tanggal_mutakhir: '2026-10-18' } })).s, 400, 'BA wajib'); t();
const tb = await api('POST', '/api/terbit', { as: 'kominfo@x.go.id', body: { dataset: 'produksi', nomor_ba: '188.45/BA/2026', tanggal_mutakhir: '2026-10-18' } }); assert.equal(tb.j.terbit, 1);
const pubBaru = (await api('GET', '/api/public/produksi.csv')).txt; assert.ok(pubBaru.includes('9999,9') && pubBaru.includes('resmi') && pubBaru.includes('188.45/BA/2026')); t();
// --- prinsip dua orang
const own = await api('POST', '/api/usulan', { as: 'v1@x.go.id', body: { dataset: 'peluang', baris_id: (await api('GET', '/api/data/peluang', { as: 'v1@x.go.id' })).j.baris[0].id, data: { catatan: 'uji' } } });
await api('POST', '/api/usulan/ajukan', { as: 'v1@x.go.id', body: {} });
assert.equal((await api('POST', '/api/usulan/' + own.j.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'setujui' } })).s, 403, 'tidak boleh verifikasi sendiri'); t();
assert.equal((await api('POST', '/api/usulan/' + own.j.id + '/verifikasi', { as: 'v2@x.go.id', body: { aksi: 'setujui' } })).j.status, 'terverifikasi');
// --- baris baru + hapus + tarik
const nb = await api('POST', '/api/usulan', { as: 'distan@x.go.id', body: { dataset: 'produksi', aksi: 'tambah', data: { kecamatan: 'Teweh Tengah', komoditas: 'Uji', tahun: '2026', periode: 'Tahunan', produksi_ton: '1' } } }); assert.equal(nb.s, 200);
await api('POST', '/api/usulan/ajukan', { as: 'distan@x.go.id', body: { ids: [nb.j.id] } });
await api('POST', '/api/usulan/' + nb.j.id + '/verifikasi', { as: 'v2@x.go.id', body: { aksi: 'setujui' } });
const tb2 = await api('POST', '/api/terbit', { as: S, body: { dataset: 'produksi', nomor_ba: 'BA/2', tanggal_mutakhir: '10/01/2027' } }); assert.equal(tb2.j.terbit, 1);
assert.ok((await api('GET', '/api/public/produksi.csv')).txt.includes('Uji')); t();
const nid = (await api('GET', '/api/data/produksi?q=uji', { as: S })).j.baris.find(b => b.data.komoditas === 'Uji').id;
assert.equal((await api('POST', '/api/tarik', { as: S, body: { dataset: 'produksi', ids: [nid], alasan: 'uji' } })).j.ditarik, 1);
assert.ok(!(await api('GET', '/api/public/produksi.csv')).txt.includes(',Uji,')); t();
// --- PAHANDEP & permintaan data
const f = { nama_usaha: 'CV Contoh Maju', bentuk_usaha: 'CV', nib: '1234567890123', sektor: 'Pertanian', kecamatan: 'Teweh Tengah', nama_penanggung_jawab: 'Budi', telepon: '08123456789', surel: 'budi@contoh.id', modal_usaha_rp: '500000000', alamat: 'Jl. Uji 1', persetujuan: true };
const tdk = await api('POST', '/api/public/mitra', { body: { ...f, nama_usaha: 'Tanpa Setuju', persetujuan: false } }); assert.equal(tdk.s, 200);
assert.equal((await api('POST', '/api/pahandep/profil/' + tdk.j.nomor, { as: 'v1@x.go.id', body: {} })).s, 409, 'tanpa persetujuan tidak jadi profil publik'); t();
const pm = await api('POST', '/api/public/mitra', { body: f }); assert.equal(pm.s, 200); const nomor = pm.j.nomor;
assert.equal((await api('POST', '/api/public/mitra', { body: { ...f, website: 'spam' } })).j.ok, true);
const raw = db._raw.prepare('SELECT enc FROM pendaftaran_mitra WHERE nomor=?').get(nomor).enc;
assert.ok(!raw.includes('1234567890123') && !raw.includes('Budi') && raw.startsWith('v1.'), 'terenkripsi di basis data'); t();
assert.equal((await api('GET', '/api/pahandep/pendaftaran', { as: 'distan@x.go.id' })).s, 403); t();
assert.equal((await api('GET', '/api/pahandep/pendaftaran', { as: 'dagrin@x.go.id' })).j.daftar.length, 0, 'Disdagrin hanya melihat yang diterimanya'); t();
const dg = await api('POST', '/api/pahandep/pendaftaran', { as: 'dagrin@x.go.id', body: { ...f, nama_usaha: 'UD Diterima Dagrin' } }); assert.equal(dg.s, 200);
const ld = (await api('GET', '/api/pahandep/pendaftaran', { as: 'dagrin@x.go.id' })).j.daftar; assert.equal(ld.length, 1);
const viaD = await api('POST', '/api/public/mitra', { body: { ...f, nama_usaha: 'Lewat Dagrin', saluran: 'Dinas Perdagangan dan Perindustrian', nomor: 'PI-20261018-ABCD', persetujuan: true } }); assert.equal(viaD.j.nomor, 'PI-20261018-ABCD');
assert.equal((await api('GET', '/api/pahandep/pendaftaran', { as: 'dagrin@x.go.id' })).j.daftar.length, 2, 'masuk lewat Disdagrin tampil bagi Disdagrin'); assert.ok(!JSON.stringify(ld).includes('08123456789') && !JSON.stringify(ld).includes('1234567890123')); t();
assert.equal((await api('GET', '/api/pahandep/pendaftaran/' + nomor, { as: 'dagrin@x.go.id' })).s, 403, 'PIC tidak membuka kontak'); t();
const dt = await api('GET', '/api/pahandep/pendaftaran/' + nomor, { as: 'v1@x.go.id' }); assert.equal(dt.j.data.nib, '1234567890123');
const pf = await api('POST', '/api/pahandep/profil/' + nomor, { as: 'v1@x.go.id', body: { nib_terverifikasi: 'ya', kbli: '01111' } }); assert.equal(pf.s, 200);
assert.equal((await api('GET', '/api/public/mitra.csv')).txt.trim().split('\r\n').length, 1, 'belum terbit');
const qv = (await api('GET', '/api/usulan?status=diajukan', { as: 'v2@x.go.id' })).j.usulan.find(x => x.dataset === 'mitra');
assert.equal((await api('POST', '/api/usulan/' + qv.id + '/verifikasi', { as: 'v1@x.go.id', body: { aksi: 'setujui' } })).s, 403);
await api('POST', '/api/usulan/' + qv.id + '/verifikasi', { as: 'v2@x.go.id', body: { aksi: 'setujui' } });
await api('POST', '/api/terbit', { as: S, body: { dataset: 'mitra', nomor_ba: 'BA/M1', tanggal_mutakhir: '2026-10-18' } });
const mcsv = (await api('GET', '/api/public/mitra.csv')).txt; assert.ok(mcsv.includes('CV Contoh Maju'));
for (const rahasia of ['1234567890123', '08123456789', 'budi@contoh.id', '500000000', 'Jl. Uji 1', 'Budi']) assert.ok(!mcsv.includes(rahasia), 'bocor: ' + rahasia); t();
assert.ok(!/kbli|nib/i.test(mcsv.split('\r\n')[0]), 'kolom NIB/KBLI tidak ada di berkas publik'); assert.ok(!mcsv.includes('01111'), 'KBLI bocor');
const dm = await api('GET', '/api/data/mitra?limit=50', { as: 'dagrin@x.go.id' }); assert.ok(!dm.txt.includes('01111') && !dm.txt.includes('1234567890123'), 'NIB/KBLI bocor ke panel admin instansi');
assert.equal((await api('POST', '/api/usulan', { as: S, body: { dataset: 'mitra', aksi: 'tambah', data: { kode: 'M-X', nama_usaha: 'X', kbli: '99999' } } })).s, 400, 'kolom kbli ditolak pada dataset');
env.EMAIL_DOMAIN_DINAS = 'baritoutarakab.go.id';
assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email: 'orang@gmail.com', peran: 'pic', instansi: 'DLH' } })).s, 400, 'surel non-dinas ditolak');
assert.equal((await api('POST', '/api/pengguna', { as: S, body: { email: 'orang@baritoutarakab.go.id', peran: 'pic', instansi: 'DLH' } })).s, 200); env.EMAIL_DOMAIN_DINAS = ''; t();
const kt = await api('GET', '/api/pahandep/kontak/' + pf.j.kode, { as: 'v1@x.go.id' }); assert.equal(kt.j.telepon, '08123456789'); assert.equal(kt.j.kbli, '01111'); assert.equal(kt.j.nib_terverifikasi, 'ya');
assert.equal((await api('GET', '/api/pahandep/kontak/' + pf.j.kode, { as: 'dagrin@x.go.id' })).s, 403); t();
const rw = (await api('GET', '/api/riwayat', { as: S })).j.riwayat; assert.ok(rw.some(r => r.aksi === 'pahandep:kontak')); t();
// permintaan data
const pd = await api('POST', '/api/public/permintaan', { body: { nama: 'Investor A', surel: 'a@inv.com', instansi: 'PT A', kategori: 'Peluang', rincian: 'Data lahan', tujuan: 'Studi' } }); assert.equal(pd.s, 200); assert.match(pd.j.nomor, /^PD-\d{8}-[A-Z0-9]{4}$/);
assert.equal((await api('GET', '/api/permintaan', { as: 'distan@x.go.id' })).s, 403); t();
assert.equal((await api('GET', '/api/permintaan', { as: 'v1@x.go.id' })).j.daftar[0].nama, 'Investor A');
for (let i = 0; i < 6; i++) await api('POST', '/api/public/permintaan', { body: { nama: 'x', surel: 'a@b.cc', rincian: 'r', tujuan: 't' } });
assert.equal((await api('POST', '/api/public/permintaan', { body: { nama: 'x', surel: 'a@b.cc', rincian: 'r', tujuan: 't' } })).s, 429, 'rate limit'); t();
// --- notifikasi triwulan
const hasil = await jalankanPengingat(env, new Date('2026-10-01T02:00:00Z')); assert.ok(hasil.terkirim.some(x => x.startsWith('DISTAN')) && hasil.terkirim.some(x => x.startsWith('DLH'))); t();
const again = await jalankanPengingat(env, new Date('2026-10-01T02:30:00Z')); assert.equal(again.terkirim.length, 0, 'tidak ganda'); t();
await api('POST', '/api/periode/konfirmasi', { as: 'dlh@x.go.id', body: { catatan: 'tidak ada perubahan' } });
const h7 = await jalankanPengingat(env, new Date('2026-10-07T02:00:00Z')); assert.ok(!h7.terkirim.some(x => x.startsWith('DLH')), 'DLH sudah konfirmasi'); assert.ok(h7.terkirim.some(x => x.startsWith('DISDAGRIN')));
assert.ok((await api('GET', '/api/notifikasi', { as: 'dlh@x.go.id' })).j.notifikasi.some(n => /dibuka/.test(n.judul))); t();
const l = await jalankanPengingat(env, new Date('2026-10-11T02:00:00Z')); assert.ok(l.terkirim.includes('rekap'));
const mg = await jalankanPengingat(env, new Date('2026-10-12T02:00:00Z')); assert.ok(mg.terkirim.some(x => x.includes('mingguan'))); t();
assert.equal((await jalankanPengingat(env, new Date('2026-11-04T02:00:00Z'))).dilewati != null, true); t();
const pg = await api('GET', '/api/periode', { as: 'dlh@x.go.id' }); assert.equal(pg.j.progres.length, 1); assert.equal(pg.j.progres[0].selesai, true);
const pgs = await api('GET', '/api/periode', { as: S }); assert.equal(pgs.j.progres.length, 7); t();
// --- JWT
{
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256' };
  const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const sign = async pay => { const h = b64({ alg: 'RS256', kid: 'k1' }), p = b64(pay); const s = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(h + '.' + p))).toString('base64url'); return h + '.' + p + '.' + s; };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const e2 = { ACCESS_TEAM_DOMAIN: 'tim.cloudflareaccess.com', ACCESS_AUD: 'AUD123' };
  const base = { aud: ['AUD123'], iss: 'https://tim.cloudflareaccess.com', email: 'Distan@X.go.id', exp: Math.floor(Date.now() / 1000) + 600 };
  assert.equal(await verifyAccessJwt(await sign(base), e2), 'distan@x.go.id');
  await assert.rejects(verifyAccessJwt(await sign({ ...base, aud: ['LAIN'] }), e2)); await assert.rejects(verifyAccessJwt(await sign({ ...base, exp: 1 }), e2));
  await assert.rejects(verifyAccessJwt(await sign({ ...base, iss: 'https://lain' }), e2));
  const tok = await sign(base), parts = tok.split('.'); await assert.rejects(verifyAccessJwt(parts[0] + '.' + b64({ ...base, email: 'super@x.go.id' }) + '.' + parts[2], e2));
  // header DEV tidak diterima bila bukan localhost / DEV_MODE mati
  const r = await handle(new Request('https://sifpoint.example/api/me', { headers: { 'x-dev-email': S } }), { ...env, DEV_MODE: '0' }); assert.equal(r.status, 401);
  const r2 = await handle(new Request('https://sifpoint.example/api/me', { headers: { 'x-dev-email': S } }), env); assert.equal(r2.status, 401);
  globalThis.fetch = realFetch; t();
}
console.log('SEMUA LULUS:', ok, 'kelompok uji');
