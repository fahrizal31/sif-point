// Router API SIF POINT BATARA. Satu pintu masuk untuk Cloudflare Pages Functions dan server uji lokal.
import { HttpError, bad, json, nowIso, wib, periodeData, toCsv, parse, str, bodyJson, randId } from './util.js';
import { authenticate, csrf, isSuper, isVerif } from './auth.js';
import { sealJson, openJson, hmacHex } from './crypto.js';
import { DS, semuaKolom, metaKolom, kunciBaris, INSTANSI, buangRahasia } from './datasets.js';
import { notify, emailsOf, catat, progresPeriode, jalankanPengingat } from './notif.js';
import { handleLogin } from './login.js';
import { hashPassword, validPassword, validUsername } from './password.js';

const PERAN = ['pic', 'verifikator', 'super'];
const INSTANSI_ADMIN = INSTANSI.filter(i => i[3]).map(i => i[0]);
const SEMUA_INSTANSI = INSTANSI.map(i => i[0]);

// ---------- Wali data ----------
async function aturanWali(env, dataset) {
  const rs = (await env.DB.prepare('SELECT kolom,instansi FROM wali_aturan WHERE dataset=?').bind(dataset).all()).results;
  const m = {}; for (const r of rs) (m[r.kolom] ||= []).push(r.instansi); return m;
}
// Kolom yang boleh diubah instansi tertentu pada dataset.
async function kolomEdit(env, user, dataset) {
  const semua = DS[dataset].kolom;
  if (isVerif(user)) return semua;
  if (DS[dataset].perInstansi) return semua.filter(k => k !== 'instansi');
  const m = await aturanWali(env, dataset), dflt = m['*'] || [];
  return semua.filter(k => (m[k] || dflt).includes(user.instansi));
}
const waliBaris = async (env, dataset, data) => {
  if (DS[dataset].perInstansi) return data.instansi || null;
  const m = await aturanWali(env, dataset); return (m['*'] || [])[0] || null;
};
const perluDataset = d => { if (!DS[d]) bad('Dataset tidak dikenal', 404); return d; };

// ---------- Rate limit & anti-spam publik ----------
async function batas(env, request, kunci, maks) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'lokal';
  const jam = new Date().toISOString().slice(0, 13), k = `${kunci}|${await hmacHex(env, ip)}`;
  const r = await env.DB.prepare('SELECT n,jendela FROM ratelimit WHERE kunci=?').bind(k).first();
  if (r && r.jendela === jam && r.n >= maks) bad('Terlalu banyak pengiriman. Coba lagi satu jam lagi.', 429);
  await env.DB.prepare('INSERT INTO ratelimit (kunci,n,jendela) VALUES (?,1,?) ON CONFLICT(kunci) DO UPDATE SET n=CASE WHEN jendela=? THEN n+1 ELSE 1 END, jendela=?').bind(k, jam, jam, jam).run();
}
async function turnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) return;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || '', remoteip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '' }) });
  if (!(await r.json()).success) bad('Verifikasi anti-robot gagal', 400);
}

// ---------- Publik ----------
async function publikCsv(env, nama) {
  const ds = nama.replace(/\.csv$/, '');
  if (!DS[ds] || !DS[ds].publik) bad('Tidak ditemukan', 404);
  const rs = (await env.DB.prepare("SELECT * FROM baris WHERE dataset=? AND terbit='ya' AND terbit_data IS NOT NULL ORDER BY id").bind(ds).all()).results;
  const kol = semuaKolom(ds), rows = [];
  for (const r of rs) {
    const d = parse(r.terbit_data);
    if (DS[ds].syaratTerbit && !DS[ds].syaratTerbit(d)) continue;
    const mt = parse(r.terbit_meta);
    rows.push({ ...d, status_data: mt.status_data || 'sementara', nomor_ba: mt.nomor_ba || '', tanggal_mutakhir: mt.tanggal_mutakhir || '', terbit: 'ya' });
  }
  return new Response(toCsv(kol, rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' } });
}
const bersih = (o, daftar) => Object.fromEntries(daftar.map(k => [k, str(o[k], k.startsWith('uraian') || k === 'rincian' ? 3000 : 300)]));
async function publikPermintaan(env, request) {
  const b = await bodyJson(request, 20000);
  if (b.website) return json({ ok: true }); // pot madu
  await batas(env, request, 'pd', 5); await turnstile(env, request, b.turnstile);
  const f = bersih(b, ['nama', 'instansi', 'surel', 'telepon', 'kategori', 'rincian', 'tujuan', 'saluran']);
  if (!f.nama || !f.surel || !f.rincian || !f.tujuan) bad('Lengkapi nama, surel, rincian data, dan tujuan penggunaan.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.surel)) bad('Format surel tidak valid.');
  const nomor = b.nomor && /^PD-\d{8}-[A-Z0-9]{4}$/.test(b.nomor) ? b.nomor : `PD-${wib().iso.replace(/-/g, '')}-${randId(4)}`;
  if (await env.DB.prepare('SELECT 1 x FROM permintaan_data WHERE nomor=?').bind(nomor).first()) bad('Nomor referensi sudah dipakai.', 409);
  await env.DB.prepare('INSERT INTO permintaan_data (nomor,kategori,status,enc,dibuat) VALUES (?,?,?,?,?)').bind(nomor, f.kategori, 'masuk', await sealJson(env, f), nowIso()).run();
  await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `Permintaan data baru ${nomor}`, isi: `Kategori: ${f.kategori || '-'}. Layani paling lama 3 hari kerja (SOP-04).`, tipe: 'permintaan', tautan: '/publish.html#permintaan' });
  return json({ ok: true, nomor });
}
async function publikMitra(env, request) {
  const b = await bodyJson(request, 30000);
  if (b.website) return json({ ok: true });
  await batas(env, request, 'pm', 5); await turnstile(env, request, b.turnstile);
  const f = bersih(b, ['nama_usaha', 'bentuk_usaha', 'nib', 'kbli', 'sektor', 'produk_komoditas', 'kapasitas', 'kecamatan', 'desa', 'skala_usaha', 'kebutuhan_kemitraan', 'uraian_kemitraan', 'modal_usaha_rp', 'nama_penanggung_jawab', 'jabatan', 'telepon', 'surel', 'alamat', 'saluran']);
  if (!f.nama_usaha || !f.nama_penanggung_jawab || !f.telepon) bad('Lengkapi nama usaha, penanggung jawab, dan telepon.');
  if (f.surel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.surel)) bad('Format surel tidak valid.');
  f.persetujuan_pelaku_usaha = b.persetujuan ? 'ya' : 'tidak'; f.tanggal_persetujuan = wib().iso;
  const nomor = b.nomor && /^PI-\d{8}-[A-Z0-9]{4}$/.test(b.nomor) ? b.nomor : `PI-${wib().iso.replace(/-/g, '')}-${randId(4)}`;
  if (await env.DB.prepare('SELECT 1 x FROM pendaftaran_mitra WHERE nomor=?').bind(nomor).first()) bad('Nomor referensi sudah dipakai.', 409);
  const penerima = /Perdagangan/i.test(f.saluran) ? 'DISDAGRIN' : /Tenaga Kerja/i.test(f.saluran) ? 'DISNAKERTRANSKOP' : 'DPMPTSP';
  await env.DB.prepare('INSERT INTO pendaftaran_mitra (nomor,saluran,penerima,status,enc,dibuat) VALUES (?,?,?,?,?,?)').bind(nomor, f.saluran || 'dashboard', penerima, penerima === 'DPMPTSP' ? 'masuk' : 'diterima_pd', await sealJson(env, f), nowIso()).run();
  await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `Pendaftaran mitra PAHANDEP baru ${nomor}`, isi: 'Verifikasi NIB melalui OSS dan catat profil mitra (SOP-05).', tipe: 'mitra', tautan: '/publish.html#pahandep' });
  return json({ ok: true, nomor });
}
async function publik(env, request, path) {
  const [, nama] = path;
  if (request.method === 'GET' && nama === 'status') return json({ ok: true, waktu: nowIso(), periode: periodeData().id });
  if (request.method === 'GET' && nama) return publikCsv(env, nama);
  if (request.method === 'POST' && nama === 'permintaan') return publikPermintaan(env, request);
  if (request.method === 'POST' && nama === 'mitra') return publikMitra(env, request);
  bad('Tidak ditemukan', 404);
}

