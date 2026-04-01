/*
 * grids_engine.h
 * Portable Grids drum-pattern engine — no Schwung or Move dependencies.
 *
 * Algorithm:
 *   - 5×5 topographic node map per lane (3 lanes)
 *   - Bilinear interpolation between 4 surrounding nodes based on map_x / map_y
 *   - Interpolated value compared against (255 - density) to fire a trigger
 *   - Signed jitter scaled by randomness perturbs each comparison
 *   - Accent fires when raw (pre-perturbation) pattern energy >= 192
 *   - Step counter advances 0..31, wraps on tick()
 *
 * Usage:
 *   GridsEngine e;
 *   grids_init(&e);
 *   grids_set_map_xy(&e, x, y);
 *   grids_set_density(&e, lane, d);
 *   grids_set_randomness(&e, r);
 *   grids_tick(&e);                     // call once per clock pulse
 *   bool fire = grids_get_trigger(&e, lane);
 *   bool acc  = grids_get_accent(&e, lane);
 */

#pragma once
#include <stdint.h>
#include <stdbool.h>

#define GRIDS_NUM_LANES       3
#define GRIDS_NUM_STEPS       32
#define GRIDS_MAP_NODES       5   /* 5×5 grid — 25 nodes per lane */
#define GRIDS_ACCENT_THRESHOLD 192

typedef struct {
    uint8_t  step;                       /* current step, 0..31            */
    uint8_t  map_x;                      /* X position, 0..255             */
    uint8_t  map_y;                      /* Y position, 0..255             */
    uint8_t  density[GRIDS_NUM_LANES];   /* per-lane density, 0..255       */
    uint8_t  randomness;                 /* perturbation amount, 0..255    */
    uint32_t rng_state;                  /* LCG state                      */
    bool     trigger[GRIDS_NUM_LANES];   /* trigger output (current step)  */
    bool     accent[GRIDS_NUM_LANES];    /* accent output  (current step)  */
} GridsEngine;

/* Lifecycle */
void grids_init        (GridsEngine *e);
void grids_engine_reset(GridsEngine *e);   /* rewind to step 0, keep params */

/* Parameter setters */
void grids_set_map_xy  (GridsEngine *e, uint8_t x, uint8_t y);
void grids_set_density (GridsEngine *e, int lane, uint8_t density);
void grids_set_randomness(GridsEngine *e, uint8_t randomness);

/* Clock */
void grids_tick        (GridsEngine *e);   /* advance one step, update outputs */

/* Output readers — valid after grids_tick() */
bool grids_get_trigger (const GridsEngine *e, int lane);
bool grids_get_accent  (const GridsEngine *e, int lane);
