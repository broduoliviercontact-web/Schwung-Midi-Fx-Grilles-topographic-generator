# License & Attribution Notes

## Purpose
Track licensing impact when reusing or translating code from source projects.

## Source Projects
- **Mutable Instruments Grids**: MIT License (Emilie Gillet / Mutable Instruments)
  - Firmware source: github.com/pichenettes/eurorack (grids/ subfolder)
  - Pattern tables in `grids/pattern_generator.cc` are MIT-licensed and could
    be used directly with attribution. We chose clean-room instead (see below).
- **hdavid Max port**: Not directly referenced in this implementation.
- **Schwung**: Assumed proprietary — no Schwung source included in this repo.
- **Ableton Move**: Proprietary — no Move source included in this repo.

## Code Reuse Matrix

| Component         | Source         | License | Translation Status | Notes                                             |
|-------------------|----------------|---------|--------------------|---------------------------------------------------|
| Algorithm structure | Grids (MI)   | MIT     | Clean-room         | Structure derived from public documentation       |
| Pattern tables    | Grids (MI)     | MIT     | Clean-room         | New tables, musically inspired but not copied     |
| Map interpolation | Grids (MI)     | MIT     | Clean-room         | Bilinear lerp re-implemented from algorithm spec  |
| Density system    | Grids (MI)     | MIT     | Clean-room         | Threshold logic derived from documented behaviour |
| Perturbation      | Grids (MI)     | MIT     | Clean-room         | Signed-jitter variant (deviation documented)      |
| LCG RNG           | Public domain  | —       | Original           | Knuth constants, not from Grids source            |

## Clean-Room Rationale

`src/dsp/grids_engine.c` and `src/dsp/grids_tables.c` were written from:
1. The published algorithm description in MI documentation and community resources.
2. Observable musical behaviour of the Grids module.
3. No direct reading of `grids/pattern_generator.cc` during implementation.

This avoids any license-compatibility questions when distributing for Move.

## If Original MI Tables Are Substituted Later

The original MI pattern tables (`grids/pattern_generator.cc`) are MIT licensed.
Substituting them would require:
- Retaining the MIT copyright notice for that file.
- Including the MIT license text in the distribution.
- No other restrictions (MIT is permissive).

## Attribution Requirements
- [x] Mutable Instruments acknowledgment: recommended in README even for clean-room port
- [ ] Source code links: add if distributing
- [ ] Author attributions: Emilie Gillet (MI), hdavid (Max port) — credit in README

## Legal Compliance Checklist
- [x] Mutable Instruments Grids license reviewed (MIT)
- [x] Clean-room approach documented
- [ ] Schwung license clarified with Schwung authors
- [ ] Ableton Move distribution terms understood before shipping
