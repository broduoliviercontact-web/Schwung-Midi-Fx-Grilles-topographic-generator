/*
 * grids_tables.c
 * Clean-room pattern-map data for the Grids engine.
 *
 * Byte values are pattern energy (0–255) per step.
 * Steps 0..31 span two bars of 8th-notes (quarter notes at steps 0,8,16,24).
 *
 * Axis semantics:
 *   X: rhythmic density — 0 = minimal, 4 = maximal
 *   Y: rhythmic character — 0 = straight/rock, 4 = syncopated/afro-latin
 *
 * Lanes:
 *   0 = kick drum
 *   1 = snare drum
 *   2 = hi-hat
 *
 * Node index: node_y * 5 + node_x  (row-major, 25 nodes per lane)
 *
 * DEVIATION: These patterns are a clean-room derivation. They produce
 * recognisable Grids-style results but differ from the original MI tables.
 * See docs/LICENSE_NOTES.md for licensing context.
 */

#include "grids_tables.h"

/* Shorthand for common energy levels */
#define HH 240   /* hot — fires at any non-zero density                  */
#define MH 210   /* medium-high                                           */
#define MM 180   /* medium                                                */
#define ML 130   /* medium-low                                            */
#define LO  90   /* low — fires only at high density settings             */
#define GH  60   /* ghost — fires only at maximum density                 */
#define __ 0     /* silent                                                */

