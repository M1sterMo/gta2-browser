# First browser build: status

Updated 13 October 2026. This build is the start of the G2 "playable browser slice". It is
**not** G2 yet: see the checklist at the end.

## What runs (observed in the in-app Chromium browser)

- The whole `gta2_re` game library (107 files) plus the port's platform layer compiles to
  one WebAssembly module and starts with the user's own game files. Release build: 1.1 MB
  wasm (≈400 KB gzipped). Debug build: 8.9 MB.
- Main menu, its sub-menus, background art, fonts and the high-score ticker render
  through our WebGL2 renderer. Keyboard menu navigation works.
- **Start play in area 1** loads Downtown and the game runs. The opening scene matches
  the original 9.6F under Wine: the church start, "JESUS SAVES" sign (drawn upside-down
  in the original too), HUD, lighting, pedestrians.
- **Walking works** with the original default key bindings. Collision with walls and
  the following camera work. Trains and traffic lights are **enabled**; upstream's own
  standalone path switches both off.
- No crash over several minutes of play in the tested sessions.

- **Driving works.** Tested with the developer probe (`window.gta2.dev`):
  - entering a car takes about 4.5 s (walk to the door and the animation);
  - accelerating builds speed smoothly (0.02 → 0.15 blocks/tick over 1.25 s);
  - collisions, sliding and the speed zoom all work;
  - getting out is immediate.
- **Saving and resuming work.**
  - The church save charges $50,000, and the game writes `player/plyslot0.svg`.
  - The shell stores it in IndexedDB, keeping the previous version as `#prev`.
  - After a page reload, "Resume saved status" is enabled and puts the player back
    at the church where they saved.
  - Saves can be exported to and imported from a JSON file (buttons top right).

- **Shooting works.** With a pistol given through the mission-script function, holding
  attack for 1.5 s fired 3 shots: ammo 500 → 470 (the HUD shows ammo ÷ 10). The weapon
  icon appears in the HUD.
- **Stability:** a 180 s randomised soak (202 actions, 6,082 frames) ran with no errors.
  Memory stayed at the initial 128 MB. That run was on foot only.

- **Sound works.** The Miles calls drive Web Audio:
  - Effects come from the game's PCM banks (volume, pan, pitch, loop points).
  - Speech and radio are IMA ADPCM WAVs, decoded in JavaScript about 0.5 s at a time.
    The decoder matches a reference decoder sample for sample.
  - The car radio plays the stations in `data/GTAudio`, which stands in for the
    original's music CD.
  - Audio starts on the first key press or click. Mute is in the tools bar. Bink movies
    are skipped.
- **Played by the user (13 October 2026):**
  - Firefox: the game runs; sound and radio confirmed by ear.
  - About 15 minutes of normal play, including missions, with no crash. The missions
    the user tried worked.
- **Automated driving soak:** 139 s of game time (4,729 frames, 3 car entries, 26 s
  driving) with no errors and memory flat at 128 MB. It then stalled, because the soak
  driver's own timers are throttled in a background pane; the game itself kept running.

Not yet investigated: the attract-mode demo did not start after 40 s idle on the menu.

## Widescreen (D07)

Gameplay fills the browser window's shape. Menus, loading screens and the HUD stay at 4:3.

- The game always works in a reference space 480 pixels high. For gameplay frames it is
  as wide as the window's aspect (16:9 gives 852), from 640 up to 1280. The WebGL
  renderer scales that to the real canvas size. Menus and other 4:3 screens are
  pillarboxed.
- **Same vertical view as the original; more world at the sides.** The projection scale
  stays the 4:3 one (`field_60.x` = 640 × zoom), so a wider screen shows more of the map
  instead of zooming in.
- **Patch 0010 changes:**
  - the map renderer's horizontal tile range and the sprite draw pass are widened;
  - the HUD is laid out in a 640-wide box, and each part is anchored to the screen's
    edge (patch 0014; `?hud=centre` keeps it all centred):
    - right: cash, lives, multiplier, weapon and ammo, power-up timers, hearts;
    - left: respect bars and pagers;
    - centred: messages, names, wanted level, and the arrows around the player.
  - the UI scale follows the height.
- **Activation margin (on by default in widescreen).** The game uses one camera
  rectangle for spawning and for its "on screen" and despawn checks. At 4:3 it is about
  one block larger than the view.
  - Measured at 16:9 (default zoom, on foot): the view reached 5.24 blocks either side
    of the camera, while the 4:3 rectangle's half-width was 4.5. Pedestrians spawn at
    5.0 and cars at 5.5, so they would appear in view, and objects would count as off
    screen while still visible.
  - The margin widens the rectangle horizontally by the extra visible width (half-width
    6.19 against 5.24 visible), which restores the original headroom ratio.
  - This is a recorded gameplay deviation: more of the street is live at once. `?margin=0`
    turns it off; at 4:3 it does nothing.
- Checked at 16:9:
  - menu, church start, car entry and driving;
  - car-name banner and HUD in the centred box;
  - pedestrians drawn in the side margins;
  - a 120 s random driving soak (146 actions, about 3,500 frames): no errors, memory
    flat at 128 MB.
- `?aspect=4:3` gives the original view, unchanged.

## Modern camera (D17): the zoom pumping fix

The camera height (how far out the view is zoomed) no longer pumps with every bump,
corner or brake. Modern is the default; `?camera=classic` draws the original camera.

