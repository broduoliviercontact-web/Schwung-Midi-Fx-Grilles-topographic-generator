# Grids Source Analysis

## Algorithm Overview
### Core Components
1. **Drum Patterns** (3 lanes)
2. **Map Interpolation** (X/Y navigation)
3. **Density Control** (per lane)
4. **Perturbation/Randomness**
5. **Clock Synchronization**

## Parameter Structure
- X position (0-255)
- Y position (0-255)
- Density per lane (0-255)
- Randomness (0-255)
- Clock input

## Output Behavior
- Trigger per drum lane
- Accent outputs
- Timing and dynamics

## Source Code References
- Original implementation: [path in Grids source]
- Key functions: [list relevant functions]
- Data structures: [describe key structs]

## Musical Characteristic Notes
- Resolution: [samples/resolution]
- Timing behavior: [clock-sync details]
- Density mapping: [how density translates to hits]