/* clang-format off */
const uint8_t grids_pattern_data
    [GRIDS_NUM_LANES]
    [GRIDS_MAP_NODES * GRIDS_MAP_NODES]
    [GRIDS_NUM_STEPS] =
{
    /* ------------------------------------------------------------------ */
    /* LANE 0 — KICK DRUM                                                  */
    /* ------------------------------------------------------------------ */
    {
        /* node  0 (x=0,y=0) — minimal: half-note pulse                  */
        { HH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          MM,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node  1 (x=1,y=0) — sparse: beat-1 + ghost on "3"            */
        { HH,__,__,__, __,__,__,__, GH,__,__,__, __,__,__,__,
          MH,__,__,__, __,__,__,__, GH,__,__,__, __,__,__,__ },

        /* node  2 (x=2,y=0) — basic rock: beats 1 and 3                */
        { HH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          MH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node  3 (x=3,y=0) — four-on-floor                            */
        { HH,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          MH,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  4 (x=4,y=0) — dense kick with 16th-note fills          */
        { HH,__,GH,__, __,__,LO,__, MH,__,GH,__, __,__,LO,__,
          HH,__,GH,__, __,__,LO,__, MH,__,GH,__, __,__,LO,__ },

        /* node  5 (x=0,y=1) — minimal + faint "and-of-4" ghost         */
        { HH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          MM,__,__,__, __,__,__,__, __,__,__,__, __,__,GH,__ },

        /* node  6 (x=1,y=1) — sparse with slight syncopation           */
        { HH,__,__,__, __,__,__,__, GH,__,__,__, __,__,__,__,
          MH,__,__,__, __,__,__,__, __,__,__,__, __,__,GH,__ },

        /* node  7 (x=2,y=1) — beat-3 shifted forward by a 16th        */
        { HH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          __,__,MH,__, __,__,LO,__, __,__,__,__, __,__,__,__ },

        /* node  8 (x=3,y=1) — four-on-floor + syncopated fill         */
        { HH,__,__,__, __,__,__,__, MM,__,__,__, __,__,LO,__,
          MH,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  9 (x=4,y=1) — dense + syncopated                       */
        { HH,__,GH,__, LO,__,LO,__, MH,__,GH,__, __,__,LO,__,
          HH,__,GH,__, LO,__,__,__, MH,__,GH,__, __,__,LO,__ },

        /* node 10 (x=0,y=2) — minimalist syncopated                    */
        { MH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          __,__,LO,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 11 (x=1,y=2) — syncopated sparse                        */
        { MH,__,__,__, __,__,__,__, __,__,__,__, __,__,GH,__,
          __,__,LO,__, __,__,__,__, __,__,__,__, MM,__,__,__ },

        /* node 12 (x=2,y=2) — standard groove with syncopation         */
        { MH,__,__,__, __,__,__,__, __,__,LO,__, __,__,__,__,
          __,__,LO,__, __,__,__,__, __,__,__,__, MM,__,__,__ },

        /* node 13 (x=3,y=2) — syncopated groove                        */
        { HH,__,__,__, __,__,__,__, __,__,LO,__, __,__,__,__,
          MH,__,__,__, __,__,LO,__, __,__,__,__, MM,__,__,__ },

        /* node 14 (x=4,y=2) — syncopated dense                         */
        { HH,__,GH,__, __,__,LO,__, LO,__,MH,__, __,__,GH,__,
          HH,__,GH,__, __,__,LO,__, LO,__,MH,__, __,__,GH,__ },

        /* node 15 (x=0,y=3) — latin-minimal: beat-1 + "and-of-3"      */
        { MH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 16 (x=1,y=3) — latin sparse                             */
        { MH,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, LO,__,__,__, __,__,GH,__, __,__,__,__ },

        /* node 17 (x=2,y=3) — latin medium                             */
        { MM,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,LO,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 18 (x=3,y=3) — latin medium-dense                       */
        { MH,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          MM,__,LO,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 19 (x=4,y=3) — latin dense                              */
        { HH,__,GH,__, LO,__,__,__, __,__,LO,__, __,__,LO,__,
          MH,__,GH,__, LO,__,__,__, __,__,LO,__, __,__,LO,__ },

        /* node 20 (x=0,y=4) — afro-minimal: beat-1 + "and-of-2"       */
        { MM,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 21 (x=1,y=4) — afro sparse                              */
        { MM,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, __,__,__,__, GH,__,__,__, __,__,__,__ },

        /* node 22 (x=2,y=4) — afro medium                              */
        { MM,__,__,__, LO,__,__,__, __,__,__,__, __,__,GH,__,
          __,__,LO,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 23 (x=3,y=4) — afro medium-dense                        */
        { MH,__,__,__, LO,__,__,__, __,__,__,__, __,__,GH,__,
          MM,__,LO,__, __,__,__,__, __,__,__,__, __,__,GH,__ },

        /* node 24 (x=4,y=4) — afro dense / highly syncopated           */
        { HH,__,__,__, LO,__,GH,__, __,__,LO,__, __,__,GH,__,
          MM,__,GH,__, LO,__,GH,__, __,__,LO,__, __,__,GH,__ },
    },

    /* ------------------------------------------------------------------ */
    /* LANE 1 — SNARE DRUM                                                 */
    /* Beats 2 and 4 = steps 8 and 24 in 32-step two-bar 4/4             */
    /* ------------------------------------------------------------------ */
    {
        /* node  0 (x=0,y=0) — pure 2+4                                  */
        { __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  1 (x=1,y=0) — 2+4 with pre-beat ghost                  */
        { __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,__,__,
          __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,__,__ },

        /* node  2 (x=2,y=0) — 2+4 with ghosts and post-beat fill       */
        { __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,LO,__,
          __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,LO,__ },

        /* node  3 (x=3,y=0) — busy snare: fills around 2+4             */
        { __,__,__,__, LO,__,__,__, MM,__,__,__, __,__,LO,__,
          __,__,__,__, LO,__,__,__, MH,__,GH,__, __,__,LO,__ },

        /* node  4 (x=4,y=0) — very dense, many ghosts                  */
        { __,__,GH,__, LO,__,GH,__, HH,__,GH,__, __,__,LO,__,
          __,__,GH,__, LO,__,GH,__, HH,__,GH,__, __,__,LO,__ },

        /* node  5 (x=0,y=1) — 2+4 with slight displacement             */
        { __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          __,__,__,__, __,__,__,__, MH,__,__,__, __,__,GH,__ },

        /* node  6 (x=1,y=1) — pre-ghost + slight offset                */
        { __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,__,__,
          __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,GH,__ },

        /* node  7 (x=2,y=1) — shifting toward backbeat                 */
        { __,__,__,__, GH,__,__,__, MH,__,__,__, __,__,__,__,
          __,__,__,__, GH,__,__,__, MM,__,GH,__, __,__,LO,__ },

        /* node  8 (x=3,y=1) — busy + slight shift                      */
        { __,__,__,__, LO,__,__,__, MH,__,__,__, __,__,GH,__,
          __,__,__,__, LO,__,__,__, MH,__,LO,__, __,__,LO,__ },

        /* node  9 (x=4,y=1) — very dense shifted                       */
        { __,__,GH,__, LO,__,GH,__, HH,__,GH,__, __,__,LO,__,
          __,__,GH,__, LO,__,GH,__, HH,__,GH,__, __,__,LO,__ },

        /* node 10 (x=0,y=2) — displaced snare: "and-of-2" + "and-of-4" */
        { __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__,
          __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__ },

        /* node 11 (x=1,y=2) — displaced + pre-ghost                    */
        { __,__,__,__, GH,__,__,__, __,__,MH,__, __,__,__,__,
          __,__,__,__, GH,__,__,__, __,__,MH,__, __,__,__,__ },

        /* node 12 (x=2,y=2) — latin snare pattern                      */
        { __,__,__,__, GH,__,__,__, __,__,MH,__, __,__,__,__,
          __,__,GH,__, __,__,__,__, __,__,MH,__, __,__,LO,__ },

        /* node 13 (x=3,y=2) — latin busy                               */
        { __,__,__,__, GH,__,__,__, __,__,MM,__, __,__,__,__,
          __,__,GH,__, __,__,__,__, MH,__,__,__, __,__,LO,__ },

        /* node 14 (x=4,y=2) — displaced dense                          */
        { __,__,GH,__, __,__,LO,__, __,__,HH,__, __,__,LO,__,
          __,__,GH,__, __,__,LO,__, __,__,HH,__, __,__,LO,__ },

        /* node 15 (x=0,y=3) — afro: snare shifted to "and-of-3"        */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, __,__,MM,__, __,__,__,__, __,__,__,__ },

        /* node 16 (x=1,y=3) — afro sparse                              */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, __,__,MH,__, __,__,__,__, __,__,GH,__ },

        /* node 17 (x=2,y=3) — afro medium                              */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,GH,__,
          __,__,__,__, __,__,MH,__, __,__,__,__, __,__,GH,__ },

        /* node 18 (x=3,y=3) — afro medium-dense                        */
        { __,__,__,__, LO,__,__,__, __,__,GH,__, __,__,GH,__,
          __,__,LO,__, __,__,MH,__, __,__,GH,__, __,__,LO,__ },

        /* node 19 (x=4,y=3) — afro dense                               */
        { __,__,GH,__, LO,__,GH,__, __,__,LO,__, __,__,LO,__,
          __,__,GH,__, __,__,MH,__, __,__,LO,__, __,__,LO,__ },

        /* node 20 (x=0,y=4) — afro-minimal: pure off-accent            */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,__,__,
          __,__,__,__, __,__,MM,__, __,__,__,__, __,__,__,__ },

        /* node 21 (x=1,y=4) — afro sparse + faint clave ghost          */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,GH,__,
          __,__,__,__, __,__,MH,__, __,__,__,__, __,__,__,__ },

        /* node 22 (x=2,y=4) — afro medium                              */
        { __,__,__,__, LO,__,__,__, __,__,__,__, __,__,GH,__,
          __,__,__,__, __,__,MH,__, __,__,__,__, __,__,GH,__ },

        /* node 23 (x=3,y=4) — afro dense                               */
        { __,__,__,__, LO,__,__,__, __,__,LO,__, __,__,GH,__,
          __,__,LO,__, __,__,MH,__, __,__,LO,__, __,__,GH,__ },

        /* node 24 (x=4,y=4) — afro very dense                          */
        { __,__,LO,__, LO,__,GH,__, __,__,LO,__, __,__,LO,__,
          __,__,LO,__, __,__,MH,__, __,__,LO,__, __,__,LO,__ },
    },

    /* ------------------------------------------------------------------ */
    /* LANE 2 — HI-HAT                                                     */
    /* X increases density, Y shifts from straight to syncopated          */
    /* ------------------------------------------------------------------ */
    {
        /* node  0 (x=0,y=0) — quarter notes only                        */
        { MM,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          MM,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  1 (x=1,y=0) — 8th notes                                */
        { MH,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          MH,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  2 (x=2,y=0) — 8ths + some 16th upbeats                 */
        { MH,__,__,__, ML,__,__,__, MM,__,__,__, LO,__,__,__,
          MH,__,__,__, ML,__,__,__, MM,__,__,__, LO,__,__,__ },

        /* node  3 (x=3,y=0) — straight 16th notes                      */
        { MH,ML,MM,LO, MH,ML,MM,LO, MH,ML,MM,LO, MH,ML,MM,LO,
          MH,ML,MM,LO, MH,ML,MM,LO, MH,ML,MM,LO, MH,ML,MM,LO },

        /* node  4 (x=4,y=0) — dense 16ths with accents on 8ths         */
        { HH,ML,MH,LO, HH,ML,MH,LO, HH,ML,MH,LO, HH,ML,MH,LO,
          HH,ML,MH,LO, HH,ML,MH,LO, HH,ML,MH,LO, HH,ML,MH,LO },

        /* node  5 (x=0,y=1) — quarters + displaced accent              */
        { MM,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__,
          MM,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__ },

        /* node  6 (x=1,y=1) — 8ths with slight offset                  */
        { MH,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__,
          __,__,MM,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node  7 (x=2,y=1) — mix on/off beats                         */
        { MH,__,__,__, ML,__,__,__, MM,__,__,__, __,__,LO,__,
          MH,__,__,__, ML,__,__,__, MM,__,__,__, __,__,LO,__ },

        /* node  8 (x=3,y=1) — 16ths with off-beat accent               */
        { MH,ML,MM,__, MH,ML,MM,LO, MH,ML,MM,__, MH,ML,MM,LO,
          MH,ML,MM,__, MH,ML,MM,LO, MH,ML,MM,__, MH,ML,MM,LO },

        /* node  9 (x=4,y=1) — dense 16ths shifting accent              */
        { HH,ML,MH,__, HH,ML,MH,LO, HH,ML,MH,__, HH,ML,MH,LO,
          HH,ML,MH,__, HH,ML,MH,LO, HH,ML,MH,__, HH,ML,MH,LO },

        /* node 10 (x=0,y=2) — off-beat 8ths (open hat feel)            */
        { __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node 11 (x=1,y=2) — off-beat 8ths + some downbeats           */
        { MM,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__,
          __,__,MM,__, __,__,__,__, __,__,MM,__, __,__,__,__ },

        /* node 12 (x=2,y=2) — swing-feel: 8ths displaced               */
        { MM,__,__,__, __,__,ML,__, MM,__,__,__, __,__,LO,__,
          MM,__,__,__, __,__,ML,__, MM,__,__,__, __,__,LO,__ },

        /* node 13 (x=3,y=2) — 16ths with swing displacement            */
        { MH,__,MM,ML, MH,__,MM,LO, MH,__,MM,ML, MH,__,MM,LO,
          MH,__,MM,ML, MH,__,MM,LO, MH,__,MM,ML, MH,__,MM,LO },

        /* node 14 (x=4,y=2) — dense swing 16ths                        */
        { HH,__,MH,ML, HH,__,MH,LO, HH,ML,MH,__, HH,__,MH,LO,
          HH,__,MH,ML, HH,__,MH,LO, HH,ML,MH,__, HH,__,MH,LO },

        /* node 15 (x=0,y=3) — sparse afro: beat-3 emphasis             */
        { __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__,
          __,__,MM,__, __,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 16 (x=1,y=3) — sparse afro + off quarter                */
        { __,__,__,__, __,__,__,__, __,__,MM,__, __,__,ML,__,
          __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__ },

        /* node 17 (x=2,y=3) — afro medium: displaced 8th pattern       */
        { MM,__,__,__, __,__,ML,__, __,__,MM,__, __,__,LO,__,
          __,__,MM,__, ML,__,__,__, __,__,__,__, __,__,__,__ },

        /* node 18 (x=3,y=3) — afro 16ths, displaced                    */
        { MH,__,__,__, __,__,MM,__, __,__,MH,ML, __,__,MM,__,
          __,ML,MH,__, __,MM,__,__, MH,__,__,__, ML,__,MM,__ },

        /* node 19 (x=4,y=3) — dense afro 16ths                         */
        { MH,ML,__,LO, __,ML,MM,__, MH,__,MM,ML, __,LO,MM,__,
          MH,ML,__,LO, __,ML,MM,__, MH,__,MM,ML, __,LO,MM,__ },

        /* node 20 (x=0,y=4) — minimal afro: single off-beat per bar    */
        { __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__,
          __,__,__,__, __,__,__,__, __,__,MM,__, __,__,__,__ },

        /* node 21 (x=1,y=4) — off-beat 8th-note pattern                */
        { __,__,__,__, __,__,__,__, MM,__,__,__, __,__,ML,__,
          __,__,__,__, __,__,__,__, MM,__,__,__, __,__,__,__ },

        /* node 22 (x=2,y=4) — afro medium: layered off-beats           */
        { MM,__,__,__, __,__,ML,__, __,__,MM,__, __,__,ML,__,
          MM,__,__,__, __,__,ML,__, __,__,MM,__, __,__,ML,__ },

        /* node 23 (x=3,y=4) — afro 16ths, heavily syncopated           */
        { MM,__,__,__, __,__,MH,__, __,ML,MM,__, __,__,MH,__,
          MM,__,__,__, __,__,MH,__, __,ML,MM,__, __,__,MH,__ },

        /* node 24 (x=4,y=4) — dense afro, maximum syncopation          */
        { MH,__,MM,__, ML,__,MH,__, __,ML,MM,__, ML,__,MH,__,
          MH,__,MM,__, ML,__,MH,__, __,ML,MM,__, ML,__,MH,__ },
    },
};
/* clang-format on */