- **Cause, from the source.** `ApplyCarVelocityCameraOffset_436200` sets the height target
  to the car's height plus its raw speed whenever the speed is above 1.5, so the target
  jumps by 1.5 blocks at the threshold. The camera rises fast (up to 18 blocks/s) and
  falls slowly. Each short slowdown starts a descent that the next acceleration undoes.
- **Modern** (`Source/port_modern_camera.cpp`) filters the canonical height after each
  camera update:
  - it rises smoothly, settling in about 1.2 s;
  - it follows a lower height only after it has been lower for 1.5 s;
  - changes under 0.3 blocks are ignored;
  - it stays at most 3 blocks above the canonical height;
  - it snaps on scripted cameras and teleports.

  It filters the height rather than the speed, which has the same effect as D17's
  speed filter. Only the drawn height changes: `Game_0x40::Draw` swaps it in and then
  restores it. The simulation never sees it.
- **Activation margin.** When it is on (the default), the camera boundaries use the
  higher of the canonical and drawn heights, so nothing spawns or despawns in view while
  Modern is zoomed out further. The sprite draw pass covers whatever is drawn.
- **Acceptance test** (`scripts/port/camera_test.js`): about 70 s of driving on the
  longest straight road in Downtown, with random short brakes, coasting, lane wiggles
  and real crashes into traffic. Both heights were recorded each frame on the same drive:

  | | Classic | Modern |
  |---|---|---|
  | Zoom direction reversals per minute (0.1-block hysteresis) | 25.9 | 10.7 |
  | Peak zoom rate (blocks/s) | 6.0 | 3.3 |
  | Height travel per minute (blocks) | 43.7 | 29.0 |

  - **Every Modern descent began only after the canonical height had been lower for at
    least 1.5 s.** One began at 1.42 s, through the 3-block ceiling after a crash.
    Modern's remaining reversals follow real stops (crashes, long brakes), not short
    speed changes.
  - **The trade-off:** after a standing start, Modern reaches full height about a
    second later than Classic.
- **View distance** (Modern camera): the tools-bar button "View: Normal / Far / Farther /
  Farthest", or the − and = keys during play, raises the camera by 0, 1.5, 3 or 4 blocks.
  - The setting is kept per browser. `?heightbias=N` overrides it for one visit.
  - The activation margin uses the drawn height, so spawning stays off screen.
- **Smoothing tuned 20% softer** at the user's request (13 October 2026):
  - it waits 1.8 s (was 1.5 s) before zooming back in;
  - rise and descent rates are ×0.8, so it settles in about 1.5 s going up and 2.4 s
    going down.

  Re-measured with this tuning (90 s scripted drive, same test, different traffic):
  - zoom reversals: Classic 32.3 per minute, Modern 10.2;
  - peak zoom rate: 6.04 against 2.74 blocks/s;
  - height travel: 59.9 against 34.4 blocks per minute.

  Every Modern descent started after the canonical height had been low for at least
  1.8 s, or through the 3-block ceiling. The three short entries the script lists are
  continuations of a descent already under way (gap 0.31–0.38 blocks).
- **Not done yet from D17:**
  - continuous look-ahead (the 45° sector switch remains);
  - sharp-bilinear sampling while zooming;
  - display-rate interpolation (D04).

  The game still draws one frame per 30 Hz tick.
 `?aspect=16:9` or `21:9` force a
  shape. Without the option, the shape is taken from the window when the game starts.

## Page tools and game files

- **Tools bar** (bottom centre, clear of the HUD):
  - **Camera: Modern/Classic** switches instantly in-game and is remembered per browser.
  - **FPS** shows presented frames per second, bottom left. Expect 30: the game draws one
    frame per 30 Hz tick until display-rate interpolation (D04) lands.
  - **Full screen** works on the whole page. In Chromium, Esc stays with the game: hold
    Esc to leave full screen. In Firefox, Esc leaves full screen.
  - Mute, and export or import saves.
- **The gameplay view defaults to 16:9.** With `?aspect=auto`, the width follows the
  window live (resize, full screen). The core updates the screen rectangle and re-applies the game's screen size
  between frames (`gta2_port_set_view_width`). This was checked mid-game, switching from
  640 to 852 wide.
- **Starts without asking where the game files are:**
  1. On this computer, `serve_port.py --dev-data` serves the `game/` folder, on the
     loopback interface only. The page loads from there automatically: no picker, no
     browser copy.
  2. Otherwise the page uses the copy kept in the browser after the folder was picked
     once.
  3. Otherwise the picker is shown.

  The main local address is **http://localhost:8765** (release build, `gta2-port` in
  `.claude/launch.json`). The debug build is on 8767.
- **Game files are kept in the browser after the first pick** (`web/gamefiles.js`,
  IndexedDB):
  - The next visit shows **Play** instead of asking for the folder again. Measured: 332
    files, 400 MB, stored in 2.3 s.
  - A completion marker is written last, so a partial copy is never used.
  - **Forget game files** deletes the copy.
  - Like saves, the copy is per site and per browser.
