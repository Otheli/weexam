import { currentNamespace, allBlobIds, deleteBlob, getBlob, loadState, putBlob, requestPersistence, saveState, wipeAll } from './db';
import { attemptFor } from './derive';
import { autoGradeAttempt, computeFinal, letterOf } from './grading';
import { firstRequiredWeek, weekKey } from './time';
import {
  DEFAULT_SETTINGS,
  MAX_TOPICS,
  type AppState,
  type Attempt,
  type EvalFile,
  type Evaluation,
  type Exam,
  type FileKind,
  type FileRef,
  type ReviewItem,
  type Topic,
} from './types';

export function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function emptyState(): AppState {
  return { v: 1, topics: [], exams: [], attempts: [], evaluations: [], settings: structuredClone(DEFAULT_SETTINGS), seenAlerts: {} };
}

let state: AppState = emptyState();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export let saveError = false;

export function getState(): AppState {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((l) => l());
}

const pendKey = () => 'weexam.pending' + (currentNamespace() ? '.' + currentNamespace() : '');
const saveHooks = new Set<() => void>();
/** Dipanggil setiap perubahan lokal berhasil disimpan (dipakai sinkron cloud). */
export function onLocalSaved(fn: () => void) {
  saveHooks.add(fn);
}
let changeCount = 0;
export const localChanges = () => changeCount;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}

export async function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveError = !(await saveState(JSON.parse(JSON.stringify(state))));
  if (!saveError) {
    saveHooks.forEach((h) => h());
    try {
      localStorage.removeItem(pendKey());
    } catch {
      /* abaikan */
    }
  }
}

/** Simpan sinkron saat halaman ditutup (IndexedDB bersifat async dan bisa terpotong). */
function mirrorPending() {
  if (!saveTimer) return;
  try {
    localStorage.setItem(pendKey(), JSON.stringify(state));
  } catch {
    /* kuota penuh: abaikan */
  }
}

/** Ubah state. `silent` = simpan tanpa memicu render ulang (mis. autosave jawaban). */
export function mutate(fn: (s: AppState) => void, silent = false) {
  fn(state);
  changeCount++;
  scheduleSave();
  if (!silent) emit();
}

export function normalizeState(raw: Partial<AppState> | null): AppState {
  const base = emptyState();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    v: 1,
    topics: raw.topics ?? [],
    exams: raw.exams ?? [],
    attempts: raw.attempts ?? [],
    evaluations: raw.evaluations ?? [],
    seenAlerts: raw.seenAlerts ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}), gradeMin: { ...DEFAULT_SETTINGS.gradeMin, ...(raw.settings?.gradeMin ?? {}) } },
  };
}

/** Muat ulang state dari ruang data aktif (tamu/akun). */
export async function reloadFromDisk() {
  if (saveTimer) await flush();
  state = normalizeState(await loadState<AppState>());
  urlCache.clear();
  emit();
}

/** Terapkan data dari cloud tanpa menandainya sebagai perubahan lokal. */
export async function applyRemoteState(next: AppState) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  state = normalizeState(next);
  await saveState(JSON.parse(JSON.stringify(state)));
  emit();
}

export async function initStore() {
  state = normalizeState(await loadState<AppState>());
  try {
    const pend = localStorage.getItem(pendKey());
    if (pend) {
      state = normalizeState(JSON.parse(pend)); // perubahan yang belum sempat masuk IndexedDB
      void flush();
    }
  } catch {
    /* abaikan */
  }
  void requestPersistence();
  addEventListener('pagehide', () => {
    mirrorPending();
    void flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      mirrorPending();
      void flush();
    }
  });
}

export function replaceState(next: AppState) {
  changeCount++;
  state = normalizeState(next);
  scheduleSave();
  emit();
}

// ------------------------------------------------------------------ Topik

export function topicById(id: string | undefined): Topic | undefined {
  return state.topics.find((t) => t.id === id);
}

export function canAddTopic(): boolean {
  return state.topics.length < MAX_TOPICS;
}

