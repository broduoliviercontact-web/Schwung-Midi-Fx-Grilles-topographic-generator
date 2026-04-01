# MEMORY.md

- The project separates three layers: grids engine, schwung wrapper, move UI.
- Never mix UI rendering code into the engine layer.
- Parameter naming convention:
  - map_x
  - map_y
  - randomness
  - density_kick
  - density_snare
  - density_hat
  - kick_note
  - snare_note
  - hat_note
- Any source translation from Mutable/hdavid must be logged in docs/LICENSE_NOTES.md.
- Prefer small compilable patches.
- Update docs/PORTING_NOTES.md after each accepted milestone.
