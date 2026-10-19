# Menjalankan SIF POINT BATARA di Vercel + TiDB Cloud Starter

Paket ini memakai Vercel untuk website, API, login admin, dan pengingat harian. TiDB Cloud Starter menyimpan data. Login admin memakai kode sekali pakai lewat Resend; Cloudflare Access tidak diperlukan. **Jangan unggah file `.env.local`, kunci, atau kata sandi ke repositori.**

## Persiapan

1. Buat database `sif_point_batara` di TiDB Cloud Starter, lalu ambil connection string MySQL dari tombol **Connect**. Database `sys` pada tampilan koneksi TiDB adalah database sistem; jangan gunakan untuk tabel aplikasi. TiDB Starter mensyaratkan koneksi TLS. Pengandar di paket ini memverifikasi sertifikat server memakai `certs/isrgrootx1.pem`.
2. Siapkan domain pengirim yang sudah terverifikasi di Resend, beserta API key. Kode login tidak dapat dikirim tanpa keduanya.
3. Siapkan surel Super Admin pertama. Surel ini harus bisa menerima kode masuk.
4. Gunakan Node.js 24.

## Siapkan database

Buka terminal di akar folder ini, lalu jalankan:

```powershell
npm ci
Copy-Item .env.example .env.local
# Sunting TIDB_URL di .env.local, lalu:
node --env-file=.env.local db/setup-tidb.mjs
```

Ganti `USER`, `PASSWORD`, dan `HOST` dengan data dari TiDB. Bila kata sandi berisi `@`, `:`, `/`, atau `#`, lakukan URL encoding sebelum memasukkannya ke URL. Skrip membuat tabel dan mengimpor 396 baris data awal. Skrip aman dijalankan lagi: data kerja yang sudah ada tidak ditimpa. **Jalankan hanya setelah memastikan database yang dituju benar.**

Untuk mencoba antarmuka di komputer tanpa TiDB atau Resend, jalankan `npm run dev`, lalu buka `http://localhost:8788/login.html`. Gunakan `super@contoh.go.id`; kode uji tampil di halaman login lokal. Mode ini memakai SQLite sementara dan hanya mendengarkan koneksi dari komputer sendiri.

## Variabel Vercel

Pada proyek Vercel, buka **Settings → Environment Variables**. Isi untuk **Production** (dan Preview bila perlu):

| Nama | Isi |
|---|---|
| `TIDB_URL` | Connection string MySQL TiDB Cloud Starter, seperti di atas. |
| `PII_KEY` | Kunci enkripsi 32 byte dalam base64. Simpan salinan aman; kehilangan kunci membuat data pribadi lama tidak bisa dibuka. |
| `SESSION_SECRET` | String acak minimal 32 karakter untuk menandatangani sesi login. |
| `CRON_SECRET` | String acak minimal 16 karakter untuk melindungi pengingat otomatis. |
| `SUPER_ADMIN_EMAILS` | Surel admin pertama; beberapa surel dipisah koma. |
| `RESEND_API_KEY` | API key Resend untuk kode login dan notifikasi. |
| `MAIL_FROM` | Alamat pengirim pada domain yang sudah diverifikasi di Resend. |
| `SITE_URL` | URL domain produksi, contoh `https://sifpointbatara.id`. |
| `EMAIL_DOMAIN_DINAS` | Opsional, domain surel yang boleh didaftarkan sebagai admin. |

Untuk membuat nilai acak dengan Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Jalankan terpisah untuk `PII_KEY`, `SESSION_SECRET`, dan `CRON_SECRET`. **Jangan mengganti `PII_KEY` setelah data pribadi disimpan.** `TURNSTILE_SECRET` bersifat opsional; isi hanya setelah formulir publik dipasangi widget Turnstile.

## Deploy

1. Unggah seluruh isi folder ini ke akar repositori GitHub, lalu impor repositori tersebut di Vercel. Biarkan **Root Directory** sebagai akar repositori (`./`).
2. Framework Preset: **Other**. Build Command: `npm run build`. Output Directory: `public`. Install Command: `npm ci`. Pengaturan yang sama sudah ada di `vercel.json`.
3. Atur Node.js **24.x** dan Function Region dekat region TiDB yang dipilih. Hubungkan domain resmi dan isi `SITE_URL` dengan alamatnya.
4. Deploy. Buka `/api/public/status`, `/api/public/peluang.csv`, dan `/login.html` pada alamat deployment.
5. Minta kode login memakai surel `SUPER_ADMIN_EMAILS`, buka `/publish.html`, lalu tambahkan akun petugas melalui **Akun dan wali data**.
6. Pengingat dijadwalkan setiap hari pukul **08.00 WIB** melalui Vercel Cron (`01.00 UTC`), dengan `CRON_SECRET`. Pada paket Hobby, pemanggilan dapat terjadi antara **08.00–08.59 WIB**.

Setelah domain aktif, uji rute utama tanpa mengubah data: isi `SITE_URL` di `.env.local`, lalu jalankan `node --env-file=.env.local scripts/smoke-vercel.mjs`.

## Pemeriksaan setelah deploy

- Halaman utama dan CSV publik tampil, dengan data TiDB.
- `/admin.html` tanpa sesi mengarah ke `/login.html`.
- Kode masuk diterima, lalu `/api/me` menunjukkan peran yang benar.
- Akun PIC hanya bisa mengubah kolom wali datanya, verifikator dapat memeriksa, Super Admin dapat menerbitkan.
- Kirim formulir permintaan data uji, lalu cek data terenkripsi dapat dibuka oleh verifikator dan tidak tampil di CSV publik.
- Cek Function Logs Vercel bila ada HTTP 500; periksa koneksi TiDB, env, dan Resend.

Catatan: pengujian otomatis lokal tidak menggantikan uji koneksi pada akun TiDB dan Vercel milik Anda. Jangan menganggap sistem bebas error produksi sebelum pemeriksaan di atas lulus.
