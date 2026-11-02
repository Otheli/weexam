import { topicScore, topicWeekHistory, topicResults, examWeek, attemptFor, examStatus } from '../derive';
import { GRADE_LABEL } from '../grading';
import type { Page } from '../router';
import { addTopic, canAddTopic, deleteTopic, getState, shrinkImage, storeFile, topicById, updateTopic, deleteBlob } from '../store';
import { MAX_TOPICS, type Cover, type Topic } from '../types';
import { weekRangeLabel, fmt } from '../time';
import { PALETTE, PRESETS, presetUrl } from '../ui/covers';
import { $, action, html, icon, raw } from '../ui/dom';
import { barChart, closeModal, confirmDialog, coverStyle, gradeBadge, hydrateBlobs, openModal, STATUS_LABEL, toast } from '../ui/kit';
import { go } from '../router';

export function openTopicModal(topicId?: string) {
  const existing = topicById(topicId);
  if (!existing && !canAddTopic()) return toast(`Batas ${MAX_TOPICS} topik sudah tercapai.`, 'warn');
  let color = existing?.color ?? PALETTE[getState().topics.length % PALETTE.length];
  let cover: Cover = existing?.cover ?? { kind: 'preset', id: PRESETS[getState().topics.length % PRESETS.length] };
  let uploadedBlob: string | null = null; // blob baru yang belum tentu dipakai

  const coverTiles = () =>
    html`${PRESETS.map((p) => html`<button type="button" class="cv ${cover.kind === 'preset' && cover.id === p ? 'on' : ''}" data-act="cv-preset" data-id="${p}" style="background-image:url('${raw(presetUrl(p, color).replace(/'/g, '%27'))}')" aria-label="Pola ${p}"></button>`)}
      ${cover.kind === 'image' ? html`<button type="button" class="cv on" data-blob="${cover.blobId}" aria-label="Gambar kamu"></button>` : ''}
      <label class="cv upload" tabindex="0">${icon('image', 20)}<span>Unggah</span><input type="file" accept="image/*" hidden data-change="cv-upload" /></label>`;

  const root = openModal({
    title: existing ? 'Ubah topik' : 'Topik baru',
    body: html`<form data-submit="topic-save" class="form" autocomplete="off">
      <label class="fld"><span>Nama topik</span><input name="name" required maxlength="60" value="${existing?.name ?? ''}" placeholder="Mis. Struktur Data" /></label>
      <label class="fld"><span>Deskripsi singkat <em>(opsional)</em></span><input name="description" maxlength="140" value="${existing?.description ?? ''}" placeholder="Fokus atau target topik ini" /></label>
      <div class="row2">
        <label class="fld"><span>Bobot (SKS)</span><input name="credits" type="number" min="1" max="6" step="1" value="${existing?.credits ?? 2}" /><small>Menentukan pengaruh topik pada IP.</small></label>
        <div class="fld"><span>Warna</span><div class="swatches" id="sw">${PALETTE.map((c) => html`<button type="button" class="sw ${c === color ? 'on' : ''}" data-act="sw" data-c="${c}" style="--c:${c}" aria-label="Warna ${c}"></button>`)}</div></div>
      </div>
      <div class="fld"><span>Gambar ilustrasi</span><div class="covers" id="covers">${coverTiles()}</div></div>
      <div class="modal-f">
        ${existing ? html`<button type="button" class="btn danger-o" data-act="topic-del" data-id="${existing.id}">Hapus topik</button>` : ''}
        <span class="grow"></span><button type="button" class="btn" data-act="modal-close">Batal</button><button class="btn primary">${existing ? 'Simpan' : 'Tambah topik'}</button>
      </div></form>`,
    onClose: () => {
      if (uploadedBlob && !(cover.kind === 'image' && cover.blobId === uploadedBlob)) void deleteBlob(uploadedBlob);
    },
  });

  const redraw = () => {
    $('#covers', root)!.innerHTML = coverTiles().s;
    hydrateBlobs(root);
  };
  action('sw', (el) => {
    color = el.dataset.c!;
    root.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', (s as HTMLElement).dataset.c === color));
    redraw();
  });
  action('cv-preset', (el) => {
    cover = { kind: 'preset', id: el.dataset.id! };
    redraw();
  });
  action('cv-upload', async (el) => {
    const f = (el as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const small = await shrinkImage(f);
      const ref = await storeFile(small, f.name);
      if (uploadedBlob) void deleteBlob(uploadedBlob);
      uploadedBlob = ref.id;
      cover = { kind: 'image', blobId: ref.id };
      redraw();
    } catch {
      toast('Gambar tidak bisa dibaca. Coba berkas JPG atau PNG lain.', 'err');
    }
  });
  action('topic-save', (form) => {
    const fd = new FormData(form as HTMLFormElement);
    const data = {
      name: String(fd.get('name')).trim(),
      description: String(fd.get('description') ?? '').trim(),
      credits: Math.min(6, Math.max(1, Math.round(Number(fd.get('credits')) || 2))),
      color,
      cover,
    };
    if (!data.name) return;
    const oldCover = existing?.cover;
    if (existing) {
      updateTopic(existing.id, data);
      if (oldCover?.kind === 'image' && !(cover.kind === 'image' && cover.blobId === oldCover.blobId)) void deleteBlob(oldCover.blobId);
      toast('Topik disimpan.');
    } else {
      addTopic(data);
      toast('Topik ditambahkan.');
    }
    uploadedBlob = null; // sudah dipakai
    closeModal();
  });
  action('topic-del', async (el) => {
    const t = topicById(el.dataset.id);
    if (!t) return;
    const nEx = getState().exams.filter((e) => e.topicId === t.id).length;
    uploadedBlob = null;
    closeModal();
    const ok = await confirmDialog({
      title: `Hapus "${t.name}"?`,
      message: `${nEx} ujian, jawaban, dan catatan evaluasi topik ini ikut terhapus dan tidak bisa dikembalikan.`,
      confirm: 'Hapus topik',
      danger: true,
    });
    if (ok) {
      await deleteTopic(t.id);
      go('#/dashboard');
      toast('Topik dihapus.');
    }
  });
}

