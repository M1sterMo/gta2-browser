// Co-op end to end: a local game server (server/server.mjs) and 2-3 players in Chromium, each with
// its own browser profile (like separate computers), walking, turning and shooting at random. Any
// player can get a bad connection, a slow screen, a frozen page or a dropped connection. Checks:
// no game drifts apart (the sync checksums), and nobody else waits for an impaired player.
//
//   node scripts/port/coop_test.mjs [--players 3] [--seconds 60] [--port 8791] [--noclock]
//     [--netsim 2=120,80,400,6]   player 2's connection: ms,jitter,spike,spikes per minute
//     [--fps 1=30]                player 1's screen runs at 30 frames a second
//     [--freeze 2=20,3000]        player 2's page freezes at 20 s for 3000 ms
//     [--drop 1=30]               player 1's connection to the server drops at 30 s
//     [--ff]                      friendly fire (players can hurt each other)
//     [--leave-early 2]           player 2 closes the tab as the match starts (while it loads)
//     [--profiles DIR]            browser profiles (kept, so the game files download once)
//
// Needs Playwright (npm i -g playwright) and the game files in game/. Exit code 1 on a failed check.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(join(execSync('npm root -g').toString().trim(), '/'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const perPlayer = (name) => {
  const out = {};
  args.forEach((a, i) => { if (a === `--${name}`) { const [p, v] = args[i + 1].split('='); out[Number(p)] = v; } });
  return out;
};
const PLAYERS = Number(opt('players', 3));
const SECONDS = Number(opt('seconds', 60));
const PORT = Number(opt('port', 8791));
const PROFILES = resolve(opt('profiles', join(REPO, 'build/coop-test-profiles')));
const NETSIM = perPlayer('netsim');
const FPS = perPlayer('fps');
const FREEZE = perPlayer('freeze');
const DROP = perPlayer('drop');
const NOCLOCK = args.includes('--noclock');
const FF = args.includes('--ff');
const LEAVE_EARLY = opt('leave-early', null) === null ? -1 : Number(opt('leave-early'));

