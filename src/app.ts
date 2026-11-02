import { action, $, $$, esc, html, icon, installDelegation, raw, type Raw } from './ui/dom';
import { buildAlerts, examStatus, attemptFor, attemptDeadline, nextAction, type Alert } from './derive';
import { chime, setBadge, showOsNotification } from './notify';
import { parseHash, type Ctx, type Page } from './router';
import { flush, getState, initStore, mutate, submitAttempt, subscribe } from './store';
import { clock, fmt, fmtDuration, phaseOf, PHASE_LABEL } from './time';
import { closeModal, hydrateBlobs, modalOpen, toast } from './ui/kit';
import { resolvePage } from './pages';
import { needsLogin, prepareCloud, startSync, setRemoteAppliedHandler } from './cloud';
import { bindSyncUi, promptNewPassword, showAuth } from './pages/masuk';

let page: Page | null = null;
let ctx: Ctx;
let alerts: Alert[] = [];
let lastSig = '';
let renderQueued = false;
let bellOpen = false;

const NAV = [
  { key: 'dashboard', href: '#/dashboard', label: 'Dashboard', ic: 'home' },
  { key: 'evaluasi', href: '#/evaluasi', label: 'Evaluasi Ujian', ic: 'evaluasi' },
  { key: 'persiapan', href: '#/persiapan', label: 'Persiapan Ujian', ic: 'persiapan' },
  { key: 'ujian', href: '#/ujian', label: 'Ujian Mingguan', ic: 'ujian' },
] as const;

