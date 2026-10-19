/* ============================================================
   PENGATURAN SUMBER DATA SIF POINT BATARA
   ------------------------------------------------------------
   Data publik dibaca dari backend (basis data Cloudflare D1) melalui alamat /api/public/*.csv.
   Hanya baris yang SUDAH disetujui terbit oleh Super Admin yang tampil. Data pribadi mitra,
   permintaan data, dan log tidak pernah ada pada alamat publik.
   Bila backend belum dipasang, website tetap memakai data bawaan (tanpa kesalahan).
   Untuk memakai Google Sheets sebagai gantinya, isi tiap kunci dengan tautan CSV https:// tab terkait.
   ============================================================ */
window.SIF_CFG = {
  api:       '/api/public',                    // pencatatan otomatis permintaan data (SOP-04) dan pendaftaran mitra (SOP-05)
  peluang:   '/api/public/peluang.csv',
  titik:     '/api/public/titik.csv',
  pabrik:    '/api/public/pabrik.csv',
  kecamatan: '/api/public/kecamatan.csv',
  kontak:    '/api/public/kontak.csv',
  produksi:  '/api/public/produksi.csv',
  realisasi: '/api/public/realisasi.csv',
  mitra:     '/api/public/mitra.csv',          // hanya profil usaha yang disetujui pelaku usaha dan sudah terbit

  /* Batas wilayah resmi (GeoJSON, WGS 84 / EPSG:4326). Simpan berkas di folder yang sama lalu tulis namanya. */
  batas_kecamatan: '',
  batas_desa:      '',
  batas_sumber:    ''
};
