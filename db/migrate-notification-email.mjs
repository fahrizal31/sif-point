// Tambahkan alamat surel notifikasi yang dapat diubah tanpa mengubah identitas internal akun.
import { tidbPool } from '../src/lib/tidb.js';

const pool = tidbPool();
const conn = await pool.getConnection();
try {
  const [columns] = await conn.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pengguna' AND COLUMN_NAME='surel_notifikasi'");
  if (!columns.length) await conn.query('ALTER TABLE pengguna ADD COLUMN surel_notifikasi VARCHAR(255) NULL');
  console.log('Kolom surel notifikasi siap. Data akun dan riwayat tetap utuh.');
} finally { conn.release(); await pool.end(); }
