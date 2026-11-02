import { describe, expect, test } from 'bun:test';
import { autoScore, computeFinal, letterOf } from '../src/grading';
import { buildAlerts, computeGpa, coverage, examStatus, topicScore } from '../src/derive';
import { cycleDay, defaultSchedule, phaseOf, scheduleFor, shiftWeek, weekKey } from '../src/time';
import { DEFAULT_SETTINGS, type AppState, type Attempt, type Exam, type Topic } from '../src/types';

const d = (s: string) => new Date(s); // waktu lokal: 'YYYY-MM-DDTHH:mm'

function topic(id: string, startWeek = '2026-10-10', credits = 2): Topic {
  return { id, name: id, description: '', credits, color: '#000', cover: { kind: 'preset', id: 'a' }, startWeek, createdAt: '2026-10-01T00:00:00Z' };
}
function exam(id: string, topicId: string, wk: string, extra: Partial<Exam> = {}): Exam {
  const sch = defaultSchedule(wk, '09:00', 60);
  return {
    id, topicId, seq: 1, name: id, rules: '', durationMin: 60, ...sch, allowMakeup: true, makeupPenaltyPct: 10, passingScore: 60,
    questions: [{ id: 'q1', type: 'pg', text: 'x', points: 10, options: ['a', 'b'], correct: 1 }], attachments: [], status: 'published',
    createdAt: '', updatedAt: '', ...extra,
  };
}
function st(p: Partial<AppState> = {}): AppState {
  return { v: 1, topics: [], exams: [], attempts: [], evaluations: [], settings: { ...DEFAULT_SETTINGS }, seenAlerts: {}, ...p };
}
const graded = (examId: string, score: number, makeup = false): Attempt => ({
  id: 'a' + examId, examId, startedAt: '2026-10-24T09:00:00Z', submittedAt: '2026-10-24T10:00:00Z', isMakeup: makeup, answers: {}, files: [], note: '', scores: {}, feedback: '', gradedAt: 'x', penaltyPct: 0, finalScore: score,
});

describe('siklus mingguan', () => {
  test('Sabtu adalah hari ke-0, Jumat hari ke-6', () => {
    expect(cycleDay(d('2026-10-24T10:00'))).toBe(0); // Sabtu
    expect(cycleDay(d('2026-10-30T10:00'))).toBe(6); // Jumat
    expect(weekKey(d('2026-10-30T23:59'))).toBe('2026-10-24');
    expect(weekKey(d('2026-10-31T00:00'))).toBe('2026-10-31');
  });
  test('fase: Sab-Min ujian, Sen-Rab evaluasi, Kam-Jum persiapan', () => {
    expect(phaseOf(d('2026-10-24T08:00'))).toBe('ujian');
    expect(phaseOf(d('2026-10-25T23:00'))).toBe('ujian');
    expect(phaseOf(d('2026-10-26T00:00'))).toBe('evaluasi');
    expect(phaseOf(d('2026-10-28T23:59'))).toBe('evaluasi');
    expect(phaseOf(d('2026-10-29T00:00'))).toBe('persiapan');
    expect(phaseOf(d('2026-10-30T23:59'))).toBe('persiapan');
  });
  test('jadwal bawaan: reguler sampai Minggu, susulan sampai Rabu 23:59', () => {
    const s = defaultSchedule('2026-10-24', '09:00', 60);
    expect(new Date(s.regularUntil).getDay()).toBe(0);
    expect(new Date(s.makeupUntil).getDay()).toBe(3);
    expect(new Date(s.makeupUntil).getHours()).toBe(23);
  });
  test('scheduleFor menjaga urutan buka <= reguler < tutup', () => {
    const s = scheduleFor(d('2026-10-29T09:00').toISOString()); // Kamis
    expect(new Date(s.regularUntil).getTime()).toBeGreaterThanOrEqual(d('2026-10-29T09:00').getTime());
    expect(new Date(s.makeupUntil).getTime()).toBeGreaterThan(new Date(s.regularUntil).getTime());
  });
  test('shiftWeek lintas bulan', () => expect(shiftWeek('2026-10-31', 1)).toBe('2026-11-07'));
});

