// Jalankan sekali untuk memigrasikan TiDB dan mengaktifkan login Super Admin awal.
// node --env-file=../VERCEL_IMPORT.env db/setup-password-admin.mjs ../ADMIN_LOGIN_AWAL.json
import { readFileSync } from 'node:fs';
import { tidbPool } from '../src/lib/tidb.js';
import { hashPassword, validPassword, validUsername } from '../src/lib/password.js';

const file = process.argv[2];
if (!file) throw new Error('Berikan lokasi berkas kredensial admin di luar repositori');
const { email, username, password } = JSON.parse(readFileSync(file, 'utf8'));
const adminEmail = String(email || '').trim().toLowerCase();
const adminUsername = String(username || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail) || !validUsername(adminUsername) || !validPassword(password)) throw new Error('Email, username, atau password awal tidak valid');
if (!String(process.env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).includes(adminEmail)) throw new Error('Email belum tercantum dalam SUPER_ADMIN_EMAILS');
const pool = tidbPool();
const conn = await pool.getConnection();
try {
  await conn.query('CREATE TABLE IF NOT EXISTS kredensial (email VARCHAR(255) PRIMARY KEY, username VARCHAR(40) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, versi BIGINT NOT NULL DEFAULT 1, diubah VARCHAR(40) NOT NULL) DEFAULT CHARSET=utf8mb4');
  const [old] = await conn.execute('SELECT email FROM kredensial WHERE email=?', [adminEmail]);
  if (old.length) throw new Error('Kredensial Super Admin sudah ada; migrasi tidak akan menimpa password yang aktif');
  const hash = await hashPassword(password);
  await conn.beginTransaction();
  try {
    await conn.execute("INSERT INTO pengguna (email,nama,jabatan,instansi,peran,aktif,terima_email,dibuat) VALUES (?,?,?,?,?,1,1,?) ON DUPLICATE KEY UPDATE peran='super',aktif=1", [adminEmail, 'Super Admin', 'Super Admin', 'DPMPTSP', 'super', new Date().toISOString()]);
    await conn.execute('INSERT INTO kredensial (email,username,password_hash,versi,diubah) VALUES (?,?,?,1,?)', [adminEmail, adminUsername, hash, new Date().toISOString()]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  console.log('Login Super Admin awal siap di TiDB untuk', adminEmail, '(password tidak dicetak)');
} finally { conn.release(); await pool.end(); }
