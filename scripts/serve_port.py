#!/usr/bin/env python3
"""GTA2 browser port local server (D02).

Usage:
    python3 scripts/serve_port.py [--host 127.0.0.1] [--port 8765] [--preset debug|release] [--dev-data]

Serves build/port/<preset>. With --dev-data it also serves the local extracted
game files from game/ under /gamedata/ so the shell's ?devdata=1 mode can load
them without the folder picker (for automated testing). It refuses to bind
anything but a loopback address when --dev-data is on: the game files must not
leave this machine.
"""
import argparse
import functools
import http.server
import json
import re
import os
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The browser port never needs the original executables or DLLs.
SKIP_SUFFIXES = {'.exe', '.dll', '.m3d', '.ico'}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'}
    game_dir = None

    def translate_path(self, path):
        clean = urllib.parse.unquote(path.split('?', 1)[0].split('#', 1)[0])
        # an archived version (old/<build>/, Saves screen "Open in its version") gets the same game files
        clean = re.sub(r'^/old/[0-9a-f]+/gamedata/', '/gamedata/', clean)
        if self.game_dir and clean.startswith('/gamedata/'):
            rel = clean[len('/gamedata/'):]
            if rel == 'manifest.json':
                return str(ROOT / 'build/port/.gamedata-manifest.json')
            target = (self.game_dir / rel).resolve()
            if self.game_dir in target.parents:
                return str(target)
            return str(self.game_dir / '__denied__')
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main(argv=None):
    ap = argparse.ArgumentParser(description='Serve the GTA2 browser port locally.')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--preset', default='debug', choices=('debug', 'release'))
    ap.add_argument('--dev-data', action='store_true', help='serve game/ at /gamedata/ (loopback only)')
    a = ap.parse_args(argv)

    out = ROOT / 'build/port' / a.preset
    if not (out / 'gta2.js').exists():
        print(f'serve_port: {out}/gta2.js missing; run scripts/build_port.py --preset {a.preset}', file=sys.stderr)
        return 2
    if a.dev_data:
        if a.host not in ('127.0.0.1', 'localhost', '::1'):
            print('serve_port: --dev-data is only allowed on a loopback address', file=sys.stderr)
            return 2
        game = (ROOT / 'game').resolve()
        files = sorted(str(p.relative_to(game)).replace(os.sep, '/') for p in game.rglob('*')
                       if p.is_file() and p.suffix.lower() not in SKIP_SUFFIXES)
        (ROOT / 'build/port/.gamedata-manifest.json').write_text(json.dumps(files))
        Handler.game_dir = game

    handler = functools.partial(Handler, directory=str(out))
    with http.server.ThreadingHTTPServer((a.host, a.port), handler) as httpd:
        print(f'serve_port: http://{a.host}:{a.port}/ ({out}{", dev data" if a.dev_data else ""})')
        httpd.serve_forever()


if __name__ == '__main__':
    sys.exit(main())