action('topic-add', () => openTopicModal());
action('topic-edit', (el) => openTopicModal(el.dataset.id));

export const topicPage = (id: string): Page => ({
  title: 'Topik',
  nav: 'dashboard',
  render(ctx) {
    const s = getState();
    const t = topicById(id);
    if (!t) return html`<div class="wrap"><div class="empty"><h3>Topik tidak ditemukan</h3><p>Mungkin sudah dihapus.</p><a class="btn primary" href="#/dashboard">Kembali ke Dashboard</a></div></div>`;
    const sc = topicScore(s, t, ctx.now);
    const hist = topicWeekHistory(s, t, ctx.now, 8);
    const rows = s.exams
      .filter((e) => e.topicId === t.id && e.status === 'published')
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    const results = topicResults(s, t, ctx.now);
    return html`<div class="wrap">
      <a class="crumb" href="#/dashboard">${icon('back', 18)} Dashboard</a>
      <section class="t-hero">
        <div class="t-cover" ${coverStyle(t)}></div>
        <div class="t-info">
          <div class="t-head"><h2>${t.name}</h2><button class="btn sm" data-act="topic-edit" data-id="${t.id}">${icon('pencil', 16)} Ubah</button></div>
          ${t.description ? html`<p class="muted">${t.description}</p>` : ''}
          <div class="t-score">${gradeBadge(sc.letter, 'lg')}<div><div class="big-n">${sc.score === null ? '–' : sc.score.toFixed(1)}</div><div class="muted">${sc.letter ? GRADE_LABEL[sc.letter] : 'Belum ada nilai'} · ${t.credits} SKS${sc.weeks ? ` · ${sc.weeks} minggu dihitung` : ''}</div></div></div>
          <div class="t-links">
            <a class="btn" href="#/persiapan?topik=${t.id}">${icon('persiapan', 18)} Persiapan</a>
            <a class="btn" href="#/ujian?topik=${t.id}">${icon('ujian', 18)} Ujian</a>
            <a class="btn" href="#/evaluasi?topik=${t.id}">${icon('evaluasi', 18)} Evaluasi</a>
          </div>
        </div>
      </section>
      <section class="block"><h3>Nilai per minggu</h3>
        <div class="chart">${barChart(hist.map((h) => ({ label: fmt.short(h.week).replace(' ', ' '), value: h.score })))}</div>
      </section>
      <section class="block"><h3>Riwayat ujian</h3>
        ${rows.length === 0 ? html`<p class="muted">Belum ada ujian untuk topik ini.</p>` : html`<ul class="rows">${rows.map((e) => {
          const at = attemptFor(s, e.id);
          const st = examStatus(e, at, ctx.now);
          const r = results.find((x) => x.examId === e.id);
          return html`<li class="row"><div class="row-m"><strong>${e.name}</strong><small class="muted">Minggu ${weekRangeLabel(examWeek(e))}</small></div><span class="chip s-${st}">${STATUS_LABEL[st]}</span><span class="row-n">${r ? r.score.toFixed(1) : '–'}</span></li>`;
        })}</ul>`}
      </section>
    </div>`;
  },
});
void ({} as Topic);