describe('status ujian & penguncian', () => {
  const e = exam('e1', 't1', '2026-10-24');
  test('terjadwal -> terbuka -> susulan -> terlewat', () => {
    expect(examStatus(e, undefined, d('2026-10-23T12:00'))).toBe('terjadwal');
    expect(examStatus(e, undefined, d('2026-10-24T09:00'))).toBe('terbuka');
    expect(examStatus(e, undefined, d('2026-10-25T23:59'))).toBe('terbuka');
    expect(examStatus(e, undefined, d('2026-10-26T08:00'))).toBe('susulan');
    expect(examStatus(e, undefined, d('2026-10-28T23:59'))).toBe('susulan');
    expect(examStatus(e, undefined, d('2026-10-29T00:00'))).toBe('terlewat');
  });
  test('tanpa susulan: langsung terlewat setelah batas reguler', () => {
    expect(examStatus({ ...e, allowMakeup: false }, undefined, d('2026-10-26T08:00'))).toBe('terlewat');
  });
  test('draf tidak pernah terbuka', () => expect(examStatus({ ...e, status: 'draft' }, undefined, d('2026-10-24T10:00'))).toBe('draf'));
});

describe('penilaian', () => {
  test('skala A-E', () => {
    const g = DEFAULT_SETTINGS.gradeMin;
    expect([100, 80, 79.9, 70, 60, 50, 49.9, 0].map((s) => letterOf(s, g))).toEqual(['A', 'A', 'B', 'B', 'C', 'D', 'E', 'E']);
  });
  test('nilai otomatis: pg, isian (abaikan huruf besar/aksen), esai', () => {
    expect(autoScore({ id: 'a', type: 'pg', text: '', points: 5, correct: 2 }, 2)).toBe(5);
    expect(autoScore({ id: 'a', type: 'pg', text: '', points: 5, correct: 2 }, 1)).toBe(0);
    expect(autoScore({ id: 'a', type: 'isian', text: '', points: 5, accepted: ['Jakarta'] }, ' jakarta ')).toBe(5);
    expect(autoScore({ id: 'a', type: 'esai', text: '', points: 5 }, '')).toBe(0);
    expect(autoScore({ id: 'a', type: 'esai', text: '', points: 5 }, 'uraian')).toBeNull();
  });
  test('penalti susulan hanya untuk percobaan susulan', () => {
    const e1 = exam('e', 't', '2026-10-24', { questions: [{ id: 'q', type: 'pg', text: '', points: 10, correct: 0 }] });
    const base = { ...graded('e', 0), scores: { q: 10 }, penaltyPct: 10 };
    expect(computeFinal(e1, { ...base, isMakeup: false }).finalScore).toBe(100);
    expect(computeFinal(e1, { ...base, isMakeup: true }).finalScore).toBe(90);
  });
  test('ujian berkas memakai nilai manual', () => {
    const e1 = exam('e', 't', '2026-10-24', { questions: [] });
    expect(computeFinal(e1, { ...graded('e', 0), manualScore: 85 }).finalScore).toBe(85);
  });
});

