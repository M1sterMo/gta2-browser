// Co-op prediction (rollback): this player's inputs show at once, not a round trip late.
//
// Every game simulates the whole match (GTA2's lockstep), and the match clock (web/clock.js)
// decides which inputs each tick uses; without prediction a game plays a tick only once the
// clock's bundle for it has arrived. With it, this page runs the ticks itself (the core's loop only
// draws between them, port/platform/rollback_web.cpp):
// - It plays ahead of the clock: this player's inputs at once, stamped with their tick and sent to
//   the clock, which uses them at that very tick when they arrive in time; the other players'
//   held controls as the clock last confirmed them (key events are never guessed).
// - It keeps a snapshot of the game at the last confirmed tick. As the clock's bundles come in it
//   goes back to the snapshot, plays the confirmed ticks, takes a new snapshot and predicts again
//   up to the present. A wrong guess (another player turned) is put right by that replay; the
//   confirmed ticks are the same in every game, so the games stay identical, and the sync check
//   (shell.js) compares those only.
// - Sound comes from the confirmed ticks only (a predicted tick is silent, it will be played again).
// - It keeps just far enough ahead: each bundle says how early this player's inputs reached the
//   clock, and the page runs its ticks a little faster or slower to keep that small but positive.
//
// A snapshot is the game's WebAssembly memory (as for quick saves) without the stack. What the
// page itself does to that memory between two steps (keys, settings) goes into a journal and is
// done again after going back, so going back loses none of it; the journal's functions are wrapped
// before anything else holds them (installJournal).

import { BUNDLE, NO_MARGIN, STAMPED, TICK_MS } from './clock.js';

const HELD = 0xfff;
const MAX_AHEAD = 24;       // ticks played ahead of the clock at most (0.8 s); then the game waits
const MAX_BURST = 3;        // new ticks in one step at most (after a stall, the rest are dropped)
const MAX_CATCHUP = 45;     // confirmed ticks in one step at most (a resume brings up to 30 s of them)
const TARGET_MARGIN = 15;   // ms: nearly all of this player's inputs should reach the clock this early
const SLACK = 30;           // ms: and not much earlier than TARGET_MARGIN + SLACK (needless guessing)
const MAX_NUDGE = 4;        // ms a tick may be shortened or stretched by to keep that margin
const JUMP_MS = 200;        // being later than this is made up at once (start, after a frozen page)
const FROZEN_MS = 250;      // a page that ran no frame for this long was frozen (or hidden)
const WINDOW_MS = 5000;     // the margins steer() looks at
const STEER_EVERY = 1000;   // ms between steer()'s decisions
const STEP_EARLIER = 60;    // ms: some late inputs (jitter, a spike) move the ticks earlier by at most this a time
const STEP_LATER = 40;      // ms: needlessly early ones move them later by at most this a time

// The exports that change the game's memory from outside its ticks (shell.js, controls.js,
// gamepad.js), with their arguments: n a number, s a string.
const JOURNALED = {
  gta2_port_key: 'nnnn',
  gta2_port_release_all_keys: '',
  gta2_port_mouse_move: 'nn',
  gta2_port_mouse_button: 'nn',
  gta2_port_set_view_width: 'n',
  gta2_port_set_paused: 'n',
  gta2_port_set_interpolation: 'n',
  gta2_port_set_hud_edges: 'n',
  gta2_port_set_hud_arrows: 'n',
  gta2_port_set_camera: 'nn',
  gta2_port_set_activation_margin: 'n',
  gta2_port_set_language: 's',
  gta2_port_reg_set_dword: 'ssn',
  gta2_port_reg_set_string: 'sss',
  gta2_port_reload_controls: '',
};

const decoder = new TextDecoder();
const cString = (M, ptr) => {
  const heap = M.HEAPU8;
  let end = ptr;
  while (heap[end]) end++;
  return decoder.decode(heap.subarray(ptr, end));
};

/**
 * Wraps the journaled exports (call before anything takes them: cwrap holds a number-only export
 * itself). Returns the journal: while `on`, every call is recorded, to be done again after a
 * restore (replay).
 */
export function installJournal(M) {
  const journal = {
    on: false,
    calls: [],
    replaying: false,
    replay() {
      const calls = this.calls;
      this.calls = [];
      this.replaying = true;
      try {
        for (const [name, sig, args] of calls) {
          M.ccall(name, null, [...sig].map((c) => (c === 's' ? 'string' : 'number')), args);
        }
      } finally {
        this.replaying = false;
      }
    },
  };
  for (const [name, sig] of Object.entries(JOURNALED)) {
    const raw = M[`_${name}`];
    if (typeof raw !== 'function') continue;
    M[`_${name}`] = (...args) => {
      if (journal.on && !journal.replaying) {
        journal.calls.push([name, sig, [...sig].map((c, i) => (c === 's' ? cString(M, args[i]) : args[i]))]);
      }
      return raw(...args);
    };
  }
  return journal;
}

