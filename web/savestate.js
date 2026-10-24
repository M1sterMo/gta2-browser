// Save states for single player: a snapshot of the whole game, taken in an instant and restored
// exactly, anywhere in a single-player game. Not in co-op (every player simulates the same game;
// one player cannot rewind it).
//
// - The Saves screen (Ctrl+S / ⌘S or Ctrl+O / ⌘O, also F5 / F9, or the toolbar): six slots, each with a picture, the
//   area, cash and wanted level (web/saves.js). Saving and loading both happen there, so a key
//   press never loads by accident; there is no quick save or quick load.
// - Autosave: free, after each job or kill frenzy passed (the game's counts of them rise).
// - Continue on the front page: the newest save, straight from the landing page.
// - Fair saving: every save costs 20% of the cash in hand, at least $10,000, at most one every
//   2 minutes, and there is no saving
//   while wanted or during a job (gta2_port_savestate_rules). Loading is always allowed.
//
// The game's state is its WebAssembly memory. A save copies it up to the heap's end between two
// frames, then compresses it (gzip) and keeps it in IndexedDB; a load writes it back and has the
// core rebuild what lives in the browser (textures, sounds, clock; savestate_web.cpp). A snapshot
// only fits the build that made it, so each one records a hash of gta2.wasm.

import { lang, registerDict, t } from './strings.js';

const DB_NAME = 'gta2-port-states';
const STORE = 'states';