// ---------- Data & usulan ----------
const barisOut = (r) => ({ id: r.id, kunci: r.kunci, instansi: r.instansi, data: buangRahasia(parse(r.data)), status_data: r.status_data, nomor_ba: r.nomor_ba, tanggal_mutakhir: r.tanggal_mutakhir, terbit: r.terbit, hapus: r.hapus, versi: r.versi, diubah_pada: r.diubah_pada, diubah_oleh: r.diubah_oleh });
async function daftarDataset(env, user) {
  const out = [];
  for (const d of Object.keys(DS)) {
    const ke = await kolomEdit(env, user, d);
    if (!ke.length && !isVerif(user)) continue;
    out.push({ kode: d, judul: DS[d].judul, kolom: semuaKolom(d), kolom_edit: ke, kunci: DS[d].kunci, per_instansi: !!DS[d].perInstansi });
  }
  return out;
}
async function lihatData(env, user, dataset, url) {
  const ke = await kolomEdit(env, user, dataset);
  if (!ke.length && !isVerif(user)) bad('Anda bukan wali data pada dataset ini', 403);
  const q = str(url.searchParams.get('q'), 100).toLowerCase(), lim = Math.min(+url.searchParams.get('limit') || 200, 500), off = +url.searchParams.get('offset') || 0;
  let sql = 'SELECT * FROM baris WHERE dataset=?', b = [dataset];
  if (DS[dataset].perInstansi && !isVerif(user)) { sql += ' AND instansi=?'; b.push(user.instansi); }
  if (q) { sql += ' AND LOWER(data) LIKE ?'; b.push('%' + q.replace(/[%_]/g, '') + '%'); }
  const st = url.searchParams.get('status_data'); if (['sementara', 'terverifikasi', 'resmi'].includes(st)) { sql += ' AND status_data=?'; b.push(st); }
  const tb = url.searchParams.get('terbit'); if (tb === 'ya') sql += " AND terbit='ya'";
  const tot = (await env.DB.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) n')).bind(...b).first()).n;
  const rs = (await env.DB.prepare(sql + ' ORDER BY id LIMIT ? OFFSET ?').bind(...b, lim, off).all()).results;
  const ids = rs.map(r => r.id), open = {};
  if (ids.length) for (const u of (await env.DB.prepare(`SELECT id,baris_id,status,oleh FROM usulan WHERE baris_id IN (${ids.map(() => '?').join(',')}) AND status IN ('draft','diajukan','dikembalikan')`).bind(...ids).all()).results) (open[u.baris_id] ||= []).push(u);
  return { total: tot, kolom_edit: ke, baris: rs.map(r => ({ ...barisOut(r), usulan_terbuka: open[r.id] || [] })) };
}
function validasiNilai(dataset, kolom, v) {
  v = v == null ? '' : String(v).trim();
  if (v.length > 4000) bad(`Isi kolom ${kolom} terlalu panjang`);
  if (['lintang', 'bujur'].includes(kolom) && v && !/^-?\d{1,3}([.,]\d+)?$/.test(v)) bad(`Kolom ${kolom} harus angka derajat desimal`);
  if (['luas_tanam_ha', 'luas_panen_ha', 'produksi_ton', 'irr'].includes(kolom) && v && !/^-?\d+([.,]\d+)?$/.test(v)) bad(`Kolom ${kolom} harus angka (koma desimal)`);
  return v;
}
async function buatUsulan(env, user, b) {
  const dataset = perluDataset(b.dataset), aksi = b.aksi || (b.baris_id ? 'ubah' : 'tambah');
  if (!['ubah', 'tambah', 'hapus'].includes(aksi)) bad('Aksi tidak dikenal');
  const ke = await kolomEdit(env, user, dataset);
  if (!ke.length) bad('Anda bukan wali data pada dataset ini', 403);
  const p = periodeData();
  let row = null, data = {};
  if (aksi !== 'tambah') {
    row = await env.DB.prepare('SELECT * FROM baris WHERE id=? AND dataset=?').bind(b.baris_id, dataset).first();
    if (!row) bad('Baris tidak ditemukan', 404);
    if (DS[dataset].perInstansi && !isVerif(user) && row.instansi !== user.instansi) bad('Baris milik instansi lain', 403);
  }
  if (aksi !== 'hapus') {
    for (const [k, v] of Object.entries(b.data || {})) {
      if (!DS[dataset].kolom.includes(k)) bad(`Kolom ${k} tidak dikenal`);
      if (!ke.includes(k)) bad(`Kolom ${k} bukan kewenangan ${user.instansi || 'Anda'} (wali data berbeda)`, 403);
      data[k] = validasiNilai(dataset, k, v);
    }
    if (aksi === 'ubah' && !Object.keys(data).length) bad('Tidak ada perubahan');
    if (aksi === 'tambah') {
      if (DS[dataset].perInstansi) data.instansi = isVerif(user) ? (b.data && b.data.instansi) || user.instansi : user.instansi;
      for (const k of DS[dataset].kunci) if (!String(data[k] || '').trim()) bad(`Kolom kunci ${k} wajib diisi`);
      if (!data.perangkat_daerah && DS[dataset].kolom.includes('perangkat_daerah')) data.perangkat_daerah = user.instansi;
      const key = kunciBaris(dataset, data);
      if (key.length > 255) bad('Gabungan kolom kunci maksimal 255 karakter');
      if (await env.DB.prepare('SELECT 1 x FROM baris WHERE dataset=? AND kunci=?').bind(dataset, key).first()) bad('Baris dengan kunci yang sama sudah ada. Ubah baris tersebut.', 409);
    }
  }
  const dup = row && await env.DB.prepare("SELECT id FROM usulan WHERE baris_id=? AND oleh=? AND status IN ('draft','dikembalikan')").bind(row.id, user.email).first();
  if (dup) {
    await env.DB.prepare("UPDATE usulan SET data_baru=?,aksi=?,status='draft',catatan=NULL,periode=? WHERE id=?").bind(JSON.stringify(data), aksi, p.id, dup.id).run();
    return { id: dup.id, diperbarui: true };
  }
  const instansi = (row && row.instansi) || data.instansi || user.instansi || 'DPMPTSP';
  const r = await env.DB.prepare('INSERT INTO usulan (dataset,baris_id,kunci,aksi,data_baru,instansi,periode,status,oleh,dibuat) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(dataset, row ? row.id : null, row ? row.kunci : kunciBaris(dataset, data), aksi, JSON.stringify(data), user.peran === 'pic' ? user.instansi : (instansi || 'DPMPTSP'), p.id, 'draft', user.email, nowIso()).run();
  return { id: r.meta.last_row_id };
}
async function ajukan(env, user, b) {
  let ids = b.ids;
  if (!ids || !ids.length) ids = (await env.DB.prepare("SELECT id FROM usulan WHERE status IN ('draft','dikembalikan') AND oleh=?").bind(user.email).all()).results.map(r => r.id);
  if (!ids.length) bad('Tidak ada usulan yang dapat diajukan');
  let n = 0;
  for (const id of ids) {
    const u = await env.DB.prepare('SELECT * FROM usulan WHERE id=?').bind(id).first();
    if (!u || u.oleh !== user.email || !['draft', 'dikembalikan'].includes(u.status)) continue;
    await env.DB.prepare("UPDATE usulan SET status='diajukan',diajukan_pada=? WHERE id=?").bind(nowIso(), id).run(); n++;
  }
  if (!n) bad('Tidak ada usulan yang dapat diajukan');
  const p = periodeData();
  await catat(env, user, 'ajukan', null, n, `${n} usulan diajukan (${p.id})`);
  await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `${n} usulan data dari ${user.instansi}`, isi: `${user.nama || user.email} mengajukan ${n} usulan pemutakhiran data ${p.label}. Mohon diverifikasi (SOP-02).`, tipe: 'usulan', tautan: '/publish.html#verifikasi' });
  return { diajukan: n };
}
async function verifikasi(env, user, id, b) {
  if (!isVerif(user)) bad('Hanya admin verifikator DPMPTSP atau Super Admin', 403);
  const u = await env.DB.prepare('SELECT * FROM usulan WHERE id=?').bind(id).first();
  if (!u) bad('Usulan tidak ditemukan', 404);
  if (u.status !== 'diajukan') bad('Usulan tidak berstatus diajukan', 409);
  if (u.oleh === user.email) bad('Usulan tidak boleh diverifikasi oleh pengusulnya sendiri (prinsip dua orang)', 403);
  const aksi = b.aksi, catatan = str(b.catatan, 1000);
  if (!['setujui', 'kembalikan', 'tolak'].includes(aksi)) bad('Aksi tidak dikenal');
  if (aksi !== 'setujui' && !catatan) bad('Catatan wajib diisi saat mengembalikan atau menolak');
  const now = nowIso(), data = parse(u.data_baru);
  if (aksi === 'setujui') {
    if (u.aksi === 'tambah') {
      const kunci = kunciBaris(u.dataset, data);
      if (await env.DB.prepare('SELECT 1 x FROM baris WHERE dataset=? AND kunci=?').bind(u.dataset, kunci).first()) bad('Kunci sudah ada; tolak atau kembalikan usulan', 409);
      const inst = DS[u.dataset].perInstansi ? data.instansi : await waliBaris(env, u.dataset, data);
      await env.DB.prepare("INSERT INTO baris (dataset,kunci,instansi,data,status_data,terbit,versi,diubah_oleh,diubah_pada) VALUES (?,?,?,?, 'terverifikasi','',1,?,?)").bind(u.dataset, kunci, inst, JSON.stringify(data), u.oleh, now).run();
      const nb = await env.DB.prepare('SELECT id FROM baris WHERE dataset=? AND kunci=?').bind(u.dataset, kunci).first();
      await env.DB.prepare('UPDATE usulan SET baris_id=? WHERE id=?').bind(nb.id, id).run();
    } else if (u.aksi === 'ubah') {
      const r = await env.DB.prepare('SELECT * FROM baris WHERE id=?').bind(u.baris_id).first();
      if (!r) bad('Baris sumber sudah tidak ada', 409);
      const baru = { ...parse(r.data), ...data };
      await env.DB.prepare("UPDATE baris SET data=?,status_data='terverifikasi',versi=versi+1,diubah_oleh=?,diubah_pada=? WHERE id=?").bind(JSON.stringify(baru), u.oleh, now, r.id).run();
    } else {
      await env.DB.prepare("UPDATE baris SET hapus=1,status_data='terverifikasi',versi=versi+1,diubah_oleh=?,diubah_pada=? WHERE id=?").bind(u.oleh, now, u.baris_id).run();
    }
  }
  const st = { setujui: 'terverifikasi', kembalikan: 'dikembalikan', tolak: 'ditolak' }[aksi];
  await env.DB.prepare('UPDATE usulan SET status=?,diverifikasi_oleh=?,diverifikasi_pada=?,catatan=? WHERE id=?').bind(st, user.email, now, catatan || null, id).run();
  await catat(env, user, 'verifikasi:' + aksi, u.dataset, id, catatan);
  await notify(env, [u.oleh], { judul: `Usulan #${id} ${st}`, isi: `Usulan ${u.dataset} (${u.kunci}) ${st} oleh ${user.nama || user.email}.${catatan ? ' Catatan: ' + catatan : ''}`, tipe: aksi === 'setujui' ? 'sukses' : 'perhatian', tautan: '/admin.html#usulan' });
  if (aksi === 'setujui') await notify(env, await emailsOf(env, { peran: 'super' }), { judul: `Siap ditetapkan: ${u.dataset}`, isi: `Usulan #${id} telah terverifikasi dan menunggu penetapan data resmi dan persetujuan terbit.`, tipe: 'usulan', tautan: '/publish.html#terbit' });
  return { status: st };
}
async function terbitkan(env, user, b) {
  if (!isSuper(user)) bad('Hanya Super Admin yang dapat menetapkan dan menerbitkan', 403);
  const dataset = perluDataset(b.dataset), nomor = str(b.nomor_ba, 100), tgl = str(b.tanggal_mutakhir, 20);
  if (!nomor) bad('Nomor berita acara validasi wajib diisi (SOP-02)');
  if (!/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(tgl)) bad('Tanggal mutakhir: format 2027-01-10 atau 10/01/2027');
  let q = "SELECT * FROM baris WHERE dataset=? AND status_data='terverifikasi'", bd = [dataset];
  if (b.ids && b.ids.length) { q += ` AND id IN (${b.ids.map(() => '?').join(',')})`; bd.push(...b.ids.map(Number)); }
  const rs = (await env.DB.prepare(q).bind(...bd).all()).results;
  if (!rs.length) bad('Tidak ada baris terverifikasi untuk diterbitkan');
  let terbit = 0, hapus = 0, lewat = [];
  for (const r of rs) {
    const d = parse(r.data);
    if (r.hapus) { await env.DB.prepare('DELETE FROM baris WHERE id=?').bind(r.id).run(); hapus++; continue; }
    if (DS[dataset].syaratTerbit && !DS[dataset].syaratTerbit(d)) { lewat.push(r.kunci); continue; }
    await env.DB.prepare("UPDATE baris SET status_data='resmi',nomor_ba=?,tanggal_mutakhir=?,terbit='ya',terbit_data=?,terbit_meta=?,diubah_pada=? WHERE id=?").bind(nomor, tgl, r.data, JSON.stringify({ status_data: 'resmi', nomor_ba: nomor, tanggal_mutakhir: tgl }), nowIso(), r.id).run();
    await env.DB.prepare("UPDATE usulan SET status='ditetapkan' WHERE baris_id=? AND status='terverifikasi'").bind(r.id).run();
    terbit++;
  }
  await catat(env, user, 'terbit', dataset, nomor, `${terbit} baris terbit, ${hapus} dihapus, ${lewat.length} ditahan`);
  if (terbit || hapus) await notify(env, [...(await emailsOf(env, { peran: ['pic', 'verifikator'] }))], { judul: `Data ${DS[dataset].judul} diterbitkan`, isi: `${terbit} baris berstatus data resmi dan tampil di website (BA ${nomor}).`, tipe: 'sukses', tautan: '/admin.html' });
  return { terbit, dihapus: hapus, ditahan: lewat };
}
async function tarik(env, user, b) {
  if (!isSuper(user)) bad('Hanya Super Admin', 403);
  const dataset = perluDataset(b.dataset);
  if (!b.ids || !b.ids.length) bad('Pilih baris yang ditarik');
  const r = await env.DB.prepare(`UPDATE baris SET terbit='',terbit_data=NULL,terbit_meta=NULL,status_data='terverifikasi' WHERE dataset=? AND id IN (${b.ids.map(() => '?').join(',')})`).bind(dataset, ...b.ids.map(Number)).run();
  await catat(env, user, 'tarik', dataset, b.ids.join(','), str(b.alasan, 300));
  return { ditarik: r.meta.changes };
}

