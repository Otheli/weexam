import { chime, askPermission, notificationSupport, downloadBlob } from '../notify';
import { canPrompt, isFileMode, isStandalone, onInstallChange, platform, promptInstall } from '../install';
import type { Page } from '../router';
import { exportBackup, getState, importBackup, mutate, resetAll } from '../store';
import { fmt } from '../time';
import { $, action, html, icon, raw, type Raw } from '../ui/dom';
import { confirmDialog, toast } from '../ui/kit';
import { loadSample } from '../seed';
import { accountCard } from './masuk';
import { cloudConfig, session } from '../cloud';
import { LETTERS } from '../grading';

function installCard(): Raw {
  const p = platform();
  const standalone = isStandalone();
  const file = isFileMode();
  let body: Raw;
  if (standalone) body = html`<p class="ok-t">${icon('check', 18)} Weexam sudah terpasang di perangkat ini.</p>`;
  else if (canPrompt()) body = html`<p class="muted">Pasang agar Weexam terbuka seperti aplikasi biasa, lengkap dengan ikon dan bisa dipakai tanpa internet.</p><button class="btn primary lg" data-act="install-now">${icon('download', 20)} Pasang Weexam</button>`;
  else if (file) body = p === 'windows' || p === 'lain'
    ? html`<p class="muted">Kamu membuka versi berkas. Untuk memasang di Windows, jalankan <strong>Pasang-Weexam-Windows.bat</strong> dari paket unduhan. Satu klik, lalu Weexam muncul di Desktop dan menu Start.</p>`
    : html`<p class="muted">Untuk Android, buka alamat Weexam yang sudah di-hosting di Chrome, lalu ketuk Pasang. Versi berkas tidak bisa dipasang langsung dari Android.</p>`;
  else body = p === 'android' ? html`<p class="muted">Di Chrome, ketuk menu ⋮ lalu <strong>Pasang aplikasi</strong>.</p>`
    : p === 'ios' ? html`<p class="muted">Di Safari, ketuk Bagikan lalu <strong>Tambah ke Layar Utama</strong>.</p>`
    : html`<p class="muted">Klik ikon pasang di ujung kanan bilah alamat Edge atau Chrome.</p>`;
  return html`<section class="set-s"><h3>Pasang aplikasi</h3>${body}
    ${!file ? html`<div class="dl"><a class="btn" href="downloads/Weexam-Windows.zip" download>${icon('monitor', 18)} Paket Windows (.zip)</a><a class="btn" href="Weexam-Offline.html" download>${icon('download', 18)} Versi satu berkas (.html)</a></div>` : ''}
  </section>`;
}