- **Freeware download (for private testing, D19).** The start page offers
  "Download GTA2 (free, 362 MB)". The player's browser:
  1. fetches Rockstar's 2004 freeware installer from the Internet Archive, using its
     CORS-enabled `/cors/` address;
  2. checks the installer's SHA-1;
  3. cuts the three InstallShield cabinets out at their recorded offsets;
  4. unpacks the `App_Executables` group in a worker, using `unshield` 1.6.2
     (MIT, pinned `0d1e7cb`, compiled to WebAssembly by `scripts/build_unshield_wasm.sh`);
  5. keeps the files like a picked folder and starts the game.

  The site never stores or serves game files. `?choose=1` shows the page with the
  button even when the files are available.

  **Tested end to end** in the in-app Chromium (13 October 2026):
  - The real download from archive.org (about 7 minutes at the Archive's speed) passed
    the SHA-1 check.
  - All **332 unpacked game files match the SHA-256 manifest** of the reference
    installation.
  - The game started from them, and the files were stored in the browser for the next
    visit.
  - If unpacking fails, the worker returns the download, so a retry does not fetch it
    again.
- **Picking the installer file.** Players who downloaded `GTA2INSTALLER.exe` themselves
  can choose it on the start page. It is size- and SHA-1-checked and unpacked in the
  browser like the download.
- **Private preview** (13 October 2026): https://claude.ai/artifact/GeDLj74mF5GnfYdVadJ52o
  - It is private to the owner's claude.ai account. `scripts/build_artifact.py`
    prepares it from the release build.
  - The artifact sandbox blocks other sites, so the one-click download is hidden
    there. Players choose their GTA2 folder or the installer file.
  - Not yet verified there: whether the sandbox allows WebAssembly and module workers.
- **Hosting.** The port itself can be hosted, because it contains no game assets. Every
  player must still supply their own GTA2 files once per browser. Bundling the files on
  a server would redistribute Rockstar's assets, which the freeware licence does not
  allow (see AGENTS.md).

## Smooth drawing at the display's rate (D04, patch 0015)

The game still updates 30 times a second, exactly as the original. Between updates the
port now draws extra frames, as many as the display refreshes. In each one, sprites and
the camera sit part-way between the last two updates (`Source/port_interpolation.cpp`).

- **Every draw is interpolated by the time since the last update.** The display runs
  one update (33 ms) behind, the usual trade-off.
- **Nothing in-between reaches the simulation.**
  - For drawing, each moved sprite's cached rotated box (`Sprite_4C`, which collision
    code also reads) is recomputed at the in-between position. All 76 bytes are
    restored afterwards, together with the position, height and rotation.
  - The lighting fade, which `MapRenderer::Draw` advances per draw, is put back after
    extra draws.
  - Extra draws replay the HUD of the last real draw instead of running the HUD, which
    services timers while drawing.
  - Sprites that jumped more than 2 blocks are not interpolated: these are teleports and
    reused pool entries.
- **Measured** on a 120 Hz display, driving straight:
  - off: 30 positions per second, each held for four refreshes, speed variation 0.47;
  - on: 120 frames per second, a new camera position every frame, speed variation 0.18.

  A 60 s random driving soak averaged 121 fps with no errors and memory flat at 128 MB.
- **Follow-up after the owner's test (13 October 2026):** "smooth but not 120 Hz smooth".
  - The in-between fraction now uses sub-millisecond time. At 120 Hz a frame lasts
    8.33 ms, and whole milliseconds made the steps uneven.
  - The radar and on-screen arrows now follow the *drawn* player and camera positions;
    before, they stepped at 30 Hz while the view glided.
  - Measured as roughness (each frame's step against the average of its neighbours, so
    acceleration is not counted), driving at 120 frames per second: camera 0.08,
    radar player 0.09. With smoothing off the view moves on one frame in four.
- `?smooth=0` turns it off.

## Map, minimap, waypoints and discovery (T33, not in the original)

- **Map image.** It is built in the browser from the player's own map and style files, as
  the game loaded them (`port/platform/map_web.cpp`):
  - each block shows its topmost lid tile, rotated and flipped as the map specifies, at
    16 px per block (4096 px for the district);
  - see-through "flat" lids (rails, fences) show the surface below.

  No map images or marker data come from anywhere else.
- **M** opens the full map (the tools-bar "Map (M)" button does the same):
  - It pauses the game: no simulation and no audio while open, and the frame timer
    restarts on close.
  - It opens centred on the player. Drag or WASD to move, wheel or Q/E to zoom.
  - Click to set a waypoint (it snaps to a nearby marker); right-click clears it. Esc
    or M closes the map.
  - Waypoints are kept per district in the browser.
- **Radar minimap** (bottom right, GTA style, toggled from the tools bar). It is round
  and north-up, with a thick black border and N on the rim. It covers about 18 blocks
  across. The waypoint, gang arrows and mission targets sit on the rim when they are
  outside it. Earlier description: shows the player's heading,
  nearby markers, and the waypoint or an arrow towards it. **On-screen arrow:** when the
  waypoint is off screen, an arrow at the edge of the game view points to it, with the
  distance in blocks.
- **Markers** come from the game's own state. Downtown, counted on 13 October 2026:
  - **From the object pool** (`gta2_port_map_objects`), which is scanned in full:
    objects that need no per-frame update are allocated untracked and are not on the
    pool's used list. This gives 16 kill frenzies, 38 weapon pickups, 29 power-ups,
    49 tokens and 2 car crushers.
  - **6 garages**, one per building: the garage doors (model 130) are grouped, and
    each door's sub-type names its service (respray, car bomb, oil slick, car machine
    gun).
  - **Save points:** the script's trigger areas whose thread reaches SAVE_GAME or
    DO_SAVE_GAME (`gta2_port_map_triggers`). Downtown's one is the church.
  - **Gang jobs and mission targets** come from the HUD's own arrows
    (`gta2_port_map_arrows`, `gta2_port_map_gangs`). Each gang has an info phone and
    easy, medium and hard job phones. The arrow colours 3, 1 and 2 (green, yellow,
    red) were checked against the phone objects at the same places. Active mission
    targets show as pulsing rings.

  Hovering a marker shows its name.
