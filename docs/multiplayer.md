# Multiplayer

How playing together works in the browser port, what's tested, what isn't, and where to help.
For the step-by-step testing record, see [browser-build-status.md](browser-build-status.md).

## Playing

1. Press **Play with friends** on the front page (or open `?coop`).
2. Type a name and **Host a game**. Send your friends the link the lobby shows, or the room
   code.
3. The host picks the mode, district and limits, then presses **Start**. You need 2 to 6
   players.

Every player needs the game files in their own browser. On the public site, the first visit
downloads them from the Internet Archive. On a private server, the server provides them.

### Modes

| Mode | What happens | Ends when |
|---|---|---|
| **Free roam** | Explore a story district together. Friendly fire is the host's choice (off by default). | Someone quits. |
| **Gang Wars** | Crews side with the district's street gangs. Your gang leaves you alone; rival gangs attack on sight. No friendly fire inside a crew. Crew score is the members' cash. | Points target or time limit |
| **Free-for-all** | GTA2's own frag game. | Kill limit or time limit |

**In the Gang Wars lobby:**
- Type a name to create a crew, or click **Join** on another crew's card.
- A crew's members pick its gang. Each gang belongs to one crew at a time, so a gang that is
  already taken can't be picked.
- Nothing is assigned automatically. Start waits until everyone is in a crew and every crew
  has a gang.

**Each district has three gangs:**

| District | Gangs |
|---|---|
| Downtown | Zaibatsu, Loonies, Yakuza |
| Residential | Zaibatsu, Rednecks, SRS Scientists |
| Industrial | Zaibatsu, Russians, Hare Krishnas |

**Also in a match:**
- **Riding together.** Press Enter at a car a teammate is driving and you get in as a
  passenger, not a carjacker. A teammate is anyone in free roam, your crew in Gang Wars, and
  nobody in free-for-all. You bail out whenever you like with Enter.
- **Chat** (T), **scoreboard** (Tab) and **shared waypoints** on the map (M).
- **Radar in Gang Wars.** Crew-mates always show; enemies show only within 24 blocks.
- **After the match** everyone is back in the same room, with the results and the same
  settings, ready for a rematch.
- **Saved crews** (private game server only). Gang Wars results build up each crew's
  reputation, shown on a leaderboard.

## How it works

GTA2 had a LAN/internet multiplayer mode built on DirectPlay. The port keeps the game's own
model and replaces the transport.

- **Lockstep.** Every player runs the whole simulation. Only each player's key presses
  travel, a few bytes per tick at 30 ticks a second.
  - A tick runs once everyone's input for it has arrived, so all the games stay identical.
  - The host measures pings in the lobby and picks an **input delay** (1 to 8 ticks), so the
    game rarely waits on the network.
- **Sync checks.** Every 90 ticks (3 seconds) each game hashes its peds and cars and shares the hash.
  - If two games ever differ, the page logs the tick and player (`co-op: games drifted
    apart…` in the console).
  - It doesn't repair the drift yet. See the ideas below.
