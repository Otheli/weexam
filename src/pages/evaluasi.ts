import { attemptFor, examStatus } from '../derive';
import { letterOf } from '../grading';
import { go, hrefWith, type Page } from '../router';
import { addEvalFiles, addNote, deleteEvaluation, getState, mutate, removeEvalFile, sendToEvaluation, syncExamFiles, topicById, uid, updateEvaluation, examById } from '../store';
import { reviewHtml } from '../exportDoc';
import { downloadBlob } from '../notify';
import { sizeLabel } from '../ui/files';
import type { EvalFile, Evaluation, FileKind } from '../types';
import { fmt, weekRangeLabel } from '../time';
import { $, $$, action, html, icon, raw, type Raw } from '../ui/dom';
import { closeModal, confirmDialog, emptyState, gradeBadge, hydrateBlobs, openModal, toast, topicSelect } from '../ui/kit';

export const evaluasiPage = (id?: string): Page => ({
  title: 'Evaluasi Ujian',
  nav: 'evaluasi',
  static: !!id, // detail berisi kolom teks: jangan dirender ulang saat mengetik
  render(ctx) {
    const s = getState();
    const only = ctx.query.get('topik') ?? '';
    const list = s.evaluations.filter((e) => !only || e.topicId === only).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unsent = s.exams.filter((e) => e.status === 'published' && !e.evaluatedAt && ['dinilai', 'terlewat'].includes(examStatus(e, attemptFor(s, e.id), ctx.now)) && (!only || e.topicId === only));
    const sel = id ? s.evaluations.find((e) => e.id === id) : undefined;

    const listCol = html`<aside class="ev-list">
      <div class="toolbar tight"><label class="sel">${topicSelect(only, 'topik', true, 'data-change="ev-filter"')}</label>
        <button class="btn sm" data-act="note-new">${icon('plus', 16)} Catatan</button></div>
      <label class="search">${icon('search', 18)}<input type="search" data-input="ev-search" placeholder="Cari judul, catatan, tag, berkas" aria-label="Cari" /></label>
      ${unsent.length ? html`<div class="callout"><strong>${unsent.length} hasil siap dievaluasi</strong><ul class="plain">${unsent.slice(0, 4).map((e) => html`<li><span>${e.name}</span><button class="link" data-act="ex-eval" data-id="${e.id}">Kirim</button></li>`)}</ul></div>` : ''}
      ${list.length === 0
        ? emptyState('Belum ada catatan evaluasi', 'Kirim hasil ujian yang sudah dikoreksi ke sini, atau buat catatan baru.')
        : html`<ul class="rows ev-rows">${list.map((e) => {
            const t = topicById(e.topicId);
            const sc = e.score;
            const nf = (e.files ?? []).length;
            return html`<li class="row ${e.id === id ? 'sel' : ''}" data-s="${searchText(e)}"><i class="tdot" style="--c:${t?.color}"></i><a class="row-m" href="${hrefWith(`#/evaluasi/${e.id}`, { topik: only || undefined })}"><strong>${e.title}</strong><small class="muted">${t?.name} · ${e.kind === 'ujian' ? `Minggu ${weekRangeLabel(e.weekKey!)}` : 'Catatan'}${nf ? ` · ${nf} berkas` : ''}</small></a>${sc !== undefined ? html`<span class="row-n">${gradeBadge(letterOf(sc, s.settings.gradeMin), 'sm')}</span>` : ''}</li>`;
          })}</ul>`}
    </aside>`;

    let detail: Raw;
    if (!id) detail = html`<section class="ev-detail empty-d"><p class="muted">Pilih catatan di sebelah kiri untuk meninjau hasil, menulis refleksi, dan mencatat materi yang perlu dipelajari.</p></section>`;
    else if (!sel) detail = html`<section class="ev-detail">${emptyState('Catatan tidak ditemukan', 'Mungkin sudah dihapus.', html`<a class="btn" href="#/evaluasi">Kembali</a>`)}</section>`;
    else {
      const t = topicById(sel.topicId);
      detail = html`<section class="ev-detail" data-id="${sel.id}">
        <a class="crumb only-m" href="#/evaluasi">${icon('back', 18)} Semua catatan</a>
        <header class="ev-h"><div><h2>${sel.title}</h2><p class="muted"><i class="tdot" style="--c:${t?.color}"></i> ${t?.name} · ${sel.kind === 'ujian' ? `Minggu ${weekRangeLabel(sel.weekKey!)}` : `Dibuat ${fmt.short(sel.createdAt)}`}</p></div>
          ${sel.score !== undefined ? html`<div class="ev-sc">${gradeBadge(letterOf(sel.score, s.settings.gradeMin), 'lg')}<strong>${sel.score.toFixed(1)}</strong></div>` : ''}</header>
        <div class="tags" id="ev-tags">${tagsHtml(sel)}</div>
        <div class="block"><div class="block-h"><h3>Berkas</h3>${sel.examId && examById(sel.examId) ? html`<button class="link" data-act="ev-sync">Muat berkas dari ujian</button>` : ''}</div>
          <div id="ev-files">${filesHtml(sel)}</div>
          <div class="ev-up"><select id="ev-kind" aria-label="Jenis berkas">${KINDS.map(([k, l]) => html`<option value="${k}" ${k === (sel.kind === 'catatan' ? 'materi' : 'jawaban') ? raw('selected') : ''}>${l}</option>`)}</select>
            <label class="btn dropzone" id="ev-drop">${icon('upload', 18)} Unggah berkas<input type="file" multiple hidden data-change="ev-upload" /></label></div>
          <small class="muted">Seret berkas ke tombol, atau pilih beberapa sekaligus. Disimpan di perangkat ini.</small></div>
        ${sel.review.length ? html`<div class="block"><h3>Tinjauan soal</h3><div class="rev">${sel.review.map((r, i) => {
          const full = r.earned >= r.max;
          return html`<details ${full ? '' : raw('open')} class="rv ${full ? 'ok' : 'bad'}"><summary><span class="qn">${i + 1}</span><span class="rv-t">${r.text}</span><span class="rv-p">${r.earned}/${r.max}</span></summary>
            <div class="cmp"><div><small class="muted">Jawabanmu</small><p class="pre">${r.mine}</p></div><div><small class="muted">Kunci</small><p class="pre">${r.key || '–'}</p></div></div></details>`;
        })}</div></div>` : ''}
        <div class="block"><h3>Refleksi</h3>
          <label class="fld"><span>Kesalahan dan penyebabnya</span><textarea rows="3" data-input="ev-text" data-f="wrong" placeholder="Apa yang belum tepat, dan kenapa?">${sel.wrong}</textarea></label>
          <label class="fld"><span>Catatan</span><textarea rows="5" data-input="ev-text" data-f="notes" placeholder="Ringkasan, rumus, atau hal yang harus diingat">${sel.notes}</textarea></label>
          <small class="muted" id="ev-ind">Tersimpan otomatis</small></div>
        <div class="block"><h3>Materi yang perlu dipelajari</h3>
          <ul class="todo" id="study">${studyList(sel.id)}</ul>
          <form data-submit="study-add" class="inline-add"><input name="t" placeholder="Tambah materi atau tugas belajar" maxlength="120" autocomplete="off" /><button class="btn">${icon('plus', 16)} Tambah</button></form></div>
        <div class="ev-f"><button class="btn" data-act="ev-export" data-id="${sel.id}">${icon('download', 16)} Unduh ringkasan</button><button class="btn danger-o" data-act="ev-del" data-id="${sel.id}">${icon('trash', 16)} Hapus catatan</button></div>
      </section>`;
    }
    return html`<div class="wrap wide"><div class="ev ${id ? 'has-detail' : ''}">${listCol}${detail}</div></div>`;
  },
});

