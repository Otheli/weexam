// Layar masuk/daftar, kartu akun di Pengaturan, dan dialog konflik sinkron.
import { AuthError, chooseGuest, cloudConfig, googleUrl, lastSyncAt, onSyncStatus, sendReset, session, setConflictHandler, setPassword, signIn, signOut, signUp, syncError, syncNow, syncStatus, type SyncStatus } from '../cloud';
import { fmt } from '../time';
import { $, action, html, icon, installDelegation, raw, type Raw } from '../ui/dom';
import { closeModal, confirmDialog, openModal, toast } from '../ui/kit';

const LOGO = raw(`<svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><path d="M7 11.500 11.500 21.500 16 13.500 20.500 21.500 25 11.500" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
const GOOGLE = raw(`<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.250c0-.780-.070-1.530-.200-2.250H12v4.260h5.900a5.040 5.040 0 0 1-2.190 3.310v2.750h3.540c2.070-1.910 3.250-4.720 3.250-8.070z"/><path fill="#34A853" d="M12 23c2.970 0 5.460-.980 7.280-2.660l-3.540-2.750c-.980.660-2.230 1.060-3.740 1.060-2.870 0-5.300-1.940-6.170-4.550H2.170v2.840A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.830 14.100a6.600 6.600 0 0 1 0-4.200V7.060H2.170a11 11 0 0 0 0 9.880z"/><path fill="#EA4335" d="M12 5.380c1.620 0 3.060.560 4.210 1.640l3.150-3.150C17.450 2.090 14.970 1 12 1A11 11 0 0 0 2.170 7.060l3.660 2.840C6.700 7.320 9.130 5.380 12 5.380z"/></svg>`);

type Mode = 'masuk' | 'daftar' | 'lupa';
let mode: Mode = 'masuk';
let msg: { text: string; kind: 'err' | 'ok' } | null = null;
let busy = false;

function authView(): Raw {
  const title = mode === 'masuk' ? 'Masuk ke Weexam' : mode === 'daftar' ? 'Buat akun Weexam' : 'Atur ulang kata sandi';
  const sub = mode === 'lupa' ? 'Kami kirim tautan pengaturan ulang ke emailmu.' : 'Data ujian, jawaban, dan berkas belajarmu tersimpan aman di akun dan bisa dibuka dari perangkat mana pun.';
  return html`<div class="auth"><div class="auth-card">
    <div class="auth-logo">${LOGO}<span>Weexam</span></div>
    <h1>${title}</h1><p class="muted">${sub}</p>
    ${mode !== 'lupa' ? html`<a class="btn lg wide" href="${googleUrl()}">${GOOGLE} Lanjut dengan Google</a><div class="or"><span>atau pakai email</span></div>` : ''}
    <form data-submit="auth-submit" novalidate>
      <label class="fld"><span>Email</span><input name="email" type="email" autocomplete="email" required placeholder="kamu@email.com" /></label>
      ${mode !== 'lupa' ? html`<label class="fld"><span>Kata sandi</span><input name="password" type="password" autocomplete="${mode === 'masuk' ? 'current-password' : 'new-password'}" minlength="6" required placeholder="Minimal 6 karakter" /></label>` : ''}
      <p class="auth-msg ${msg?.kind ?? ''}" role="status" ${msg ? '' : raw('hidden')}>${msg?.text ?? ''}</p>
      <button class="btn primary lg wide" type="submit">${mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Daftar' : 'Kirim tautan'}</button>
    </form>
    <div class="auth-links">
      ${mode === 'masuk' ? html`<button class="link" data-act="auth-mode" data-m="lupa">Lupa kata sandi?</button><button class="link" data-act="auth-mode" data-m="daftar">Belum punya akun? Daftar</button>` : html`<button class="link" data-act="auth-mode" data-m="masuk">Kembali ke masuk</button>`}
    </div>
    <button class="guest" data-act="auth-guest">Lanjut tanpa akun <small>data hanya di perangkat ini</small></button>
  </div></div>`;
}

export function showAuth(note?: string) {
  installDelegation();
  if (note) msg = { text: note, kind: 'err' };
  document.body.innerHTML = authView().s + '<div id="modal-root"></div><div id="toasts" aria-live="polite"></div>';
  document.title = 'Masuk · Weexam';
  $<HTMLInputElement>('input[name=email]')?.focus();
}

function redraw() {
  document.body.innerHTML = authView().s + '<div id="modal-root"></div><div id="toasts" aria-live="polite"></div>';
  $<HTMLInputElement>('input[name=email]')?.focus();
}

action('auth-mode', (el) => {
  mode = el.dataset.m as Mode;
  msg = null;
  redraw();
});
action('auth-guest', () => {
  chooseGuest(true);
  location.reload();
});
action('auth-submit', async (form) => {
  if (busy) return;
  const f = new FormData(form as HTMLFormElement);
  const email = String(f.get('email') ?? '').trim();
  const pw = String(f.get('password') ?? '');
  const fail = (text: string) => { msg = { text, kind: 'err' }; redraw(); const e = $<HTMLInputElement>('input[name=email]'); if (e) e.value = email; };
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Masukkan alamat email yang valid.');
  if (mode !== 'lupa' && pw.length < 6) return fail('Kata sandi minimal 6 karakter.');
  busy = true;
  const btn = $<HTMLButtonElement>('form button[type=submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }
  try {
    if (mode === 'masuk') await signIn(email, pw);
    else if (mode === 'daftar') {
      if (!(await signUp(email, pw))) {
        mode = 'masuk';
        msg = { text: 'Akun dibuat. Buka tautan konfirmasi di emailmu, lalu masuk.', kind: 'ok' };
        busy = false;
        return redraw();
      }
    } else {
      await sendReset(email);
      mode = 'masuk';
      msg = { text: 'Tautan pengaturan ulang dikirim. Periksa kotak masuk emailmu.', kind: 'ok' };
      busy = false;
      return redraw();
    }
    location.hash = '#/dashboard';
    location.reload();
  } catch (e) {
    busy = false;
    fail(e instanceof AuthError ? e.message : 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.');
  }
});

// ------------------------------------------------------------ Atur kata sandi baru (setelah tautan pemulihan)
export function promptNewPassword() {
  openModal({
    title: 'Buat kata sandi baru',
    body: html`<form data-submit="pw-save"><label class="fld"><span>Kata sandi baru</span><input name="pw" type="password" minlength="6" autocomplete="new-password" required /></label>
      <p class="auth-msg err" id="pw-err" hidden></p>
      <div class="modal-f"><button class="btn" type="button" data-act="modal-close">Nanti</button><button class="btn primary" type="submit">Simpan</button></div></form>`,
  });
}
action('pw-save', async (form) => {
  const pw = String(new FormData(form as HTMLFormElement).get('pw') ?? '');
  const err = $('#pw-err')!;
  if (pw.length < 6) { err.hidden = false; err.textContent = 'Minimal 6 karakter.'; return; }
  try {
    await setPassword(pw);
    closeModal();
    toast('Kata sandi diperbarui.');
  } catch (e) {
    err.hidden = false;
    err.textContent = e instanceof Error ? e.message : 'Gagal menyimpan.';
  }
});

// ------------------------------------------------------------ Kartu akun (Pengaturan)
const STATUS_TEXT: Record<SyncStatus, string> = {
  off: 'Tidak masuk',
  idle: 'Tersimpan di akun',
  syncing: 'Menyinkronkan…',
  offline: 'Offline. Perubahan dikirim saat tersambung.',
  error: 'Sinkron gagal',
  conflict: 'Perlu keputusan: data berbeda',
};

export function accountCard(): Raw {
  if (!cloudConfig()) return html`<span hidden></span>`;
  const s = session();
  if (!s) {
    return html`<section class="set-s" id="acct"><h3>Akun</h3><p class="muted">Kamu memakai Weexam tanpa akun, jadi data hanya ada di perangkat ini. Masuk agar data tersimpan di cloud dan bisa dibuka dari perangkat lain.</p>
      <div class="dl"><button class="btn primary" data-act="acct-login">${icon('cloud', 18)} Masuk atau daftar</button></div></section>`;
  }
  const st = syncStatus();
  const at = lastSyncAt();
  return html`<section class="set-s" id="acct"><h3>Akun</h3>
    <div class="acct-r"><div class="acct-av">${(s.user.email[0] ?? '?').toUpperCase()}</div><div class="acct-m"><strong>${s.user.email}</strong>
      <span class="sync-s s-${st}"><i></i>${STATUS_TEXT[st]}${st === 'error' && syncError() ? html`: ${syncError()}` : ''}${at && st === 'idle' ? html` · ${fmt.dateTime(at)}` : ''}</span></div></div>
    <div class="dl"><button class="btn" data-act="acct-sync">${icon('refresh', 18)} Sinkronkan sekarang</button><button class="btn danger-o" data-act="acct-out">${icon('logout', 18)} Keluar</button></div>
    <p class="hint">Topik, ujian, jawaban, catatan, dan berkas Evaluasi tersimpan di akunmu. Berkas yang diunggah dari perangkat lain diunduh saat dibuka.</p></section>`;
}

action('acct-login', () => {
  chooseGuest(false);
  location.reload();
});
action('acct-sync', async () => {
  await syncNow();
  toast(syncStatus() === 'idle' ? 'Data sudah tersinkron.' : 'Sinkron belum berhasil.', syncStatus() === 'idle' ? 'ok' : 'warn');
});
action('acct-out', async () => {
  const ok = await confirmDialog({ title: 'Keluar dari akun?', message: 'Data tetap aman di akun dan bisa dibuka lagi setelah masuk. Salinan di perangkat ini akan dihapus.', confirm: 'Keluar', danger: true });
  if (!ok) return;
  await signOut(true);
  location.hash = '#/dashboard';
  location.reload();
});

// ------------------------------------------------------------ Tombol status sinkron di header + dialog konflik
export function bindSyncUi() {
  const upd = () => {
    const b = $<HTMLElement>('#sync-btn');
    if (b) {
      b.hidden = !session();
      b.className = `icon-btn sync s-${syncStatus()}`;
      b.title = STATUS_TEXT[syncStatus()];
      b.setAttribute('aria-label', `Sinkron: ${STATUS_TEXT[syncStatus()]}`);
    }
    const a = $('#acct');
    if (a) a.outerHTML = accountCard().s;
  };
  onSyncStatus(upd);
  upd();
  setConflictHandler(
    () =>
      new Promise((resolve) => {
        let choice: 'cloud' | 'local' | null = null;
        openModal({
          title: 'Data di akun berbeda',
          body: html`<p class="muted">Data di akunmu berubah dari perangkat lain, padahal perangkat ini juga punya perubahan yang belum terkirim. Pilih versi yang dipakai.</p>
            <div class="cf-o"><button class="btn lg wide" data-act="cf-cloud"><strong>Pakai data akun</strong><small>Perubahan di perangkat ini diganti.</small></button>
            <button class="btn lg wide" data-act="cf-local"><strong>Pakai data perangkat ini</strong><small>Data akun ditimpa.</small></button></div>`,
          onClose: () => resolve(choice),
        });
        action('cf-cloud', () => { choice = 'cloud'; closeModal(); });
        action('cf-local', () => { choice = 'local'; closeModal(); });
      }),
  );
}
