import { jalankanPengingat } from '../src/lib/notif.js';
import { tidbDb } from '../src/lib/tidb.js';

export default {
  async fetch(request) {
    if (request.method !== 'GET' || !process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
      return new Response('Tidak diizinkan', { status: 401 });
    try {
      const result = await jalankanPengingat({ ...process.env, DB: tidbDb() });
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      console.error('Cron error', error);
      return Response.json({ error: 'Pengingat gagal' }, { status: 500 });
    }
  },
};
