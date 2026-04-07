# Grilles Module for Schwung

French adaptation of **Grids** for **Ableton Move**, built for **Schwung**.

## Overview

**Grilles** is a chainable MIDI FX module for Schwung. It brings the core idea of Mutable Instruments Grids to Ableton Move as a practical hardware sequencer module: three drum lanes, X/Y pattern morphing, per-lane density control, controlled variation, transport-aware timing, selectable sync behavior, and adjustable loop length.

The module is designed to sit in a Move signal chain, generate MIDI note triggers, and feed any downstream synth, sampler, drum device, or external MIDI target available through Schwung.

Visible module name:

- `Grilles`

Internal module id:

- `grids`

The internal id stays unchanged for compatibility with Schwung deployment paths and existing Move setups.

## Features

Grilles is a chainable MIDI FX module (`midi_fx`) for Schwung.

- 3 trigger lanes: kick, snare, and hat
- X/Y pattern morphing across a topographic drum map
- Independent density control per lane
- Chaos control for pattern variation
- Accent-aware trigger output
- Adjustable sequence length with early loop wrap
- Move transport sync
- Internal free-running sync mode with dedicated BPM
- Configurable output notes for kick, snare, and hat
- Standard Schwung chain parameter UI integration
- Hardware-tested start/stop behavior on Move

## What Makes Grilles Different

Grilles is not just a direct clocked trigger port.

It currently adds several Move-friendly controls on top of the Grids-style pattern engine:

- `Steps` lets you shorten the loop while preserving the beginning of the generated pattern
- `Sync` lets you choose between Move transport tempo and an internal BPM
- output note controls make it easy to retarget the module to different downstream drum layouts

This makes it useful both as a classic 16-step drum source and as a fast repeating phrase generator for shorter loops.

## Prerequisites

- **Schwung** installed on your Ableton Move
- SSH access enabled on Move: `http://move.local/development/ssh`
- A downstream instrument or drum destination to receive Grilles MIDI output

## Installation

### Via Module Store

If Grilles is published in the Schwung Module Store:

1. Launch Schwung on your Move
2. Select **Module Store**
3. Navigate to **MIDI FX**
4. Select **Grilles**
5. Install and load it into a MIDI FX slot

### Manual Installation

Build:

```bash
./scripts/build.sh
```

Install:

```bash
./scripts/install.sh
```

Deploy to a specific IP if needed:

```bash
./scripts/install.sh 192.168.x.x
```

The module installs to:

```text
/data/UserData/schwung/modules/midi_fx/grids
```

## Tutorial

### What Grilles Actually Does

Grilles generates drum trigger notes on three lanes:

- kick
- snare
- hat

Those triggers are sent downstream to whatever instrument, drum rack, sampler, or MIDI target sits after it in the Schwung chain.

### Basic Setup

1. Insert **Grilles** in a chain's MIDI FX slot.
2. Put a drum destination after it in the same chain.
3. Start with these values:
   - `Steps = 16`
   - `Sync = move`
   - `Map X = 0.5`
   - `Map Y = 0.5`
   - `Kick = 0.5`
   - `Snare = 0.5`
   - `Hat = 0.5`
   - `Chaos = 0.0`
4. Press `Play` on Move.

### Important Current Limitation

Grilles currently runs as a `midi_fx` module. On the current Schwung/Move runtime, that means the chain may not fully wake up from transport alone.

In practice:

- `Play` by itself may not start the Grilles sequence immediately
- the sequence usually starts as soon as the chain receives an incoming MIDI note

Reliable workaround:

1. Start playback on Move.
2. Send or play a MIDI note into the chain once.
3. Leave a held note, a simple trigger clip, or some other MIDI activity upstream if you want the chain to stay reliably active.

This is a runtime limitation of the current `midi_fx` integration model, not the intended long-term UX for Grilles.

### First Groove in 30 Seconds

1. Set `Sync = move`.
2. Set `Steps = 16`.
3. Raise `Hat` first until you hear a steady pulse.
4. Raise `Kick` until the groove gets weight.
5. Raise `Snare` more conservatively.
6. Move `Map X` left/right to change the family of pattern.
7. Move `Map Y` up/down to shift the feel.
8. Add a little `Chaos`, then stop before it gets messy.

