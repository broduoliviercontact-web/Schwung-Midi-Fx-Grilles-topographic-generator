/*
 * grids_tables.h
 * Declaration of pattern-map data for the Grids engine.
 *
 * Layout:  grids_pattern_data[lane][node_y * GRIDS_MAP_NODES + node_x][step]
 *   lane    : 0 = kick, 1 = snare, 2 = hi-hat
 *   node_y/x: 0..4  (5×5 grid, x grows right, y grows down)
 *   step    : 0..31
 *
 * Each byte is a "pattern energy" value (0–255).  Higher energy at a step
 * means it fires at lower density settings.  A value of 255 fires even when
 * density is at its minimum (1).
 *
 * DEVIATION NOTE:
 *   These tables are clean-room approximations derived from the documented
 *   musical behaviour of Mutable Instruments Grids.  They are NOT a copy of
 *   the original eurorack firmware tables.  See docs/LICENSE_NOTES.md.
 */

#pragma once
#include <stdint.h>
#include "grids_engine.h"

extern const uint8_t grids_pattern_data
    [GRIDS_NUM_LANES]
    [GRIDS_MAP_NODES * GRIDS_MAP_NODES]
    [GRIDS_NUM_STEPS];
