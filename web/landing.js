// The front page (the game server's landing page, D21): play, play with
// friends, the controls on a drawn keyboard, options and help. Layout in the
// spirit of browser-game launchers such as Eaglercraft's; our own code and style.

import { LOAD_KEY, SAVE_KEY, money, num } from './savestate.js';
import { describe } from './saves.js';
import { findPad, listPads, padName } from './gamepad.js';
import { lang, onLangChange, registerDict, setLang, t } from './strings.js';

registerDict({
  en: {
    'ui.group.move': 'Move', 'ui.group.fight': 'Fight', 'ui.group.car': 'Cars', 'ui.group.weapon': 'Weapons',
    'ui.group.info': 'Info', 'ui.group.menu': 'Menus',
    'ui.control.forwardBack': 'Forward / back',
    'ui.control.turn': 'Turn left / right',
    'ui.control.shoot': 'Shoot / punch',
    'ui.control.enterCar': 'Get in or out of a car',
    'ui.control.jump': 'Jump / handbrake',
    'ui.control.weapons': 'Previous / next weapon',
    'ui.control.special': 'Special (horn, car extras)',
    'ui.control.radio': 'Radio on / off',
    'ui.control.radioNext': 'Next radio station (in co-op T is chat)',
    'ui.control.map': 'Map, waypoints and your current job',
    'ui.control.scoreboard': 'Scoreboard (co-op)',
    'ui.control.status': 'Status',
    'ui.control.menu': 'Game menu',
    'ui.control.saves': 'Saves: save (20% of your cash, at least $10,000) or load (single player)',
    'ui.pad.walk': 'Walk / drive',
    'ui.pad.accelerate': 'Accelerate / brake',
    'ui.pad.caps.create': 'Create',
    'ui.pad.caps.options': 'Options',
    'ui.pad.caps.dpad': 'D-pad',
    'ui.pad.caps.stick': 'Left stick',
    'ui.pad.connected': 'Connected: {name}.',
    'ui.pad.connectHint': 'Connect a controller (DualSense, DualShock 4, Xbox) and press any button so the browser sees it.',
    'ui.opt.camera.label': 'Camera',
    'ui.opt.camera.hint': 'Modern stops the zoom pumping on every bump; Classic is the original.',
    'ui.opt.camera.modern': 'Modern', 'ui.opt.camera.classic': 'Classic',
    'ui.opt.view.label': 'View distance',
    'ui.opt.view.hint': 'How much of the city you see (Modern camera).',
    'ui.opt.view.normal': 'Normal', 'ui.opt.view.far': 'Far', 'ui.opt.view.farther': 'Farther', 'ui.opt.view.farthest': 'Farthest',
    'ui.opt.aspect.label': 'Screen shape',
    'ui.opt.aspect.hint': 'Widescreen shows more of the city to the sides.',
    'ui.opt.aspect.wide': '16:9', 'ui.opt.aspect.fill': 'Fill window', 'ui.opt.aspect.original': '4:3 original',
    'ui.opt.smooth.label': 'Motion',
    'ui.opt.smooth.hint': 'Smooth draws extra frames to match your screen (60–165 Hz).',
    'ui.opt.smooth.smooth': 'Smooth', 'ui.opt.smooth.original': 'Original 30 fps',
    'ui.opt.hud.label': 'HUD',
    'ui.opt.hud.hint': 'Where score, wanted level and messages sit on a wide screen.',
    'ui.opt.hud.edges': 'Screen edges', 'ui.opt.hud.centre': 'Centred',
    'ui.opt.minimap.label': 'Radar',
    'ui.opt.minimap.hint': 'The round minimap in the corner.',
    'ui.on': 'On', 'ui.off': 'Off',
    'ui.opt.fps.label': 'FPS counter',
    'ui.opt.fps.hint': 'Frames per second, bottom left.',
    'ui.opt.sound.label': 'Sound',
    'ui.opt.sound.muted': 'Muted',
    'ui.opt.lang.label': 'Language',
    'ui.opt.lang.hint': 'This page and the game menus; mission text stays in English.',
    'ui.opt.lang.en': 'English', 'ui.opt.lang.es': 'Español', 'ui.opt.lang.fr': 'Français',
    'ui.landing.readyCached': 'Ready: GTA2 is saved in this browser.',
    'ui.landing.readyDownloaded': 'Ready: downloaded, and kept for next time.',
    'ui.landing.staticHint': 'Play downloads GTA2 once from the Internet Archive (free, 346 MB) and keeps it in this browser.',
    'ui.landing.continue': 'Continue',
    'ui.board.rank': '#',
    'ui.board.crew': 'Crew',
    'ui.board.reputation': 'Reputation',
    'ui.board.wins': 'Wins',
    'ui.board.kills': 'Kills',
    'ui.board.deaths': 'Deaths',
    'ui.board.points': 'Points',
    'ui.board.lastGang': ' · last sided with {gang}',
  },
  es: {
    'ui.group.move': 'Movimiento', 'ui.group.fight': 'Combate', 'ui.group.car': 'Coches', 'ui.group.weapon': 'Armas',
    'ui.group.info': 'Información', 'ui.group.menu': 'Menús',
    'ui.control.forwardBack': 'Avanzar / retroceder',
    'ui.control.turn': 'Girar a la izquierda / derecha',
    'ui.control.shoot': 'Disparar / pegar',
    'ui.control.enterCar': 'Subir o bajar de un coche',
    'ui.control.jump': 'Saltar / freno de mano',
    'ui.control.weapons': 'Arma anterior / siguiente',
    'ui.control.special': 'Especial (bocina, extras del coche)',
    'ui.control.radio': 'Encender / apagar la radio',
    'ui.control.radioNext': 'Siguiente emisora (en cooperativo T es el chat)',
    'ui.control.map': 'Mapa, puntos de ruta y tu trabajo actual',
    'ui.control.scoreboard': 'Tabla de puntuaciones (cooperativo)',
    'ui.control.status': 'Estado',
    'ui.control.menu': 'Menú del juego',
    'ui.control.saves': 'Partidas: guardar (20% de tu dinero, al menos 10.000 $) o cargar (un jugador)',
    'ui.pad.walk': 'Caminar / conducir',
    'ui.pad.accelerate': 'Acelerar / frenar',
    'ui.pad.caps.create': 'Crear',
    'ui.pad.caps.options': 'Opciones',
    'ui.pad.caps.dpad': 'Cruceta',
    'ui.pad.caps.stick': 'Stick izquierdo',
    'ui.pad.connected': 'Conectado: {name}.',
    'ui.pad.connectHint': 'Conecta un mando (DualSense, DualShock 4, Xbox) y pulsa cualquier botón para que el navegador lo detecte.',
    'ui.opt.camera.label': 'Cámara',
    'ui.opt.camera.hint': 'La moderna evita el bombeo del zoom en cada bache; la clásica es la original.',
    'ui.opt.camera.modern': 'Moderna', 'ui.opt.camera.classic': 'Clásica',
    'ui.opt.view.label': 'Distancia de visión',
    'ui.opt.view.hint': 'Cuánta ciudad ves (cámara moderna).',
    'ui.opt.view.normal': 'Normal', 'ui.opt.view.far': 'Lejos', 'ui.opt.view.farther': 'Más lejos', 'ui.opt.view.farthest': 'Lo máximo',
    'ui.opt.aspect.label': 'Formato de pantalla',
    'ui.opt.aspect.hint': 'La pantalla panorámica muestra más ciudad a los lados.',
    'ui.opt.aspect.wide': '16:9', 'ui.opt.aspect.fill': 'Llenar ventana', 'ui.opt.aspect.original': '4:3 original',
    'ui.opt.smooth.label': 'Movimiento',
    'ui.opt.smooth.hint': 'El modo fluido dibuja fotogramas extra para igualar tu pantalla (60–165 Hz).',
    'ui.opt.smooth.smooth': 'Fluido', 'ui.opt.smooth.original': '30 fps original',
    'ui.opt.hud.label': 'HUD',
    'ui.opt.hud.hint': 'Dónde se sitúan la puntuación, el nivel de búsqueda y los mensajes en pantalla ancha.',
    'ui.opt.hud.edges': 'Bordes de la pantalla', 'ui.opt.hud.centre': 'Centrado',
    'ui.opt.minimap.label': 'Radar',
    'ui.opt.minimap.hint': 'El minimapa redondo de la esquina.',
    'ui.on': 'Sí', 'ui.off': 'No',
    'ui.opt.fps.label': 'Contador de FPS',
    'ui.opt.fps.hint': 'Fotogramas por segundo, abajo a la izquierda.',
    'ui.opt.sound.label': 'Sonido',
    'ui.opt.sound.muted': 'Silenciado',
    'ui.opt.lang.label': 'Idioma',
    'ui.opt.lang.hint': 'Esta página y los menús del juego; el texto de las misiones sigue en inglés.',
    'ui.opt.lang.en': 'English', 'ui.opt.lang.es': 'Español', 'ui.opt.lang.fr': 'Français',
    'ui.landing.readyCached': 'Listo: GTA2 está guardado en este navegador.',
    'ui.landing.readyDownloaded': 'Listo: descargado y guardado para la próxima vez.',
    'ui.landing.staticHint': 'Jugar descarga GTA2 una vez del Internet Archive (gratis, 346 MB) y lo guarda en este navegador.',
    'ui.landing.continue': 'Continuar',
    'ui.board.rank': '#',
    'ui.board.crew': 'Clan',
    'ui.board.reputation': 'Reputación',
    'ui.board.wins': 'Victorias',
    'ui.board.kills': 'Asesinatos',
    'ui.board.deaths': 'Muertes',
    'ui.board.points': 'Puntos',
    'ui.board.lastGang': ' · último bando: {gang}',
  },
  fr: {
    'ui.group.move': 'Déplacement', 'ui.group.fight': 'Combat', 'ui.group.car': 'Voitures', 'ui.group.weapon': 'Armes',
    'ui.group.info': 'Infos', 'ui.group.menu': 'Menus',
    'ui.control.forwardBack': 'Avancer / reculer',
    'ui.control.turn': 'Tourner à gauche / à droite',
    'ui.control.shoot': 'Tirer / frapper',
    'ui.control.enterCar': 'Monter dans une voiture ou en descendre',
    'ui.control.jump': 'Sauter / frein à main',
    'ui.control.weapons': 'Arme précédente / suivante',
    'ui.control.special': 'Spécial (klaxon, extras de voiture)',
    'ui.control.radio': 'Radio marche / arrêt',
    'ui.control.radioNext': 'Station de radio suivante (en coopératif, T est le chat)',
    'ui.control.map': 'Carte, points de passage et votre contrat en cours',
    'ui.control.scoreboard': 'Tableau des scores (coopératif)',
    'ui.control.status': 'État',
    'ui.control.menu': 'Menu du jeu',
    'ui.control.saves': 'Sauvegardes : sauvegarder (20% de votre argent, au moins 10 000 $) ou charger (solo)',
    'ui.pad.walk': 'Marcher / conduire',
    'ui.pad.accelerate': 'Accélérer / freiner',
    'ui.pad.caps.create': 'Créer',
    'ui.pad.caps.options': 'Options',
    'ui.pad.caps.dpad': 'Croix directionnelle',
    'ui.pad.caps.stick': 'Stick gauche',
    'ui.pad.connected': 'Connectée : {name}.',
    'ui.pad.connectHint': 'Connectez une manette (DualSense, DualShock 4, Xbox) et appuyez sur un bouton pour que le navigateur la détecte.',
    'ui.opt.camera.label': 'Caméra',
    'ui.opt.camera.hint': "La moderne évite le pompage du zoom à chaque bosse ; la classique est celle d'origine.",
    'ui.opt.camera.modern': 'Moderne', 'ui.opt.camera.classic': 'Classique',
    'ui.opt.view.label': 'Distance de vue',
    'ui.opt.view.hint': 'La partie de la ville que vous voyez (caméra moderne).',
    'ui.opt.view.normal': 'Normale', 'ui.opt.view.far': 'Loin', 'ui.opt.view.farther': 'Plus loin', 'ui.opt.view.farthest': 'Le plus loin',
    'ui.opt.aspect.label': "Format d'écran",
    'ui.opt.aspect.hint': "L'écran large montre plus de ville sur les côtés.",
    'ui.opt.aspect.wide': '16:9', 'ui.opt.aspect.fill': 'Remplir la fenêtre', 'ui.opt.aspect.original': "4:3 d'origine",
    'ui.opt.smooth.label': 'Mouvement',
    'ui.opt.smooth.hint': 'Le mode fluide dessine des images supplémentaires pour suivre votre écran (60–165 Hz).',
    'ui.opt.smooth.smooth': 'Fluide', 'ui.opt.smooth.original': "30 fps d'origine",
    'ui.opt.hud.label': 'HUD',
    'ui.opt.hud.hint': 'Où se placent le score, le niveau de recherche et les messages sur un écran large.',
    'ui.opt.hud.edges': "Bords de l'écran", 'ui.opt.hud.centre': 'Centré',
    'ui.opt.minimap.label': 'Radar',
    'ui.opt.minimap.hint': 'La minicarte ronde dans le coin.',
    'ui.on': 'Activé', 'ui.off': 'Désactivé',
    'ui.opt.fps.label': 'Compteur FPS',
    'ui.opt.fps.hint': 'Images par seconde, en bas à gauche.',
    'ui.opt.sound.label': 'Son',
    'ui.opt.sound.muted': 'Coupé',
    'ui.opt.lang.label': 'Langue',
    'ui.opt.lang.hint': 'Cette page et les menus du jeu ; le texte des missions reste en anglais.',
    'ui.opt.lang.en': 'English', 'ui.opt.lang.es': 'Español', 'ui.opt.lang.fr': 'Français',
    'ui.landing.readyCached': 'Prêt : GTA2 est enregistré dans ce navigateur.',
    'ui.landing.readyDownloaded': 'Prêt : téléchargé et gardé pour la prochaine fois.',
    'ui.landing.staticHint': 'Jouer télécharge GTA2 une fois depuis Internet Archive (gratuit, 346 Mo) et le garde dans ce navigateur.',
    'ui.landing.continue': 'Continuer',
    'ui.board.rank': '#',
    'ui.board.crew': 'Équipe',
    'ui.board.reputation': 'Réputation',
    'ui.board.wins': 'Victoires',
    'ui.board.kills': 'Éliminations',
    'ui.board.deaths': 'Morts',
    'ui.board.points': 'Points',
    'ui.board.lastGang': ' · dernier camp : {gang}',
  },
});

