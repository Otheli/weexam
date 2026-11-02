import { attemptDeadline, attemptFor, examStatus, examWeek, canStart, type ExamStatus } from '../derive';
import { autoGradeAttempt, computeFinal, letterOf, maxPoints, clamp } from '../grading';
import { buildIcs, downloadBlob } from '../notify';
import { letterOf as letterOf2 } from '../grading';
import { go, hrefWith, type Page } from '../router';
import {
  buildReview, examById, getState, gradeAttempt, removeExam, saveAnswer, saveAttemptNote, sendToEvaluation, startAttempt, storeFile, submitAttempt, mutate, deleteBlob, topicById,
} from '../store';
import { PHASE_LABEL, clock, fmt, fmtDuration, phaseOf, shiftWeek, weekKey, weekRangeLabel } from '../time';
import type { Exam, Question } from '../types';
import { $, $$, action, esc, html, icon, raw, type Raw } from '../ui/dom';
import { fileList, openedFiles } from '../ui/files';
import { reviewHtml } from '../exportDoc';
import { closeModal, confirmDialog, emptyState, gradeBadge, openModal, statusChip, toast, topicSelect } from '../ui/kit';

// ====================================================================== Daftar agenda
const GROUPS: { key: string; title: string; match: ExamStatus[] }[] = [
  { key: 'aksi', title: 'Perlu dikerjakan', match: ['berjalan', 'terbuka', 'susulan'] },
  { key: 'koreksi', title: 'Menunggu koreksi', match: ['menunggu-koreksi'] },
  { key: 'jadwal', title: 'Terjadwal', match: ['terjadwal'] },
  { key: 'selesai', title: 'Selesai', match: ['dinilai'] },
  { key: 'tutup', title: 'Ditutup', match: ['terlewat'] },
];

function rowFor(e: Exam, now: Date): Raw {
  const s = getState();
  const at = attemptFor(s, e.id);
  const st = examStatus(e, at, now);
  const t = topicById(e.topicId);
  const sub: Raw =
    st === 'terjadwal' ? html`Dibuka <span data-cd="${e.scheduledAt}" data-pre="dalam "></span> · ${fmt.dateTime(e.scheduledAt)}`
    : st === 'terbuka' ? html`Reguler sampai ${fmt.dateTime(e.regularUntil)} · ${e.durationMin} mnt`
    : st === 'susulan' ? html`Susulan ditutup ${fmt.dateTime(e.makeupUntil)}${e.makeupPenaltyPct ? ` · nilai −${e.makeupPenaltyPct}%` : ''}`
    : st === 'berjalan' && at ? html`Sisa waktu <span data-cd="${new Date(attemptDeadline(e, at)).toISOString()}"></span>`
    : st === 'menunggu-koreksi' ? html`Dikirim ${fmt.dateTime(at!.submittedAt!)}${at?.auto ? ' (otomatis)' : ''}`
    : st === 'dinilai' ? html`Dikoreksi ${fmt.dateTime(at!.gradedAt!)}${at!.isMakeup && at!.penaltyPct ? ` · susulan −${at!.penaltyPct}%` : ''}`
    : html`Ditutup ${fmt.dateTime(e.makeupUntil)} · tanpa jawaban, nilai 0`;
  const score = st === 'dinilai' ? at!.finalScore ?? 0 : st === 'terlewat' ? 0 : null;
  const primary: Raw =
    st === 'terbuka' || st === 'susulan' ? html`<a class="btn primary" href="#/ujian/kerjakan/${e.id}">Kerjakan</a>`
    : st === 'berjalan' ? html`<a class="btn primary" href="#/ujian/kerjakan/${e.id}">Lanjutkan</a>`
    : st === 'menunggu-koreksi' ? html`<a class="btn primary" href="#/ujian/koreksi/${e.id}">Koreksi</a>`
    : st === 'dinilai' ? (e.evaluatedAt ? html`<a class="btn" href="#/evaluasi">Lihat di Evaluasi</a>` : html`<button class="btn" data-act="ex-eval" data-id="${e.id}">Kirim ke Evaluasi</button>`)
    : st === 'terjadwal' ? html`<span class="locked">${icon('lock', 16)} Terkunci</span>`
    : html`<span class="locked">${icon('lock', 16)} Ditutup</span>`;
  return html`<li class="row ex ${st === 'terlewat' ? 'dim' : ''}">
    <i class="tdot" style="--c:${t?.color}"></i>
    <div class="row-m"><strong>${e.name}</strong><small class="muted">${t?.name} · ${sub}</small></div>
    ${score !== null ? html`<span class="row-n">${gradeBadge(letterOf(score, s.settings.gradeMin), 'sm')} ${score.toFixed(1)}</span>` : statusChip(st)}
    <div class="row-a">${primary}
      <details class="more"><summary class="icon-btn" aria-label="Opsi lainnya">${icon('more', 20)}</summary>
        <div class="menu">
          ${['menunggu-koreksi', 'dinilai', 'terlewat'].includes(st) ? html`<a href="#/ujian/tinjau/${e.id}">${icon('eye', 18)} Lihat soal &amp; jawaban</a>` : ''}
          ${st === 'terlewat' && !e.evaluatedAt ? html`<button data-act="ex-eval" data-id="${e.id}">${icon('evaluasi', 18)} Kirim ke Evaluasi</button>` : ''}
          ${st === 'dinilai' && !e.evaluatedAt ? html`<a href="#/ujian/koreksi/${e.id}">${icon('pencil', 18)} Koreksi ulang</a>` : ''}
          <button data-act="ex-ics" data-id="${e.id}">${icon('calplus', 18)} Tambah ke kalender</button>
          <button class="danger-t" data-act="ex-del" data-id="${e.id}">${icon('trash', 18)} ${st === 'terjadwal' && !at ? 'Hapus agenda' : 'Sembunyikan agenda'}</button>
        </div></details>
    </div></li>`;
}