const KINDS: [FileKind, string][] = [['soal', 'Soal'], ['jawaban', 'Jawaban'], ['materi', 'Materi belajar'], ['lainnya', 'Lainnya']];
const KIND_L = Object.fromEntries(KINDS) as Record<FileKind, string>;
let kindFilter: FileKind | 'semua' = 'semua';

function searchText(e: Evaluation): string {
  return [e.title, e.notes, e.wrong, ...(e.tags ?? []), ...(e.files ?? []).map((f) => f.name), ...e.study.map((x) => x.text)].join(' ').toLowerCase();
}

function tagsHtml(ev: Evaluation): Raw {
  return html`${(ev.tags ?? []).map((t) => html`<span class="tag">${t}<button data-act="tag-del" data-t="${t}" aria-label="Hapus tag ${t}">${icon('x', 12)}</button></span>`)}<input class="tag-in" data-input="tag-type" placeholder="+ tag" maxlength="24" aria-label="Tambah tag" />`;
}

function fileCard(f: EvalFile): Raw {
  const img = f.type.startsWith('image/');
  return html`<li class="ef"><button type="button" class="ef-th" data-act="open-file" data-id="${f.id}" data-name="${f.name}" aria-label="Buka ${f.name}">${img ? html`<img data-blob="${f.id}" alt="" />` : icon('file', 26)}</button>
    <div class="ef-m"><strong title="${f.name}">${f.name}</strong><small class="muted"><span class="kind k-${f.kind}">${KIND_L[f.kind]}</span> ${sizeLabel(f.size)}</small></div>
    <button class="icon-btn sm" data-act="dl-file" data-id="${f.id}" data-name="${f.name}" aria-label="Unduh" title="Unduh">${icon('download', 16)}</button>
    <button class="icon-btn sm" data-act="ef-del" data-id="${f.id}" aria-label="Hapus berkas">${icon('trash', 16)}</button></li>`;
}

