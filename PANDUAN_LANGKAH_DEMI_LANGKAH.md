# Panduan unggah SIF POINT BATARA ke GitHub dan Vercel

Ikuti urutan ini dari atas ke bawah. Folder yang dipakai adalah **`SIF_POINT_BATARA_UPLOAD_GITHUB_VERCEL`**. Database TiDB `sif_point_batara` sudah dibuat dan berisi data awal, sehingga Anda tidak perlu menjalankan skrip impor lagi.

## 1. Siapkan akun dan informasi

Anda memerlukan akun GitHub, Vercel, TiDB Cloud, dan Resend; satu alamat email untuk Super Admin; serta domain untuk mengirim email login. Domain situs resmi bisa dihubungkan setelah situs awal berhasil tampil.

Simpan kata sandi TiDB, API key Resend, dan kunci aplikasi di pengelola kata sandi. Jangan menaruhnya dalam berkas GitHub. Kata sandi TiDB yang pernah dibagikan melalui percakapan sebaiknya diganti setelah pengaturan selesai; perbarui juga `TIDB_URL` di Vercel setelah menggantinya.

## 2. Unggah ke GitHub

1. Masuk ke [GitHub](https://github.com/) dan buat repositori baru, misalnya `sif-point-batara`. Pilih **Private** jika akses kode ingin dibatasi.
2. Di halaman repositori, pilih **Add file → Upload files**.
3. Buka folder `SIF_POINT_BATARA_UPLOAD_GITHUB_VERCEL` di komputer. **Pilih semua isi di dalam folder**, lalu seret ke halaman unggah GitHub. Jangan mengunggah folder pembungkusnya sebagai satu tingkat tambahan.
4. Pastikan `package.json`, `vercel.json`, `api/`, `src/`, `situs/`, dan `certs/` terlihat dalam daftar unggahan. Pastikan **tidak ada** `.env.local`, `node_modules/`, atau `public/`.
5. Isi pesan commit, misalnya `Unggah aplikasi SIF POINT BATARA`, lalu selesaikan unggahan. Di halaman utama repositori, `package.json` dan `vercel.json` harus terlihat langsung, bukan di dalam subfolder.

GitHub mendukung seret file atau folder di halaman unggah. Batas unggah lewat browser adalah 25 MiB per file dan 100 file sekaligus; paket ini sudah diperiksa berada di bawah batas tersebut. [Petunjuk GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 3. Siapkan email login di Resend

1. Di Resend, tambahkan domain pengirim pada menu **Domains**.
2. Salin catatan DNS yang ditampilkan Resend ke pengelola DNS domain Anda, lalu tunggu status domain menjadi **Verified**. Gunakan nilai DNS yang diberikan Resend untuk domain Anda sendiri.
3. Pada menu **API Keys**, buat kunci dengan izin **Sending access** untuk domain tersebut. Simpan kuncinya; ini akan menjadi `RESEND_API_KEY`.
4. Tentukan alamat pengirim, misalnya `SIF POINT BATARA <no-reply@domain-anda.go.id>`. Ini akan menjadi `MAIL_FROM`. Di formulir variabel Vercel, masukkan nilainya **tanpa tanda kutip tambahan**.

Kode login admin dikirim lewat email; login produksi belum dapat diuji sebelum pengiriman email ini siap. [Panduan verifikasi domain Resend](https://resend.com/changelog/domain-verification-events) · [Panduan izin API key Resend](https://resend.com/changelog/new-api-key-permissions)

## 4. Buat tiga kunci aplikasi

Buka PowerShell pada komputer Anda. Jalankan perintah berikut **tiga kali**; hasil setiap kali akan berbeda:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Simpan hasil pertama sebagai `PII_KEY`, kedua sebagai `SESSION_SECRET`, dan ketiga sebagai `CRON_SECRET`. Jangan memasukkan hasilnya ke GitHub. Simpan salinan `PII_KEY` secara aman; menggantinya setelah data pribadi tersimpan dapat membuat data lama tidak bisa dibuka.

Jika perintah `node` tidak dikenali, pasang Node.js 24 terlebih dahulu dari [situs Node.js](https://nodejs.org/en/download), lalu buka ulang PowerShell.

## 5. Impor repositori ke Vercel

1. Masuk ke [Vercel](https://vercel.com/), pilih **Add New → Project**, hubungkan akun GitHub, lalu pilih repositori tadi.
2. Periksa pengaturan proyek:

   | Pengaturan | Nilai |
   |---|---|
   | Root Directory | `./` atau akar repositori |
   | Framework Preset | `Other` |
   | Build Command | `npm run build` |
   | Output Directory | `public` |
   | Install Command | `npm ci` |
   | Node.js Version | `24.x` |

3. Tambahkan variabel berikut untuk lingkungan **Production** sebelum memilih **Deploy**. Bila Vercel menyediakan pilihan lingkungan pada formulir impor, pilih Production. Variabel dapat ditambah atau diperbaiki kemudian di **Project → Settings → Environment Variables**.

   | Nama variabel | Isi yang dimasukkan |
   |---|---|
   | `TIDB_URL` | Connection string MySQL TiDB Anda. Ganti nama database di ujung URL dari `/sys` menjadi `/sif_point_batara`. Jangan ubah host, port, username, atau password saat menyalinnya. |
   | `PII_KEY` | Hasil acak pertama dari langkah 4. |
   | `SESSION_SECRET` | Hasil acak kedua dari langkah 4. |
   | `CRON_SECRET` | Hasil acak ketiga dari langkah 4. |
   | `SUPER_ADMIN_EMAILS` | Alamat email Anda yang akan menjadi Super Admin dan bisa menerima kode login. |
   | `RESEND_API_KEY` | API key Resend dari langkah 3. |
   | `MAIL_FROM` | Alamat pengirim pada domain Resend yang terverifikasi. |

   Jika kata sandi TiDB mengandung `@`, `:`, `/`, `#`, atau karakter khusus URL lain, gunakan connection string siap salin dari TiDB dan lakukan URL encoding pada bagian kata sandi. **Jangan pilih database `sys`**, karena itu database sistem.

4. Pilih **Deploy**. Vercel akan memberi alamat awal seperti `https://nama-proyek.vercel.app`.

Vercel mendukung impor repositori GitHub, pengaturan root/build, dan variabel lingkungan saat membuat proyek. Node.js 24 didukung dan juga dinyatakan di `package.json` paket ini. [Panduan impor Vercel](https://vercel.com/docs/git) · [Versi Node.js di Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

## 6. Isi alamat situs dan uji

1. Di **Settings → Environment Variables**, tambahkan `SITE_URL` berisi alamat awal Vercel tadi, **tanpa garis miring di akhir**. Jika nanti memakai domain resmi, ganti nilainya dengan `https://domain-resmi-anda`.
2. Setelah menambah atau mengubah variabel, lakukan **Redeploy** dari menu **Deployments**. Perubahan variabel hanya berlaku pada deployment baru. [Penjelasan Vercel](https://vercel.com/docs/environment-variables)
3. Buka alamat situs. Lalu periksa:

   - `https://alamat-situs/api/public/status` → menampilkan JSON dengan `"ok":true`.
   - `https://alamat-situs/api/public/peluang.csv` → mengunduh atau menampilkan CSV.
   - `https://alamat-situs/login.html` → tampil halaman login.
   - Masuk dengan email `SUPER_ADMIN_EMAILS`, minta kode, dan periksa kotak masuk atau folder spam. Setelah masuk, buka `/publish.html`.

Jika menggunakan domain resmi, hubungkan domain itu lewat **Project → Settings → Domains**, ikuti petunjuk DNS Vercel, lalu ganti `SITE_URL` dan redeploy.

## Jika ada masalah

| Gejala | Yang diperiksa |
|---|---|
| Build gagal atau halaman 404 | Pastikan `package.json` berada di akar repositori dan Root Directory `./`. |
| `/api/public/status` menampilkan 500 | Periksa `TIDB_URL`, terutama akhiran `/sif_point_batara`, lalu lihat **Vercel → Logs**. |
| Login menyebut email belum dikonfigurasi atau kode tidak tiba | Periksa status domain Resend, `RESEND_API_KEY`, `MAIL_FROM`, dan email Super Admin. |
| Mengubah variabel tetapi hasil lama masih muncul | Lakukan redeploy; deployment lama tidak menerima nilai variabel baru. |
| `/admin.html` mengarah ke login | Ini normal sebelum Anda masuk. |

Pengingat otomatis memakai Vercel Cron dengan jadwal `01.00 UTC` atau sekitar `08.00 WIB` setiap hari. Pada paket Hobby, Vercel dapat menjalankannya kapan saja antara **08.00–08.59 WIB**. `CRON_SECRET` harus terisi. [Ketentuan Cron Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)
