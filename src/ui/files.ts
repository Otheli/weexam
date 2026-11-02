import { getBlob } from '../store';
import type { FileRef } from '../types';
import { action, html, icon, type Raw } from './dom';
import { toast } from './kit';
import { downloadBlob } from '../notify';

export function sizeLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Berkas yang sudah dibuka pada sesi ini (untuk mengingatkan sebelum ujian dikirim tanpa membaca soal). */
export const openedFiles = new Set<string>();

export function fileList(files: FileRef[], removable = false, removeAct = 'file-remove'): Raw {
  if (!files.length) return html``;
  return html`<ul class="files">${files.map((f) => html`<li><button type="button" class="file" data-act="open-file" data-id="${f.id}" data-name="${f.name}" data-type="${f.type}">${icon('file', 18)}<span>${f.name}</span><small>${sizeLabel(f.size)}</small></button>
    <button type="button" class="icon-btn sm" data-act="dl-file" data-id="${f.id}" data-name="${f.name}" aria-label="Unduh ${f.name}" title="Unduh">${icon('download', 16)}</button>
    ${removable ? html`<button type="button" class="icon-btn sm" data-act="${removeAct}" data-id="${f.id}" aria-label="Hapus ${f.name}">${icon('x', 16)}</button>` : ''}</li>`)}</ul>`;
}

function markOpened(id: string) {
  openedFiles.add(id);
  dispatchEvent(new CustomEvent('weexam:file-opened', { detail: id }));
}

action('open-file', async (el) => {
  const b = await getBlob(el.dataset.id!);
  if (!b) return toast('Berkas tidak ditemukan di perangkat ini.', 'err');
  markOpened(el.dataset.id!);
  const viewable = /^(image\/|application\/pdf|text\/)/.test(b.type);
  if (viewable) {
    const u = URL.createObjectURL(b);
    const w = window.open(u, '_blank');
    if (!w) downloadBlob(el.dataset.name ?? 'berkas', b);
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  } else downloadBlob(el.dataset.name ?? 'berkas', b);
});

action('dl-file', async (el) => {
  const b = await getBlob(el.dataset.id!);
  if (!b) return toast('Berkas tidak ditemukan di perangkat ini.', 'err');
  markOpened(el.dataset.id!);
  downloadBlob(el.dataset.name ?? 'berkas', b);
});
