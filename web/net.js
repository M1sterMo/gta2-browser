// Co-op lobby and transport (D20): free roam in a story district with GTA2's
// own network game, lockstep, peer-to-peer. Every player runs the full game;
// only each tick's inputs travel, a few bytes per player.
//
// A transport moves small messages between the players in a room, reliably
// and in order, with one interface (id, join(), send(), leave(), onMessage,
// onPeerJoined, onPeerLeft):
//   WebRtcTransport - the internet: players talk directly, peer to peer, over
//                     WebRTC data channels. No server of ours: public
//                     WebTorrent trackers only introduce the players to each
//                     other (Trystero, web/vendor/trystero), STUN finds a route.
//   ServerTransport - through our own game server (D21, server/server.mjs):
//                     a WebSocket to the server, which relays to the room.
//                     Works on every network.
//   LocalTransport  - BroadcastChannel between tabs of this browser (testing).
//
// Lobby protocol (JSON): hello {name}, crew {crew} (a player's Gang Wars crew),
// roster {players: [{id, name, crew}], settings} from the
// host, start {district, players: [{id, name}], delay, friendlyFire} from the host, loaded (a
// player's game files are ready) and go (everyone's are) for entering the
// match together, and wp {wp: {x, y} | null} (a player's waypoint, shown to
// the others; not part of the game, so it never affects the simulation), and
// sync {tick, h} (a checksum of the game at a tick, compared by everyone to
// catch games drifting apart), and chat {text}. Game messages
// are binary and go straight to the core (gta2_port_net_receive).
//
// The match clock (web/clock.js): in a match every game sends its inputs to the clock only, and
// the clock sends every game one bundle per tick. On our server the server runs it (the address
// '@clock'); elsewhere the host's page does. Also: lag {late: [per slot]} (made-up inputs in the
// last 2 s, from the clock), leave {} (a guest leaves the match, to the host's clock), and hello
// carries the page's build: only players with the same build can play together.

import { BUNDLE, MatchClock } from './clock.js';
import { LANGS, lang, onLangChange, registerDict, t } from './strings.js';

// This page's build (build_pages.py versions every script, ?v=<content hash>); 'dev' locally.
export const BUILD = new URL(import.meta.url).searchParams.get('v') || 'dev';
export const SERVER_CLOCK = '@clock';
// While the match loads, a player gone this long is out (a dropped connection comes back sooner).
const LOADING_GRACE_MS = 10000;

registerDict({
  en: {
    'ui.net.serverNoAnswer': 'the game server did not answer',
    'ui.net.noAnswer': 'no answer',
    'ui.net.waitingPlayer': 'Waiting for at least one more player.',
    'ui.net.needCrew': 'Everyone needs a crew for Gang Wars.',
    'ui.net.twoCrews': 'Gang Wars needs at least two crews.',
    'ui.net.threeCrews': 'Gang Wars has room for three crews (one per street gang).',
    'ui.net.waitingGang': 'Waiting for {names} to pick a gang.',
    'ui.net.and': 'and',
    'ui.net.otherBuild': '{names} has another version of the game. Everyone: reload the page.',
  },
  es: {
    'ui.net.serverNoAnswer': 'el servidor del juego no respondió',
    'ui.net.noAnswer': 'sin respuesta',
    'ui.net.waitingPlayer': 'Esperando al menos a un jugador más.',
    'ui.net.needCrew': 'Todos necesitan un clan para Guerras de bandas.',
    'ui.net.twoCrews': 'Guerras de bandas necesita al menos dos clanes.',
    'ui.net.threeCrews': 'Guerras de bandas admite tres clanes (uno por banda callejera).',
    'ui.net.waitingGang': 'Esperando a que {names} elija una banda.',
    'ui.net.and': 'y',
    'ui.net.otherBuild': '{names} tiene otra versión del juego. Todos: recargad la página.',
  },
  fr: {
    'ui.net.serverNoAnswer': 'le serveur de jeu n’a pas répondu',
    'ui.net.noAnswer': 'pas de réponse',
    'ui.net.waitingPlayer': 'En attente d’au moins un autre joueur.',
    'ui.net.needCrew': 'Tout le monde a besoin d’une équipe pour les Guerres de gangs.',
    'ui.net.twoCrews': 'Les Guerres de gangs ont besoin d’au moins deux équipes.',
    'ui.net.threeCrews': 'Les Guerres de gangs accueillent trois équipes (une par gang de rue).',
    'ui.net.waitingGang': 'En attente du choix d’un gang par {names}.',
    'ui.net.and': 'et',
    'ui.net.otherBuild': '{names} a une autre version du jeu. Tout le monde : rechargez la page.',
  },
});