- **The game's own artwork.** Arrows, difficulty triangles and gang logos are the HUD's
  sprites (sprite type 6), rendered from the player's style file
  (`gta2_port_sprite_rgba`):
  - gang arrows 1–7 (tip up when unrotated);
  - difficulty triangles 8–10 (yellow, green, red);
  - gang logos 64 + arrow colour − 1, as on the respect bars.

  The minimap arrows were compared with the original HUD arrows in the same situation:
  same colours and directions.
- **Checked in play (13 October 2026):**
  - **Respect gating:** the game's own thresholds are easy from −19 respect, medium
    from 40, hard from 80. Setting Zaibatsu respect to 40 adds its medium job to the
    list; 80 adds the hard job.
  - **Mission target:** walking onto the Zaibatsu easy-job phone starts the mission.
    The list then shows only the target. The target arrow has no gang (colour 4, sprite
    0); it was first mistaken for an info phone, which is now fixed.
  - **Articulated truck** (restored hitch offsets): the trailer spawns 1.2 blocks behind
    the cab, stays 1.2 behind after 14 blocks of driving, and articulates in turns.
- **Only active jobs are listed:** job phones whose required respect the player has,
  while not on a mission. The info phones are left out. At a new game, that is the
  three easy jobs. During a mission only the target is shown.
- **A waypoint set on a gang job carries the gang's logo**: on the map pin, at the
  minimap edge and on the on-screen arrow.
- **The gang/mission arrows are on the minimap.** While the minimap is on, the game's own
  arrows around the player are not drawn (patch 0013). The minimap shows the same targets
  the HUD would show at that moment: the game's own visibility decision covers no job
  arrows during a mission and the respect thresholds. Mission targets are always shown.
- **Waypoints** are set by clicking the map, a marker, or a gang job in the map's list.
  Each page visit starts with no waypoint. The on-screen waypoint arrow appears only
  within 50 blocks; farther out, the minimap points the way.
- **Discovery** (default):
  - The blocks that have been on screen are recorded and stored per district in the
    browser. Unseen areas are dark.
  - A marker appears only once its spot has been on screen. The legend shows "found /
    total" per kind.
  - **F** on the map shows everything.
- Not yet:
  - discovery tied to a save slot and included in Export saves (it is per browser for
    now);
  - the other districts (Residential, Industrial) are untested with the map.

## Co-op (D20): free roam with friends, peer to peer