registerDict({
  en: {
    'ui.save.quick': 'Quick save',
    'ui.save.auto': 'Autosave',
    'ui.save.slot': 'Slot {n}',
    'ui.save.singlePlayerOnly': 'Saving works during a single-player game.',
    'ui.save.jobDone': 'Job done',
    'ui.save.frenzyPassed': 'Frenzy passed',
    'ui.save.autosaved': '{what}: autosaved',
    'ui.save.savedTo': 'Saved to {slot} · -{cost}',
    'ui.save.couldNotSave': 'Could not save: {err}',
    'ui.save.empty': '{slot} is empty.',
    'ui.save.otherVersion': 'That save was made by a different version of the game.',
    'ui.save.loaded': 'Loaded {slot}',
    'ui.save.couldNotLoad': 'Could not load: {err}',
    'ui.save.damaged': 'the save is damaged',
    'ui.save.noMemory': 'not enough memory',
    'ui.save.refused': 'the browser refused to store it',
    'ui.save.buildId': 'the game build could not be read (HTTP {status})',
    'ui.save.onFeet': 'You can save once you are back on your feet.',
    'ui.save.wanted': 'Lose the cops first: no saving while you are wanted.',
    'ui.save.onJob': 'Finish or fail the job first: no saving during a job.',
    'ui.save.cooldown': 'One save every 2 minutes: next save in {left}.',
    'ui.save.tooPoor': 'A save costs at least {min}. You have {cash}.',
    'ui.district.bonus': 'Bonus level',
    'ui.time.justNow': 'just now',
    'ui.time.yesterday': 'yesterday',
    'ui.time.minutesAgo': '{n} min ago',
    'ui.time.hoursAgo': '{n} h ago',
    'ui.time.minutes': '{n} min',
    'ui.time.seconds': '{n} s',
  },
  es: {
    'ui.save.quick': 'Guardado rápido',
    'ui.save.auto': 'Guardado automático',
    'ui.save.slot': 'Ranura {n}',
    'ui.save.singlePlayerOnly': 'El guardado funciona durante una partida de un jugador.',
    'ui.save.jobDone': 'Trabajo completado',
    'ui.save.frenzyPassed': 'Frenesí superado',
    'ui.save.autosaved': '{what}: guardado automáticamente',
    'ui.save.savedTo': 'Guardado en {slot} · -{cost}',
    'ui.save.couldNotSave': 'No se pudo guardar: {err}',
    'ui.save.empty': '{slot} está vacía.',
    'ui.save.otherVersion': 'Esa partida se guardó con otra versión del juego.',
    'ui.save.loaded': 'Cargada {slot}',
    'ui.save.couldNotLoad': 'No se pudo cargar: {err}',
    'ui.save.damaged': 'la partida está dañada',
    'ui.save.noMemory': 'no hay memoria suficiente',
    'ui.save.refused': 'el navegador se negó a guardarla',
    'ui.save.buildId': 'no se pudo leer la compilación del juego (HTTP {status})',
    'ui.save.onFeet': 'Puedes guardar cuando vuelvas a estar en pie.',
    'ui.save.wanted': 'Primero pierde a la policía: no se guarda mientras te buscan.',
    'ui.save.onJob': 'Termina o falla el trabajo primero: no se guarda durante un trabajo.',
    'ui.save.cooldown': 'Un guardado cada 2 minutos: el siguiente en {left}.',
    'ui.save.tooPoor': 'Guardar cuesta al menos {min}. Tienes {cash}.',
    'ui.district.bonus': 'Nivel extra',
    'ui.time.justNow': 'ahora mismo',
    'ui.time.yesterday': 'ayer',
    'ui.time.minutesAgo': 'hace {n} min',
    'ui.time.hoursAgo': 'hace {n} h',
    'ui.time.minutes': '{n} min',
    'ui.time.seconds': '{n} s',
  },
  fr: {
    'ui.save.quick': 'Sauvegarde rapide',
    'ui.save.auto': 'Sauvegarde automatique',
    'ui.save.slot': 'Emplacement {n}',
    'ui.save.singlePlayerOnly': 'La sauvegarde fonctionne pendant une partie solo.',
    'ui.save.jobDone': 'Contrat accompli',
    'ui.save.frenzyPassed': 'Frénésie réussie',
    'ui.save.autosaved': '{what} : sauvegardé automatiquement',
    'ui.save.savedTo': 'Sauvegardé dans {slot} · -{cost}',
    'ui.save.couldNotSave': 'Impossible de sauvegarder : {err}',
    'ui.save.empty': '{slot} est vide.',
    'ui.save.otherVersion': 'Cette sauvegarde vient d’une autre version du jeu.',
    'ui.save.loaded': '{slot} chargée',
    'ui.save.couldNotLoad': 'Impossible de charger : {err}',
    'ui.save.damaged': 'la sauvegarde est endommagée',
    'ui.save.noMemory': 'pas assez de mémoire',
    'ui.save.refused': 'le navigateur a refusé de l’enregistrer',
    'ui.save.buildId': 'la compilation du jeu n’a pas pu être lue (HTTP {status})',
    'ui.save.onFeet': 'Vous pourrez sauvegarder quand vous serez sur pied.',
    'ui.save.wanted': 'Perdez la police d’abord : pas de sauvegarde pendant qu’on vous recherche.',
    'ui.save.onJob': 'Terminez ou échouez le contrat d’abord : pas de sauvegarde pendant un contrat.',
    'ui.save.cooldown': 'Une sauvegarde toutes les 2 minutes : la prochaine dans {left}.',
    'ui.save.tooPoor': 'Une sauvegarde coûte au moins {min}. Vous avez {cash}.',
    'ui.district.bonus': 'Niveau bonus',
    'ui.time.justNow': 'à l’instant',
    'ui.time.yesterday': 'hier',
    'ui.time.minutesAgo': 'il y a {n} min',
    'ui.time.hoursAgo': 'il y a {n} h',
    'ui.time.minutes': '{n} min',
    'ui.time.seconds': '{n} s',
  },
});

/** Money as the current language writes it (USD, no cents). */
export const money = (n) =>
  new Intl.NumberFormat(lang(), { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(n);
/** A plain number in the current language. */
export const num = (n) => new Intl.NumberFormat(lang()).format(n);

/** The six slots the player saves to (the Saves screen also shows the autosave, and a quick save
 * made by an earlier version). */
export const SLOTS = ['s1', 's2', 's3', 's4', 's5', 's6'];
export const slotName = (slot) => (slot === 'quick' ? t('ui.save.quick')
  : slot === 'auto' ? t('ui.save.auto') : t('ui.save.slot', { n: slot.slice(1) }));

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
    dbPromise = promisify(req);
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function write(fn) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  fn(tx.objectStore(STORE));
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(t('ui.save.refused')));
  });
}

async function get(slot) {
  const db = await openDb();
  return promisify(db.transaction(STORE, 'readonly').objectStore(STORE).get(slot));
}

let buildPromise = null;
/** This build's identity: the SHA-256 of gta2.wasm (the snapshot's memory layout depends on it). */
function buildId() {
  if (!buildPromise) {
    buildPromise = fetch(new URL('gta2.wasm', import.meta.url))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(t('ui.save.buildId', { status: r.status })))))
      .then((buf) => crypto.subtle.digest('SHA-256', buf))
      .then((d) => Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join(''))
      .catch((err) => { buildPromise = null; throw err; });
  }
  return buildPromise;
}

