import { examWeek } from './derive';
import { computeFinal } from './grading';
import { defaultSchedule, shiftWeek, weekKey } from './time';
import { PALETTE, PRESETS } from './ui/covers';
import { mutate, uid } from './store';
import type { Attempt, Evaluation, Exam, Question, Topic } from './types';

const NAMES: [string, number][] = [
  ['Struktur Data', 3],
  ['Basis Data', 3],
  ['Desain Antarmuka', 2],
  ['Statistika', 2],
  ['Bahasa Inggris Akademik', 1],
];

function questions(name: string): Question[] {
  return [
    { id: uid(), type: 'pg', text: `Manakah pernyataan yang paling tepat tentang ${name}?`, points: 20, options: ['Pernyataan A', 'Pernyataan B', 'Pernyataan C', 'Pernyataan D'], correct: 1 },
    { id: uid(), type: 'pg', text: 'Pilih konsep yang berhubungan dengan topik minggu ini.', points: 20, options: ['Konsep 1', 'Konsep 2', 'Konsep 3'], correct: 0 },
    { id: uid(), type: 'isian', text: 'Sebutkan istilah untuk definisi dasar topik ini.', points: 20, accepted: ['istilah dasar'] },
    { id: uid(), type: 'esai', text: `Jelaskan satu penerapan ${name} dalam pekerjaan nyata.`, points: 40, key: 'Menyebut konteks, alasan, dan hasil.' },
  ];
}

/** Isi data contoh relatif terhadap tanggal sekarang (untuk mencoba aplikasi). */
export function loadSample(now = new Date()) {
  const cur = weekKey(now);
  const topics: Topic[] = NAMES.map(([name, credits], i) => ({
    id: uid(), name, description: 'Contoh', credits, color: PALETTE[i % PALETTE.length], cover: { kind: 'preset', id: PRESETS[i % PRESETS.length] },
    startWeek: shiftWeek(cur, -3), createdAt: new Date(now.getTime() - 25 * 86400_000).toISOString(),
  }));
  const exams: Exam[] = [];
  const attempts: Attempt[] = [];
  const evaluations: Evaluation[] = [];
  const base = [[92, 88, 75, 82], [70, 78, 84, 80], [55, 62, 68, 72], [96, 90, 94, 91], [48, 58, 64, 66]];

  topics.forEach((t, ti) => {
    for (let w = -3; w <= 1; w++) {
      const wk = shiftWeek(cur, w);
      if (w === 1 && ti === 4) continue; // satu topik sengaja kosong untuk memperlihatkan peringatan
      const sch = defaultSchedule(wk, '09:00', 60);
      const qs = questions(t.name);
      const e: Exam = {
        id: uid(), topicId: t.id, seq: w + 4, name: `${t.name} #${w + 4}`, rules: 'Kerjakan mandiri tanpa membuka catatan.', durationMin: 45, ...sch,
        allowMakeup: true, makeupPenaltyPct: 10, passingScore: 60, questions: qs, attachments: [], status: w === 1 && ti === 3 ? 'draft' : 'published',
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      exams.push(e);
      if (w <= 0 && new Date(sch.scheduledAt).getTime() < now.getTime()) {
        const score = base[ti][w + 3];
        const start = new Date(new Date(sch.scheduledAt).getTime() + 3600_000);
        const a: Attempt = {
          id: uid(), examId: e.id, startedAt: start.toISOString(), submittedAt: new Date(start.getTime() + 40 * 60_000).toISOString(), isMakeup: false,
          answers: {}, files: [], note: '', scores: {}, feedback: '', gradedAt: start.toISOString(), penaltyPct: 0,
        };
        a.manualScore = score;
        const exNoQ = { ...e, questions: [] };
        a.rawPct = computeFinal(exNoQ, a).rawPct;
        a.finalScore = score;
        // sebarkan skor ke poin per soal agar tinjauan terlihat wajar
        let remain = (score / 100) * 100;
        qs.forEach((q) => {
          const got = Math.min(q.points, Math.max(0, remain));
          a.scores[q.id] = Math.round(got);
          remain -= got;
        });
        attempts.push(a);
        if (w === -1 && ti < 2) {
          evaluations.push({
            id: uid(), topicId: t.id, examId: e.id, attemptId: a.id, kind: 'ujian', title: e.name, weekKey: examWeek(e), score,
            review: qs.map((q) => ({ qid: q.id, type: q.type, text: q.text, options: q.options, mine: '(contoh)', key: q.type === 'pg' ? q.options![q.correct!] : q.accepted?.[0] ?? q.key ?? '', earned: a.scores[q.id], max: q.points })),
            wrong: 'Kurang teliti membaca opsi jawaban.', learned: '', notes: '',
            study: [{ id: uid(), text: `Ulangi bab inti ${t.name}`, done: false }, { id: uid(), text: 'Buat ringkasan satu halaman', done: ti === 1 }],
            createdAt: now.toISOString(), updatedAt: now.toISOString(),
          });
          e.evaluatedAt = now.toISOString();
        }
      }
    }
  });
  mutate((s) => {
    s.topics.push(...topics);
    s.exams.push(...exams);
    s.attempts.push(...attempts);
    s.evaluations.push(...evaluations);
  });
}