// The original's multiplayer setups for the three story districts (data/*.mmp).
// Labels are translated when read (the language can change at any time).
export const DISTRICTS = {
  downtown: { get label() { return t('ui.district.downtown'); }, gmp: 'wil-multi.gmp', sty: 'wil.sty', scr: (n) => `downtown-${n}p.scr` },
  residential: { get label() { return t('ui.district.residential'); }, gmp: 'ste.gmp', sty: 'ste.sty', scr: (n) => `res-${n}p.scr` },
  industrial: { get label() { return t('ui.district.industrial'); }, gmp: 'bil-multi.gmp', sty: 'bil.sty', scr: (n) => `Industrial-${n}P.scr` },
};
export const MAX_PLAYERS = 6;

// Each district's three street gangs (the multiplayer maps have them all): internal name, name,
// colour. In Gang Wars every crew sides with one; its members treat the crew as their own.
// Gang names are proper nouns and are not translated.
export const GANGS = {
  downtown: [['zai', 'Zaibatsu', '#c8c8c8'], ['loo', 'Loonies', '#3fd16a'], ['yak', 'Yakuza', '#4fa8ff']],
  residential: [['zai', 'Zaibatsu', '#c8c8c8'], ['red', 'Rednecks', '#ff8a3d'], ['sci', 'SRS Scientists', '#b38bff']],
  industrial: [['zai', 'Zaibatsu', '#c8c8c8'], ['rus', 'Russians', '#ff4d4d'], ['kri', 'Hare Krishnas', '#ffd23f']],
};

// Match modes: free roam (co-op), Gang Wars (crews), free-for-all (the original frag game).
export const MODES = {
  get roam() { return t('ui.mode.roam'); },
  get wars() { return t('ui.mode.wars'); },
  get ffa() { return t('ui.mode.ffa'); },
};

const cleanCrew = (name) => String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Tabs of this browser on the same computer. */
export class LocalTransport {
  constructor(room) {
    this.id = randomId();
    this.channel = new BroadcastChannel(`gta2-coop-${room}`);
    this.peers = new Set();
    this.onMessage = () => {};
    this.onPeerJoined = () => {};
    this.onPeerLeft = () => {};
    this.channel.onmessage = (e) => {
      const m = e.data;
      if (!m || m.from === this.id || (m.to && m.to !== this.id)) return;
      if (m.kind === 'here' || m.kind === 'here-too') {
        if (!this.peers.has(m.from)) { this.peers.add(m.from); this.onPeerJoined(m.from); }
        if (m.kind === 'here') this.channel.postMessage({ kind: 'here-too', from: this.id, to: m.from });
        return;
      }
      if (m.kind === 'bye') { this.peers.delete(m.from); this.onPeerLeft(m.from); return; }
      this.onMessage(m.from, m.data);
    };
    window.addEventListener('pagehide', () => this.leave());
  }
  join() { this.channel.postMessage({ kind: 'here', from: this.id }); }
  send(to, data) { this.channel.postMessage({ kind: 'msg', from: this.id, to: to || null, data }); }
  leave() { try { this.channel.postMessage({ kind: 'bye', from: this.id }); this.channel.close(); } catch { /* closed */ } }
}

// The server says {t:'hb'} every 15 seconds; this long without a word, the connection is dead
// (a laptop that slept, a changed network) even if the browser has not noticed yet.
const SERVER_SILENCE_MS = 45000;

/**
 * Players on our game server (D21): everything goes through its relay. A dropped connection
 * comes back by itself, in the same room under the same id: to the others that is a leave and a
 * join, so a lobby forms again on its own (in a match, the others have dropped this player).
 */
export class ServerTransport {
  static create(room, path = '/relay') {
    const url = new URL(path, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return ServerTransport.connect(url).then((ws) => new ServerTransport(ws, room, url));
  }

  static connect(url) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    return new Promise((ok, fail) => {
      ws.onopen = () => ok(ws);
      ws.onerror = () => fail(new Error(t('ui.net.serverNoAnswer')));
    });
  }

