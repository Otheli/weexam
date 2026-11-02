import { attemptFor, coverage, examStatus, examWeek, missingTopics } from '../derive';
import { maxPoints } from '../grading';
import { buildIcs, downloadBlob } from '../notify';
import { go, hrefWith, type Page } from '../router';
import { examById, getBlob, getState, removeExam, saveExam, storeFile, topicById, uid, deleteBlob, mutate } from '../store';
import {
  PHASE_LABEL, defaultSchedule, fmt, fromLocalInput, phaseOf, prepTargetWeek, scheduleFor, shiftWeek, toLocalInput, weekKey, weekRangeLabel,
} from '../time';
import type { Exam, FileRef, QType, Question } from '../types';
import { $, $$, action, esc, html, icon, raw, type Raw } from '../ui/dom';
import { fileList } from '../ui/files';
import { closeModal, confirmDialog, emptyState, openModal, toast, topicSelect } from '../ui/kit';

// ====================================================================== Ringkasan kesiapan
export const persiapanPage: Page = {
  title: 'Persiapan Ujian',
  nav: 'persiapan',
  subtitle: (c) => `Ujian untuk siklus ${weekRangeLabel(c.query.get('minggu') ?? prepTargetWeek(c.now))}`,
  render(ctx) {
    const s = getState();
    const cur = weekKey(ctx.now);
    const wk = ctx.query.get('minggu') ?? prepTargetWeek(ctx.now);
    const only = ctx.query.get('topik') ?? '';
    const topics = s.topics.filter((t) => !only || t.id === only);
    const ready = s.topics.filter((t) => coverage(s, t, wk).state === 'siap').length;
    const missing = missingTopics(s, wk).length;
    const lnk = (w: string) => hrefWith('#/persiapan', { minggu: w, topik: only || undefined });
    const pct = s.topics.length ? Math.round((ready / s.topics.length) * 100) : 0;
    const urgent = wk > cur && phaseOf(ctx.now) !== 'evaluasi' && missing > 0 && phaseOf(ctx.now) === 'persiapan';

    return html`<div class="wrap">
      <div class="toolbar">
        <div class="weeknav"><a class="icon-btn" href="${lnk(shiftWeek(wk, -1))}" aria-label="Minggu sebelumnya">${icon('left', 20)}</a><strong>${weekRangeLabel(wk)}</strong><a class="icon-btn" href="${lnk(shiftWeek(wk, 1))}" aria-label="Minggu berikutnya">${icon('right', 20)}</a>
          ${wk === prepTargetWeek(ctx.now) ? html`<span class="chip p-persiapan">Sabtu depan</span>` : html`<a class="btn sm" href="${lnk(prepTargetWeek(ctx.now))}">Ke Sabtu depan</a>`}</div>
        <div class="tb-r"><label class="sel">${topicSelect(only, 'topik', true, 'data-change="prep-filter"')}</label></div>
      </div>
      ${s.topics.length === 0 ? emptyState('Belum ada topik', 'Tambahkan topik di Dashboard, lalu siapkan satu ujian untuk setiap topik.', html`<a class="btn primary" href="#/dashboard?baru=1">Tambah topik</a>`) : html`
      <section class="cover-sum ${urgent ? 'urgent' : ''}">
        <div class="cs-t"><strong>${ready} dari ${s.topics.length} topik siap</strong><span class="muted">${missing ? `${missing} topik masih kosong atau berupa draf. Setiap topik wajib punya ujian setiap minggu.` : 'Semua topik sudah punya ujian terbit.'}</span></div>
        <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <div class="cs-a">
          ${missing ? html`<button class="btn" data-act="prep-copy-all" data-wk="${wk}">${icon('copy', 18)} Salin dari minggu lalu</button>` : ''}
          ${ready ? html`<button class="btn" data-act="prep-ics" data-wk="${wk}">${icon('calplus', 18)} Ekspor kalender</button>` : ''}
        </div>
      </section>
      <ul class="rows prep">${topics.map((t) => {
        const cv = coverage(s, t, wk);
        const label = cv.state === 'siap' ? 'Siap' : cv.state === 'draf' ? 'Draf' : 'Kosong';
        return html`<li class="prep-t cov-${cv.state}">
          <div class="pt-h"><i class="tdot" style="--c:${t.color}"></i><a class="pt-n" href="#/topik/${t.id}">${t.name}</a><span class="cov cov-${cv.state}">${label}</span>
            <a class="btn sm ${cv.exams.length ? '' : 'primary'}" href="#/persiapan/ujian/baru?topik=${t.id}&minggu=${wk}">${icon('plus', 16)} ${cv.exams.length ? 'Ujian lain' : 'Buat ujian'}</a></div>
          ${cv.exams.length ? html`<ul class="pt-ex">${cv.exams.map((e) => {
            const st = examStatus(e, attemptFor(s, e.id), ctx.now);
            const locked = e.status === 'published' && st !== 'terjadwal';
            return html`<li><a href="#/persiapan/ujian/${e.id}"><strong>${e.name}</strong></a><small class="muted">${fmt.dateTime(e.scheduledAt)} · ${e.durationMin} mnt · ${e.questions.length ? `${e.questions.length} soal` : `${e.attachments.length} berkas`}</small>
              <span class="chip s-${e.status === 'draft' ? 'draf' : locked ? 'terbuka' : 'terbit'}">${e.status === 'draft' ? 'Draf' : locked ? 'Sudah dibuka' : 'Terbit'}</span></li>`;
          })}</ul>` : ''}
          ${cv.state === 'kosong' ? html`<p class="pt-hint muted">Belum ada ujian untuk minggu ini.</p>` : ''}
        </li>`;
      })}</ul>`}
    </div>`;
  },
};

