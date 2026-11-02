// Notifikasi OS + bunyi. Catatan platform: PWA tanpa server tidak dapat membangunkan aplikasi yang tertutup;
// pengingat dijalankan selama aplikasi terbuka (termasuk di latar belakang) dan didukung ekspor kalender (.ics).
import type { Alert } from './derive';

export function notificationSupport(): 'granted' | 'denied' | 'default' | 'unsupported' {
  return 'Notification' in globalThis ? Notification.permission : 'unsupported';
}

export async function askPermission(): Promise<string> {
  if (!('Notification' in globalThis)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function showOsNotification(a: Alert) {
  if (notificationSupport() !== 'granted') return;
  const opts: NotificationOptions = { body: a.body, tag: a.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: a.level === 'critical', data: { href: a.href } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(a.title, opts)); // wajib di Android Chrome
    new Notification(a.title, opts);
  } catch {
    /* abaikan */
  }
}

let ctx: AudioContext | null = null;
export function chime(level: 'critical' | 'warning' | 'info' = 'warning') {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const notes = level === 'critical' ? [880, 660, 880] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = ctx!.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g).connect(ctx!.destination);
      o.start(t0);
      o.stop(t0 + 0.3);
    });
  } catch {
    /* audio tidak tersedia */
  }
}

export function setBadge(n: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) void nav.setAppBadge?.(n);
    else void nav.clearAppBadge?.();
  } catch {
    /* abaikan */
  }
}

// ------------------------------------------------------------ Kalender (.ics) untuk pengingat andal di luar aplikasi
import type { Exam, Topic } from './types';

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEsc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(items: { exam: Exam; topic?: Topic }[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Weexam//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const { exam, topic } of items) {
    const start = new Date(exam.scheduledAt);
    const end = new Date(new Date(exam.regularUntil).getTime());
    lines.push(
      'BEGIN:VEVENT',
      `UID:${exam.id}@weexam`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEsc(`Ujian: ${exam.name}${topic ? ` (${topic.name})` : ''}`)}`,
      `DESCRIPTION:${icsEsc(`Durasi ${exam.durationMin} menit. Batas susulan ${new Date(exam.makeupUntil).toLocaleString('id-ID')}.`)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Ujian dibuka 1 jam lagi', 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Ujian dibuka 10 menit lagi', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