export function addTopic(input: Omit<Topic, 'id' | 'startWeek' | 'createdAt'>): Topic | null {
  if (!canAddTopic()) return null;
  const now = new Date();
  const t: Topic = { ...input, id: uid(), startWeek: firstRequiredWeek(now), createdAt: now.toISOString() };
  mutate((s) => s.topics.push(t));
  return t;
}

export function updateTopic(id: string, patch: Partial<Omit<Topic, 'id'>>) {
  mutate((s) => {
    const t = s.topics.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

export async function deleteTopic(id: string) {
  const blobs: string[] = [];
  const t = topicById(id);
  if (t?.cover.kind === 'image') blobs.push(t.cover.blobId);
  state.exams.filter((e) => e.topicId === id).forEach((e) => e.attachments.forEach((f) => blobs.push(f.id)));
  state.evaluations.filter((e) => e.topicId === id).forEach((e) => (e.files ?? []).forEach((f) => blobs.push(f.id)));
  const exIds = new Set(state.exams.filter((e) => e.topicId === id).map((e) => e.id));
  state.attempts.filter((a) => exIds.has(a.examId)).forEach((a) => a.files.forEach((f) => blobs.push(f.id)));
  mutate((s) => {
    s.topics = s.topics.filter((x) => x.id !== id);
    s.exams = s.exams.filter((e) => e.topicId !== id);
    s.attempts = s.attempts.filter((a) => !exIds.has(a.examId));
    s.evaluations = s.evaluations.filter((e) => e.topicId !== id);
  });
  await Promise.all(blobs.map(deleteBlob));
}

// ------------------------------------------------------------------ Berkas

export async function storeFile(file: File | Blob, name?: string): Promise<FileRef> {
  const id = uid();
  await putBlob(id, file);
  return { id, name: name ?? (file as File).name ?? 'berkas', size: file.size, type: file.type || 'application/octet-stream' };
}

const urlCache = new Map<string, string>();
export async function blobUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const b = await getBlob(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

export { getBlob, putBlob, deleteBlob };

/** Perkecil gambar sebelum disimpan (maks 960px, JPEG). */
export async function shrinkImage(file: File, max = 960): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('gagal memproses gambar'))), 'image/jpeg', 0.84));
}

// ------------------------------------------------------------------ Ujian

export function examById(id: string | undefined): Exam | undefined {
  return state.exams.find((e) => e.id === id);
}

export function saveExam(exam: Exam) {
  mutate((s) => {
    const i = s.exams.findIndex((e) => e.id === exam.id);
    const next = { ...exam, updatedAt: new Date().toISOString() };
    if (i >= 0) s.exams[i] = next;
    else s.exams.push(next);
  });
  void flush();
}

/**
 * Hapus agenda. Ujian yang belum dibuka dihapus sungguhan.
 * Ujian yang sudah dibuka hanya disembunyikan: nilainya tetap dihitung agar riwayat tidak bisa dihapus.
 */
export async function removeExam(id: string, now = new Date()): Promise<'deleted' | 'hidden'> {
  const e = examById(id);
  if (!e) return 'deleted';
  const hasAttempt = !!attemptFor(state, id);
  const opened = e.status === 'published' && now.getTime() >= new Date(e.scheduledAt).getTime();
  if (opened || hasAttempt) {
    mutate((s) => {
      const x = s.exams.find((q) => q.id === id);
      if (x) x.archived = true;
    });
    return 'hidden';
  }
  const blobs = e.attachments.map((f) => f.id);
  mutate((s) => {
    s.exams = s.exams.filter((q) => q.id !== id);
  });
  await Promise.all(blobs.map(deleteBlob));
  return 'deleted';
}

// ------------------------------------------------------------------ Percobaan

export function startAttempt(examId: string, now = new Date()): Attempt | null {
  const e = examById(examId);
  if (!e || attemptFor(state, examId)) return null;
  const isMakeup = now.getTime() > new Date(e.regularUntil).getTime();
  const a: Attempt = {
    id: uid(), examId, startedAt: now.toISOString(), isMakeup, answers: {}, files: [], note: '', scores: {}, feedback: '',
    penaltyPct: isMakeup ? e.makeupPenaltyPct : 0,
  };
  mutate((s) => s.attempts.push(a));
  void flush();
  return a;
}