export const ujianPage: Page = {
  title: 'Ujian Mingguan',
  nav: 'ujian',
  subtitle: (c) => `Siklus ${weekRangeLabel(c.query.get('minggu') ?? weekKey(c.now))}`,
  render(ctx) {
    const s = getState();
    const cur = weekKey(ctx.now);
    const wk = ctx.query.get('minggu') ?? cur;
    const topic = ctx.query.get('topik') ?? '';
    const exams = s.exams.filter((e) => e.status === 'published' && !e.archived && examWeek(e) === wk && (!topic || e.topicId === topic));
    const list = exams.map((e) => ({ e, st: examStatus(e, attemptFor(s, e.id), ctx.now) }));
    const q = (w: string) => hrefWith('#/ujian', { minggu: w === cur ? undefined : w, topik: topic || undefined });
    const body = GROUPS.map((g) => ({ g, items: list.filter((x) => g.match.includes(x.st)).sort((a, b) => new Date(a.e.scheduledAt).getTime() - new Date(b.e.scheduledAt).getTime()) })).filter((x) => x.items.length);
    return html`<div class="wrap">
      <div class="toolbar">
        <div class="weeknav"><a class="icon-btn" href="${q(shiftWeek(wk, -1))}" aria-label="Minggu sebelumnya">${icon('left', 20)}</a><strong>${weekRangeLabel(wk)}</strong><a class="icon-btn" href="${q(shiftWeek(wk, 1))}" aria-label="Minggu berikutnya">${icon('right', 20)}</a>${wk !== cur ? html`<a class="btn sm" href="${q(cur)}">Minggu ini</a>` : html`<span class="chip p-${phaseOf(ctx.now)}">${PHASE_LABEL[phaseOf(ctx.now)]}</span>`}</div>
        <div class="tb-r"><label class="sel">${topicSelect(topic, 'topik', true, 'data-change="flt-topik"')}</label></div>
      </div>
      ${list.length === 0
        ? emptyState('Belum ada ujian di minggu ini', s.topics.length ? 'Ujian yang diterbitkan dari Persiapan Ujian muncul di sini pada jadwalnya.' : 'Tambahkan topik di Dashboard lebih dulu.', html`<a class="btn primary" href="#/persiapan">Buka Persiapan Ujian</a>`)
        : body.map(({ g, items }) => html`<section class="block"><h3>${g.title} <span class="count">${items.length}</span></h3><ul class="rows">${items.map((x) => rowFor(x.e, ctx.now))}</ul></section>`)}
      <p class="hint">${icon('lock', 14)} Ujian yang sudah melewati batas susulan terkunci dan tidak bisa dikerjakan lagi. Menu lain tetap terbuka.</p>
    </div>`;
  },
};

action('flt-topik', (el) => {
  const v = (el as HTMLSelectElement).value;
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (v) q.set('topik', v); else q.delete('topik');
  q.delete('_');
  go('#/ujian' + (q.toString() ? '?' + q : ''));
});

