// Akun & sinkron cloud (Supabase: Auth + Postgres + Storage, paket gratis). Tanpa dependensi, hanya fetch.
// Aplikasi tetap offline-first: semua perubahan disimpan lokal dulu, lalu didorong ke akun di latar belakang.
import { copyNamespace, currentNamespace, getBlob, namespaceHasData, putBlob, setBlobFallback, useNamespace, dropNamespace } from './db';
import { applyRemoteState, flush, getState, localChanges, onLocalSaved, reloadFromDisk } from './store';
import type { AppState } from './types';

interface Cfg { url: string; key: string }
export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } }
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
interface Meta { rev: number; dirty: boolean; uploaded: string[]; lastSyncAt?: string }

declare global {
  interface Window { WEEXAM_CLOUD?: Partial<Cfg> }
}

const SESSION_KEY = 'weexam.session';
const CFG_KEY = 'weexam.cfg';
const GUEST_KEY = 'weexam.guest';
const BUCKET = 'weexam-files';

class NetError extends Error {}
export class AuthError extends Error {}

// ------------------------------------------------------------ Konfigurasi & sesi
let _cfg: Cfg | null | undefined;
export function cloudConfig(): Cfg | null {
  if (_cfg !== undefined) return _cfg;
  const w = window.WEEXAM_CLOUD;
  if (w?.url && w.key && /^https?:\/\//.test(w.url)) {
    _cfg = { url: w.url.replace(/\/+$/, ''), key: w.key };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(_cfg)); } catch { /* abaikan */ }
  } else {
    try { _cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { _cfg = null; }
    if (location.protocol === 'file:') _cfg = null; // versi berkas selalu lokal
  }
  return _cfg ?? null;
}

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* abaikan */ }
}
export const session = () => (cloudConfig() ? readSession() : null);
export const isGuest = () => { try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } };
export function chooseGuest(on: boolean) {
  try { on ? localStorage.setItem(GUEST_KEY, '1') : localStorage.removeItem(GUEST_KEY); } catch { /* abaikan */ }
}
/** Perlu menampilkan layar masuk? (cloud aktif, belum masuk, belum memilih tamu) */
export const needsLogin = () => !!cloudConfig() && !readSession() && !isGuest();

// ------------------------------------------------------------ HTTP
async function raw(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const c = cloudConfig()!;
  const s = init.auth === false ? null : readSession();
  const headers = new Headers(init.headers);
  headers.set('apikey', c.key);
  headers.set('Authorization', `Bearer ${s?.access_token ?? c.key}`);
  try {
    return await fetch(c.url + path, { ...init, headers });
  } catch {
    throw new NetError('offline');
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const s = readSession();
    if (!s) return false;
    const r = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500) writeSession(null), setStatus('off'); // sesi dicabut
      return false;
    }
    writeSession(toSession(await r.json(), s.user));
    return true;
  })().finally(() => (refreshing = null));
  return refreshing;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const s = readSession();
  if (s && s.expires_at - 30 < Date.now() / 1000) await refresh();
  let r = await raw(path, init);
  if (r.status === 401 && readSession()) {
    if (await refresh()) r = await raw(path, init);
  }
  return r;
}

function toSession(b: any, prev?: Session['user']): Session {
  const user = b.user ? { id: b.user.id, email: b.user.email ?? '' } : prev!;
  return { access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at ?? Math.floor(Date.now() / 1000) + (b.expires_in ?? 3600), user };
}

