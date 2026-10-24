// Keeps the player's own GTA2 files in this browser (IndexedDB) after they are
// picked once, so later visits start without choosing the folder again.
//
// The files never leave the computer: they are stored per site, per browser,
// like any other site data. A "complete" marker is written last, so an
// interrupted copy is never used. "Forget game files" deletes the copy.

import { lang, registerDict, t } from './strings.js';

// ui.files.badSize / checksum / unpackFailed / noFiles are the keys web/installer-worker.js
// sends back; the worker has no access to the language, so they are translated here.
registerDict({
  en: {
    'ui.files.notInstaller': 'That is not the GTA2 freeware installer: GTA2INSTALLER.exe is {size} bytes.',
    'ui.files.workerFailed': 'The unpacking worker failed.',
    'ui.files.txAborted': 'transaction aborted',
    'ui.files.downloadFailed': 'The download failed (HTTP {status})',
    'ui.files.tooLarge': 'The download is larger than the GTA2 installer',
    'ui.files.stoppedEarly': 'The download stopped early ({got} of {total} bytes)',
    'ui.files.stalled': 'The Internet Archive sent nothing for {n} seconds',
    'ui.files.unreachable': 'The Internet Archive could not be reached ({err})',
    'ui.files.badSize': 'The installer has the wrong size ({n} bytes).',
    'ui.files.checksum': 'The installer does not match the GTA2 freeware release (checksum mismatch).',
    'ui.files.unpackFailed': 'Unpacking failed (unshield {rc}): {log}',
    'ui.files.noFiles': 'Unpacking produced no game files: {log}',
  },
  es: {
    'ui.files.notInstaller': 'Ese no es el instalador freeware de GTA2: GTA2INSTALLER.exe ocupa {size} bytes.',
    'ui.files.workerFailed': 'El proceso de descompresión falló.',
    'ui.files.txAborted': 'transacción cancelada',
    'ui.files.downloadFailed': 'La descarga falló (HTTP {status})',
    'ui.files.tooLarge': 'La descarga es mayor que el instalador de GTA2',
    'ui.files.stoppedEarly': 'La descarga se detuvo antes de tiempo ({got} de {total} bytes)',
    'ui.files.stalled': 'El Internet Archive no envió nada durante {n} segundos',
    'ui.files.unreachable': 'No se pudo contactar con el Internet Archive ({err})',
    'ui.files.badSize': 'El instalador tiene un tamaño incorrecto ({n} bytes).',
    'ui.files.checksum': 'El instalador no coincide con la edición freeware de GTA2 (la suma de comprobación no coincide).',
    'ui.files.unpackFailed': 'La descompresión falló (unshield {rc}): {log}',
    'ui.files.noFiles': 'La descompresión no produjo archivos de juego: {log}',
  },
  fr: {
    'ui.files.notInstaller': 'Ce n’est pas l’installateur freeware de GTA2 : GTA2INSTALLER.exe fait {size} octets.',
    'ui.files.workerFailed': 'Le processus de décompression a échoué.',
    'ui.files.txAborted': 'transaction interrompue',
    'ui.files.downloadFailed': 'Le téléchargement a échoué (HTTP {status})',
    'ui.files.tooLarge': 'Le téléchargement est plus grand que l’installateur de GTA2',
    'ui.files.stoppedEarly': 'Le téléchargement s’est arrêté trop tôt ({got} sur {total} octets)',
    'ui.files.stalled': 'Internet Archive n’a rien envoyé pendant {n} secondes',
    'ui.files.unreachable': 'Impossible de joindre Internet Archive ({err})',
    'ui.files.badSize': 'L’installateur a une taille incorrecte ({n} octets).',
    'ui.files.checksum': 'L’installateur ne correspond pas à l’édition freeware de GTA2 (somme de contrôle différente).',
    'ui.files.unpackFailed': 'La décompression a échoué (unshield {rc}) : {log}',
    'ui.files.noFiles': 'La décompression n’a produit aucun fichier de jeu : {log}',
  },
});

const DB_NAME = 'gta2-port-gamefiles';
const FILES = 'files';
const META = 'meta';
const FORMAT = 1;

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
    tx.onabort = () => reject(tx.error || new Error(t('ui.files.txAborted')));
  });
}

function openDb() {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(FILES);
    req.result.createObjectStore(META);
  };
  return promisify(req);
}

// Rockstar's December 2004 freeware release, as archived by the Internet
// Archive (item gta2_rockstar-classics; README.md "Provenance"). The /cors/
// address serves it with CORS headers, so the player's browser can fetch it
// directly; this site never stores or serves game files. For private testing.
const INSTALLER_URL = 'https://archive.org/cors/gta2_rockstar-classics/GTA2INSTALLER.exe';
const INSTALLER_SIZE = 362331961;

/**
 * Downloads the freeware installer into this browser and unpacks it in a
 * worker (web/installer-worker.js).
 * @param {(stage: string, done: number, total: number) => void} onProgress
 * @returns {Promise<Map<string, Blob>>} game files keyed by lower-case relative path
 */
let keptInstaller = null; // a verified download whose unpacking failed, for a retry

