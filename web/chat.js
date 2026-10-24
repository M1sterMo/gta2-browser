// Co-op text chat (D20): T to type, Enter to send, Esc to cancel. Messages go
// through the lobby's transport as lobby messages, outside the game, so they
// never affect the lockstep simulation.

import { onLangChange, registerDict, t } from './strings.js';

registerDict({
  en: {
    'ui.chat.placeholder': 'Say something… (Enter to send, Esc to cancel)',
    'ui.chat.message': 'Chat message',
    'ui.chat.hint': 'Press T to chat.',
  },
  es: {
    'ui.chat.placeholder': 'Di algo… (Enter para enviar, Esc para cancelar)',
    'ui.chat.message': 'Mensaje del chat',
    'ui.chat.hint': 'Pulsa T para chatear.',
  },
  fr: {
    'ui.chat.placeholder': 'Dites quelque chose… (Entrée pour envoyer, Échap pour annuler)',
    'ui.chat.message': 'Message du chat',
    'ui.chat.hint': 'Appuyez sur T pour discuter.',
  },
});

const SHOW_MS = 9000;
const MAX_LINES = 8;

export class CoopChat {
  /**
   * @param {object} opts
   * @param {object} opts.lobby CoopLobby (sendChat, onChat)
   * @param {(slot: number) => string} opts.name
   * @param {(slot: number) => string} opts.colour
   * @param {number} opts.mySlot
   * @param {() => void} opts.releaseKeys lets go of game keys when typing starts
   */
  constructor({ lobby, name, colour, mySlot, releaseKeys }) {
    this.lobby = lobby;
    this.name = name;
    this.colour = colour;
    this.mySlot = mySlot;
    this.releaseKeys = releaseKeys;
    this.log = document.createElement('div');
    this.log.id = 'chat-log';
    this.log.setAttribute('aria-live', 'polite');
    this.input = document.createElement('input');
    this.input.id = 'chat-input';
    this.input.maxLength = 160;
    this.input.placeholder = t('ui.chat.placeholder');
    this.input.hidden = true;
    this.input.setAttribute('aria-label', t('ui.chat.message'));
    onLangChange(() => {
      this.input.placeholder = t('ui.chat.placeholder');
      this.input.setAttribute('aria-label', t('ui.chat.message'));
    });
    document.body.append(this.log, this.input);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.send(this.input.value); this.close(); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(); e.preventDefault(); }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => this.close());
    lobby.onChat = (slot, text) => this.add(slot, text);
    this.add(-1, t('ui.chat.hint'));
  }

  get open() { return !this.input.hidden; }

  /** Keys while playing: T opens the chat. Returns true when the key is the chat's. */
  handleKey(e, down) {
    if (this.open) return true;
    if (e.code === 'KeyT' && down && !e.repeat) {
      this.releaseKeys();
      this.input.hidden = false;
      this.input.value = '';
      setTimeout(() => this.input.focus(), 0);
      return true;
    }
    return false;
  }

  close() {
    if (!this.open) return;
    this.input.hidden = true;
    this.input.blur();
    const screen = document.getElementById('screen');
    if (screen) screen.focus();
  }

  send(raw) {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!text) return;
    this.lobby.sendChat(text);
    this.add(this.mySlot, text);
  }

  add(slot, text) {
    const line = document.createElement('p');
    if (slot >= 0) {
      const who = document.createElement('b');
      who.textContent = `${this.name(slot)}: `;
      who.style.color = this.colour(slot);
      line.append(who);
    } else {
      line.className = 'note';
    }
    line.append(document.createTextNode(text));
    this.log.append(line);
    while (this.log.children.length > MAX_LINES) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), SHOW_MS);
  }
}
