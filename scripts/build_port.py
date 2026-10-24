#!/usr/bin/env python3
"""GTA2 browser port build entry point (D02).

Usage:
    python3 scripts/build_port.py --preset debug|release [--prepare] [--jobs N]

--prepare recreates research/port-work/core from the pristine upstream checkout
(research/gta2_re at the pinned revision) plus port/patches/*.patch.

Compiles the gta2_re sources listed in port/core/sources.txt and the port's own
C++ (port/platform, port/render, port/audio) to wasm32 with Emscripten, then
links build/port/<preset>/gta2.{js,wasm} and copies the web shell from web/.
"""
import argparse
import concurrent.futures
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / 'research/gta2_re'
CORE = ROOT / 'research/port-work/core'
PIN = '02de8beeb766644417f195d360eba33af0ee491f'
EMSDK = ROOT / 'research/toolchains/emsdk/upstream/emscripten'
EMXX = EMSDK / 'em++'
PRESETS = ('debug', 'release')
CASE_ALIASES = ROOT / 'build/port/case-aliases'
INCLUDE_RE = re.compile(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', re.MULTILINE)
SOURCE_SUFFIXES = {'.c', '.cpp', '.h', '.hpp'}

COMMON = [
    '-std=gnu++17', '-fshort-wchar', '-mms-bitfields', '-fno-strict-return', '-fms-extensions', '-fdeclspec', '-w',
    '-Wno-c++11-narrowing', '-Wno-address-of-temporary', '-Wno-dynamic-exception-spec',
    '-DGTA2_PORT=1', '-D_CRT_SECURE_NO_WARNINGS',
    # LLVM turns "count until 0" loops into wcslen calls, and the C library's wcslen counts 4-byte
    # characters while -fshort-wchar makes them 2: gta2_wcslen itself became a call to it, so every
    # wide string measured half its length (cheat names never matched, issue #1).
    '-fno-builtin-wcslen',
]
GAME_ONLY = [
    '-include', str(ROOT / 'port/core/compat/port_prefix.h'),
    '-I', str(ROOT / 'port/core/compat'), '-I', str(CORE / 'Source'), '-I', str(CORE),
    '-I', str(CASE_ALIASES),
]
INCLUDE_DIRS = (ROOT / 'port/core/compat', CORE / 'Source', CORE, ROOT / 'port')
PORT_ONLY = GAME_ONLY + ['-I', str(ROOT / 'port')]
OPT = {'debug': ['-O1', '-g'], 'release': ['-O2']}
LINK = [
    '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=128MB', '-sSTACK_SIZE=4MB',
    '-sENVIRONMENT=web', '-sEXIT_RUNTIME=0', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
    '-sEXPORT_NAME=createGta2', '-sFORCE_FILESYSTEM=1',
    '-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAPU16,HEAP32,HEAPF32,HEAPF64,ccall,cwrap',
    '-sEXPORTED_FUNCTIONS=_main,_malloc,_free,_gta2_start,_gta2_port_key,_gta2_port_mouse_move,_gta2_port_mouse_button,_gta2_port_release_all_keys,_gta2_port_reg_set_dword,_gta2_port_reg_set_string,_gta2_port_reg_export,_gta2_port_set_language,_gta2_port_input_stats,_gta2_dev_state,_gta2_dev_spawn_car,_gta2_dev_add_cash,_gta2_dev_give_weapon,_gta2_port_set_view_width,_gta2_dev_camera,_gta2_port_set_activation_margin,_gta2_port_set_camera,_gta2_dev_teleport,_gta2_dev_find_road,_gta2_port_map_state,_gta2_port_map_render_rows,_gta2_port_set_paused,_gta2_port_map_objects,_gta2_dev_object_models,_gta2_port_map_triggers,_gta2_port_map_gangs,_gta2_port_map_arrows,_gta2_port_set_hud_arrows,_gta2_port_sprite_rgba,_gta2_port_set_hud_edges,_gta2_dev_unlock_areas,_gta2_dev_set_respect,_gta2_dev_spawn_truck,_gta2_dev_truck_state,_gta2_port_set_interpolation,_gta2_dev_drawn_camera,_gta2_port_net_configure,_gta2_port_net_set_name,_gta2_port_net_receive,_gta2_port_net_peer_left,_gta2_port_net_set_map,_gta2_port_run_slice,_gta2_port_net_debug,_gta2_dev_sync_state,_gta2_dev_sync_history,_gta2_dev_sync_dump,_gta2_dev_sync_peds,_gta2_port_coop_players,_gta2_port_take_frame_ms,_gta2_port_set_friendly_fire,_gta2_port_net_set_rules,_gta2_port_set_player_team,_gta2_dev_test_friendly_fire,_gta2_dev_gang_respect,_gta2_port_set_ride_together,_gta2_dev_seat_player_driver,_gta2_dev_car_occupants,_gta2_dev_ride_check,_gta2_dev_ped_entry,_gta2_port_savestate_can_save,_gta2_port_savestate_prepare,_gta2_port_savestate_reserve,_gta2_port_savestate_restored,_gta2_port_savestate_label,_gta2_port_savestate_rules,_gta2_port_savestate_pay,_gta2_port_job_briefs,_gta2_port_reload_controls',
]


def prepare():
    if CORE.exists():
        shutil.rmtree(CORE)
    CORE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'clone', '-q', '--shared', str(UPSTREAM), str(CORE)], check=True)
    subprocess.run(['git', '-C', str(CORE), 'checkout', '-q', '-b', 'browser-port', PIN], check=True)
    patches = sorted((ROOT / 'port/patches').glob('*.patch'))
    if patches:
        subprocess.run(['git', '-C', str(CORE), '-c', 'user.name=GTA2 port', '-c', 'user.email=port@localhost',
                        'am', '-q', *map(str, patches)], check=True)
    print(f'prepared {CORE} with {len(patches)} patches')


