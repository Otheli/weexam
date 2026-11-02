import {
  computeGpa, gpaHistory, nextAction, openStudyItems, topicScore, upcomingExams, coverage, examWeek, attemptFor, examStatus,
} from '../derive';
import { GRADE_LABEL, LETTERS } from '../grading';
import type { Page } from '../router';
import { getState, resetAll } from '../store';
import { DAY_SHORT, PHASE_LABEL, cycleDay, fmt, phaseOf, prepTargetWeek, weekKey } from '../time';
import { weekDates } from '../derive';
import { MAX_TOPICS } from '../types';
import { action, html, icon } from '../ui/dom';
import { coverStyle, gradeBadge, sparkline, statusChip, toast } from '../ui/kit';
import { openTopicModal } from './topic';
import { loadSample } from '../seed';

function cycleRibbon(now: Date) {
  const s = getState();
  const wk = weekKey(now);
  const today = cycleDay(now);
  const dates = weekDates(wk);
  const perDay = dates.map((d) => s.exams.filter((e) => e.status === 'published' && !e.archived && new Date(e.scheduledAt).toDateString() === d.toDateString()).length);
  const phases = [
    { cls: 'p-ujian', label: 'Ujian', span: 2 },
    { cls: 'p-evaluasi', label: 'Evaluasi & susulan', span: 3 },
    { cls: 'p-persiapan', label: 'Persiapan', span: 2 },
  ];
  return html`<div class="ribbon" role="img" aria-label="Siklus minggu ini, hari ini ${DAY_SHORT[today]}">
    <div class="days">${dates.map((d, i) => html`<div class="day ${i === today ? 'today' : ''} ${i < today ? 'past' : ''}"><span class="dn">${DAY_SHORT[i]}</span><span class="dd">${d.getDate()}</span><span class="dots">${Array.from({ length: Math.min(perDay[i], 4) }, () => html`<i></i>`)}</span></div>`)}</div>
    <div class="phases">${phases.map((p) => html`<div class="phase ${p.cls} ${phaseOf(now) === p.cls.slice(2) ? 'cur' : ''}" style="grid-column:span ${p.span}"><span>${p.label}</span></div>`)}</div>
  </div>`;
}

