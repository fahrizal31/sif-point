// Penyesuai D1 -> node:sqlite untuk uji lokal (bukan untuk produksi).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function bukaDb(file = ':memory:', sqlFiles = []) {
  const db = new DatabaseSync(file);
  for (const f of sqlFiles) db.exec(fs.readFileSync(f, 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
  });
  return { prepare: sql => stmt(sql), batch: async xs => { const o = []; for (const x of xs) o.push(await x.run()); return o; }, exec: s => db.exec(s), _raw: db };
}