export class Rollback {
  /**
   * @param {object} M the game module
   * @param {object} journal from installJournal
   * @param {object} opts
   * @param {number} opts.players how many slots
   * @param {number} opts.mySlot this player's slot
   * @param {(bytes: Uint8Array) => void} opts.send an input message to the clock
   */
  constructor(M, journal, { players, mySlot, send }) {
    this.M = M;
    this.journal = journal;
    this.players = players;
    this.mySlot = mySlot;
    this.send = send;
    this.state = M.cwrap('gta2_port_rb_state', 'number', []);
    this.tickFn = M.cwrap('gta2_port_rb_tick', 'number', ['number', 'number', 'number']);
    this.sampleFn = M.cwrap('gta2_port_rb_sample', 'number', []);
    this.dueFn = M.cwrap('gta2_port_rb_due', null, ['number']);
    this.started = false;
    this.ended = false;
    this.confirmed = 0;  // ticks in the snapshot (the clock's)
    this.played = 0;     // ticks in the game's memory (confirmed + predicted)
    this.pending = [];   // the clock's bundles not yet played, in tick order from `confirmed`
    this.own = new Map(); // tick -> this player's inputs sent for it
    this.held = new Array(players).fill(0); // per slot: held controls as last confirmed
    this.gone = new Set(); // slots the clock has dropped
    this.seq = 0;
    this.snap = null;
    this.nextDue = 0;
    this.lastFrame = 0;
    this.sent = 0;        // ticks this player's inputs went out for
    this.ignoreUntil = 0;
    this.shift = 0;       // ms still to move the ticks by (negative: earlier)
    this.margins = [];    // ms, this player's recent margins at the clock
    this.decideAt = 0;
    this.stats = { steps: 0, replays: 0, ownWrong: 0, othersWrong: 0, late: 0, ahead: 0, stepMs: 0, maxStepMs: 0, margin: null };
  }

  /** A bundle from the clock (in tick order; lobby.bundle sees to that). */
  receive(bytes) {
    if (this.ended) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = bytes[5];
    for (let i = 0; i < n; i++) {
      if (bytes[6 + i * 6] !== this.mySlot || bytes.length < 6 + n * 8) continue;
      const m = view.getInt16(6 + n * 6 + i * 2, true);
      if (m !== NO_MARGIN) {
        const now = performance.now();
        // inputs sent before steer()'s last move are still on their way for a round trip
        if (now >= this.ignoreUntil) this.margins.push({ at: now, m });
        this.stats.margin = m;
        if (m < 0) this.stats.late++;
      }
    }
    this.pending.push(bytes.slice());
  }

