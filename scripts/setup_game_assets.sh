#!/usr/bin/env bash
# Official GTA 2 Freeware Asset Downloader & Extractor for Linux
# Fetches the official 2004 Rockstar Classics GTA 2 freeware installer from the Internet Archive.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DATA="$ROOT_DIR/gta2_game/data"
INSTALLER_URL="https://archive.org/cors/gta2_rockstar-classics/GTA2INSTALLER.exe"
DOWNLOAD_DIR="$ROOT_DIR/gta2_game"
INSTALLER_FILE="$DOWNLOAD_DIR/gta2-installer.exe"

echo "========================================================"
echo " GTA 2 Asset Setup for Linux"
echo " Source: Official 2004 Rockstar Classics Freeware Release"
echo " Archive: $INSTALLER_URL"
echo " Target: $TARGET_DATA"
echo "========================================================"

mkdir -p "$DOWNLOAD_DIR"

if [ -f "$TARGET_DATA/bil.sty" ] && [ -f "$TARGET_DATA/data/audio/wil.raw" ]; then
    echo "Game assets are already present in $TARGET_DATA."
    echo "Ready to play! Launch with: ./run_gta2.sh"
    exit 0
fi

if [ ! -f "$INSTALLER_FILE" ]; then
    echo "Downloading official freeware GTA2 installer (346 MB)..."
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$INSTALLER_FILE" "$INSTALLER_URL"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$INSTALLER_FILE" "$INSTALLER_URL"
    else
        echo "Error: Neither curl nor wget was found. Please install one to download assets."
        exit 1
    fi
fi

echo "Extracting assets into $TARGET_DATA..."
mkdir -p "$TARGET_DATA"

if command -v 7z >/dev/null 2>&1; then
    7z x -y -o"$TARGET_DATA" "$INSTALLER_FILE" >/dev/null
elif command -v unshield >/dev/null 2>&1; then
    unshield -d "$TARGET_DATA" x "$INSTALLER_FILE" >/dev/null
else
    echo "Extracting via python fallback..."
    python3 -c "
import zipfile, os
if zipfile.is_zipfile('$INSTALLER_FILE'):
    with zipfile.ZipFile('$INSTALLER_FILE') as z:
        z.extractall('$TARGET_DATA')
"
fi

# Ensure lowercase audio symlink if needed
if [ -d "$TARGET_DATA/data/Audio" ] && [ ! -d "$TARGET_DATA/data/audio" ]; then
    ln -s "Audio" "$TARGET_DATA/data/audio"
fi

echo "Assets setup complete! Launch the game with:"
echo "  ./run_gta2.sh"