- **How to play.** Open `?coop` (for example http://localhost:8765/?coop).
  - The host clicks **Host a game** and shares the room code.
  - Friends enter the code and **Join**.
  - The host picks Downtown, Residential or Industrial and clicks **Start** (2–6
    players).
  - Each player needs the game files in their own browser, as for single player.
- **How it works.**
  - GTA2's own network game: every player runs the whole game, and only key presses
    travel, a few bytes per tick.
  - Players find each other through public WebTorrent trackers (Trystero), then talk
    directly over WebRTC. There is no game server.
  - Finding each other took 10–60 s in tests. The trackers are public and sometimes
    slow.
  - The host measures pings and picks an input delay so the game does not wait on the
    network.
- **Observed** (two tabs on one Mac, in-app Chromium):
  - Lockstep over BroadcastChannel for 1,130 ticks and over WebRTC for 285 ticks.
  - Identical ped and car checksums on both sides at every sampled tick.
  - Both players' movements were seen by both.
- **Not yet tested:**
  - two separate computers over the internet;
  - players behind strict NATs (no TURN relay is provided);
  - more than two players;
  - a full play session for desyncs during combat, cars and police;
  - Residential and Industrial in co-op.
- **Known limits.**
  - A player who closes the tab or loses connection is dropped after about 6 s, as in
    the original.
  - No rejoin.
  - The match ends back at the lobby page.
- **Testing notes.**
  - `?coop&local` keeps the match inside one browser (BroadcastChannel).
  - `?syncdump=N` captures every ped and sprite at tick N.
  - `gta2_dev_sync_history` returns per-tick ped and car hashes for comparing
    machines.
  - Controls are WASD (arrow keys are not bound).

## Co-op modes (Gang Wars, free-for-all)

The host picks a mode in the lobby. Limits are typed in by the host; 0 means none, and the
game's time limit stops at 60 minutes.

- **Free roam.** Explore together. Friendly fire is the host's choice (off by default).
- **Gang Wars** (up to 6 players):
  - Players create a crew by typing its name, or join and switch crews with one click on
    the crew cards. Each crew's own members pick its gang from the district's three street
    gangs (the host can too). Nothing is assigned automatically, and a gang another crew
    holds shows as taken. The match can't start until everyone is in a crew and every crew
    has a gang. The crew wears its gang's colour.
  - On the first tick, every player's respect is set to +100 with their side's gang and −100
    with the other street gangs, using GTA2's own gang AI. Your gang leaves you alone; rival
    gangs attack on sight.
  - No friendly fire inside a crew; everyone else is fair game.
  - The crew score is the sum of its members' multiplayer points (cash earned). The crew
    scoreboard is under Tab. A points target is checked by the page; the time limit is the
    game's own.
  - On the radar and map, crew-mates always show; enemies only within 24 blocks.
- **Free-for-all.** GTA2's own frag game, with a kill limit and time limit. The original HUD
  shows frags and the countdown, and the game ends the match itself.
- **Saved crews (D21).**
  - A finished Gang Wars match of a minute or more is reported by every player's page. The
    server keeps the first report per match ID and answers the others with the same result.
  - Each crew's stats and reputation are kept in `crews.json` under the server's data folder,
    `/opt/gta2/data/db` on the droplet. Reputation: a win 50, a kill 5, a death −2, every
    $10,000 of points 1, never below 0. A tie has no winner.
  - The landing page shows a crew leaderboard. The lobby suggests saved crew names and shows
    their reputation and wins.
  - Crews are identified by name only, which is enough for a group of friends.
  - **Observed:** store tests (reputation maths, duplicate and bad reports, survives a
    restart). A real one-minute match between two tabs ended on the game's timer and was
    saved once.
- **Riding together.**
  - Pressing Enter at a car a teammate is driving gets you in as a passenger instead of
    carjacking them. It uses the game's own passenger entry, the way taxi customers get in.
    Teammates are any player in free roam, your crew in Gang Wars, and nobody in
    free-for-all.
  - Passengers can't steer: the game only reads the driver's controls. Enter gets out.
  - **Observed** (with a developer hook seating the other player as the driver):
    - the host walked to the passenger door and got in;
    - the car showed one passenger, the host, with the other player still driving;
    - holding W as the passenger didn't move the car;
    - Enter got the host out with the driver still at the wheel.
- **After a match**, everyone goes back to the same room with the same settings. A "last
  match" table shows the final standings, taken by the game on its last tick.
- **Also:** text chat (T). The scoreboard counts deaths from any cause and arrests, per
  player, inside the game.
- **Observed** (two local tabs; the damage checks used a developer hook on one machine):
  - Gang sides set respect exactly (+100 with your own gang, −100 with the others).
  - A rival crew's hit did damage; a crew-mate's was blocked.
  - Free-for-all ended at the kill limit and showed "Mo won with 1 kill" in the lobby, in
    the same room.

## Game server (D21): one link for friends

- **What it is.** `server/server.mjs` is a password-protected Node server. It serves:
  - the game;
  - the GTA2 files, a one-time 373 MB download kept in the browser;
  - the co-op relay.

  It runs as a small Docker container on the shared DigitalOcean droplet, following
  that droplet's hosting rules:
  - CI builds the image and pushes it to GHCR; the droplet only pulls it;
  - the game and game files are mounted from `/opt/gta2/data`;
  - the shared Caddy forwards one site to it;
  - no ports are published.

  Details are in [deploy/README.md](../deploy/README.md) (`scripts/deploy_server.sh`).
- **What players see.**
  - An invite link logs them in.
  - The page offers **Play** and **Play with friends**, and the game downloads in the
    background while they choose.
  - The co-op lobby shows a link that logs a friend in and opens the room.
- **Observed** (server on this Mac, two tabs, in-app Chromium):
  - Login page: a wrong password gets 401, and game files are refused without a login.
  - The invite link works.
  - Game files: first visit downloaded all 331 files and cached them (373 MB); the
    second visit started from the cache.
  - Co-op through the relay: joined in about a second (2–3 ms ping); 300 lockstep ticks
    with matching ped and car checksums; both players' movement seen on both sides.
- **Fixed during this work.** The background ticker now runs whenever animation frames
  stop arriving, not only when the page reports itself hidden. A window covered by
  another one can stop frames while still counting as visible.
- **Deployed** to the shared droplet on 14 October 2026.
  - The image was built by GitHub Actions and pulled from public GHCR.
  - HTTPS comes from the shared Caddy (automatic certificate).
- **Observed on the droplet** (from this Mac in the in-app browser):
  - The invite link logged in.
  - First visit: 356 MB downloaded in about 15 s, then cached.
  - Single player started.
  - Co-op between two tabs through the droplet: 13 ms round trip, input delay 1,
    about 290 lockstep ticks with matching checksums.
  - Container at 20 MB, droplet load 0.1, SkipTheBA unaffected.
  - Fix needed on the first deploy: the installer leaves `data/` owner-only, so the
    deploy now makes the copied files readable by the container.
- **Not yet tested:**
  - Windows and Linux browsers;
  - downloads over a real internet connection;
  - more than two players.

## Saves: quick save, slots with pictures, Continue (single player)

**Keys and buttons:**
- **Quick save:** ⌘S on a Mac, Ctrl+S elsewhere. F5 also works.
- **Quick load:** ⌘O on a Mac, Ctrl+O elsewhere. F9 also works.
- **Saves screen:** ⌘⇧S or Ctrl+Shift+S, or the toolbar's Saves button. It shows the quick save and six slots. Each card has a picture of the moment, the area and district ("Tedium, Industrial"), cash, wanted stars and when it was saved. Each card has Save, Load and Delete; overwriting or deleting asks once. The game is paused while the screen is open.
- **Continue:** on the front page, a card under Play with the newest save's picture and place. One click starts the game and loads it.
- **Toolbar:** Saves, Quick save and Quick load buttons.

**Why these keys:** pages can take over Ctrl/⌘ S and O in Chrome, Firefox and Safari, so the browser's own Save and Open dialogs don't appear. F5 and F9 are kept for PC habits, but F5 is the browser's reload whenever the game doesn't have focus, and Mac keyboards need Fn for F-keys.

**Scope:**
- A save captures the whole game at that moment: missions, police, traffic, the car you're in, the radio position.
- It works anywhere in a single-player game.
- It's off in co-op, where every player simulates the same game.

**How it works** (`web/savestate.js`, `port/platform/savestate_web.cpp`):
- **What's saved.** The game's state is its WebAssembly memory. Between two frames the shell copies it up to the heap's end, about 30 MB in the first district. It gzips the copy (`CompressionStream`, about 11 MB, 1.5 s in the background while the game keeps running) and stores it in IndexedDB (`gta2-port-states`).
- **Loading** writes the memory back in one step, zero-fills the rest, then rebuilds what lives in the browser:
  - **Textures.** The browser's textures are dropped. Every texture the game holds (a registry in `gbh_web.cpp`) is uploaded again under fresh ids. Front-end images keep a copy of their pixels for this.
  - **Sounds.** `web/audio.js` stops everything. The saved streams (radio, speech) reopen at their saved position: positions are copied into memory just before a save. Looping effects (engines, sirens) restart; one-shot effects end silently.
  - **Clock.** All the game's clocks go through `gta2_port_now_ms`, which continues from the saved time, so nothing sees time jump or run backwards.
  - **Also:** held keys are released, the frame timer is reset, and the map and radar are redrawn. The waypoint stays if it's the same district.
- **Build check.** A snapshot only fits the build that made it, so each one records a hash of `gta2.wasm`. A save from another version is refused with a message. The Saves screen marks it "older version" and disables its Load button.
- **Archived builds: no save is ever stranded** (2026-10-23). A change to the game's code (the WebAssembly) makes every Saves-screen save from before it an "older version". Each published build is therefore kept under `old/<build>/`, and the Saves screen opens a save there ("Open in its version").
  - `scripts/deploy_server.sh` archives the server's live build before replacing it.
  - `scripts/build_pages.py` keeps the public site's live build and publishes every archived build, in static mode and without `img/`.
  - Church saves (the game's own) work in every version.
  - **Rule:** before changing the game's code, say so, so the owner can church-save first.
  - **History.** The build live from 15 to 21 October (`ed020b235c9c718f332c2028`) was replaced without being archived. It was rebuilt byte for byte from commit `244f8cc` and archived on 23 October.
- **Card details.** The picture is a 320-pixel JPEG of the game canvas (it keeps its last frame), taken before the Saves screen covers the game. The label comes from `gta2_port_savestate_label`: the area name the game shows on screen, the map file (giving the district), cash, lives, multiplier, wanted stars and health. It's read after the memory copy, because finding the area moves the map's zone cursor.
- **Paused saves.** A save made behind the Saves screen holds the paused flag, so a load always unpauses.
- **Shell rule.** Shell code must not hold a pointer into the game's heap across an `await` (the map waits for its build to finish before a save or load).

**Tested** in the in-app Chromium, release build:
- save, change things, load, in the same session;
- save, reload the page, load from the front-end menu;
- ⌘S and ⌘O pressed for real while driving with the radio on: no browser dialog, the radio resumed.
- Saves screen: saved to a slot (picture, "Tedium, Industrial", $12,345), moved away, loaded it back. The game ran normally afterwards. A save from the previous build showed as "older version".
- Continue on the local game server: saved, reloaded the front page, the card showed the save, and one click went straight back into it.

Not tried yet: Firefox and Safari.

**Next:**
- autosave;
- cloud saves on the game server;
- the church saves (the game's own) stay as they are.

## Public site on GitHub Pages: no game files

- **What it is.** The site is the release build with **no game files**, published to the
  public repo `M1sterMo/gta2` and served at https://m1stermo.github.io/gta2/.
  - `scripts/build_pages.py` builds it into `build/pages`. That folder is its own git
    repo, pushed to `main`; Pages serves the repo root.
  - The script copies only an allowlist (the page, scripts, WebAssembly, unshield and
    vendored Trystero). It refuses to run if any game-file type would be published.
  - It leaves out `img/`, because the screenshot is game art. The landing page hides the
    empty slot.
- **Static mode.** The site's `config.json` is `{"static": true}`. In that mode:
  - the same landing page and lobby run as on the game server;
  - Play downloads the 2004 freeware installer from the Internet Archive
    (`archive.org/cors/…`, 346 MB), unpacks it in the browser and keeps it in IndexedDB;
  - co-op uses the peer-to-peer transport (WebRTC through public trackers);
  - saved crews and the leaderboard are server-only, so they are hidden.
- **Kept separate from the game server (D21).** The droplet keeps its password, invite and
  hosted game files. No server address or invite code appears in the public site; this is
  checked by grep before each push.
- **Observed on the live site** (14 October 2026, in-app Chromium, from this Mac):
  - The landing page loaded.
  - Play downloaded the installer from the Internet Archive in about 35 s, unpacked it
    and cached the files (381 MB).
  - The game reached GTA2's main menu.
  - The co-op lobby loaded.
  - Not yet tried on the live site: a co-op game between two machines.
- **Updating it:**
  1. `python3 scripts/build_port.py --preset release`
  2. `python3 scripts/build_pages.py`
  3. In `build/pages`: commit, then push to `origin main`.

## Build and run

```sh
python3 scripts/build_port.py --preset debug --prepare   # recreate the patched copy, then build
python3 scripts/serve_port.py --preset debug             # http://127.0.0.1:8765/ (folder picker)
```

Developer options (append to the URL, local only):

- `?devdata=1`: load the files from `game/` instead of the picker. The server must run
  with `--dev-data`, which only binds to loopback.
- `?fastloop=1`: drive the game loop with postMessage. Needed when the tab or pane is
  hidden, where `requestAnimationFrame` is throttled.
- `?autostart=1`: press Enter twice (PLAY, then start area 1).
- `?fresh=1`: ignore saved settings.
- `?skiptrains=1`: set the game's `skip_trains` debug switch.
- `?aspect=W:H`: gameplay view shape. The default is `16:9`; `4:3` is the original;
  `auto` follows the window.
- `?choose=1`: show the folder picker even when the game files are available.
- `?margin=0`: keep the original activation rectangle even where more is drawn.
- `?camera=classic`: the original camera (default: Modern). `?heightbias=N`: Modern height offset in blocks.
- `window.gta2.dev` (developer mode): `state()`, `spawnCar(model, dx, dy, rot)`,
  `addCash(n)`, `giveWeapon(kind, ammo)`, `camera()`, `teleport(x, y)`, `findRoad()`, `files()`, `hold(code, ms)`. The spawn and cash calls are test aids;
  they use the game's own functions.

## Controls (browser-port defaults)

| Action | Key | Original default |
|---|---|---|
| Forward / back / turn left / turn right | W / S / A / D | arrow keys |
| Attack (shoot) | L | Left Ctrl |
| Previous / next weapon | J / K | Z / X |
| Jump / handbrake | Space | Space |
| Enter / exit vehicle | Enter | Enter |
| Special 1 / special 2 / status | I / O / P | Tab / Left Alt / Right Shift |
| Quick save / quick load (port) | ⌘S / ⌘O (Ctrl+S / Ctrl+O; also F5 / F9) | none |
| Saves screen (port) | ⌘⇧S (Ctrl+Shift+S) | none |

The shell seeds these into the game's `Control` registry key at start-up. The original
defaults stay in `gDefaultControls_61A9E4`. Menus keep their hard-coded keys: arrows, Enter, Esc.
The change was requested because Ctrl and Alt clash with macOS and browser shortcuts.

**Changing keys: the Controls screen** (`web/controls.js`, issue #2 on M1sterMo/gta2-browser).
- **Opening it.** In the original game, Options on the main menu launched the separate GTA2 Manager program and minimised the game. The browser has no such program, so the game used to exit with "Failed to launch 'GTA2 Manager' correctly". Patch 0024 makes `Start_GTA2Manager_5E4DE0` call `Gta2Port_OpenOptions` instead (`port/platform/options_web.cpp`), and the menu stays where it is. The toolbar's Controls button opens the same screen.
- **What it does.** It lists the twelve control slots. Click one, then press a key; Esc cancels. A key another action already had swaps over, and the screen says so. Default keys restores the table above.
- **Keys it refuses.** Keys the browser version uses itself in play: M, Tab, R, T, − and =, F5/F9, Esc.
- **How the change applies.** It writes `hklm\…\gta2\control\0-11`, the values GTA2 Manager wrote, and calls `gta2_port_reload_controls`. That export runs the game's own `get_registry_controls_498C00`, so the new key works at once, in the menu or mid-game. The registry is saved in this browser with the other settings.
- **Controllers.** `web/gamepad.js` (PR #4) presses the default keys; the shell passes each press through `ControlsScreen.rebound`, so a rebound action stays on the same controller button. A button's release always lets go of the key its press used.
- **Tested** in the in-app Chromium: Options opens the screen and the game keeps running; M is refused with its reason; Forward set to ↑ walks the player forward and W no longer does; Default keys restores W.

## How it is put together

| Part | Where | Notes |
|---|---|---|
| Upstream source | `research/gta2_re` (pristine, pin `02de8be`) | never edited |
| Port patch series | `port/patches/0001–0017` → applied into `research/port-work/core` | ~300 changed lines; see list below |
| Windows/DirectX stand-in headers | `port/core/compat/` | declarations only; no SDK, GTA2Hax or Microsoft code |
| Renderer interface (62 functions) | `port/render/gbh_web.cpp`, `vid_web.cpp`, `exports.cpp` | export table is type-checked against the game's typedefs |
| WebGL2 renderer | `web/renderer.js` | batched draw list, 3 blend modes, perspective-correct UVs |
| Win32 / DirectInput / CRT shims | `port/platform/` | in-memory registry, message queue, buffered + latched keys |
| Audio / video | `port/audio/`, `web/audio.js` | Miles over Web Audio (status follows the wall clock); Bink reports "cannot open" |
| Co-op (D20) | `port/platform/net_web.cpp`, `web/net.js`, `web/vendor/trystero` | GTA2's own lockstep network game over WebRTC peer to peer; lobby at `?coop` |

Patch series in short:

1. `const` references where clang rejects MSVC temporary binding (automated:
   `scripts/port/constify_temporaries.py`).
2. The non-MSVC array-initialiser macro upstream had commented out.
3. Placeholder `std::vector` hack disabled.
4. The error log goes to the console.
5. C++ translations of three inline-assembly routines.
6. `u32`/`size_t` fixes.
7. The main loop split into per-frame slices.
8. Standalone start-up fixes:
   - the six table initialisers the original's C runtime ran;
   - the default key bindings, taken from the original's own registry;
   - zero-filled allocations;
   - traps for invalid sprite pointers.
9. The music-CD scan repeated after the game files are mounted.
10. Widescreen presentation: projection scale, tile and sprite ranges, HUD box, and the
    optional activation margin, all under `GTA2_PORT`.
11. The Modern camera: a filtered drawn height, and the margin extended to cover it.
12. The original's pan, horn and trailer tables, restored at start-up.
13. Optional hiding of the HUD gang/mission arrows (the minimap shows them).
14. HUD parts anchored to the widescreen edges; the Modern camera 20% smoother.
15. Display-rate interpolation (D04).
16. Interpolation timing below a millisecond; the drawn player and camera positions
    for the radar.
17. Co-op network games (D20): the input exchange split around its wait, input delay,
    yielding while waiting, the match ending back at the shell, sync diagnostics.

## Findings worth keeping

- **Wide strings measured half their length (fixed 2026-10-21, issue #1).**
  - **Symptom.** Player-name cheats (GOURANGA, then UKGAMER, IAMDAVEJ…) never worked.
  - **Cause.** The cheat check hashed only "GOUR", because `wcslen` returned 4 for an 8-letter name. LLVM (emsdk's clang 24) recognises "count until 0" loops and replaces them with a call to `wcslen`. The C library's `wcslen` counts 4-byte characters, while `-fshort-wchar` makes them 2. So the port's own `gta2_wcslen` (`crt_compat.cpp`), written as such a loop, compiled into a call to the 4-byte `wcslen`. One loop in `Frontend.cpp` did the same.
  - **Fix.** `-fno-builtin-wcslen` in `scripts/build_port.py`.
  - **Check after a toolchain update.** `llvm-nm build/port/<preset>/obj/*/*.o | grep " U wcslen"` must print nothing.
  - **Reach.** Every wide-string length in the game was affected (text widths, name lengths), not only cheats.

- **Why upstream's standalone build stalls on entering gameplay.** Six tables are built
  only from the ImGui debug path. They hold object templates, slopes, trig tables,
  sprite scale and the input recorder, and the original filled them before `WinMain`.
  Without them, every object sprite gets a garbage type, and the first car spawn of the
  mission script crashes.
- Two functions return a value on some paths but fall off the end on others
  (`PedGroup::MergeWithOtherGroup_4C9B60`, `ExplosionPool_7A8::FreeLowestPriority_543690`).
  MSVC returned whatever was in the register; clang traps. `-fno-strict-return` restores
  the MSVC behaviour, and both callers ignore the value.
- **Initialised data that the source declares without values ends up zero** in the
  standalone build. `gDefaultControls_61A9E4` (key bindings) was the first case found.
- **Audit (patch 0012).** Of 694 plain globals, 34 are read but never written, and 18
  sit in the original's initialised-data range. Three real tables were zero:
  - the **stereo pan curve** (`gPanTable_61A688`): every sound played centred;
  - the **AI horn rhythms** (`byte_5FE434`): traffic never honked;
  - the **articulated-truck hitch and trailer offsets**: the trailer sat on the cab
    centre.

  Their values were read from the original 9.6F `gta2.exe` running under Wine, using a
  memory dump of the unpacked image (`scripts/refcap/gta2_memdump.c`). Each table was
  located through the 9.6F counterpart of the function that reads it. After the fix,
  pans while driving ranged 14–94 (20 distinct values) instead of all centre. The rest
  of the 34 are zero constants, runtime-built tables, or pool pointers.
- **Still open:** a global that starts non-zero and is also written later would not show
  up in this scan. Only the key bindings are known to be such a case.
- Builds use `-fshort-wchar` (2-byte text) and `-mms-bitfields` (MSVC bitfield layout) to
  keep original struct layouts. All `GTA2_ASSERT_SIZEOF` checks pass on wasm32.
- WebAssembly traps indirect calls whose signature doesn't match. The renderer export
  table therefore `static_cast`s every function to the game's own typedef.
- The menu draws through the same `gbh_*` renderer as gameplay. The game re-fills one
  texture object per glyph or digit, so textures are content-addressed (hash of pixels,
  size and palette) and each draw keeps the right one. Style pages have a 256-byte row
  pitch.
- `cSampleManager` is a global, so its constructor runs at module start-up, before the
  shell has copied the game files in, and its music-CD scan found nothing. The port
  repeats the scan in `Gta2Port_StaticInit`. Other global constructors that read files
  would have the same problem.
- 10.5 code differences from 9.6F:
  - the freeloader `CityInstalled` district gate, which the shell seeds with 2;
  - the version label "GTA2 v10.5";
  - the play-menu "1" badge drawn off-centre, which the upstream build shows too.

## G2 checklist (from the spec)

| G2 requirement | Status |
|---|---|
| Import local files | Folder picker + validation of the core files: done. Full profile check: open. |
| Draw a real district with correct assets | Done (Downtown) |
| Walk | Done |
| Enter/drive/exit a car | Done (test car spawned with the developer probe) |
| Shoot | Done (pistol given with the developer probe) |
| Complete one original mission | Done by the user in play (missions "seem to be working"); no scripted check yet |
| Save, quit, reload | Done: church save, then page reload, then resume. Deeper state comparison still open. |
| Working audio | Done: effects, speech and radio, confirmed by ear by the user |
| 15 minutes of play without crash or original-code fallback | Done: about 15 minutes of user play without a crash. No original-code fallback exists in this build. |
| Chrome + one non-Chromium browser | Done: Chromium and Firefox. Safari not tested yet. |
