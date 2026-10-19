/* Perangkat bersama halaman admin.html dan publish.html. Semua isi dari server ditulis lewat textContent (anti-XSS). */
(function () {
  const K = window.K = {};
  K.el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const el = K.el;
  K.api = async (method, path, body) => {
    const r = await fetch('/api/' + path, { method, headers: { 'content-type': 'application/json', 'x-sif': '1' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { if (r.status === 401) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); } const er = new Error((j && j.error) || ('Kesalahan ' + r.status)); er.status = r.status; throw er; }
    return j;
  };
  K.toast = (m, bad) => { const t = el('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status', text: m }); document.body.append(t); setTimeout(() => t.remove(), bad ? 6000 : 3500); };
  K.fail = e => { K.toast(e.message || String(e), true); };
  K.chip = (t, c) => el('span', { class: 'chip ' + (c || 'mut') }, el('span', { text: t }));
  const ST = { sementara: ['Sementara', 'warn'], terverifikasi: ['Terverifikasi', 'info'], resmi: ['Data resmi', 'ok'], draft: ['Draf', 'mut'], diajukan: ['Diajukan', 'info'], dikembalikan: ['Dikembalikan', 'warn'], ditolak: ['Ditolak', 'bad'], ditetapkan: ['Ditetapkan', 'ok'] };
  K.stChip = s => { const x = ST[s] || [s, 'mut']; return K.chip(x[0], x[1]); };
  K.tgl = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }); };
  K.table = (cols, rows, opt) => {
    const t = el('table', { class: opt && opt.cls }), th = el('tr'); cols.forEach(c => th.append(el('th', { scope: 'col', text: c.h })));
    t.append(el('thead', {}, th)); const tb = el('tbody');
    if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: cols.length, text: (opt && opt.kosong) || 'Tidak ada data.' })));
    rows.forEach(r => { const tr = el('tr'); cols.forEach(c => { const v = c.f ? c.f(r) : r[c.k]; tr.append(el('td', {}, v == null ? '' : v)); }); tb.append(tr); });
    t.append(tb); return el('div', { class: 'tbl' }, t);
  };
  K.dialog = (judul, body, aksi) => new Promise(res => {
    const d = el('dialog'), f = el('div', { class: 'df' });
    d.append(el('div', { class: 'dh', text: judul }), el('div', { class: 'db' }, body), f);
    (aksi || [{ t: 'Tutup', g: 1, v: null }]).forEach(a => f.append(el('button', { class: 'btn' + (a.g ? ' g' : '') + (a.r ? ' r' : ''), type: 'button', onclick: async () => { if (a.fn) { try { const ok = await a.fn(); if (ok === false) return; } catch (e) { K.fail(e); return; } } d.close(); res(a.v === undefined ? true : a.v); }, text: a.t })));
    d.addEventListener('cancel', () => res(null)); d.addEventListener('close', () => { d.remove(); });
    document.body.append(d); d.showModal();
  });
  K.tabs = (nav, defs, mulai) => {
    const main = document.getElementById('main'); let aktif = null;
    const buka = async k => {
      aktif = k; nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === k)));
      history.replaceState(null, '', '#' + k); main.replaceChildren(el('p', { class: 'sub', text: 'Memuat…' }));
      try { const n = await defs.find(d => d.k === k).fn(); main.replaceChildren(n); main.focus(); } catch (e) { main.replaceChildren(el('div', { class: 'errbox', role: 'alert', text: e.message })); }
    };
    defs.forEach(d => nav.append(el('button', { type: 'button', role: 'tab', 'data-k': d.k, 'aria-selected': 'false', onclick: () => buka(d.k), text: d.t })));
    const h = location.hash.slice(1); buka(defs.some(d => d.k === h) ? h : mulai || defs[0].k); return { buka, aktif: () => aktif };
  };
  // Header, identitas, lonceng notifikasi. Mengembalikan data /api/me.
  K.mulai = async (judul, sub) => {
    let me;
    try { me = await K.api('GET', 'me'); } catch (e) { document.getElementById('main').replaceChildren(el('div', { class: 'errbox', role: 'alert', text: e.message })); throw e; }
    const PERAN = { pic: 'Admin Instansi', verifikator: 'Admin Verifikator DPMPTSP', super: 'Super Admin' };
    const bell = el('button', { class: 'bell', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' }), n = el('span', { class: 'n', text: String(me.belum_dibaca) });
    bell.append('Notifikasi', n); const wrap = el('div', { style: 'position:relative' }, bell); let box = null;
    const tutup = () => { if (box) { box.remove(); box = null; bell.setAttribute('aria-expanded', 'false'); } };
    bell.addEventListener('click', async () => {
      if (box) return tutup();
      const j = await K.api('GET', 'notifikasi').catch(K.fail); if (!j) return;
      const ul = el('ul'); if (!j.notifikasi.length) ul.append(el('li', { text: 'Belum ada notifikasi.' }));
      j.notifikasi.forEach(x => ul.append(el('li', { class: x.dibaca ? '' : 'u', onclick: async () => { await K.api('POST', 'notifikasi/baca', { ids: [x.id] }).catch(() => {}); if (x.tautan) location.href = x.tautan; else tutup(); } }, el('b', { text: x.judul }), el('span', { text: x.isi || '' }), el('small', { text: ' · ' + K.tgl(x.dibuat) }))));
      const baca = el('li', { style: 'text-align:center;font-weight:700;color:var(--teal)', text: 'Tandai semua sudah dibaca', onclick: async () => { await K.api('POST', 'notifikasi/baca', {}); n.textContent = '0'; tutup(); } });
      box = el('div', { class: 'notif', role: 'dialog', 'aria-label': 'Notifikasi' }, baca, ul); wrap.append(box); bell.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') tutup(); });
    const gantiPassword = el('button', { class: 'pill', type: 'button', text: 'Ganti password', onclick: () => {
      const lama = el('input', { type: 'password', autocomplete: 'current-password' }), baru = el('input', { type: 'password', autocomplete: 'new-password' });
      K.dialog('Ganti password', [el('label', {}, 'Password saat ini', lama), el('label', {}, 'Password baru (minimal 12 karakter)', baru)], [{ t: 'Batal', g: 1, v: false }, { t: 'Simpan', fn: async () => { await K.api('POST', 'auth/change-password', { password_lama: lama.value, password_baru: baru.value }); lama.value = ''; baru.value = ''; K.toast('Password diperbarui. Sesi lama telah dibatalkan.'); } }]);
    } });
    const keluar = el('button', { class: 'pill', type: 'button', text: 'Keluar', onclick: async () => { await K.api('POST', 'auth/logout', {}); location.href = '/login.html'; } });
    document.querySelector('header.top .wrap').append(el('div', { class: 'who' }, el('span', { class: 'pill', text: (me.nama || me.email) + ' · ' + (me.instansi || '') }), el('span', { class: 'pill', text: PERAN[me.peran] || me.peran }), wrap, gantiPassword, keluar));
    return me;
  };
  K.periodeKartu = p => el('div', { class: 'warnbox' }, el('b', { text: 'Periode data: ' + p.periode.label + '. ' }), 'Tenggat penyampaian ' + p.periode.tenggat + ' (Keputusan Bupati, Diktum KEENAM). Hari ini ' + p.hari_ini + '.');
})();