  constructor(ws, room, url) {
    this.url = url;
    this.room = room;
    this.id = randomId();
    this.key = randomId() + randomId(); // proves to the server that a rejoin under this id is us
    this.peers = new Set();
    this.onMessage = () => {};
    this.onPeerJoined = () => {};
    this.onPeerLeft = () => {};
    this.onConnection = () => {}; // (connected): the link to the server dropped, or is back
    this.pings = new Map();
    this.attach(ws);
    this.watchdog = setInterval(() => { if (this.ws && Date.now() - this.heard > SERVER_SILENCE_MS) this.lost(this.ws); }, 5000);
  }

  attach(ws) {
    this.ws = ws;
    this.heard = Date.now();
    ws.onmessage = (e) => {
      if (ws !== this.ws) return; // a connection already given up on
      this.heard = Date.now();
      if (e.data instanceof ArrayBuffer) {
        const b = new Uint8Array(e.data);
        const from = new TextDecoder().decode(b.subarray(1, 1 + b[0]));
        this.onMessage(from, b.slice(1 + b[0]));
        return;
      }
      const m = JSON.parse(e.data);
      if (m.t === 'peers') m.ids.forEach((id) => this.peerJoined(id));
      else if (m.t === 'joined') this.peerJoined(m.id);
      else if (m.t === 'left') { if (this.peers.delete(m.id)) this.onPeerLeft(m.id); }
      else if (m.t === 'msg') this.onMessage(m.from, m.data);
      else if (m.t === 'ping') this.ws.send(JSON.stringify({ t: 'pong', to: m.from, n: m.n }));
      else if (m.t === 'pong') { const done = this.pings.get(m.n); if (done) { this.pings.delete(m.n); done(); } }
      else if (m.t === 'full' || m.t === 'taken') this.onRefused?.(m.t);
      else if (m.t === 'resume-failed') this.onResumeFailed?.();
    };
    ws.onclose = () => this.lost(ws);
  }

  /** The server runs the match clock (SERVER_CLOCK). */
  get serverClock() { return true; }

  /** A message for the server itself: clock {ids}, resume {from}, leave-match. */
  control(m) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** The connection is gone: everyone has left as far as we know, and we dial again (unless we left). */
  lost(ws) {
    if (ws !== this.ws) return;
    this.ws = null;
    try { ws.close(); } catch { /* closed */ }
    for (const id of this.peers) this.onPeerLeft(id);
    this.peers.clear();
    if (this.closed) return;
    this.onConnection(false);
    this.reconnect(1000);
  }

  async reconnect(wait) {
    await new Promise((ok) => setTimeout(ok, wait));
    if (this.closed) return;
    let ws;
    try { ws = await ServerTransport.connect(this.url); } catch { this.reconnect(Math.min(wait * 2, 10000)); return; }
    if (this.closed) { ws.close(); return; }
    this.attach(ws);
    this.join();
    this.onConnection(true);
  }

  peerJoined(id) {
    if (this.peers.has(id)) return;
    this.peers.add(id);
    this.onPeerJoined(id);
  }

  join() { this.ws.send(JSON.stringify({ t: 'join', room: this.room, id: this.id, key: this.key })); }

  send(to, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (data instanceof Uint8Array) {
      const target = new TextEncoder().encode(to || '');
      const out = new Uint8Array(1 + target.length + data.length);
      out[0] = target.length;
      out.set(target, 1);
      out.set(data, 1 + target.length);
      this.ws.send(out);
    } else {
      this.ws.send(JSON.stringify({ t: 'msg', to: to || null, data }));
    }
  }

  /** Round trip to a player through the server, in milliseconds. */
  ping(id) {
    const n = Math.random();
    const t0 = performance.now();
    return new Promise((ok, fail) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { fail(new Error(t('ui.net.serverNoAnswer'))); return; }
      this.pings.set(n, () => ok(performance.now() - t0));
      this.ws.send(JSON.stringify({ t: 'ping', to: id, n }));
      setTimeout(() => { if (this.pings.delete(n)) fail(new Error(t('ui.net.noAnswer'))); }, 5000);
    });
  }

  leave() {
    this.closed = true;
    clearInterval(this.watchdog);
    try { this.ws?.close(); } catch { /* closed */ }
  }
}

const APP_ID = 'gta2-browser-port-coop-1';

/** Players anywhere, peer to peer over WebRTC (see the top of this file). */
export class WebRtcTransport {
  /** The room code is also the password that encrypts the connection set-up. */
  static async create(room) {
    const { joinRoom, selfId } = await import('./vendor/trystero/torrent.mjs');
    return new WebRtcTransport(joinRoom, selfId, room);
  }

