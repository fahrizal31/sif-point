import { handle } from '../src/lib/router.js';
import { tidbDb } from '../src/lib/tidb.js';

export async function forwardApiRequest(request, env) {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    if (path == null) return new Response('Tidak ditemukan', { status: 404 });
    url.searchParams.delete('path');
    url.pathname = '/api/' + path.replace(/^\/+/, '');
    const headers = new Headers(request.headers);
    headers.delete('cf-access-jwt-assertion');
    const forward = new Request(url, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, duplex: 'half' });
    return handle(forward, env);
}

export default {
  fetch(request) {
    return forwardApiRequest(request, { ...process.env, AUTH_MODE: 'session', DEV_MODE: '0', DB: tidbDb() });
  },
};