function filesHtml(ev: Evaluation): Raw {
  const files = ev.files ?? [];
  if (!files.length) return html`<p class="muted pad0">Belum ada berkas. Unggah soal, jawaban, atau materi belajar untuk disimpan bersama catatan ini.</p>`;
  const cnt = (k: FileKind | 'semua') => (k === 'semua' ? files.length : files.filter((f) => f.kind === k).length);
  const shown = kindFilter === 'semua' ? files : files.filter((f) => f.kind === kindFilter);
  return html`<div class="chips">${(['semua', ...KINDS.map((k) => k[0])] as (FileKind | 'semua')[]).filter((k) => k === 'semua' || cnt(k) > 0).map((k) => html`<button class="fchip ${kindFilter === k ? 'on' : ''}" data-act="ef-filter" data-k="${k}">${k === 'semua' ? 'Semua' : KIND_L[k]} <b>${cnt(k)}</b></button>`)}</div>
    <ul class="efs">${shown.map(fileCard)}</ul>`;
}

function redrawFiles() {
  const id = curId();
  const ev = getState().evaluations.find((e) => e.id === id);
  const box = $('#ev-files');
  if (ev && box) {
    box.innerHTML = filesHtml(ev).s;
    hydrateBlobs(box);
  }
}

action('ef-filter', (el) => {
  kindFilter = el.dataset.k as FileKind | 'semua';
  redrawFiles();
});
action('ev-search', (el) => {
  const q = (el as HTMLInputElement).value.toLowerCase().trim();
  $$<HTMLElement>('.ev-rows .row').forEach((r) => (r.hidden = !!q && !(r.dataset.s ?? '').includes(q)));
});
action('ev-upload', async (el) => {
  const id = curId();
  const input = el as HTMLInputElement;
  const files = [...(input.files ?? [])];
  if (!id || !files.length) return;
  const kind = ($<HTMLSelectElement>('#ev-kind')?.value ?? 'lainnya') as FileKind;
  const n = await addEvalFiles(id, files, kind);
  input.value = '';
  redrawFiles();
  toast(`${n} berkas disimpan ke Evaluasi.`);
});
document.addEventListener('dragover', (e) => {
  if ((e.target as HTMLElement).closest?.('#ev-drop')) e.preventDefault();
});
document.addEventListener('drop', async (e) => {
  const z = (e.target as HTMLElement).closest?.('#ev-drop');
  if (!z) return;
  e.preventDefault();
  const id = curId();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (!id || !files.length) return;
  const kind = ($<HTMLSelectElement>('#ev-kind')?.value ?? 'lainnya') as FileKind;
  const n = await addEvalFiles(id, files, kind);
  redrawFiles();
  toast(`${n} berkas disimpan ke Evaluasi.`);
});
action('ef-del', async (el) => {
  const id = curId();
  if (!id) return;
  const ok = await confirmDialog({ title: 'Hapus berkas ini?', message: 'Berkas dihapus dari catatan evaluasi dan perangkat ini.', confirm: 'Hapus', danger: true });
  if (!ok) return;
  await removeEvalFile(id, el.dataset.id!);
  redrawFiles();
});
action('ev-sync', async () => {
  const id = curId();
  if (!id) return;
  const n = await syncExamFiles(id);
  redrawFiles();
  toast(n ? `${n} berkas dimuat dari ujian.` : 'Semua berkas ujian sudah tersimpan.', n ? 'ok' : 'warn');
});
action('tag-type', () => undefined);
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.classList?.contains('tag-in') || (e.key !== 'Enter' && e.key !== ',')) return;
  e.preventDefault();
  const id = curId();
  const v = t.value.trim().replace(/^#/, '').toLowerCase();
  if (!id || !v) return;
  mutate((s) => {
    const ev = s.evaluations.find((x) => x.id === id);
    if (ev && !(ev.tags ??= []).includes(v)) ev.tags.push(v);
  }, true);
  $('#ev-tags')!.innerHTML = tagsHtml(getState().evaluations.find((x) => x.id === id)!).s;
  $<HTMLInputElement>('.tag-in')?.focus();
});
action('tag-del', (el) => {
  const id = curId();
  mutate((s) => {
    const ev = s.evaluations.find((x) => x.id === id);
    if (ev) ev.tags = (ev.tags ?? []).filter((x) => x !== el.dataset.t);
  }, true);
  $('#ev-tags')!.innerHTML = tagsHtml(getState().evaluations.find((x) => x.id === id)!).s;
});
action('ev-export', (el) => {
  const ev = getState().evaluations.find((x) => x.id === el.dataset.id);
  if (!ev) return;
  const doc = reviewHtml({
    title: ev.title, topic: topicById(ev.topicId)?.name ?? '', meta: ev.kind === 'ujian' ? `Minggu ${weekRangeLabel(ev.weekKey!)}` : 'Catatan', scoreLabel: ev.score?.toFixed(1),
    review: ev.review, files: (ev.files ?? []).map((f) => ({ name: f.name, kind: KIND_L[f.kind] })),
    sections: [{ heading: 'Kesalahan dan penyebabnya', text: ev.wrong }, { heading: 'Catatan', text: ev.notes }, { heading: 'Materi yang perlu dipelajari', text: ev.study.map((x) => `${x.done ? '[x]' : '[ ]'} ${x.text}`).join('\n') }, { heading: 'Tag', text: (ev.tags ?? []).join(', ') }],
  });
  downloadBlob(`${ev.title.replace(/[^\w-]+/g, '_')}.html`, new Blob([doc], { type: 'text/html' }));
});