action('prep-filter', (el) => {
  const v = (el as HTMLSelectElement).value;
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (v) q.set('topik', v); else q.delete('topik');
  q.delete('_');
  go('#/persiapan' + (q.toString() ? '?' + q : ''));
});

action('prep-ics', (el) => {
  const wk = el.dataset.wk!;
  const s = getState();
  const items = s.exams.filter((e) => e.status === 'published' && !e.archived && examWeek(e) === wk).map((e) => ({ exam: e, topic: topicById(e.topicId) }));
  downloadBlob(`weexam-${wk}.ics`, new Blob([buildIcs(items)], { type: 'text/calendar' }));
  toast(`${items.length} ujian diekspor ke kalender.`);
});

/** Salin ujian terbaru tiap topik (yang belum punya ujian di minggu target) menjadi draf. */
export async function duplicateExam(src: Exam, wk: string): Promise<Exam> {
  const s = getState();
  const sch = defaultSchedule(wk, s.settings.defaultTime, src.durationMin);
  const atts: FileRef[] = [];
  for (const f of src.attachments) {
    const b = await getBlob(f.id);
    if (b) atts.push(await storeFile(b, f.name));
  }
  const now = new Date().toISOString();
  const copy: Exam = {
    ...structuredClone(src), id: uid(), seq: Math.max(0, ...s.exams.filter((e) => e.topicId === src.topicId).map((e) => e.seq)) + 1, ...sch,
    questions: src.questions.map((q) => ({ ...structuredClone(q), id: uid() })), attachments: atts, status: 'draft', archived: false, evaluatedAt: undefined, createdAt: now, updatedAt: now,
  };
  copy.name = src.name.replace(/\s*#\d+$/, '') + ` #${copy.seq}`;
  saveExam(copy);
  return copy;
}

action('prep-copy-all', async (el) => {
  const wk = el.dataset.wk!;
  const s = getState();
  let n = 0;
  for (const t of missingTopics(s, wk)) {
    if (coverage(s, t, wk).exams.length) continue;
    const last = s.exams.filter((e) => e.topicId === t.id && e.status === 'published').sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
    if (last) {
      await duplicateExam(last, wk);
      n++;
    }
  }
  toast(n ? `${n} draf dibuat dari ujian terakhir. Periksa lalu terbitkan.` : 'Tidak ada ujian sebelumnya yang bisa disalin.', n ? 'ok' : 'warn');
});

// ====================================================================== Editor ujian
type Tab = 'dasar' | 'jadwal' | 'soal' | 'berkas' | 'nilai';
const TABS: { k: Tab; label: string }[] = [
  { k: 'dasar', label: 'Dasar' },
  { k: 'jadwal', label: 'Jadwal' },
  { k: 'soal', label: 'Soal' },
  { k: 'berkas', label: 'Berkas' },
  { k: 'nilai', label: 'Penilaian' },
];

let draft: Exam | null = null;
let tab: Tab = 'dasar';
let windowTouched = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let isNew = false;
let existed = false;

function blankQuestion(type: QType): Question {
  const base = { id: uid(), type, text: '', points: 10 } as Question;
  if (type === 'pg') return { ...base, options: ['', '', '', ''], correct: 0 };
  if (type === 'isian') return { ...base, accepted: [] };
  return { ...base, key: '' };
}

function newExam(topicId: string, wk: string): Exam {
  const s = getState();
  const sch = defaultSchedule(wk, s.settings.defaultTime, s.settings.defaultDuration);
  const topic = topicById(topicId);
  const seq = Math.max(0, ...s.exams.filter((e) => e.topicId === topicId).map((e) => e.seq)) + 1;
  const now = new Date().toISOString();
  return {
    id: uid(), topicId, seq, name: topic ? `${topic.name} #${seq}` : '', rules: '', durationMin: s.settings.defaultDuration, ...sch,
    allowMakeup: true, makeupPenaltyPct: s.settings.defaultPenalty, passingScore: s.settings.gradeMin.C, questions: [], attachments: [], status: 'draft',
    createdAt: now, updatedAt: now,
  };
}

function isLocked(e: Exam): boolean {
  return e.status === 'published' && Date.now() >= new Date(e.scheduledAt).getTime();
}

function validate(e: Exam): string[] {
  const errs: string[] = [];
  if (!e.topicId) errs.push('Pilih topik.');
  if (!e.name.trim()) errs.push('Beri nama ujian.');
  const open = new Date(e.scheduledAt).getTime();
  const reg = new Date(e.regularUntil).getTime();
  const close = new Date(e.makeupUntil).getTime();
  if (!(open > Date.now())) errs.push('Jadwal pembukaan sudah lewat. Pilih waktu yang akan datang.');
  if (e.durationMin < 1) errs.push('Durasi minimal 1 menit.');
  if (reg < open + e.durationMin * 60_000) errs.push('Batas reguler harus memberi cukup waktu setelah ujian dibuka.');
  if (e.allowMakeup && close <= reg) errs.push('Batas susulan harus setelah batas reguler.');
  if (!e.allowMakeup && close < reg) errs.push('Waktu tutup tidak boleh sebelum batas reguler.');
  if (e.questions.length === 0 && e.attachments.length === 0) errs.push('Tambahkan soal atau unggah berkas ujian.');
  e.questions.forEach((q, i) => {
    const n = `Soal ${i + 1}`;
    if (!q.text.trim()) errs.push(`${n}: teks soal kosong.`);
    if (!(q.points > 0)) errs.push(`${n}: poin harus lebih dari 0.`);
    if (q.type === 'pg') {
      const filled = (q.options ?? []).filter((o) => o.trim());
      if (filled.length < 2) errs.push(`${n}: isi minimal dua opsi.`);
      if (!(q.options ?? [])[q.correct ?? -1]?.trim()) errs.push(`${n}: pilih kunci jawaban yang terisi.`);
    }
    if (q.type === 'isian' && !(q.accepted ?? []).some((a) => a.trim())) errs.push(`${n}: isi minimal satu jawaban yang diterima.`);
  });
  return errs;
}

function cleanDraft(e: Exam): Exam {
  const c = structuredClone(e);
  c.questions.forEach((q) => {
    if (q.type === 'pg') {
      const opts = q.options ?? [];
      const keep: number[] = [];
      opts.forEach((o, i) => o.trim() && keep.push(i));
      q.correct = Math.max(0, keep.indexOf(q.correct ?? 0));
      q.options = keep.map((i) => opts[i].trim());
    }
    q.text = q.text.trim();
    if (q.type === 'isian') q.accepted = (q.accepted ?? []).map((a) => a.trim()).filter(Boolean);
  });
  return c;
}

function persist(silent = true) {
  if (!draft || isLocked(draft)) return;
  const hasContent = draft.questions.length > 0 || draft.attachments.length > 0 || draft.rules.trim() !== '' || existed;
  if (!hasContent) return;
  saveExam(draft);
  existed = true;
  const ind = $('#ed-ind');
  if (ind && silent) ind.textContent = `Tersimpan ${fmt.time(new Date())}`;
}

function queueAutosave() {
  const ind = $('#ed-ind');
  if (ind) ind.textContent = 'Menyimpan…';
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => persist(), 700);
}