action('ex-eval', (el) => {
  const ev = sendToEvaluation(el.dataset.id!);
  if (ev) {
    toast('Dikirim ke Evaluasi Ujian.');
    go(`#/evaluasi/${ev.id}`);
  }
});

action('ex-ics', (el) => {
  const e = examById(el.dataset.id);
  if (!e) return;
  downloadBlob(`${e.name.replace(/[^\w-]+/g, '_')}.ics`, new Blob([buildIcs([{ exam: e, topic: topicById(e.topicId) }])], { type: 'text/calendar' }));
  toast('Berkas kalender diunduh. Buka untuk menambah pengingat.');
});

action('ex-del', async (el) => {
  const e = examById(el.dataset.id);
  if (!e) return;
  const at = attemptFor(getState(), e.id);
  const opened = new Date(e.scheduledAt).getTime() <= Date.now() || !!at;
  const ok = await confirmDialog({
    title: opened ? 'Sembunyikan agenda ini?' : 'Hapus agenda ini?',
    message: opened ? 'Ujian sudah dibuka, jadi nilainya tetap dihitung dalam skor topik. Agenda hanya disembunyikan dari daftar.' : 'Ujian belum dibuka dan akan dihapus permanen. Topik ini perlu ujian pengganti untuk minggu tersebut.',
    confirm: opened ? 'Sembunyikan' : 'Hapus',
    danger: !opened,
  });
  if (!ok) return;
  const r = await removeExam(e.id);
  toast(r === 'hidden' ? 'Agenda disembunyikan.' : 'Agenda dihapus.');
});

document.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  $$<HTMLDetailsElement>('details.more[open]').forEach((d) => {
    if (!d.contains(t) || t.closest('.menu button, .menu a')) d.open = false;
  });
});

// ====================================================================== Ruang ujian
let run: { examId: string; attemptId: string; idx: number } | null = null;

function stepsOf(e: Exam): ('q' | 'f')[] {
  return [...e.questions.map(() => 'q' as const), ...(e.acceptUploads || e.questions.length === 0 ? (['f'] as const) : [])];
}

function answered(e: Exam, id: string, q: Question): boolean {
  const a = getState().attempts.find((x) => x.id === id)?.answers[q.id];
  return typeof a === 'number' || (typeof a === 'string' && a.trim() !== '');
}

function introScreen(e: Exam, st: ExamStatus): Raw {
  const t = topicById(e.topicId);
  const makeup = st === 'susulan';
  return html`<div class="wrap narrow">
    <a class="crumb" href="#/ujian">${icon('back', 18)} Ujian Mingguan</a>
    <section class="intro">
      <span class="chip ${makeup ? 's-susulan' : 's-terbuka'}">${makeup ? 'Susulan' : 'Terbuka'}</span>
      <h2>${e.name}</h2><p class="muted">${t?.name} · Ujian ke-${e.seq}</p>
      <dl class="facts">
        <div><dt>Waktu mengerjakan</dt><dd>${e.durationMin} menit, tidak bisa dijeda</dd></div>
        <div><dt>Isi ujian</dt><dd>${e.questions.length ? `${e.questions.length} soal · ${maxPoints(e)} poin` : 'Berkas / proyek'}</dd></div>
        <div><dt>Ditutup</dt><dd>${fmt.dateTime(e.makeupUntil)}</dd></div>
        ${makeup ? html`<div><dt>Potongan susulan</dt><dd>${e.makeupPenaltyPct}% dari nilai</dd></div>` : ''}
      </dl>
      ${e.rules ? html`<div class="rules"><h4>Ketentuan</h4><p>${e.rules}</p></div>` : ''}
      ${e.attachments.length ? html`<div class="rules"><h4>Berkas soal</h4>${fileList(e.attachments)}</div>` : ''}
      <div class="btns"><a class="btn" href="#/ujian">Nanti saja</a><button class="btn primary lg" data-act="run-start" data-id="${e.id}">${icon('play', 18)} Mulai ujian</button></div>
      <p class="hint">Begitu dimulai, waktu terus berjalan walau kamu menutup aplikasi. Jawaban tersimpan otomatis.</p>
    </section></div>`;
}

function notAvailable(title: string, text: string): Raw {
  return html`<div class="wrap narrow"><a class="crumb" href="#/ujian">${icon('back', 18)} Ujian Mingguan</a>${emptyState(title, text, html`<a class="btn primary" href="#/ujian">Kembali ke agenda</a>`)}</div>`;
}

