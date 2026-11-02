// Pemasangan: PWA (Android/Windows) lewat satu tombol bila peramban mendukung.
interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
export const onInstallChange = (fn: () => void) => listeners.add(fn);

export function initInstall() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open' && e.data.href) location.hash = e.data.href;
    });
  }
}

export function canPrompt(): boolean {
  return !!deferred;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return r.outcome === 'accepted';
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function platform(): 'android' | 'windows' | 'ios' | 'lain' {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  return 'lain';
}

export const isFileMode = () => location.protocol === 'file:';