  constructor(joinRoom, selfId, room) {
    this.id = selfId;
    this.peers = new Set();
    this.onMessage = () => {};
    this.onPeerJoined = () => {};
    this.onPeerLeft = () => {};
    this.joinRoom = joinRoom;
    this.roomCode = room;
  }

  join() {
    this.room = this.joinRoom({ appId: APP_ID, password: this.roomCode }, `gta2-${this.roomCode}`);
    // lobby messages are JSON, game messages are bytes; both channels are reliable and ordered
    this.lobby = this.room.makeAction('lobby');
    this.game = this.room.makeAction('game');
    this.lobby.onMessage = (data, { peerId }) => this.onMessage(peerId, data);
    this.game.onMessage = (data, { peerId }) => this.onMessage(peerId, data instanceof Uint8Array ? data : new Uint8Array(data));
    this.room.onPeerJoin = (id) => { this.peers.add(id); this.onPeerJoined(id); };
    this.room.onPeerLeave = (id) => { this.peers.delete(id); this.onPeerLeft(id); };
  }

  send(to, data) {
    const action = data instanceof Uint8Array ? this.game : this.lobby;
    action.send(data, to ? { target: to } : {}).catch(() => { /* the peer has gone: onPeerLeft follows */ });
  }

  /** Round trip to a player in milliseconds. */
  ping(id) { return this.room.ping(id); }

  leave() { if (this.room) this.room.leave().catch(() => {}); }
}

// Ticks run 30 times a second. A player's inputs are used `delay` ticks after
// they are sent, so a delay that covers the slowest one-way trip keeps the
// game from waiting on the network (at the cost of that much input lag).
const TICK_MS = 1000 / 30;
export const inputDelayFor = (rttMs) => Math.min(8, Math.max(1, Math.ceil((rttMs / 2 + 10) / TICK_MS)));

/**
 * A bad connection, for testing (?netsim=ms,jitter,spike,perMinute): each message out and in is
 * held ms plus up to jitter milliseconds, and about perMinute times a minute one is held spike
 * milliseconds more (a stall, as a lost packet on a reliable link). Order is kept, as on the real
 * transports.
 */
export class NetSim {
  static fromUrl() {
    const spec = new URLSearchParams(location.search).get('netsim');
    if (!spec) return null;
    const [ms = 0, jitter = 0, spike = 0, perMinute = 0] = spec.split(',').map(Number);
    return new NetSim({ ms, jitter, spike, perMinute });
  }

  constructor({ ms, jitter, spike, perMinute }) {
    Object.assign(this, { ms, jitter, spike, perMinute });
    this.out = 0; // when the last message out leaves, and in arrives
    this.in = 0;
  }

  hold(dir, fn) {
    const now = performance.now();
    let at = now + this.ms + Math.random() * this.jitter;
    if (this.perMinute && Math.random() < this.perMinute / (60 * 30)) at += this.spike; // per message, ~30 a second
    at = Math.max(at, this[dir]);
    this[dir] = at;
    setTimeout(fn, at - now);
  }
}

/**
 * The lobby: who is in the room, who hosts, and the start of a match. The
 * host is whoever created the room; slots follow join order (host = 0).
 */