// What each key does, by group (colour). Matches PORT_CONTROLS in shell.js
// and the shell's own keys (map, scoreboard, view distance).
const GROUPS = {
  move: { label: 'ui.group.move', colour: '#f5c518' },
  fight: { label: 'ui.group.fight', colour: '#ff5c5c' },
  car: { label: 'ui.group.car', colour: '#4cd07d' },
  weapon: { label: 'ui.group.weapon', colour: '#b38bff' },
  info: { label: 'ui.group.info', colour: '#4fc3ff' },
  menu: { label: 'ui.group.menu', colour: '#c9c9c9' },
};

export const CONTROLS = [
  { keys: ['W', 'S'], does: 'ui.control.forwardBack', group: 'move' },
  { keys: ['A', 'D'], does: 'ui.control.turn', group: 'move' },
  { keys: ['L'], does: 'ui.control.shoot', group: 'fight' },
  { keys: ['Return'], label: 'Enter', does: 'ui.control.enterCar', group: 'car' },
  { keys: ['Space'], does: 'ui.control.jump', group: 'car' },
  { keys: ['J', 'K'], does: 'ui.control.weapons', group: 'weapon' },
  { keys: ['I', 'O'], does: 'ui.control.special', group: 'weapon' },
  { keys: ['R'], does: 'ui.control.radio', group: 'car' },
  { keys: ['T'], does: 'ui.control.radioNext', group: 'car' },
  { keys: ['M'], does: 'ui.control.map', group: 'info' },
  { keys: ['Tab'], does: 'ui.control.scoreboard', group: 'info' },
  { keys: ['P'], does: 'ui.control.status', group: 'info' },
  { keys: ['-', '='], does: 'ui.opt.view.label', group: 'info' },
  { keys: ['Esc'], does: 'ui.control.menu', group: 'menu' },
  { keys: [SAVE_KEY, LOAD_KEY], does: 'ui.control.saves', group: 'menu' },
];

