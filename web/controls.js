// The Controls screen (issue #2): change the game's twelve keys. The front end's Options item opens
// it (the original launched the separate GTA2 Manager program), and so does the toolbar's
// Controls button. It writes the same registry values GTA2 Manager wrote; the game reads them
// again at once, and the shell keeps them in this browser with the other settings.

import { onLangChange, registerDict, t } from './strings.js';

registerDict({
  en: {
    'ui.keys.fwd': 'Forward',
    'ui.keys.back': 'Back',
    'ui.keys.left': 'Turn left',
    'ui.keys.right': 'Turn right',
    'ui.keys.shoot': 'Shoot / punch',
    'ui.keys.enter': 'Get in or out of a car',
    'ui.keys.jump': 'Jump / handbrake',
    'ui.keys.prev': 'Previous weapon',
    'ui.keys.next': 'Next weapon',
    'ui.keys.special1': 'Special 1 (horn, car extras)',
    'ui.keys.special2': 'Special 2',
    'ui.keys.status': 'Status',
    'ui.keys.map': 'M opens the map',
    'ui.keys.board': 'Tab shows the co-op scoreboard',
    'ui.keys.radio': 'R turns the radio on and off',
    'ui.keys.station': 'T changes radio station (and opens the chat in co-op)',
    'ui.keys.view': '− and = change the view distance',
    'ui.keys.saves': 'F5 opens the Saves screen',
    'ui.keys.menu': 'Esc opens the game menu',
    'ui.keys.title': 'Controls',
    'ui.keys.hint': 'Click an action, then press its new key. Esc cancels.',
    'ui.keys.close': 'Close',
    'ui.keys.defaults': 'Default keys',
    'ui.keys.done': 'Done',
    'ui.keys.press': 'Press a key…',
    'ui.keys.menus': 'Menus always use the arrow keys, Enter and Esc.',
    'ui.keys.swap': '{action} is now {key}.',
    'ui.keys.blocked': '{why} in the browser version. Choose another key.',
    'ui.keys.cantUse': 'That key can’t be used. Choose another key.',
    'ui.keys.reset': 'Back to the default keys.',
    'ui.keys.gamepad': 'Game pad',
    'ui.keys.keyN': 'Key {n}',
    'ui.keys.changeAria': '{action}: {key}. Change',
  },
  es: {
    'ui.keys.fwd': 'Adelante',
    'ui.keys.back': 'Atrás',
    'ui.keys.left': 'Girar a la izquierda',
    'ui.keys.right': 'Girar a la derecha',
    'ui.keys.shoot': 'Disparar / pegar',
    'ui.keys.enter': 'Entrar o salir de un coche',
    'ui.keys.jump': 'Saltar / freno de mano',
    'ui.keys.prev': 'Arma anterior',
    'ui.keys.next': 'Arma siguiente',
    'ui.keys.special1': 'Especial 1 (claxon, extras del coche)',
    'ui.keys.special2': 'Especial 2',
    'ui.keys.status': 'Estado',
    'ui.keys.map': 'M abre el mapa',
    'ui.keys.board': 'Tab muestra la tabla del cooperativo',
    'ui.keys.radio': 'R enciende y apaga la radio',
    'ui.keys.station': 'T cambia de emisora (y abre el chat en cooperativo)',
    'ui.keys.view': '− y = cambian la distancia de vista',
    'ui.keys.saves': 'F5 abre la pantalla de partidas',
    'ui.keys.menu': 'Esc abre el menú del juego',
    'ui.keys.title': 'Controles',
    'ui.keys.hint': 'Haz clic en una acción y pulsa su nueva tecla. Esc cancela.',
    'ui.keys.close': 'Cerrar',
    'ui.keys.defaults': 'Teclas predeterminadas',
    'ui.keys.done': 'Listo',
    'ui.keys.press': 'Pulsa una tecla…',
    'ui.keys.menus': 'Los menús siempre usan las flechas, Intro y Esc.',
    'ui.keys.swap': '{action} ahora es {key}.',
    'ui.keys.blocked': '{why} en la versión de navegador. Elige otra tecla.',
    'ui.keys.cantUse': 'Esa tecla no se puede usar. Elige otra.',
    'ui.keys.reset': 'Vuelta a las teclas predeterminadas.',
    'ui.keys.gamepad': 'Mando',
    'ui.keys.keyN': 'Tecla {n}',
    'ui.keys.changeAria': '{action}: {key}. Cambiar',
  },
  fr: {
    'ui.keys.fwd': 'Avancer',
    'ui.keys.back': 'Reculer',
    'ui.keys.left': 'Tourner à gauche',
    'ui.keys.right': 'Tourner à droite',
    'ui.keys.shoot': 'Tirer / frapper',
    'ui.keys.enter': "Entrer ou sortir d'une voiture",
    'ui.keys.jump': 'Sauter / frein à main',
    'ui.keys.prev': 'Arme précédente',
    'ui.keys.next': 'Arme suivante',
    'ui.keys.special1': 'Spécial 1 (klaxon, extras de la voiture)',
    'ui.keys.special2': 'Spécial 2',
    'ui.keys.status': 'État',
    'ui.keys.map': 'M ouvre la carte',
    'ui.keys.board': 'Tab affiche le tableau du coopératif',
    'ui.keys.radio': 'R allume et éteint la radio',
    'ui.keys.station': 'T change de station (et ouvre le chat en coopératif)',
    'ui.keys.view': '− et = changent la distance de vue',
    'ui.keys.saves': "F5 ouvre l'écran des sauvegardes",
    'ui.keys.menu': 'Échap ouvre le menu du jeu',
    'ui.keys.title': 'Commandes',
    'ui.keys.hint': 'Cliquez sur une action, puis appuyez sur sa nouvelle touche. Échap annule.',
    'ui.keys.close': 'Fermer',
    'ui.keys.defaults': 'Touches par défaut',
    'ui.keys.done': 'Terminé',
    'ui.keys.press': 'Appuyez sur une touche…',
    'ui.keys.menus': 'Les menus utilisent toujours les flèches, Entrée et Échap.',
    'ui.keys.swap': '{action} est maintenant {key}.',
    'ui.keys.blocked': '{why} dans la version navigateur. Choisissez une autre touche.',
    'ui.keys.cantUse': 'Cette touche ne peut pas être utilisée. Choisissez-en une autre.',
    'ui.keys.reset': 'Retour aux touches par défaut.',
    'ui.keys.gamepad': 'Manette',
    'ui.keys.keyN': 'Touche {n}',
    'ui.keys.changeAria': '{action} : {key}. Modifier',
  },
});