// ---------- PAHANDEP INVESTOR & permintaan data (rahasia) ----------
const bolehMitraPic = u => u.peran === 'pic' && ['DISDAGRIN', 'DISNAKERTRANSKOP'].includes(u.instansi);
async function pahandep(env, user, request, path) {
  const [, sub, a, c] = path;
  if (sub === 'pendaftaran' && request.method === 'GET' && !a) {
    if (!isVerif(user) && !bolehMitraPic(user)) bad('Tidak berwenang', 403);
    let q = 'SELECT nomor,saluran,penerima,status,kode_mitra,dibuat,enc FROM pendaftaran_mitra', b = [];
    if (!isVerif(user)) { q += ' WHERE penerima=?'; b.push(user.instansi); }
    const rs = (await env.DB.prepare(q + ' ORDER BY dibuat DESC LIMIT 300').bind(...b).all()).results, out = [];
    for (const r of rs) { const d = await openJson(env, r.enc); out.push({ nomor: r.nomor, saluran: r.saluran, penerima: r.penerima, status: r.status, kode_mitra: r.kode_mitra, dibuat: r.dibuat, nama_usaha: d.nama_usaha, sektor: d.sektor, kecamatan: d.kecamatan }); }
    return { daftar: out };
  }
  if (sub === 'pendaftaran' && request.method === 'POST' && !a) {
    if (!isVerif(user) && !bolehMitraPic(user)) bad('Tidak berwenang', 403);
    const b = await bodyJson(request, 30000);
    const f = bersih(b, ['nama_usaha', 'bentuk_usaha', 'nib', 'kbli', 'sektor', 'produk_komoditas', 'kapasitas', 'kecamatan', 'desa', 'skala_usaha', 'kebutuhan_kemitraan', 'uraian_kemitraan', 'modal_usaha_rp', 'nama_penanggung_jawab', 'jabatan', 'telepon', 'surel', 'alamat']);
    if (!f.nama_usaha || !f.nama_penanggung_jawab) bad('Lengkapi nama usaha dan penanggung jawab.');
    f.persetujuan_pelaku_usaha = b.persetujuan ? 'ya' : 'tidak'; f.tanggal_persetujuan = wib().iso; f.bukti_persetujuan = str(b.bukti_persetujuan, 300);
    const nomor = `PI-${wib().iso.replace(/-/g, '')}-${randId(4)}`;
    await env.DB.prepare('INSERT INTO pendaftaran_mitra (nomor,saluran,penerima,status,enc,dibuat) VALUES (?,?,?,?,?,?)').bind(nomor, user.instansi || 'DPMPTSP', user.instansi || 'DPMPTSP', bolehMitraPic(user) ? 'diterima_pd' : 'masuk', await sealJson(env, f), nowIso()).run();
    await catat(env, user, 'pahandep:daftar', 'mitra', nomor, f.nama_usaha);
    if (bolehMitraPic(user)) await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `Pendaftaran mitra ${nomor} dari ${user.instansi}`, isi: 'Diteruskan ke DPMPTSP untuk verifikasi NIB melalui OSS (SOP-05).', tipe: 'mitra', tautan: '/publish.html#pahandep' });
    return { nomor };
  }
  if (sub === 'pendaftaran' && a && request.method === 'GET') {
    if (!isVerif(user)) bad('Data lengkap pendaftar hanya untuk admin verifikator DPMPTSP dan Super Admin', 403);
    const r = await env.DB.prepare('SELECT * FROM pendaftaran_mitra WHERE nomor=?').bind(a).first();
    if (!r) bad('Tidak ditemukan', 404);
    await catat(env, user, 'pahandep:baca', 'mitra', a, 'membuka data lengkap');
    return { ...r, enc: undefined, data: await openJson(env, r.enc) };
  }
  if (sub === 'pendaftaran' && a && c === 'status' && request.method === 'POST') {
    if (!isVerif(user)) bad('Tidak berwenang', 403);
    const b = await bodyJson(request);
    if (!['masuk', 'diterima_pd', 'diteruskan', 'diverifikasi', 'ditolak', 'dicatat'].includes(b.status)) bad('Status tidak dikenal');
    await env.DB.prepare('UPDATE pendaftaran_mitra SET status=?,petugas=?,diubah=? WHERE nomor=?').bind(b.status, user.email, nowIso(), a).run();
    await catat(env, user, 'pahandep:status', 'mitra', a, b.status);
    return { ok: true };
  }
  // Catat profil mitra: profil publik masuk alur verifikasi (usulan), kontak/NIB/modal tersimpan terenkripsi.
  if (sub === 'profil' && a && request.method === 'POST') {
    if (!isVerif(user)) bad('Tidak berwenang', 403);
    const r = await env.DB.prepare('SELECT * FROM pendaftaran_mitra WHERE nomor=?').bind(a).first();
    if (!r) bad('Tidak ditemukan', 404);
    if (r.kode_mitra) bad('Sudah dicatat sebagai ' + r.kode_mitra, 409);
    const d = await openJson(env, r.enc), b = await bodyJson(request);
    if (d.persetujuan_pelaku_usaha !== 'ya') bad('Pelaku usaha belum menyetujui profil ditampilkan; profil publik tidak dapat dibuat', 409);
    const kode = str(b.kode, 30) || 'M-' + String((await env.DB.prepare("SELECT COUNT(*) n FROM baris WHERE dataset='mitra'").first()).n + 1).padStart(3, '0');
    const profil = { kode, nama_usaha: d.nama_usaha, bentuk_usaha: d.bentuk_usaha, sektor: d.sektor, produk_komoditas: d.produk_komoditas, kapasitas: d.kapasitas, kecamatan: d.kecamatan, desa: d.desa, skala_usaha: d.skala_usaha, kebutuhan_kemitraan: d.kebutuhan_kemitraan, uraian_kemitraan: d.uraian_kemitraan, persetujuan_pelaku_usaha: 'ya', sumber: 'Pendaftaran ' + a + ' (SOP-05)', periode: periodeData().id, satuan: '-', wilayah: d.kecamatan || 'Barito Utara', perangkat_daerah: 'DPMPTSP' };
    if (await env.DB.prepare("SELECT 1 x FROM baris WHERE dataset='mitra' AND kunci=?").bind(kode).first()) bad('Kode mitra sudah dipakai', 409);
    await env.DB.prepare('INSERT INTO usulan (dataset,baris_id,kunci,aksi,data_baru,instansi,periode,status,oleh,dibuat,diajukan_pada) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('mitra', null, kode, 'tambah', JSON.stringify(profil), 'DPMPTSP', periodeData().id, 'diajukan', user.email, nowIso(), nowIso()).run();
    await env.DB.prepare('INSERT INTO mitra_kontak (kode,enc,dibuat,diubah_oleh) VALUES (?,?,?,?)').bind(kode, await sealJson(env, { nib: d.nib, kbli: str(b.kbli, 50) || d.kbli || '', nib_terverifikasi: b.nib_terverifikasi === 'ya' ? 'ya' : 'tidak', modal_usaha_rp: d.modal_usaha_rp, nama_penanggung_jawab: d.nama_penanggung_jawab, jabatan: d.jabatan, telepon: d.telepon, surel: d.surel, alamat: d.alamat, bukti_persetujuan: d.bukti_persetujuan || '', tanggal_persetujuan: d.tanggal_persetujuan }), nowIso(), user.email).run();
    await env.DB.prepare("UPDATE pendaftaran_mitra SET kode_mitra=?,status='dicatat',petugas=?,diubah=? WHERE nomor=?").bind(kode, user.email, nowIso(), a).run();
    await catat(env, user, 'pahandep:profil', 'mitra', kode, 'profil diajukan ke verifikasi, kontak terenkripsi');
    await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `Profil mitra ${kode} menunggu verifikasi kedua`, isi: 'Profil publik mitra perlu diverifikasi petugas lain sebelum ditetapkan dan diterbitkan.', tipe: 'usulan', tautan: '/publish.html#verifikasi' });
    return { kode };
  }
  if (sub === 'kontak' && a && request.method === 'GET') {
    if (!isVerif(user)) bad('Kontak mitra hanya untuk admin verifikator DPMPTSP dan Super Admin (diserahkan ke investor setelah SOP-04)', 403);
    const r = await env.DB.prepare('SELECT * FROM mitra_kontak WHERE kode=?').bind(a).first();
    if (!r) bad('Tidak ditemukan', 404);
    await catat(env, user, 'pahandep:kontak', 'mitra', a, 'membuka kontak mitra');
    return { kode: a, ...(await openJson(env, r.enc)) };
  }
  bad('Tidak ditemukan', 404);
}
async function permintaan(env, user, request, path) {
  if (!isVerif(user)) bad('Data permintaan memuat data pribadi pemohon; hanya admin verifikator DPMPTSP dan Super Admin', 403);
  const [, a, c] = path;
  if (!a) {
    const rs = (await env.DB.prepare('SELECT nomor,kategori,status,dibuat,diubah,petugas,enc FROM permintaan_data ORDER BY dibuat DESC LIMIT 300').all()).results, out = [];
    for (const r of rs) { const d = await openJson(env, r.enc); out.push({ nomor: r.nomor, kategori: r.kategori, status: r.status, dibuat: r.dibuat, petugas: r.petugas, nama: d.nama, instansi: d.instansi }); }
    return { daftar: out };
  }
  if (!c && request.method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM permintaan_data WHERE nomor=?').bind(a).first();
    if (!r) bad('Tidak ditemukan', 404);
    await catat(env, user, 'permintaan:baca', 'permintaan', a, 'membuka data lengkap');
    return { ...r, enc: undefined, data: await openJson(env, r.enc) };
  }
  if (c === 'status' && request.method === 'POST') {
    const b = await bodyJson(request);
    if (!['masuk', 'diminta_ke_pic', 'disetujui_kabid', 'diserahkan', 'ditolak'].includes(b.status)) bad('Status tidak dikenal');
    await env.DB.prepare('UPDATE permintaan_data SET status=?,petugas=?,diubah=? WHERE nomor=?').bind(b.status, user.email, nowIso(), a).run();
    await catat(env, user, 'permintaan:status', 'permintaan', a, b.status);
    return { ok: true };
  }
  bad('Tidak ditemukan', 404);
}