const ROWS = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Delete'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Return'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Alt', 'Cmd', 'Space', 'Cmd', 'Alt', 'Ctrl'],
];
const WIDE = { Delete: 1.6, Tab: 1.5, '\\': 1.1, Caps: 1.8, Return: 1.9, Shift: 2.4, Space: 6.2, Cmd: 1.3, Ctrl: 1.3, Alt: 1.2 };

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
};

function keyGroup(key) {
  const c = CONTROLS.find((ctl) => ctl.keys.includes(key));
  return c ? c.group : null;
}

/** A keyboard with the game's keys lit in their group's colour. */
function buildKeyboard(root) {
  const board = el('div', { class: 'kb', 'aria-hidden': 'true' });
  for (const row of ROWS) {
    const r = el('div', { class: 'kb-row' });
    for (const key of row) {
      const group = keyGroup(key);
      const k = el('span', { class: `kb-key${group ? ' lit' : ''}`, style: `flex:${WIDE[key] || 1}` }, key === 'Return' ? 'Enter' : key);
      if (group) k.style.setProperty('--c', GROUPS[group].colour);
      r.append(k);
    }
    board.append(r);
  }
  root.replaceChildren(board);
}

/** The legend: each control with its keys (or buttons) as keycaps. */
function buildLegend(root, controls, capLabel) {
  const list = el('ul', { class: 'legend' });
  for (const c of controls) {
    const item = el('li');
    item.style.setProperty('--c', GROUPS[c.group].colour);
    item.append(el('span', { class: 'dot' }));
    const caps = el('span', { class: 'caps' });
    c.keys.forEach((k, i) => {
      if (i) caps.append(el('span', { class: 'sep' }, '/'));
      caps.append(el('kbd', {}, capLabel(k)));
    });
    item.append(caps, el('span', { class: 'does' }, t(c.does)));
    list.append(item);
  }
  root.replaceChildren(list);
}

