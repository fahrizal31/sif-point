const { chromium } = require('playwright');
const H = (e) => ({ 'x-dev-email': e, 'x-sif': '1', 'content-type': 'application/json' });
const B = 'http://localhost:8788';
const post = (p, e, b) => fetch(B + '/api/' + p, { method: 'POST', headers: H(e), body: JSON.stringify(b) }).then(r => r.json());
(async () => {
  const S = 'super@contoh.go.id';
  for (const [em, peran, ins] of [['distan@x.go.id', 'pic', 'DISTAN'], ['v1@x.go.id', 'verifikator', 'DPMPTSP'], ['v2@x.go.id', 'verifikator', 'DPMPTSP']]) await post('pengguna', S, { email: em, nama: em.split('@')[0], peran, instansi: ins });
  const br = await chromium.launch(); const errs = [];
  const ctx = async (email, w = 1366, h = 900) => { const c = await br.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-dev-email': email } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(email + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(email + ' console: ' + m.text()); }); return p; };
  // 1. PIC
  let p = await ctx('distan@x.go.id');
  await p.goto(B + '/admin.html'); await p.waitForSelector('.who'); await p.waitForTimeout(500);
  console.log('PIC beranda:', (await p.innerText('#main')).replace(/\s+/g, ' ').slice(0, 260));
  await p.screenshot({ path: 'test/s_admin1.png' });
  await p.click('nav button[data-k=data]'); await p.waitForSelector('#main table'); await p.selectOption('#main select', 'produksi');
  await p.waitForTimeout(600); await p.fill('#main input[type=search]', 'durian'); await p.waitForTimeout(1200);
  await p.click('#main tbody tr:first-child button'); await p.waitForSelector('dialog[open]');
  await p.fill('dialog input[name=produksi_ton]', '1826,6'); await p.screenshot({ path: 'test/s_admin2.png' });
  await p.click('dialog .df button:has-text("Simpan")'); await p.waitForTimeout(700);
  await p.click('nav button[data-k=beranda]'); await p.waitForTimeout(700);
  await p.click('button:has-text("Ajukan semua draf")'); await p.waitForTimeout(900);
  console.log('PIC sesudah ajukan:', (await p.innerText('#main')).replace(/\s+/g, ' ').slice(0, 200));
  await p.click('nav button[data-k=usulan]'); await p.waitForTimeout(600); console.log('PIC usulan:', (await p.innerText('#main tbody')).replace(/\s+/g, ' ').slice(0, 200));
  // kolom bukan wali ditolak di UI (kecamatan: hanya komoditas_utama bisa diubah)
  await p.click('nav button[data-k=data]'); await p.selectOption('#main select', 'kecamatan'); await p.waitForTimeout(800);
  await p.click('#main tbody tr:first-child button'); await p.waitForSelector('dialog[open]');
  console.log('readonly kolom di kecamatan:', await p.$$eval('dialog input[readonly], dialog textarea[readonly]', x => x.length), 'editable:', await p.$$eval('dialog input:not([readonly]), dialog textarea:not([readonly])', x => x.map(i => i.name)));
  await p.keyboard.press('Escape');
  // PIC tidak boleh membuka publish
  await p.goto(B + '/publish.html'); await p.waitForTimeout(700); console.log('PIC di publish:', (await p.innerText('#main')).slice(0, 120));
  // 2. verifikator
  p = await ctx('v1@x.go.id'); await p.goto(B + '/publish.html'); await p.waitForSelector('.who'); await p.waitForTimeout(500);
  console.log('Notifikasi v1:', await p.innerText('.bell'));
  await p.click('nav button[data-k=verifikasi]'); await p.waitForSelector('#main .card .card'); await p.screenshot({ path: 'test/s_verif.png' });
  await p.click('#main button:has-text("Setujui")'); await p.waitForTimeout(900);
  console.log('Setelah setujui:', (await p.innerText('#main')).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('nav button[data-k=terbit]'); await p.waitForTimeout(900); console.log('v1 terbit disabled:', await p.$$eval('#main .btn', b => b.map(x => x.textContent + ':' + x.disabled).slice(0, 3)));
  // 3. super
  p = await ctx(S); await p.goto(B + '/publish.html#terbit'); await p.waitForSelector('.who'); await p.waitForTimeout(700);
  await p.selectOption('#main select', 'produksi'); await p.waitForTimeout(900);
  await p.fill('input[placeholder^="Nomor berita acara"]', '188.45/BA-01/2026'); await p.fill('input[type=date]', '2026-10-18'); await p.screenshot({ path: 'test/s_terbit.png' });
  await p.click('button:has-text("Tetapkan resmi dan terbitkan")'); await p.waitForTimeout(1000);
  console.log('Setelah terbit:', (await p.innerText('#main')).replace(/\s+/g, ' ').slice(0, 200));
  for (const k of ['ringkasan', 'pahandep', 'permintaan', 'pengguna', 'riwayat']) { await p.click(`nav button[data-k=${k}]`); await p.waitForTimeout(700); await p.screenshot({ path: `test/s_${k}.png` }); }
  // 4. publik membaca perubahan
  p = await br.newPage(); p.on('pageerror', e => errs.push('index: ' + e.message)); await p.goto(B + '/index.html'); await p.waitForTimeout(5000);
  console.log('SIF_OVR.produksi 1826,6:', await p.evaluate(() => (window.SIF_OVR && window.SIF_OVR.produksi || []).some(r => String(r.produksi_ton) === '1826,6')), 'META', await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(window.SIF_META || {}).map(([k, m]) => [k, m.rows.length])))));
  await p.screenshot({ path: 'test/s_index.png' });
  // 5. mobile overflow
  for (const [u, e] of [['/admin.html', 'distan@x.go.id'], ['/publish.html', S]]) { const m = await ctx(e, 390, 800); await m.goto(B + u); await m.waitForTimeout(900); console.log('overflow 390', u, await m.evaluate(() => document.documentElement.scrollWidth)); }
  console.log('ERR', errs); await br.close();
})();