function setPath(o: any, path: string, v: unknown) {
  const ks = path.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
  cur[ks[ks.length - 1]] = v;
}

function weekInfo(e: Exam): Raw {
  const wk = examWeek(e);
  const cur = weekKey(new Date());
  return html`<p class="hint">Masuk siklus ${weekRangeLabel(wk)}${wk < cur ? ' (sudah berlalu)' : wk === cur ? ' (minggu ini)' : ''}. Susulan standar sampai Rabu 23:59.</p>`;
}

function renderTab() {
  if (!draft) return;
  const e = draft;
  const s = getState();
  $$<HTMLElement>('#ed-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
  const body = $('#ed-body')!;
  let out: Raw;
  if (tab === 'dasar') {
    const prevStudy = s.evaluations.flatMap((ev) => (ev.topicId === e.topicId ? ev.study.filter((x) => !x.done) : []));
    out = html`<div class="form">
      <label class="fld"><span>Topik</span>${topicSelect(e.topicId, 'topicId', false, 'data-change="ed-field" data-f="topicId" data-topic="1"')}</label>
      <div class="row2"><label class="fld"><span>Nama ujian</span><input data-input="ed-field" data-f="name" value="${e.name}" maxlength="80" placeholder="Mis. Struktur Data #5" /></label>
      <label class="fld"><span>Ujian ke-</span><input type="number" min="1" data-input="ed-field" data-f="seq" data-n="1" value="${e.seq}" /></label></div>
      <label class="fld"><span>Ketentuan ujian</span><textarea rows="5" data-input="ed-field" data-f="rules" placeholder="Aturan yang berlaku saat mengerjakan, mis. buka catatan, durasi, referensi yang boleh dipakai">${e.rules}</textarea></label>
      ${prevStudy.length ? html`<div class="callout"><strong>Materi dari Evaluasi yang belum selesai</strong><ul>${prevStudy.slice(0, 5).map((x) => html`<li>${x.text}</li>`)}</ul><small class="muted">Pertimbangkan masukkan ke soal minggu ini.</small></div>` : ''}
    </div>`;
  } else if (tab === 'jadwal') {
    out = html`<div class="form">
      <div class="row2"><label class="fld"><span>Dibuka pada</span><input type="datetime-local" data-input="ed-field" data-f="scheduledAt" data-dt="1" value="${toLocalInput(e.scheduledAt)}" /><small>Tanggal dan jam mengikuti kalender perangkatmu.</small></label>
      <label class="fld"><span>Durasi mengerjakan (menit)</span><input type="number" min="1" max="600" data-input="ed-field" data-f="durationMin" data-n="1" value="${e.durationMin}" /></label></div>
      <div class="row2"><label class="fld"><span>Batas pengerjaan reguler</span><input id="f-reg" type="datetime-local" data-input="ed-field" data-f="regularUntil" data-dt="1" data-win="1" value="${toLocalInput(e.regularUntil)}" /></label>
      <label class="fld"><span>Ditutup (batas susulan)</span><input id="f-close" type="datetime-local" data-input="ed-field" data-f="makeupUntil" data-dt="1" data-win="1" value="${toLocalInput(e.makeupUntil)}" /></label></div>
      <label class="check"><input type="checkbox" data-change="ed-field" data-f="allowMakeup" data-bool="1" ${e.allowMakeup ? raw('checked') : ''} /><span>Izinkan ujian susulan sampai waktu tutup</span></label>
      <div id="wk-info">${weekInfo(e)}</div>
      <p class="hint">Setelah waktu tutup, ujian terkunci. Jika tidak dikerjakan, nilainya 0 dan memengaruhi skor topik dan IP.</p>
    </div>`;
  } else if (tab === 'soal') {
    out = html`<div class="form">
      <div class="q-tools"><span class="muted">${e.questions.length} soal · ${maxPoints(e)} poin</span>
        <span class="grow"></span><button class="btn sm" data-act="q-import">${icon('copy', 16)} Tempel banyak soal</button></div>
      <div id="qlist">${e.questions.length === 0 ? html`<p class="muted pad">Belum ada soal. Tambahkan di bawah, atau unggah berkas ujian di tab Berkas.</p>` : e.questions.map((q, i) => qEditor(q, i, e.questions.length))}</div>
      <div class="q-add"><button class="btn" data-act="q-add" data-t="pg">${icon('plus', 16)} Pilihan ganda</button><button class="btn" data-act="q-add" data-t="isian">${icon('plus', 16)} Isian singkat</button><button class="btn" data-act="q-add" data-t="esai">${icon('plus', 16)} Esai</button></div>
    </div>`;
  } else if (tab === 'berkas') {
    out = html`<div class="form">
      <div class="fld"><span>Berkas ujian</span><small>PDF, dokumen, gambar, atau arsip yang dibaca saat ujian. Disimpan di perangkat ini.</small>
        <div id="att">${fileList(e.attachments, true, 'ed-file-rm')}</div>
        <label class="btn">${icon('upload', 18)} Unggah berkas<input type="file" multiple hidden data-change="ed-upload" /></label></div>
      <label class="check"><input type="checkbox" data-change="ed-field" data-f="acceptUploads" data-bool="1" ${e.acceptUploads ? raw('checked') : ''} /><span>Peserta mengunggah berkas jawaban atau proyek saat mengerjakan</span></label>
      <p class="hint">Ujian tanpa soal (hanya berkas atau proyek) dikoreksi manual dengan nilai 0–100.</p>
    </div>`;
  } else {
    out = html`<div class="form">
      <div class="row2"><label class="fld"><span>Nilai lulus (KKM)</span><input type="number" min="0" max="100" data-input="ed-field" data-f="passingScore" data-n="1" value="${e.passingScore}" /><small>Penanda di evaluasi. Skor topik tetap memakai skala A–E di Pengaturan.</small></label>
      <label class="fld"><span>Potongan nilai susulan (%)</span><input type="number" min="0" max="100" data-input="ed-field" data-f="makeupPenaltyPct" data-n="1" value="${e.makeupPenaltyPct}" /><small>Dikurangkan bila dikerjakan setelah batas reguler.</small></label>
      <label class="fld"><span>Bobot ujian</span><input type="number" min="0.5" max="5" step="0.5" data-input="ed-field" data-f="weight" data-n="1" value="${e.weight ?? 1}" /><small>Pengaruh ujian ini pada rata-rata mingguan topik (1 = normal, 2 = dua kali).</small></label></div>
      <div class="callout"><strong>Cara nilai dihitung</strong><p class="muted">Nilai = poin diperoleh ÷ total poin (${maxPoints(e) || '–'}) × 100. Pilihan ganda dan isian dinilai otomatis, esai dikoreksi sendiri dengan rubrik.</p></div>
    </div>`;
  }
  body.innerHTML = out.s;
}

function qEditor(q: Question, i: number, n: number): Raw {
  const p = `questions.${i}`;
  return html`<div class="qed" data-i="${i}">
    <div class="qed-h"><span class="qn">${i + 1}</span>
      <select data-change="q-type" data-i="${i}" aria-label="Jenis soal"><option value="pg" ${q.type === 'pg' ? raw('selected') : ''}>Pilihan ganda</option><option value="isian" ${q.type === 'isian' ? raw('selected') : ''}>Isian singkat</option><option value="esai" ${q.type === 'esai' ? raw('selected') : ''}>Esai</option></select>
      <label class="pts-i">Poin <input type="number" min="1" data-input="ed-field" data-f="${p}.points" data-n="1" value="${q.points}" /></label>
      <span class="grow"></span>
      <button class="icon-btn sm" data-act="q-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan">${icon('down', 16, 'flip')}</button>
      <button class="icon-btn sm" data-act="q-move" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Turunkan">${icon('down', 16)}</button>
      <button class="icon-btn sm" data-act="q-del" data-i="${i}" aria-label="Hapus soal">${icon('trash', 16)}</button></div>
    <textarea rows="2" data-input="ed-field" data-f="${p}.text" placeholder="Tulis soal">${q.text}</textarea>
    ${q.type === 'pg' ? html`<div class="oplist">${(q.options ?? []).map((o, k) => html`<div class="op"><input type="radio" name="c${i}" ${q.correct === k ? raw('checked') : ''} data-change="q-correct" data-i="${i}" data-k="${k}" aria-label="Kunci ${String.fromCharCode(65 + k)}" /><b>${String.fromCharCode(65 + k)}</b><input data-input="ed-field" data-f="${p}.options.${k}" value="${o}" placeholder="Opsi ${String.fromCharCode(65 + k)}" />${(q.options ?? []).length > 2 ? html`<button class="icon-btn sm" data-act="op-del" data-i="${i}" data-k="${k}" aria-label="Hapus opsi">${icon('x', 14)}</button>` : ''}</div>`)}
        ${(q.options ?? []).length < 6 ? html`<button class="link" data-act="op-add" data-i="${i}">+ Tambah opsi</button>` : ''}<small class="muted">Pilih lingkaran untuk menandai kunci jawaban.</small></div>`
      : q.type === 'isian' ? html`<label class="fld"><span>Jawaban yang diterima <em>(satu per baris)</em></span><textarea rows="2" data-input="q-accepted" data-i="${i}" placeholder="Variasi jawaban benar">${(q.accepted ?? []).join('\n')}</textarea></label>`
      : html`<label class="fld"><span>Kunci / rubrik koreksi</span><textarea rows="2" data-input="ed-field" data-f="${p}.key" placeholder="Poin yang harus ada pada jawaban yang baik">${q.key ?? ''}</textarea></label>`}
  </div>`;
}

action('ed-field', (el) => {
  if (!draft) return;
  const inp = el as HTMLInputElement;
  const f = inp.dataset.f!;
  let v: unknown;
  if (inp.dataset.bool) v = inp.checked;
  else if (inp.dataset.n) v = Number(inp.value);
  else if (inp.dataset.dt) v = inp.value ? fromLocalInput(inp.value) : draft.scheduledAt;
  else v = inp.value;
  setPath(draft, f, v);
  if (f === 'scheduledAt' && !windowTouched) {
    Object.assign(draft, scheduleFor(draft.scheduledAt));
    const reg = $<HTMLInputElement>('#f-reg'), close = $<HTMLInputElement>('#f-close');
    if (reg) reg.value = toLocalInput(draft.regularUntil);
    if (close) close.value = toLocalInput(draft.makeupUntil);
  }
  if (inp.dataset.win) windowTouched = true;
  if (f === 'scheduledAt' || inp.dataset.win) {
    const wi = $('#wk-info');
    if (wi) wi.innerHTML = weekInfo(draft).s;
  }
  if (inp.dataset.topic) {
    const t = topicById(draft.topicId);
    const old = /#\d+$/;
    if (t && (!draft.name || old.test(draft.name))) draft.name = `${t.name} #${draft.seq}`;
    renderTab();
  }
  if (f.endsWith('.points') || f === 'allowMakeup') {
    const info = $('.q-tools .muted');
    if (info) info.textContent = `${draft.questions.length} soal · ${maxPoints(draft)} poin`;
  }
  queueAutosave();
});

action('q-accepted', (el) => {
  if (!draft) return;
  draft.questions[Number(el.dataset.i)].accepted = (el as HTMLTextAreaElement).value.split('\n');
  queueAutosave();
});
action('q-type', (el) => {
  if (!draft) return;
  const i = Number(el.dataset.i);
  const old = draft.questions[i];
  const nq = blankQuestion((el as HTMLSelectElement).value as QType);
  draft.questions[i] = { ...nq, id: old.id, text: old.text, points: old.points };
  renderTab();
  queueAutosave();
});
action('q-correct', (el) => {
  if (!draft) return;
  draft.questions[Number(el.dataset.i)].correct = Number(el.dataset.k);
  queueAutosave();
});
action('q-add', (el) => {
  if (!draft) return;
  draft.questions.push(blankQuestion(el.dataset.t as QType));
  renderTab();
  queueAutosave();
  const last = $$('.qed').pop();
  last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('textarea', last!)?.focus({ preventScroll: true });
});
action('q-del', (el) => {
  if (!draft) return;
  draft.questions.splice(Number(el.dataset.i), 1);
  renderTab();
  queueAutosave();
});
action('q-move', (el) => {
  if (!draft) return;
  const i = Number(el.dataset.i), d = Number(el.dataset.d);
  const [q] = draft.questions.splice(i, 1);
  draft.questions.splice(i + d, 0, q);
  renderTab();
  queueAutosave();
});
action('op-add', (el) => {
  if (!draft) return;
  (draft.questions[Number(el.dataset.i)].options ??= []).push('');
  renderTab();
  queueAutosave();
});
action('op-del', (el) => {
  if (!draft) return;
  const q = draft.questions[Number(el.dataset.i)];
  const k = Number(el.dataset.k);
  q.options!.splice(k, 1);
  if ((q.correct ?? 0) >= k) q.correct = Math.max(0, (q.correct ?? 0) - (q.correct === k ? 0 : 1));
  renderTab();
  queueAutosave();
});
action('ed-upload', async (el) => {
  if (!draft) return;
  const files = [...((el as HTMLInputElement).files ?? [])];
  const refs = await Promise.all(files.map((f) => storeFile(f)));
  draft.attachments.push(...refs);
  renderTab();
  persist();
  toast(`${refs.length} berkas ditambahkan.`);
});
action('ed-file-rm', async (el) => {
  if (!draft) return;
  draft.attachments = draft.attachments.filter((f) => f.id !== el.dataset.id);
  await deleteBlob(el.dataset.id!);
  renderTab();
  persist();
});

// ---- Tempel banyak soal
export function parseQuestions(text: string, points = 10): Question[] {
  const out: Question[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const stem: string[] = [];
    const opts: { t: string; ok: boolean }[] = [];
    let ans: string | null = null;
    for (const l of lines) {
      const m = l.match(/^(\*?)\s*([a-fA-F])[.)]\s+(.+)$/);
      const a = l.match(/^(?:jawaban|kunci|answer)\s*[:=]\s*(.+)$/i);
      if (m) opts.push({ t: m[3].trim(), ok: m[1] === '*' });
      else if (a) ans = a[1].trim();
      else stem.push(l.replace(/^\d+[.)]\s*/, ''));
    }
    const q = stem.join(' ').trim();
    if (!q) continue;
    if (opts.length >= 2) {
      let correct = opts.findIndex((o) => o.ok);
      if (correct < 0 && ans) {
        const idx = ans.trim().toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) correct = idx;
      }
      out.push({ id: uid(), type: 'pg', text: q, points, options: opts.map((o) => o.t), correct: Math.max(0, correct) });
    } else if (ans) out.push({ id: uid(), type: 'isian', text: q, points, accepted: ans.split('|').map((x) => x.trim()) });
    else out.push({ id: uid(), type: 'esai', text: q, points, key: '' });
  }
  return out;
}