export function saveAnswer(attemptId: string, qid: string, value: number | string) {
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === attemptId);
    if (a && !a.submittedAt) a.answers[qid] = value;
  }, true);
}

export function saveAttemptNote(attemptId: string, note: string) {
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === attemptId);
    if (a && !a.submittedAt) a.note = note;
  }, true);
}

export function submitAttempt(attemptId: string, auto = false, now = new Date()) {
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === attemptId);
    if (!a || a.submittedAt) return;
    const e = s.exams.find((x) => x.id === a.examId);
    if (!e) return;
    a.submittedAt = now.toISOString();
    a.auto = auto;
    const { scores, needsManual } = autoGradeAttempt(e, a);
    a.scores = scores;
    if (!needsManual) {
      const r = computeFinal(e, a);
      a.rawPct = r.rawPct;
      a.finalScore = r.finalScore;
      a.gradedAt = now.toISOString();
    }
  });
  void flush();
}

export function gradeAttempt(attemptId: string, scores: Record<string, number>, manualScore: number | undefined, feedback: string, now = new Date()) {
  mutate((s) => {
    const a = s.attempts.find((x) => x.id === attemptId);
    const e = a && s.exams.find((x) => x.id === a.examId);
    if (!a || !e) return;
    a.scores = scores;
    a.manualScore = manualScore;
    a.feedback = feedback;
    const r = computeFinal(e, a);
    a.rawPct = r.rawPct;
    a.finalScore = r.finalScore;
    a.gradedAt = now.toISOString();
  });
  void flush();
}

// ------------------------------------------------------------------ Evaluasi

function answerText(q: Exam['questions'][number], v: number | string | undefined): string {
  if (v === undefined || v === '') return '(tidak dijawab)';
  if (q.type === 'pg') return q.options?.[v as number] ?? '(tidak dijawab)';
  return String(v);
}

function keyText(q: Exam['questions'][number]): string {
  if (q.type === 'pg') return q.options?.[q.correct ?? -1] ?? '';
  if (q.type === 'isian') return (q.accepted ?? []).join(' / ');
  return q.key ?? '';
}

export function buildReview(exam: Exam, attempt: Attempt | undefined): ReviewItem[] {
  return exam.questions.map((q) => ({
    qid: q.id, type: q.type, text: q.text, options: q.options,
    mine: attempt ? answerText(q, attempt.answers[q.id]) : '(tidak dijawab)',
    key: keyText(q), earned: attempt?.scores[q.id] ?? 0, max: q.points,
  }));
}

