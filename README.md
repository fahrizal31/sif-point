# SIF POINT BATARA — paket GitHub dan Vercel

Folder ini adalah akar proyek yang siap diunggah ke GitHub. Database TiDB Cloud Starter `sif_point_batara` sudah dibuat dan diisi data awal. Kunci dan kata sandi **tidak** disertakan.

## Unggah ke GitHub

1. Buat repositori GitHub baru.
2. Unggah **isi folder ini** ke akar repositori. `package.json` dan `vercel.json` harus terlihat langsung di akar repositori.
3. Jangan unggah `.env.local`, `.env`, `node_modules`, atau `public` dari folder kerja lain.

## Hubungkan ke Vercel

1. Impor repositori GitHub tersebut ke Vercel.
2. Root Directory: `./` (akar repositori). Framework Preset: **Other**. Build Command: `npm run build`. Output Directory: `public`. Install Command: `npm ci`. Node.js: **24.x**.
3. Isi variabel **Production** di Vercel Settings → Environment Variables. Salin nama variabel dari `.env.example`; isi nilai sebenarnya secara pribadi. Pada `TIDB_URL`, gunakan database `sif_point_batara`, bukan `sys`.
4. Login admin memakai username dan password yang disimpan sebagai hash di TiDB. Jalankan `db/setup-password-admin.mjs` sekali untuk akun Super Admin awal; lihat panduan. Resend hanya diperlukan bila ingin notifikasi email.
5. Deploy, lalu uji `/api/public/status`, `/api/public/peluang.csv`, dan `/login.html`.

Mulai dari [panduan langkah demi langkah](PANDUAN_LANGKAH_DEMI_LANGKAH.md). Rincian teknis dan pemeriksaan setelah deploy tersedia di [PANDUAN_VERCEL_TIDB.md](PANDUAN_VERCEL_TIDB.md).
