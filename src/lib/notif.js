// Notifikasi: lonceng di halaman admin (tabel notifikasi) + surel (Resend, bila RESEND_API_KEY diatur).
import { nowIso, wib, periodeData } from './util.js';
import { INSTANSI } from './datasets.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function kirimEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return 'dilewati';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>` })
    });
    return r.ok ? 'terkirim' : 'gagal:' + r.status;
  } catch { return 'gagal'; }
}
export async function notify(env, penerima, { judul, isi, tipe = 'info', tautan = '' }) {
  const uniq = [...new Set(penerima.filter(Boolean).map(e => e.toLowerCase()))];
  for (const email of uniq) {
    const u = await env.DB.prepare('SELECT terima_email,aktif FROM pengguna WHERE email=?').bind(email).first();
    if (!u || !u.aktif) continue;
    const st = u.terima_email ? await kirimEmail(env, email, '[SIF POINT BATARA] ' + judul, isi + (tautan && env.SITE_URL ? `\n\nBuka: ${env.SITE_URL}${tautan}` : '')) : 'tidak diminta';
    await env.DB.prepare('INSERT INTO notifikasi (email,judul,isi,tipe,tautan,dibaca,dibuat,email_status) VALUES (?,?,?,?,?,0,?,?)')
      .bind(email, judul, isi, tipe, tautan, nowIso(), st).run();
  }
  return uniq.length;
}
export const emailsOf = async (env, { peran, instansi } = {}) => {
  let q = 'SELECT email FROM pengguna WHERE aktif=1', b = [];
  if (peran) { q += ' AND peran IN (' + [].concat(peran).map(() => '?').join(',') + ')'; b.push(...[].concat(peran)); }
  if (instansi) { q += ' AND instansi=?'; b.push(instansi); }
  return (await env.DB.prepare(q).bind(...b).all()).results.map(r => r.email);
};
export async function catat(env, user, aksi, dataset, objek, ringkas) {
  await env.DB.prepare('INSERT INTO riwayat (waktu,email,peran,aksi,dataset,objek,ringkas) VALUES (?,?,?,?,?,?,?)')
    .bind(nowIso(), user ? user.email : 'sistem', user ? user.peran : 'sistem', aksi, dataset || null, objek == null ? null : String(objek), (ringkas || '').slice(0, 500)).run();
}
// Status pemutakhiran tiap instansi pada satu periode: sudah mengajukan usulan atau sudah konfirmasi "tidak ada perubahan".
export async function progresPeriode(env, periode) {
  const out = [];
  for (const [kode, nama, , admin] of INSTANSI) {
    if (!admin) continue;
    const dr = await env.DB.prepare("SELECT COUNT(*) n FROM usulan WHERE periode=? AND instansi=? AND status<>'draft'").bind(periode, kode).first();
    const draft = await env.DB.prepare("SELECT COUNT(*) n FROM usulan WHERE periode=? AND instansi=? AND status='draft'").bind(periode, kode).first();
    const kf = await env.DB.prepare('SELECT oleh,tanggal,catatan FROM konfirmasi WHERE periode=? AND instansi=?').bind(periode, kode).first();
    out.push({ instansi: kode, nama, diajukan: dr.n, draft: draft.n, konfirmasi: kf || null, selesai: dr.n > 0 || !!kf });
  }
  return out;
}
// Pengingat triwulan. Dipanggil harian oleh Worker cron (08.00 WIB) dan dapat dipicu manual Super Admin.
// Jadwal mengikuti Diktum KEENAM: data disampaikan paling lambat tanggal 10 bulan pertama triwulan berikutnya.
export async function jalankanPengingat(env, now = new Date(), { paksa = false } = {}) {
  const w = wib(now), p = periodeData(now);
  const bulanTenggat = Number(p.buka.slice(5, 7));
  if (!paksa && w.m !== bulanTenggat && w.dow !== 1) return { dilewati: 'bukan hari pengingat', periode: p.id };
  const log = async k => !!(await env.DB.prepare('SELECT 1 x FROM pengingat_log WHERE kunci=?').bind(k).first());
  const tandai = k => env.DB.prepare('INSERT OR IGNORE INTO pengingat_log (kunci,waktu) VALUES (?,?)').bind(k, nowIso()).run();
  const prog = await progresPeriode(env, p.id);
  const belum = prog.filter(x => !x.selesai);
  const hasil = { periode: p.id, hari: w.iso, terkirim: [] };
  const kirim = async (kode, jenis, judul, isi) => {
    const k = `${p.id}|${jenis}|${kode}|${jenis === 'mingguan' ? w.iso : ''}`;
    if (!paksa && await log(k)) return;
    const n = await notify(env, await emailsOf(env, { instansi: kode, peran: 'pic' }), { judul, isi, tipe: 'pengingat', tautan: '/admin.html' });
    if (n) { await tandai(k); hasil.terkirim.push(`${kode}:${jenis}`); }
  };
  if ((w.d === 1 && w.m === bulanTenggat) || paksa) for (const x of prog) await kirim(x.instansi, 'buka', `Pemutakhiran data ${p.label} dibuka`,
    `Bapak/Ibu PIC Data ${x.nama}: pemutakhiran data ${p.label} dibuka. Mohon perbarui data sesuai tugas Perangkat Daerah dan ajukan paling lambat ${p.tenggat} (Keputusan Bupati, Diktum KEENAM). Bila tidak ada perubahan, tekan "Tidak ada perubahan" di halaman admin.`);
  if ((w.d === 7 && w.m === bulanTenggat) || paksa) for (const x of belum) await kirim(x.instansi, 'h3', `Pengingat: tenggat data ${p.label} ${p.tenggat}`,
    `Data ${x.nama} untuk ${p.label} belum diajukan. Tenggat ${p.tenggat}.`);
  if ((w.d === 10 && w.m === bulanTenggat) || paksa) for (const x of belum) await kirim(x.instansi, 'harih', `Hari ini tenggat data ${p.label}`,
    `Hari ini tenggat penyampaian data ${x.nama} untuk ${p.label}. Mohon ajukan hari ini.`);
  if ((w.dow === 1 && (w.m > bulanTenggat || w.d > 10)) || paksa) for (const x of belum) await kirim(x.instansi, 'mingguan', `Terlambat: data ${p.label}`,
    `Data ${x.nama} untuk ${p.label} melewati tenggat ${p.tenggat} dan belum diajukan.`);
  if (((w.d === 11 && w.m === bulanTenggat) || paksa) && belum.length) {
    const k = `${p.id}|rekap|`;
    if (paksa || !(await log(k))) {
      await notify(env, await emailsOf(env, { peran: ['verifikator', 'super'] }), { judul: `Rekap keterlambatan data ${p.label}`, isi: `Instansi yang belum menyampaikan: ${belum.map(b => b.nama).join('; ')}.`, tipe: 'rekap', tautan: '/publish.html' });
      await tandai(k); hasil.terkirim.push('rekap');
    }
  }
  return hasil;
}
