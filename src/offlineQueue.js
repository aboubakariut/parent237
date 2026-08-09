// =====================================================================
// File d'attente hors ligne — IndexedDB
//
// Remplace `localStorage` : synchrone (bloque le rendu), plafonné à ~5 Mo,
// et purgé par Android sous pression mémoire — exactement les téléphones
// de la cible. IndexedDB est asynchrone, durable et sans plafond utile.
//
// Chaque élément porte un `client_id` (UUID) qui sert de clé d'idempotence
// côté serveur : si la réponse se perd au retour, le rejeu ne crée pas de
// doublon (contrainte unique en base, migration 0004).
// =====================================================================

const DB_NAME = 'p237';
const DB_VERSION = 1;
const STORE = 'pending';
const LEGACY_KEY = 'p237_pending_sync';

const MAX_TRIES = 8;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'client_id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export function newClientId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Repli pour les WebView anciennes, fréquentes sur Android d'entrée de gamme.
  const b = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: (a) => a.forEach((_, i) => (a[i] = (Math.random() * 256) | 0)) })
    .getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

/** Ajoute un élément à la file. `type` : 'completion' | 'session'. */
export async function enqueue(type, payload, clientId = newClientId()) {
  const item = {
    client_id: clientId,
    type,
    payload,
    tries: 0,
    last_error: null,
    created_at: new Date().toISOString()
  };
  await tx('readwrite', (store) => store.put(item));
  return item;
}

/** Tous les éléments en attente, du plus ancien au plus récent. */
export async function pending(type = null) {
  const items = await tx('readonly', (store) => ({ __req: store.getAll() }));
  const list = items || [];
  const filtered = type ? list.filter((i) => i.type === type) : list;
  return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function count(type = null) {
  return (await pending(type)).length;
}

export async function remove(clientId) {
  await tx('readwrite', (store) => store.delete(clientId));
}

/** Incrémente le compteur d'essais. Au-delà de MAX_TRIES, l'élément est abandonné. */
export async function markFailure(item, message) {
  const next = { ...item, tries: (item.tries || 0) + 1, last_error: String(message || '').slice(0, 300) };
  if (next.tries >= MAX_TRIES) {
    await remove(item.client_id);
    return { dropped: true, tries: next.tries };
  }
  await tx('readwrite', (store) => store.put(next));
  return { dropped: false, tries: next.tries };
}

/**
 * Reprend la file localStorage de l'ancienne version pour ne rien perdre
 * chez les utilisateurs qui ont déjà installé la PWA.
 */
export async function migrateFromLocalStorage() {
  let raw;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let legacy = [];
  try {
    legacy = JSON.parse(raw) || [];
  } catch {
    localStorage.removeItem(LEGACY_KEY);
    return 0;
  }
  for (const payload of legacy) {
    await enqueue('completion', payload);
  }
  localStorage.removeItem(LEGACY_KEY);
  return legacy.length;
}
