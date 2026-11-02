import { GRADE_LABEL, type Letter } from '../grading';
import { blobUrl, getState } from '../store';
import type { Topic } from '../types';
import { presetUrl } from './covers';
import { $, $$, action, esc, html, icon, raw, type Raw } from './dom';

// ------------------------------------------------------------ Toast
export function toast(message: string, kind: 'ok' | 'warn' | 'err' = 'ok') {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  while (host.children.length >= 2) host.firstElementChild?.remove();
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

// ------------------------------------------------------------ Modal
interface ModalOpts {
  title: string;
  body: Raw;
  wide?: boolean;
  onMount?: (root: HTMLElement) => void;
  onClose?: () => void;
}

let modalClose: (() => void) | null = null;

export function openModal(o: ModalOpts): HTMLElement {
  closeModal();
  const host = $('#modal-root')!;
  const prevFocus = document.activeElement as HTMLElement | null;
  host.innerHTML = html`<div class="scrim" data-act="modal-close-bg">
    <div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${o.title}">
      <header class="modal-h"><h2>${o.title}</h2><button class="icon-btn" data-act="modal-close" aria-label="Tutup">${icon('x', 20)}</button></header>
      <div class="modal-b">${o.body}</div>
    </div></div>`.s;
  const root = $('.modal', host)!;
  document.body.classList.add('modal-open');
  hydrateBlobs(root);
  o.onMount?.(root);
  const first = $<HTMLElement>('input:not([type=hidden]),textarea,select,button.primary', root);
  first?.focus({ preventScroll: true });
  modalClose = () => {
    host.innerHTML = '';
    document.body.classList.remove('modal-open');
    modalClose = null;
    o.onClose?.();
    prevFocus?.focus?.({ preventScroll: true });
  };
  return root;
}

export function closeModal() {
  modalClose?.();
}
export function modalOpen() {
  return !!modalClose;
}

action('modal-close', () => closeModal());
action('modal-close-bg', (_el, ev) => {
  if ((ev.target as HTMLElement).classList.contains('scrim')) closeModal();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab' && modalClose) {
    const m = $('.modal');
    if (!m) return;
    const f = $$<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', m);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

export function confirmDialog(o: { title: string; message: string; confirm: string; danger?: boolean; extra?: Raw }): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title: o.title,
      body: html`<p class="muted">${o.message}</p>${o.extra ?? ''}
        <div class="modal-f"><button class="btn" data-act="modal-close">Batal</button>
        <button class="btn ${o.danger ? 'danger' : 'primary'}" data-act="confirm-yes">${o.confirm}</button></div>`,
      onClose: () => resolve(result),
    });
    action('confirm-yes', () => {
      result = true;
      closeModal();
    });
  });
}

// ------------------------------------------------------------ Blob -> gambar
export function hydrateBlobs(root: ParentNode = document) {
  $$<HTMLElement>('[data-blob]', root).forEach(async (el) => {
    const id = el.dataset.blob!;
    if (el.dataset.blobDone === id) return;
    const url = await blobUrl(id);
    if (!url) return;
    el.dataset.blobDone = id;
    if (el instanceof HTMLImageElement) el.src = url;
    else el.style.backgroundImage = `url("${url}")`;
  });
}

export function coverStyle(t: Topic): Raw {
  if (t.cover.kind === 'image') return raw(`data-blob="${esc(t.cover.blobId)}"`);
  return raw(`style="background-image:url('${presetUrl(t.cover.id, t.color).replace(/'/g, '%27')}')"`);
}

// ------------------------------------------------------------ Lencana
export function gradeBadge(letter: Letter | null, size: 'sm' | 'md' | 'lg' = 'md'): Raw {
  if (!letter) return html`<span class="grade none ${size}" title="Belum ada nilai">–</span>`;
  return html`<span class="grade g-${letter} ${size}" title="${letter}: ${GRADE_LABEL[letter]}">${letter}</span>`;
}

export const STATUS_LABEL: Record<string, string> = {
  draf: 'Draf',
  terjadwal: 'Terjadwal',
  terbuka: 'Terbuka',
  susulan: 'Susulan',
  berjalan: 'Sedang dikerjakan',
  'menunggu-koreksi': 'Menunggu koreksi',
  dinilai: 'Sudah dinilai',
  terlewat: 'Ditutup',
};

export function statusChip(status: string): Raw {
  return html`<span class="chip s-${status}">${STATUS_LABEL[status] ?? status}</span>`;
}

export function emptyState(title: string, text: string, cta?: Raw): Raw {
  return html`<div class="empty"><h3>${title}</h3><p>${text}</p>${cta ?? ''}</div>`;
}

export function topicSelect(selected: string | undefined, name = 'topic', withAll = true, attrs = ''): Raw {
  const ts = getState().topics;
  return html`<select name="${name}" ${raw(attrs)}>${withAll ? html`<option value="">Semua topik</option>` : ''}${ts.map(
    (t) => html`<option value="${t.id}" ${t.id === selected ? raw('selected') : ''}>${t.name}</option>`,
  )}</select>`;
}

// ------------------------------------------------------------ Grafik SVG
export function sparkline(values: (number | null)[], max: number, w = 180, h = 44, color = 'var(--accent)'): Raw {
  const pts = values.map((v, i) => (v === null ? null : [(i / Math.max(1, values.length - 1)) * (w - 8) + 4, h - 4 - (v / max) * (h - 8)] as const));
  const segs: string[] = [];
  let cur: string[] = [];
  pts.forEach((p) => {
    if (p) cur.push(`${p[0].toFixed(1)},${p[1].toFixed(1)}`);
    else if (cur.length) { segs.push(cur.join(' ')); cur = []; }
  });
  if (cur.length) segs.push(cur.join(' '));
  const last = [...pts].reverse().find(Boolean);
  return raw(`<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Tren">${segs
    .map((s) => `<polyline points="${s}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('')}${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}"/>` : ''}</svg>`);
}

export function barChart(items: { label: string; value: number | null }[], max = 100, h = 120): Raw {
  const w = 100;
  const bw = w / items.length;
  return raw(`<svg class="bars" viewBox="0 0 ${w} ${h + 18}" preserveAspectRatio="none" role="img" aria-label="Nilai per minggu">
    ${items
      .map((it, i) => {
        const x = i * bw + bw * 0.18;
        const bh = it.value === null ? 0 : Math.max(1.5, (it.value / max) * h);
        return `<g><rect x="${x}" y="0" width="${bw * 0.64}" height="${h}" rx="1.2" fill="var(--line-2)"/>${
          it.value === null ? '' : `<rect x="${x}" y="${h - bh}" width="${bw * 0.64}" height="${bh}" rx="1.2" fill="var(--accent)"/>`
        }<text x="${i * bw + bw / 2}" y="${h + 12}" text-anchor="middle" font-size="5.2" fill="var(--ink-3)">${esc(it.label)}</text></g>`;
      })
      .join('')}</svg>`);
}