// ---- controller: what each button does while playing (web/gamepad.js PLAY) ----

const PAD_LABELS = {
  cross: '✕', circle: '○', square: '□', triangle: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2',
  l3: 'L3', r3: 'R3', create: 'ui.pad.caps.create', options: 'ui.pad.caps.options',
  dpad: 'ui.pad.caps.dpad', stick: 'ui.pad.caps.stick',
};

export const PAD_CONTROLS = [
  { keys: ['stick', 'dpad'], does: 'ui.pad.walk', group: 'move' },
  { keys: ['r2', 'l2'], does: 'ui.pad.accelerate', group: 'move' },
  { keys: ['cross'], does: 'ui.control.shoot', group: 'fight' },
  { keys: ['triangle'], does: 'ui.control.enterCar', group: 'car' },
  { keys: ['square'], does: 'ui.control.jump', group: 'car' },
  { keys: ['l1', 'r1'], does: 'ui.control.weapons', group: 'weapon' },
  { keys: ['circle', 'l3'], does: 'ui.control.special', group: 'weapon' },
  { keys: ['create'], does: 'ui.control.map', group: 'info' },
  { keys: ['r3'], does: 'ui.control.status', group: 'info' },
  { keys: ['options'], does: 'ui.control.menu', group: 'menu' },
];

