/**
 * @fileoverview File System Access API helpers for the optional on-disk
 * settings file. UI-only (file pickers require a window + user gesture).
 *
 * MV3 note: an extension cannot read an arbitrary path like `~/helmsman.json`
 * directly. The user picks a file once via a save dialog; the handle is
 * persisted in IndexedDB (chrome.storage can't serialize handles) and reused on
 * later loads, re-prompting for permission when required.
 */

const IDB_NAME = 'helmsman';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'settings-file';

/** True when the current context supports the File System Access save picker. */
export const isFileSystemAccessSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });

const idbGet = async (key: string): Promise<unknown> => {
  const db = await openDb();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
  } finally {
    db.close();
  }
};

const idbSet = async (key: string, value: unknown): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
    });
  } finally {
    db.close();
  }
};

const idbDelete = async (key: string): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  } finally {
    db.close();
  }
};

/** Prompt the user to choose/create a settings file and persist its handle. */
export const pickSettingsFile = async (): Promise<FileSystemFileHandle> => {
  const picker = window.showSaveFilePicker;
  if (!picker) throw new Error('File System Access API is not available');
  const handle = await picker({
    suggestedName: 'helmsman-settings.json',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
  });
  await idbSet(HANDLE_KEY, handle);
  return handle;
};

export const getSavedHandle = async (): Promise<FileSystemFileHandle | undefined> => {
  const value = await idbGet(HANDLE_KEY);
  return value instanceof FileSystemFileHandle ? value : undefined;
};

export const clearSavedHandle = (): Promise<void> => idbDelete(HANDLE_KEY);

/** Ensure read or read/write permission on a handle, prompting if needed. */
export const ensurePermission = async (
  handle: FileSystemFileHandle,
  write: boolean,
): Promise<boolean> => {
  const mode = write ? 'readwrite' : 'read';
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
};

/** Read and parse the settings file, or undefined if unreadable. */
export const readSettingsFile = async <T>(): Promise<T | undefined> => {
  const handle = await getSavedHandle();
  if (!handle || !(await ensurePermission(handle, false))) return undefined;
  const file = await handle.getFile();
  const text = await file.text();
  if (!text.trim()) return undefined;
  return JSON.parse(text) as T;
};

/** Serialize and write a value to the settings file. */
export const writeSettingsFile = async (value: unknown): Promise<void> => {
  const handle = await getSavedHandle();
  if (!handle || !(await ensurePermission(handle, true))) {
    throw new Error('No writable settings file selected');
  }
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
};
