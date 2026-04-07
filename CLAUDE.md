# CLAUDE.md

## Project
This repository ports the Grids drum-pattern engine to Ableton Move via Schwung.

## Primary goal
Build a working Schwung module that reproduces the musical behavior of Mutable Instruments Grids:
- 3 drum lanes
- map X / map Y interpolation
- density per lane
- randomness / perturbation
- clocked step advancement
- trigger/accent style outputs adapted for Move

## Rules
- Prefer a clean-room porting approach from documented behavior and inspected source structure.
- Keep algorithm code isolated from Schwung host integration.
- Do not mix UI logic into DSP logic.
- Preserve musical behavior before optimizing UX.
- Every major change must update docs/PORTING_NOTES.md.
- Always note licensing impact in docs/LICENSE_NOTES.md when reusing or translating source.
- When uncertain, propose a small plan before editing files.
- Write small compilable increments.
- Never rename parameters without updating module.json and UI bindings.

## Schwung assumptions
- Use api_version 2.
- Assume module discovery from runtime modules folder.
- Prefer chainable design when relevant.
- Keep module.json under the documented size limits.

## Persistent knowledge
Always read and update:
- docs/PORTING_NOTES.md
- docs/LICENSE_NOTES.md

These files act as long-term project memory.