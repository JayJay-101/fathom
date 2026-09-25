// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB — the local session log.
//
// This is the port of the backend's `session_logs` table. The record shape
// mirrors it column-for-column minus `user_id`: there is exactly one implicit
// local user, so a foreign key to a fake one would carry no information.
//
// IndexedDB rather than localStorage because this store grows without bound
// (one row per session, forever) and is queried by date for streaks —
// localStorage would eventually hit its ~5MB quota and has no indexes.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'prana';
const DB_VERSION = 1;
const STORE = 'session_logs';

/** One row of the local session log. Mirrors `session_logs` sans `user_id`. */
export interface SessionRecord {
  id: string;
  client_recorded_at: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  pattern_id: string;
  visual_mode: string;
  audio_mode: string;
  cycles_completed: number;
  max_session_depth_reached: number | null;
  end_reason: 'completed' | 'user_stopped';
  is_backdated: boolean;
  review_rating: number | null;
  review_text: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Streak and history queries both walk sessions newest-first.
        store.createIndex('started_at', 'started_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open must not poison every later call — drop the cached promise
  // so the next caller gets a fresh attempt (e.g. after a private-mode prompt).
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Generates a record id. randomUUID needs a secure context; fall back if absent. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Appends a session to the log and returns its id. */
export async function addSession(record: Omit<SessionRecord, 'id'>): Promise<string> {
  const id = newId();
  await tx('readwrite', store => store.add({ ...record, id }));
  return id;
}

/** Every logged session, oldest first. */
export async function allSessions(): Promise<SessionRecord[]> {
  const rows = await tx<SessionRecord[]>('readonly', store => store.getAll());
  return rows.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

/** Replaces the entire log — used by the data importer. */
export async function replaceAllSessions(records: SessionRecord[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    store.clear();
    for (const r of records) store.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
