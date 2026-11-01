# Contributing

Thanks for helping. Pull requests are welcome. See [multiplayer.md](multiplayer.md) for ideas.

## The saves rule

**Any change to the game must leave players a way to keep playing the games they already have.**

The game's code is whatever ends up in `gta2.wasm`: engine patches in `port/patches`, C++ in
`port/`, compiler flags and new exports. Pages and scripts around it (`web/`) are not game code,
unless they change what gets saved or how a save loads.

A change to the game's code makes every Saves-screen save an "older version", because a save is a
snapshot of the game's memory and only fits the build that made it. So:

1. **Every published build stays available, for good, under `old/<build>/`.** The Saves screen
   offers "Open in its version" for a save from another build, and the player carries on there.
   `scripts/deploy_server.sh` and `scripts/build_pages.py` keep the build they replace. Don't
   remove a published build or that button.
2. **Church saves must keep working in the newest version.** If a change alters the format of the
   game's own save files (`player/plyslotN.svg`, `.dat`), it must also read the old format.
3. **Say so in your pull request** if it changes `gta2.wasm`, so players can be warned first and
   can church-save, which carries over to the new version.
4. **Before publishing,** open a save from the previous build with "Open in its version", load
   it, and play on.

If a change can't meet this, it needs another way for those saves to keep playing, explained in
the pull request. "Old saves are lost" isn't acceptable.

## Other rules

- **No game files.** GTA2 belongs to Rockstar Games and Take-Two Interactive. Never commit game
  data, screenshots of it or text copied from it. Players download the freeware themselves.
- **Engine changes go in `port/patches`,** one patch per change, on top of the current series.
- **Co-op must stay in step.** Every player simulates the same game. Anything that affects the
  simulation has to give the same result on every machine.
- **This project is browser only.** We don't take native ports to other platforms; you're welcome
  to keep one in your own fork. Building the browser game on Windows, macOS or Linux is fine.
- **New text on the page** goes through `t()` in English, Spanish and French.