Good starter values:

- `Map X = 0.50`
- `Map Y = 0.50`
- `Kick = 0.55`
- `Snare = 0.45`
- `Hat = 0.65`
- `Chaos = 0.08`
- `Steps = 16`

### How to Listen to the Main Controls

- `Map X`: changes which groove family you are in.
- `Map Y`: changes the contour and feel of the pattern.
- `Kick`: increases or reduces bass drum presence.
- `Snare`: controls backbeat density and fills.
- `Hat`: controls motion and perceived speed.
- `Chaos`: adds variation and instability.
- `Steps`: shortens the loop without changing the beginning of the phrase.

### Practical Workflows

#### Classic Drum Loop

1. Keep `Steps = 16`.
2. Keep `Chaos` low.
3. Find a kick pattern with `Map X/Y`.
4. Add snare until the backbeat sits correctly.
5. Use hat density to create movement.

#### Tight Repeating Phrase

1. Find a good 16-step groove first.
2. Reduce `Steps` to `12`, `8`, or `4`.
3. Rebalance densities after shortening the loop.

#### More Animated Pattern

1. Start from a stable groove.
2. Increase `Hat`.
3. Add a little `Chaos`.
4. Sweep `Map X` slowly while the loop plays.

### Output Note Mapping

If your downstream instrument does not respond correctly, check:

- `kick_note`
- `snare_note`
- `hat_note`

Defaults are standard GM-style drum notes:

- `kick_note = 36`
- `snare_note = 38`
- `hat_note = 42`

## Parameters

In the Schwung chain UI, parameters are organized on a single editable page.

### Pattern

These parameters shape the generated drum pattern itself.

| Parameter | What it does |
|---|---|
| `map_x` | Moves horizontally across the pattern map. |
| `map_y` | Moves vertically across the pattern map. |
| `density_kick` | Sets kick lane density. |
| `density_snare` | Sets snare lane density. |
| `density_hat` | Sets hat lane density. |
| `randomness` | Adds controlled pattern variation and perturbation. |

### Loop

These parameters define how the generated pattern cycles.

| Parameter | What it does |
|---|---|
| `steps` | Sets loop length from `1` to `32`. Default is `16`. The module preserves the beginning of the pattern and wraps early. |

### Sync

These parameters define timing behavior.

| Parameter | What it does |
|---|---|
| `sync` | Chooses timing source: `move` or `internal`. |
| `bpm` | Sets internal tempo (`40-240`) when `sync=internal`. |

### Output Notes

These parameters define which MIDI notes Grilles sends downstream.

| Parameter | What it does |
|---|---|
| `kick_note` | MIDI note number for kick triggers. |
| `snare_note` | MIDI note number for snare triggers. |
| `hat_note` | MIDI note number for hat triggers. |

## Timing Behavior

### `Sync = move`

In Move sync mode:

- Grilles follows the Move transport
- timing follows the current Move BPM
- `Stop` stops it
- on the current runtime, the chain may still need an incoming MIDI note to wake up the `midi_fx` slot

### `Sync = internal`

In internal mode:

- Grilles runs freely inside the module
- timing is based on the module's `BPM` parameter
- useful for independent looping behavior

## Sequence Length Behavior

The `Steps` parameter shortens the loop by forcing an earlier wrap.

Examples:

- `Steps = 16` gives a classic 16-step loop
- `Steps = 12` loops the first 12 generated steps
- `Steps = 8` loops the first 8 generated steps
- `Steps = 4` creates a tight repeating phrase from the front of the pattern

This preserves the feel of the generated pattern while making it musically easier to lock into shorter loops.

## Output Behavior

Grilles emits MIDI note triggers for three lanes:

- kick
- snare
- hat

Each lane sends note-on plus scheduled note-off messages with non-zero duration so downstream instruments behave correctly.

Output note mapping is user-configurable through:

- `kick_note`
- `snare_note`
- `hat_note`

