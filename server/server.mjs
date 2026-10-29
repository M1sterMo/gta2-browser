// GTA2 browser port: the private game server (D21).
//
// One process serves, behind a password:
//   /                 the built game (build/port/release)
//   /gamedata/...     the GTA2 game files, so a new player installs with one click
//   /config.json      tells the page it is on this server
//   /api/crews        saved Gang Wars crews: the leaderboard (GET)
//   /api/match        a finished Gang Wars match, for the crews' stats and reputation (POST)
//   /relay            WebSocket: co-op rooms; every message goes through the server
//                     (a star), so players connect on any network. Rooms live here
//                     and nowhere else: the pages may only connect to this server
//                     (Content-Security-Policy connect-src), never to public trackers.
// HTTPS comes from a reverse proxy in front (Caddy on the VPS, see README.md).
//
// Environment:
//   PORT (8790), HOST (127.0.0.1), WEB_ROOT, GAME_ROOT (default: the repo's
//   build/port/release and game/), GTA2_PASSWORD (no password when unset: only
//   for this computer), PUBLIC_URL (for the printed invite link), DATA_DIR (saved
//   crews; writable; default build/server-data).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CrewStore } from './crews.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || '127.0.0.1';
const WEB_ROOT = resolve(process.env.WEB_ROOT || join(REPO, 'build/port/release'));
const GAME_ROOT = resolve(process.env.GAME_ROOT || join(REPO, 'game'));
const PASSWORD = process.env.GTA2_PASSWORD || '';
const DATA_DIR = resolve(process.env.DATA_DIR || join(REPO, 'build/server-data')); // saved crews (writable)
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');
// The browser refuses any connection but to this server ('self' and its WebSocket address, spelled
// out for older Safari; data:/blob: for imported saves): co-op can't reach public trackers, even from
// an archived version whose own config.json says "static".
const CSP = `connect-src 'self' ${PUBLIC_URL.replace(/^http/, 'ws')} data: blob:`;

if (!PASSWORD && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  console.error('server: set GTA2_PASSWORD to listen on anything but this computer');
  process.exit(1);
}

// ---- password: a signed cookie, from the login page or an invite link ----