action('q-import', () => {
  openModal({
    title: 'Tempel banyak soal',
    wide: true,
    body: html`<form data-submit="q-import-go" class="form">
      <p class="muted">Pisahkan soal dengan baris kosong. Tandai kunci pilihan ganda dengan tanda bintang.</p>
      <pre class="sample">1. Ibu kota Indonesia adalah…
a. Bandung
*b. Jakarta
c. Surabaya

2. Singkatan dari CPU?
Jawaban: Central Processing Unit

3. Jelaskan perbedaan stack dan queue.</pre>
      <textarea name="t" rows="10" required placeholder="Tempel soal di sini"></textarea>
      <label class="fld inline"><span>Poin per soal</span><input type="number" name="p" min="1" value="10" /></label>
      <div class="modal-f"><button type="button" class="btn" data-act="modal-close">Batal</button><button class="btn primary">Tambahkan soal</button></div></form>`,
  });
});
action('q-import-go', (form) => {
  if (!draft) return;
  const fd = new FormData(form as HTMLFormElement);
  const qs = parseQuestions(String(fd.get('t')), Number(fd.get('p')) || 10);
  if (!qs.length) return toast('Tidak ada soal yang terbaca.', 'warn');
  draft.questions.push(...qs);
  closeModal();
  tab = 'soal';
  renderTab();
  queueAutosave();
  toast(`${qs.length} soal ditambahkan.`);
});