export async function downloadFreeware(onProgress) {
  const buf = keptInstaller || await fetchInstaller(onProgress);
  keptInstaller = null;
  return unpackInstaller(buf, onProgress);
}

/**
 * Checks and unpacks the freeware installer (GTA2INSTALLER.exe) the player
 * downloaded themselves, then picked as a file.
 * @param {File} file
 */
export async function unpackInstallerFile(file, onProgress) {
  if (file.size !== INSTALLER_SIZE) {
    throw new Error(t('ui.files.notInstaller', { size: new Intl.NumberFormat(lang()).format(INSTALLER_SIZE) }));
  }
  onProgress('read', 0, file.size);
  return unpackInstaller(new Uint8Array(await file.arrayBuffer()), onProgress);
}

async function unpackInstaller(buf, onProgress) {
  const worker = new Worker(new URL('./installer-worker.js', import.meta.url), { type: 'module' });
  try {
    const files = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.stage, m.done, m.total);
        else if (m.type === 'done') resolve(m.files);
        else if (m.type === 'error') {
          if (m.installer && m.installer.byteLength === INSTALLER_SIZE) keptInstaller = new Uint8Array(m.installer);
          // the worker sends translation keys; it has no access to the language
          reject(new Error(m.key ? t(m.key, m.vars) : m.message));
        }
      };
      worker.onerror = () => reject(new Error(t('ui.files.workerFailed')));
      worker.postMessage({ installer: buf.buffer }, [buf.buffer]);
    });
    return new Map(files.map(([rel, data]) => [rel, new Blob([data])]));
  } finally {
    worker.terminate();
  }
}

// A download that receives nothing for this long is given up, so Play can try again.
const STALL_MS = 45000;

async function fetchInstaller(onProgress) {
  const abort = new AbortController();
  let timer = 0;
  const watch = () => { clearTimeout(timer); timer = setTimeout(() => abort.abort(), STALL_MS); };
  watch();
  try {
    const res = await fetch(INSTALLER_URL, { signal: abort.signal });
    if (!res.ok || !res.body) throw new Error(t('ui.files.downloadFailed', { status: res.status }));
    const buf = new Uint8Array(INSTALLER_SIZE);
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      watch();
      if (got + value.length > INSTALLER_SIZE) throw new Error(t('ui.files.tooLarge'));
      buf.set(value, got);
      got += value.length;
      onProgress('download', got, INSTALLER_SIZE);
    }
    if (got !== INSTALLER_SIZE) {
      const bytes = (n) => new Intl.NumberFormat(lang()).format(n);
      throw new Error(t('ui.files.stoppedEarly', { got: bytes(got), total: bytes(INSTALLER_SIZE) }));
    }
    return buf;
  } catch (err) {
    if (abort.signal.aborted) throw new Error(t('ui.files.stalled', { n: STALL_MS / 1000 }));
    if (err instanceof TypeError) throw new Error(t('ui.files.unreachable', { err: err.message }));
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class GameFileCache {
  /** @returns {Promise<{count:number, bytes:number, savedAt:number}|null>} the stored copy, if complete. */
  async info() {
    try {
      const db = await openDb();
      const meta = await promisify(db.transaction(META, 'readonly').objectStore(META).get('complete'));
      db.close();
      return meta && meta.format === FORMAT ? meta : null;
    } catch {
      return null;
    }
  }

  /** @returns {Promise<Map<string, Blob>>} */
  async load() {
    const db = await openDb();
    const store = db.transaction(FILES, 'readonly').objectStore(FILES);
    const [keys, values] = await Promise.all([promisify(store.getAllKeys()), promisify(store.getAll())]);
    db.close();
    const files = new Map();
    keys.forEach((k, i) => files.set(k, values[i]));
    return files;
  }

  /** Stores the picked files (after the game has started, so it does not delay it). */
  async save(files) {
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch { /* best effort */ }
    }
    await this.forget();
    const db = await openDb();
    let bytes = 0;
    // Batches of up to ~32 MB keep memory use down for the large radio files.
    const batches = [[]];
    let batchBytes = 0;
    for (const entry of files) {
      if (batches.at(-1).length && batchBytes + entry[1].size > 32 * 1048576) {
        batches.push([]);
        batchBytes = 0;
      }
      batches.at(-1).push(entry);
      batchBytes += entry[1].size;
    }
    for (const entries of batches) {
      // Read the batch first: a transaction closes as soon as its task awaits anything else.
      const batch = await Promise.all(entries.map(async ([rel, file]) => [rel, await file.arrayBuffer()]));
      const tx = db.transaction(FILES, 'readwrite');
      const store = tx.objectStore(FILES);
      for (const [rel, data] of batch) {
        store.put(new Blob([data]), rel);
        bytes += data.byteLength;
      }
      await txDone(tx);
    }
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put({ format: FORMAT, count: files.size, bytes, savedAt: Date.now() }, 'complete');
    await txDone(tx);
    db.close();
    return bytes;
  }

  async forget() {
    const db = await openDb();
    const tx = db.transaction([FILES, META], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(FILES).clear();
    await txDone(tx);
    db.close();
  }
}
