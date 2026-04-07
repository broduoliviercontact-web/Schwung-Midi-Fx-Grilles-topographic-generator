#!/usr/bin/env bash
# package.sh — package Grilles module for Schwung custom module release
#
# Usage:
#   ./scripts/package.sh
#
# Output: dist/grids-module.tar.gz

set -euo pipefail
cd "$(dirname "$0")/.."

MODULE_JSON="src/module.json"

# Read id and version from module.json
if ! command -v python3 &>/dev/null; then
    echo "✗ python3 required to parse module.json"
    exit 1
fi

ID=$(python3 -c "import json,sys; d=json.load(open('${MODULE_JSON}')); print(d['id'])")
VERSION=$(python3 -c "import json,sys; d=json.load(open('${MODULE_JSON}')); print(d['version'])")

echo "→ Packaging ${ID} v${VERSION}"

DSO="build/aarch64/dsp.so"
UI="src/ui/ui.js"
DIST="dist"
STAGE="${DIST}/${ID}"

# Pre-flight checks
if [ ! -f "${DSO}" ]; then
    echo "✗ ${DSO} not found. Run ./scripts/build.sh first."
    exit 1
fi

if [ ! -f "${UI}" ]; then
    echo "✗ ${UI} not found."
    exit 1
fi

# Stage
rm -rf "${STAGE}"
mkdir -p "${STAGE}"

cp "${MODULE_JSON}"  "${STAGE}/module.json"
cp "${DSO}"          "${STAGE}/dsp.so"
cp "${UI}"           "${STAGE}/ui.js"

# Pack — always under <id>/ at tarball root
TARBALL="${DIST}/${ID}-module.tar.gz"
tar -C "${DIST}" -czf "${TARBALL}" "${ID}"

echo "✓ ${TARBALL}"
echo ""
echo "Verify contents:"
echo "  tar -tzf ${TARBALL}"
