// Game controllers (DualSense, DualShock 4, Xbox...) through the Gamepad API.
//
// Each frame the pad's buttons become the same KeyboardEvent codes the keyboard sends,
// so the port's default controls, the map screen and the game's menus work unchanged.
// Only pads with the browser's "standard" mapping are used.

import { t } from './strings.js';

const STICK_DEADZONE = 0.35;

// Standard mapping button indices (DualSense names).
const BUTTONS = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  create: 8, options: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15,
};

// While playing: the port's default controls (web/shell.js PORT_CONTROLS) plus the shell's keys.
export const PLAY = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  r2: 'KeyW', l2: 'KeyS', // accelerate / brake
  cross: 'KeyL', triangle: 'Enter', square: 'Space', circle: 'KeyI',
  l1: 'KeyJ', r1: 'KeyK', r3: 'KeyP', l3: 'KeyO',
  options: 'Escape', create: 'KeyM',
};

// In the game's menus and the map screen.
const MENU = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  cross: 'Enter', circle: 'Escape', options: 'Escape', create: 'KeyM',
  l1: 'Minus', r1: 'Equal', // map zoom
};

export const listPads = () => (navigator.getGamepads ? [...navigator.getGamepads()] : []);

/** The first connected pad with the browser's standard layout, or null. */
export const findPad = (pads) => pads.find((p) => p && p.connected && p.mapping === 'standard') || null;

/**
 * The pad's name without the vendor and product ids the browsers add:
 * Chrome "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
 * Firefox "054c-0ce6-DualSense Wireless Controller".
 */
export function padName(pad) {
  const name = pad.id.replace(/\s*\(.*\)\s*$/, '').replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '').trim();
  return name || t('ui.controller');
}

/** Names of the pressed buttons; the left stick counts as the d-pad. */
export function pressedButtons(pad) {
  const pressed = new Set();
  for (const [name, index] of Object.entries(BUTTONS)) {
    if (pad.buttons[index] && pad.buttons[index].pressed) pressed.add(name);
  }
  const [x = 0, y = 0] = pad.axes;
  if (y < -STICK_DEADZONE) pressed.add('up');
  if (y > STICK_DEADZONE) pressed.add('down');
  if (x < -STICK_DEADZONE) pressed.add('left');
  if (x > STICK_DEADZONE) pressed.add('right');
  return pressed;
}

/** KeyboardEvent codes for the pressed buttons in the current context. */
export function codesFor(buttons, playing) {
  const map = playing ? PLAY : MENU;
  return new Set([...buttons].map((name) => map[name]).filter(Boolean));
}

export class GamepadInput {
  /**
   * @param {(code: string, down: boolean) => void} send presses or releases a key
   * @param {() => boolean} isPlaying true while the player is in the city (not in a menu or the map)
   */
  constructor({ send, isPlaying, getPads = listPads, onConnect = () => {} }) {
    this.send = send;
    this.isPlaying = isPlaying;
    this.getPads = getPads;
    this.onConnect = onConnect;
    this.held = new Set();
    // Buttons held across a context change: ignored until released, so the Cross that
    // confirms a menu does not also fire a shot.
    this.blocked = new Set();
    this.playing = undefined;
  }

  start() {
    window.addEventListener('gamepadconnected', (e) => {
      this.onConnect(e.gamepad);
      this.loop();
    });
    window.addEventListener('blur', () => this.releaseAll());
    if (this.activePad()) this.loop();
  }

  loop() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.activePad()) {
        this.releaseAll();
        this.running = false;
        return;
      }
      this.poll();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  activePad() {
    return findPad([...this.getPads()]);
  }

  poll() {
    const pad = this.activePad();
    if (!pad || !document.hasFocus()) return;
    const buttons = pressedButtons(pad);
    const playing = this.isPlaying();
    if (playing !== this.playing) {
      if (this.playing !== undefined) this.blocked = new Set(buttons);
      this.playing = playing;
    }
    for (const name of this.blocked) if (!buttons.has(name)) this.blocked.delete(name);
    const active = [...buttons].filter((name) => !this.blocked.has(name));
    this.apply(codesFor(active, playing));
  }

  /** Sends the presses and releases that turn the held keys into `codes`. */
  apply(codes) {
    for (const code of this.held) if (!codes.has(code)) this.send(code, false);
    for (const code of codes) if (!this.held.has(code)) this.send(code, true);
    this.held = codes;
  }

  releaseAll() {
    this.apply(new Set());
  }
}
