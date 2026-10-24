// The Saves screen (single player): the autosave and six slots, each a card with a picture of
// the moment, the area, district, cash and wanted level. Save here, load or delete; the game is
// paused while it is open. Opened (and closed) with Ctrl+S / ⌘S or F5, or the toolbar's Saves button.
import { LOAD_KEY, SAVE_KEY, SAVE_MIN_COST, SLOTS, deleteSave, listSaves, money, num, saveCost, slotName } from './savestate.js';
import { lang, onLangChange, registerDict, t } from './strings.js';

registerDict({
  en: {
    'ui.saves.keysHint': 'Open and close with {saveKey} or {loadKey} · Esc closes',
    'ui.saves.close': 'Close',
    'ui.saves.startToSave': 'Start a game to save. You can load a save from here at any time.',
    'ui.saves.stillLoad': '{why} You can still load.',
    'ui.saves.note': 'Saving now costs {cost} (20% of your {cash}, at least {min}), one save every 2 minutes. No saving while wanted or during a job. Passing a job or a kill frenzy autosaves for free.',
    'ui.saves.stay': 'Saves stay in this browser. A save made before an update can’t be loaded by the new version.',
    'ui.saves.empty': 'Empty',
    'ui.saves.save': 'Save',
    'ui.saves.saveHere': 'Save here',
    'ui.saves.overwrite': 'Overwrite: {price}?',
    'ui.saves.pay': 'Pay {price}?',
    'ui.saves.load': 'Load',
    'ui.saves.delete': 'Delete',
    'ui.saves.deleteAsk': 'Delete?',
    'ui.saves.openInVersion': 'Open in its version',
    'ui.saves.openInVersionTitle': 'Opens the version of the game that made this save, in a new tab',
    'ui.saves.oldVersionTitle': 'Made by an older version of the game',
    'ui.saves.olderVersion': '{how} · older version',
    'ui.saves.somewhere': 'Somewhere in the city',
  },
  es: {
    'ui.saves.keysHint': 'Abrir y cerrar con {saveKey} o {loadKey} · Esc cierra',
    'ui.saves.close': 'Cerrar',
    'ui.saves.startToSave': 'Empieza una partida para guardar. Puedes cargar una partida desde aquí en cualquier momento.',
    'ui.saves.stillLoad': '{why} Aún puedes cargar.',
    'ui.saves.note': 'Guardar ahora cuesta {cost} (20% de tus {cash}, al menos {min}), un guardado cada 2 minutos. No se guarda mientras te buscan o durante un trabajo. Superar un trabajo o un frenesí guarda automáticamente gratis.',
    'ui.saves.stay': 'Las partidas se quedan en este navegador. Una partida guardada antes de una actualización no puede cargarse con la versión nueva.',
    'ui.saves.empty': 'Vacía',
    'ui.saves.save': 'Guardar',
    'ui.saves.saveHere': 'Guardar aquí',
    'ui.saves.overwrite': '¿Sobrescribir por {price}?',
    'ui.saves.pay': '¿Pagar {price}?',
    'ui.saves.load': 'Cargar',
    'ui.saves.delete': 'Borrar',
    'ui.saves.deleteAsk': '¿Borrar?',
    'ui.saves.openInVersion': 'Abrir en su versión',
    'ui.saves.openInVersionTitle': 'Abre la versión del juego que creó esta partida, en una pestaña nueva',
    'ui.saves.oldVersionTitle': 'Hecha con una versión anterior del juego',
    'ui.saves.olderVersion': '{how} · versión anterior',
    'ui.saves.somewhere': 'En algún lugar de la ciudad',
  },
  fr: {
    'ui.saves.keysHint': 'Ouvrir et fermer avec {saveKey} ou {loadKey} · Échap ferme',
    'ui.saves.close': 'Fermer',
    'ui.saves.startToSave': 'Démarrez une partie pour sauvegarder. Vous pouvez charger une sauvegarde ici à tout moment.',
    'ui.saves.stillLoad': '{why} Vous pouvez toujours charger.',
    'ui.saves.note': 'Sauvegarder coûte {cost} (20% de vos {cash}, au moins {min}), une sauvegarde toutes les 2 minutes. Pas de sauvegarde pendant qu’on vous recherche ou pendant un contrat. Réussir un contrat ou une frénésie sauvegarde gratuitement.',
    'ui.saves.stay': 'Les sauvegardes restent dans ce navigateur. Une sauvegarde faite avant une mise à jour ne peut pas être chargée par la nouvelle version.',
    'ui.saves.empty': 'Vide',
    'ui.saves.save': 'Sauvegarder',
    'ui.saves.saveHere': 'Sauvegarder ici',
    'ui.saves.overwrite': 'Écraser pour {price} ?',
    'ui.saves.pay': 'Payer {price} ?',
    'ui.saves.load': 'Charger',
    'ui.saves.delete': 'Supprimer',
    'ui.saves.deleteAsk': 'Supprimer ?',
    'ui.saves.openInVersion': 'Ouvrir dans sa version',
    'ui.saves.openInVersionTitle': 'Ouvre la version du jeu qui a créé cette sauvegarde, dans un nouvel onglet',
    'ui.saves.oldVersionTitle': 'Faite avec une ancienne version du jeu',
    'ui.saves.olderVersion': '{how} · ancienne version',
    'ui.saves.somewhere': 'Quelque part dans la ville',
  },
});

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
};

