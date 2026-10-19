// Adaptor TiDB/MySQL untuk antarmuka D1 yang dipakai router.
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';

let pool;

export function tidbPool() {
  if (pool) return pool;
  const uri = process.env.TIDB_URL;
  if (!uri) throw new Error('TIDB_URL belum diatur');
  const url = new URL(uri);
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) throw new Error('TIDB_URL harus memakai mysql://');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || ['sys', 'mysql', 'information_schema', 'performance_schema'].includes(database.toLowerCase())) {
    throw new Error('TIDB_URL harus menunjuk database aplikasi, misalnya sif_point_batara; database sistem tidak boleh digunakan');
  }
  pool = mysql.createPool({
    host: url.hostname, port: Number(url.port || 4000),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database,
    ssl: { ca: readFileSync(new URL('../../certs/isrgrootx1.pem', import.meta.url)), minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true, connectionLimit: 5, maxIdle: 2, idleTimeout: 30000,
    connectTimeout: 10000, enableKeepAlive: true,
  });
  return pool;
}

export function mysqlSql(sql) {
  return sql
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO')
    .replace(/ON CONFLICT\([^)]*\) DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE')
    .replace(/excluded\.([a-z_]+)/gi, 'VALUES($1)');
}

export function tidbDb(client = tidbPool()) {
  const prepare = (sql, args = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => {
      const [rows] = await client.execute(mysqlSql(sql), args);
      return rows[0] ?? null;
    },
    all: async () => {
      const [rows] = await client.execute(mysqlSql(sql), args);
      return { results: rows };
    },
    run: async () => {
      const [result] = await client.execute(mysqlSql(sql), args);
      return { meta: { last_row_id: result.insertId || 0, changes: result.affectedRows || 0 } };
    },
  });
  return { prepare, batch: async statements => {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  } };
}
