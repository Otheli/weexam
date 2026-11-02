// Siklus mingguan Weexam: Sabtu (0) ... Jumat (6)
//   Sabtu-Minggu  : Ujian Mingguan
//   Senin-Rabu    : Evaluasi Ujian + ujian susulan
//   Kamis-Jumat   : Persiapan Ujian
export type Phase = 'ujian' | 'evaluasi' | 'persiapan';

export const DAY_MS = 86_400_000;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Tambah hari kalender (aman terhadap perubahan DST). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** 0 = Sabtu ... 6 = Jumat */
export function cycleDay(d: Date): number {
  return (d.getDay() + 1) % 7;
}

export function cycleStart(d: Date): Date {
  return startOfDay(addDays(d, -cycleDay(d)));
}

export function weekKey(d: Date): string {
  return dateKey(cycleStart(d));
}

export function shiftWeek(key: string, n: number): string {
  return dateKey(addDays(parseKey(key), n * 7));
}

export function phaseOf(d: Date): Phase {
  const i = cycleDay(d);
  if (i <= 1) return 'ujian';
  if (i <= 4) return 'evaluasi';
  return 'persiapan';
}

/** Akhir hari Rabu pada siklus tersebut: batas susulan standar. */
export function weekCloseAt(key: string): Date {
  return endOfDay(addDays(parseKey(key), 4));
}

/** Akhir hari Minggu: batas pengerjaan reguler standar. */
export function weekRegularEnd(key: string): Date {
  return endOfDay(addDays(parseKey(key), 1));
}

/** Siklus tempat ujian untuk persiapan sekarang akan berlangsung (selalu siklus berikutnya). */
export function prepTargetWeek(now: Date): string {
  return shiftWeek(weekKey(now), 1);
}

/** Minggu pertama yang wajib dimiliki topik baru: Sabtu berikutnya (selalu setelah hari ini). */
export function firstRequiredWeek(createdAt: Date): string {
  return shiftWeek(weekKey(createdAt), 1);
}

export const DAY_NAMES = ['Sabtu', 'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
export const DAY_SHORT = ['Sab', 'Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum'];

export const PHASE_LABEL: Record<Phase, string> = {
  ujian: 'Ujian Mingguan',
  evaluasi: 'Evaluasi & susulan',
  persiapan: 'Persiapan',
};

/** Nilai default jadwal ujian pada siklus tertentu. */
export function defaultSchedule(key: string, timeHHmm: string, durationMin: number) {
  const [hh, mm] = timeHHmm.split(':').map(Number);
  const open = parseKey(key);
  open.setHours(hh, mm, 0, 0);
  const regular = weekRegularEnd(key);
  const close = weekCloseAt(key);
  void durationMin;
  return { scheduledAt: open.toISOString(), regularUntil: regular.toISOString(), makeupUntil: close.toISOString() };
}

/** Pastikan urutan buka <= reguler <= tutup untuk jadwal sembarang. */
export function scheduleFor(openIso: string): { regularUntil: string; makeupUntil: string } {
  const open = new Date(openIso);
  const key = weekKey(open);
  let reg = weekRegularEnd(key);
  if (reg.getTime() < open.getTime()) reg = endOfDay(open);
  let close = weekCloseAt(key);
  if (close.getTime() <= reg.getTime()) close = endOfDay(addDays(reg, 3));
  return { regularUntil: reg.toISOString(), makeupUntil: close.toISOString() };
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

const fmtDayDate = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
const fmtFullDate = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });

export const fmt = {
  dayDate: (d: Date | string) => fmtDayDate.format(new Date(d)),
  short: (d: Date | string) => fmtShortDate.format(new Date(d)),
  full: (d: Date | string) => fmtFullDate.format(new Date(d)),
  time: (d: Date | string) => fmtTime.format(new Date(d)).replace('.', ':'),
  dateTime: (d: Date | string) => `${fmtShortDate.format(new Date(d))}, ${fmtTime.format(new Date(d)).replace('.', ':')}`,
};

export function weekRangeLabel(key: string): string {
  const s = parseKey(key);
  const e = addDays(s, 6);
  return `${fmt.short(s)} – ${fmt.short(e)}`;
}

/** Durasi ringkas: "2 hari 3 j", "45 mnt", "12 dtk". */
export function fmtDuration(ms: number, withSeconds = false): string {
  const abs = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (d > 0) return h > 0 ? `${d} hari ${h} j` : `${d} hari`;
  if (h > 0) return m > 0 ? `${h} j ${m} mnt` : `${h} j`;
  if (m > 0) return withSeconds ? `${m} mnt ${s} dtk` : `${m} mnt`;
  return `${s} dtk`;
}

export function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