function soalBar(e: Exam): Raw {
  if (!e.attachments.length) return html``;
  const seen = e.attachments.some((f) => openedFiles.has(f.id));
  return html`<div class="soal-bar ${seen ? '' : 'warn'}" id="soal-bar"><div class="sb-h"><strong>Berkas soal</strong><span class="sb-s">${seen ? 'Sudah dibuka' : 'Belum dibuka. Buka dulu agar tidak mengerjakan tanpa melihat soal.'}</span></div>${fileList(e.attachments)}</div>`;
}

addEventListener('weexam:file-opened', () => {
  if (!run) return;
  const e = examById(run.examId);
  const bar = $('#soal-bar');
  if (e && bar) bar.outerHTML = soalBar(e).s;
});

function runnerShell(e: Exam, attemptId: string): Raw {
  const a = getState().attempts.find((x) => x.id === attemptId)!;
  const steps = stepsOf(e);
  return html`<div class="runner">
    <header class="run-top"><div class="run-t"><strong>${e.name}</strong><small class="muted">${topicById(e.topicId)?.name}${a.isMakeup ? ' · susulan' : ''}</small></div>
      <div class="timer" id="run-timer" data-deadline="${new Date(attemptDeadline(e, a)).toISOString()}" aria-live="off" role="timer">--:--</div>
      <a class="btn sm" href="#/ujian" title="Waktu tetap berjalan">Keluar sementara</a>
      <button class="btn primary" data-act="run-submit">Kirim jawaban</button></header>
    <div class="run-body">
      <nav class="qnav" id="qnav" aria-label="Navigasi soal">${steps.map((k, i) => html`<button data-act="run-go" data-i="${i}" aria-label="${k === 'f' ? 'Lampiran' : `Soal ${i + 1}`}">${k === 'f' ? icon('paperclip', 16) : i + 1}</button>`)}</nav>
      <div class="run-main">${soalBar(e)}<section class="qarea" id="qarea"></section></div>
    </div>
    <footer class="run-foot"><button class="btn" data-act="run-prev">${icon('left', 18)} Sebelumnya</button><span class="muted" id="save-ind">Tersimpan otomatis</span><button class="btn" data-act="run-next">Berikutnya ${icon('right', 18)}</button></footer>
  </div>`;
}

function drawStep() {
  if (!run) return;
  const e = examById(run.examId)!;
  const a = getState().attempts.find((x) => x.id === run!.attemptId)!;
  const steps = stepsOf(e);
  const i = clamp(run.idx, 0, steps.length - 1);
  run.idx = i;
  const area = $('#qarea')!;
  if (steps[i] === 'f') {
    area.innerHTML = html`<div class="q"><h3>Lampiran jawaban</h3><p class="muted">${e.questions.length ? 'Opsional.' : 'Unggah berkas jawaban atau hasil proyekmu.'} Berkas disimpan di perangkat ini.</p>
      <div id="up-files">${fileList(a.files, true, 'run-file-rm')}</div>
      <label class="btn">${icon('upload', 18)} Pilih berkas<input type="file" multiple hidden data-change="run-upload" /></label>
      <label class="fld"><span>Catatan untuk koreksi</span><textarea rows="4" data-input="run-note" placeholder="Mis. tautan repositori, asumsi yang dipakai">${a.note}</textarea></label></div>`.s;
  } else {
    const q = e.questions[i];
    const cur = a.answers[q.id];
    area.innerHTML = html`<div class="q"><div class="q-h"><span class="muted">Soal ${i + 1} dari ${e.questions.length}</span><span class="chip">${q.points} poin</span></div>
      <p class="q-t">${q.text}</p>
      ${q.type === 'pg' ? html`<div class="opts" role="radiogroup">${(q.options ?? []).map((o, k) => html`<label class="opt ${cur === k ? 'on' : ''}"><input type="radio" name="q" value="${k}" data-change="run-pick" data-q="${q.id}" ${cur === k ? raw('checked') : ''} /><i>${String.fromCharCode(65 + k)}</i><span>${o}</span></label>`)}</div>`
        : q.type === 'isian' ? html`<input class="in-lg" data-input="run-text" data-q="${q.id}" value="${typeof cur === 'string' ? cur : ''}" placeholder="Tulis jawabanmu" autocomplete="off" />`
        : html`<textarea rows="9" data-input="run-text" data-q="${q.id}" placeholder="Tulis jawabanmu">${typeof cur === 'string' ? cur : ''}</textarea>`}
    </div>`.s;
  }
  $$<HTMLElement>('#qnav button').forEach((b, k) => {
    b.classList.toggle('on', k === i);
    const q = e.questions[k];
    b.classList.toggle('done', !!q && answered(e, a.id, q));
  });
  $('[data-act=run-prev]')!.toggleAttribute('disabled', i === 0);
  $('[data-act=run-next]')!.toggleAttribute('disabled', i === steps.length - 1);
}