  /** Called before each slice of the core's loop (main_web.cpp): plays the ticks that are due. */
  frame() {
    if (this.ended) return;
    const M = this.M;
    const s = this.state() >> 2;
    if (!M.HEAP32[s]) {
      if (M.HEAP32[s + 1]) this.end(); // the match ends: the core's loop plays the rest
      return; // not yet in the match
    }
    const now = performance.now();
    if (!this.started) this.start(now);
    this.steer(now);
    let due = 0;
    // a frozen page: no burst of the ticks it missed (the clock's bundles bring it up to date, and
    // steer() then puts it ahead again); a jump of steer()'s is caught up a few ticks per frame
    if (now - this.lastFrame > FROZEN_MS) this.nextDue = Math.max(this.nextDue, now);
    this.lastFrame = now;
    while (now >= this.nextDue && due < MAX_BURST) {
      due++;
      const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, this.shift));
      this.shift -= nudge;
      this.nextDue += TICK_MS + nudge;
    }
    const known = this.confirmed + this.pending.length; // ticks the clock has sent
    // this player's inputs go out on time even while the game cannot play further ahead (the clock's
    // bundles are held up): the clock must have them before their ticks go out
    if (this.sent < known) this.sent = known; // ticks the clock made up an input for already
    // until the clock runs (it starts once every game has sent its first input) only tick 0: then
    // steer() moves ahead quickly, which is better than moving back slowly from far ahead
    const sendTo = known ? Math.min(this.sent + due, known + 3 * MAX_AHEAD) : Math.min(this.sent + due, 1);
    const target = Math.max(Math.min(sendTo, known + MAX_AHEAD), known);
    if (sendTo <= this.sent && target <= this.played) {
      this.stats.ahead = this.played - known;
      return; // nothing new is due (bundles that came in wait for the next tick, at most 33 ms)
    }
    this.step(target, sendTo, now);
    this.stats.ahead = this.played - this.confirmed;
    const ms = performance.now() - now;
    this.stats.steps++;
    this.stats.stepMs += (ms - this.stats.stepMs) / 30;
    this.stats.maxStepMs = Math.max(this.stats.maxStepMs, ms);
  }

  start(now) {
    this.started = true;
    // map.js notices a new district by what this export keeps in the game's memory; settled before
    // the first snapshot, going back to it does not look like a new district every time
    this.M.ccall('gta2_port_map_state', 'number', [], []);
    this.save();
    this.journal.calls = [];
    this.journal.on = true;
    this.nextDue = now;
    this.lastFrame = now;
    this.decideAt = now;
  }

  end() {
    this.ended = true;
    this.journal.on = false;
    this.journal.calls = [];
    this.snap = null;
    this.pending = [];
  }

  /** Takes this player's inputs up to `sendTo` and plays from the last confirmed tick up to `target`. */
  step(target, sendTo, now) {
    const M = this.M;
    const predicted = this.played; // ticks played before on a guess
    if (this.played > this.confirmed) {
      this.restore();
      this.journal.replay();
      this.stats.replays++;
    } else {
      this.journal.calls = []; // already in memory, and in the snapshot taken below
    }
    // the draws from here on are interpolated towards the next tick (also the one shown below)
    this.dueFn(Math.max(0, this.nextDue - now));
    // this player's inputs for the new ticks (the clock has not sent them yet): taken now, sent stamped
    for (let t = this.sent; t < sendTo; t++) {
      const bits = this.sampleFn() >>> 0;
      this.own.set(t, bits);
      const msg = new Uint8Array(10);
      const v = new DataView(msg.buffer);
      msg[0] = STAMPED;
      msg[1] = this.seq++ & 0xff;
      v.setUint32(2, bits, true);
      v.setUint32(6, t, true);
      this.send(msg);
    }
    this.sent = Math.max(this.sent, sendTo);
    // the clock's ticks (a long run of them over several frames, the page stays responsive)
    const confirmedNow = Math.min(this.pending.length, MAX_CATCHUP);
    const caughtUp = confirmedNow === this.pending.length;
    const shown = caughtUp ? target - 1 : this.confirmed + confirmedNow - 1;
    for (let i = 0; i < confirmedNow; i++) {
      const bytes = this.pending[i];
      const r = this.play(bytes, true, this.confirmed === shown);
      if (r < 0) {
        // never seen: the game was not waiting for a bundle, so it and the clock disagree from here
        // on, and the sync check will say so
        console.error(`co-op prediction: confirmed tick ${this.confirmed} could not be played`);
        this.stats.failed = (this.stats.failed || 0) + 1;
      }
      this.learn(bytes, this.confirmed < predicted);
      this.confirmed++;
      if (r === 1 || M.HEAP32[(this.state() >> 2) + 1]) {
        this.played = this.confirmed;
        this.end();
        return;
      }
    }
    this.pending.splice(0, confirmedNow);
    for (const t of this.own.keys()) if (t < this.confirmed) this.own.delete(t);
    if (this.onConfirmed) this.onConfirmed(); // the game's memory holds the confirmed state now
    this.save();
    if (!caughtUp) {
      this.played = this.confirmed;
      return;
    }
    // and the predicted ones
    let t = this.confirmed;
    for (; t < target; t++) {
      const r = this.play(this.predict(t), false, t === shown);
      if (r < 0) break;
      if (r === 1) { t++; break; }
    }
    this.played = t;
  }

  /** One tick: the bundle goes to the core, which plays it. */
  play(bytes, confirmed, show) {
    const M = this.M;
    const s = this.state() >> 2;
    const buf = M.HEAP32[s + 3];
    if (bytes.length > M.HEAP32[s + 4]) return -1;
    M.HEAPU8.set(bytes, buf);
    return this.tickFn(bytes.length, confirmed ? 1 : 0, show ? 1 : 0);
  }

  /**
   * What a confirmed bundle tells: the others' held controls and who left; for a tick played on a
   * guess before, whether the guess was right (statistics only: the replay puts it right anyway).
   */
  learn(bytes, guessed) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tick = view.getUint32(1, true);
    for (let i = 0; i < bytes[5]; i++) {
      const slot = bytes[6 + i * 6];
      if (slot >= this.players) continue;
      if (bytes[7 + i * 6] === 1) {
        this.gone.add(slot);
        continue;
      }
      const bits = view.getUint32(8 + i * 6, true);
      if (guessed && slot === this.mySlot) {
        if (bits !== this.own.get(tick)) {
          this.stats.ownWrong++;
          (this.wrong = this.wrong || []).push([tick, this.own.get(tick), bits, this.stats.margin]);
          if (this.wrong.length > 60) this.wrong.shift();
        }
      } else if (guessed && bits !== this.held[slot]) {
        this.stats.othersWrong++;
      }
      this.held[slot] = bits & HELD;
    }
  }

  /** The bundle this page guesses the clock will send for tick t. */
  predict(t) {
    const slots = [];
    for (let slot = 0; slot < this.players; slot++) if (!this.gone.has(slot)) slots.push(slot);
    const out = new Uint8Array(6 + slots.length * 6);
    const view = new DataView(out.buffer);
    out[0] = BUNDLE;
    view.setUint32(1, t, true);
    out[5] = slots.length;
    slots.forEach((slot, i) => {
      out[6 + i * 6] = slot;
      out[7 + i * 6] = 0;
      view.setUint32(8 + i * 6, slot === this.mySlot ? (this.own.get(t) ?? this.held[slot]) : this.held[slot], true);
    });
    return out;
  }

  /**
   * Keeps this player's inputs reaching the clock a little early. From the margins the clock
   * reported over the last few seconds: when more than a few came too late, the ticks move earlier
   * (all at once when most did: the start, a frozen page, a slower route; a step at a time when
   * only some did: jitter, a spike); when nearly all came needlessly early, later, a step at a time.
   * The margins still to come from before a move are ignored, the ones in hand count as moved.
   */
  steer(now) {
    if (now < this.decideAt) return;
    this.margins = this.margins.filter((x) => now - x.at < WINDOW_MS);
    // most inputs late (the match's start, which is late by design, a frozen page): as soon as a
    // few margins are in; anything finer once there are enough that a spike (a burst of late
    // inputs shows as one or two margins) is no trend
    if (this.margins.length < 8) return;
    const sorted = this.margins.map((x) => x.m).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    if (median >= TARGET_MARGIN && sorted.length < 60) return;
    this.decideAt = now + STEER_EVERY;
    const low = sorted[Math.floor(sorted.length * 0.05)];
    const err = low - TARGET_MARGIN;
    let move = 0;
    if (median < TARGET_MARGIN) move = Math.min(err, median - TARGET_MARGIN);
    else if (err < 0) move = Math.max(err, -STEP_EARLIER);
    else if (err > SLACK) move = Math.min(err - SLACK / 2, STEP_LATER);
    if (!move) return;
    this.trace = this.trace || [];
    this.trace.push([Math.round(now), low, median, Math.round(move), this.played - this.confirmed, this.margins.length]);
    if (this.trace.length > 40) this.trace.shift();
    if (move < -JUMP_MS) {
      this.nextDue += move; // made up a few ticks per frame
      this.margins = []; // from before (the start, a frozen page): no guide to what comes now
    } else {
      this.shift += move;
      for (const x of this.margins) x.m -= move;
    }
    this.ignoreUntil = now + (this.played - this.confirmed) * TICK_MS + 150;
  }

  /** The snapshot's ranges: [0, stack low) and [stack high, heap end). */
  ranges() {
    const M = this.M;
    const s = this.state() >> 2;
    return { lo: M.HEAP32[s + 5] >>> 0, hi: M.HEAP32[s + 6] >>> 0, end: M.HEAP32[s + 7] >>> 0 };
  }

  save() {
    const { lo, hi, end } = this.ranges();
    const size = lo + (end - hi);
    if (!this.snap || this.snap.length < size) this.snap = new Uint8Array(size + (8 << 20));
    const heap = this.M.HEAPU8;
    this.snap.set(heap.subarray(0, lo), 0);
    this.snap.set(heap.subarray(hi, end), lo);
    this.saved = { lo, hi, end };
  }

  restore() {
    const { lo, hi, end } = this.saved;
    const now = this.ranges(); // before the copy: the heap may have grown since the snapshot
    if (now.lo !== lo || now.hi !== hi) throw new Error('co-op prediction: the stack moved');
    const heap = this.M.HEAPU8;
    heap.set(this.snap.subarray(0, lo), 0);
    heap.set(this.snap.subarray(lo, lo + (end - hi)), hi);
    if (now.end > end) heap.fill(0, end, now.end); // above the heap's end: unused, as the allocator expects
  }
}
