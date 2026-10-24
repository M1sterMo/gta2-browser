// Persistent saves for the GTA2 port (R03, D09).
//
// The game writes its profiles (player/plyslotN.dat) and saved games
// (player/plyslotN.svg) with ordinary file calls into the in-memory
// filesystem. When such a file is closed, the core calls fileWritten(); after
// a short quiet period (a save is one write plus several appends) the file is
// stored in IndexedDB in a single transaction, keeping the previous version
// under "<path>#prev" so an interrupted or bad save can be recovered.

import { registerDict, t } from './strings.js';

registerDict({
  en: {
    'ui.storage.openFailed': 'Saves cannot be stored in this browser ({err}). Progress will be lost when the page closes; use Export saves to keep a copy.',
    'ui.storage.deleteFailed': 'Could not delete {path}: {err}',
    'ui.storage.saveFailed': 'Saving {path} failed ({err}). Free some browser storage and save again.',
    'ui.storage.notExport': 'This is not a GTA2 browser save export.',
    'ui.storage.txAborted': 'transaction aborted',
  },
  es: {
    'ui.storage.openFailed': 'Las partidas no se pueden guardar en este navegador ({err}). El progreso se perderá al cerrar la página; usa Exportar partidas para conservar una copia.',
    'ui.storage.deleteFailed': 'No se pudo borrar {path}: {err}',
    'ui.storage.saveFailed': 'No se pudo guardar {path} ({err}). Libera espacio de almacenamiento del navegador y guarda de nuevo.',
    'ui.storage.notExport': 'Esto no es una exportación de partidas del navegador de GTA2.',
    'ui.storage.txAborted': 'transacción cancelada',
  },
  fr: {
    'ui.storage.openFailed': 'Les sauvegardes ne peuvent pas être enregistrées dans ce navigateur ({err}). La progression sera perdue à la fermeture de la page ; utilisez Exporter les sauvegardes pour garder une copie.',
    'ui.storage.deleteFailed': 'Impossible de supprimer {path} : {err}',
    'ui.storage.saveFailed': 'L’enregistrement de {path} a échoué ({err}). Libérez de l’espace de stockage du navigateur et sauvegardez à nouveau.',
    'ui.storage.notExport': 'Ce n’est pas une exportation de sauvegardes du navigateur GTA2.',
    'ui.storage.txAborted': 'transaction interrompue',
  },
});

const DB_NAME = 'gta2-port';
const STORE = 'files';
const QUIET_MS = 250;

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(t('ui.storage.txAborted')));
  });
}

export class SaveStorage {
  /**
   * @param {string} gameDir mount point of the game files in the Emscripten FS
   * @param {(message: string, isError: boolean) => void} report
   */
  constructor(gameDir, report) {
    this.gameDir = gameDir;
    this.report = report;
    this.module = null;
    this.pending = new Map();
    this.db = null;
  }

  async open() {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      this.db = await promisify(req);
    } catch (err) {
      this.db = null;
      this.report(t('ui.storage.openFailed', { err: (err && err.message) || err }), true);
    }
  }

  /** Copies every stored file into the game filesystem (before the game starts). */
  async restoreInto(FS) {
    if (!this.db) return 0;
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = await promisify(store.getAllKeys());
    let restored = 0;
    for (const key of keys) {
      if (key.endsWith('#prev')) continue;
      const entry = await promisify(store.get(key));
      if (!entry || !(entry.data instanceof Uint8Array)) continue;
      const path = `${this.gameDir}/${key}`;
      FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      FS.writeFile(path, entry.data);
      restored++;
    }
    return restored;
  }

  /** Called by the core when a persistent file has been closed after writing. */
  fileWritten(relPath) {
    clearTimeout(this.pending.get(relPath));
    this.pending.set(relPath, setTimeout(() => {
      this.pending.delete(relPath);
      this.persist(relPath);
    }, QUIET_MS));
  }

  fileRemoved(relPath) {
    clearTimeout(this.pending.get(relPath));
    this.pending.delete(relPath);
    if (!this.db) return;
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(relPath);
    txDone(tx).catch((err) => this.report(t('ui.storage.deleteFailed', { path: relPath, err: err.message }), true));
  }

  async persist(relPath) {
    if (!this.db) return;
    let data;
    try {
      data = this.module.FS.readFile(`${this.gameDir}/${relPath}`);
    } catch {
      return; // removed again before the quiet period ended
    }
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const previous = await promisify(store.get(relPath));
      if (previous) store.put(previous, `${relPath}#prev`);
      store.put({ data: new Uint8Array(data), savedAt: Date.now(), bytes: data.length }, relPath);
      await txDone(tx);
      this.lastSaved = { path: relPath, bytes: data.length, at: Date.now() };
    } catch (err) {
      this.report(t('ui.storage.saveFailed', { path: relPath, err: err.message }), true);
    }
  }

  /** Flushes writes still waiting for their quiet period (e.g. on page hide). */
  flush() {
    for (const [path, timer] of this.pending) {
      clearTimeout(timer);
      this.persist(path);
    }
    this.pending.clear();
  }

  /**
   * All stored files as one JSON blob, for backup or moving to another browser. extra: more
   * sections from the shell (version 2: the Saves screen's saves and the map's discovery).
   */
  async exportAll(extra = {}) {
    const out = { format: 'gta2-port-saves', version: 2, files: {}, ...extra };
    if (!this.db) return new Blob([JSON.stringify(out)], { type: 'application/json' });
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const key of await promisify(store.getAllKeys())) {
      if (key.endsWith('#prev')) continue;
      const entry = await promisify(store.get(key));
      let bin = '';
      for (const b of entry.data) bin += String.fromCharCode(b);
      out.files[key] = { savedAt: entry.savedAt, base64: btoa(bin) };
    }
    return new Blob([JSON.stringify(out)], { type: 'application/json' });
  }

  /** Restores files from an export, parsed (takes effect on the next start). */
  async importAll(parsed) {
    if (!parsed || parsed.format !== 'gta2-port-saves' || ![1, 2].includes(parsed.version)) {
      throw new Error(t('ui.storage.notExport'));
    }
    const tx = this.db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let count = 0;
    for (const [path, file] of Object.entries(parsed.files)) {
      if (!/^player\/[a-z0-9_.]+$/.test(path)) continue;
      const bin = atob(file.base64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      store.put({ data, savedAt: file.savedAt || Date.now(), bytes: data.length }, path);
      count++;
    }
    await txDone(tx);
    return count;
  }
}
