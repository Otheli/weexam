export type ID = string;

export type Cover = { kind: 'preset'; id: string } | { kind: 'image'; blobId: string };

export interface Topic {
  id: ID;
  name: string;
  description: string;
  credits: number; // bobot "SKS" untuk Indeks Prestasi
  color: string;
  cover: Cover;
  startWeek: string; // weekKey (Sabtu) pertama yang wajib punya ujian
  createdAt: string;
}

export type QType = 'pg' | 'isian' | 'esai';

export interface Question {
  id: ID;
  type: QType;
  text: string;
  points: number;
  options?: string[]; // pg
  correct?: number; // pg
  accepted?: string[]; // isian: jawaban yang diterima
  key?: string; // esai: kunci / rubrik
}

export interface FileRef {
  id: ID; // kunci blob di IndexedDB
  name: string;
  size: number;
  type: string;
}

export interface Exam {
  id: ID;
  topicId: ID;
  seq: number; // ujian ke-N untuk topik
  name: string;
  rules: string;
  durationMin: number;
  scheduledAt: string; // ISO, mulai dibuka
  regularUntil: string; // ISO, batas pengerjaan reguler
  makeupUntil: string; // ISO, batas susulan (ujian ditutup)
  allowMakeup: boolean;
  makeupPenaltyPct: number;
  passingScore: number;
  acceptUploads?: boolean; // peserta dapat mengunggah berkas jawaban/proyek
  weight?: number; // bobot ujian dalam rata-rata mingguan (default 1)
  questions: Question[];
  attachments: FileRef[];
  status: 'draft' | 'published';
  archived?: boolean; // disembunyikan dari agenda, nilai tetap dihitung
  evaluatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attempt {
  id: ID;
  examId: ID;
  startedAt: string;
  submittedAt?: string;
  isMakeup: boolean;
  auto?: boolean; // dikirim otomatis saat waktu habis
  answers: Record<ID, number | string>;
  files: FileRef[];
  note: string;
  scores: Record<ID, number>; // poin per soal
  manualScore?: number; // untuk ujian tanpa soal (berkas/proyek), skala 0-100
  feedback: string;
  gradedAt?: string;
  rawPct?: number;
  penaltyPct: number;
  finalScore?: number; // 0-100
}

export interface StudyItem {
  id: ID;
  text: string;
  done: boolean;
}

export interface ReviewItem {
  qid: ID;
  type: QType;
  text: string;
  options?: string[];
  mine: string;
  key: string;
  earned: number;
  max: number;
}

export type FileKind = 'soal' | 'jawaban' | 'materi' | 'lainnya';

export interface EvalFile extends FileRef {
  kind: FileKind;
  addedAt: string;
}

export interface Evaluation {
  id: ID;
  topicId: ID;
  examId?: ID;
  attemptId?: ID;
  kind: 'ujian' | 'catatan';
  title: string;
  weekKey?: string;
  score?: number;
  review: ReviewItem[];
  wrong: string;
  learned: string;
  notes: string;
  study: StudyItem[];
  files?: EvalFile[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GradeScale {
  A: number;
  B: number;
  C: number;
  D: number; // di bawah D = E
}

export interface Settings {
  gradeMin: GradeScale;
  scoreWindow: number; // jumlah minggu terakhir yang dihitung; 0 = semua
  emptyWeekZero: boolean;
  defaultDuration: number;
  defaultTime: string; // HH:mm
  defaultPenalty: number;
  osNotifications: boolean;
  sound: boolean;
  lastBackupAt?: string;
}

export interface AppState {
  v: 1;
  topics: Topic[];
  exams: Exam[];
  attempts: Attempt[];
  evaluations: Evaluation[];
  settings: Settings;
  seenAlerts: Record<string, string>;
}

export const MAX_TOPICS = 20;

export const DEFAULT_SETTINGS: Settings = {
  gradeMin: { A: 80, B: 70, C: 60, D: 50 },
  scoreWindow: 8,
  emptyWeekZero: true,
  defaultDuration: 60,
  defaultTime: '09:00',
  defaultPenalty: 10,
  osNotifications: false,
  sound: true,
};
