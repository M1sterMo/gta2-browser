// Web language -> game language. The web setting (web/strings.js, localStorage
// 'gta2-port-lang') is the single source of truth: it writes the engine's
// registry "language" value before boot (web/shell.js seedRegistry) and, when
// the selected language's data/<letter>.gxt is missing from the user's game
// files, generates one from data/e.gxt plus our own translation overlay
// (web/gxt-translations.js). A change while the game runs is applied live.
//
// The engine's own in-game Options screen is deliberately not involved (it has
// a known bug); the web setting always wins.
import { onLangChange, registerDict, t } from './strings.js';
import { GAME_TRANSLATIONS } from './gxt-translations.js';
import { translateGxt } from './gxtgen.js';

const GAME_DIR = '/gta2';
const GXT_LETTERS = { en: 'e', es: 's', fr: 'f' };
const LANG_NAMES = { en: 'English', es: 'Español', fr: 'Français' };

registerDict({
  en: {
    'game.languageChanged': 'Game language: {language}',
    'game.languageFailed': 'Could not change the game language: {message}',
    'game.languageHost': 'The page is now in English; in co-op the game keeps the host\'s language until the match ends.',
  },
  es: {
    'game.languageChanged': 'Idioma del juego: {language}',
    'game.languageFailed': 'No se pudo cambiar el idioma del juego: {message}',
    'game.languageHost': 'La página está ahora en español; en cooperativo el juego mantiene el idioma del anfitrión hasta el final de la partida.',
  },
  fr: {
    'game.languageChanged': 'Langue du jeu : {language}',
    'game.languageFailed': 'Impossible de changer la langue du jeu : {message}',
    'game.languageHost': 'La page est maintenant en français ; en coopération, le jeu garde la langue de l\'hôte jusqu\'à la fin de la partie.',
  },
});

/** GXT file letter for a web language code ('es' -> 's'). */
export function gxtLetterFor(code) {
  return GXT_LETTERS[code] || 'e';
}

/**
 * Generates data/<letter>.gxt from data/e.gxt and our translation table when
 * the user's game files do not already ship one (an official file always wins).
 * Must run before the engine loads text.
 * @returns {boolean} true when a file was generated
 */
export function ensureGameLanguage(Module, code) {
  const letter = gxtLetterFor(code);
  const fs = Module.FS;
  const target = `${GAME_DIR}/data/${letter}.gxt`;
  if (letter === 'e' || fs.analyzePath(target).exists) return false;
  const english = fs.readFile(`${GAME_DIR}/data/e.gxt`);
  fs.writeFile(target, translateGxt(english, letter, GAME_TRANSLATIONS[code] || {}));
  return true;
}

/** Switches the running game to the web language (registry value + live reload). */
export function applyGameLanguage(Module, code) {
  if (!Module) return false;
  ensureGameLanguage(Module, code);
  const letter = gxtLetterFor(code);
  Module.ccall('gta2_port_reg_set_string', null, ['string', 'string', 'string'],
    ['hklm\\software\\dma design ltd\\gta2\\option', 'language', letter]);
  return !!Module.ccall('gta2_port_set_language', 'number', ['string'], [letter]);
}

/**
 * Wires the live switch: a language change while the game runs reloads its
 * text; before boot (or when it is not running) it simply takes effect at the
 * next start. `notify` (optional) shows a message, e.g. the shell's status.
 */
export function initGameLanguage(notify = null, locked = () => false) {
  onLangChange((code) => {
    const Module = typeof window !== 'undefined' && window.gta2 ? window.gta2.Module : null;
    if (!Module) return;
    // co-op: every player's game shows the host's language; only the page follows this player
    if (locked()) { if (notify) notify(t('game.languageHost')); return; }
    try {
      if (!applyGameLanguage(Module, code)) return;
      if (notify) notify(t('game.languageChanged', { language: LANG_NAMES[code] || code }));
    } catch (err) {
      // A missing or corrupt e.gxt must not break the other language-change listeners.
      if (notify) notify(t('game.languageFailed', { message: err.message || err }), true);
    }
  });
}
