// The service worker can't read localStorage, so the app also keeps here what notifications need:
// - each paired server's name. Notifications use it rather than a name sent in the push, so a server
//   can't pass itself off as another.
// - the language picked in the app's settings.
// No window-only APIs here: the service worker imports this file.

import { isLanguage, type Language } from "../locales";

const DB_NAME = "tidings";
const SERVER_NAMES = "serverNames";
const SETTINGS = "settings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 2 added the settings store.
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [SERVER_NAMES, SETTINGS]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(
  store: string,
  change: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      change(tx.objectStore(store));
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function read(store: string, key: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Replaces the stored names with these servers' names. */
export function saveServerNames(
  servers: { id: string; name: string }[],
): Promise<void> {
  return write(SERVER_NAMES, (store) => {
    store.clear();
    for (const server of servers) store.put(server.name, server.id);
  });
}

export async function serverName(id: string): Promise<string | undefined> {
  const name = await read(SERVER_NAMES, id);
  return typeof name === "string" ? name : undefined;
}

export function saveLanguage(language: Language): Promise<void> {
  return write(SETTINGS, (store) => store.put(language, "language"));
}

export async function savedLanguage(): Promise<Language> {
  const language = await read(SETTINGS, "language");
  return isLanguage(language) ? language : "system";
}
