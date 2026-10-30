// The match clock (co-op): the one place that decides which inputs every player's game uses at
// each tick. It runs on our game server (server/server.mjs), or in the host's page where there is
// no server (web/net.js); it has no imports, so both can load it.
//
// Every player's game runs the whole simulation (GTA2's lockstep). The original waited in every
// game for every other player's inputs, so one slow connection held everyone up, and each game
// decided on its own when a player had gone. The clock takes each player's inputs as they come
// and, 30 times a second, sends everyone one bundle with an input per player. A player whose
// input is late gets a made-up one, so nobody waits for anybody else; every game plays the same
// bundles in the same order, so the games stay identical.
//
// An input is GTA2's per-tick u32 (winmain.cpp): bits 0-11 are held controls (forward ... special
// 3), bits 12-20 a DirectInput key and bit 21 press or release, a one-off key event (HUD keys, the
// quit prompt).
// - Each player's inputs queue here in order, and each tick takes one.
// - A made-up input (the queue is empty) holds the controls of the last real one for at most
//   HOLD_TICKS (100 ms; HOLD_TICKS_PREDICTING, 500 ms, for a game with prediction), then nothing;
//   never a key event, so it never starts anything.
// - A late input waits for the next tick, so the queue becomes that player's buffer against
//   jitter. It is kept short: over MAX_QUEUE, or after holding two or more for TRIM_AFTER ticks
//   in a row, the oldest input is merged into the next (held controls OR-ed, so a short tap still
//   counts; never two key events, which wait instead).
// - A player is dropped (a 'left' entry: the game's own give-up, at the same tick in every game)
//   once they leave the match, or after LEAVE_AFTER_MS without an input (closed tab, lost
//   connection). The clock starts when every player's game has sent its first input or left, or
//   after START_WAIT_MS.
//
//
// With prediction (web/rollback.js) a game plays its own inputs at once, ahead of the clock, and
// stamps each with the tick it played it at: [STAMPED, seq, bits u32 LE, tick u32 LE]. The clock uses a
// stamped input at exactly that tick when it arrives in time, so the game guessed right. One that
// comes after its tick went out is late: its held controls count from the next tick that has no
// input of its own, its key event from the next tick without one. Each bundle tells every game
// how early (or, below 0, how late) its inputs arrived, so it can play just far enough ahead.
//
// Bundle (binary): [BUNDLE, tick u32 LE, n u8, then n x (slot u8, kind u8: 0 input / 1 left,
// bits u32 LE), then n x margin i16 LE]: the margin (ms) is the least of the player's stamped
// inputs that arrived since the last bundle (NO_MARGIN: none). An input message from a game without
// prediction is the core's own: [3 (inputs), seq, bits u32 LE].

export const TICK_MS = 1000 / 30;
export const BUNDLE = 0x42;
const INPUTS = 3;
export const STAMPED = 0x13; // not INPUTS: the core's own message is 10 bytes too with its sync check on
const HELD = 0xfff;
const KEY_EVENT = 0x3ff000;
export const HOLD_TICKS = 3;
// A game with prediction plays its held controls on: its inputs are late only in a lag spike, and
// guessing "still held" for longer then keeps its own player from jumping back.
export const HOLD_TICKS_PREDICTING = 15;
export const MAX_QUEUE = 8;
export const TRIM_AFTER = 60;
export const LEAVE_AFTER_MS = 20000;
export const START_WAIT_MS = 20000;
const HISTORY_TICKS = 900; // 30 s, for a game that reconnects and asks for what it missed
export const NO_MARGIN = 0x7fff;
const MAX_EARLY_TICKS = 300; // a stamped input further ahead than 10 s is not kept

export class MatchClock {
  /**
   * @param {object} opts
   * @param {number} opts.players how many slots (0 .. players-1)
   * @param {(bytes: Uint8Array, tick: number) => void} opts.send gives a bundle to every game
   * @param {() => number} [opts.now] milliseconds
   */
  constructor({ players, send, now = () => performance.now() }) {
    this.send = send;
    this.now = now;
    this.created = now();
    this.start = null; // when tick 0 was due
    this.tick = 0;     // the next tick to send
    this.slots = Array.from({ length: players }, () => ({
      queue: [], held: 0, madeUp: 0, deep: 0, seen: false, heard: 0, leaving: false, gone: false, late: 0,
      // prediction: stamped inputs by tick, a late one's held controls and key events, the margin
      byTick: new Map(), lateHeld: null, lateKeys: [], margin: NO_MARGIN, predicting: false,
    }));
    this.history = new Map();
  }

  /** A game's message for the clock (only input messages count). */
  input(slot, bytes) {
    const s = this.slots[slot];
    if (!s || s.gone || bytes.length < 6 || (bytes[0] !== INPUTS && bytes[0] !== STAMPED)) return;
    const bits = (bytes[2] | (bytes[3] << 8) | (bytes[4] << 16) | (bytes[5] << 24)) >>> 0;
    s.seen = true;
    s.heard = this.now();
    if (bytes[0] !== STAMPED || bytes.length < 10) {
      s.queue.push(bits);
      return;
    }
    const tick = (bytes[6] | (bytes[7] << 8) | (bytes[8] << 16) | (bytes[9] << 24)) >>> 0;
    s.predicting = true;
    if (this.start !== null) {
      const margin = Math.round(this.start + tick * TICK_MS - s.heard);
      s.margin = Math.min(s.margin, Math.max(-NO_MARGIN + 1, Math.min(NO_MARGIN - 1, margin)));
    }
    if (tick >= this.tick) {
      if (tick < this.tick + MAX_EARLY_TICKS) s.byTick.set(tick, bits);
      return;
    }
    // late: its tick has gone out with a made-up input
    s.lateHeld = bits & HELD;
    if (bits & KEY_EVENT) s.lateKeys.push(bits & KEY_EVENT);
  }

