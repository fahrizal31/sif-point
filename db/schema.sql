-- SIF POINT BATARA: skema basis data (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS instansi (kode TEXT PRIMARY KEY, nama TEXT NOT NULL, peran_sop TEXT, admin_data INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pengguna (
  email TEXT PRIMARY KEY, nama TEXT, jabatan TEXT, instansi TEXT REFERENCES instansi(kode),
  peran TEXT NOT NULL CHECK (peran IN ('pic','verifikator','super')),
  aktif INTEGER NOT NULL DEFAULT 1, terima_email INTEGER NOT NULL DEFAULT 1, dibuat TEXT NOT NULL, terakhir_masuk TEXT);
CREATE TABLE IF NOT EXISTS wali_aturan (id INTEGER PRIMARY KEY AUTOINCREMENT, dataset TEXT NOT NULL, kolom TEXT NOT NULL DEFAULT '*', instansi TEXT NOT NULL REFERENCES instansi(kode), UNIQUE(dataset,kolom,instansi));
CREATE TABLE IF NOT EXISTS baris (
  id INTEGER PRIMARY KEY AUTOINCREMENT, dataset TEXT NOT NULL, kunci TEXT NOT NULL, instansi TEXT,
  data TEXT NOT NULL,                       -- isi kerja (belum tentu terbit)
  status_data TEXT NOT NULL DEFAULT 'sementara' CHECK (status_data IN ('sementara','terverifikasi','resmi')),
  nomor_ba TEXT, tanggal_mutakhir TEXT,
  terbit TEXT NOT NULL DEFAULT '',          -- 'ya' bila disetujui terbit
  terbit_data TEXT, terbit_meta TEXT,                         -- salinan yang dilihat publik (hanya berubah saat Super Admin menerbitkan)
  hapus INTEGER NOT NULL DEFAULT 0, versi INTEGER NOT NULL DEFAULT 1, diubah_oleh TEXT, diubah_pada TEXT NOT NULL, UNIQUE(dataset,kunci));
CREATE INDEX IF NOT EXISTS ix_baris_ds ON baris(dataset, terbit);
CREATE TABLE IF NOT EXISTS usulan (
  id INTEGER PRIMARY KEY AUTOINCREMENT, dataset TEXT NOT NULL, baris_id INTEGER, kunci TEXT, aksi TEXT NOT NULL CHECK (aksi IN ('ubah','tambah','hapus')),
  data_baru TEXT NOT NULL, instansi TEXT NOT NULL, periode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','diajukan','dikembalikan','terverifikasi','ditolak','ditetapkan')),
  oleh TEXT NOT NULL, dibuat TEXT NOT NULL, diajukan_pada TEXT, diverifikasi_oleh TEXT, diverifikasi_pada TEXT, catatan TEXT);
CREATE INDEX IF NOT EXISTS ix_usulan_st ON usulan(status, periode);
CREATE TABLE IF NOT EXISTS konfirmasi (periode TEXT NOT NULL, instansi TEXT NOT NULL, oleh TEXT NOT NULL, tanggal TEXT NOT NULL, catatan TEXT, PRIMARY KEY (periode, instansi));
CREATE TABLE IF NOT EXISTS notifikasi (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, judul TEXT NOT NULL, isi TEXT, tipe TEXT, tautan TEXT, dibaca INTEGER NOT NULL DEFAULT 0, dibuat TEXT NOT NULL, email_status TEXT);
CREATE INDEX IF NOT EXISTS ix_notif ON notifikasi(email, dibaca);
CREATE TABLE IF NOT EXISTS riwayat (id INTEGER PRIMARY KEY AUTOINCREMENT, waktu TEXT NOT NULL, email TEXT, peran TEXT, aksi TEXT NOT NULL, dataset TEXT, objek TEXT, ringkas TEXT);
CREATE TABLE IF NOT EXISTS pengingat_log (kunci TEXT PRIMARY KEY, waktu TEXT NOT NULL);
-- Data rahasia: isi terenkripsi AES-GCM (kunci PII_KEY pada rahasia Cloudflare, tidak ada di basis data)
CREATE TABLE IF NOT EXISTS mitra_kontak (kode TEXT PRIMARY KEY, enc TEXT NOT NULL, dibuat TEXT NOT NULL, diubah_oleh TEXT);
CREATE TABLE IF NOT EXISTS permintaan_data (nomor TEXT PRIMARY KEY, kategori TEXT, status TEXT NOT NULL DEFAULT 'masuk', enc TEXT NOT NULL, dibuat TEXT NOT NULL, diubah TEXT, petugas TEXT);
CREATE TABLE IF NOT EXISTS pendaftaran_mitra (nomor TEXT PRIMARY KEY, saluran TEXT, penerima TEXT, status TEXT NOT NULL DEFAULT 'masuk', kode_mitra TEXT, enc TEXT NOT NULL, dibuat TEXT NOT NULL, diubah TEXT, petugas TEXT);
CREATE TABLE IF NOT EXISTS ratelimit (kunci TEXT PRIMARY KEY, n INTEGER NOT NULL, jendela TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_code (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL, window_start INTEGER NOT NULL, sent_count INTEGER NOT NULL DEFAULT 1);