function markSaved() {
  const ind = $('#save-ind');
  if (ind) ind.textContent = `Tersimpan ${fmt.time(new Date())}`;
  const e = run && examById(run.examId);
  if (e && run) $$<HTMLElement>('#qnav button').forEach((b, k) => e.questions[k] && b.classList.toggle('done', answered(e, run!.attemptId, e.questions[k])));
}

export const kerjakanPage = (examId: string): Page => ({
  title: 'Ruang Ujian',
  nav: 'ujian',
  static: true,
  focus: true,
  render(ctx) {
    const s = getState();
    const e = examById(examId);
    if (!e || e.status !== 'published') return notAvailable('Ujian tidak ditemukan', 'Agenda ini mungkin sudah dihapus.');
    const at = attemptFor(s, e.id);
    const st = examStatus(e, at, ctx.now);
    if (st === 'berjalan' && at) {
      run = { examId, attemptId: at.id, idx: run?.attemptId === at.id ? run.idx : 0 };
      return runnerShell(e, at.id);
    }
    run = null;
    if (st === 'terbuka' || st === 'susulan') return introScreen(e, st);
    if (st === 'terjadwal') return notAvailable('Ujian belum dibuka', `Dibuka ${fmt.dayDate(e.scheduledAt)} pukul ${fmt.time(e.scheduledAt)}.`);
    if (st === 'terlewat') return notAvailable('Ujian sudah ditutup', 'Batas susulan telah lewat. Ujian ini terkunci dan nilainya 0.');
    return notAvailable('Jawaban sudah dikirim', st === 'menunggu-koreksi' ? 'Lanjutkan ke koreksi dari daftar agenda.' : 'Ujian ini sudah dinilai.');
  },
  mount() {
    if (run) drawStep();
  },
});

action('run-start', (el) => {
  const e = examById(el.dataset.id);
  if (!e) return;
  const st = examStatus(e, undefined, new Date());
  if (!canStart(st)) return toast('Ujian ini tidak bisa dimulai lagi.', 'err');
  startAttempt(e.id);
  go(`#/ujian/kerjakan/${e.id}`);
});
action('run-go', (el) => {
  if (!run) return;
  run.idx = Number(el.dataset.i);
  drawStep();
});
action('run-prev', () => {
  if (!run) return;
  run.idx--;
  drawStep();
});
action('run-next', () => {
  if (!run) return;
  run.idx++;
  drawStep();
});
action('run-pick', (el) => {
  if (!run) return;
  saveAnswer(run.attemptId, el.dataset.q!, Number((el as HTMLInputElement).value));
  $$('.opt').forEach((o) => o.classList.toggle('on', !!$<HTMLInputElement>('input', o)?.checked));
  markSaved();
});
let typeTimer: ReturnType<typeof setTimeout> | undefined;
action('run-text', (el) => {
  if (!run) return;
  const id = run.attemptId;
  const q = el.dataset.q!;
  const v = (el as HTMLInputElement).value;
  clearTimeout(typeTimer);
  saveAnswer(id, q, v);
  typeTimer = setTimeout(markSaved, 400);
});
action('run-note', (el) => {
  if (run) saveAttemptNote(run.attemptId, (el as HTMLTextAreaElement).value);
});
action('run-upload', async (el) => {
  if (!run) return;
  const files = [...((el as HTMLInputElement).files ?? [])];
  const id = run.attemptId;
  const refs = await Promise.all(files.map((f) => storeFile(f)));
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === id);
    if (a && !a.submittedAt) a.files.push(...refs);
  }, true);
  drawStep();
  toast(`${refs.length} berkas ditambahkan.`);
});
action('run-file-rm', async (el) => {
  if (!run) return;
  const id = run.attemptId;
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === id);
    if (a) a.files = a.files.filter((f) => f.id !== el.dataset.id);
  }, true);
  await deleteBlob(el.dataset.id!);
  drawStep();
});