// The game's control slots, in its order (hklm\...\gta2\control\0-11).
const ACTIONS = [
  'ui.keys.fwd', 'ui.keys.back', 'ui.keys.left', 'ui.keys.right', 'ui.keys.shoot', 'ui.keys.enter', 'ui.keys.jump',
  'ui.keys.prev', 'ui.keys.next', 'ui.keys.special1', 'ui.keys.special2', 'ui.keys.status',
];

// Keys the browser version uses itself while playing, so the game never sees them.
const RESERVED = {
  KeyM: 'ui.keys.map', Tab: 'ui.keys.board', KeyR: 'ui.keys.radio',
  KeyT: 'ui.keys.station', Minus: 'ui.keys.view',
  Equal: 'ui.keys.view', F5: 'ui.keys.saves', F9: 'ui.keys.saves',
  Escape: 'ui.keys.menu',
};

const NAMES = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Keypad Enter', Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps Lock',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`',
  Backslash: '\\', Comma: ',', Period: '.', Slash: '/', PageUp: 'Page Up', PageDown: 'Page Down',
  NumpadMultiply: 'Keypad *', NumpadSubtract: 'Keypad −', NumpadAdd: 'Keypad +', NumpadDecimal: 'Keypad .',
  NumpadDivide: 'Keypad /', NumLock: 'Num Lock', ScrollLock: 'Scroll Lock',
};

function keyName(code) {
  if (NAMES[code]) return NAMES[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad(\d)$/, 'Keypad $1');
}

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

export class ControlsScreen {
  /**
   * @param {object} opts
   * @param {object} opts.Module the game module
   * @param {Record<string, [number, number]>} opts.keys KeyboardEvent.code -> [scan code, virtual key]
   * @param {number[]} opts.defaults the browser version's default scan code for each slot
   * @param {string} opts.regPath the game's control registry key
   * @param {() => void} opts.onChange keeps the settings in this browser
   * @param {(paused: boolean) => void} opts.pause pauses the game while the screen is open
   * @param {() => void} opts.onClose gives the keyboard back to the game
   */
  constructor({ Module, keys, defaults, regPath, onChange, pause, onClose }) {
    this.Module = Module;
    this.keys = keys;
    this.defaults = defaults;
    this.regPath = regPath;
    this.onChange = onChange;
    this.pause = pause;
    this.onClose = onClose;
    this.open = false;
    this.waiting = -1; // the slot waiting for a key
    this.message = '';
    this.setDword = Module.cwrap('gta2_port_reg_set_dword', null, ['string', 'string', 'number']);
    this.codeOf = new Map(Object.entries(keys).map(([code, [scan]]) => [scan, code]));
    this.root = el('div', { id: 'controls-screen', role: 'dialog', 'aria-modal': 'true', hidden: '' });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    onLangChange(() => this.render());
    document.body.append(this.root);
  }

  /** The current binding of each slot, from the game's registry (a value of 0x8000 or more is a game pad). */
  bindings() {
    const text = this.Module.ccall('gta2_port_reg_export', 'string', [], []);
    const out = this.defaults.slice();
    const path = this.regPath.toLowerCase();
    for (const line of text.split('\n')) {
      const [p, name, type, value] = line.split('|');
      if (type === 'd' && p && p.toLowerCase() === path && /^\d+$/.test(name) && Number(name) < out.length) {
        out[Number(name)] = Number(value) >>> 0;
      }
    }
    return out;
  }

  /**
   * A default key, as the controller presses it (web/gamepad.js sends the default controls), turned
   * into the key now bound to that action, so the controller follows the player's choices.
   */
  rebound(code) {
    const scan = this.keys[code] && this.keys[code][0];
    const slot = scan === undefined ? -1 : this.defaults.indexOf(scan);
    if (slot < 0) return code;
    const value = this.bindings()[slot];
    return (value < 0x8000 && this.codeOf.get(value)) || code;
  }

  set(slot, value) {
    this.setDword(this.regPath, String(slot), value);
  }

  apply() {
    this.Module.ccall('gta2_port_reload_controls', null, [], []);
    this.onChange();
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.waiting = -1;
    this.message = '';
    this.pause(true);
    this.root.hidden = false;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.waiting = -1;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.pause(false);
    this.onClose();
  }

  /** While open, every key is the screen's: a new binding, Esc to cancel or close. */
  handleKey(e, down) {
    if (!this.open) return false;
    if (!down || e.repeat) return true;
    if (this.waiting < 0) {
      if (e.code === 'Escape') this.close();
      return true;
    }
    if (e.code === 'Escape') {
      this.waiting = -1;
      this.message = '';
    } else if (RESERVED[e.code]) {
      this.message = t('ui.keys.blocked', { why: t(RESERVED[e.code]) });
    } else if (!this.keys[e.code] || e.metaKey) {
      this.message = t('ui.keys.cantUse');
    } else {
      this.message = '';
      this.bind(this.waiting, this.keys[e.code][0]); // a swap says which action took the old key
      this.waiting = -1;
    }
    this.render();
    return true;
  }

  /** Gives a slot a key; a slot that had that key takes this slot's old one (a swap). */
  bind(slot, scan) {
    const current = this.bindings();
    const other = current.findIndex((v, i) => i !== slot && v === scan);
    if (other >= 0) {
      this.set(other, current[slot]);
      this.message = t('ui.keys.swap', { action: t(ACTIONS[other]), key: this.label(current[slot]) });
    }
    this.set(slot, scan);
    this.apply();
  }

  reset() {
    this.defaults.forEach((scan, slot) => this.set(slot, scan));
    this.apply();
    this.waiting = -1;
    this.message = t('ui.keys.reset');
    this.render();
  }

  label(value) {
    if (value >= 0x8000) return t('ui.keys.gamepad');
    const code = this.codeOf.get(value);
    return code ? keyName(code) : t('ui.keys.keyN', { n: value });
  }

  render() {
    if (!this.open) return;
    this.root.setAttribute('aria-label', t('ui.keys.title'));
    const current = this.bindings();
    const list = el('div', { class: 'controls-list' });
    current.forEach((value, slot) => {
      const waiting = this.waiting === slot;
      list.append(el('div', { class: 'controls-row' },
        el('span', {}, t(ACTIONS[slot])),
        el('button', {
          type: 'button', class: waiting ? 'waiting' : '', 'aria-label': t('ui.keys.changeAria', { action: t(ACTIONS[slot]), key: this.label(value) }),
          onclick: () => { this.waiting = slot; this.message = ''; this.render(); },
        }, waiting ? t('ui.keys.press') : this.label(value))));
    });
    this.root.replaceChildren(el('div', { class: 'saves-panel controls-panel' },
      el('div', { class: 'saves-head' },
        el('h2', {}, t('ui.keys.title')),
        el('span', { class: 'saves-keys' }, t('ui.keys.hint')),
        el('button', { type: 'button', class: 'saves-close', 'aria-label': t('ui.keys.close'), onclick: () => this.close() }, '✕')),
      list,
      el('p', { class: 'saves-note', role: 'status' }, this.message || t('ui.keys.menus')),
      el('div', { class: 'controls-actions' },
        el('button', { type: 'button', onclick: () => this.reset() }, t('ui.keys.defaults')),
        el('button', { type: 'button', class: 'primary', onclick: () => this.close() }, t('ui.keys.done')))));
  }
}
