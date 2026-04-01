/*
 * grids_engine.c
 * Portable Grids drum-pattern engine implementation.
 *
 * No dependencies beyond stdint.h / stdbool.h / string.h.
 * Safe for cross-compilation to aarch64-linux (Ableton Move).
 */

#include "grids_engine.h"
#include "grids_tables.h"
#include <string.h>

/* -------------------------------------------------------------------------
 * Internal helpers
 * ---------------------------------------------------------------------- */

/*
 * Linear interpolation between two uint8 values.
 * t = 0 → returns a, t = 255 → returns ~b (t=252 at column boundary).
 *
 * DEVIATION: t saturates at 252 due to (x & 63) << 2 scaling, introducing
 * a ~1.2 % under-shoot at the far edge of each interpolation cell.
 */
static inline uint8_t lerp8(uint8_t a, uint8_t b, uint8_t t)
{
    return (uint8_t)((int16_t)a +
                     ((((int16_t)b - (int16_t)a) * (int16_t)t) >> 8));
}

/*
 * LCG random number generator, returns 8-bit value.
 *
 * DEVIATION: Original Grids uses an 8-bit LFSR. The LCG used here has
 * slightly different spectral properties but passes basic randomness tests.
 * Constants from Knuth Vol. 2 §3.3.4 table.
 */
static inline uint8_t rng_next(GridsEngine *e)
{
    e->rng_state = e->rng_state * 1664525u + 1013904223u;
    return (uint8_t)(e->rng_state >> 16);
}

/*
 * Look up pattern energy for a given lane, node, and step.
 */
static inline uint8_t node_value(int lane, uint8_t nx, uint8_t ny, uint8_t step)
{
    return grids_pattern_data[lane][ny * GRIDS_MAP_NODES + nx][step];
}

/* -------------------------------------------------------------------------
 * Public API
 * ---------------------------------------------------------------------- */

void grids_init(GridsEngine *e)
{
    memset(e, 0, sizeof(*e));
    e->rng_state = 0xDEADBEEFu;
    /* Default mid-range map, zero density = no triggers until set */
    e->map_x     = 128;
    e->map_y     = 128;
}

void grids_engine_reset(GridsEngine *e)
{
    e->step = 0;
    for (int i = 0; i < GRIDS_NUM_LANES; i++) {
        e->trigger[i] = false;
        e->accent[i]  = false;
    }
}

void grids_set_map_xy(GridsEngine *e, uint8_t x, uint8_t y)
{
    e->map_x = x;
    e->map_y = y;
}

void grids_set_density(GridsEngine *e, int lane, uint8_t density)
{
    if (lane >= 0 && lane < GRIDS_NUM_LANES)
        e->density[lane] = density;
}

void grids_set_randomness(GridsEngine *e, uint8_t randomness)
{
    e->randomness = randomness;
}

/*
 * grids_tick — advance one step and evaluate triggers.
 *
 * Algorithm per step:
 *   1. Decompose map_x/map_y into cell (col, row) and fractional (xf, yf).
 *   2. Bilinearly interpolate the 4 surrounding nodes → threshold[lane].
 *   3. Accent if threshold >= GRIDS_ACCENT_THRESHOLD (pre-perturbation).
 *   4. Apply signed jitter scaled by randomness.
 *   5. Trigger if perturbed_threshold > (255 - density[lane]).
 *   6. Cancel accent if trigger did not fire.
 *   7. Advance step counter (wraps at GRIDS_NUM_STEPS).
 */
void grids_tick(GridsEngine *e)
{
    const uint8_t s = e->step;

    /* Decompose X into column (0–3) and fractional part (0–252) */
    const uint8_t x_col  = e->map_x >> 6;           /* 0..3 */
    const uint8_t x_frac = (e->map_x & 0x3Fu) << 2; /* 0..252 */
    const uint8_t y_row  = e->map_y >> 6;
    const uint8_t y_frac = (e->map_y & 0x3Fu) << 2;

    /* x_col+1 and y_row+1 are always ≤ 4 because col/row ≤ 3 */
    const uint8_t xn = (uint8_t)(x_col + 1u);
    const uint8_t yn = (uint8_t)(y_row + 1u);

    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        /* --- bilinear interpolation across 4 surrounding nodes --- */
        uint8_t v00 = node_value(lane, x_col, y_row, s);
        uint8_t v10 = node_value(lane, xn,    y_row, s);
        uint8_t v01 = node_value(lane, x_col, yn,    s);
        uint8_t v11 = node_value(lane, xn,    yn,    s);

        uint8_t row0      = lerp8(v00, v10, x_frac);
        uint8_t row1      = lerp8(v01, v11, x_frac);
        uint8_t threshold = lerp8(row0, row1, y_frac);

        /* --- accent: based on raw pattern energy, before perturbation --- */
        /*
         * DEVIATION: Accent is evaluated before perturbation so that
         * randomness does not destroy accent information at high randomness
         * settings. The original Grids evaluates accent separately from the
         * trigger path; the exact threshold may differ.
         */
        bool would_accent = (threshold >= GRIDS_ACCENT_THRESHOLD);

        /* --- perturbation (signed jitter) --- */
        if (e->randomness > 0u) {
            uint8_t  rb     = rng_next(e);
            int16_t  jitter = ((int16_t)rb - 128) * (int16_t)e->randomness;
            int16_t  perturbed = (int16_t)threshold + (jitter >> 8);
            if (perturbed < 0)   perturbed = 0;
            if (perturbed > 255) perturbed = 255;
            threshold = (uint8_t)perturbed;
        }

        /* --- trigger: fire when energy exceeds density threshold --- */
        /*
         * fire_threshold = 255 - density:
         *   density=0   → fire_threshold=255 → nothing fires
         *   density=255 → fire_threshold=0   → everything fires
         */
        uint8_t fire_threshold = (uint8_t)(255u - e->density[lane]);
        bool    fire           = (threshold > fire_threshold);

        e->trigger[lane] = fire;
        e->accent[lane]  = fire && would_accent;
    }

    /* Advance step, wrapping at 32 */
    e->step = (uint8_t)((s + 1u) % GRIDS_NUM_STEPS);
}

bool grids_get_trigger(const GridsEngine *e, int lane)
{
    if (lane < 0 || lane >= GRIDS_NUM_LANES) return false;
    return e->trigger[lane];
}

bool grids_get_accent(const GridsEngine *e, int lane)
{
    if (lane < 0 || lane >= GRIDS_NUM_LANES) return false;
    return e->accent[lane];
}