const LOGO = raw(`<svg class="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><path d="M7 11.500 11.500 21.500 16 13.500 20.500 21.500 25 11.500" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

function shell(): Raw {
  return html`<div class="app" id="app">
    <aside class="side" aria-label="Navigasi utama">
      <a class="brand" href="#/dashboard">${LOGO}<span>Weexam</span></a>
      <nav class="nav">${NAV.map((n) => html`<a class="nav-i" data-nav="${n.key}" href="${n.href}">${icon(n.ic, 20)}<span>${n.label}</span><i class="dot" data-nav-dot="${n.key}" hidden></i></a>`)}</nav>
      <div class="side-f"><a class="nav-i" data-nav="pengaturan" href="#/pengaturan">${icon('settings', 20)}<span>Pengaturan</span></a></div>
    </aside>
    <div class="main">
      <header class="top">
        <a class="brand sm" href="#/dashboard">${LOGO}</a>
        <div class="top-t"><h1 id="page-title"></h1><p id="page-sub" class="muted"></p></div>
        <div class="top-r">
          <a class="icon-btn sync" id="sync-btn" href="#/pengaturan" hidden>${icon('cloud', 22)}<i></i></a>
          <button class="icon-btn bell" id="bell" data-act="bell" aria-label="Notifikasi" aria-expanded="false">${icon('bell', 22)}<span class="badge" id="bell-n" hidden></span></button>
          <a class="icon-btn only-m" href="#/pengaturan" aria-label="Pengaturan">${icon('settings', 22)}</a>
        </div>
      </header>
      <div id="banner"></div>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Navigasi utama">${NAV.map((n) => html`<a data-nav="${n.key}" href="${n.href}">${icon(n.ic, 22)}<span>${n.label.replace(' Ujian', '').replace(' Mingguan', '')}</span><i class="dot" data-nav-dot="${n.key}" hidden></i></a>`)}</nav>
    <div id="bell-panel" class="bell-panel" hidden></div>
  </div>
  <div id="modal-root"></div><div id="toasts" aria-live="polite"></div>`;
}

// ------------------------------------------------------------ Render
function currentCtx(): Ctx {
  const { parts, query } = parseHash();
  return { now: new Date(), parts, query };
}

export function render(reset = false) {
  ctx = currentCtx();
  const next = resolvePage(ctx.parts) ?? resolvePage(['dashboard'])!;
  if (next !== page) {
    page?.unmount?.();
    page = next;
    reset = true;
  }
  const pg = page;
  const view = $('#view')!;
  const scroll = reset ? 0 : window.scrollY;
  view.innerHTML = pg.render(ctx).s;
  hydrateBlobs(view);
  pg.mount?.(view, ctx);
  $('#app')!.classList.toggle('focus', !!pg.focus);
  $('#page-title')!.textContent = pg.title;
  $('#page-sub')!.textContent = pg.subtitle?.(ctx) ?? '';
  document.title = `${pg.title} · Weexam`;
  $$<HTMLElement>('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === pg.nav));
  if (reset) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);
  updateChrome();
  updateCountdowns();
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (page?.static) return updateChrome();
    if (modalOpen()) return updateChrome();
    render();
  });
}

// ------------------------------------------------------------ Bell & banner
function seenKey(a: Alert) {
  return a.id;
}

function updateChrome() {
  const s = getState();
  const now = new Date();
  alerts = buildAlerts(s, now);
  const unseen = alerts.filter((a) => !s.seenAlerts[seenKey(a)]);
  const n = unseen.length;
  const badge = $('#bell-n')!;
  badge.hidden = n === 0;
  badge.textContent = String(n);
  $('#bell')!.classList.toggle('ring', unseen.some((a) => a.level === 'critical'));
  setBadge(n);

  // Banner tegas: peringatan kritis selalu tampak sampai kondisinya selesai.
  const crit = alerts.filter((a) => a.level === 'critical');
  const banner = $('#banner')!;
  if (crit.length && !page?.focus) {
    const a = crit[0];
    banner.innerHTML = html`<div class="banner" role="alert">${icon('alert', 20)}<div class="banner-t"><strong>${a.title}</strong><span>${a.body}</span></div>
      ${crit.length > 1 ? html`<button class="btn sm ghost-w" data-act="bell">+${crit.length - 1} lainnya</button>` : ''}
      <a class="btn sm light" href="${a.href}">Tangani</a></div>`.s;
  } else banner.innerHTML = '';

  // Titik pada menu: ada hal yang butuh perhatian
  const flag: Record<string, boolean> = {};
  for (const a of alerts) {
    if (a.level === 'info') continue;
    if (a.href.startsWith('#/persiapan')) flag.persiapan = true;
    else if (a.href.startsWith('#/ujian')) flag.ujian = true;
  }
  $$<HTMLElement>('[data-nav-dot]').forEach((d) => (d.hidden = !flag[d.dataset.navDot!]));
  if (bellOpen) renderBell();
}

function renderBell() {
  const p = $('#bell-panel')!;
  p.hidden = !bellOpen;
  $('#bell')!.setAttribute('aria-expanded', String(bellOpen));
  if (!bellOpen) return;
  const s = getState();
  p.innerHTML = html`<div class="bp-h"><strong>Notifikasi</strong>${alerts.length ? html`<button class="link" data-act="seen-all">Tandai dibaca</button>` : ''}</div>
    ${alerts.length === 0
      ? html`<p class="bp-empty">Tidak ada yang perlu ditangani sekarang.</p>`
      : html`<ul>${alerts.map((a) => html`<li class="al ${a.level} ${s.seenAlerts[a.id] ? 'seen' : ''}"><a href="${a.href}" data-act="bell-close"><i class="al-dot"></i><span><strong>${a.title}</strong><small>${a.body}</small></span></a></li>`)}</ul>`}`.s;
}

action('bell', () => {
  bellOpen = !bellOpen;
  renderBell();
});
action('bell-close', () => {
  bellOpen = false;
  renderBell();
});
action('seen-all', () => {
  mutate((s) => {
    alerts.forEach((a) => (s.seenAlerts[a.id] = new Date().toISOString()));
  }, true);
  updateChrome();
});
document.addEventListener('click', (e) => {
  if (!bellOpen) return;
  const t = e.target as HTMLElement;
  if (!t.closest('#bell-panel') && !t.closest('#bell')) {
    bellOpen = false;
    renderBell();
  }
});

// ------------------------------------------------------------ Tick
const notified = new Map<string, number>();

function notifyNew() {
  const s = getState();
  const now = Date.now();
  for (const a of alerts) {
    const every = a.level === 'critical' ? 3 * 3600_000 : 0;
    const last = notified.get(a.id);
    if (last && (!every || now - last < every)) continue;
    notified.set(a.id, now);
    if (a.level === 'info') continue;
    if (s.settings.osNotifications && document.visibilityState === 'hidden') void showOsNotification(a);
    const quiet = a.id.startsWith('run:') || a.id.startsWith('grade:');
    if (s.settings.sound && document.visibilityState === 'visible' && !last && !quiet) chime(a.level);
    if (document.visibilityState === 'visible' && !last && !quiet) toast(a.title, a.level === 'critical' ? 'err' : 'warn');
  }
}

function updateCountdowns() {
  const now = Date.now();
  $$<HTMLElement>('[data-cd]').forEach((el) => {
    const to = new Date(el.dataset.cd!).getTime();
    const diff = to - now;
    const pre = el.dataset.pre ?? '';
    const post = el.dataset.post ?? '';
    el.textContent = diff <= 0 ? (el.dataset.done ?? 'sekarang') : `${pre}${fmtDuration(diff, diff < 600_000)}${post}`;
  });
  const r = $('#run-timer');
  if (r) {
    const left = new Date(r.dataset.deadline!).getTime() - now;
    r.textContent = clock(left);
    r.classList.toggle('low', left < 600_000);
    r.classList.toggle('crit', left < 120_000);
  }
}

function signature(): string {
  const s = getState();
  const now = new Date();
  return (
    phaseOf(now) +
    '|' +
    s.exams.map((e) => `${e.id}:${examStatus(e, attemptFor(s, e.id), now)}`).join(',') +
    '|' +
    alerts.map((a) => a.id).join(',')
  );
}

function autoSubmitExpired() {
  const s = getState();
  const now = new Date();
  for (const a of s.attempts) {
    if (a.submittedAt) continue;
    const e = s.exams.find((x) => x.id === a.examId);
    if (!e) continue;
    if (now.getTime() >= attemptDeadline(e, a)) {
      submitAttempt(a.id, true, new Date(attemptDeadline(e, a)));
      toast(`Waktu habis. Jawaban "${e.name}" dikirim otomatis.`, 'warn');
      if (page?.focus && ctx.parts[2] === e.id) location.hash = '#/ujian';
    }
  }
}

let ticks = 0;
function tick() {
  updateCountdowns();
  autoSubmitExpired();
  if (ticks++ % 5 === 0) {
    updateChrome();
    notifyNew();
    const sig = signature();
    if (sig !== lastSig) {
      const first = lastSig === '';
      lastSig = sig;
      if (!first) queueRender();
    }
  }
}

// ------------------------------------------------------------ Boot
export async function boot() {
  const auth = await prepareCloud();
  if (needsLogin()) return showAuth(auth === 'error' ? 'Tautan masuk tidak valid atau sudah kedaluwarsa. Coba lagi.' : undefined);
  await initStore();
  document.body.innerHTML = shell().s;
  installDelegation();
  subscribe(queueRender);
  addEventListener('hashchange', () => {
    closeModal();
    bellOpen = false;
    renderBell();
    render(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      autoSubmitExpired();
      updateChrome();
      queueRender();
    }
  });
  if (!location.hash) location.hash = '#/dashboard';
  autoSubmitExpired();
  render(true);
  lastSig = signature();
  notifyNew();
  setInterval(tick, 1000);
  bindSyncUi();
  setRemoteAppliedHandler(() => toast('Data diperbarui dari akunmu.'));
  startSync();
  if (auth === 'recovery') promptNewPassword();
  void flush;
  void esc;
  void fmt;
  void PHASE_LABEL;
  void nextAction;
}