// The diagram: a DualSense seen from the front, triggers behind the bumpers.
// Each shape: [control, kind, x, y, w, h, label].
const PAD_SHAPES = [
  ['l2', 'rect', 70, 8, 92, 30, 'L2'], ['r2', 'rect', 358, 8, 92, 30, 'R2'],
  ['l1', 'rect', 70, 42, 92, 20, 'L1'], ['r1', 'rect', 358, 42, 92, 20, 'R1'],
  ['touchpad', 'rect', 186, 74, 148, 72, ''],
  ['create', 'rect', 160, 82, 18, 30, ''], ['options', 'rect', 342, 82, 18, 30, ''],
  ['dpad', 'rect', 102, 108, 28, 28, ''], ['dpad', 'rect', 102, 172, 28, 28, ''],
  ['dpad', 'rect', 70, 140, 28, 28, ''], ['dpad', 'rect', 134, 140, 28, 28, ''],
  ['triangle', 'circle', 390, 122, 34, 34, '△'], ['cross', 'circle', 390, 186, 34, 34, '✕'],
  ['square', 'circle', 358, 154, 34, 34, '□'], ['circle', 'circle', 422, 154, 34, 34, '○'],
  ['stick', 'circle', 178, 226, 54, 54, 'L3'], ['r3', 'circle', 342, 226, 54, 54, 'R3'],
  ['ps', 'circle', 260, 214, 22, 22, ''],
];
const PAD_BODY = 'M120 64 H400 C470 64 505 110 512 190 C520 280 500 330 460 330 C420 330 400 290 370 262 H150 '
  + 'C120 290 100 330 60 330 C20 330 0 280 8 190 C15 110 50 64 120 64 Z';

