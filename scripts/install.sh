#!/usr/bin/env bash
# install.sh — deploy Grilles module to Ableton Move via SSH
#
# Usage:
#   ./scripts/install.sh            # deploy to move.local (USB or WiFi)
#   ./scripts/install.sh 192.168.x.x  # deploy to specific IP
#
# Prerequisites:
#   - Move connected via USB-C (move.local) or on same WiFi network
#   - SSH enabled on Move (Settings → System → SSH)
#   - dsp.so built:  ./scripts/build.sh

set -euo pipefail
cd "$(dirname "$0")/.."

MOVE_HOST="${1:-move.local}"
MOVE_USER="root"
MOVE_MODULES_DIR="/data/UserData/schwung/modules"
MODULE_CATEGORY="midi_fx"
MODULE_ID="grids"
DEST="${MOVE_USER}@${MOVE_HOST}:${MOVE_MODULES_DIR}/${MODULE_CATEGORY}/${MODULE_ID}"

DSO="build/aarch64/dsp.so"

# ── Pre-flight checks ────────────────────────────────────────────────────────
if [ ! -f "$DSO" ]; then
    echo "✗ $DSO not found. Run ./scripts/build.sh first."
    exit 1
fi

echo "→ Deploying to ${MOVE_HOST} …"

# ── Create module directory on device ────────────────────────────────────────
ssh "${MOVE_USER}@${MOVE_HOST}" "mkdir -p ${MOVE_MODULES_DIR}/${MODULE_CATEGORY}/${MODULE_ID}"

# ── Copy files ───────────────────────────────────────────────────────────────
scp src/module.json         "${DEST}/module.json"
scp "$DSO"                  "${DEST}/dsp.so"
scp src/ui/ui.js            "${DEST}/ui.js"
scp src/ui/ui_chain.js      "${DEST}/ui_chain.js"

# Font files must sit next to ui.js at the module root
FONT_SRC="/data/UserData/schwung/host"
ssh "${MOVE_USER}@${MOVE_HOST}" \
    "cp ${FONT_SRC}/font.png ${MOVE_MODULES_DIR}/${MODULE_CATEGORY}/${MODULE_ID}/font.png && \
     cp ${FONT_SRC}/font.png.dat ${MOVE_MODULES_DIR}/${MODULE_CATEGORY}/${MODULE_ID}/font.png.dat"

echo ""
echo "✓ Installed to ${MOVE_MODULES_DIR}/${MODULE_CATEGORY}/${MODULE_ID}/"
echo ""
echo "  Restarting Move service to pick up the new module…"
ssh "${MOVE_USER}@${MOVE_HOST}" '/etc/init.d/move restart' || true
echo "  Done. Add Grilles to a MIDI FX slot on the Move."
