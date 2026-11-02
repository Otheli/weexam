// Pembantu DOM tanpa framework: template string beraman XSS + delegasi event.
export class Raw {
  constructor(public readonly s: string) {}
  toString() {
    return this.s;
  }
}

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const raw = (s: string) => new Raw(s);

function part(v: unknown): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/** html`...`: semua nilai di-escape kecuali Raw (hasil html``/raw()). */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

// ------------------------------------------------------------ Aksi (delegasi klik)
type ActionFn = (el: HTMLElement, ev: Event) => void | Promise<void>;
const actions = new Map<string, ActionFn>();

export function action(name: string, fn: ActionFn) {
  actions.set(name, fn);
}

let delegated = false;
export function installDelegation() {
  if (delegated) return;
  delegated = true;
  document.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const fn = actions.get(el.dataset.act!);
    if (!fn) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') ev.preventDefault();
    void fn(el, ev);
  });
  document.addEventListener('submit', (ev) => {
    const form = ev.target as HTMLFormElement;
    const name = form.dataset.submit;
    if (!name) return;
    ev.preventDefault();
    void actions.get(name)?.(form, ev);
  });
  document.addEventListener('change', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-change]');
    if (el) void actions.get(el.dataset.change!)?.(el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-input]');
    if (el) void actions.get(el.dataset.input!)?.(el, ev);
  });
}

// ------------------------------------------------------------ Ikon (gaya garis 24px)
const P: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  evaluasi: '<path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="m9.5 11.5 2 2 3.5-4"/>',
  persiapan: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M9 14h6M9 17.5h4"/>',
  ujian: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/><path d="m9.5 15 1.8 1.8 3.2-3.4"/>',
  bell: '<path d="M6 9.5a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.500 2-6.500z"/><path d="M10 19.5a2.200 2.200 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  left: '<path d="m14.500 6-6 6 6 6"/>',
  right: '<path d="m9.500 6 6 6-6 6"/>',
  down: '<path d="m6 9.500 6 6 6-6"/>',
  more: '<circle cx="5.500" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="18.500" cy="12" r="1.200"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7"/><path d="m6.500 7 .8 12.500h9.400L17.500 7"/><path d="M10 11v5M14 11v5"/>',
  pencil: '<path d="m4.500 19.500.8-4L16 4.800a1.800 1.800 0 0 1 2.500 0l.7.7a1.800 1.800 0 0 1 0 2.500L8.500 18.700z"/><path d="m14 7 3 3"/>',
  lock: '<rect x="5" y="10.500" width="14" height="9.500" rx="2.500"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  download: '<path d="M12 4v11"/><path d="m7.500 11 4.500 4.500 4.500-4.500"/><path d="M5 19.500h14"/>',
  upload: '<path d="M12 15.500V4.500"/><path d="m7.500 9 4.500-4.500L16.500 9"/><path d="M5 19.500h14"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2.500"/><circle cx="9" cy="10" r="1.500"/><path d="m5 17 4.500-4.500 3 3 2.500-2.500L19 17"/>',
  settings: '<path d="M4 7h9.500M17.500 7H20M4 17h2.500M10.500 17H20"/><circle cx="15.500" cy="7" r="2.200"/><circle cx="8.500" cy="17" r="2.200"/>',
  alert: '<path d="M12 4 3 19.500h18z"/><path d="M12 10v4.500M12 17.300v.2"/>',
  back: '<path d="M19 12H5.500"/><path d="m11 6.500-5.500 5.500 5.500 5.500"/>',
  play: '<path d="M8 5.500v13l11-6.500z"/>',
  send: '<path d="M20 4 10.500 13.500"/><path d="M20 4 14 20l-3.500-6.500L4 10z"/>',
  calplus: '<rect x="4" y="5" width="16" height="15" rx="2.500"/><path d="M4 10h16M8.500 3v4M15.500 3v4M12 13v4.500M9.700 15.300h4.600"/>',
  copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2.500"/><path d="M15.500 8.500V6.500a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  file: '<path d="M14 3.500H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.500z"/><path d="M14 3.500v5h5"/>',
  paperclip: '<path d="m19.500 11.500-7.200 7.200a4.500 4.500 0 0 1-6.400-6.400l7.700-7.700a3 3 0 0 1 4.200 4.200l-7.600 7.600a1.500 1.500 0 0 1-2.100-2.100l7-7"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4 4"/>',
  book: '<path d="M5 4.500h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  flag: '<path d="M6 21V4.500"/><path d="M6 5h11l-2 3.500 2 3.500H6"/>',
  smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>',
  monitor: '<rect x="3.500" y="4.500" width="17" height="11.500" rx="2"/><path d="M9 20h6M12 16v4"/>',
  shield: '<path d="M12 3.500 5 6v5.500c0 4.200 2.900 7.300 7 9 4.100-1.700 7-4.800 7-9V6z"/><path d="m9 12 2.200 2.200L15.200 10"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  list: '<path d="M8.500 6.500H20M8.500 12H20M8.500 17.500H20"/><circle cx="4.500" cy="6.500" r=".8"/><circle cx="4.500" cy="12" r=".8"/><circle cx="4.500" cy="17.500" r=".8"/>',
  cloud: '<path d="M7 18.500a4.500 4.500 0 0 1-.600-8.960A6 6 0 0 1 18 9.500a4.500 4.500 0 0 1-.500 9z"/>',
  logout: '<path d="M10 4.500H6.500a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M15 8.500 19 12l-4 3.500M19 12H9.500"/>',
  refresh: '<path d="M19.500 12a7.500 7.500 0 1 1-2.200-5.300"/><path d="M19.500 4.500v4h-4"/>',
};

export function icon(name: string, size = 20, cls = ''): Raw {
  const body = P[name] ?? '';
  return new Raw(
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
  );
}