## Building from Source

### Docker Build

```bash
./scripts/build.sh
```

This produces:

```text
build/aarch64/dsp.so
```

### Native Cross-Compiler Build

If a native aarch64 cross-compiler is available:

```bash
./scripts/build.sh native
```

## Local Tests

Pattern engine test:

```bash
make test
```

MIDI FX wrapper test:

```bash
make test-midi-fx
```

These tests validate:

- pattern generation
- deterministic wrapping
- MIDI note-on/note-off scheduling

## Project Structure

```text
src/
  dsp/
    grids_engine.c
    grids_engine.h
    grids_tables.c
    grids_tables.h
  host/
    grids_plugin.c
    midi_fx_api_v1.h
    plugin_api_v1.h
  module.json

scripts/
  build.sh
  install.sh

tests/
  grids_test.c
  grids_midi_fx_test.c

docs/
  PORTING_NOTES.md
  LICENSE_NOTES.md
```

## Technical Notes

Grilles uses the Schwung MIDI FX ABI:

- `api_version: 1`
- entry point: `move_midi_fx_init`

The implementation is intentionally separated into:

- a portable DSP engine in `src/dsp/`
- a Schwung/Move wrapper in `src/host/`
- module metadata in `src/module.json`

## Limitations

Current limitations and intentional differences from original Mutable Instruments Grids:

- pattern tables are clean-room approximations, not the original MI tables
- generated results are musically Grids-like, but not bit-identical
- randomness implementation differs from the original firmware
- some low-level timing and internal behavior are adapted for Move and Schwung
- as a `midi_fx` module, Grilles may require incoming MIDI activity before the sequence starts, even when Move transport is already running

For deeper implementation details, see:

- [docs/PORTING_NOTES.md](/Users/supervie/Documents/thedude/Code/move-grids/docs/PORTING_NOTES.md)
- [docs/LICENSE_NOTES.md](/Users/supervie/Documents/thedude/Code/move-grids/docs/LICENSE_NOTES.md)

## Troubleshooting

### No output

- Verify Grilles is loaded in a MIDI FX slot
- Verify a downstream instrument is present in the chain
- Check that `Kick`, `Snare`, and `Hat` densities are not too low
- Check output note numbers match the downstream target
- If `Sync = move`, verify the Move transport is running
- In `Sync = move`, send or play one MIDI note into the chain to wake the MIDI FX path
- If `Sync = internal`, verify `BPM` is set and the module is active

### Sequence only starts after playing a note

- This is the current expected limitation of running Grilles as `midi_fx`
- Press `Play`, then send one MIDI note into the chain
- If needed, keep a held note or simple upstream trigger source active
- If you need true transport-only autonomous startup, Grilles would need a different module architecture than the current `midi_fx` slot

### Sequence does not stop

- In `move` sync mode, Grilles should follow Move transport
- Remove and re-add the module after updates if behavior looks stale

### Pattern loops too long

- Lower `Steps` to force an earlier wrap

### Pattern is too static

- Change `Map X` / `Map Y`
- Increase one or more density values
- Add `Chaos`

## Attribution

Grilles is inspired by:

- **Mutable Instruments Grids** by **Emilie Gillet**

This repository does not copy the original Mutable Instruments pattern engine verbatim. The current implementation follows a documented clean-room approach.

## Credits

- Schwung framework and host APIs: Charles Vestal and contributors
- Original Grids concept: Mutable Instruments / Emilie Gillet
- Grilles port and Move adaptation: this project

## AI Assistance Disclaimer

This module was developed with AI assistance, including Claude, Codex, and other AI assistants.

All architecture, implementation, testing, and release decisions should still be reviewed by a human maintainer. AI-assisted content may contain errors, so functionality, security, and license compatibility should be validated before public distribution.

## License

Project-specific licensing and attribution notes are tracked in:

- [docs/LICENSE_NOTES.md](/Users/supervie/Documents/thedude/Code/move-grids/docs/LICENSE_NOTES.md)

If you plan to publish binaries or redistribute the project, review those notes first.
