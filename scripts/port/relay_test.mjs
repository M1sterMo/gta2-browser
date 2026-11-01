// Bad messages must not take the game server down: node --test scripts/port/relay_test.mjs
// (needs `npm ci` in server/). Starts the real server on a free port, on this computer only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../../server/server.mjs', import.meta.url));
const WebSocket = createRequire(server)('ws');
const PORT = 18790 + (process.pid % 1000);
const url = `ws://127.0.0.1:${PORT}/relay`;
const data = mkdtempSync(join(tmpdir(), 'gta2-relay-'));
let child;
let exited = false;

const open = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.on('error', () => {}); // the bad-frame tests close with an error on this side too
  ws.once('open', () => resolve(ws));
  ws.once('close', () => reject(new Error('closed before opening')));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two players in a room can still talk: the relay is alive and working. */
async function relayWorks(room) {
  const [a, b] = [await open(), await open()];
  const heard = new Promise((resolve) => b.on('message', (m) => {
    const msg = JSON.parse(m.toString());
    if (msg.t === 'msg') resolve(msg);
  }));
  a.send(JSON.stringify({ t: 'join', room, id: 'a' }));
  b.send(JSON.stringify({ t: 'join', room, id: 'b' }));
  await sleep(100);
  a.send(JSON.stringify({ t: 'msg', to: 'b', data: 'hello' }));
  const msg = await Promise.race([heard, sleep(2000).then(() => null)]);
  a.close();
  b.close();
  assert.equal(msg && msg.data, 'hello');
}

before(async () => {
  child = spawn(process.execPath, [server], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), GTA2_PASSWORD: '', DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.on('exit', () => { exited = true; });
  await new Promise((resolve) => child.stdout.once('data', resolve));
});

after(() => {
  child.kill();
  rmSync(data, { recursive: true, force: true });
});

for (const [name, send] of [
  ['the JSON message null', (ws) => ws.send('null')],
  ['JSON that is not an object', (ws) => { ws.send('5'); ws.send('"x"'); ws.send('[]'); ws.send('true'); }],
  ['text that is not JSON', (ws) => ws.send('{')],
  ['binary before joining a room', (ws) => ws.send(Buffer.from([1, 2, 3]))],
  ['a frame over the size limit', (ws) => ws.send(Buffer.alloc(65 * 1024))],
  ['a frame the protocol forbids', (ws) => ws._socket.write(Buffer.from([0xff, 0x00]))],
]) {
  test(`${name} leaves the server running`, async () => {
    const ws = await open();
    send(ws);
    await sleep(200);
    ws.terminate();
    assert.equal(exited, false, 'the server process exited');
    await relayWorks(`room-${Math.random()}`);
  });
}