function studyList(evId: string): Raw {
  const ev = getState().evaluations.find((e) => e.id === evId);
  if (!ev || ev.study.length === 0) return html`<li class="muted">Belum ada. Catat materi yang akan kamu pelajari sebelum ujian berikutnya.</li>`;
  return html`${ev.study.map((x) => html`<li class="${x.done ? 'done' : ''}"><label><input type="checkbox" data-change="study-toggle" data-id="${x.id}" ${x.done ? raw('checked') : ''} /><span>${x.text}</span></label><button class="icon-btn sm" data-act="study-del" data-id="${x.id}" aria-label="Hapus">${icon('x', 14)}</button></li>`)}`;
}

function curId(): string | undefined {
  return $('.ev-detail')?.dataset.id;
}

action('ev-filter', (el) => {
  const v = (el as HTMLSelectElement).value;
  go(hrefWith('#/evaluasi', { topik: v || undefined }));
});

let t: ReturnType<typeof setTimeout> | undefined;
action('ev-text', (el) => {
  const id = curId();
  if (!id) return;
  const f = el.dataset.f as 'wrong' | 'notes';
  updateEvaluation(id, { [f]: (el as HTMLTextAreaElement).value });
  const ind = $('#ev-ind');
  if (ind) ind.textContent = 'Menyimpan…';
  clearTimeout(t);
  t = setTimeout(() => ind && (ind.textContent = `Tersimpan ${fmt.time(new Date())}`), 500);
});