function authMessage(b: any): string {
  const m = String(b?.error_description || b?.msg || b?.message || b?.error || '');
  if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.';
  if (/already registered|already been registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka tautan di kotak masuk emailmu.';
  if (/password.*(least|short|weak)/i.test(m)) return 'Kata sandi terlalu pendek (minimal 6 karakter).';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (/valid email|invalid.*email/i.test(m)) return 'Alamat email tidak valid.';
  return m || 'Terjadi kesalahan. Coba lagi.';
}

// ------------------------------------------------------------ Auth
export async function signIn(email: string, password: string): Promise<void> {
  const r = await raw('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new AuthError(authMessage(b));
  await adopt(toSession(b));
}

/** @returns true bila langsung masuk, false bila perlu konfirmasi email */
export async function signUp(email: string, password: string): Promise<boolean> {
  const r = await raw('/auth/v1/signup', { method: 'POST', auth: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new AuthError(authMessage(b));
  if (b.access_token) {
    await adopt(toSession(b));
    return true;
  }
  if (b.user && Array.isArray(b.user.identities) && !b.user.identities.length) throw new AuthError('Email ini sudah terdaftar. Silakan masuk.');
  return false;
}

export function googleUrl(): string {
  const c = cloudConfig()!;
  return `${c.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

export async function sendReset(email: string): Promise<void> {
  const r = await raw(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', auth: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!r.ok) throw new AuthError(authMessage(await r.json().catch(() => ({}))));
}

export async function setPassword(password: string): Promise<void> {
  const r = await api('/auth/v1/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!r.ok) throw new AuthError(authMessage(await r.json().catch(() => ({}))));
}

/** Setelah masuk: pindahkan data tamu ke akun baru bila akun belum punya data di cloud. */
async function adopt(s: Session) {
  writeSession(s);
  chooseGuest(false);
  try {
    const remote = await fetchRemote(false);
    if (!remote && !(await namespaceHasData(s.user.id)) && (await namespaceHasData(''))) await copyNamespace('', s.user.id);
  } catch { /* offline/kesalahan: lanjut tanpa migrasi */ }
}

/** Tangkap token dari tautan OAuth / pemulihan sandi (#access_token=...). Dipanggil sebelum router. */
export async function consumeAuthHash(): Promise<'recovery' | 'signin' | 'error' | null> {
  const h = location.hash;
  if (!cloudConfig() || !/[#&](access_token|error_description)=/.test(h)) return null;
  const q = new URLSearchParams(h.replace(/^#\/?/, ''));
  history.replaceState(null, '', location.pathname + location.search + '#/dashboard');
  if (q.get('error_description')) return 'error';
  const access = q.get('access_token');
  const refreshTok = q.get('refresh_token');
  if (!access || !refreshTok) return null;
  const r = await raw('/auth/v1/user', { auth: false, headers: { Authorization: `Bearer ${access}` } }).catch(() => null);
  if (!r?.ok) return 'error';
  const u = await r.json();
  const expires = Number(q.get('expires_at')) || Math.floor(Date.now() / 1000) + (Number(q.get('expires_in')) || 3600);
  await adopt({ access_token: access, refresh_token: refreshTok, expires_at: expires, user: { id: u.id, email: u.email ?? '' } });
  return q.get('type') === 'recovery' ? 'recovery' : 'signin';
}

export async function signOut(wipeLocal: boolean): Promise<void> {
  const s = readSession();
  if (s) {
    await syncNow().catch(() => undefined);
    await raw('/auth/v1/logout', { method: 'POST' }).catch(() => undefined);
  }
  writeSession(null);
  chooseGuest(false);
  if (s && wipeLocal) {
    await dropNamespace(s.user.id);
    try { localStorage.removeItem(metaKey(s.user.id)); } catch { /* abaikan */ }
  }
}

// ------------------------------------------------------------ Status
let status: SyncStatus = 'off';
const listeners = new Set<() => void>();
let lastError = '';
function setStatus(s: SyncStatus, err = '') {
  status = s;
  lastError = err;
  listeners.forEach((l) => l());
}
export const syncStatus = () => status;
export const syncError = () => lastError;
export function onSyncStatus(fn: () => void) { listeners.add(fn); }
export const lastSyncAt = () => meta()?.lastSyncAt;

// ------------------------------------------------------------ Meta sinkron
const metaKey = (uid: string) => `weexam.sync.${uid}`;
function meta(): Meta | null {
  const s = readSession();
  if (!s) return null;
  try {
    const m = JSON.parse(localStorage.getItem(metaKey(s.user.id)) || 'null');
    return m ?? { rev: 0, dirty: false, uploaded: [] };
  } catch {
    return { rev: 0, dirty: false, uploaded: [] };
  }
}
function saveMeta(m: Meta) {
  const s = readSession();
  if (!s) return;
  try { localStorage.setItem(metaKey(s.user.id), JSON.stringify(m)); } catch { /* abaikan */ }
}

/** Kumpulkan id berkas yang dirujuk state (objek {id,name,size,type}). */
export function fileIds(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => fileIds(v, out));
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.name === 'string' && typeof o.type === 'string' && typeof o.size === 'number') out.add(o.id);
    for (const v of Object.values(o)) fileIds(v, out);
  }
  return out;
}

// ------------------------------------------------------------ Data jarak jauh
interface Remote { rev: number; data?: AppState }
async function fetchRemote(full: boolean): Promise<Remote | null> {
  const s = readSession()!;
  const r = await api(`/rest/v1/weexam_state?select=${full ? 'rev,data' : 'rev'}&user_id=eq.${s.user.id}`);
  if (!r.ok) throw new Error(`Gagal membaca data akun (${r.status}). Pastikan skema SQL sudah dijalankan.`);
  const rows = await r.json();
  return rows[0] ?? null;
}

async function putRemote(data: AppState, rev: number): Promise<number | 'conflict'> {
  const s = readSession()!;
  const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (rev === 0) {
    const r = await api('/rest/v1/weexam_state', { method: 'POST', headers, body: JSON.stringify({ user_id: s.user.id, data, rev: 1 }) });
    if (r.status === 409) return 'conflict';
    if (!r.ok) throw new Error(`Gagal menyimpan ke akun (${r.status}).`);
    return 1;
  }
  const r = await api(`/rest/v1/weexam_state?user_id=eq.${s.user.id}&rev=eq.${rev}`, { method: 'PATCH', headers, body: JSON.stringify({ data, rev: rev + 1, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`Gagal menyimpan ke akun (${r.status}).`);
  const rows = await r.json();
  return rows.length ? rev + 1 : 'conflict';
}

const objPath = (id: string) => `/storage/v1/object/${BUCKET}/${readSession()!.user.id}/${id}`;

async function uploadFile(id: string, b: Blob) {
  const r = await api(objPath(id), { method: 'POST', headers: { 'x-upsert': 'true', 'Content-Type': b.type || 'application/octet-stream' }, body: b });
  if (!r.ok) throw new Error(r.status === 413 ? 'Ada berkas yang melebihi batas ukuran penyimpanan cloud.' : `Gagal mengunggah berkas (${r.status}).`);
}

async function fetchRemoteBlob(id: string): Promise<Blob | null> {
  if (!readSession() || !cloudConfig()) return null;
  try {
    const r = await api(`/storage/v1/object/authenticated/${BUCKET}/${readSession()!.user.id}/${id}`);
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ Mesin sinkron
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
let again = false;
let asking = false;
let conflictHandler: (() => Promise<'cloud' | 'local' | null>) | null = null;
export function setConflictHandler(fn: typeof conflictHandler) { conflictHandler = fn; }
let onRemoteApplied: (() => void) | null = null;
export function setRemoteAppliedHandler(fn: () => void) { onRemoteApplied = fn; }

function failure(e: unknown) {
  if (e instanceof NetError) setStatus('offline');
  else setStatus('error', e instanceof Error ? e.message : 'Sinkron gagal.');
}

function schedulePush(ms = 1500) {
  if (!readSession()) return;
  const m = meta()!;
  if (!m.dirty) saveMeta({ ...m, dirty: true });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), ms);
}

async function push(): Promise<void> {
  if (!readSession() || !cloudConfig()) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    const startChanges = localChanges();
    const snap = JSON.parse(JSON.stringify(getState())) as AppState;
    const ids = fileIds(snap);
    let m = meta()!;
    for (const id of ids) {
      if (m.uploaded.includes(id)) continue;
      const b = await getBlob(id, true);
      if (!b) continue;
      await uploadFile(id, b);
      m = { ...m, uploaded: [...m.uploaded, id] };
      saveMeta(m);
    }
    const res = await putRemote(snap, m.rev);
    if (res === 'conflict') {
      busy = false;
      await resolveConflict();
      return;
    }
    const stale = m.uploaded.filter((id) => !ids.has(id));
    for (const id of stale) await api(objPath(id), { method: 'DELETE' }).catch(() => undefined);
    m = { ...m, rev: res, dirty: localChanges() !== startChanges, uploaded: m.uploaded.filter((id) => ids.has(id)), lastSyncAt: new Date().toISOString() };
    saveMeta(m);
    setStatus('idle');
    if (m.dirty) again = true;
  } catch (e) {
    failure(e);
  } finally {
    busy = false;
    if (again) { again = false; schedulePush(500); }
  }
}

async function applyRemote(r: Remote) {
  const data = r.data!;
  await applyRemoteState(data);
  const m = meta()!;
  saveMeta({ rev: r.rev, dirty: false, uploaded: [...new Set([...m.uploaded, ...fileIds(data)])], lastSyncAt: new Date().toISOString() });
  onRemoteApplied?.();
}

async function resolveConflict() {
  if (asking) return;
  asking = true;
  setStatus('conflict');
  try {
    const choice = (await conflictHandler?.()) ?? null;
    if (choice === 'cloud') {
      const r = await fetchRemote(true);
      if (r) await applyRemote(r);
      setStatus('idle');
    } else if (choice === 'local') {
      const r = await fetchRemote(false);
      saveMeta({ ...meta()!, rev: r?.rev ?? 0, dirty: true });
      asking = false;
      await push();
    }
  } catch (e) {
    failure(e);
  } finally {
    asking = false;
  }
}

/** Cek perubahan dari perangkat lain; terapkan bila tidak ada perubahan lokal yang belum terkirim. */
export async function pull(): Promise<void> {
  if (!readSession() || !cloudConfig() || busy) return;
  try {
    const m = meta()!;
    const head = await fetchRemote(false);
    if (!head) {
      if (m.rev > 0) saveMeta({ ...m, rev: 0, dirty: true });
      if (m.dirty || m.rev > 0 || getState().topics.length) await push();
      else setStatus('idle');
      return;
    }
    if (head.rev === m.rev) {
      if (m.dirty) await push();
      else setStatus('idle');
      return;
    }
    if (m.dirty) return void (await resolveConflict());
    const full = await fetchRemote(true);
    if (full) await applyRemote(full);
    setStatus('idle');
  } catch (e) {
    failure(e);
  }
}

export async function syncNow(): Promise<void> {
  if (!readSession()) return;
  await flush();
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const m = meta()!;
  if (m.dirty) await push();
  else await pull();
}

// ------------------------------------------------------------ Siklus hidup
/** Dipanggil SEBELUM initStore: tentukan ruang data (tamu / akun). */
export async function prepareCloud(): Promise<'recovery' | 'signin' | 'error' | null> {
  if (!cloudConfig()) return null;
  const hashResult = await consumeAuthHash().catch(() => 'error' as const);
  const s = readSession();
  await useNamespace(s ? s.user.id : '');
  return hashResult;
}

let started = false;
/** Dipanggil SETELAH aplikasi tampil: mulai sinkron di latar belakang. */
export function startSync() {
  if (!cloudConfig() || !readSession() || started) return;
  started = true;
  setBlobFallback(fetchRemoteBlob);
  let seen = localChanges();
  onLocalSaved(() => {
    if (localChanges() === seen) return;
    seen = localChanges();
    schedulePush();
  });
  setStatus('syncing');
  void pull();
  setInterval(() => { if (document.visibilityState === 'visible') void pull(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pull(); });
  addEventListener('online', () => void pull());
  addEventListener('offline', () => setStatus('offline'));
  void reloadFromDisk;
  void putBlob;
  void currentNamespace;
}
