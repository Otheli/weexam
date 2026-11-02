import { computeFinal } from './grading';
import { GRADE_POINTS, letterOf, type Letter } from './grading';
import {
  DAY_MS,
  addDays,
  cycleDay,
  fmt,
  fmtDuration,
  parseKey,
  phaseOf,
  prepTargetWeek,
  shiftWeek,
  weekCloseAt,
  weekKey,
} from './time';
import type { AppState, Attempt, Exam, Topic } from './types';

export type ExamStatus =
  | 'draf'
  | 'terjadwal'
  | 'terbuka'
  | 'susulan'
  | 'berjalan'
  | 'menunggu-koreksi'
  | 'dinilai'
  | 'terlewat';

export function examWeek(exam: Exam): string {
  return weekKey(new Date(exam.scheduledAt));
}

export function attemptFor(state: AppState, examId: string): Attempt | undefined {
  return state.attempts.find((a) => a.examId === examId);
}

/** Batas waktu pengerjaan satu percobaan (ms epoch). */
export function attemptDeadline(exam: Exam, attempt: Attempt): number {
  return Math.min(new Date(attempt.startedAt).getTime() + exam.durationMin * 60_000, new Date(exam.makeupUntil).getTime());
}

export function examStatus(exam: Exam, attempt: Attempt | undefined, now: Date): ExamStatus {
  if (exam.status === 'draft') return 'draf';
  if (attempt?.submittedAt) return attempt.gradedAt ? 'dinilai' : 'menunggu-koreksi';
  if (attempt) return 'berjalan';
  const t = now.getTime();
  if (t < new Date(exam.scheduledAt).getTime()) return 'terjadwal';
  if (t <= new Date(exam.regularUntil).getTime()) return 'terbuka';
  if (exam.allowMakeup && t <= new Date(exam.makeupUntil).getTime()) return 'susulan';
  return 'terlewat';
}

/** Ujian tidak lagi bisa dikerjakan. */
export function isClosed(status: ExamStatus): boolean {
  return status === 'terlewat';
}

export function canStart(status: ExamStatus): boolean {
  return status === 'terbuka' || status === 'susulan';
}

export type ResultItem = { week: string; score: number; weight: number; kind: 'ujian' | 'terlewat' | 'kosong'; examId?: string };

/** Nilai satu ujian bila sudah final; null jika belum (pending). */
export function examScore(exam: Exam, attempt: Attempt | undefined, now: Date): number | null {
  const st = examStatus(exam, attempt, now);
  if (st === 'dinilai') return attempt!.finalScore ?? computeFinal(exam, attempt!).finalScore;
  if (st === 'terlewat') return 0;
  return null;
}

/** Semua butir nilai yang sudah final untuk sebuah topik. */
export function topicResults(state: AppState, topic: Topic, now: Date): ResultItem[] {
  const items: ResultItem[] = [];
  const weeksWithExam = new Set<string>();
  for (const exam of state.exams) {
    if (exam.topicId !== topic.id || exam.status !== 'published') continue;
    const wk = examWeek(exam);
    weeksWithExam.add(wk);
    const sc = examScore(exam, attemptFor(state, exam.id), now);
    if (sc === null) continue;
    items.push({ week: wk, score: sc, weight: exam.weight && exam.weight > 0 ? exam.weight : 1, kind: sc === 0 && !attemptFor(state, exam.id)?.submittedAt ? 'terlewat' : 'ujian', examId: exam.id });
  }
  if (state.settings.emptyWeekZero) {
    let wk = topic.startWeek;
    const cur = weekKey(now);
    while (wk <= cur) {
      if (!weeksWithExam.has(wk) && now.getTime() > weekCloseAt(wk).getTime()) {
        items.push({ week: wk, score: 0, weight: 1, kind: 'kosong' });
      }
      wk = shiftWeek(wk, 1);
    }
  }
  return items;
}

