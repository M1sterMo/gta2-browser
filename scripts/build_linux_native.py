#!/usr/bin/env python3
"""Build script for GTA 2 Native Linux ELF Binary."""
import os
import sys
import subprocess
import concurrent.futures
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'research/port-work/core'
ALIASES = ROOT / 'build/port/case-aliases'
OUT = ROOT / 'build/linux_native'
OBJ_DIR = OUT / 'obj'

CXX = 'g++'

COMMON_FLAGS = [
    '-std=gnu++17',
    '-fpermissive',
    '-fshort-wchar',
    '-mms-bitfields',
    '-fms-extensions',
    '-w',
    '-O2',
    '-DGTA2_PORT=1',
    '-D_CRT_SECURE_NO_WARNINGS',
    '-fno-builtin-wcslen',
]

INCLUDES = [
    '-include', str(ROOT / 'port/core/compat/port_prefix.h'),
    '-I', str(ROOT / 'port/core/compat'),
    '-I', str(ROOT / 'port'),
    '-I', str(ROOT / 'port/native_linux'),
    '-I', str(CORE / 'Source'),
    '-I', str(CORE),
    '-I', str(ALIASES),
]

LINK_FLAGS = [
    '-lSDL2',
    '-lGL',
    '-lpthread',
    '-ldl',
]

def compile_file(job):
    src, obj = job
    obj.parent.mkdir(parents=True, exist_ok=True)
    if obj.exists() and obj.stat().st_mtime > src.stat().st_mtime:
        return src, 0, ''
    cmd = [CXX, *COMMON_FLAGS, *INCLUDES, '-c', str(src), '-o', str(obj)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return src, res.returncode, res.stderr

def main():
    OBJ_DIR.mkdir(parents=True, exist_ok=True)
    jobs = []

    # 1. Core game sources
    for rel in (ROOT / 'port/core/sources.txt').read_text().split():
        src = CORE / rel
        obj = OBJ_DIR / 'core' / (Path(rel).stem + '.o')
        jobs.append((src, obj))

    # 2. Port platform sources
    for src in sorted((ROOT / 'port/platform').glob('*.cpp')):
        if src.name == 'main_web.cpp':
            continue # Use main_sdl.cpp instead
        obj = OBJ_DIR / 'platform' / (src.stem + '.o')
        jobs.append((src, obj))

    # 3. Port render sources
    for src in sorted((ROOT / 'port/render').glob('*.cpp')):
        obj = OBJ_DIR / 'render' / (src.stem + '.o')
        jobs.append((src, obj))

    # 4. Port audio sources
    for src in sorted((ROOT / 'port/audio').glob('*.cpp')):
        obj = OBJ_DIR / 'audio' / (src.stem + '.o')
        jobs.append((src, obj))

    # 5. Native Linux platform & renderer
    for src in sorted((ROOT / 'port/native_linux').glob('*.cpp')):
        obj = OBJ_DIR / 'native' / (src.stem + '.o')
        jobs.append((src, obj))

    print(f"Compiling {len(jobs)} translation units with {os.cpu_count()} threads...")
    failed = []
    with concurrent.futures.ThreadPoolExecutor(os.cpu_count()) as ex:
        for src, rc, err in ex.map(compile_file, jobs):
            if rc != 0:
                failed.append((src, err))

    if failed:
        print(f"FAILED: {len(failed)} files failed to compile!")
        for src, err in failed:
            print(f"\n--- {src} ---:\n{err[:500]}")
        return 1

    print("All translation units compiled successfully!")

    # Link ELF binary
    target = OUT / 'gta2_linux'
    objs = [str(obj) for _, obj in jobs]
    print(f"Linking {target} ({len(objs)} object files)...")

    link_cmd = [CXX, '-no-pie', '-O2', *objs, '-o', str(target), *LINK_FLAGS]
    res = subprocess.run(link_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"LINK FAILED:\n{res.stderr}")
        return 1

    print(f"SUCCESS: {target} built successfully!")
    return 0

if __name__ == '__main__':
    sys.exit(main())