/** The group a pad control belongs to (its colour), or null if it does nothing in the game. */
function padGroup(control) {
  const c = PAD_CONTROLS.find((ctl) => ctl.keys.includes(control));
  return c ? c.group : null;
}

const svg = (tag, attrs = {}, ...children) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
};

/** A controller with the game's buttons lit in their group's colour. */
function buildPad(root) {
  const pad = svg('svg', { class: 'pad-diagram', viewBox: '0 0 520 340', 'aria-hidden': 'true' },
    svg('path', { class: 'pad-body', d: PAD_BODY }));
  for (const [control, kind, x, y, w, h, label] of PAD_SHAPES) {
    const group = padGroup(control);
    const shape = kind === 'circle'
      ? svg('circle', { cx: x, cy: y, r: w / 2 })
      : svg('rect', { x, y, width: w, height: h, rx: 7 });
    shape.setAttribute('class', `pad-part${group ? ' lit' : ''}`);
    if (group) shape.style.setProperty('--c', GROUPS[group].colour);
    pad.append(shape);
    if (label) {
      const [cx, cy] = kind === 'circle' ? [x, y] : [x + w / 2, y + h / 2];
      const text = svg('text', { x: cx, y: cy, class: `pad-label${group ? ' lit' : ''}` }, label);
      if (group) text.style.setProperty('--c', GROUPS[group].colour);
      pad.append(text);
    }
  }
  root.replaceChildren(pad);
}

/** "Press a button" until a controller is seen, then its name. */
function watchPad(status, onFound) {
  const show = () => {
    const pad = findPad(listPads());
    status.textContent = pad
      ? t('ui.pad.connected', { name: padName(pad) })
      : t('ui.pad.connectHint');
    status.classList.toggle('found', !!pad);
    if (pad) onFound();
  };
  window.addEventListener('gamepadconnected', show);
  window.addEventListener('gamepaddisconnected', show);
  return show;
}

/** Keyboard / Controller tabs (arrow keys move between them). */
function wireTabs(tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    }
  };
  for (const tab of tabs) tab.addEventListener('click', () => select(tab));
  tablist.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
    select(next);
    next.focus();
    e.preventDefault();
  });
  return (id) => select(tabs.find((t) => t.id === id));
}

function renderControls() {
  buildKeyboard(document.getElementById('kb-root'));
  buildLegend(document.getElementById('legend-root'), CONTROLS, (k) => (k === 'Return' ? 'Enter' : k));
  buildPad(document.getElementById('pad-root'));
  // t() falls back to the key itself, so plain labels ('L2', '✕') pass through unchanged
  buildLegend(document.getElementById('pad-legend-root'), PAD_CONTROLS, (k) => t(PAD_LABELS[k]));
}

function wireControls() {
  const selectTab = wireTabs(document.getElementById('controls-tabs'));
  let switched = false;
  // the first time a controller shows up, its tab opens
  const showPad = watchPad(document.getElementById('pad-status'), () => {
    if (!switched) selectTab('tab-pad');
    switched = true;
  });
  return showPad;
}

// ---- options: saved in this browser, used when the game starts (the in-game buttons still work) ----