export function sendToEvaluation(examId: string, now = new Date()): Evaluation | null {
  const exam = examById(examId);
  if (!exam) return null;
  const existing = state.evaluations.find((ev) => ev.examId === examId);
  if (existing) return existing;
  const attempt = attemptFor(state, examId);
  const ev: Evaluation = {
    id: uid(), topicId: exam.topicId, examId, attemptId: attempt?.id, kind: 'ujian', title: exam.name,
    weekKey: weekKey(new Date(exam.scheduledAt)), score: attempt?.finalScore ?? (attempt?.submittedAt ? undefined : 0),
    review: buildReview(exam, attempt), wrong: '', learned: '', notes: attempt?.feedback ?? '', study: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  mutate((s) => {
    s.evaluations.unshift(ev);
    const e = s.exams.find((x) => x.id === examId);
    if (e) e.evaluatedAt = now.toISOString();
  });
  void syncExamFiles(ev.id);
  return ev;
}

/** Salin berkas soal dan berkas jawaban ujian ke catatan evaluasi (salinan mandiri, aman bila ujian disembunyikan). */
export async function syncExamFiles(evId: string): Promise<number> {
  const ev = state.evaluations.find((x) => x.id === evId);
  const exam = examById(ev?.examId);
  if (!ev || !exam) return 0;
  const attempt = attemptFor(state, exam.id);
  const have = new Set((ev.files ?? []).map((f) => `${f.kind}:${f.name}:${f.size}`));
  const jobs: { f: FileRef; kind: FileKind }[] = [
    ...exam.attachments.map((f) => ({ f, kind: 'soal' as const })),
    ...(attempt?.files ?? []).map((f) => ({ f, kind: 'jawaban' as const })),
  ].filter((j) => !have.has(`${j.kind}:${j.f.name}:${j.f.size}`));
  const added: EvalFile[] = [];
  for (const j of jobs) {
    const b = await getBlob(j.f.id);
    if (!b) continue;
    const ref = await storeFile(b, j.f.name);
    added.push({ ...ref, type: j.f.type || ref.type, kind: j.kind, addedAt: new Date().toISOString() });
  }
  if (added.length) {
    mutate((s) => {
      const e = s.evaluations.find((x) => x.id === evId);
      if (e) (e.files ??= []).push(...added);
    });
  }
  return added.length;
}

export async function addEvalFiles(evId: string, files: File[], kind: FileKind): Promise<number> {
  const added: EvalFile[] = [];
  for (const f of files) {
    const ref = await storeFile(f);
    added.push({ ...ref, kind, addedAt: new Date().toISOString() });
  }
  mutate((s) => {
    const e = s.evaluations.find((x) => x.id === evId);
    if (e) {
      (e.files ??= []).push(...added);
      e.updatedAt = new Date().toISOString();
    }
  });
  return added.length;
}

export async function removeEvalFile(evId: string, fileId: string) {
  mutate((s) => {
    const e = s.evaluations.find((x) => x.id === evId);
    if (e) e.files = (e.files ?? []).filter((f) => f.id !== fileId);
  });
  await deleteBlob(fileId);
}

export function addNote(topicId: string, title: string): Evaluation {
  const now = new Date().toISOString();
  const ev: Evaluation = { id: uid(), topicId, kind: 'catatan', title, review: [], wrong: '', learned: '', notes: '', study: [], createdAt: now, updatedAt: now };
  mutate((s) => s.evaluations.unshift(ev));
  return ev;
}

export function updateEvaluation(id: string, patch: Partial<Evaluation>, silent = true) {
  mutate((s) => {
    const ev = s.evaluations.find((x) => x.id === id);
    if (ev) Object.assign(ev, patch, { updatedAt: new Date().toISOString() });
  }, silent);
}

export async function deleteEvaluation(id: string) {
  const blobs = (state.evaluations.find((x) => x.id === id)?.files ?? []).map((f) => f.id);
  mutate((s) => {
    s.evaluations = s.evaluations.filter((x) => x.id !== id);
  });
  await Promise.all(blobs.map(deleteBlob));
}

// ------------------------------------------------------------------ Cadangan

function blobToB64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function exportBackup(): Promise<Blob> {
  const ids = await allBlobIds();
  const blobs: Record<string, { type: string; data: string }> = {};
  for (const id of ids) {
    const b = await getBlob(id);
    if (b) blobs[id] = { type: b.type, data: await blobToB64(b) };
  }
  mutate((s) => {
    s.settings.lastBackupAt = new Date().toISOString();
  }, true);
  return new Blob([JSON.stringify({ app: 'weexam', version: 1, exportedAt: new Date().toISOString(), state, blobs })], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'weexam' || !data.state) throw new Error('Berkas ini bukan cadangan Weexam.');
  await wipeAll();
  for (const [id, b] of Object.entries<{ type: string; data: string }>(data.blobs ?? {})) {
    const bin = atob(b.data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    await putBlob(id, new Blob([arr], { type: b.type }));
  }
  urlCache.clear();
  replaceState(data.state);
  await flush();
}

export async function resetAll() {
  await wipeAll();
  urlCache.clear();
  state = emptyState();
  await flush();
  emit();
}

export { letterOf };
