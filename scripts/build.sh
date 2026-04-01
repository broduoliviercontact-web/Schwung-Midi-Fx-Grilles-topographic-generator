#!/usr/bin/env bash
# build.sh — cross-compile dsp.so for aarch64-linux (Ableton Move)
#
# Usage:
#   ./scripts/build.sh           # auto-detect Docker or native cross-compiler
#   ./scripts/build.sh docker    # force Docker
#   ./scripts/build.sh native    # force native cross-compiler
#
# Output: build/aarch64/dsp.so

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-auto}"

# ── Docker path ─────────────────────────────────────────────────────────────
build_docker() {
    echo "→ Building with Docker..."
    docker build -f scripts/Dockerfile -t grids-builder .
    # Extract dsp.so from the container
    mkdir -p build/aarch64
    docker run --rm -v "$(pwd)/build/aarch64:/out" grids-builder \
        cp /build/build/aarch64/dsp.so /out/dsp.so
    echo "✓ build/aarch64/dsp.so"
}

# ── Native cross-compiler path ───────────────────────────────────────────────
build_native() {
    echo "→ Building with native cross-compiler..."

    # Try the standard Linux cross-compiler first
    if command -v aarch64-linux-gnu-gcc &>/dev/null; then
        CC_CROSS=aarch64-linux-gnu-gcc
    # Homebrew musl-cross (macOS)
    elif command -v aarch64-linux-musl-gcc &>/dev/null; then
        CC_CROSS=aarch64-linux-musl-gcc
    else
        echo ""
        echo "✗ No aarch64 cross-compiler found."
        echo ""
        echo "  Install one of:"
        echo "    Docker Desktop (recommended):"
        echo "      https://docs.docker.com/desktop/install/mac-install/"
        echo ""
        echo "    musl-cross via Homebrew (slower to install, no Docker needed):"
        echo "      brew install FiloSottile/musl-cross/musl-cross"
        echo ""
        exit 1
    fi

    make aarch64 CC_CROSS="$CC_CROSS"
    echo "✓ build/aarch64/dsp.so"
}

# ── Auto-detect ──────────────────────────────────────────────────────────────
case "$MODE" in
    docker)
        build_docker ;;
    native)
        build_native ;;
    auto)
        if command -v docker &>/dev/null; then
            build_docker
        else
            build_native
        fi ;;
    *)
        echo "Usage: $0 [docker|native|auto]"; exit 1 ;;
esac