export class CoopLobby {
  constructor(transport, { name, host, onChange, onStart }) {
    this.t = transport;
    this.name = name;
    this.host = host;
    this.hostId = host ? transport.id : null;
    this.players = host ? [{ id: transport.id, name, build: BUILD }] : [];
    this.onChange = onChange;
    this.onStart = onStart;
    this.started = false;
    this.slots = null;   // id -> slot once the match starts
    this.onGameMessage = () => {};
    this.onPlayerLeft = () => {};
    this.onWaypoint = () => {}; // (slot, {x, y} | null)
    this.onSync = () => {};     // (slot, tick, checksum)
    this.onChat = () => {};     // (slot, text)
    this.stats = { sent: 0, received: 0, early: 0 }; // game messages
    this.early = [];
    this.earlyBundles = [];
    this.trace = [];
    // lang: the game's language for the match, the host's (every player's game shows the same text)
    this.settings = {
      mode: 'roam', district: 'downtown', friendlyFire: false, minutes: 0, killLimit: 10, pointsTarget: 0, sides: {},
      lang: lang(),
    };
    this.loaded = new Set(); // host: players whose game files are ready
    this.gone = new Set();   // players who left after the start
    this.go = () => {};      // game messages that arrived before this player's game was ready
    // the match clock: bundles go to the core in tick order (onBundle); the host's own clock where
    // the server has none
    this.clockId = transport.serverClock ? SERVER_CLOCK : null;
    this.clock = null;
    this.nextTick = 0;
    this.onBundle = () => {};
    this.onLag = () => {};       // (late: made-up inputs per slot in the last 2 s)
    this.onClockLost = () => {}; // the clock is gone for good (the host left, or the server lost this game)
    this.sim = NetSim.fromUrl();
    transport.onPeerJoined = (id) => { if (!this.host) this.send(id, { lobby: 'hello', name: this.name, build: BUILD }); };
    transport.onPeerLeft = (id) => this.left(id);
    transport.onMessage = (from, data) => (this.sim ? this.sim.hold('in', () => this.message(from, data)) : this.message(from, data));
    // ServerTransport: the link to the server dropped (it reconnects by itself); shown in the lobby.
    // In a match this game then asks the server's clock for the bundles it missed.
    // Messages sent while the connection was down are lost: a guest still loading says loaded
    // again, and the host repeats the clock's start (the server ignores a repeat).
    transport.onConnection = (up) => {
      this.offline = !up;
      if (up && this.started && this.clockMode && this.clockId === SERVER_CLOCK) {
        if (this.host && this.goSent) this.startClock();
        this.resuming = true;
        this.control({ t: 'resume', from: this.nextTick });
      }
      if (up && !this.host && this.loadedSent && !this.goReceived) this.send(this.hostId, { lobby: 'loaded' });
      this.onChange();
    };
    transport.onResumeFailed = () => this.clockGone();
    transport.join();
    // the host's language follows the host's page until the match starts
    if (host) onLangChange((code) => { if (!this.started) this.setSettings({ lang: code }); });
  }