/** "just now", "5 min ago", "yesterday", or a date. */
export function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return t('ui.time.justNow');
  if (s < 3600) return t('ui.time.minutesAgo', { n: num(Math.floor(s / 60)) });
  if (s < 86400) return t('ui.time.hoursAgo', { n: num(Math.floor(s / 3600)) });
  if (s < 172800) return t('ui.time.yesterday');
  return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
}

/** The card's lines: where ("Chinatown, Downtown") and how ("$12,500 · ★★ · 5 min ago"). */
export function describe(save) {
  const l = save.label || {};
  // l.district is a ui.district.* key; an old save may hold its already translated
  // text instead (t() passes unknown keys through unchanged).
  const where = [l.area, l.district ? t(l.district) : ''].filter(Boolean).join(', ') || t('ui.saves.somewhere');
  const how = [money(l.cash || 0), l.stars ? '★'.repeat(l.stars) : '', ago(save.savedAt)].filter(Boolean).join(' · ');
  return { where, how };
}

export class SavesScreen {
  /**
   * @param {object} opts
   * @param {import('./savestate.js').SaveStates} opts.states
   * @param {(paused: boolean) => void} opts.pause pauses the game and its sound (as the map screen does)
   * @param {() => void} opts.onClose gives the keyboard back to the game
   */
  constructor({ states, pause, onClose }) {
    this.states = states;
    this.pause = pause;
    this.onClose = onClose;
    this.open = false;
    this.picture = null;
    this.urls = [];
    this.root = el('div', { id: 'saves-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.tools.saves'), hidden: '' });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    document.body.append(this.root);
    // A language change while the screen is open re-renders it (aria-label included).
    onLangChange(() => { if (this.open) this.render(); });
    states.screen = this;
  }

  async show() {
    if (this.open) return;
    this.open = true;
    this.canSave = this.states.canSave();
    // Fair saving: why a save is not allowed now (wanted, on a job, not enough cash), or null
    this.blocked = this.canSave ? this.states.whyNot() : null;
    // the picture first, while the game is still on screen
    this.picture = this.canSave ? await this.states.picture() : null;
    this.pause(true);
    this.root.hidden = false;
    await this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.dropUrls();
    this.pause(false);
    this.onClose();
  }

  dropUrls() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  /** While open: Esc closes, and no key reaches the game. */
  handleKey(e, down) {
    if (!this.open) return false;
    if (down && !e.repeat && (e.code === 'Escape' || e.code === 'F5' || e.code === 'F9' || ((e.metaKey || e.ctrlKey) && (e.code === 'KeyS' || e.code === 'KeyO')))) this.close();
    return true;
  }

  async render() {
    const saves = new Map((await listSaves()).map((s) => [s.slot, s]));
    // Older versions this server still has (old/<build>/, the local server only): a save made by
    // one opens there, since a save only loads in the build that made it.
    const older = [...new Set([...saves.values()].filter((s) => !s.current && s.build).map((s) => s.build))];
    const kept = await Promise.all(older.map((b) => fetch(`old/${b}/gta2.wasm`, { method: 'HEAD', cache: 'no-store' })
      .then((r) => (r.ok ? b : null), () => null)));
    this.oldVersions = new Set(kept.filter(Boolean));
    if (!this.open) return;
    this.dropUrls();
    this.root.setAttribute('aria-label', t('ui.tools.saves'));
    const grid = el('div', { class: 'saves-grid' });
    for (const slot of SLOTS) grid.append(this.card(slot, saves.get(slot)));
    // the autosave, and a quick save from an earlier version: loadable, not saved to
    for (const slot of ['quick', 'auto']) if (saves.has(slot)) grid.prepend(this.card(slot, saves.get(slot)));
    this.root.replaceChildren(el('div', { class: 'saves-panel' },
      el('div', { class: 'saves-head' },
        el('h2', {}, t('ui.tools.saves')),
        el('span', { class: 'saves-keys' }, t('ui.saves.keysHint', { saveKey: SAVE_KEY, loadKey: LOAD_KEY })),
        el('button', { type: 'button', class: 'saves-close', 'aria-label': t('ui.saves.close'), onclick: () => this.close() }, '✕')),
      el('p', { class: 'saves-note' }, !this.canSave ? t('ui.saves.startToSave')
        : this.blocked ? t('ui.saves.stillLoad', { why: this.blocked })
          : t('ui.saves.note', {
            cost: money(saveCost(this.states.cash())),
            cash: money(this.states.cash()),
            min: money(SAVE_MIN_COST),
          })),
      grid,
      el('p', { class: 'saves-note' }, t('ui.saves.stay'))));
  }

  card(slot, save) {
    const card = el('div', { class: `save-card${save ? '' : ' empty'}` });
    let picture;
    if (save && save.thumb) {
      const url = URL.createObjectURL(save.thumb);
      this.urls.push(url);
      picture = el('img', { src: url, alt: '' });
    } else {
      picture = el('div', { class: 'save-blank' }, save ? '' : t('ui.saves.empty'));
    }
    const text = save ? describe(save) : null;
    const actions = el('div', { class: 'save-actions' });
    if (this.canSave && !this.blocked && SLOTS.includes(slot)) {
      // the first click asks for the price (the game is paused, so it is the price when you confirm)
      const price = money(saveCost(this.states.cash()));
      actions.append(this.confirmButton(save ? t('ui.saves.saveHere') : t('ui.saves.save'),
        save ? t('ui.saves.overwrite', { price }) : t('ui.saves.pay', { price }), () => this.saveTo(slot), 'primary'));
    }
    if (save) {
      const elsewhere = !save.current && this.oldVersions.has(save.build);
      const load = elsewhere
        ? el('button', { type: 'button', title: t('ui.saves.openInVersionTitle'),
          onclick: () => window.open(`old/${save.build}/`, '_blank') }, t('ui.saves.openInVersion'))
        : el('button', { type: 'button', onclick: () => this.loadFrom(slot) }, t('ui.saves.load'));
      if (!save.current && !elsewhere) { load.disabled = true; load.title = t('ui.saves.oldVersionTitle'); }
      actions.append(load, this.confirmButton(t('ui.saves.delete'), t('ui.saves.deleteAsk'), async () => { await deleteSave(slot); this.render(); }, 'quiet'));
    }
    card.append(picture, el('div', { class: 'save-text' },
      el('span', { class: 'save-slot' }, slotName(slot)),
      text ? el('strong', {}, text.where) : '',
      text ? el('small', {}, save.current ? text.how : t('ui.saves.olderVersion', { how: text.how })) : ''),
    actions);
    return card;
  }

  /** A button that asks once ("Overwrite?") before it acts. */
  confirmButton(label, ask, act, cls) {
    const b = el('button', { type: 'button', class: cls }, label);
    let armed = !ask;
    b.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        b.textContent = ask;
        b.classList.add('armed');
        setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 5000);
        return;
      }
      b.disabled = true;
      await act();
    });
    return b;
  }

  async saveTo(slot) {
    // the game is paused behind this screen, so the save is the moment the screen opened
    if (await this.states.save(slot, { picture: this.picture })) this.close();
    else this.render();
  }

  async loadFrom(slot) {
    this.close();
    await this.states.load(slot);
  }
}