function redrawStudy() {
  const id = curId();
  if (id) $('#study')!.innerHTML = studyList(id).s;
}

action('study-add', (form) => {
  const id = curId();
  const f = form as HTMLFormElement;
  const text = String(new FormData(f).get('t') ?? '').trim();
  if (!id || !text) return;
  mutate((s) => s.evaluations.find((e) => e.id === id)?.study.push({ id: uid(), text, done: false }), true);
  f.reset();
  redrawStudy();
  $<HTMLInputElement>('input[name=t]', f)?.focus();
});
action('study-toggle', (el) => {
  const id = curId();
  mutate((s) => {
    const it = s.evaluations.find((e) => e.id === id)?.study.find((x) => x.id === el.dataset.id);
    if (it) it.done = (el as HTMLInputElement).checked;
  }, true);
  redrawStudy();
});
action('study-del', (el) => {
  const id = curId();
  mutate((s) => {
    const ev = s.evaluations.find((e) => e.id === id);
    if (ev) ev.study = ev.study.filter((x) => x.id !== el.dataset.id);
  }, true);
  redrawStudy();
});

action('ev-del', async (el) => {
  const ok = await confirmDialog({ title: 'Hapus catatan ini?', message: 'Skor ujian tidak berubah, tetapi catatan dan materi tindak lanjut hilang.', confirm: 'Hapus', danger: true });
  if (!ok) return;
  const ev = getState().evaluations.find((e) => e.id === el.dataset.id);
  if (ev?.examId) {
    const ex = examById(ev.examId);
    if (ex) mutate(() => { ex.evaluatedAt = undefined; }, true);
  }
  await deleteEvaluation(el.dataset.id!);
  go('#/evaluasi');
  toast('Catatan dihapus.');
});

action('note-new', () => {
  const s = getState();
  if (!s.topics.length) return toast('Tambahkan topik lebih dulu.', 'warn');
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  openModal({
    title: 'Catatan baru',
    body: html`<form data-submit="note-create" class="form"><label class="fld"><span>Topik</span>${topicSelect(q.get('topik') ?? s.topics[0].id, 'topic', false)}</label>
      <label class="fld"><span>Judul</span><input name="title" required maxlength="80" placeholder="Mis. Rangkuman bab 3" /></label>
      <div class="modal-f"><button type="button" class="btn" data-act="modal-close">Batal</button><button class="btn primary">Buat catatan</button></div></form>`,
  });
});
action('note-create', (form) => {
  const fd = new FormData(form as HTMLFormElement);
  const ev = addNote(String(fd.get('topic')), String(fd.get('title')).trim());
  closeModal();
  go(`#/evaluasi/${ev.id}`);
});
void [sendToEvaluation, $$];