  /** The player has left the match: dropped at the next tick. */
  leave(slot) {
    if (this.slots[slot]) this.slots[slot].leaving = true;
  }

  /** True once every player has been dropped. */
  get done() {
    return this.slots.every((s) => s.gone);
  }

  /** Sends every bundle that is due; call it often (a few milliseconds apart). */
  poll() {
    const now = this.now();
    if (this.start === null) {
      if (!this.slots.every((s) => s.seen || s.leaving) && now - this.created < START_WAIT_MS) return;
      this.start = now;
      for (const s of this.slots) s.heard = Math.max(s.heard, now);
    }
    while (!this.done && now >= this.start + this.tick * TICK_MS) this.emit(now);
  }

  emit(now) {
    const entries = [];
    this.slots.forEach((s, slot) => {
      if (s.gone) return;
      if (s.leaving || now - s.heard > LEAVE_AFTER_MS) {
        s.gone = true;
        entries.push([slot, 1, 0]);
        return;
      }
      let bits = s.byTick.get(this.tick);
      if (bits !== undefined) s.byTick.delete(this.tick);
      else if (s.lateHeld !== null) bits = s.lateHeld;
      else if (s.lateKeys.length) bits = s.held;
      s.lateHeld = null;
      if (bits !== undefined && !(bits & KEY_EVENT) && s.lateKeys.length) bits = (bits | s.lateKeys.shift()) >>> 0;
      if (bits !== undefined) {
        s.held = bits & HELD;
        s.madeUp = 0;
      } else if (s.queue.length) {
        bits = s.queue.shift();
        s.held = bits & HELD;
        s.madeUp = 0;
      } else {
        s.madeUp++;
        s.late++;
        bits = s.madeUp <= (s.predicting ? HOLD_TICKS_PREDICTING : HOLD_TICKS) ? s.held : 0;
      }
      s.deep = s.queue.length >= 2 ? s.deep + 1 : 0;
      if (s.queue.length > MAX_QUEUE || s.deep >= TRIM_AFTER) {
        if (merge(s.queue)) s.deep = 0;
      }
      entries.push([slot, 0, bits, s.margin]);
      s.margin = NO_MARGIN;
    });
    const n = entries.length;
    const out = new Uint8Array(6 + n * 8);
    const view = new DataView(out.buffer);
    out[0] = BUNDLE;
    view.setUint32(1, this.tick, true);
    out[5] = n;
    entries.forEach(([slot, kind, bits, margin = NO_MARGIN], i) => {
      out[6 + i * 6] = slot;
      out[7 + i * 6] = kind;
      view.setUint32(8 + i * 6, bits, true);
      view.setInt16(6 + n * 6 + i * 2, margin, true);
    });
    this.history.set(this.tick, out);
    this.history.delete(this.tick - HISTORY_TICKS);
    this.send(out, this.tick);
    this.tick++;
  }

  /** The bundles from tick `from` on, for a game that missed them (oldest first); null if they are gone. */
  since(from) {
    if (from >= this.tick) return [];
    if (!this.history.has(from)) return null;
    const out = [];
    for (let t = from; t < this.tick; t++) out.push(this.history.get(t));
    return out;
  }

  /** Per player: inputs waiting, made-up inputs so far, any input yet, dropped. */
  stats() {
    return this.slots.map((s) => ({ queued: s.queue.length, late: s.late, seen: s.seen, gone: s.gone }));
  }
}

/** Merges the oldest queued input into the next one; false when both carry a key event. */
function merge(queue) {
  if (queue.length < 2) return false;
  const [a, b] = queue;
  if ((a & KEY_EVENT) && (b & KEY_EVENT)) return false;
  queue.splice(0, 2, (b | (a & HELD) | (a & KEY_EVENT)) >>> 0);
  return true;
}

/**
 * Reads a bundle: {tick, entries: [{slot, left, bits}], margins: [ms or null per entry]}, or null if
 * it is not one.
 */
export function readBundle(bytes) {
  if (bytes.length < 6 || bytes[0] !== BUNDLE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes[5];
  if (bytes.length < 6 + n * 6) return null;
  const entries = [];
  const margins = [];
  for (let i = 0; i < n; i++) {
    entries.push({ slot: bytes[6 + i * 6], left: bytes[7 + i * 6] === 1, bits: view.getUint32(8 + i * 6, true) });
    const m = bytes.length >= 6 + n * 8 ? view.getInt16(6 + n * 6 + i * 2, true) : NO_MARGIN;
    margins.push(m === NO_MARGIN ? null : m);
  }
  return { tick: view.getUint32(1, true), entries, margins };
}
