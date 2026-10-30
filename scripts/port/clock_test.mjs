// Unit tests for web/clock.js (the co-op match clock): node --test scripts/port/clock_test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_TICKS, LEAVE_AFTER_MS, MAX_QUEUE, MatchClock, START_WAIT_MS, TICK_MS, TRIM_AFTER, readBundle } from '../../web/clock.js';

const FORWARD = 0x1;
const ATTACK = 0x10;
const ESC_PRESS = (0x01 << 12) | 0x200000; // a key event: DirectInput Escape, pressed

const inputMsg = (bits, seq = 0) => {
  const b = new Uint8Array(6);
  b[0] = 3;
  b[1] = seq;
  new DataView(b.buffer).setUint32(2, bits >>> 0, true);
  return b;
};

function harness(players = 2) {
  let now = 1000;
  const sent = [];
  const clock = new MatchClock({ players, send: (bytes) => sent.push(readBundle(bytes)), now: () => now });
  const advance = (ticks) => { now += ticks * TICK_MS + 0.01; clock.poll(); };
  return { clock, sent, advance, setNow: (t) => { now = t; }, getNow: () => now };
}

const bitsOf = (bundle, slot) => bundle.entries.find((e) => e.slot === slot);

test('starts once every game has sent its first input, then one bundle per tick', () => {
  const { clock, sent, advance } = harness(2);
  clock.input(0, inputMsg(0));
  advance(5);
  assert.equal(sent.length, 0, 'waits for player 1');
  clock.input(1, inputMsg(0));
  clock.poll();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].tick, 0);
  advance(3);
  assert.deepEqual(sent.map((b) => b.tick), [0, 1, 2, 3]);
  assert.deepEqual(sent[0].entries.map((e) => e.slot), [0, 1]);
});

test('starts at once when the only player still missing has left', () => {
  const { clock, sent } = harness(3);
  clock.input(0, inputMsg(0));
  clock.input(1, inputMsg(0));
  clock.leave(2);
  clock.poll();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].entries.find((e) => e.slot === 2), { slot: 2, left: true, bits: 0 });
});

test('starts without a game that never sends, after the start wait', () => {
  const { clock, sent, setNow } = harness(2);
  clock.input(0, inputMsg(0));
  setNow(1000 + START_WAIT_MS + 1);
  clock.poll();
  assert.equal(sent.length, 1);
});

test('inputs are used in order, one per tick; a late one waits for the next tick', () => {
  const { clock, sent, advance } = harness(2);
  clock.input(0, inputMsg(FORWARD));
  clock.input(1, inputMsg(0));
  clock.poll();
  assert.equal(bitsOf(sent[0], 0).bits, FORWARD);
  clock.input(1, inputMsg(0));
  advance(1); // player 0's input for this tick is late
  assert.equal(bitsOf(sent[1], 0).bits, FORWARD, 'made up: the held controls go on');
  clock.input(0, inputMsg(ATTACK));
  clock.input(1, inputMsg(0));
  advance(1);
  assert.equal(bitsOf(sent[2], 0).bits, ATTACK, 'the late input, one tick later');
});

test('a made-up input holds the controls for at most 100 ms and never a key event', () => {
  const { clock, sent, advance } = harness(1);
  clock.input(0, inputMsg(FORWARD | ESC_PRESS));
  clock.poll();
  assert.equal(sent[0].entries[0].bits, FORWARD | ESC_PRESS);
  advance(HOLD_TICKS + 2);
  const madeUp = sent.slice(1).map((b) => b.entries[0].bits);
  assert.deepEqual(madeUp, [...Array(HOLD_TICKS).fill(FORWARD), 0, 0]);
});

test('a long queue is trimmed: the oldest merges into the next, a short tap still counts', () => {
  const { clock, sent, advance } = harness(1);
  clock.input(0, inputMsg(0));
  clock.poll();
  // a burst after a stall: more than MAX_QUEUE at once, the second with a 1-tick tap of attack
  clock.input(0, inputMsg(FORWARD));
  clock.input(0, inputMsg(ATTACK));
  for (let i = 0; i < MAX_QUEUE; i++) clock.input(0, inputMsg(FORWARD));
  advance(1);
  assert.equal(sent[1].entries[0].bits, FORWARD, 'the oldest is used first');
  assert.equal(clock.stats()[0].queued, MAX_QUEUE, 'the next oldest merged away');
  advance(1);
  assert.equal(sent[2].entries[0].bits, FORWARD | ATTACK, 'the tap still counts');
});

test('a queue that stays two deep for TRIM_AFTER ticks loses one input of lag', () => {
  const { clock, advance } = harness(1);
  clock.input(0, inputMsg(0));
  clock.input(0, inputMsg(0));
  clock.input(0, inputMsg(0));
  clock.poll();
  for (let i = 0; i < TRIM_AFTER + 1; i++) { clock.input(0, inputMsg(0)); advance(1); }
  assert.equal(clock.stats()[0].queued, 1);
});

test('two key events are never merged into one input', () => {
  const { clock, advance } = harness(1);
  clock.input(0, inputMsg(0));
  clock.poll();
  for (let i = 0; i < MAX_QUEUE + 2; i++) clock.input(0, inputMsg(ESC_PRESS));
  advance(1);
  // one used; the rest are all key events, none merged: the queue stays over the limit
  assert.equal(clock.stats()[0].queued, MAX_QUEUE + 1);
});

test('a player who leaves is dropped at the next tick, in every bundle after that absent', () => {
  const { clock, sent, advance } = harness(2);
  clock.input(0, inputMsg(0));
  clock.input(1, inputMsg(0));
  clock.poll();
  clock.leave(1);
  advance(2);
  assert.deepEqual(sent[1].entries.find((e) => e.slot === 1), { slot: 1, left: true, bits: 0 });
  assert.equal(sent[2].entries.find((e) => e.slot === 1), undefined);
});

test('a silent player is dropped after LEAVE_AFTER_MS; the clock is done when everyone is', () => {
  const { clock, sent, advance } = harness(2);
  clock.input(0, inputMsg(0));
  clock.input(1, inputMsg(0));
  clock.poll();
  const ticks = Math.ceil(LEAVE_AFTER_MS / TICK_MS) + 2;
  for (let i = 0; i < ticks; i++) { clock.input(0, inputMsg(0)); advance(1); }
  assert.ok(sent.some((b) => b.entries.some((e) => e.slot === 1 && e.left)));
  assert.ok(!sent.some((b) => b.entries.some((e) => e.slot === 0 && e.left)));
  assert.equal(clock.done, false);
  clock.leave(0);
  advance(1);
  assert.equal(clock.done, true);
});

test('a game that missed bundles gets them again, in order', () => {
  const { clock, advance } = harness(1);
  clock.input(0, inputMsg(0));
  clock.poll();
  advance(5);
  const again = clock.since(2).map((b) => readBundle(b).tick);
  assert.deepEqual(again, [2, 3, 4, 5]);
  assert.deepEqual(clock.since(6), []);
});

test('falls behind (a blocked event loop) and catches up with every tick, none skipped', () => {
  const { clock, sent, advance } = harness(1);
  clock.input(0, inputMsg(0));
  clock.poll();
  advance(30);
  assert.deepEqual(sent.map((b) => b.tick), Array.from({ length: 31 }, (_, i) => i));
});