const OPTIONS = [
  { key: 'gta2-port-lang', label: 'ui.opt.lang.label', hint: 'ui.opt.lang.hint',
    choices: [['en', 'ui.opt.lang.en'], ['es', 'ui.opt.lang.es'], ['fr', 'ui.opt.lang.fr']], fallback: 'en',
    get: lang, apply: setLang },
  { key: 'gta2-port-camera', label: 'ui.opt.camera.label', hint: 'ui.opt.camera.hint',
    choices: [['modern', 'ui.opt.camera.modern'], ['classic', 'ui.opt.camera.classic']], fallback: 'modern' },
  { key: 'gta2-port-view-distance', label: 'ui.opt.view.label', hint: 'ui.opt.view.hint',
    choices: [['0', 'ui.opt.view.normal'], ['1', 'ui.opt.view.far'], ['2', 'ui.opt.view.farther'], ['3', 'ui.opt.view.farthest']], fallback: '0' },
  { key: 'gta2-port-aspect', label: 'ui.opt.aspect.label', hint: 'ui.opt.aspect.hint',
    choices: [['16:9', 'ui.opt.aspect.wide'], ['auto', 'ui.opt.aspect.fill'], ['4:3', 'ui.opt.aspect.original']], fallback: '16:9' },
  { key: 'gta2-port-smooth', label: 'ui.opt.smooth.label', hint: 'ui.opt.smooth.hint',
    choices: [['1', 'ui.opt.smooth.smooth'], ['0', 'ui.opt.smooth.original']], fallback: '1' },
  { key: 'gta2-port-hud', label: 'ui.opt.hud.label', hint: 'ui.opt.hud.hint',
    choices: [['edges', 'ui.opt.hud.edges'], ['centre', 'ui.opt.hud.centre']], fallback: 'edges' },
  { key: 'gta2-port-minimap', label: 'ui.opt.minimap.label', hint: 'ui.opt.minimap.hint',
    choices: [['true', 'ui.on'], ['false', 'ui.off']], fallback: 'true' },
  { key: 'gta2-port-show-fps', label: 'ui.opt.fps.label', hint: 'ui.opt.fps.hint',
    choices: [['1', 'ui.on'], ['0', 'ui.off']], fallback: '0' },
  { key: 'gta2-port-muted', label: 'ui.opt.sound.label', hint: '',
    choices: [['0', 'ui.on'], ['1', 'ui.opt.sound.muted']], fallback: '0' },
];

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, v) => { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } };

function renderOptions(root) {
  root.replaceChildren();
  for (const o of OPTIONS) {
    const current = o.get ? o.get() : (read(o.key) ?? o.fallback);
    const group = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': t(o.label) });
    for (const [value, textKey] of o.choices) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(value === current) }, t(textKey));
      b.addEventListener('click', () => {
        if (o.apply) o.apply(value);
        else write(o.key, value);
        for (const other of group.children) other.setAttribute('aria-checked', String(other === b));
      });
      group.append(b);
    }
    root.append(el('div', { class: 'opt' }, el('div', { class: 'opt-label' }, el('strong', {}, t(o.label)),
      o.hint ? el('small', {}, t(o.hint)) : ''), group));
  }
}

// What the page currently shows, kept so its text can be rebuilt on a language change.
const view = {
  visible: false,
  filesText: { key: 'ui.files.preparing' },
  filesError: false,
  showPad: null,
  save: null,
  onContinue: null,
  thumbUrl: null,
  crews: [],
};

function renderFiles() {
  const state = document.getElementById('files-state');
  if (!state) return;
  const shown = view.filesText;
  state.textContent = shown.raw ?? t(shown.key, shown.vars);
  state.style.color = view.filesError ? '#ff8a8a' : '';
}

function renderContinue() {
  const root = document.getElementById('continue-root');
  if (!root) return;
  if (!view.save) { root.hidden = true; root.replaceChildren(); return; }
  const button = el('button', { type: 'button', class: 'continue' });
  if (view.thumbUrl) URL.revokeObjectURL(view.thumbUrl);
  view.thumbUrl = view.save.thumb ? URL.createObjectURL(view.save.thumb) : null;
  if (view.thumbUrl) button.append(el('img', { src: view.thumbUrl, alt: '' }));
  // Translated here, not when the card is set up: a language change rebuilds it live.
  const { where, how } = describe(view.save);
  button.append(el('span', {}, el('b', {}, t('ui.landing.continue')), el('strong', {}, where),
    el('small', {}, how)));
  button.addEventListener('click', () => { button.disabled = true; view.onContinue(); });
  root.replaceChildren(button);
  root.hidden = false;
}

