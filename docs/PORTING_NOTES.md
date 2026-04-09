# Porting Notes: Grids → Move

## Overview
This document tracks the porting process of the Mutable Instruments Grids drum-pattern engine to Ableton Move via Schwung.

## Musical Behavior Checklist
- [x] 3 drum lanes implemented (kick, snare, hi-hat)
- [x] X/Y map interpolation working (bilinear, 5×5 nodes)
- [x] Density per lane functional (threshold comparison)
- [x] Randomness/perturbation system (signed jitter, LCG)
- [x] Clocked step advancement (0..31, wraps on tick)
- [x] Trigger/accent outputs produced
- [x] Schwung MIDI FX wrapper (`src/host/grids_plugin.c`, `move_midi_fx_init` entry)
- [x] module.json in real Schwung schema (capabilities / ui_hierarchy)
- [x] Move UI / parameter binding for X/Y, densities, chaos
- [x] Configurable kick/snare/hat output notes from Move UI
- [x] Non-zero MIDI note duration (scheduled note-offs)
- [x] Internal clock synced to Move transport tempo via host BPM query
- [x] Sync mode switch: Move transport tempo or free-running internal BPM
- [x] Adjustable sequence length (`Steps`) with early loop wrap

## Architectural Decisions
- **Algorithm Isolation**: DSP logic lives entirely in `src/dsp/grids_engine.{h,c}` and `src/dsp/grids_tables.{h,c}`. No Schwung or Move headers included.
- **UI Separation**: No UI logic in DSP code. The Schwung host will call `grids_set_*` and `grids_tick()`.
- **Incremental Development**: Engine layer complete and independently testable before Schwung integration.
- **Pattern Tables**: Clean-room 5×5×3 table (2 400 bytes) derived from documented Grids musical behaviour, not copied from MI source. See `docs/LICENSE_NOTES.md`.

## Version Log
| Date       | Component      | Changes                                         | Status   |
|------------|----------------|-------------------------------------------------|----------|
| 2026-04-01 | `src/dsp/`     | Initial engine layer: tables + algorithm        | Complete |
| 2026-04-01 | `src/host/`    | Rewritten for Schwung MIDI FX ABI v1 (`move_midi_fx_init`) | Complete |
| 2026-04-01 | `src/module.json` | MIDI FX schema + editable output notes      | Complete |
| 2026-04-01 | `src/ui/ui.js` | Added note focus/edit UI + dynamic trigger flash tracking | Complete |
| 2026-04-02 | `src/host/` + `src/ui/ui.js` | Added cached 32-step live preview in `grid_view`, driven from current engine params | Complete |
| 2026-04-02 | `src/host/` + `src/module.json` | Trialed standard Schwung UI preview exposure for `midi_fx`, then removed it pending a better UX direction | Complete |
| 2026-04-09 | `src/host/grids_plugin.c` | Wire `current_bpm()` to `g_host->get_bpm()`; respect `get_clock_status()` in move-sync mode; add `sync_mode`/`internal_bpm` fields | Complete |
| 2026-04-09 | `src/module.json` | Add `sync` (int 0–1) and `bpm` (float 40–240) to `chain_params` and `ui_hierarchy` | Complete |
| 2026-04-09 | `src/ui/ui.js` | Define `STEP_FOCUS` constant (was undefined → ReferenceError); add `sync`/`bpm` to `PARAM_DEFAULTS`; show sync mode on display | Complete |
| 2026-04-09 | `scripts/install.sh` | Fix install path: `move-anything/modules` → `schwung/modules` | Complete |
| 2026-04-09 | `src/module.json`, `release.json` | Bump version to `0.2.0`; add test step to CI release workflow | Complete |
| 2026-04-09 | `src/ui/ui.js` | Use shared `setLED` (correct type byte); fix track button mapping (CC43=leftmost); use `decodeAcceleratedDelta` for integer params | Complete |
| 2026-04-09 | `src/ui/ui_chain.js` | Add chain UI shim (compact 6-param view for signal chain context) | Complete |

## Known Deviations from Original Grids

| # | Topic             | Original behaviour             | This implementation                                    | Impact                   |
|---|-------------------|--------------------------------|--------------------------------------------------------|--------------------------|
| 1 | Pattern tables    | MI proprietary lookup tables   | Clean-room approximations (musical intent preserved)   | Patterns differ in detail |
| 2 | RNG               | 8-bit LFSR                     | 32-bit LCG (Knuth constants)                           | Different noise texture   |
| 3 | x_frac range      | Exact 0–255                    | 0–252 (`(x & 63) << 2`); ~1.2 % under-shoot at edge   | Negligible               |
| 4 | Accent evaluation | Separate internal path         | Evaluated before perturbation, cancelled if no trigger | Functionally equivalent  |
| 5 | Perturbation sign | Unsigned addition (may wrap)   | Signed ±jitter, clamped to 0–255                       | More musical at extremes |
| 6 | hdavid Max port   | JavaScript, Max/MSP             | Not referenced; clean-room C from documented behaviour | No Max dependency        |

## Known Constraints
- Schwung MIDI FX modules use `api_version: 1` with `move_midi_fx_init`
- Module discovery from runtime modules folder
- Keep module.json under documented size limits
- Target: aarch64-linux (Ableton Move)

## Next Steps
- [x] Standalone C test harness (`tests/grids_test.c`) — patterns verified
- [x] Schwung DSP wrapper against real `midi_fx_api_v1_t`
- [x] `module.json` with real schema (capabilities / ui_hierarchy / knobs)
- [ ] `make aarch64` — requires aarch64-linux-gnu cross-compiler toolchain
- [ ] Deploy: copy `src/` + `build/aarch64/dsp.so` to Move modules folder
- [x] Wire Move UI via `ui.js`
- [ ] Test on Move hardware: confirm scheduled note-offs are audible through downstream instruments
