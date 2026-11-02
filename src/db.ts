// Penyimpanan lokal: IndexedDB (state + berkas). Jatuh ke localStorage/memori bila IndexedDB tidak tersedia.
let ns = ''; // '' = tamu; selain itu id akun (data tiap akun terpisah di perangkat)
const dbName = () => (ns ? `weexam-u-${ns}` : 'weexam');
const lsKey = () => (ns ? `weexam.state.${ns}` : 'weexam.state');
let fallback: ((id: string) => Promise<Blob | null>) | null = null;

/** Pindah ke ruang data lain (tamu / akun). Koneksi lama ditutup. */
export async function useNamespace(next: string) {
  if (next === ns) return;
  const old = dbp;
  ns = next;
  dbp = null;
  memBlobs.clear();
  (await old)?.close();
}
export const currentNamespace = () => ns;
/** Dipanggil bila berkas tidak ada di perangkat (mis. diunggah dari perangkat lain). */
export function setBlobFallback(fn: ((id: string) => Promise<Blob | null>) | null) {
  fallback = fn;
}
export async function dropNamespace(name: string) {
  if (name === ns) await useNamespace('__tmp__');
  await new Promise<void>((res) => {
    try {
      const r = indexedDB.deleteDatabase(name ? `weexam-u-${name}` : 'weexam');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch {
      res();
    }
  });
  try {
    localStorage.removeItem(name ? `weexam.state.${name}` : 'weexam.state');
  } catch {
    /* abaikan */
  }
}
const KV = 'kv';
const BLOBS = 'blobs';

let dbp: Promise<IDBDatabase | null> | null = null;
const memBlobs = new Map<string, Blob>();

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!('indexedDB' in globalThis)) return resolve(null);
      const req = indexedDB.open(dbName(), 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function loadState<T>(): Promise<T | null> {
  const db = await open();
  if (db) {
    try {
      const v = await wrap(db.transaction(KV).objectStore(KV).get('state'));
      return (v as T) ?? null;
    } catch {
      /* lanjut ke fallback */
    }
  }
  try {
    const raw = localStorage.getItem(lsKey());
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveState(state: unknown): Promise<boolean> {
  const db = await open();
  if (db) {
    try {
      await wrap(db.transaction(KV, 'readwrite').objectStore(KV).put(state, 'state'));
      return true;
    } catch {
      /* fallback */
    }
  }
  try {
    localStorage.setItem(lsKey(), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  memBlobs.set(id, blob);
  const db = await open();
  if (db) await wrap(db.transaction(BLOBS, 'readwrite').objectStore(BLOBS).put(blob, id)).catch(() => undefined);
}

export async function getBlob(id: string, local = false): Promise<Blob | null> {
  const m = memBlobs.get(id);
  if (m) return m;
  const db = await open();
  try {
    const b = db ? ((await wrap(db.transaction(BLOBS).objectStore(BLOBS).get(id))) as Blob | undefined) : undefined;
    if (b) {
      memBlobs.set(id, b);
      return b;
    }
  } catch {
    /* lanjut ke cadangan */
  }
  const r = fallback && !local ? await fallback(id).catch(() => null) : null;
  if (r) await putBlob(id, r);
  return r;
}

export async function deleteBlob(id: string): Promise<void> {
  memBlobs.delete(id);
  const db = await open();
  if (db) await wrap(db.transaction(BLOBS, 'readwrite').objectStore(BLOBS).delete(id)).catch(() => undefined);
}

export async function allBlobIds(): Promise<string[]> {
  const db = await open();
  if (!db) return [...memBlobs.keys()];
  return (await wrap(db.transaction(BLOBS).objectStore(BLOBS).getAllKeys())) as string[];
}

export async function wipeAll(): Promise<void> {
  memBlobs.clear();
  const db = await open();
  if (db) {
    await wrap(db.transaction(KV, 'readwrite').objectStore(KV).clear()).catch(() => undefined);
    await wrap(db.transaction(BLOBS, 'readwrite').objectStore(BLOBS).clear()).catch(() => undefined);
  }
  try {
    localStorage.removeItem(lsKey());
  } catch {
    /* abaikan */
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* abaikan */
  }
  return false;
}

export async function snapshotBlobs(): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  for (const id of await allBlobIds()) {
    const b = await getBlob(id);
    if (b) out.set(id, b);
  }
  return out;
}

function openByName(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(KV);
        req.result.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Apakah ruang data (tamu = '') berisi topik? */
export async function namespaceHasData(name: string): Promise<boolean> {
  const db = await openByName(name ? `weexam-u-${name}` : 'weexam');
  if (!db) return false;
  try {
    const st = (await wrap(db.transaction(KV).objectStore(KV).get('state'))) as { topics?: unknown[] } | undefined;
    return !!st?.topics?.length;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/** Salin seluruh isi ruang data `from` ke `to` (menimpa). */
export async function copyNamespace(from: string, to: string): Promise<void> {
  const a = await openByName(from ? `weexam-u-${from}` : 'weexam');
  const b = await openByName(to ? `weexam-u-${to}` : 'weexam');
  if (!a || !b) return;
  try {
    const st = await wrap(a.transaction(KV).objectStore(KV).get('state'));
    if (st) await wrap(b.transaction(KV, 'readwrite').objectStore(KV).put(st, 'state'));
    const keys = (await wrap(a.transaction(BLOBS).objectStore(BLOBS).getAllKeys())) as string[];
    for (const k of keys) {
      const v = await wrap(a.transaction(BLOBS).objectStore(BLOBS).get(k));
      await wrap(b.transaction(BLOBS, 'readwrite').objectStore(BLOBS).put(v, k));
    }
  } finally {
    a.close();
    b.close();
  }
}
