// Jalankan sekali setelah TIDB_URL diatur. Aman diulang; data kerja tidak ditimpa.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tidbPool } from '../src/lib/tidb.js';

const pool = tidbPool();
const conn = await pool.getConnection();
try {
  const schema = readFileSync(new URL('./tidb-schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(/;\s*\r?\n/).map(x => x.trim()).filter(Boolean)) await conn.query(statement);
  const source = new DatabaseSync(':memory:');
  source.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  source.exec(readFileSync(new URL('./seed.sql', import.meta.url), 'utf8'));
  await conn.beginTransaction();
  try {
    for (const table of ['instansi', 'wali_aturan', 'baris']) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) continue;
      // Biarkan TiDB mengalokasikan AUTO_INCREMENT; ID SQLite tidak dirujuk oleh data awal.
      const cols = Object.keys(rows[0]).filter(c => c !== 'id');
      const sql = `INSERT IGNORE INTO ${table} (${cols.map(c => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      for (const row of rows) await conn.execute(sql, cols.map(c => row[c]));
      console.log(`${table}: ${rows.length} baris awal diperiksa`);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  source.close();
  console.log('Skema dan data awal TiDB siap.');
} finally { conn.release(); await pool.end(); }