action('ed-tab', (el) => {
  tab = el.dataset.k as Tab;
  renderTab();
});

action('ed-save', () => {
  if (!draft) return;
  persist(false);
  toast('Draf disimpan.');
});

action('ed-publish', () => {
  if (!draft) return;
  const c = cleanDraft(draft);
  const errs = validate(c);
  if (errs.length) {
    openModal({ title: 'Belum bisa diterbitkan', body: html`<ul class="errs">${errs.map((x) => html`<li>${x}</li>`)}</ul><div class="modal-f"><button class="btn primary" data-act="modal-close">Perbaiki</button></div>` });
    return;
  }
  c.status = 'published';
  saveExam(c);
  existed = true;
  draft = null;
  toast('Ujian diterbitkan ke Ujian Mingguan.');
  go(hrefWith('#/persiapan', { minggu: examWeek(c) }));
});

action('ed-unpublish', () => {
  if (!draft) return;
  draft.status = 'draft';
  persist(false);
  go(`#/persiapan/ujian/${draft.id}`);
  toast('Ditarik kembali menjadi draf.');
});

action('ed-delete', async () => {
  if (!draft) return;
  const id = draft.id;
  const ok = await confirmDialog({ title: 'Hapus ujian ini?', message: 'Soal dan berkas ujian ikut terhapus.', confirm: 'Hapus', danger: true });
  if (!ok) return;
  const wk = examWeek(draft);
  draft = null;
  if (examById(id)) await removeExam(id);
  toast('Ujian dihapus.');
  go(hrefWith('#/persiapan', { minggu: wk }));
});