/**
 * Every save in this browser, newest first, without the snapshots themselves:
 * {slot, savedAt, label, thumb (Blob), current (made by this build)}.
 */
export async function listSaves() {
  let records;
  try {
    const db = await openDb();
    records = await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  } catch {
    return []; // no IndexedDB here (private window, blocked storage)
  }
  const build = await buildId().catch(() => null);
  return records
    .map(({ data, ...meta }) => ({ ...meta, current: !!build && meta.build === build }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const fromBase64 = async (b64, type) => new Blob([await (await fetch(`data:${type};base64,${b64}`)).arrayBuffer()], { type });

/** Every save in this browser for Export saves, the snapshot and picture as base64. */
export async function exportSaves() {
  let records;
  try {
    const db = await openDb();
    records = await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  } catch {
    return []; // no IndexedDB here
  }
  return Promise.all(records.map(async ({ data, thumb, ...meta }) => ({
    ...meta, data: await toBase64(data), thumb: thumb ? await toBase64(thumb) : null,
  })));
}

/**
 * Saves from Export saves into this browser. A slot that already holds a newer save keeps it.
 * Saves made by another build show as older versions, as usual. Returns how many were stored.
 */
export async function importSaves(list) {
  let stored = 0;
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !/^(s[1-6]|quick|auto)$/.test(s.slot) || typeof s.data !== 'string') continue;
    const have = await get(s.slot).catch(() => null);
    if (have && have.savedAt >= s.savedAt) continue;
    const record = { ...s, data: await fromBase64(s.data, 'application/gzip'), thumb: s.thumb ? await fromBase64(s.thumb, 'image/jpeg') : null };
    await write((store) => store.put(record));
    stored++;
  }
  return stored;
}

export async function deleteSave(slot) {
  await write((store) => store.delete(slot));
}

const gzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
const gunzip = async (blob) => new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

// Ctrl/⌘ S and O: the usual save and open shortcuts, which a page may take over in every browser.
// F5 / F9 also work, as in many PC games, but F5 is the browser's reload and Mac keyboards need Fn.
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const SAVE_KEY = MAC ? '⌘S' : 'Ctrl+S'; // opens the Saves screen (so do ⌘O / Ctrl+O, F5, F9)
export const LOAD_KEY = MAC ? '⌘O' : 'Ctrl+O';

// Fair saving: a save costs 20% of the cash in hand (saving and reloading to cheat hurts), at
// least SAVE_MIN_COST, at most one per cooldown, and is not allowed while wanted or during a
// job. The autosave after a job or frenzy is free.
export const SAVE_MIN_COST = 10000;
export const saveCost = (cash) => Math.max(SAVE_MIN_COST, Math.ceil(cash / 5));
export const SAVE_COOLDOWN_MS = 2 * 60 * 1000;

const until = async (ready, ms = 3000) => {
  for (const end = performance.now() + ms; !ready() && performance.now() < end;) await new Promise((r) => setTimeout(r, 20));
};

/** A short message over the game (bottom centre). */
export function toast(text, isError = false) {
  let box = document.getElementById('state-toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'state-toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.textContent = text;
  box.classList.toggle('error', isError);
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, isError ? 4000 : 1800);
}

// The district key from the map file the game loaded ("data\\wil.gmp" -> ui.district.downtown).
// Stored as a key and translated at display time (saves.js describe), so old saves
// follow a language change too.
const DISTRICT_OF = { wil: 'ui.district.downtown', ste: 'ui.district.residential', bil: 'ui.district.industrial' };
function districtOf(mapFile) {
  const base = mapFile.split(/[\\/]/).pop().toLowerCase().replace(/(-multi)?\.gmp$/, '');
  return DISTRICT_OF[base] || (base ? 'ui.district.bonus' : '');
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

export class SaveStates {
  /**
   * @param {object} opts
   * @param {object} opts.Module the game module
   * @param {object} opts.renderer the WebGL renderer (its canvas gives the save's picture)
   * @param {object} opts.map the shell's map (rebuilt after a load; never interrupted mid-build)
   */
  constructor({ Module, renderer, map }) {
    this.Module = Module;
    this.renderer = renderer;
    this.map = map;
    this.busy = false;
    this.screen = null; // the Saves screen (web/saves.js)
    this.lastSaveAt = -Infinity; // the cooldown (paid saves only)
    this.passed = null; // jobs and frenzies passed when last looked (the autosave's trigger)
    this.autosaveDue = null; // what was passed: 'Job' or 'Frenzy'
    this.onJob = 0;
  }

  /**
   * Keys: Ctrl/⌘+S or Ctrl/⌘+O (with or without Shift), F5 or F9 open the Saves screen, where
   * saving and loading happen. Returns true when it used the key.
   */
  handleKey(e, down) {
    const mod = (MAC ? e.metaKey : e.ctrlKey) && !e.altKey;
    if (!(e.code === 'F5' || e.code === 'F9' || (mod && (e.code === 'KeyS' || e.code === 'KeyO')))) return false;
    if (down && !e.repeat && this.screen) this.screen.show();
    return true; // never to the game, and the browser neither saves the page nor opens a file
  }

  rules() {
    const M = this.Module;
    const p = M.ccall('gta2_port_savestate_rules', 'number', [], []);
    const [player, cash, stars, onJob, jobs, frenzies] = M.HEAP32.subarray(p >> 2, (p >> 2) + 6);
    return { player, cash, stars, onJob, passed: { jobs, frenzies } };
  }

  /**
   * Autosave: once a second, notices a job or kill frenzy passed and saves (free) as soon as the
   * player is on their feet, not wanted and not on a job. Starting the next job first skips it.
   */
  watchJobs() {
    setInterval(() => {
      if (this.busy || !this.canSave() || this.map.open || (this.screen && this.screen.open)) return;
      const r = this.rules();
      if (!r.player) return;
      if (this.passed) {
        if (r.passed.jobs > this.passed.jobs) this.autosaveDue = 'Job';
        else if (r.passed.frenzies > this.passed.frenzies) this.autosaveDue = 'Frenzy';
      }
      this.passed = r.passed;
      // a job starting after the pass skips the autosave (the pass itself may land while the
      // finished job's flag is still up: that waits for the flag to clear)
      const started = r.onJob && !this.onJob;
      this.onJob = r.onJob;
      if (started) this.autosaveDue = null;
      if (r.onJob) return;
      if (this.autosaveDue && !this.whyNot({ free: true })) {
        const what = this.autosaveDue;
        this.autosaveDue = null;
        this.save('auto', { free: true, what });
      }
    }, 1000);
  }

  canSave() {
    return this.Module.ccall('gta2_port_savestate_can_save', 'number', [], []) === 1;
  }

  /**
   * Why saving is not allowed right now under the Fair rules, or null when it is. The autosave
   * ({free}) neither pays nor waits for the cooldown.
   */
  whyNot({ free = false } = {}) {
    const { player, cash, stars, onJob } = this.rules();
    if (!player) return t('ui.save.onFeet');
    if (stars > 0) return t('ui.save.wanted');
    if (onJob) return t('ui.save.onJob');
    if (free) return null;
    const wait = Math.ceil((this.lastSaveAt + SAVE_COOLDOWN_MS - performance.now()) / 1000);
    const left = wait >= 60
      ? t('ui.time.minutes', { n: num(Math.floor(wait / 60)) }) + (wait % 60 ? ` ${t('ui.time.seconds', { n: num(wait % 60) })}` : '')
      : t('ui.time.seconds', { n: num(wait) });
    if (wait > 0) return t('ui.save.cooldown', { left });
    if (cash < saveCost(cash)) return t('ui.save.tooPoor', { min: money(SAVE_MIN_COST), cash: money(cash) });
    return null;
  }

  /** Cash in hand (for the Saves screen). */
  cash() {
    return this.rules().cash;
  }

  /** The game as it is on screen now, small (the canvas keeps its last frame). */
  picture() {
    const { canvas, viewport } = this.renderer;
    const w = 320;
    const h = Math.round((w * viewport.h) / Math.max(1, viewport.w));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, viewport.x, viewport.y, viewport.w, viewport.h, 0, 0, w, h);
    return new Promise((resolve) => small.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  }

  /** What the save's card shows: the area, district, cash, lives, wanted level. Read after the copy. */
  label() {
    const M = this.Module;
    const p = M.ccall('gta2_port_savestate_label', 'number', [], []);
    const v = M.HEAP32.subarray(p >> 2, (p >> 2) + 8);
    let area = '';
    for (let i = 0, o = (p + 32) >> 1; i < 48 && M.HEAPU16[o + i]; i++) area += String.fromCharCode(M.HEAPU16[o + i]);
    let mapFile = '';
    for (let i = 0, o = p + 32 + 96; i < 64 && M.HEAPU8[o + i]; i++) mapFile += String.fromCharCode(M.HEAPU8[o + i]);
    return {
      area: titleCase(area.trim()), district: districtOf(mapFile), cash: v[1], lives: v[2], multiplier: v[3],
      stars: v[4], health: v[5], inCar: !!v[6],
    };
  }

  /**
   * Saves the game into a slot. The picture is taken now unless one is given (the Saves screen
   * takes it before it covers the game).
   * @returns {Promise<boolean>}
   */
  async save(slot, { picture = null, quiet = false, free = false, what = 'Job' } = {}) {
    if (this.busy) return false;
    if (!this.canSave()) { if (!quiet) toast(t('ui.save.singlePlayerOnly'), true); return false; }
    this.busy = true;
    let paid = 0;
    try {
      const M = this.Module;
      await until(() => !this.map.building);
      const why = this.whyNot({ free });
      if (why) { if (!quiet) toast(why, true); return false; }
      if (!free) {
        paid = saveCost(this.cash());
        M.ccall('gta2_port_savestate_pay', null, ['number'], [paid]);
      }
      // between frames (this is a key, click or timer callback), so the copy is one consistent moment
      const clockPtr = M._malloc(8);
      const end = M.ccall('gta2_port_savestate_prepare', 'number', ['number'], [clockPtr]) >>> 0;
      const clock = M.HEAPF64[clockPtr >> 3];
      M._free(clockPtr);
      const bytes = M.HEAPU8.slice(0, end);
      const label = this.label();
      const thumb = picture || await this.picture();
      const started = performance.now();
      const [data, build] = await Promise.all([gzip(bytes), buildId()]);
      await write((store) => store.put({ slot, build, savedAt: Date.now(), size: end, clock, data, label, thumb }));
      console.log(`save ${slot}: ${(end / 1048576).toFixed(1)} MB -> ${(data.size / 1048576).toFixed(1)} MB in ${Math.round(performance.now() - started)} ms`);
      if (paid) this.lastSaveAt = performance.now();
      if (!quiet) {
        const whatText = t(what === 'Frenzy' ? 'ui.save.frenzyPassed' : 'ui.save.jobDone');
        toast(free ? t('ui.save.autosaved', { what: whatText }) : t('ui.save.savedTo', { slot: slotName(slot), cost: money(paid) }));
      }
      return true;
    } catch (err) {
      console.error(err);
      if (paid) this.Module.ccall('gta2_port_savestate_pay', null, ['number'], [-paid]); // not stored: money back
      toast(t('ui.save.couldNotSave', { err: err.message || err }), true);
      return false;
    } finally {
      this.busy = false;
    }
  }

  /** @returns {Promise<boolean>} */
  async load(slot) {
    if (this.busy) return false;
    this.busy = true;
    try {
      const M = this.Module;
      const record = await get(slot);
      if (!record) {
        toast(t('ui.save.empty', { slot: slotName(slot) }), true);
        return false;
      }
      if (record.build !== await buildId()) { toast(t('ui.save.otherVersion'), true); return false; }
      const bytes = await gunzip(record.data);
      if (bytes.length !== record.size) throw new Error(t('ui.save.damaged'));
      await until(() => !this.map.building);
      if (!M.ccall('gta2_port_savestate_reserve', 'number', ['number'], [record.size])) throw new Error(t('ui.save.noMemory'));
      // one synchronous step between frames: the game's memory becomes the saved one
      const heap = M.HEAPU8;
      heap.set(bytes, 0);
      heap.fill(0, bytes.length); // above the saved heap's end: unused, as the allocator expects
      M.ccall('gta2_port_savestate_restored', null, ['number'], [record.clock]);
      M.ccall('gta2_port_set_paused', null, ['number'], [0]); // a save made behind the Saves screen was paused
      this.map.invalidate();
      this.passed = null; // the loaded game's count is the new baseline
      this.autosaveDue = null;
      toast(t('ui.save.loaded', { slot: slotName(slot) }));
      return true;
    } catch (err) {
      console.error(err);
      toast(t('ui.save.couldNotLoad', { err: err.message || err }), true);
      return false;
    } finally {
      this.busy = false;
    }
  }
}
