# Makefile — Grids Schwung module
#
# Targets:
#   make native    build dsp.so for the host machine (quick smoke test)
#   make aarch64   cross-compile dsp.so for Ableton Move (aarch64-linux-gnu)
#   make test      build and run the standalone pattern-dump test
#   make clean     remove build artefacts
#
# Cross-compiler: aarch64-linux-gnu-gcc must be on PATH.
# Adjust CC_CROSS if your toolchain prefix differs.
#
# Output naming matches module.json:  "dsp": "dsp.so"
# Entry point:  move_midi_fx_init   (the only dlsym'd symbol)

CC_NATIVE  := gcc
CC_CROSS   := aarch64-linux-gnu-gcc
CFLAGS     := -std=c99 -Wall -Wextra -O2 -fPIC \
              -Isrc/dsp -Isrc/host

DSP_SRCS   := src/dsp/grids_engine.c \
              src/dsp/grids_tables.c
HOST_SRCS  := src/host/grids_plugin.c
ALL_SRCS   := $(DSP_SRCS) $(HOST_SRCS)

# ---- native dsp.so (for host-side smoke testing) ---------------------------

.PHONY: native
native: build/native/dsp.so

build/native/dsp.so: $(ALL_SRCS) | build/native
	$(CC_NATIVE) $(CFLAGS) -shared -o $@ $(ALL_SRCS)

build/native:
	mkdir -p build/native

# ---- aarch64 dsp.so (deploy to Move) ----------------------------------------

.PHONY: aarch64
aarch64: build/aarch64/dsp.so

build/aarch64/dsp.so: $(ALL_SRCS) | build/aarch64
	$(CC_CROSS) $(CFLAGS) -shared -o $@ $(ALL_SRCS)

build/aarch64:
	mkdir -p build/aarch64

# ---- standalone pattern-dump test (no Schwung required) --------------------

.PHONY: test
test: build/native/grids_test
	build/native/grids_test

.PHONY: test-midi-fx
test-midi-fx: build/native/grids_midi_fx_test
	build/native/grids_midi_fx_test

build/native/grids_test: tests/grids_test.c $(DSP_SRCS) | build/native
	$(CC_NATIVE) $(CFLAGS) -o $@ $^

build/native/grids_midi_fx_test: tests/grids_midi_fx_test.c $(ALL_SRCS) | build/native
	$(CC_NATIVE) $(CFLAGS) -o $@ $^

# ---- verify entry point is exported ----------------------------------------

.PHONY: check-symbols
check-symbols: build/native/dsp.so
	@nm $< | grep move_midi_fx_init \
	  && echo "OK: move_midi_fx_init exported" \
	  || echo "FAIL: entry point not found"

# ---- clean ------------------------------------------------------------------

.PHONY: clean
clean:
	rm -rf build