const server = spawn(process.execPath, [join(REPO, 'server/server.mjs')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', GTA2_PASSWORD: '', DATA_DIR: join(PROFILES, 'server-data') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok) => server.stdout.on('data', (d) => { if (String(d).includes('server:')) ok(); }));
const base = `http://127.0.0.1:${PORT}/`;

const failures = [];
const log = (...a) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = performance.now();

// a screen at `fps` frames a second: requestAnimationFrame skips frames (cancel still works)
const throttleFrames = (fps) => {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const live = new Map();
  let next = 1;
  let last = 0;
  window.requestAnimationFrame = (cb) => {
    const id = next++;
    // every callback of a frame that is drawn runs (the game, the map and the radar each ask)
    const step = (t) => {
      if (t !== last && t - last < 1000 / fps - 2) { live.set(id, raf(step)); return; }
      last = t;
      live.delete(id);
      cb(t);
    };
    live.set(id, raf(step));
    return id;
  };
  window.cancelAnimationFrame = (id) => { if (live.has(id)) { caf(live.get(id)); live.delete(id); } };
};

const players = [];
for (let i = 0; i < PLAYERS; i++) {
  const dir = join(PROFILES, `player${i}`);
  mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: { width: 960, height: 600 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  if (FPS[i]) await page.addInitScript(throttleFrames, Number(FPS[i]));
  const p = { i, ctx, page, desync: [], name: `P${i}` };
  page.on('console', (m) => {
    const text = m.text();
    if (/drifted apart/.test(text)) { p.desync.push(text); log(p.name, text); }
  });
  page.on('pageerror', (e) => { log(p.name, 'pageerror', e.message); failures.push(`${p.name} page error: ${e.message}`); });
  const params = new URLSearchParams({ coop: '' });
  if (NETSIM[i]) params.set('netsim', NETSIM[i]);
  if (NOCLOCK && i === 0) params.set('clock', '0');
  await page.goto(`${base}?${params.toString().replace('coop=', 'coop')}`);
  players.push(p);
}

// lobby: player 0 hosts, the others join; free roam in Downtown
const [host, ...guests] = players;
await host.page.fill('#coop-name', host.name);
await host.page.click('#coop-host');
await host.page.waitForFunction(() => window.gta2Lobby && window.gta2Lobby.code);
const code = await host.page.evaluate(() => window.gta2Lobby.code);
for (const g of guests) {
  await g.page.fill('#coop-name', g.name);
  await g.page.fill('#coop-code', code);
  await g.page.click('#coop-join');
}
await host.page.waitForFunction((n) => window.gta2Lobby.players.length === n, PLAYERS, { timeout: 60000 });
await host.page.waitForFunction(() => !document.getElementById('coop-start').disabled, null, { timeout: 60000 });
if (FF) await host.page.check('#coop-ff');
await host.page.click('#coop-start');
log(`room ${code}: ${PLAYERS} players, ${NOCLOCK ? 'old lockstep' : 'match clock'}${FF ? ', friendly fire' : ''}; started`);
if (LEAVE_EARLY >= 0) {
  await new Promise((ok) => setTimeout(ok, 300));
  await players[LEAVE_EARLY].ctx.close();
  log(`P${LEAVE_EARLY} closed the tab while the match loaded`);
  players.splice(LEAVE_EARLY, 1);
}
await Promise.all(players.map((p) => p.page.waitForFunction(
  () => window.gta2 && window.gta2.map && window.gta2.map.last && window.gta2.map.last.hasPlayer, null, { timeout: 600000 })));
log('everyone is playing');
// count the sync checksums each game gets from the others (the drift check must really run)
for (const p of players) {
  await p.page.evaluate(() => {
    const l = window.gta2Lobby;
    const f = l.onSync;
    window.syncsSeen = 0;
    l.onSync = (...a) => { window.syncsSeen++; f(...a); };
  });
}
const where = (p) => p.page.evaluate(() => ({ x: window.gta2.map.last.x, y: window.gta2.map.last.y })).catch(() => null);
const startPos = {};
for (const p of players) startPos[p.i] = await where(p);

// each player walks, turns and shoots at random (synthetic key events, as the keyboard sends)
for (const p of players) {
  await p.page.evaluate(() => {
    const keys = ['KeyW', 'KeyW', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyL', 'Space'];
    const press = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    const step = () => {
      const held = [...new Set(Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => keys[Math.floor(Math.random() * keys.length)]))];
      held.forEach((k) => press(k, true));
      setTimeout(() => { held.forEach((k) => press(k, false)); setTimeout(step, 50 + Math.random() * 300); }, 150 + Math.random() * 900);
    };
    step();
  });
}

const sample = (p) => p.page.evaluate(() => {
  const M = window.gta2.Module;
  const d = M.ccall('gta2_port_net_debug', 'number', [], []);
  const c = M._gta2_port_net_clock_state ? M.ccall('gta2_port_net_clock_state', 'number', [], []) : 0;
  const v = M.HEAP32.subarray(d >> 2, (d >> 2) + 10);
  const w = c ? M.HEAP32.subarray(c >> 2, (c >> 2) + 3) : [0, 0, 0];
  const b = document.getElementById('coop-banner');
  const at = window.gta2.map.last || {};
  return { frame: v[4], pending: v[3], buffered: w[0], target: w[1], waits: w[2], banner: b && !b.hidden ? b.textContent : '', x: at.x, y: at.y };
}).catch(() => null);

// the run, with the scheduled troubles
const startAt = performance.now();
const history = Array.from({ length: PLAYERS }, () => []);
const events = [];
for (const [i, v] of Object.entries(FREEZE)) {
  const [at, ms] = v.split(',').map(Number);
  events.push({ at, run: () => { log(`P${i} freezes for ${ms} ms`); players.find((p) => p.i === Number(i))?.page.evaluate((ms) => { const end = performance.now() + ms; while (performance.now() < end); }, ms).catch(() => {}); } });
}
for (const [i, at] of Object.entries(DROP)) {
  events.push({ at: Number(at), run: () => { log(`P${i}'s connection drops`); players.find((p) => p.i === Number(i))?.page.evaluate(() => window.gta2Lobby.t.ws.close()).catch(() => {}); } });
}
while ((performance.now() - startAt) / 1000 < SECONDS) {
  const s = (performance.now() - startAt) / 1000;
  for (const e of events.filter((x) => !x.done && s >= x.at)) { e.done = true; e.run(); }
  const got = await Promise.all(players.map(sample));
  got.forEach((g, k) => { if (g) history[players[k].i].push({ s, ...g }); });
  if (Math.round(s) % 10 === 0) log(got.map((g, k) => (g ? `P${players[k].i} tick ${g.frame} buf ${g.buffered}/${g.target} waits ${g.waits}${g.banner ? ` "${g.banner.slice(0, 40)}"` : ''}` : `P${players[k].i} -`)).join(' | '));
  await new Promise((ok) => setTimeout(ok, 1000));
}

// checks
const impaired = new Set([...Object.keys(FREEZE), ...Object.keys(DROP), ...Object.keys(NETSIM), ...Object.keys(FPS)].map(Number));
for (const p of players) {
  if (p.desync.length) failures.push(`${p.name}: games drifted apart (${p.desync[0]})`);
  const h = history[p.i];
  if (h.length < 2) { failures.push(`${p.name}: no samples`); continue; }
  const rate = (h[h.length - 1].frame - h[0].frame) / (h[h.length - 1].s - h[0].s);
  // the longest time the tick count stood still
  let still = 0;
  let since = h[0];
  for (const x of h) { if (x.frame !== since.frame) since = x; still = Math.max(still, x.s - since.s); }
  log(`${p.name}${impaired.has(p.i) ? ' (impaired)' : ''}: ${rate.toFixed(1)} ticks/s, longest stand-still ~${still.toFixed(0)} s, waits ${h[h.length - 1].waits}`);
  if (!impaired.has(p.i) && !NOCLOCK && rate < 27) failures.push(`${p.name}: only ${rate.toFixed(1)} ticks a second`);
  if (!impaired.has(p.i) && !NOCLOCK && still >= 2) failures.push(`${p.name}: stood still for ${still.toFixed(0)} s`);
}
for (const p of players) {
  const syncs = await p.page.evaluate(() => window.syncsSeen).catch(() => 0);
  // the farthest the player got from where they started (a walk can end where it began)
  const a = startPos[p.i];
  const moved = a ? Math.max(0, ...history[p.i].filter((x) => Number.isFinite(x.x)).map((x) => Math.hypot(x.x - a.x, x.y - a.y))) : 0;
  log(`${p.name}: ${syncs} checksums compared, moved ${moved.toFixed(1)} blocks`);
  if (!syncs) failures.push(`${p.name}: no checksums compared (the drift check did not run)`);
  if (moved < 1) failures.push(`${p.name}: did not move (no inputs?)`);
}
const ticks = await Promise.all(players.map(sample));
log('final ticks', ticks.map((g) => g && g.frame).join(', '));

for (const p of players) await p.ctx.close();
server.kill();
if (failures.length) {
  console.log(`FAILED\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK');
