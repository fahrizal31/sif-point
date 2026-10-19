// Daftar dataset (kolom mengikuti tab Google Sheets yang sudah dipakai website) dan aturan wali data.
const META = ['status_data', 'nomor_ba', 'tanggal_mutakhir', 'terbit'];
export const DS = {
  peluang: { judul: 'Peluang Investasi', kunci: ['kode'], publik: true,
    kolom: ['kode','nama','sektor','komoditas','nilai_investasi','npv','irr','payback','catatan','warna','hulu','antara','hilir','sumber','periode','satuan','wilayah','perangkat_daerah'] },
  titik: { judul: 'Titik Peluang', kunci: ['kode','lintang','bujur'], publik: true,
    kolom: ['kode','kecamatan','lintang','bujur','sumber','periode','satuan','wilayah','perangkat_daerah'] },
  pabrik: { judul: 'Pabrik Hilirisasi', kunci: ['rantai','nama_fasilitas','lintang','bujur'], publik: true,
    kolom: ['rantai','nama_fasilitas','kecamatan','lintang','bujur','status','keterangan','sumber','periode','satuan','wilayah','perangkat_daerah'] },
  kecamatan: { judul: 'Profil Kecamatan', kunci: ['nama'], publik: true,
    kolom: ['nama','kode','ibu_kota','kelurahan','desa','sd','mi','smp','mts','sma','ma','smk','slb','puskesmas','rumah_sakit','pusat_kegiatan','keterangan_pusat','pelabuhan','kawasan_rtrw_kode','kawasan_rtrw','pasar','prasarana_lain','komoditas_khas','sumber','periode','satuan','wilayah','perangkat_daerah','sarana_perdagangan','fasilitas_penunjang','komoditas_utama'] },
  produksi: { judul: 'Produksi Komoditas', kunci: ['kecamatan','komoditas','tahun','periode'], publik: true,
    kolom: ['kecamatan','komoditas','tahun','periode','luas_tanam_ha','luas_panen_ha','produksi_ton','satuan','sumber','perangkat_daerah'],
    meta: ['status_data','nomor_ba','tanggal_mutakhir','terbit'] },
  realisasi: { judul: 'Realisasi Investasi (LKPM)', kunci: ['tahun','triwulan'], publik: true,
    kolom: ['tahun','triwulan','target_kumulatif_miliar','realisasi_kumulatif_miliar','target_tahunan_miliar','pma_kumulatif_miliar','pmdn_kumulatif_miliar','porsi_pma_persen','tenaga_kerja_kumulatif','kontribusi_target_kalteng_persen','periode_lkpm','sumber'] },
  kontak: { judul: 'Kontak dan Tautan Layanan', kunci: ['kunci'], publik: true, tanpaMeta: true,
    kolom: ['kunci','nilai','keterangan'] },
  // Profil mitra PAHANDEP INVESTOR yang BOLEH tampil. NIB, KBLI, status verifikasi NIB, modal, dan kontak TIDAK pernah ada di sini: tersimpan terenkripsi di tabel mitra_kontak.
  mitra: { judul: 'Mitra Usaha (PAHANDEP INVESTOR)', kunci: ['kode'], publik: true, syaratTerbit: r => String(r.persetujuan_pelaku_usaha).toLowerCase() === 'ya',
    kolom: ['kode','nama_usaha','bentuk_usaha','sektor','produk_komoditas','kapasitas','kecamatan','desa','skala_usaha','kebutuhan_kemitraan','uraian_kemitraan','persetujuan_pelaku_usaha','sumber','periode','satuan','wilayah','perangkat_daerah'] },
  // Data penunjang menurut tugas tiap instansi pada SOP (lingkungan, pariwisata, ketenagakerjaan, perikanan, infrastruktur, dan lain-lain). Belum dibaca halaman publik.
  penunjang: { judul: 'Data Penunjang per Instansi', kunci: ['instansi','jenis_data','periode','uraian'], publik: true, perInstansi: true,
    kolom: ['instansi','jenis_data','uraian','nilai','satuan','periode','wilayah','sumber'] }
};
// Kolom rahasia: tidak boleh menjadi kolom dataset mana pun (publik maupun kerja) dan selalu dibuang bila terlanjur ada pada isi baris.
export const KOLOM_RAHASIA = /(^|_)(nib|kbli|npwp|nik|modal|telepon|hp|wa|surel|email|alamat|penanggung|rekening)(_|$)/i;
for (const [k, d] of Object.entries(DS)) for (const c of d.kolom) if (KOLOM_RAHASIA.test(c)) throw new Error(`Kolom rahasia ${c} tidak boleh ada pada dataset ${k}`);
export const buangRahasia = o => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (!KOLOM_RAHASIA.test(k)) r[k] = v; return r; };
export const metaKolom = d => (DS[d].tanpaMeta ? [] : META);
export const semuaKolom = d => [...DS[d].kolom, ...metaKolom(d)];
export const kunciBaris = (d, data) => {
  if (d === 'penunjang') return [data.instansi, data.jenis_data, data.periode, data.uraian].map(v => String(v || '').trim()).join('|');
  return DS[d].kunci.map(k => String(data[k] == null ? '' : data[k]).trim()).join('|');
};
export const INSTANSI = [
  ['DPMPTSP', 'Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu', 'Pengelola SIF POINT BATARA; admin verifikator', 0],
  ['DISKOMINFOSANDI', 'Dinas Komunikasi, Informatika, dan Persandian', 'Walidata Daerah; Super Admin bersama Bidang Penanaman Modal', 0],
  ['BAPPERIDA', 'Badan Perencanaan Pembangunan, Riset dan Inovasi Daerah', 'Koordinator perencanaan dan penyelarasan data', 0],
  ['DISTAN', 'Dinas Pertanian', 'Produsen Data', 1],
  ['DKPP', 'Dinas Ketahanan Pangan dan Perikanan', 'Produsen Data', 1],
  ['DPUPR', 'Dinas Pekerjaan Umum dan Penataan Ruang', 'Produsen Data', 1],
  ['DLH', 'Dinas Lingkungan Hidup', 'Produsen Data', 1],
  ['DISDAGRIN', 'Dinas Perdagangan dan Perindustrian', 'Produsen Data', 1],
  ['DISNAKERTRANSKOP', 'Dinas Tenaga Kerja, Transmigrasi, Koperasi, Usaha Kecil dan Menengah', 'Produsen Data', 1],
  ['DISBUDPARPORA', 'Dinas Kebudayaan, Pariwisata, Kepemudaan dan Olahraga', 'Penyedia Data Penunjang', 1]
];
// Aturan wali data awal (dasar: lampiran SOP, tugas tiap perangkat daerah). Dapat diubah Super Admin pada tabel wali_aturan.
export const WALI_AWAL = [
  ['produksi', '*', 'DISTAN'],
  ['kecamatan', 'pasar', 'DISDAGRIN'], ['kecamatan', 'sarana_perdagangan', 'DISDAGRIN'], ['kecamatan', 'komoditas_khas', 'DISDAGRIN'],
  ['kecamatan', 'komoditas_utama', 'DISTAN'],
  ['kecamatan', 'fasilitas_penunjang', 'DISNAKERTRANSKOP'], ['kecamatan', 'fasilitas_penunjang', 'DISBUDPARPORA'],
  ['kecamatan', 'pelabuhan', 'DPUPR'], ['kecamatan', 'prasarana_lain', 'DPUPR'], ['kecamatan', 'kawasan_rtrw_kode', 'DPUPR'], ['kecamatan', 'kawasan_rtrw', 'DPUPR'],
  ['kecamatan', 'pusat_kegiatan', 'DPUPR'], ['kecamatan', 'keterangan_pusat', 'DPUPR'],
  ['kecamatan', '*', 'DPMPTSP'],
  ['peluang', '*', 'DPMPTSP'], ['titik', '*', 'DPMPTSP'], ['pabrik', '*', 'DPMPTSP'],
  ['realisasi', '*', 'DPMPTSP'], ['kontak', '*', 'DPMPTSP'], ['mitra', '*', 'DPMPTSP']
];
