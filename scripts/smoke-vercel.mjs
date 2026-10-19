const base = process.env.SITE_URL;
if (!base) throw new Error('SITE_URL belum diatur');
const origin = new URL(base).origin;
const checks = [
  ['/', 200, 'text/html'],
  ['/login.html', 200, 'text/html'],
  ['/api/public/status', 200, 'application/json'],
  ['/api/public/peluang.csv', 200, 'text/csv'],
  ['/admin.html', 302, ''],
];
let failed = 0;
for (const [path, status, type] of checks) {
  const response = await fetch(origin + path, { redirect: 'manual' });
  const good = response.status === status && (!type || response.headers.get('content-type')?.includes(type));
  console.log(`${good ? 'OK' : 'GAGAL'} ${path}: ${response.status}`);
  if (!good) failed++;
}
if (failed) process.exitCode = 1;
