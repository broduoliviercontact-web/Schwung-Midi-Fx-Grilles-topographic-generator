/*
 * grids_test.c
 * Standalone pattern-dump test — no Schwung, no Move, no dynamic linking.
 *
 * Build:  make test
 * Output: ASCII grid showing 32 steps × 3 lanes (K/S/H) for several
 *         parameter combinations.
 *
 * Reading the output:
 *   'X'  trigger fired
 *   'A'  trigger fired + accent
 *   '.'  silent
 */

#include <stdio.h>
#include <stdint.h>
#include "../src/dsp/grids_engine.h"

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

static void print_header(const char *label,
                         uint8_t x, uint8_t y,
                         uint8_t dk, uint8_t ds, uint8_t dh,
                         uint8_t rnd)
{
    printf("\n=== %s ===\n", label);
    printf("  map_x=%-3u  map_y=%-3u  dk=%-3u  ds=%-3u  dh=%-3u  chaos=%-3u\n",
           x, y, dk, ds, dh, rnd);
    printf("  step: ");
    for (int s = 0; s < 32; s++) printf(s % 8 == 0 ? "|" : "-");
    printf("|\n");
}

static void run_scenario(const char *label,
                         uint8_t x, uint8_t y,
                         uint8_t dk, uint8_t ds, uint8_t dh,
                         uint8_t rnd)
{
    static const char *lane_names[] = { "K", "S", "H" };

    GridsEngine e;
    grids_init(&e);
    grids_set_map_xy(&e, x, y);
    grids_set_density(&e, 0, dk);
    grids_set_density(&e, 1, ds);
    grids_set_density(&e, 2, dh);
    grids_set_randomness(&e, rnd);

    /* Capture 32 steps */
    char grid[3][32];
    for (int step = 0; step < 32; step++) {
        grids_tick(&e);
        for (int lane = 0; lane < 3; lane++) {
            bool t = grids_get_trigger(&e, lane);
            bool a = grids_get_accent(&e, lane);
            grid[lane][step] = t ? (a ? 'A' : 'X') : '.';
        }
    }

    print_header(label, x, y, dk, ds, dh, rnd);
    for (int lane = 0; lane < 3; lane++) {
        printf("  %s:   ", lane_names[lane]);
        for (int s = 0; s < 32; s++) {
            if (s % 8 == 0) putchar('|');
            putchar(grid[lane][s]);
        }
        printf("|\n");
    }
}

/* -------------------------------------------------------------------------
 * Scenarios
 * ---------------------------------------------------------------------- */

int main(void)
{
    printf("Grids pattern engine — standalone test\n");
    printf("Legend:  A=accent trigger  X=trigger  .=silent\n");

    /* Sparse: centre of map, low density, no chaos */
    run_scenario("Sparse — map centre, low density",
                 128, 128, 64, 64, 64, 0);

    /* Medium: same map, medium density */
    run_scenario("Medium — map centre, medium density",
                 128, 128, 140, 120, 160, 0);

    /* Dense: high density */
    run_scenario("Dense — map centre, high density",
                 128, 128, 220, 200, 230, 0);

    /* Top-left node: minimal rock feel */
    run_scenario("Top-left node (x=0,y=0), medium density",
                 0, 0, 128, 128, 128, 0);

    /* Bottom-right node: maximum complexity */
    run_scenario("Bottom-right node (x=255,y=255), medium density",
                 255, 255, 128, 128, 128, 0);

    /* Latin: high Y, medium X */
    run_scenario("Latin feel (x=128,y=220), medium density",
                 128, 220, 128, 128, 160, 0);

    /* Chaos: medium density + maximum randomness */
    run_scenario("Chaos=255 — same params as Medium (should vary each run)",
                 128, 128, 140, 120, 160, 255);

    /* Step-counter wraps: run 64 steps, check second cycle matches first */
    {
        printf("\n=== Wrap check — two 32-step cycles must be identical ===\n");
        GridsEngine e;
        grids_init(&e);
        grids_set_map_xy(&e, 128, 128);
        grids_set_density(&e, 0, 160);
        grids_set_density(&e, 1, 140);
        grids_set_density(&e, 2, 180);

        char cyc1[3][32], cyc2[3][32];
        for (int step = 0; step < 32; step++) {
            grids_tick(&e);
            for (int l = 0; l < 3; l++) {
                bool t = grids_get_trigger(&e, l);
                bool a = grids_get_accent(&e, l);
                cyc1[l][step] = t ? (a ? 'A' : 'X') : '.';
            }
        }
        for (int step = 0; step < 32; step++) {
            grids_tick(&e);
            for (int l = 0; l < 3; l++) {
                bool t = grids_get_trigger(&e, l);
                bool a = grids_get_accent(&e, l);
                cyc2[l][step] = t ? (a ? 'A' : 'X') : '.';
            }
        }
        int ok = 1;
        for (int l = 0; l < 3; l++)
            for (int s = 0; s < 32; s++)
                if (cyc1[l][s] != cyc2[l][s]) { ok = 0; break; }
        printf("  Cycle determinism: %s\n", ok ? "PASS" : "FAIL");
    }

    printf("\nDone.\n");
    return 0;
}
