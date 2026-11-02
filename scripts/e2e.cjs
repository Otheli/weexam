const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:5173/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, locale: 'id-ID', timezoneId: 'Asia/Jakarta', permissions: [] });
  // Rabu 28 Okt 2026 10:00 WIB (fase Evaluasi & susulan)
  await ctx.clock.install({ time: new Date('2026-10-28T10:00:00+07:00') }); await ctx.clock.resume();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  const shot = (n, full) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: !!full });
  const text = (sel) => page.locator(sel).first().innerText();

  await page.goto(BASE + '#/dashboard');
  await page.waitForSelector('.welcome');

  // --- Tambah topik via UI
  await page.click('[data-act=topic-add]');
  await page.fill('input[name=name]', 'Struktur Data');
  await page.fill('input[name=description]', 'Array, tree, graph');
  await page.fill('input[name=credits]', '3');
  await shot('10-topic-modal');
  await page.click('.modal button.primary');
  await page.waitForSelector('.tcard');
  assert((await text('.tcard strong')) === 'Struktur Data', 'topik ditambahkan');
  await page.click('[data-act=topic-add]');
  await page.fill('input[name=name]', 'Basis Data');
  await page.click('.modal button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.tcard').length === 2);
  assert(true, 'topik kedua ditambahkan');

  // --- Peringatan cakupan: Rabu = info, belum ada ujian
  await page.goto(BASE + '#/persiapan');
  await page.waitForSelector('.prep');
  assert((await page.locator('span.cov-kosong').count()) >= 2, 'persiapan: dua topik kosong');
  await shot('11-persiapan-kosong');

  // --- Buat ujian untuk topik 1 (Sabtu depan 31 Okt 09:00)
  await page.click('.prep-t:nth-child(1) a.btn');
  await page.waitForSelector('#ed-body');
  await page.fill('[data-f=name]', 'Struktur Data #1');
  await page.fill('[data-f=rules]', 'Boleh membuka catatan sendiri.');
  await page.click('[data-k=jadwal]');
  const sched = await page.inputValue('[data-f=scheduledAt]');
  assert(sched.startsWith('2026-10-31T09:00'), 'jadwal bawaan Sabtu 09:00 (' + sched + ')');
  assert((await page.inputValue('#f-reg')).startsWith('2026-11-01T23:59'), 'batas reguler Minggu 23:59');
  assert((await page.inputValue('#f-close')).startsWith('2026-11-04T23:59'), 'batas susulan Rabu 23:59');
  await page.click('[data-k=soal]');
  await page.click('[data-act=q-add][data-t=pg]');
  await page.fill('.qed:nth-child(1) textarea >> nth=0', 'Struktur data FIFO adalah?');
  await page.fill('.qed:nth-child(1) .op:nth-child(1) input[data-f]', 'Stack');
  await page.fill('.qed:nth-child(1) .op:nth-child(2) input[data-f]', 'Queue');
  await page.click('.qed:nth-child(1) .op:nth-child(2) input[type=radio]');
  await page.click('[data-act=q-add][data-t=isian]');
  await page.fill('.qed:nth-child(2) textarea >> nth=0', 'Kompleksitas pencarian biner?');
  await page.fill('.qed:nth-child(2) textarea >> nth=1', 'O(log n)\nlog n');
  await page.click('[data-act=q-add][data-t=esai]');
  await page.fill('.qed:nth-child(3) textarea >> nth=0', 'Jelaskan perbedaan array dan linked list.');
  await page.fill('.qed:nth-child(3) textarea >> nth=1', 'Akses acak vs sekuensial; penyisipan.');
  await shot('12-editor-soal');
  // validasi: terbitkan dengan opsi C/D kosong harus tetap valid (opsi kosong dibuang)
  await page.click('[data-act=ed-publish]');
  await page.waitForSelector('.prep');
  assert((await page.locator('span.cov-siap').count()) === 1, 'ujian 1 terbit -> topik 1 siap');
  assert((await page.locator('span.cov-kosong').count()) === 1, 'topik 2 masih kosong');
  await shot('13-persiapan-siap');

  // --- Salin dari minggu lalu tidak berlaku (tanpa riwayat); buat ujian berkas untuk topik 2
  await page.click('.prep-t:nth-child(2) a.btn');
  await page.waitForSelector('#ed-body');
  await page.fill('[data-f=name]', 'Basis Data #1 (proyek)');
  await page.click('[data-act=ed-publish]');
  await page.waitForSelector('.errs');
  assert((await text('.errs')).includes('soal atau unggah berkas'), 'validasi: tanpa soal/berkas ditolak');
  await page.click('.modal button.primary');
  await page.click('[data-k=berkas]');
  await page.setInputFiles('input[data-change=ed-upload]', { name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.waitForSelector('.files .file');
  await page.click('[data-act=ed-publish]');
  await page.waitForSelector('.prep');
  assert((await page.locator('span.cov-siap').count()) === 2, 'kedua topik siap');

  // --- Ujian belum dibuka: terkunci
  await page.goto(BASE + '#/ujian?minggu=2026-10-31');
  await page.waitForSelector('.row.ex');
  assert((await page.locator('.locked').count()) === 2, 'agenda terkunci sebelum jadwal');
  await shot('14-ujian-terjadwal');
  await page.goto(BASE + '#/ujian/kerjakan/' + (await page.evaluate(() => JSON.parse(JSON.stringify(1)) && 0 || 0)).toString()).catch(() => {});

  // --- Maju ke Sabtu 31 Okt 09:30 (ujian terbuka)
  await page.clock.setSystemTime(new Date('2026-10-31T09:30:00+07:00'));
  await page.goto(BASE + '#/ujian');
  await page.waitForSelector('.row.ex');
  await page.waitForTimeout(300);
  assert((await page.locator('a.btn.primary:has-text("Kerjakan")').count()) >= 1, 'tombol Kerjakan muncul saat jadwal tiba');
  await shot('15-ujian-terbuka');
  await page.click('a.btn.primary:has-text("Kerjakan") >> nth=0');
  await page.waitForSelector('[data-act=run-start]');
  await shot('16-intro');
  await page.click('[data-act=run-start]');
  await page.waitForSelector('#qarea .q');
  assert((await text('#run-timer')).includes(':'), 'timer tampil');
  await page.click('.opt:nth-child(2)');
  await page.click('[data-act=run-next]');
  await page.fill('.in-lg', 'log n');
  await page.click('[data-act=run-next]');
  await page.fill('textarea[data-input=run-text]', 'Array akses acak; linked list sisip cepat.');
  await shot('17-runner');
  // muat ulang di tengah ujian: jawaban dan timer harus bertahan
  await page.waitForTimeout(500);
  await page.reload();
  await page.clock.setSystemTime(new Date('2026-10-31T09:40:00+07:00'));
  await page.waitForSelector('#qarea .q', { timeout: 5000 }).catch(async () => { await shot('99-debug'); console.log('DEBUG hash', await page.evaluate(() => location.hash), (await page.locator('#view').innerText()).slice(0, 300), errs); throw new Error('runner tidak muncul setelah reload'); });
  await page.click('[data-act=run-go][data-i="0"]');
  assert(await page.locator('.opt.on').count() === 1, 'jawaban tersimpan setelah reload');
  await page.click('[data-act=run-submit]');
  await page.click('[data-act=run-submit-yes]');
  await page.waitForSelector('.modal');
  assert((await text('.modal')).includes('koreksi sendiri'), 'esai butuh koreksi manual');
  await page.click('[data-act=koreksi-now]');
  await page.waitForSelector('form.kor');
  await shot('18-koreksi');
  const total1 = await text('#kor-total');
  await page.fill('input[name^=p_] >> nth=2', '8');
  const total2 = await text('#kor-total');
  assert(total1 !== total2, `total koreksi berubah (${total1} -> ${total2})`);
  await page.click('form.kor button.primary');
  await page.waitForSelector('.modal .result');
  const modalTxt = await text('.modal');
  assert(/\d+\.\d/.test(modalTxt), 'hasil koreksi tampil: ' + modalTxt.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('[data-act=ex-eval-close]');
  await page.waitForSelector('.ev-detail h2');
  await shot('19-evaluasi');
  await page.fill('form[data-submit=study-add] input', 'Ulangi bab pohon biner');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.todo li:has-text("pohon biner")');
  assert(true, 'materi tindak lanjut ditambahkan');

  // --- Dashboard: topik 1 bernilai, topik 2 terlewat nanti
  await page.goto(BASE + '#/dashboard');
  await page.waitForSelector('.tcard');
  assert((await text('.gpa-n strong')) !== '–', 'IP terisi setelah koreksi');
  await shot('20-dashboard-real');

  // --- Maju ke Kamis 5 Nov 10:00: ujian topik 2 tak dikerjakan => ditutup, nilai 0
  await page.clock.setSystemTime(new Date('2026-11-05T10:00:00+07:00'));
  await page.goto(BASE + '#/ujian?minggu=2026-10-31');
  await page.waitForSelector('.row.ex');
  await page.waitForTimeout(300);
  assert((await page.locator('.row.ex.dim').count()) === 1, 'ujian tak dikerjakan terkunci (Ditutup)');
  assert((await page.locator('.row.ex.dim .locked').count()) === 1, 'ada penanda terkunci');
  await shot('21-ujian-tutup');
  // --- Susulan (Senin 2 Nov): ujian proyek topik 2 -> nilai dipotong 10%
  await page.clock.setSystemTime(new Date('2026-11-02T10:00:00+07:00'));
  await page.goto(BASE + '#/ujian?minggu=2026-10-31');
  await page.waitForSelector('.row.ex');
  await page.waitForTimeout(300);
  await page.waitForSelector('.row.ex .chip.s-susulan', { timeout: 15000 }).catch(() => {});
  const nS = await page.locator('.row.ex .chip.s-susulan').count(); assert(nS === 1, 'status Susulan muncul hari Senin (' + nS + ' | ' + (await page.locator('.row.ex').allInnerTexts()).join(' || ').replace(/\s+/g,' ') + ')');
  await page.click('a.btn.primary:has-text("Kerjakan")');
  await page.click('[data-act=run-start]');
  await page.waitForSelector('#qarea .q');
  await page.setInputFiles('input[data-change=run-upload]', { name: 'proyek.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') });
  await page.waitForSelector('#up-files .file');
  await page.click('[data-act=run-submit]');
  await page.click('[data-act=run-submit-yes]');
  await page.click('[data-act=koreksi-now]');
  await page.fill('input[name=manual]', '100');
  assert((await text('#kor-total')) === '90.0', 'potongan susulan 10% => 90.0');
  await page.click('form.kor button.primary');
  await page.waitForSelector('.modal .result');
  assert((await text('.modal .big-n')) === '90.0', 'nilai akhir susulan 90.0');
  await page.click('.modal [data-act=modal-close]');
  // --- Turn 2: tinjau + Evaluasi berkas ---
  await page.goto(BASE + '#/ujian');
  await page.waitForSelector('.row.ex');
  const href = await page.locator('a[href^="#/ujian/tinjau/"]').first().getAttribute('href');
  assert(!!href, 'tautan Lihat soal & jawaban ada');
  await page.goto(BASE + href);
  await page.waitForSelector('[data-act=tj-export]');
  await shot('24-tinjau', true);
  const dl = page.waitForEvent('download');
  await page.click('[data-act=tj-export]');
  assert((await dl).suggestedFilename().endsWith('.html'), 'unduh soal & jawaban .html');
  if (await page.locator('[data-act=ex-eval]').count()) { await page.click('[data-act=ex-eval]'); await page.waitForTimeout(400); }
  await page.goto(BASE + '#/evaluasi');
  await page.waitForSelector('.ev-rows .row');
  await page.click('.ev-rows .row a');
  await page.waitForSelector('#ev-files');
  await page.selectOption('#ev-kind', 'materi');
  await page.setInputFiles('input[data-change=ev-upload]', [{ name: 'ringkasan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }, { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }]);
  await page.waitForSelector('#ev-files .ef');
  assert((await page.locator('#ev-files .ef').count()) >= 2, 'berkas Evaluasi terunggah');
  await page.fill('.tag-in', 'bab-3'); await page.press('.tag-in', 'Enter');
  assert((await page.locator('#ev-tags .tag').count()) === 1, 'tag ditambah');
  await page.reload();
  await page.waitForSelector('#ev-files .ef');
  assert((await page.locator('#ev-files .ef').count()) >= 2, 'berkas bertahan setelah reload');
  await page.fill('[data-input=ev-search]', 'zzzz');
  assert((await page.locator('.ev-rows .row:visible').count()) === 0, 'pencarian menyaring');
  await page.fill('[data-input=ev-search]', 'bab-3');
  assert((await page.locator('.ev-rows .row:visible').count()) === 1, 'pencarian menemukan tag');
  await shot('25-evaluasi-berkas', true);
  await page.goto(BASE + '#/pengaturan');
  await page.waitForSelector('.settings');
  await shot('22-pengaturan', true);
  await page.click('#bell');
  await shot('23-bell');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.log('E2E CRASH', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