action('run-submit', () => {
  if (!run) return;
  const e = examById(run.examId)!;
  const a = getState().attempts.find((x) => x.id === run!.attemptId)!;
  const blank = e.questions.filter((q) => !answered(e, a.id, q)).length;
  const unseen = e.attachments.length > 0 && !e.attachments.some((f) => openedFiles.has(f.id));
  openModal({
    title: 'Kirim jawaban?',
    body: html`${unseen ? html`<div class="callout warn-c"><strong>Berkas soal belum pernah dibuka</strong><span>Ujian ini punya ${e.attachments.length} berkas soal. Pastikan kamu sudah membacanya.</span></div>` : ''}<p class="muted">${blank ? `${blank} dari ${e.questions.length} soal belum dijawab. ` : 'Semua soal sudah dijawab. '}Setelah dikirim, jawaban tidak bisa diubah.</p>
      <div class="modal-f"><button class="btn" data-act="modal-close">Lanjut mengerjakan</button><button class="btn primary" data-act="run-submit-yes">Kirim sekarang</button></div>`,
  });
});
action('run-submit-yes', () => {
  if (!run) return;
  const id = run.attemptId;
  const examId = run.examId;
  closeModal();
  submitAttempt(id);
  const a = getState().attempts.find((x) => x.id === id)!;
  run = null;
  const e = examById(examId)!;
  if (a.gradedAt) {
    const sc = a.finalScore ?? 0;
    openModal({
      title: 'Jawaban terkirim',
      body: html`<div class="result">${gradeBadge(letterOf(sc, getState().settings.gradeMin), 'lg')}<div><div class="big-n">${sc.toFixed(1)}</div><p class="muted">Semua soal dinilai otomatis.</p></div></div>
        <div class="modal-f"><a class="btn" href="#/ujian" data-act="modal-close">Ke agenda</a><button class="btn primary" data-act="ex-eval-close" data-id="${examId}">Kirim ke Evaluasi</button></div>`,
      onClose: () => go('#/ujian'),
    });
  } else {
    openModal({
      title: 'Jawaban terkirim',
      body: html`<p class="muted">Ada jawaban yang perlu kamu koreksi sendiri${e.questions.length ? ' (esai atau isian)' : ''}. Nilai masuk ke skor topik setelah dikoreksi.</p>
        <div class="modal-f"><button class="btn" data-act="modal-close">Nanti</button><button class="btn primary" data-act="koreksi-now" data-id="${examId}">Koreksi sekarang</button></div>`,
      onClose: () => { if (location.hash.includes('kerjakan')) go('#/ujian'); },
    });
  }
});
action('ex-eval-close', (el) => {
  const ev = sendToEvaluation(el.dataset.id!);
  closeModal();
  if (ev) go(`#/evaluasi/${ev.id}`);
});
action('koreksi-now', (el) => {
  const id = el.dataset.id!;
  closeModal();
  go(`#/ujian/koreksi/${id}`);
});

