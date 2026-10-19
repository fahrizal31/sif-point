import { readSession } from './src/lib/session.js';
import { next } from '@vercel/functions';

export const config = { matcher: ['/admin.html', '/publish.html', '/status.html'] };

export default async function middleware(request) {
  try {
    const email = await readSession(process.env, request.headers.get('cookie'));
    if (email) return next();
  } catch (error) { console.error('Pemeriksaan sesi gagal', error); }
  const url = new URL('/login.html', request.url);
  url.searchParams.set('next', new URL(request.url).pathname);
  return Response.redirect(url, 302);
}