export interface TopicScore {
  score: number | null;
  letter: Letter | null;
  weeks: number;
}

export function topicScore(state: AppState, topic: Topic, now: Date, uptoWeek?: string): TopicScore {
  const byWeek = new Map<string, { s: number; w: number }[]>();
  for (const it of topicResults(state, topic, now)) {
    if (uptoWeek && it.week > uptoWeek) continue;
    const arr = byWeek.get(it.week) ?? [];
    arr.push({ s: it.score, w: it.weight });
    byWeek.set(it.week, arr);
  }
  const weeks = [...byWeek.keys()].sort().reverse();
  const win = state.settings.scoreWindow;
  const used = win > 0 ? weeks.slice(0, win) : weeks;
  if (used.length === 0) return { score: null, letter: null, weeks: 0 };
  const means = used.map((w) => {
    const a = byWeek.get(w)!;
    return a.reduce((s, x) => s + x.s * x.w, 0) / a.reduce((s, x) => s + x.w, 0);
  });
  const score = Math.round((means.reduce((s, x) => s + x, 0) / means.length) * 10) / 10;
  return { score, letter: letterOf(score, state.settings.gradeMin), weeks: used.length };
}

export interface Gpa {
  ip: number | null;
  scored: number;
  total: number;
  dist: Record<Letter, number>;
}

export function computeGpa(state: AppState, now: Date, uptoWeek?: string): Gpa {
  let sum = 0;
  let cr = 0;
  let scored = 0;
  const dist: Record<Letter, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const t of state.topics) {
    const ts = topicScore(state, t, now, uptoWeek);
    if (ts.letter) {
      sum += GRADE_POINTS[ts.letter] * t.credits;
      cr += t.credits;
      scored++;
      dist[ts.letter]++;
    }
  }
  return { ip: cr > 0 ? Math.round((sum / cr) * 100) / 100 : null, scored, total: state.topics.length, dist };
}

/** Riwayat IP per minggu (n minggu terakhir sampai minggu berjalan). */
export function gpaHistory(state: AppState, now: Date, n = 8): { week: string; ip: number | null }[] {
  const cur = weekKey(now);
  const out: { week: string; ip: number | null }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const wk = shiftWeek(cur, -i);
    out.push({ week: wk, ip: computeGpa(state, now, wk).ip });
  }
  return out;
}

export function topicWeekHistory(state: AppState, topic: Topic, now: Date, n = 8) {
  const cur = weekKey(now);
  const items = topicResults(state, topic, now);
  const out: { week: string; score: number | null }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const wk = shiftWeek(cur, -i);
    const arr = items.filter((x) => x.week === wk);
    out.push({ week: wk, score: arr.length ? arr.reduce((s, x) => s + x.score * x.weight, 0) / arr.reduce((s, x) => s + x.weight, 0) : null });
  }
  return out;
}

export type Coverage = 'siap' | 'draf' | 'kosong';

export function coverage(state: AppState, topic: Topic, wk: string): { state: Coverage; exams: Exam[] } {
  const exams = state.exams.filter((e) => e.topicId === topic.id && examWeek(e) === wk && !e.archived);
  if (exams.some((e) => e.status === 'published')) return { state: 'siap', exams };
  if (exams.length) return { state: 'draf', exams };
  return { state: 'kosong', exams };
}

export function missingTopics(state: AppState, wk: string): Topic[] {
  return state.topics.filter((t) => t.startWeek <= wk && coverage(state, t, wk).state !== 'siap');
}

// ---------------------------------------------------------------- Peringatan

export type AlertLevel = 'critical' | 'warning' | 'info';
export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  body: string;
  href: string;
}

const LEVEL_ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };

export function buildAlerts(state: AppState, now: Date): Alert[] {
  const alerts: Alert[] = [];
  const t = now.getTime();
  const cur = weekKey(now);
  const day = cycleDay(now);
  const phase = phaseOf(now);
  const topicName = (id: string) => state.topics.find((x) => x.id === id)?.name ?? 'Topik';

  // 1. Cakupan ujian: setiap topik wajib punya ujian setiap minggu.
  const targets: { wk: string; level: AlertLevel; when: string }[] = [];
  if (phase === 'ujian') targets.push({ wk: cur, level: 'critical', when: 'minggu ini' });
  const next = prepTargetWeek(now);
  if (phase === 'evaluasi') targets.push({ wk: next, level: 'info', when: `Sabtu ${fmt.short(parseKey(next))}` });
  if (phase === 'persiapan') targets.push({ wk: next, level: day === 6 ? 'critical' : 'warning', when: `Sabtu ${fmt.short(parseKey(next))}` });
  for (const tg of targets) {
    const miss = missingTopics(state, tg.wk);
    if (miss.length) {
      const names = miss.slice(0, 3).map((x) => x.name).join(', ') + (miss.length > 3 ? ` +${miss.length - 3}` : '');
      alerts.push({
        id: `cov:${tg.wk}:${tg.level}:${miss.length}`,
        level: tg.level,
        title: `${miss.length} topik belum punya ujian (${tg.when})`,
        body: tg.level === 'critical' && tg.wk === cur
          ? `${names}. Tanpa ujian, nilai minggu ini dihitung nol.`
          : `${names}. Setiap topik wajib punya ujian setiap minggu.`,
        href: `#/persiapan?minggu=${tg.wk}`,
      });
    }
  }

  // 2. Agenda ujian
  let waitingGrade = 0;
  let notSent = 0;
  for (const exam of state.exams) {
    if (exam.status !== 'published' || exam.archived) continue;
    const at = attemptFor(state, exam.id);
    const st = examStatus(exam, at, now);
    const open = new Date(exam.scheduledAt).getTime();
    const reg = new Date(exam.regularUntil).getTime();
    const close = new Date(exam.makeupUntil).getTime();
    const name = `${exam.name} (${topicName(exam.topicId)})`;
    if (st === 'terjadwal' && open - t <= 60 * 60_000) {
      alerts.push({ id: `soon:${exam.id}`, level: 'warning', title: 'Ujian segera dibuka', body: `${name} dibuka ${fmtDuration(open - t)} lagi.`, href: '#/ujian' });
    }
    if (st === 'terbuka') {
      const left = reg - t;
      alerts.push({
        id: `open:${exam.id}:${left <= 3 * 3600_000 ? 'late' : 'now'}`,
        level: left <= 3 * 3600_000 ? 'critical' : 'warning',
        title: left <= 3 * 3600_000 ? 'Batas ujian reguler hampir habis' : 'Ujian sudah dibuka',
        body: `${name}. Batas reguler ${fmtDuration(left)} lagi.`,
        href: `#/ujian/kerjakan/${exam.id}`,
      });
    }
    if (st === 'susulan') {
      const left = close - t;
      alerts.push({
        id: `makeup:${exam.id}:${left <= DAY_MS ? 'last' : 'on'}`,
        level: left <= DAY_MS ? 'critical' : 'warning',
        title: left <= DAY_MS ? 'Susulan terakhir' : 'Ujian susulan tersedia',
        body: `${name}. Ditutup ${fmtDuration(left)} lagi, nilai ${exam.makeupPenaltyPct ? `dipotong ${exam.makeupPenaltyPct}%` : 'tanpa potongan'}.`,
        href: `#/ujian/kerjakan/${exam.id}`,
      });
    }
    if (st === 'berjalan' && at) {
      const left = attemptDeadline(exam, at) - t;
      alerts.push({ id: `run:${exam.id}`, level: 'critical', title: 'Ujian sedang berjalan', body: `${name}. Sisa waktu ${fmtDuration(left)}.`, href: `#/ujian/kerjakan/${exam.id}` });
    }
    if (st === 'menunggu-koreksi') waitingGrade++;
    if (st === 'dinilai' && !exam.evaluatedAt) notSent++;
    if (st === 'terlewat' && t - close < 2 * DAY_MS) {
      alerts.push({ id: `missed:${exam.id}`, level: 'warning', title: 'Ujian ditutup tanpa jawaban', body: `${name} bernilai 0 dan memengaruhi skor topik.`, href: '#/ujian' });
    }
  }
  if (waitingGrade) alerts.push({ id: `grade:${waitingGrade}`, level: phase === 'evaluasi' ? 'warning' : 'info', title: `${waitingGrade} ujian menunggu koreksi`, body: 'Koreksi dulu agar nilai masuk ke skor topik.', href: '#/ujian' });
  if (notSent) alerts.push({ id: `send:${notSent}`, level: 'info', title: `${notSent} hasil belum masuk Evaluasi`, body: 'Kirim ke Evaluasi untuk menyimpan catatan dan materi tindak lanjut.', href: '#/ujian' });

  // 3. Cadangan: data hanya ada di perangkat ini.
  if (state.topics.length > 0) {
    const last = state.settings.lastBackupAt ? new Date(state.settings.lastBackupAt).getTime() : 0;
    const oldest = Math.min(...state.topics.map((x) => new Date(x.createdAt).getTime()));
    const since = last || oldest;
    if (t - since > 7 * DAY_MS) {
      alerts.push({ id: `backup:${weekKey(now)}`, level: 'info', title: 'Waktunya mencadangkan data', body: last ? 'Cadangan terakhir lebih dari seminggu lalu.' : 'Data belum pernah dicadangkan.', href: '#/pengaturan' });
    }
  }

  return alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

// ---------------------------------------------------------------- Aksi utama

export interface NextAction {
  text: string;
  cta: string;
  href: string;
}

export function nextAction(state: AppState, now: Date): NextAction {
  if (state.topics.length === 0) return { text: 'Mulai dengan menambahkan topik yang ingin kamu dalami.', cta: 'Tambah topik', href: '#/dashboard?baru=1' };
  const alerts = buildAlerts(state, now);
  const first = alerts.find((a) => a.level !== 'info') ?? alerts[0];
  if (first) {
    const cta = first.href.includes('kerjakan') ? 'Kerjakan' : first.href.startsWith('#/persiapan') ? 'Siapkan ujian' : 'Buka';
    return { text: `${first.title}. ${first.body}`, cta, href: first.href };
  }
  const phase = phaseOf(now);
  if (phase === 'ujian') return { text: 'Semua ujian pekan ini sudah ditangani.', cta: 'Lihat agenda', href: '#/ujian' };
  if (phase === 'evaluasi') return { text: 'Tinjau hasil dan catat materi yang perlu diperdalam.', cta: 'Buka Evaluasi', href: '#/evaluasi' };
  return { text: 'Ujian pekan depan sudah siap. Perkuat soalnya bila perlu.', cta: 'Buka Persiapan', href: '#/persiapan' };
}

export function upcomingExams(state: AppState, now: Date, limit = 6) {
  return state.exams
    .filter((e) => e.status === 'published' && !e.archived)
    .map((e) => ({ exam: e, status: examStatus(e, attemptFor(state, e.id), now) }))
    .filter((x) => ['terjadwal', 'terbuka', 'susulan', 'berjalan'].includes(x.status))
    .sort((a, b) => new Date(a.exam.scheduledAt).getTime() - new Date(b.exam.scheduledAt).getTime())
    .slice(0, limit);
}

export function openStudyItems(state: AppState) {
  const out: { topic: Topic | undefined; evalId: string; item: { id: string; text: string } }[] = [];
  for (const ev of state.evaluations) {
    for (const s of ev.study) if (!s.done) out.push({ topic: state.topics.find((t) => t.id === ev.topicId), evalId: ev.id, item: s });
  }
  return out;
}

export function weekDates(wk: string): Date[] {
  const s = parseKey(wk);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}
