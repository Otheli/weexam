import type { Attempt, Exam, GradeScale, Question, Settings } from './types';

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E';
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E'];
export const GRADE_POINTS: Record<Letter, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };
export const GRADE_LABEL: Record<Letter, string> = {
  A: 'Sangat baik',
  B: 'Baik',
  C: 'Cukup',
  D: 'Kurang',
  E: 'Gagal',
};

export function letterOf(score: number, scale: GradeScale): Letter {
  if (score >= scale.A) return 'A';
  if (score >= scale.B) return 'B';
  if (score >= scale.C) return 'C';
  if (score >= scale.D) return 'D';
  return 'E';
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s.,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nilai otomatis satu soal. Mengembalikan null bila butuh koreksi manual.
 * Esai kosong otomatis 0.
 */
export function autoScore(q: Question, answer: number | string | undefined): number | null {
  if (q.type === 'pg') {
    return typeof answer === 'number' && answer === q.correct ? q.points : 0;
  }
  const text = typeof answer === 'string' ? answer.trim() : '';
  if (q.type === 'isian') {
    if (!text) return 0;
    const ok = (q.accepted ?? []).some((a) => normalize(a) === normalize(text));
    return ok ? q.points : 0;
  }
  // esai
  return text ? null : 0;
}

export function maxPoints(exam: Exam): number {
  return exam.questions.reduce((s, q) => s + q.points, 0);
}

/** Isi nilai otomatis untuk semua soal; kembalikan apakah masih ada yang perlu dikoreksi manual. */
export function autoGradeAttempt(exam: Exam, attempt: Attempt): { scores: Record<string, number>; needsManual: boolean } {
  const scores: Record<string, number> = {};
  let needsManual = false;
  for (const q of exam.questions) {
    const s = autoScore(q, attempt.answers[q.id]);
    if (s === null) needsManual = true;
    else scores[q.id] = s;
  }
  if (exam.questions.length === 0) needsManual = true; // ujian berkas/proyek: nilai manual
  return { scores, needsManual };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Hitung nilai akhir (0-100) dari poin yang sudah terisi. Penalti susulan diterapkan di sini. */
export function computeFinal(exam: Exam, attempt: Attempt): { rawPct: number; finalScore: number } {
  let rawPct: number;
  if (exam.questions.length === 0) {
    rawPct = clamp(attempt.manualScore ?? 0, 0, 100);
  } else {
    const max = maxPoints(exam);
    const got = exam.questions.reduce((s, q) => s + clamp(attempt.scores[q.id] ?? 0, 0, q.points), 0);
    rawPct = max > 0 ? (got / max) * 100 : 0;
  }
  const penalty = attempt.isMakeup ? attempt.penaltyPct : 0;
  return { rawPct: round1(rawPct), finalScore: round1(rawPct * (1 - penalty / 100)) };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

export function pointsLabel(settings: Settings, score: number | null | undefined) {
  if (score === null || score === undefined) return null;
  const letter = letterOf(score, settings.gradeMin);
  return { letter, points: GRADE_POINTS[letter] };
}