// ====================================================================== Koreksi
export const koreksiPage = (examId: string): Page => ({
  title: 'Koreksi',
  nav: 'ujian',
  static: true,
  render() {
    const s = getState();
    const e = examById(examId);
    const a = e && attemptFor(s, e.id);
    if (!e || !a?.submittedAt) return notAvailable('Belum ada jawaban', 'Koreksi tersedia setelah jawaban dikirim.');
    const auto = autoGradeAttempt(e, a).scores;
    const val = (q: Question) => a.gradedAt ? a.scores[q.id] ?? 0 : a.scores[q.id] ?? auto[q.id];
    const ans = (q: Question): Raw => {
      const v = a.answers[q.id];
      if (v === undefined || v === '') return html`<em class="muted">Tidak dijawab</em>`;
      return q.type === 'pg' ? html`${String.fromCharCode(65 + (v as number))}. ${q.options?.[v as number]}` : html`<span class="pre">${String(v)}</span>`;
    };
    const key = (q: Question): string => q.type === 'pg' ? `${String.fromCharCode(65 + (q.correct ?? 0))}. ${q.options?.[q.correct ?? 0]}` : q.type === 'isian' ? (q.accepted ?? []).join(' / ') : q.key ?? '';
    return html`<div class="wrap narrow">
      <a class="crumb" href="#/ujian">${icon('back', 18)} Ujian Mingguan</a>
      <div class="page-h"><h2>${e.name}</h2><p class="muted">${topicById(e.topicId)?.name} · dikirim ${fmt.dateTime(a.submittedAt)}${a.isMakeup ? ` · susulan, potongan ${a.penaltyPct}%` : ''}</p></div>
      <form data-submit="koreksi-save" data-exam="${e.id}" class="kor">
        ${e.questions.length === 0
          ? html`<section class="block"><h3>Hasil proyek / berkas</h3>${fileList(a.files)}${a.note ? html`<p class="pre note">${a.note}</p>` : html`<p class="muted">Tidak ada catatan.</p>`}
              <label class="fld"><span>Nilai (0–100)</span><input type="number" name="manual" min="0" max="100" step="0.5" required value="${a.manualScore ?? ''}" data-input="kor-calc" /></label></section>`
          : e.questions.map((q, i) => html`<section class="kq">
              <div class="q-h"><strong>Soal ${i + 1}</strong><span class="chip">${q.type === 'pg' ? 'Pilihan ganda' : q.type === 'isian' ? 'Isian' : 'Esai'}</span></div>
              <p class="q-t">${q.text}</p>
              <div class="cmp"><div><small class="muted">Jawabanmu</small><p>${ans(q)}</p></div><div><small class="muted">Kunci / rubrik</small><p class="pre">${key(q) || '–'}</p></div></div>
              <label class="pts"><span>Poin</span><input type="number" name="p_${q.id}" min="0" max="${q.points}" step="0.5" value="${val(q) ?? ''}" ${auto[q.id] === undefined && !a.gradedAt ? raw('required') : ''} data-input="kor-calc" data-max="${q.points}" /><span>/ ${q.points}</span>${auto[q.id] !== undefined && q.type !== 'esai' ? html`<small class="muted">otomatis</small>` : ''}</label>
            </section>`)}
        ${a.files.length && e.questions.length ? html`<section class="block"><h3>Lampiran</h3>${fileList(a.files)}${a.note ? html`<p class="pre note">${a.note}</p>` : ''}</section>` : ''}
        <label class="fld"><span>Catatan koreksi <em>(opsional)</em></span><textarea name="feedback" rows="3" placeholder="Apa yang sudah baik, apa yang perlu diperbaiki">${a.feedback}</textarea></label>
        <div class="sticky-bar"><div class="sum">Nilai <strong id="kor-total">–</strong><span id="kor-grade"></span></div><button class="btn primary">Simpan hasil koreksi</button></div>
      </form></div>`;
  },
  mount(root) {
    kCalc(root);
  },
});

function kCalc(root: ParentNode = document) {
  const form = $<HTMLFormElement>('form.kor', root as HTMLElement);
  if (!form) return;
  const e = examById(form.dataset.exam);
  const a = e && attemptFor(getState(), e.id);
  if (!e || !a) return;
  const fd = new FormData(form);
  const scores: Record<string, number> = {};
  e.questions.forEach((q) => (scores[q.id] = clamp(Number(fd.get('p_' + q.id)) || 0, 0, q.points)));
  const r = computeFinal(e, { ...a, scores, manualScore: e.questions.length ? undefined : Number(fd.get('manual')) || 0 });
  $('#kor-total')!.textContent = r.finalScore.toFixed(1);
  const L = letterOf(r.finalScore, getState().settings.gradeMin);
  $('#kor-grade')!.innerHTML = gradeBadge(L, 'sm').s;
}
action('kor-calc', () => kCalc());
action('koreksi-save', (form) => {
  const f = form as HTMLFormElement;
  const e = examById(f.dataset.exam);
  if (!e) return;
  const a = attemptFor(getState(), e.id);
  if (!a) return;
  const fd = new FormData(f);
  const scores: Record<string, number> = {};
  e.questions.forEach((q) => (scores[q.id] = clamp(Number(fd.get('p_' + q.id)) || 0, 0, q.points)));
  const manual = e.questions.length ? undefined : clamp(Number(fd.get('manual')) || 0, 0, 100);
  gradeAttempt(a.id, scores, manual, String(fd.get('feedback') ?? '').trim());
  const sc = attemptFor(getState(), e.id)!.finalScore ?? 0;
  openModal({
    title: 'Koreksi tersimpan',
    body: html`<div class="result">${gradeBadge(letterOf(sc, getState().settings.gradeMin), 'lg')}<div><div class="big-n">${sc.toFixed(1)}</div><p class="muted">Skor topik dan IP sudah diperbarui.</p></div></div>
      <div class="modal-f"><button class="btn" data-act="modal-close">Ke agenda</button><button class="btn primary" data-act="ex-eval-close" data-id="${e.id}">Kirim ke Evaluasi</button></div>`,
    onClose: () => go('#/ujian'),
  });
});
void [esc, phaseOf, clock, fmtDuration];