export const pengaturanPage: Page = {
  title: 'Pengaturan',
  nav: 'pengaturan',
  render() {
    const s = getState();
    const st = s.settings;
    const perm = notificationSupport();
    return html`<div class="wrap narrow settings">
      ${accountCard()}
      ${installCard()}
      <section class="set-s"><h3>Notifikasi dan pengingat</h3>
        <label class="check"><input type="checkbox" data-change="set-os" ${st.osNotifications && perm === 'granted' ? raw('checked') : ''} ${perm === 'unsupported' ? raw('disabled') : ''} /><span>Notifikasi perangkat${perm === 'denied' ? ' (diblokir di peramban)' : ''}</span></label>
        <label class="check"><input type="checkbox" data-change="set-sound" ${st.sound ? raw('checked') : ''} /><span>Bunyi pengingat</span> <button class="link" data-act="test-chime">Coba bunyi</button></label>
        <p class="hint">Pengingat berjalan selama Weexam terbuka, termasuk di latar belakang. Aplikasi yang sepenuhnya tertutup tidak bisa membangunkan dirinya sendiri. Untuk pengingat yang pasti, ekspor jadwal ke kalender (.ics) dari menu Persiapan atau tiap ujian.</p></section>
      <section class="set-s"><h3>Penilaian</h3>
        <p class="muted">Batas nilai minimum untuk setiap huruf (E adalah di bawah D).</p>
        <div class="grades">${(['A', 'B', 'C', 'D'] as const).map((l) => html`<label class="fld g"><span class="grade g-${l} sm">${l}</span><input type="number" min="1" max="100" data-input="set-grade" data-l="${l}" value="${st.gradeMin[l]}" /></label>`)}<label class="fld g"><span class="grade g-E sm">E</span><input value="< ${st.gradeMin.D}" disabled /></label></div>
        <label class="fld"><span>Skor topik dihitung dari</span><select data-change="set-window">${[[4, '4 minggu terakhir'], [8, '8 minggu terakhir'], [12, '12 minggu terakhir'], [0, 'Semua minggu']].map(([v, l]) => html`<option value="${v}" ${st.scoreWindow === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
        <label class="check"><input type="checkbox" data-change="set-empty" ${st.emptyWeekZero ? raw('checked') : ''} /><span>Minggu tanpa ujian untuk suatu topik dihitung nilai 0</span></label></section>
      <section class="set-s"><h3>Bawaan ujian baru</h3>
        <div class="row3"><label class="fld"><span>Jam dibuka</span><input type="time" data-input="set-def" data-k="defaultTime" value="${st.defaultTime}" /></label>
        <label class="fld"><span>Durasi (menit)</span><input type="number" min="1" data-input="set-def" data-k="defaultDuration" data-n="1" value="${st.defaultDuration}" /></label>
        <label class="fld"><span>Potongan susulan (%)</span><input type="number" min="0" max="100" data-input="set-def" data-k="defaultPenalty" data-n="1" value="${st.defaultPenalty}" /></label></div></section>
      <section class="set-s"><h3>Data</h3>
        <p class="muted">${cloudConfig() ? 'Cadangan manual tetap berguna sebagai salinan tambahan. ' : 'Semua data tersimpan di perangkat ini. '}${st.lastBackupAt ? `Cadangan terakhir ${fmt.dateTime(st.lastBackupAt)}.` : 'Belum pernah dicadangkan.'}</p>
        <div class="dl"><button class="btn" data-act="backup">${icon('download', 18)} Cadangkan</button><label class="btn">${icon('upload', 18)} Pulihkan<input type="file" accept=".json,application/json" hidden data-change="restore" /></label>
        <button class="btn" data-act="sample">Muat data contoh</button><button class="btn danger-o" data-act="reset">Hapus semua data</button></div></section>
      <p class="hint">Weexam 1.0 · ${cloudConfig() ? 'versi web dengan sinkron akun.' : 'berjalan sepenuhnya di perangkatmu, tanpa akun dan tanpa server.'}</p>
    </div>`;
  },
  mount() {
    onInstallChange(() => {
      if (location.hash.startsWith('#/pengaturan')) {
        const c = $('.settings .set-s');
        if (c) c.outerHTML = installCard().s;
      }
    });
  },
};

action('install-now', async () => {
  const ok = await promptInstall();
  toast(ok ? 'Weexam terpasang.' : 'Pemasangan dibatalkan.', ok ? 'ok' : 'warn');
});
action('test-chime', () => chime('warning'));
action('set-os', async (el) => {
  const on = (el as HTMLInputElement).checked;
  if (on) {
    const r = await askPermission();
    if (r !== 'granted') {
      (el as HTMLInputElement).checked = false;
      return toast('Izin notifikasi tidak diberikan. Aktifkan dari pengaturan peramban.', 'warn');
    }
  }
  mutate((s) => (s.settings.osNotifications = on), true);
  toast(on ? 'Notifikasi perangkat aktif.' : 'Notifikasi perangkat dimatikan.');
});
action('set-sound', (el) => mutate((s) => (s.settings.sound = (el as HTMLInputElement).checked), true));
action('set-window', (el) => mutate((s) => (s.settings.scoreWindow = Number((el as HTMLSelectElement).value)), true));
action('set-empty', (el) => mutate((s) => (s.settings.emptyWeekZero = (el as HTMLInputElement).checked), true));
action('set-def', (el) => {
  const k = el.dataset.k as 'defaultTime' | 'defaultDuration' | 'defaultPenalty';
  const v = (el as HTMLInputElement).value;
  mutate((s) => {
    if (k === 'defaultTime') s.settings.defaultTime = v || '09:00';
    else s.settings[k] = Math.max(0, Number(v) || 0);
  }, true);
});
action('set-grade', (el) => {
  const l = el.dataset.l as 'A' | 'B' | 'C' | 'D';
  const v = Number((el as HTMLInputElement).value);
  const g = { ...getState().settings.gradeMin, [l]: v };
  const ok = g.A > g.B && g.B > g.C && g.C > g.D && g.D > 0 && g.A <= 100;
  (el as HTMLInputElement).classList.toggle('bad', !ok);
  if (ok) mutate((s) => (s.settings.gradeMin = g), true);
});
action('backup', async () => {
  const b = await exportBackup();
  downloadBlob(`weexam-cadangan-${new Date().toISOString().slice(0, 10)}.json`, b);
  toast('Cadangan diunduh. Simpan di tempat aman.');
});
action('restore', async (el) => {
  const f = (el as HTMLInputElement).files?.[0];
  if (!f) return;
  const ok = await confirmDialog({ title: 'Pulihkan dari cadangan?', message: 'Data di perangkat ini akan diganti dengan isi cadangan.', confirm: 'Pulihkan', danger: true });
  if (!ok) return;
  try {
    await importBackup(f);
    toast('Data dipulihkan.');
    location.hash = '#/dashboard';
  } catch (e) {
    toast((e as Error).message || 'Cadangan tidak valid.', 'err');
  }
});
action('reset', async () => {
  const ok = await confirmDialog({ title: 'Hapus semua data?', message: cloudConfig() && session() ? 'Topik, ujian, jawaban, dan catatan dihapus permanen dari perangkat ini dan dari akunmu. Cadangkan dulu bila perlu.' : 'Topik, ujian, jawaban, dan catatan dihapus permanen dari perangkat ini. Cadangkan dulu bila perlu.', confirm: 'Hapus semua', danger: true });
  if (!ok) return;
  await resetAll();
  location.hash = '#/dashboard';
  toast('Semua data dihapus.');
});
void [LETTERS, loadSample];
