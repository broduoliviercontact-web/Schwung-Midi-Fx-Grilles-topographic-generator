#!/usr/bin/env bash
# package.sh — package Grilles module for Schwung custom module release
#
# Usage:
#   ./scripts/package.sh
#
# Output: dist/grids-module.tar.gz

set -euo pipefail
cd "$(dirname "$0")/.."

# Prevent macOS tar metadata files (._*, GNUSparseFile) from leaking into archives.
export COPYFILE_DISABLE=1
export COPY_EXTENDED_ATTRIBUTES_DISABLE=1

MODULE_JSON="src/module.json"

ID=$(python3 -c "import json,sys; d=json.load(open('${MODULE_JSON}')); print(d['id'])")
VERSION=$(python3 -c "import json,sys; d=json.load(open('${MODULE_JSON}')); print(d['version'])")

echo "→ Packaging ${ID} v${VERSION}"

DSO="build/aarch64/dsp.so"
UI="src/ui/ui.js"
UI_CHAIN="src/ui/ui_chain.js"
DIST="dist"
STAGE="${DIST}/${ID}"

if [ ! -f "${DSO}" ]; then
    echo "✗ ${DSO} not found. Run ./scripts/build.sh first."
    exit 1
fi
if [ ! -f "${UI}" ]; then
    echo "✗ ${UI} not found."
    exit 1
fi
if [ ! -f "${UI_CHAIN}" ]; then
    echo "✗ ${UI_CHAIN} not found."
    exit 1
fi

rm -rf "${STAGE}"
mkdir -p "${STAGE}"

cp "${MODULE_JSON}" "${STAGE}/module.json"
# Use dd to strip macOS sparse-file metadata (prevents GNUSparseFile.0/ on Linux)
dd if="${DSO}" of="${STAGE}/dsp.so" bs=1 2>/dev/null
cp "${UI}"       "${STAGE}/ui.js"
cp "${UI_CHAIN}" "${STAGE}/ui_chain.js"

find "${STAGE}" \( -name '.DS_Store' -o -name '._*' \) -delete

TARBALL="${DIST}/${ID}-module.tar.gz"

# Use GNU tar if available, else bsdtar with --no-xattrs
if command -v gtar &>/dev/null; then
    gtar -C "${DIST}" -czf "${TARBALL}" "${ID}"
else
    tar --no-xattrs -C "${DIST}" -czf "${TARBALL}" "${ID}"
fi

echo "✓ ${TARBALL}"
echo "Contents:"
tar -tzf "${TARBALL}"
echo "DSP symbol check:"
tar -xOf "${TARBALL}" "${ID}/dsp.so" | strings | grep 'move_midi_fx_init' || echo "WARNING: move_midi_fx_init not found!"
echo "Sparse check:"
tar -tzf "${TARBALL}" | grep -i sparse || echo "No sparse entries — clean!"