def source_files(root):
    for path in root.rglob('*'):
        if '.git' not in path.parts and path.suffix.lower() in SOURCE_SUFFIXES and path.is_file():
            yield path


def make_case_aliases():
    """Symlinks for #include names that differ only in case from the file on disk.

    The sources were written on case-insensitive filesystems (Windows, macOS), so on
    Linux `#include "Fix16.hpp"` misses `fix16.hpp`. Elsewhere no alias is created.
    """
    shutil.rmtree(CASE_ALIASES, ignore_errors=True)
    by_lower_name = {}
    for root in INCLUDE_DIRS:
        for path in source_files(root):
            by_lower_name.setdefault(path.relative_to(root).as_posix().lower(), path)

    created = 0
    for root in INCLUDE_DIRS:
        for src in source_files(root):
            for name in INCLUDE_RE.findall(src.read_text(errors='replace')):
                name = name.replace('\\', '/')
                search = (src.parent, *INCLUDE_DIRS)
                target = by_lower_name.get(name.lower())
                if target is None or any((d / name).exists() for d in search):
                    continue
                alias = CASE_ALIASES / name
                alias.parent.mkdir(parents=True, exist_ok=True)
                if not alias.is_symlink():
                    alias.symlink_to(target)
                    created += 1
    if created:
        print(f'build_port: {created} case-insensitive include aliases in {CASE_ALIASES}')


def up_to_date(obj, dep, flags_file, flags):
    """True when obj is newer than every input recorded in its depfile and the flags match."""
    if os.environ.get('GTA2_FORCE') or not (obj.exists() and dep.exists() and flags_file.exists()):
        return False
    if flags_file.read_text() != '\n'.join(flags):
        return False
    built = obj.stat().st_mtime
    text = dep.read_text().replace('\\\n', ' ')
    inputs = text.split(':', 1)[1] if ':' in text else ''
    for path in inputs.replace('\\ ', '\0').split():
        path = path.replace('\0', ' ')
        if not os.path.exists(path) or os.stat(path).st_mtime > built:
            return False
    return True


def compile_one(args):
    src, obj, flags = args
    dep, flags_file = obj.with_suffix('.d'), obj.with_suffix('.flags')
    if up_to_date(obj, dep, flags_file, flags):
        return src, 0, ''
    obj.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([str(EMXX), *flags, '-MMD', '-MF', str(dep), '-c', str(src), '-o', str(obj)],
                       capture_output=True, text=True)
    if r.returncode == 0:
        flags_file.write_text('\n'.join(flags))
    return src, r.returncode, r.stderr


def main(argv=None):
    ap = argparse.ArgumentParser(description='Build the GTA2 browser port.')
    ap.add_argument('--preset', required=True, choices=PRESETS)
    ap.add_argument('--prepare', action='store_true')
    ap.add_argument('--jobs', type=int, default=os.cpu_count())
    a = ap.parse_args(argv)
    if a.prepare or not CORE.exists():
        prepare()
    make_case_aliases()

    out = ROOT / 'build/port' / a.preset
    jobs = []
    for rel in (ROOT / 'port/core/sources.txt').read_text().split():
        jobs.append((CORE / rel, out / 'obj/game' / (Path(rel).stem + '.o'), COMMON + OPT[a.preset] + GAME_ONLY))
    for sub in ('platform', 'render', 'audio', 'net'):
        for src in sorted((ROOT / 'port' / sub).glob('*.cpp')):
            jobs.append((src, out / 'obj' / sub / (src.stem + '.o'), COMMON + OPT[a.preset] + PORT_ONLY))

    failed = []
    with concurrent.futures.ThreadPoolExecutor(a.jobs) as ex:
        for src, rc, err in ex.map(compile_one, jobs):
            if rc:
                failed.append(src)
                print(err, file=sys.stderr)
    if failed:
        print(f'build_port: {len(failed)} files failed to compile', file=sys.stderr)
        return 1

    objs = [str(j[1]) for j in jobs]
    rsp = out / 'objects.rsp'
    rsp.write_text('\n'.join(f'"{o}"' for o in objs))
    link = [str(EMXX), *OPT[a.preset], *LINK, f'@{rsp}', '-o', str(out / 'gta2.js')]
    if os.environ.get('GTA2_ALLOW_UNDEFINED'):
        link.append('-sERROR_ON_UNDEFINED_SYMBOLS=0')
    r = subprocess.run(link, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr, file=sys.stderr)
        print('build_port: link failed', file=sys.stderr)
        return 1
    if (ROOT / 'web').is_dir():
        for f in (ROOT / 'web').iterdir():
            if f.is_file():
                shutil.copy2(f, out / f.name)
            elif f.is_dir():
                shutil.copytree(f, out / f.name, dirs_exist_ok=True)
    # unshield (WebAssembly) for unpacking the freeware installer in the browser
    unshield = ROOT / 'build/unshield'
    if not (unshield / 'unshield.wasm').exists():
        subprocess.run(['sh', str(ROOT / 'scripts/build_unshield_wasm.sh')], check=True)
    for name in ('unshield.js', 'unshield.wasm', 'unshield-LICENSE.txt'):
        shutil.copy2(unshield / name, out / name)
    print(f'build_port: {out / "gta2.js"} ({len(objs)} objects)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
