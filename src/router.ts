import type { Raw } from './ui/dom';

export interface Ctx {
  now: Date;
  parts: string[]; // segmen path setelah '#/'
  query: URLSearchParams;
}

export interface Page {
  title: string;
  subtitle?: (ctx: Ctx) => string;
  render(ctx: Ctx): Raw;
  mount?(root: HTMLElement, ctx: Ctx): void;
  unmount?(): void;
  /** Halaman statis tidak dirender ulang otomatis (editor, ruang ujian). */
  static?: boolean;
  /** Mode fokus: sembunyikan navigasi (ruang ujian). */
  focus?: boolean;
  nav?: 'dashboard' | 'evaluasi' | 'persiapan' | 'ujian' | 'pengaturan';
}

export type Resolver = (parts: string[]) => Page | null;

export function parseHash(): { parts: string[]; query: URLSearchParams } {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q ?? '') };
}

export function go(href: string) {
  if (location.hash === href) location.hash = href + (href.includes('?') ? '&' : '?') + '_=' + Date.now();
  else location.hash = href;
}

export function hrefWith(base: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