action('ed-clone', async () => {
  if (!draft) return;
  const wk = shiftWeek(examWeek(draft) > weekKey(new Date()) ? examWeek(draft) : weekKey(new Date()), 1);
  const c = await duplicateExam(draft, wk);
  toast('Disalin sebagai draf untuk minggu berikutnya.');
  go(`#/persiapan/ujian/${c.id}`);
});

export const editorPage = (id: string): Page => ({
  title: 'Ujian',
  nav: 'persiapan',
  static: true,
  subtitle: () => '',
  render(ctx) {
    const s = getState();
    const found = id === 'baru' ? undefined : examById(id);
    if (id !== 'baru' && !found) return html`<div class="wrap">${emptyState('Ujian tidak ditemukan', 'Mungkin sudah dihapus.', html`<a class="btn primary" href="#/persiapan">Kembali</a>`)}</div>`;
    if (id === 'baru') {
      if (s.topics.length === 0) return html`<div class="wrap">${emptyState('Tambahkan topik dulu', 'Ujian selalu terhubung ke sebuah topik.', html`<a class="btn primary" href="#/dashboard?baru=1">Tambah topik</a>`)}</div>`;
      const topicId = ctx.query.get('topik') ?? s.topics[0].id;
      const wk = ctx.query.get('minggu') ?? prepTargetWeek(ctx.now);
      draft = newExam(topicId, wk);
      isNew = true;
      existed = false;
    } else if (!draft || draft.id !== id) {
      draft = structuredClone(found!);
      isNew = false;
      existed = true;
    }
    windowTouched = false;
    tab = 'dasar';
    const e = draft;
    if (isLocked(e)) {
      const t = topicById(e.topicId);
      return html`<div class="wrap narrow"><a class="crumb" href="#/persiapan?minggu=${examWeek(e)}">${icon('back', 18)} Persiapan Ujian</a>
        <section class="intro"><span class="chip s-terbuka">Sudah dibuka</span><h2>${e.name}</h2><p class="muted">${t?.name} · dibuka ${fmt.dateTime(e.scheduledAt)}</p>
        <p>Ujian yang sudah dibuka tidak bisa diubah supaya penilaiannya adil. Kamu bisa menyalinnya sebagai draf untuk minggu berikutnya.</p>
        <dl class="facts"><div><dt>Isi</dt><dd>${e.questions.length} soal · ${maxPoints(e)} poin</dd></div><div><dt>Durasi</dt><dd>${e.durationMin} menit</dd></div><div><dt>Ditutup</dt><dd>${fmt.dateTime(e.makeupUntil)}</dd></div></dl>
        <div class="btns"><button class="btn primary" data-act="ed-clone">${icon('copy', 18)} Salin untuk minggu depan</button></div></section></div>`;
    }
    return html`<div class="wrap editor">
      <a class="crumb" href="#/persiapan?minggu=${examWeek(e)}">${icon('back', 18)} Persiapan Ujian</a>
      <div class="ed-bar"><div class="ed-t"><h2>${isNew ? 'Ujian baru' : e.name || 'Ujian'}</h2><span class="muted" id="ed-ind">${e.status === 'published' ? 'Terbit · bisa diubah sampai dibuka' : isNew ? 'Belum disimpan' : 'Draf'}</span></div>
        <div class="ed-a">${!isNew ? html`<button class="btn danger-o" data-act="ed-delete">${icon('trash', 16)} Hapus</button>` : ''}
          ${e.status === 'published' ? html`<button class="btn" data-act="ed-unpublish">Tarik jadi draf</button>` : html`<button class="btn" data-act="ed-save">Simpan draf</button>`}
          <button class="btn primary" data-act="ed-publish">${e.status === 'published' ? 'Simpan perubahan' : 'Terbitkan'}</button></div></div>
      <div class="tabs" id="ed-tabs" role="tablist">${TABS.map((t) => html`<button role="tab" data-act="ed-tab" data-k="${t.k}">${t.label}</button>`)}</div>
      <div id="ed-body" class="ed-body"></div>
    </div>`;
  },
  mount() {
    renderTab();
  },
  unmount() {
    clearTimeout(autoTimer);
    if (draft && !isLocked(draft)) persist();
    draft = null;
  },
});
void [esc, mutate, raw];