function renderLeaderboard() {
  const root = document.getElementById('leaderboard-root');
  if (!root || !view.crews.length) return;
  const table = el('table', { class: 'board' });
  const head = table.insertRow();
  const heads = ['ui.board.rank', 'ui.board.crew', 'ui.board.reputation', 'ui.board.wins', 'ui.board.kills', 'ui.board.deaths', 'ui.board.points'];
  for (const h of heads) head.append(el('th', {}, t(h)));
  view.crews.slice(0, 20).forEach((c, i) => {
    const tr = table.insertRow();
    tr.insertCell().append(el('span', { class: 'rank' }, num(i + 1)));
    const name = tr.insertCell();
    name.append(el('div', { class: 'crew-name' }, c.name),
      el('div', { class: 'members' }, c.members.map((m) => m.name).join(', ')
        + (c.lastGang ? t('ui.board.lastGang', { gang: c.lastGang }) : '')));
    tr.insertCell().append(el('span', { class: 'rep' }, num(c.reputation)));
    tr.insertCell().append(`${num(c.wins)} / ${num(c.matches)}`);
    tr.insertCell().append(num(c.kills));
    tr.insertCell().append(num(c.deaths));
    tr.insertCell().append(money(c.points));
  });
  root.replaceChildren(table);
}

/** Rebuilds everything the landing page draws itself (the static page is handled by applyDom). */
function render() {
  if (!view.visible) return;
  renderControls();
  renderOptions(document.getElementById('options-root'));
  if (view.showPad) view.showPad();
  renderFiles();
  renderContinue();
  renderLeaderboard();
}

onLangChange(render);

/**
 * Shows the landing page.
 * @param {object} opts
 * @param {() => void} opts.onPlay single player
 * @param {() => void} opts.onCoop the co-op lobby
 * @param {{promise: Promise, fromCache: boolean}|null} opts.files the game files download, when it runs here
 */
export function showLanding({ onPlay, onCoop, files }) {
  document.body.classList.add('landing-on');
  document.getElementById('landing').hidden = false;
  document.getElementById('topnav').hidden = false;
  view.visible = true;
  if (!view.showPad) view.showPad = wireControls();
  for (const b of document.querySelectorAll('[data-play]')) b.addEventListener('click', () => onPlay());
  for (const b of document.querySelectorAll('[data-coop]')) b.addEventListener('click', () => onCoop());
  const bar = document.getElementById('files-bar');
  if (files) {
    files.promise.then(() => {
      view.filesText = { key: files.fromCache ? 'ui.landing.readyCached' : 'ui.landing.readyDownloaded' };
      renderFiles();
      bar.value = 1;
      bar.hidden = true;
    }, () => { /* serverGameFiles() shows the error, with a retry */ });
  } else {
    // a static site, GTA2 not yet in this browser: Play gets it (once) from the Internet Archive
    view.filesText = { key: 'ui.landing.staticHint' };
    renderFiles();
    bar.hidden = true;
  }
  render();
}

/**
 * Continue: the newest save in this browser, as a card under Play.
 * @param {{label: object, savedAt: number, thumb: Blob|null}} save the raw save (its text is translated at render time)
 * @param {() => void} onContinue
 */
export function showContinue(save, onContinue) {
  view.save = save;
  view.onContinue = onContinue;
  renderContinue();
}

/** Download progress for the landing page's status card. */
export function landingProgress(text, fraction, isError = false) {
  const bar = document.getElementById('files-bar');
  if (!document.getElementById('files-state')) return;
  view.filesText = { raw: text };
  view.filesError = isError;
  renderFiles();
  bar.hidden = isError;
  bar.value = fraction;
}

/** Hides the landing page (the game is starting). */
export function hideLanding() {
  view.visible = false;
  document.body.classList.remove('landing-on');
  document.getElementById('landing').hidden = true;
  document.getElementById('topnav').hidden = true;
}

/** The crew leaderboard (saved Gang Wars crews on this server). */
export function showLeaderboard(crews) {
  view.crews = crews;
  renderLeaderboard();
}