  message(from, data) {
    if (this.gone.has(from)) return; // dropped from the match (a reconnected player is not let back in)
    if ((data instanceof Uint8Array || data instanceof ArrayBuffer) && this.clockMode) {
      const bytes = new Uint8Array(data);
      if (from === this.clockId && bytes[0] === BUNDLE) this.bundle(bytes);
      else if (this.clock && this.slots && from in this.slots) this.clock.input(this.slots[from], bytes);
      return;
    }
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      if (!this.slots || !(from in this.slots)) return;
      const bytes = new Uint8Array(data);
      this.log('in', this.slots[from], bytes);
      // another player's game can start sending before ours has loaded: keep those for later
      if (!this.ready) { this.stats.early++; this.early.push([this.slots[from], bytes]); return; }
      this.stats.received++;
      this.onGameMessage(this.slots[from], bytes);
      return;
    }
    if (!data || !data.lobby) return;
    if (data.lobby === 'hello' && this.host && !this.started) {
      if (!this.players.some((p) => p.id === from) && this.players.length < MAX_PLAYERS) {
        this.players.push({ id: from, name: String(data.name || t('ui.coop.namePlaceholder')).slice(0, 16), crew: '', build: String(data.build || '').slice(0, 64) });
      }
      this.broadcastRoster();
    } else if (data.lobby === 'crew' && this.host && !this.started) {
      const p = this.players.find((pl) => pl.id === from);
      if (p) { p.crew = cleanCrew(data.crew); this.broadcastRoster(); }
    } else if (data.lobby === 'side' && this.host && !this.started && typeof data.side === 'string') {
      this.applySide(from, data.side);
    } else if (data.lobby === 'roster' && !this.host) {
      this.hostId = from;
      this.players = data.players;
      if (data.settings) this.settings = data.settings;
      this.onChange();
    } else if (data.lobby === 'start' && !this.host && from === this.hostId) {
      this.begin(data.match);
    } else if (data.lobby === 'loaded' && this.host) {
      this.loaded.add(from);
      this.checkLoaded();
    } else if (data.lobby === 'go' && !this.host && from === this.hostId) {
      this.goReceived = true;
      this.go();
    } else if (data.lobby === 'chat' && this.slots && from in this.slots && typeof data.text === 'string') {
      this.onChat(this.slots[from], data.text.slice(0, 160));
    } else if (data.lobby === 'sync' && this.slots && from in this.slots && Number.isInteger(data.tick)) {
      this.onSync(this.slots[from], data.tick, String(data.h));
    } else if (data.lobby === 'lag' && from === this.clockId && Array.isArray(data.late)) {
      this.onLag(data.late.map(Number));
    } else if (data.lobby === 'leave' && this.clock && this.slots && from in this.slots) {
      this.clock.leave(this.slots[from]);
    } else if (data.lobby === 'wp' && this.slots && from in this.slots) {
      const wp = data.wp && Number.isFinite(data.wp.x) && Number.isFinite(data.wp.y) ? { x: data.wp.x, y: data.wp.y } : null;
      this.onWaypoint(this.slots[from], wp);
    }
  }

  /** A message to one player (to) or everyone (null), through the test network if there is one. */
  send(to, data) {
    if (this.sim) this.sim.hold('out', () => this.t.send(to, data));
    else this.t.send(to, data);
  }

  /** A message for our game server (ServerTransport.control). */
  control(m) {
    if (!this.t.control) return;
    if (this.sim) this.sim.hold('out', () => this.t.control(m));
    else this.t.control(m);
  }

  broadcastRoster() {
    for (const p of this.players) {
      if (p.id !== this.t.id) this.send(p.id, { lobby: 'roster', players: this.players, settings: this.settings });
    }
    this.onChange();
  }

  /** This player's Gang Wars crew (a name; players with the same name are one crew). */
  setCrew(name) {
    const crew = cleanCrew(name);
    if (this.host) {
      const me = this.players.find((p) => p.id === this.t.id);
      if (me) me.crew = crew;
      this.broadcastRoster();
    } else if (this.hostId) {
      this.send(this.hostId, { lobby: 'crew', crew });
    }
  }

  /** Host: change the match settings (mode, district, limits, crew sides); everyone sees them. */
  setSettings(changes) {
    if (!this.host) return;
    this.settings = { ...this.settings, ...changes };
    this.broadcastRoster();
  }

  /** The crews in the room (Gang Wars): name, members and side (the host's choice, or the next free gang). */
  /**
   * The crews in the room (Gang Wars): name, members and the gang the crew picked (null until it
   * picks one; never assigned for it). Two crews cannot hold the same gang: the first keeps it.
   */
  crews() {
    const gangs = GANGS[this.settings.district] || GANGS.downtown;
    const names = [...new Set(this.players.map((p) => p.crew).filter(Boolean))];
    const taken = new Set();
    return names.map((name) => {
      let side = this.settings.sides[name] || null;
      if (side && (!gangs.some(([code]) => code === side) || taken.has(side))) side = null;
      if (side) taken.add(side);
      const gang = side ? gangs.find(([code]) => code === side) : null;
      return {
        name, side, gang: gang ? gang[1] : null, colour: gang ? gang[2] : '#8a8a8a',
        members: this.players.filter((p) => p.crew === name).map((p) => p.id),
      };
    });
  }

  /** The gang this player's crew sides with (any member can choose; the host relays it). */
  pickSide(side) {
    const me = this.players.find((p) => p.id === this.t.id);
    if (!me || !me.crew) return;
    if (this.host) this.applySide(this.t.id, side);
    else if (this.hostId) this.send(this.hostId, { lobby: 'side', side });
  }

  /** Host: a crew member's choice of gang, if the gang is in this district and no other crew has it. */
  applySide(from, side) {
    const p = this.players.find((pl) => pl.id === from);
    if (!p || !p.crew) return;
    const gangs = GANGS[this.settings.district] || GANGS.downtown;
    const valid = side === '' || gangs.some(([code]) => code === side);
    const heldByOther = this.crews().some((c) => c.name !== p.crew && c.side === side);
    if (!valid || (side && heldByOther)) return;
    this.setSettings({ sides: { ...this.settings.sides, [p.crew]: side || undefined } });
  }

  /** Host: why the match cannot start yet, or ''. */
  startProblem() {
    if (this.players.length < 2) return t('ui.net.waitingPlayer');
    const odd = this.players.filter((p) => p.build !== BUILD);
    if (odd.length) return t('ui.net.otherBuild', { names: odd.map((p) => p.name).join(', ') });
    if (this.settings.mode !== 'wars') return '';
    const crews = this.crews();
    if (this.players.some((p) => !p.crew)) return t('ui.net.needCrew');
    if (crews.length < 2) return t('ui.net.twoCrews');
    if (crews.length > 3) return t('ui.net.threeCrews');
    const unpicked = crews.filter((c) => !c.side).map((c) => c.name);
    if (unpicked.length) return t('ui.net.waitingGang', { names: unpicked.join(` ${t('ui.net.and')} `) });
    return '';
  }

  /** A guest: the host's game has another build, or ''. */
  versionProblem() {
    const host = this.players.find((p) => p.id === this.hostId);
    return host && host.build !== BUILD ? t('ui.net.otherBuild', { names: host.name }) : '';
  }

  left(id) {
    if (this.slots && id in this.slots && this.clockMode) {
      // While the match loads: a player not back within LOADING_GRACE_MS is out, so the others
      // can start (the host); a host not back ends it (a guest).
      if (!this.goSent && !this.goReceived) {
        setTimeout(() => {
          if (this.goSent || this.goReceived || this.t.peers.has(id)) return;
          if (this.host) { this.gone.add(id); this.checkLoaded(); } else if (id === this.hostId) this.clockGone();
        }, LOADING_GRACE_MS);
        return;
      }
      // In the match, on our server, the server's clock decides (a dropped connection comes back,
      // and the clock waits for it). Elsewhere a player who leaves is gone; the host's leaving
      // ends the clock.
      if (this.clockId === SERVER_CLOCK) return;
      this.gone.add(id);
      if (this.clock) this.clock.leave(this.slots[id]);
      if (id === this.hostId) this.clockGone();
      return;
    }
    if (this.slots && id in this.slots) {
      this.onPlayerLeft(this.slots[id]);
      this.gone.add(id);
      this.checkLoaded();
      return;
    }
    this.players = this.players.filter((p) => p.id !== id);
    if (this.host) this.broadcastRoster(); else this.onChange();
  }

  /** Host: measures the round trip to every player (shown in the lobby, and sets the input delay). */
  async measurePings() {
    if (!this.host || !this.t.ping) return;
    await Promise.all(this.players.filter((p) => p.id !== this.t.id).map(async (p) => {
      try { p.ping = Math.round(await this.t.ping(p.id)); } catch { /* not connected yet */ }
    }));
    if (!this.started) this.broadcastRoster();
  }

  /** Host: start the match for everyone in the room. */
  start() {
    if (!this.host || this.startProblem()) return;
    const slowest = Math.max(0, ...this.players.map((p) => p.ping || 0));
    const s = this.settings;
    // ?clock=0 on the host's page: the original lockstep without the match clock (for comparing)
    const match = {
      ...s, id: `${randomId()}${Date.now().toString(36)}`, players: this.players, delay: inputDelayFor(slowest),
      crews: s.mode === 'wars' ? this.crews() : [], clock: new URLSearchParams(location.search).get('clock') !== '0',
    };
    for (const p of this.players) if (p.id !== this.t.id) this.send(p.id, { lobby: 'start', match });
    this.begin(match);
  }

  begin(match) {
    match.lang = LANGS.includes(match.lang) ? match.lang : 'en'; // the same fallback for everyone
    this.started = true;
    this.players = match.players;
    this.slots = Object.fromEntries(match.players.map((p, i) => [p.id, i]));
    this.mySlot = this.slots[this.t.id];
    this.clockMode = !!match.clock;
    this.matchId = String(match.id || '');
    if (this.clockMode && !this.clockId) this.clockId = this.host ? this.t.id : this.hostId;
    this.onStart({ ...match, mySlot: this.mySlot, delay: match.delay || 1 });
  }

  /**
   * Resolves when every player's game files are loaded, so that all enter the
   * match together (the game gives up on a player who is not there within
   * about 25 seconds, and loading speeds differ a lot).
   */
  allLoaded() {
    return new Promise((resolve) => {
      this.go = () => { this.go = () => {}; resolve(); };
      if (this.host) { this.loaded.add(this.t.id); this.checkLoaded(); } else { this.loadedSent = true; this.send(this.hostId, { lobby: 'loaded' }); }
    });
  }

  checkLoaded() {
    if (!this.host || !this.slots || !this.loaded.has(this.t.id)) return;
    if (!this.players.every((p) => this.loaded.has(p.id) || this.gone.has(p.id))) return;
    if (this.goSent) return; // once: a second clock would start the match's ticks over
    this.goSent = true;
    if (this.clockMode) this.startClock();
    for (const p of this.players) if (p.id !== this.t.id && !this.gone.has(p.id)) this.send(p.id, { lobby: 'go' });
    this.go();
  }

  /**
   * Host: the match clock starts as everyone enters the match. Our server runs it; elsewhere this
   * page does, on a worker's timer (a hidden tab's own timers slow down), and every 2 s tells
   * everyone whose inputs it had to make up (lag).
   */
  startClock() {
    const ids = this.players.map((p) => p.id);
    const left = ids.filter((id) => this.gone.has(id)); // while the match loaded
    if (this.clockId === SERVER_CLOCK) { this.control({ t: 'clock', ids, left, match: this.matchId }); return; }
    if (this.clock) return;
    this.clock = new MatchClock({
      players: ids.length,
      send: (bytes) => {
        for (const id of ids) if (id !== this.t.id && !this.gone.has(id)) this.send(id, bytes);
        this.bundle(bytes);
      },
    });
    for (const id of left) this.clock.leave(this.slots[id]);
    const timer = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),4);'], { type: 'text/javascript' })));
    let late = this.clock.stats().map((s) => s.late);
    let lagAt = performance.now();
    timer.onmessage = () => {
      this.clock.poll();
      if (performance.now() - lagAt >= 2000) {
        lagAt = performance.now();
        const now = this.clock.stats().map((s) => s.late);
        const msg = { lobby: 'lag', late: now.map((n, i) => n - late[i]) };
        late = now;
        for (const id of ids) if (id !== this.t.id && !this.gone.has(id)) this.send(id, msg);
        this.onLag(msg.late);
      }
      if (this.clock.done) timer.terminate();
    };
  }

  /**
   * A bundle from the clock: to the core, in tick order. One seen before is dropped (a resend that
   * overlaps); one after a gap (missed while the connection was down) waits for the resend, which
   * this game asks our server for.
   */
  bundle(bytes) {
    const tick = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, true);
    if (tick !== this.nextTick) {
      if (tick > this.nextTick && this.clockId === SERVER_CLOCK && !this.resuming) {
        this.resuming = true;
        this.control({ t: 'resume', from: this.nextTick });
      }
      return;
    }
    this.resuming = false;
    this.nextTick++;
    this.stats.received++;
    if (!this.ready) { this.earlyBundles.push(bytes); return; }
    this.onBundle(bytes);
  }

  /** The clock is gone for good (said once). */
  clockGone() {
    if (this.clockLost) return;
    this.clockLost = true;
    this.onClockLost();
  }

  /** This player leaves the match (the game is over for them): the clock drops them now. */
  leaveMatch() {
    if (!this.started || !this.clockMode) return;
    if (this.clockId === SERVER_CLOCK) this.control({ t: 'leave-match' });
    else if (!this.host) this.send(this.hostId, { lobby: 'leave' });
  }

  /** The last game messages in and out, for diagnosing (window.gta2.coop.lobby.trace). */
  log(dir, slot, bytes) {
    this.trace.push(`${dir} ${slot} ${bytes[0]}:${bytes[1]}${bytes[0] === 3 ? ` ${bytes[2]}` : ''} @${Math.round(performance.now())}`);
    if (this.trace.length > 80) this.trace.shift();
  }

  /** This player's game is ready for game messages: delivers the ones that came early. */
  gameReady() {
    this.ready = true;
    for (const [slot, bytes] of this.early.splice(0)) { this.stats.received++; this.onGameMessage(slot, bytes); }
    for (const bytes of this.earlyBundles.splice(0)) this.onBundle(bytes);
  }

  /** A chat message to everyone else in the match. */
  sendChat(text) {
    if (!this.slots) return;
    for (const id of Object.keys(this.slots)) if (id !== this.t.id) this.send(id, { lobby: 'chat', text });
  }

  /** A checksum of this player's game at a tick, for the others to compare. */
  shareSync(tick, h) {
    if (!this.slots) return;
    for (const id of Object.keys(this.slots)) if (id !== this.t.id) this.send(id, { lobby: 'sync', tick, h });
  }

  /** This player's waypoint, for the others' maps (null clears it). */
  shareWaypoint(wp) {
    if (!this.slots) return;
    const msg = { lobby: 'wp', wp: wp ? { x: wp.x, y: wp.y } : null };
    for (const id of Object.keys(this.slots)) if (id !== this.t.id) this.send(id, msg);
  }

  /** Game messages from the core: to one slot, or -1 for everyone. */
  sendGame(slot, bytes) {
    this.log('out', slot, bytes);
    if (this.clockMode) {
      // the clock takes inputs only; this game's own come back in its bundles
      if (this.clock) this.clock.input(this.mySlot, bytes);
      else this.send(this.clockId, bytes);
      this.stats.sent++;
      return;
    }
    for (const [id, s] of Object.entries(this.slots)) {
      if (s === this.mySlot || (slot >= 0 && s !== slot)) continue;
      this.send(id, bytes);
      this.stats.sent++;
    }
  }
}