// Derived from the password, so logins survive restarts and end when the password changes.
const SECRET = createHash('sha256').update(`gta2-browser-port:${PASSWORD}`).digest();
const sign = (what) => createHmac('sha256', SECRET).update(what).digest('base64url');
const SESSION = sign('session');
const INVITE = sign('invite').slice(0, 22);
const COOKIE = 'gta2_session';

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';')
  .map((c) => c.trim().split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
const loggedIn = (req) => !PASSWORD || same(cookies(req)[COOKIE] || '', SESSION);
const sessionCookie = () => `${COOKIE}=${SESSION}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` +
  (PUBLIC_URL.startsWith('https:') ? '; Secure' : '');

const LOGIN_PAGE = (failed, badInvite = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>GTA2</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e12;color:#eee;font:16px system-ui,sans-serif}
form{display:flex;flex-direction:column;gap:.8rem;width:min(320px,90vw)}input,button{font:inherit;padding:.6rem .8rem;border-radius:6px;border:1px solid #444;background:#16161a;color:#eee}
button{background:#d8452e;border-color:#d8452e;font-weight:600;cursor:pointer}p{margin:0;color:${failed ? '#ff8a7a' : '#999'}}</style></head>
<body><form method="post" action="/login"><h1 style="margin:0">GTA2</h1>
<p>${failed ? 'Wrong password, try again.' : badInvite ? 'That invite link is incomplete or old. Ask for a fresh one, or enter the password.' : 'Enter the password your friend gave you.'}</p>
<input type="password" name="password" autofocus autocomplete="current-password" aria-label="Password">
<button>Play</button></form></body></html>`;

// ---- static files ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/** Resolves a URL path inside root, or null when it would leave it. */
function inside(root, urlPath) {
  const path = resolve(root, `.${decodeURIComponent(urlPath)}`);
  return path === root || path.startsWith(root + sep) ? path : null;
}

async function sendFile(res, path, { type, cache = 'no-cache' } = {}) {
  let info;
  try { info = await stat(path); } catch { info = null; }
  if (!info || !info.isFile()) return notFound(res);
  res.writeHead(200, {
    'Content-Type': type || TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size, 'Cache-Control': cache,
  });
  createReadStream(path).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// ---- the game files: everything the port reads (no executables, DLLs or movies) ----

const SKIP = /\.(exe|dll|m3d|ico|bik|isu)$/i;
let manifest = null;

async function gameManifest() {
  if (manifest) return manifest;
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && !SKIP.test(entry.name)) files.push([relative(GAME_ROOT, path).split(sep).join('/'), (await stat(path)).size]);
    }
  };
  await walk(GAME_ROOT);
  files.sort((a, b) => a[0].localeCompare(b[0]));
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  manifest = JSON.stringify({ version, files });
  return manifest;
}

// ---- HTTP ----

const server = createServer(async (req, res) => {
  try {
    res.setHeader('Content-Security-Policy', CSP);
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.has('invite')) {
      // chat apps sometimes glue punctuation (or Markdown's **) onto a pasted link: only the code counts
      const code = (url.searchParams.get('invite').match(/^[A-Za-z0-9_-]+/) || [''])[0];
      if (!same(code, INVITE)) return redirect(res, '/login?invite=bad');
      url.searchParams.delete('invite');
      return redirect(res, url.pathname + url.search, sessionCookie());
    }
    if (url.pathname === '/login') {
      if (req.method === 'POST') {
        const body = new URLSearchParams(await readBody(req, 4096));
        if (PASSWORD && same(sign(`pw:${body.get('password') || ''}`), sign(`pw:${PASSWORD}`))) return redirect(res, '/', sessionCookie());
        return html(res, LOGIN_PAGE(true), 401);
      }
      return loggedIn(req) ? redirect(res, '/') : html(res, LOGIN_PAGE(false, url.searchParams.get('invite') === 'bad'));
    }
    if (!loggedIn(req)) return redirect(res, '/login');
    // an archived version (old/<build>/, the Saves screen's "Open in its version") runs on this server
    // too: its config, game files and crews are this server's (its own config.json is the static site's)
    url.pathname = url.pathname.replace(/^\/old\/[0-9a-f]+\/(?=config\.json$|gamedata\/|api\/)/, '/');

    if (url.pathname === '/api/crews' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ crews: crews.list() }));
    }
    if (url.pathname === '/api/match' && req.method === 'POST') {
      let match;
      try { match = JSON.parse(await readBody(req, 64 * 1024)); } catch { match = null; }
      const result = await crews.record(match);
      res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(result));
    }
    if (url.pathname === '/config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify({ server: true, relay: '/relay', invite: PASSWORD ? INVITE : null }));
    }
    if (url.pathname === '/gamedata/manifest.json') {
      let body;
      try {
        body = await gameManifest();
      } catch (err) {
        // e.g. the game files are missing or unreadable on the server (a deploy problem)
        console.error('server: cannot list the game files:', err.message);
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ error: 'The game files on the server cannot be read.' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(body);
    }
    if (url.pathname.startsWith('/gamedata/')) {
      const path = inside(GAME_ROOT, url.pathname.slice('/gamedata'.length));
      if (!path || SKIP.test(path)) return notFound(res);
      return sendFile(res, path, { cache: 'private, max-age=86400' });
    }
    const path = inside(WEB_ROOT, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    if (!path) return notFound(res);
    return sendFile(res, path);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

function redirect(res, to, cookie) {
  res.writeHead(303, { Location: to, ...(cookie ? { 'Set-Cookie': cookie } : {}), 'Cache-Control': 'no-store' });
  res.end();
}

function html(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > limit) { req.destroy(); fail(new Error('body too large')); } });
    req.on('end', () => ok(body));
    req.on('error', fail);
  });
}

// ---- co-op relay ----
//
// A client joins a room with its own id: {t:'join', room, id, key}. The server answers
// {t:'peers', ids} and tells the others {t:'joined', id}; {t:'left', id} when a
// socket closes. A join with an id already in the room and the same key is that
// player back on a new connection (the old one dropped): it replaces the old one,
// and the others see a leave and a join. Every 15 seconds the server pings each
// socket (one that missed the last ping is closed) and says {t:'hb'}, so the page
// notices a dead connection too. Text messages {t:'msg', to, data} and
// {t:'ping'|'pong', to, n} go to one peer (to) or everyone else (to null) with
// `from` added. Binary
// messages (game inputs) are [target id length, target id, payload]; they arrive
// as [sender id length, sender id, payload].

const rooms = new Map(); // room -> Map(id -> socket)
const MAX_ROOM = 12;
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
    ws.send('{"t":"hb"}');
  }
}, 15000).unref();

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/relay' || !loggedIn(req)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => relay(ws));
});

function relay(ws) {
  let room = null;
  let id = null;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  const others = () => [...(rooms.get(room) || new Map())].filter(([peer]) => peer !== id);
  const target = (to) => (to ? others().filter(([peer]) => peer === to) : others());

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      if (!room || data.length < 1) return;
      const n = data[0];
      const to = data.subarray(1, 1 + n).toString();
      const payload = data.subarray(1 + n);
      const from = Buffer.from(id);
      const out = Buffer.concat([Buffer.from([from.length]), from, payload]);
      for (const [, peer] of target(to)) peer.send(out, { binary: true });
      return;
    }
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.t === 'join' && !room && typeof m.room === 'string' && typeof m.id === 'string' && m.id.length < 64) {
      const name = m.room.slice(0, 32);
      const members = rooms.get(name) || new Map();
      const old = members.get(m.id);
      const back = old && typeof m.key === 'string' && m.key.length >= 16 && old.key === m.key;
      if (old && !back) return ws.send(JSON.stringify({ t: 'taken' }));
      if (!old && members.size >= MAX_ROOM) return ws.send(JSON.stringify({ t: 'full' }));
      if (back) {
        members.delete(m.id);
        old.terminate();
        for (const [, peer] of members) peer.send(JSON.stringify({ t: 'left', id: m.id }));
      }
      room = name;
      id = m.id;
      ws.key = typeof m.key === 'string' ? m.key.slice(0, 64) : '';
      ws.send(JSON.stringify({ t: 'peers', ids: [...members.keys()] }));
      for (const [, peer] of members) peer.send(JSON.stringify({ t: 'joined', id }));
      members.set(id, ws);
      rooms.set(room, members);
    } else if (room && ['msg', 'ping', 'pong'].includes(m.t)) {
      const out = JSON.stringify({ ...m, from: id });
      for (const [, peer] of target(m.to)) peer.send(out);
    }
  });

  ws.on('close', () => {
    const members = rooms.get(room);
    if (!members || members.get(id) !== ws) return; // never joined, or replaced by a new connection
    members.delete(id);
    if (!members.size) rooms.delete(room);
    for (const [, peer] of members) peer.send(JSON.stringify({ t: 'left', id }));
  });
}

const crews = await new CrewStore(DATA_DIR).load();

server.listen(PORT, HOST, () => {
  console.log(`server: http://${HOST}:${PORT} (game ${WEB_ROOT}, files ${GAME_ROOT})`);
  if (PASSWORD) console.log(`server: invite link ${PUBLIC_URL}/?invite=${INVITE}`);
  else console.log('server: no password (this computer only)');
});