// ---------- Pengguna, wali, notifikasi, riwayat ----------
async function pengguna(env, user, request, path) {
  if (request.method === 'GET') {
    if (!isVerif(user)) bad('Tidak berwenang', 403);
    return { pengguna: (await env.DB.prepare('SELECT p.email,COALESCE(p.surel_notifikasi,p.email) surel_notifikasi,p.nama,p.jabatan,p.instansi,p.peran,p.aktif,p.terima_email,p.terakhir_masuk,k.username FROM pengguna p LEFT JOIN kredensial k ON k.email=p.email ORDER BY p.peran,p.instansi,p.email').all()).results, instansi: INSTANSI.map(i => ({ kode: i[0], nama: i[1], peran_sop: i[2], admin_data: i[3] })) };
  }
  if (!isSuper(user)) bad('Hanya Super Admin yang mengelola akun', 403);
  const b = await bodyJson(request), email = str(b.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Surel tidak valid');
  const current = await env.DB.prepare('SELECT surel_notifikasi FROM pengguna WHERE email=?').bind(email).first();
  const surel = b.surel_notifikasi === undefined ? (current?.surel_notifikasi || email) : str(b.surel_notifikasi, 255).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(surel)) bad('Surel notifikasi tidak valid');
  const owner = await env.DB.prepare('SELECT email FROM pengguna WHERE (email=? OR surel_notifikasi=?) AND email<>?').bind(surel, surel, email).first();
  if (owner) bad('Surel notifikasi sudah digunakan akun lain', 409);
  // Opsional: batasi akun admin pada domain surel dinas (variabel EMAIL_DOMAIN_DINAS, mis. "baritoutarakab.go.id"; pisahkan koma bila lebih dari satu).
  const dom = String(env.EMAIL_DOMAIN_DINAS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (dom.length && !dom.some(x => surel.endsWith('@' + x))) bad('Surel harus berakhiran ' + dom.map(x => '@' + x).join(' atau ') + ' (surel dinas)');
  if (!PERAN.includes(b.peran)) bad('Peran harus pic, verifikator, atau super');
  if (!SEMUA_INSTANSI.includes(b.instansi)) bad('Instansi tidak dikenal');
  if (b.peran === 'pic' && !INSTANSI_ADMIN.includes(b.instansi)) bad('Admin instansi hanya untuk 7 instansi pengisi data');
  if (b.peran === 'verifikator' && b.instansi !== 'DPMPTSP') bad('Admin verifikator adalah petugas DPMPTSP');
  if (b.peran === 'super' && !['DPMPTSP', 'DISKOMINFOSANDI'].includes(b.instansi)) bad('Super Admin: Bidang Penanaman Modal (DPMPTSP) atau Diskominfosandi');
  const aktif = b.aktif === 0 || b.aktif === false ? 0 : 1;
  if (email === user.email && (!aktif || b.peran !== 'super')) bad('Anda tidak dapat menurunkan atau menonaktifkan akun sendiri', 409);
  const existing = await env.DB.prepare('SELECT username FROM kredensial WHERE email=?').bind(email).first();
  const username = str(b.username || existing?.username, 40).toLowerCase();
  const password = b.password;
  let hash = null;
  if (env.AUTH_MODE === 'session') {
    if (!validUsername(username)) bad('Username harus 3–40 karakter, dimulai huruf, hanya huruf kecil, angka, titik, garis bawah, atau tanda hubung');
    if (!existing && !validPassword(password)) bad('Password awal minimal 12 dan maksimal 128 karakter');
    if (password !== undefined && password !== '' && !validPassword(password)) bad('Password minimal 12 dan maksimal 128 karakter');
    const taken = await env.DB.prepare('SELECT email FROM kredensial WHERE username=?').bind(username).first();
    if (taken && taken.email !== email) bad('Username sudah digunakan', 409);
    if (password) hash = await hashPassword(password);
  }
  await env.DB.prepare('INSERT INTO pengguna (email,surel_notifikasi,nama,jabatan,instansi,peran,aktif,terima_email,dibuat) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET surel_notifikasi=excluded.surel_notifikasi,nama=excluded.nama,jabatan=excluded.jabatan,instansi=excluded.instansi,peran=excluded.peran,aktif=excluded.aktif,terima_email=excluded.terima_email')
    .bind(email, surel, str(b.nama, 120), str(b.jabatan, 120), b.instansi, b.peran, aktif, b.terima_email === 0 ? 0 : 1, nowIso()).run();
  if (env.AUTH_MODE === 'session') {
    if (existing) {
      if (hash) await env.DB.prepare('UPDATE kredensial SET username=?,password_hash=?,versi=versi+1,diubah=? WHERE email=?').bind(username, hash, nowIso(), email).run();
      else if (username !== existing.username) await env.DB.prepare('UPDATE kredensial SET username=? WHERE email=?').bind(username, email).run();
    } else await env.DB.prepare('INSERT INTO kredensial (email,username,password_hash,versi,diubah) VALUES (?,?,?,1,?)').bind(email, username, hash, nowIso()).run();
  }
  await catat(env, user, 'pengguna', null, email, `${b.peran}/${b.instansi}/aktif=${aktif}/surel=${surel}`);
  return { ok: true };
}
async function waliApi(env, user, request) {
  if (request.method === 'GET') { if (!isVerif(user)) bad('Tidak berwenang', 403); return { aturan: (await env.DB.prepare('SELECT id,dataset,kolom,instansi FROM wali_aturan ORDER BY dataset,kolom,instansi').all()).results }; }
  if (!isSuper(user)) bad('Hanya Super Admin', 403);
  const b = await bodyJson(request);
  perluDataset(b.dataset);
  if (b.kolom !== '*' && !DS[b.dataset].kolom.includes(b.kolom)) bad('Kolom tidak dikenal');
  if (!INSTANSI_ADMIN.concat(['DPMPTSP']).includes(b.instansi)) bad('Instansi tidak dikenal');
  if (b.hapus) await env.DB.prepare('DELETE FROM wali_aturan WHERE dataset=? AND kolom=? AND instansi=?').bind(b.dataset, b.kolom, b.instansi).run();
  else await env.DB.prepare('INSERT OR IGNORE INTO wali_aturan (dataset,kolom,instansi) VALUES (?,?,?)').bind(b.dataset, b.kolom, b.instansi).run();
  await catat(env, user, 'wali', b.dataset, b.kolom, `${b.hapus ? '-' : '+'}${b.instansi}`);
  return { ok: true };
}

// ---------- Utama ----------
export async function handle(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (path[0] === 'public') return await publik(env, request, path);
    csrf(request);
    if (path[0] === 'auth') return await handleLogin(request, env, path[1]);
    const user = await authenticate(request, env), m = request.method, [r0, r1, r2] = path;
    if (r0 === 'me') return json({ email: user.email, nama: user.nama, jabatan: user.jabatan, instansi: user.instansi, peran: user.peran, belum_dibaca: (await env.DB.prepare('SELECT COUNT(*) n FROM notifikasi WHERE email=? AND dibaca=0').bind(user.email).first()).n });
    if (r0 === 'periode' && !r1) { const p = periodeData(), prog = await progresPeriode(env, p.id); return json({ periode: p, hari_ini: wib().iso, progres: isVerif(user) ? prog : prog.filter(x => x.instansi === user.instansi) }); }
    if (r0 === 'periode' && r1 === 'konfirmasi' && m === 'POST') {
      if (user.peran !== 'pic') bad('Konfirmasi dilakukan admin instansi', 403);
      const b = await bodyJson(request), p = periodeData();
      await env.DB.prepare('INSERT INTO konfirmasi (periode,instansi,oleh,tanggal,catatan) VALUES (?,?,?,?,?) ON CONFLICT(periode,instansi) DO UPDATE SET oleh=excluded.oleh,tanggal=excluded.tanggal,catatan=excluded.catatan').bind(p.id, user.instansi, user.email, nowIso(), str(b.catatan, 500)).run();
      await catat(env, user, 'konfirmasi', null, p.id, 'tidak ada perubahan');
      await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `${user.instansi}: tidak ada perubahan data ${p.label}`, isi: str(b.catatan, 500) || 'Admin instansi mengonfirmasi data tetap berlaku.', tipe: 'info', tautan: '/publish.html' });
      return json({ ok: true });
    }
    if (r0 === 'pengingat' && r1 === 'jalankan' && m === 'POST') { if (!isSuper(user)) bad('Hanya Super Admin', 403); const b = await bodyJson(request); const h = await jalankanPengingat(env, new Date(), { paksa: !!b.paksa }); await catat(env, user, 'pengingat', null, null, JSON.stringify(h).slice(0, 300)); return json(h); }
    if (r0 === 'datasets') return json({ datasets: await daftarDataset(env, user) });
    if (r0 === 'data' && r1 && !r2 && m === 'GET') return json(await lihatData(env, user, perluDataset(r1), url));
    if (r0 === 'usulan' && !r1 && m === 'GET') {
      let q = 'SELECT * FROM usulan WHERE 1=1', b = [];
      if (!isVerif(user)) { q += ' AND instansi=?'; b.push(user.instansi); }
      const st = url.searchParams.get('status'); if (st) { q += ' AND status=?'; b.push(st); }
      const us = (await env.DB.prepare(q + ' ORDER BY id DESC LIMIT 500').bind(...b).all()).results, lama = {};
      const bid = [...new Set(us.map(u => u.baris_id).filter(Boolean))];
      if (bid.length) for (const r of (await env.DB.prepare(`SELECT id,data,status_data,terbit FROM baris WHERE id IN (${bid.map(() => '?').join(',')})`).bind(...bid).all()).results) lama[r.id] = r;
      return json({ usulan: us.map(u => ({ ...u, data_baru: parse(u.data_baru), data_lama: u.baris_id && lama[u.baris_id] ? parse(lama[u.baris_id].data) : null })) });
    }
    if (r0 === 'usulan' && !r1 && m === 'POST') return json(await buatUsulan(env, user, await bodyJson(request)));
    if (r0 === 'usulan' && r1 === 'ajukan' && m === 'POST') return json(await ajukan(env, user, await bodyJson(request)));
    if (r0 === 'usulan' && r1 && r2 === 'verifikasi' && m === 'POST') return json(await verifikasi(env, user, +r1, await bodyJson(request)));
    if (r0 === 'usulan' && r1 && !r2 && m === 'DELETE') {
      const u = await env.DB.prepare('SELECT * FROM usulan WHERE id=?').bind(+r1).first();
      if (!u || u.oleh !== user.email || !['draft', 'dikembalikan'].includes(u.status)) bad('Hanya draf milik Anda yang dapat dihapus', 403);
      await env.DB.prepare('DELETE FROM usulan WHERE id=?').bind(u.id).run(); return json({ ok: true });
    }
    if (r0 === 'terbit' && m === 'POST') return json(await terbitkan(env, user, await bodyJson(request)));
    if (r0 === 'tarik' && m === 'POST') return json(await tarik(env, user, await bodyJson(request)));
    if (r0 === 'pahandep') return json(await pahandep(env, user, request, path));
    if (r0 === 'permintaan') return json(await permintaan(env, user, request, path));
    if (r0 === 'pengguna') return json(await pengguna(env, user, request, path));
    if (r0 === 'wali') return json(await waliApi(env, user, request));
    if (r0 === 'notifikasi' && !r1 && m === 'GET') return json({ notifikasi: (await env.DB.prepare('SELECT id,judul,isi,tipe,tautan,dibaca,dibuat,email_status FROM notifikasi WHERE email=? ORDER BY id DESC LIMIT 100').bind(user.email).all()).results });
    if (r0 === 'notifikasi' && r1 === 'baca' && m === 'POST') { const b = await bodyJson(request); if (b.ids && b.ids.length) await env.DB.prepare(`UPDATE notifikasi SET dibaca=1 WHERE email=? AND id IN (${b.ids.map(() => '?').join(',')})`).bind(user.email, ...b.ids.map(Number)).run(); else await env.DB.prepare('UPDATE notifikasi SET dibaca=1 WHERE email=?').bind(user.email).run(); return json({ ok: true }); }
    if (r0 === 'riwayat') { if (!isVerif(user)) bad('Tidak berwenang', 403); return json({ riwayat: (await env.DB.prepare('SELECT * FROM riwayat ORDER BY id DESC LIMIT 300').all()).results }); }
    if (r0 === 'ringkasan') { if (!isVerif(user)) bad('Tidak berwenang', 403); const g = async q => (await env.DB.prepare(q).first()).n; return json({ diajukan: await g("SELECT COUNT(*) n FROM usulan WHERE status='diajukan'"), terverifikasi: await g("SELECT COUNT(*) n FROM baris WHERE status_data='terverifikasi'"), permintaan_baru: await g("SELECT COUNT(*) n FROM permintaan_data WHERE status='masuk'"), mitra_baru: await g("SELECT COUNT(*) n FROM pendaftaran_mitra WHERE status IN ('masuk','diterima_pd')") }); }
    bad('Tidak ditemukan', 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('API error', e && e.stack || e);
    return json({ error: 'Terjadi kesalahan pada server' }, 500);
  }
}