export const dashboardPage: Page = {
  title: 'Dashboard',
  nav: 'dashboard',
  subtitle: (c) => `${fmt.dayDate(c.now)} · ${PHASE_LABEL[phaseOf(c.now)]}`,
  render(ctx) {
    const s = getState();
    const now = ctx.now;
    if (ctx.query.get('baru')) queueMicrotask(() => { history.replaceState(null, '', '#/dashboard'); openTopicModal(); });

    if (s.topics.length === 0) {
      return html`<div class="wrap"><section class="welcome">
        <div class="welcome-t"><h2>Satu ujian per topik, setiap minggu.</h2>
        <p>Pilih hingga ${MAX_TOPICS} topik yang ingin kamu dalami. Siapkan soalnya di Persiapan, kerjakan di akhir pekan, lalu evaluasi hasilnya. Nilai A sampai E membentuk IP kamu.</p>
        <div class="btns"><button class="btn primary lg" data-act="topic-add">${icon('plus', 20)} Tambah topik pertama</button><button class="btn lg" data-act="sample">Lihat dengan data contoh</button></div></div>
        <div class="welcome-r">${cycleRibbon(now)}</div></section></div>`;
    }

    const gpa = computeGpa(s, now);
    const hist = gpaHistory(s, now, 8);
    const act = nextAction(s, now);
    const wk = weekKey(now);
    const target = phaseOf(now) === 'ujian' ? wk : prepTargetWeek(now);
    const up = upcomingExams(s, now, 5);
    const study = openStudyItems(s).slice(0, 5);
    const sampleMode = s.topics.some((t) => t.description === 'Contoh');

    return html`<div class="wrap">
      <section class="hero">
        <div class="gpa">
          <span class="lbl">Indeks Prestasi</span>
          <div class="gpa-n"><strong>${gpa.ip === null ? '–' : gpa.ip.toFixed(2)}</strong><span>/ 4,00</span></div>
          <div class="gpa-m">${sparkline(hist.map((h) => h.ip), 4)}<p class="muted">${gpa.scored} dari ${gpa.total} topik sudah bernilai</p></div>
          <div class="dist">${LETTERS.map((l) => html`<span class="dist-i" title="${GRADE_LABEL[l]}">${gradeBadge(l, 'sm')}<b>${gpa.dist[l]}</b></span>`)}</div>
        </div>
        <div class="cycle">
          ${cycleRibbon(now)}
          <div class="next"><p>${act.text}</p><a class="btn primary" href="${act.href}">${act.cta}</a></div>
        </div>
      </section>

      <section class="block">
        <div class="block-h"><h3>Topik <span class="count">${s.topics.length}/${MAX_TOPICS}</span></h3><button class="btn" data-act="topic-add" ${s.topics.length >= MAX_TOPICS ? 'disabled' : ''}>${icon('plus', 18)} Tambah topik</button></div>
        <div class="grid">${s.topics.map((t) => {
          const sc = topicScore(s, t, now);
          const cv = coverage(s, t, target);
          const cvLabel = cv.state === 'siap' ? 'Ujian siap' : cv.state === 'draf' ? 'Masih draf' : 'Belum ada ujian';
          return html`<a class="tcard" href="#/topik/${t.id}">
            <div class="tcard-i" ${coverStyle(t)}>${gradeBadge(sc.letter, 'md')}</div>
            <div class="tcard-b"><strong>${t.name}</strong>
              <div class="tcard-m"><span class="score">${sc.score === null ? 'Belum bernilai' : sc.score.toFixed(1)}</span><span class="cov cov-${cv.state}" title="Ujian ${target === wk ? 'minggu ini' : 'Sabtu depan'}">${cvLabel}</span></div>
            </div></a>`;
        })}</div>
      </section>

      <div class="two">
        <section class="block"><h3>Agenda terdekat</h3>
          ${up.length === 0 ? html`<p class="muted">Tidak ada ujian terjadwal. <a href="#/persiapan">Siapkan ujian</a></p>` : html`<ul class="rows">${up.map(({ exam, status }) => {
            const t = s.topics.find((x) => x.id === exam.topicId);
            return html`<li class="row"><i class="tdot" style="--c:${t?.color}"></i><div class="row-m"><a href="${status === 'terbuka' || status === 'susulan' || status === 'berjalan' ? `#/ujian/kerjakan/${exam.id}` : '#/ujian'}"><strong>${exam.name}</strong></a><small class="muted">${t?.name} · ${fmt.dateTime(exam.scheduledAt)}</small></div>${statusChip(status)}</li>`;
          })}</ul>`}
        </section>
        <section class="block"><h3>Perlu dipelajari</h3>
          ${study.length === 0 ? html`<p class="muted">Materi tindak lanjut dari Evaluasi akan muncul di sini.</p>` : html`<ul class="rows">${study.map((x) => html`<li class="row"><i class="tdot" style="--c:${x.topic?.color}"></i><div class="row-m"><a href="#/evaluasi/${x.evalId}"><strong>${x.item.text}</strong></a><small class="muted">${x.topic?.name}</small></div></li>`)}</ul>`}
        </section>
      </div>
      ${sampleMode ? html`<p class="sample-note">Kamu sedang melihat data contoh. <button class="link" data-act="sample-clear">Hapus data contoh</button></p>` : ''}
    </div>`;
  },
};

action('sample', () => {
  loadSample();
  toast('Data contoh dimuat.');
});
action('sample-clear', async () => {
  await resetAll();
  toast('Data contoh dihapus.');
});
void ([examWeek, attemptFor, examStatus]);
