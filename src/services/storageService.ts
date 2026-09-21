import { validateSave } from './saveValidation';
/**
 * Local persistence (IndexedDB). Nothing leaves the device.
 *  kv       : profile + settings
 *  sessions : one record per reading (no audio)
 *  audio    : 16 kHz PCM per session, only the most recent few are kept
 */
import type { Profile, SessionRecord, Settings } from './profile';

const DB_NAME = 'vaani';
const DB_VERSION = 1;
const KEEP_AUDIO = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const storage = {
  getProfile: () => run<Profile | undefined>('kv', 'readonly', (s) => s.get('profile')),
  saveProfile: (p: Profile) => run<void>('kv', 'readwrite', (s) => s.put({ ...p, updatedAt: Date.now() }, 'profile')),

  getSettings: async (): Promise<Settings> =>
    (await run<Settings | undefined>('kv', 'readonly', (s) => s.get('settings'))) ?? { voice: 'basic' },
  saveSettings: (v: Settings) => run<void>('kv', 'readwrite', (s) => s.put(v, 'settings')),

  async saveCompletedSession(record: SessionRecord, profile: Profile) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'sessions'], 'readwrite');
      tx.objectStore('kv').put(profile, 'profile');
      tx.objectStore('sessions').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  },
  saveSession: (r: SessionRecord) => run<void>('sessions', 'readwrite', (s) => s.put(r)),
  listSessions: async (): Promise<SessionRecord[]> =>
    ((await run<SessionRecord[]>('sessions', 'readonly', (s) => s.getAll())) ?? []).sort((a, b) => a.createdAt - b.createdAt),

  async saveAudio(id: string, pcm: Float32Array) {
    await run<void>('audio', 'readwrite', (s) => s.put(pcm, id));
    const keys = (await run<IDBValidKey[]>('audio', 'readonly', (s) => s.getAllKeys())) ?? [];
    const sessions = await this.listSessions();
    const order = new Map(sessions.map((x) => [x.id, x.createdAt]));
    const stale = keys
      .map(String)
      .sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0))
      .slice(KEEP_AUDIO);
    if (stale.length) await run<void>('audio', 'readwrite', (s) => { stale.forEach((k) => s.delete(k)); });
  },

  async exportAll(): Promise<string> {
    return JSON.stringify(
      { app: 'vaani', version: 1, exportedAt: Date.now(), profile: await this.getProfile(), settings: await this.getSettings(), sessions: await this.listSessions() },
      null,
      2,
    );
  },

  async importAll(json: string) {
    const data = JSON.parse(json);
    validateSave(data);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv','sessions','audio'], 'readwrite');
      tx.objectStore('sessions').clear();
      tx.objectStore('audio').clear();
      tx.objectStore('kv').put(data.profile, 'profile');
      if (data.settings) tx.objectStore('kv').put(data.settings, 'settings');
      for (const session of data.sessions) tx.objectStore('sessions').put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  },

  /** Rough on-device usage (models + progress), in bytes. */
  async usageBytes(): Promise<number | null> {
    const est = await navigator.storage?.estimate?.();
    return est?.usage ?? null;
  },

  /** Delete the downloaded model files. Progress and settings are kept. */
  async clearDownloads() {
    for (const name of ['transformers-cache', 'kokoro-voices']) {
      try { await caches.delete(name); } catch { /* cache API unavailable */ }
    }
  },

  async resetAll() {
    await run<void>('kv', 'readwrite', (s) => { s.delete('profile'); });
    await run<void>('sessions', 'readwrite', (s) => { s.clear(); });
    await run<void>('audio', 'readwrite', (s) => { s.clear(); });
  },
};