- **Transports** (`web/net.js`). Each one carries the same lobby and game messages:

  | Transport | Used | How |
  |---|---|---|
  | `WebRtcTransport` | Public site, any static host | Peers find each other through public WebTorrent trackers ([Trystero](https://github.com/dmotz/trystero)). After that, traffic goes directly between browsers. The room code also encrypts the set-up. |
  | `ServerTransport` | Private game server | A WebSocket relay at `/relay`. It works on every network. Rooms exist only on the server: its pages may connect to nothing else (CSP `connect-src`), so no public trackers. A dropped connection reconnects by itself, so a lobby forms again on its own. |
  | `LocalTransport` | Testing (`?coop&local`) | A BroadcastChannel between tabs of one browser. |

- **Lobby** (`CoopLobby` in `web/net.js`). The host is the authority: it owns the roster,
  the settings and the crew and gang choices. Its messages are `hello`, `crew`, `side`,
  `roster`, `start`, `loaded` and `go`; in a match, `chat`, `sync` and `wp`.
- **Engine side.**
  - `port/platform/net_web.cpp` stands in for GTA2's network layer: rules, limits and
    friendly fire.
  - `port/platform/coop_web.cpp` exposes players, scores and teams to the page.
  - The rule changes inside the game live in the patch series: `port_coop.cpp`, plus small
    hooks in `Player.cpp` and `Ped.cpp`. They cover the gang sides (through GTA2's own
    respect values), friendly fire, passengers and the end-of-match snapshot.

## Tested and not tested

**Tested.** Two players in tabs on one Mac, over each transport:
- thousands of lockstep ticks with matching checksums;
- Gang Wars respect, crew damage rules, riding as a passenger;
- free-for-all ending at the kill limit;
- saved crews.

On the live server, two tabs ran at a 13 ms round trip with matching checksums.

**Not tested yet:**
- more than two players;
- two computers far apart over the internet;
- players behind strict NATs on the public site (there's no TURN relay, so WebRTC can fail
  there; the private server's relay doesn't have this problem);
- long sessions with heavy combat and police, to look for drift;
- Safari and mobile.

**Known limits:**
- 6 players (the original's limit).
- A player who disconnects during a match is dropped after about 6 seconds and can't rejoin
  (in the lobby, the private server's relay reconnects by itself).
- Passengers can't shoot from the car (yet).
- Finding peers through public trackers takes 10 to 60 seconds.

## Ideas for PRs

Ordered roughly from small to big. Each item says where it starts.

### Small

- **Kill feed.** "Mo wasted Sam (Zaibatsu)" in the corner. The counts already exist per
  player (`gta2_port_coop_players` in `coop_web.cpp`). Diff them each tick in `watchCoop`
  (`web/shell.js`) and draw them like the chat lines (`web/chat.js`).
- **Show a sync warning in the page,** not only in the console. Use the `desync` value in
  `watchCoop`.
- **Lobby polish:**
  - ready checkmarks;
  - kick and ban for the host;
  - a "copy invite" button that remembers the last room.
- **Spawn spread in Gang Wars.** Start each crew in its own gang's turf instead of together.
  The start positions are in the engine's network start code (search the patch series for
  `GTA2_PORT` near the player spawn).

### Medium

- **TURN relay for the public site.** Let a host paste TURN credentials, or add a free relay,
  so strict-NAT players can connect. The place to start is `WebRtcTransport`'s
  `joinRoom({ … })` config (Trystero's `turnConfig`).
- **"Call backup".** A key that summons your gang's NPCs to your position in Gang Wars.
  - GTA2 already has gang members who follow a player; look at how the game recruits
    followers (`Ped` / `PedGroup` in the gta2_re sources).
  - Expose it from `port_coop.cpp`. It must run inside the lockstep: trigger it from an input
    bit, never from the page directly.
- **Drive-bys.** Passengers shoot out of the window. The passenger is a ped inside a car;
  that ped's weapon would have to fire sideways from the car. This touches `Player.cpp` and
  the weapon code, and must stay deterministic.
- **Replays.** Lockstep makes them almost free: record the settings plus every tick's inputs,
  then play them back into the same build. It's also great for reproducing drift bugs.
- **Rejoin.** Let a dropped player come back. It needs either a full game-state transfer or
  a replay of all inputs from tick 0 up to the present (see Replays).
- **More modes.** For example:
  - *Tag* (one player is "it");
  - *Heist* (crews race to a garage with a marked car);
  - *Cops and robbers* (one crew starts wanted).

  The mode switch lives in `setupCoop` (`web/shell.js`) and `gta2_port_net_set_rules`.

### Big

- **8 to 12 players.** The relay already carries 12 connections; the limit is the engine's
  player arrays and the original's 6-player network game. It touches `MAX_PLAYERS`
  (`web/net.js`), the engine's player and team tables, and the respect and HUD code.
- **Drift repair.** Today drift is detected but not fixed. Options:
  - find and fix each nondeterminism (`?syncdump=N` dumps every ped and sprite at tick N on
    each machine, so you can diff them);
  - or resync from the host's state.
- **Touch and gamepad controls.** The input goes through `port/platform/dinput_web.cpp`; the
  Gamepad API maps cleanly onto it.

### Working on multiplayer

- **Two players in one browser:** open two tabs at `?coop&local`. No network is needed.
- **Check for drift:** `gta2_dev_sync_history` returns per-tick ped and car hashes, so you
  can compare two tabs.
- **Engine changes** go in `research/port-work/core` as commits. Then re-export the patch
  series to `port/patches` (`git format-patch 02de8be..HEAD -o port/patches`). Keep each
  change under `#ifdef GTA2_PORT`.
- **Anything that changes what happens in the game** (damage, AI, spawns) must run inside the
  simulation from synced inputs or settings. Never act on it from one page alone, or the
  games drift apart.