// ====================================================================== Tinjau soal & jawaban
export const tinjauPage = (examId: string): Page => ({
  title: 'Soal & Jawaban',
  nav: 'ujian',
  render(ctx) {
    const s = getState();
    const e = examById(examId);
    if (!e || e.status !== 'published') return notAvailable('Ujian tidak ditemukan', 'Agenda ini mungkin sudah dihapus.');
    const at = attemptFor(s, e.id);
    const st = examStatus(e, at, ctx.now);
    if (!['menunggu-koreksi', 'dinilai', 'terlewat'].includes(st)) return notAvailable('Belum bisa ditinjau', 'Soal dan jawaban dibuka setelah ujian dikerjakan atau ditutup.');
    const t = topicById(e.topicId);
    const review = buildReview(e, at);
    const score = st === 'dinilai' ? at!.finalScore ?? 0 : st === 'terlewat' ? 0 : null;
    const ev = s.evaluations.find((x) => x.examId === e.id);
    return html`<div class="wrap narrow">
      <a class="crumb" href="#/ujian?minggu=${examWeek(e)}">${icon('back', 18)} Ujian Mingguan</a>
      <div class="ev-h"><div><h2>${e.name}</h2><p class="muted"><i class="tdot" style="--c:${t?.color}"></i> ${t?.name} · ${e.durationMin} mnt · ${at?.submittedAt ? `dikirim ${fmt.dateTime(at.submittedAt)}` : 'tidak dikerjakan'}</p></div>
        ${score !== null ? html`<div class="ev-sc">${gradeBadge(letterOf2(score, s.settings.gradeMin), 'lg')}<strong>${score.toFixed(1)}</strong></div>` : statusChip(st)}</div>
      <div class="btns tj-a">${ev ? html`<a class="btn" href="#/evaluasi/${ev.id}">${icon('evaluasi', 18)} Buka di Evaluasi</a>` : html`<button class="btn primary" data-act="ex-eval" data-id="${e.id}">${icon('evaluasi', 18)} Simpan ke Evaluasi</button>`}
        <button class="btn" data-act="tj-export" data-id="${e.id}">${icon('download', 18)} Unduh soal &amp; jawaban</button></div>
      ${e.rules ? html`<div class="rules"><h4>Ketentuan</h4><p>${e.rules}</p></div>` : ''}
      ${e.attachments.length ? html`<section class="block"><h3>Berkas soal</h3>${fileList(e.attachments)}</section>` : ''}
      ${at?.files.length || at?.note ? html`<section class="block"><h3>Berkas jawabanmu</h3>${fileList(at.files)}${at.note ? html`<p class="pre note">${at.note}</p>` : ''}</section>` : ''}
      ${review.length ? html`<section class="block"><h3>Soal dan jawaban</h3><div class="rev">${review.map((r, i) => {
        const done = !!at?.gradedAt;
        const full = r.earned >= r.max;
        return html`<details open class="rv ${done ? (full ? 'ok' : 'bad') : ''}"><summary><span class="qn">${i + 1}</span><span class="rv-t">${r.text}</span><span class="rv-p">${done ? `${r.earned}/${r.max}` : `${r.max} poin`}</span></summary>
          ${r.options?.length ? html`<ol class="opts-l">${r.options.map((o) => html`<li>${o}</li>`)}</ol>` : ''}
          <div class="cmp"><div><small class="muted">Jawabanmu</small><p class="pre">${r.mine}</p></div><div><small class="muted">Kunci</small><p class="pre">${r.key || '–'}</p></div></div></details>`;
      })}</div></section>` : ''}
    </div>`;
  },
});

action('tj-export', (el) => {
  const e = examById(el.dataset.id);
  if (!e) return;
  const at = attemptFor(getState(), e.id);
  const sc = at?.finalScore;
  const doc = reviewHtml({
    title: e.name, topic: topicById(e.topicId)?.name ?? '', meta: `Minggu ${weekRangeLabel(examWeek(e))}`, scoreLabel: sc !== undefined ? sc.toFixed(1) : undefined,
    review: buildReview(e, at), files: [...e.attachments.map((f) => ({ name: f.name, kind: 'soal' })), ...(at?.files ?? []).map((f) => ({ name: f.name, kind: 'jawaban' }))],
    sections: [{ heading: 'Ketentuan', text: e.rules }, { heading: 'Catatan koreksi', text: at?.feedback ?? '' }],
  });
  downloadBlob(`${e.name.replace(/[^\w-]+/g, '_')}.html`, new Blob([doc], { type: 'text/html' }));
  toast('Soal dan jawaban diunduh.');
});