describe('skor topik & IP', () => {
  const now = d('2026-11-04T12:00'); // Rabu, setelah minggu 10-24 ditutup? (tutup Rabu 28 Okt)
  test('ujian terlewat dan minggu kosong bernilai 0', () => {
    const s = st({ topics: [topic('t1', '2026-10-24')], exams: [exam('e1', 't1', '2026-10-24')], attempts: [] });
    // minggu 24 Okt: terlewat = 0; minggu 31 Okt: tidak ada ujian dan sudah ditutup = 0 (tutup Rabu 4 Nov 23:59 -> belum)
    const ts = topicScore(s, s.topics[0], now);
    expect(ts.score).toBe(0);
    expect(ts.weeks).toBe(1);
    expect(ts.letter).toBe('E');
  });
  test('minggu kosong yang sudah ditutup dihitung 0, bisa dimatikan', () => {
    const s = st({ topics: [topic('t1', '2026-10-24')] });
    expect(topicScore(s, s.topics[0], now).score).toBe(0);
    s.settings.emptyWeekZero = false;
    expect(topicScore(s, s.topics[0], now).score).toBeNull();
  });
  test('rata-rata mingguan dan jendela minggu terakhir', () => {
    const s = st({
      topics: [topic('t1', '2026-10-10')],
      exams: [exam('a', 't1', '2026-10-10'), exam('b', 't1', '2026-10-17'), exam('c', 't1', '2026-10-24')],
      attempts: [graded('a', 100), graded('b', 80), graded('c', 60)],
    });
    expect(topicScore(s, s.topics[0], now).score).toBe(80);
    s.settings.scoreWindow = 2;
    expect(topicScore(s, s.topics[0], now).score).toBe(70);
  });
  test('belum dinilai tidak dihitung', () => {
    const s = st({ topics: [topic('t1', '2026-10-24')], exams: [exam('a', 't1', '2026-10-24')], attempts: [] });
    const early = d('2026-10-24T10:00'); // masih terbuka
    expect(topicScore(s, s.topics[0], early).score).toBeNull();
  });
  test('IP berbobot SKS, topik tanpa nilai diabaikan', () => {
    const s = st({
      topics: [topic('t1', '2026-10-24', 3), topic('t2', '2026-10-24', 1), topic('t3', '2026-10-24', 2)],
      exams: [exam('a', 't1', '2026-10-24'), exam('b', 't2', '2026-10-24')],
      attempts: [graded('a', 90), graded('b', 65)],
    });
    // t3 tidak punya ujian & belum ditutup (now Rabu 28 Okt 12:00 -> tutup 28 Okt 23:59) -> tanpa nilai
    const g = computeGpa(s, d('2026-10-28T12:00'));
    expect(g.ip).toBe(3.5); // (4*3 + 2*1) / 4
    expect(g.scored).toBe(2);
  });
});

describe('cakupan & peringatan', () => {
  test('cakupan: kosong / draf / siap', () => {
    const t = topic('t1');
    const s = st({ topics: [t], exams: [exam('a', 't1', '2026-10-31', { status: 'draft' })] });
    expect(coverage(s, t, '2026-10-31').state).toBe('draf');
    expect(coverage(s, t, '2026-11-07').state).toBe('kosong');
    s.exams[0].status = 'published';
    expect(coverage(s, t, '2026-10-31').state).toBe('siap');
  });
  test('peringatan eskalasi: info (Sen-Rab) -> warning (Kamis) -> critical (Jumat)', () => {
    const s = st({ topics: [topic('t1', '2026-10-24')] });
    const lvl = (iso: string) => buildAlerts(s, d(iso)).find((a) => a.id.startsWith('cov:'))?.level;
    expect(lvl('2026-10-27T10:00')).toBe('info');
    expect(lvl('2026-10-29T10:00')).toBe('warning');
    expect(lvl('2026-10-30T10:00')).toBe('critical');
    expect(lvl('2026-10-31T10:00')).toBe('critical'); // Sabtu tanpa ujian
  });
  test('tidak ada peringatan cakupan bila semua topik siap', () => {
    const s = st({ topics: [topic('t1', '2026-10-24')], exams: [exam('a', 't1', '2026-10-31')] });
    expect(buildAlerts(s, d('2026-10-30T10:00')).some((a) => a.id.startsWith('cov:'))).toBe(false);
  });
});

describe('bobot ujian & pengingat cadangan', () => {
  test('dua ujian di minggu yang sama dirata-rata dengan bobot', () => {
    const now = d('2026-11-04T12:00');
    const s = st({
      topics: [topic('t1', '2026-10-24')],
      exams: [exam('a', 't1', '2026-10-24', { weight: 3 }), exam('b', 't1', '2026-10-24', { weight: 1 })],
      attempts: [graded('a', 100), graded('b', 60)],
    });
    expect(topicScore(s, s.topics[0], now).score).toBe(90); // (100*3 + 60*1) / 4
  });
  test('peringatan cadangan muncul setelah 7 hari tanpa cadangan', () => {
    const s = st({ topics: [topic('t1', '2026-10-10')] });
    expect(buildAlerts(s, d('2026-10-30T10:00')).some((a) => a.id.startsWith('backup:'))).toBe(true);
    s.settings.lastBackupAt = d('2026-10-29T10:00').toISOString();
    expect(buildAlerts(s, d('2026-10-30T10:00')).some((a) => a.id.startsWith('backup:'))).toBe(false);
  });
});
