// E2E sinkron akun: dua "perangkat" (konteks browser terpisah) memakai server Supabase tiruan.
const { chromium } = require('playwright');
const B = 'http://localhost:5180/';
const assert = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); console.log('ok  :', m); };
const stats = async (p) => (await (await fetch(B + '__stats')).json());
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch());
  const errs = [];
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };
  const A = await mk();
  await A.goto(B);
  await A.waitForSelector('.auth-card');
  assert(true, 'layar masuk tampil saat cloud aktif');
  // validasi & salah sandi
  await A.click('[data-act=auth-mode][data-m=daftar]');
  await A.fill('input[name=email]', 'salah'); await A.fill('input[name=password]', '123456'); await A.click('form button[type=submit]');
  assert((await A.locator('.auth-msg.err').innerText()).includes('email'), 'email tidak valid ditolak');
  await A.fill('input[name=email]', 'naufal@test.id'); await A.fill('input[name=password]', '123456'); await A.click('form button[type=submit]');
  await A.waitForSelector('#app');
  assert(await A.locator('#sync-btn').isVisible(), 'daftar -> masuk aplikasi, ikon sinkron tampil');
  // buat data di A: topik contoh + catatan + berkas
  await A.goto(B + '#/pengaturan'); await A.waitForSelector('.settings');
  assert((await A.locator('#acct').innerText()).includes('naufal@test.id'), 'kartu akun menampilkan email');
  await A.click('[data-act=sample]');
  await A.waitForTimeout(300);
  await A.goto(B + '#/evaluasi'); await A.waitForSelector('[data-act=note-new]');
  await A.click('[data-act=note-new]'); await A.fill('input[name=title]', 'Catatan lintas perangkat'); await A.click('.modal button.primary');
  await A.waitForSelector('#ev-files');
  await A.setInputFiles('input[data-change=ev-upload]', { name: 'materi.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 isi materi') });
  await A.waitForSelector('#ev-files .ef');
  assert(await until(async () => (await stats()).uploads >= 1 && (await stats()).rows.length === 1), 'state & berkas terkirim ke cloud');
  await A.waitForFunction(() => document.querySelector('#sync-btn.s-idle'));
  assert(true, 'status sinkron kembali "idle"');
  const A_url = A.url();

  // Perangkat B: masuk dengan akun yang sama -> data muncul
  const Bp = await mk();
  await Bp.goto(B); await Bp.waitForSelector('.auth-card');
  await Bp.fill('input[name=email]', 'naufal@test.id'); await Bp.fill('input[name=password]', 'salahsandi'); await Bp.click('form button[type=submit]');
  await Bp.waitForSelector('.auth-msg.err');
  assert((await Bp.locator('.auth-msg.err').innerText()).includes('salah'), 'sandi salah ditolak');
  await Bp.fill('input[name=password]', '123456'); await Bp.click('form button[type=submit]');
  await Bp.waitForSelector('#app');
  await Bp.goto(B + '#/evaluasi');
  assert(await until(async () => (await Bp.locator('.ev-rows .row').count()) >= 1), 'perangkat B menerima data dari akun');
  await Bp.click('.ev-rows .row a');
  await Bp.waitForSelector('#ev-files .ef');
  assert((await Bp.locator('#ev-files .ef').count()) === 1, 'berkas muncul di perangkat B');
  const dl = Bp.waitForEvent('download');
  await Bp.click('#ev-files [data-act=dl-file]');
  const path = await (await dl).path();
  assert(require('fs').readFileSync(path, 'utf8').includes('isi materi'), 'berkas diunduh dari cloud dan isinya benar');

  // Perubahan di B -> A menerima lewat pull (visibilitas)
  await Bp.fill('textarea[data-input=ev-notes], #ev-notes, textarea', 'dari B').catch(() => {});
  await Bp.goto(B + '#/pengaturan'); await Bp.waitForSelector('.settings');
  await Bp.click('[data-act=sample]'); // tambah topik contoh lagi di B (aman: batas 20)
  await Bp.waitForFunction(() => document.querySelector('#sync-btn.s-idle'));
  await until(async () => (await stats()).rows[0] >= 2);
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await A.goto(B + '#/dashboard'); await A.waitForSelector('#app');
  assert(await until(async () => (await A.locator('.tcard, .topic-card, [href^="#/topik/"]').count()) > 5, 15000), 'A menerima perubahan dari B setelah dibuka ulang');

  // Offline: server mati -> ubah di A -> status offline -> hidup lagi -> terkirim
  await fetch(B + '__down?on=1');
  await A.goto(B + '#/evaluasi'); await A.waitForSelector('[data-act=note-new]');
  await A.click('[data-act=note-new]'); await A.fill('input[name=title]', 'Dibuat saat offline'); await A.click('.modal button.primary');
  await A.waitForSelector('#ev-files');
  assert(await until(async () => (await A.locator('#sync-btn.s-offline').count()) === 1, 15000), 'status offline saat server tak terjangkau');
  const before = (await stats()).rows[0];
  await fetch(B + '__down?on=0');
  await A.evaluate(() => dispatchEvent(new Event('online')));
  assert(await until(async () => (await stats()).rows[0] > before, 15000), 'perubahan offline terkirim setelah tersambung');

  // Konflik: A dan B sama-sama mengubah saat offline
  await fetch(B + '__down?on=1');
  const note = async (pg, t) => { await pg.goto(B + '#/evaluasi'); await pg.waitForSelector('[data-act=note-new]'); await pg.click('[data-act=note-new]'); await pg.fill('input[name=title]', t); await pg.click('.modal button.primary'); await pg.waitForSelector('#ev-files'); };
  await note(A, 'Konflik dari A'); await note(Bp, 'Konflik dari B');
  await A.waitForTimeout(1500);
  await fetch(B + '__down?on=0');
  await A.evaluate(() => dispatchEvent(new Event('online')));
  await until(async () => (await A.locator('#sync-btn.s-idle').count()) === 1, 15000);
  await Bp.evaluate(() => dispatchEvent(new Event('online')));
  await Bp.waitForSelector('[data-act=cf-cloud]', { timeout: 15000 });
  assert(true, 'dialog konflik muncul di perangkat yang terlambat');
  await Bp.click('[data-act=cf-cloud]');
  await Bp.goto(B + '#/evaluasi'); await Bp.waitForSelector('.ev-rows .row');
  const titles = (await Bp.locator('.ev-rows .row').allInnerTexts()).join('|');
  assert(titles.includes('Konflik dari A') && !titles.includes('Konflik dari B'), 'pilih "data akun": versi A dipakai, B diganti');

  // Keluar -> layar masuk; data lokal akun dihapus; masuk lagi -> data kembali dari cloud
  await A.goto(B + '#/pengaturan'); await A.waitForSelector('[data-act=acct-out]');
  await A.click('[data-act=acct-out]'); await A.click('[data-act=confirm-yes]');
  await A.waitForSelector('.auth-card');
  assert(true, 'keluar -> kembali ke layar masuk');
  await A.fill('input[name=email]', 'naufal@test.id'); await A.fill('input[name=password]', '123456'); await A.click('form button[type=submit]');
  await A.waitForSelector('#app');
  await A.goto(B + '#/evaluasi');
  assert(await until(async () => (await A.locator('.ev-rows .row').count()) >= 2, 15000), 'masuk lagi: data pulih dari cloud');

  // Mode tamu: data terpisah dan tanpa sinkron
  const G = await mk();
  await G.goto(B); await G.waitForSelector('.auth-card'); await G.click('[data-act=auth-guest]'); await G.waitForSelector('#app');
  assert(!(await G.locator('#sync-btn').isVisible()), 'mode tamu: tanpa ikon sinkron');
  await G.goto(B + '#/dashboard');
  assert((await G.locator('[href^="#/topik/"]').count()) === 0, 'tamu tidak melihat data akun');
  console.log('errors:', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch((e) => { console.log('CLOUD E2E CRASH', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
