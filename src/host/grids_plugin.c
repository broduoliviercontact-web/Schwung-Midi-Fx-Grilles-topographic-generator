/*
 * grids_plugin.c — Schwung MIDI FX wrapper for the Grids engine.
 *
 * API: midi_fx_api_v1_t  (entry point: move_midi_fx_init)
 *
 * Clock modes:
 *   - sync=move: follows Move transport + Move BPM
 *   - sync=internal: free-running at module BPM
 *   0xFA resets the step position; 0xFC flushes active notes in move-sync mode.
 *
 * Output:
 *   Triggers returned as note-on + note-off pairs from tick().
 *   Channel 1 (0x90/0x80). Notes configurable via kick_note/snare_note/hat_note.
 *   MIDI_FX_MAX_OUT_MSGS=16; worst case 3 lanes × 2 msgs = 6.
 */

#include "midi_fx_api_v1.h"
#include "plugin_api_v1.h"
#include "../dsp/grids_engine.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/* MIDI channel 1 */
#define MIDI_NOTE_ON    0x90u
#define MIDI_NOTE_OFF   0x80u

#define DEFAULT_BPM          120.0f
#define DEFAULT_GATE_DIVISOR 3u
#define MIN_INTERNAL_BPM     40u
#define MAX_INTERNAL_BPM     240u
#define DEFAULT_STEP_LENGTH  16u

/* Default GM drum notes */
#define DEFAULT_NOTE_KICK   36u
#define DEFAULT_NOTE_SNARE  38u
#define DEFAULT_NOTE_HAT    42u

#define VEL_NORMAL  80u
#define VEL_ACCENT  127u

static const host_api_v1_t *g_host = NULL;

/* -------------------------------------------------------------------------
 * Instance state
 * ---------------------------------------------------------------------- */

typedef struct {
    uint8_t  active;
    uint8_t  note;
    uint32_t frames_left;
} PendingNoteOff;

typedef struct {
    GridsEngine engine;

    uint32_t frames_until_tick;
    uint8_t  clock_running;
    uint8_t  sync_mode;
    uint8_t  step_length;
    uint16_t internal_bpm;

    /* Configurable output notes */
    uint8_t  note[GRIDS_NUM_LANES];

    /* UI-only flag: stored and returned, DSP does not use it */
    uint8_t  grid_view;

    /* UI preview cache: 32-step ASCII lanes, same alphabet as make test */
    char     preview[GRIDS_NUM_LANES][GRIDS_NUM_STEPS + 1];
    uint32_t preview_revision;
    uint8_t  preview_dirty;

    /* Scheduled note-offs so downstream synths see non-zero note lengths */
    PendingNoteOff pending[GRIDS_NUM_LANES];
} GridsInstance;

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

static uint8_t parse_norm(const char *s)
{
    if (!s) return 0;
    float v = (float)atof(s);
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    return (uint8_t)(v * 255.0f + 0.5f);
}

static uint8_t parse_note(const char *s)
{
    if (!s) return 0;
    int v = atoi(s);
    if (v < 0)   v = 0;
    if (v > 127) v = 127;
    return (uint8_t)v;
}

static uint16_t parse_bpm(const char *s)
{
    if (!s) return (uint16_t)DEFAULT_BPM;
    int v = atoi(s);
    if (v < (int)MIN_INTERNAL_BPM) v = MIN_INTERNAL_BPM;
    if (v > (int)MAX_INTERNAL_BPM) v = MAX_INTERNAL_BPM;
    return (uint16_t)v;
}

static uint8_t parse_steps(const char *s)
{
    if (!s) return DEFAULT_STEP_LENGTH;
    int v = atoi(s);
    if (v < 1) v = 1;
    if (v > 32) v = 32;
    return (uint8_t)v;
}

static uint8_t parse_sync_mode(const char *s)
{
    if (!s) return 0;
    if (strcmp(s, "move") == 0) return 0;
    if (strcmp(s, "internal") == 0) return 1;
    return (uint8_t)(atoi(s) != 0);
}

static float current_bpm(const GridsInstance *gi)
{
    if (gi && gi->sync_mode != 0) {
        return (float)gi->internal_bpm;
    }
    /* Avoid calling g_host->get_bpm() until host struct layout is confirmed. */
    return DEFAULT_BPM;
}

static uint32_t frames_per_step(int sample_rate, float bpm)
{
    float sr = (sample_rate > 0) ? (float)sample_rate : 44100.0f;
    float use_bpm = (bpm > 0.0f) ? bpm : DEFAULT_BPM;
    uint32_t fps = (uint32_t)(sr * 60.0f / (use_bpm * 4.0f));
    return fps > 0 ? fps : 1u;
}

static uint32_t frames_per_gate(int sample_rate, float bpm)
{
    uint32_t fps = frames_per_step(sample_rate, bpm);
    uint32_t gate = fps / DEFAULT_GATE_DIVISOR;
    return gate > 0 ? gate : 1u;
}

static int emit_note_message(uint8_t status, uint8_t note, uint8_t vel,
                             uint8_t out_msgs[][3], int out_lens[],
                             int max_out, int count)
{
    if (count >= max_out) return count;
    out_msgs[count][0] = status;
    out_msgs[count][1] = note;
    out_msgs[count][2] = vel;
    out_lens[count] = 3;
    return count + 1;
}

static int flush_all_notes(GridsInstance *gi,
                           uint8_t out_msgs[][3], int out_lens[],
                           int max_out, int count)
{
    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        if (!gi->pending[lane].active) continue;
        count = emit_note_message(MIDI_NOTE_OFF, gi->pending[lane].note, 0,
                                  out_msgs, out_lens, max_out, count);
        gi->pending[lane].active = 0;
        gi->pending[lane].frames_left = 0;
        if (count >= max_out) break;
    }
    return count;
}

static int advance_pending_notes(GridsInstance *gi, uint32_t frames,
                                 uint8_t out_msgs[][3], int out_lens[],
                                 int max_out, int count)
{
    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        PendingNoteOff *pending = &gi->pending[lane];
        if (!pending->active) continue;

        if (frames >= pending->frames_left) {
            count = emit_note_message(MIDI_NOTE_OFF, pending->note, 0,
                                      out_msgs, out_lens, max_out, count);
            pending->active = 0;
            pending->frames_left = 0;
        } else {
            pending->frames_left -= frames;
        }

        if (count >= max_out) break;
    }
    return count;
}

static int do_step(GridsInstance *gi,
                   uint32_t gate_frames,
                   uint8_t out_msgs[][3], int out_lens[],
                   int max_out)
{
    grids_tick(&gi->engine);
    if (gi->engine.step >= gi->step_length) {
        gi->engine.step = 0;
    }

    int count = 0;
    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        PendingNoteOff *pending = &gi->pending[lane];
        if (pending->active) {
            count = emit_note_message(MIDI_NOTE_OFF, pending->note, 0,
                                      out_msgs, out_lens, max_out, count);
            pending->active = 0;
            pending->frames_left = 0;
        }

        if (!grids_get_trigger(&gi->engine, lane) || count >= max_out) continue;

        uint8_t vel  = grids_get_accent(&gi->engine, lane) ? VEL_ACCENT : VEL_NORMAL;
        uint8_t note = gi->note[lane];

        count = emit_note_message(MIDI_NOTE_ON, note, vel,
                                  out_msgs, out_lens, max_out, count);
        pending->active = 1;
        pending->note = note;
        pending->frames_left = gate_frames;
    }
    return count;
}

static void mark_preview_dirty(GridsInstance *gi)
{
    if (gi) gi->preview_dirty = 1;
}

static void refresh_preview_cache(GridsInstance *gi)
{
    if (!gi || !gi->preview_dirty) return;

    GridsEngine preview = gi->engine;
    preview.step = 0;
    preview.rng_state = 0xDEADBEEFu;
    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        preview.trigger[lane] = false;
        preview.accent[lane] = false;
    }

    for (int s = 0; s < GRIDS_NUM_STEPS; s++) {
        grids_tick(&preview);

        for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
            bool fire = grids_get_trigger(&preview, lane);
            bool acc  = grids_get_accent(&preview, lane);
            gi->preview[lane][s] = fire ? (acc ? 'A' : 'X') : '.';
        }

        if (preview.step >= gi->step_length) {
            preview.step = 0;
        }
    }

    for (int lane = 0; lane < GRIDS_NUM_LANES; lane++) {
        gi->preview[lane][GRIDS_NUM_STEPS] = '\0';
    }

    gi->preview_dirty = 0;
    gi->preview_revision++;
}

static int write_preview_chunk(GridsInstance *gi, int lane, int offset,
                               char *buf, int buf_len)
{
    char chunk[5];

    if (!gi || !buf || buf_len <= 0) return -1;
    if (lane < 0 || lane >= GRIDS_NUM_LANES) return -1;
    if (offset < 0 || offset > (GRIDS_NUM_STEPS - 4)) return -1;

    refresh_preview_cache(gi);

    for (int i = 0; i < 4; i++) {
        chunk[i] = gi->preview[lane][offset + i];
    }
    chunk[4] = '\0';

    return snprintf(buf, buf_len, "%s", chunk);
}

/* -------------------------------------------------------------------------
 * midi_fx_api_v1_t callbacks
 * ---------------------------------------------------------------------- */

static void *grids_create_instance(const char *module_dir,
                                    const char *config_json)
{
    (void)module_dir;
    (void)config_json;

    GridsInstance *gi = (GridsInstance *)calloc(1, sizeof(GridsInstance));
    if (!gi) return NULL;

    grids_init(&gi->engine);
    grids_set_map_xy(&gi->engine, 128, 128);
    grids_set_density(&gi->engine, 0, 128);
    grids_set_density(&gi->engine, 1, 128);
    grids_set_density(&gi->engine, 2, 128);
    grids_set_randomness(&gi->engine, 0);

    gi->frames_until_tick = frames_per_step(44100, DEFAULT_BPM);
    gi->clock_running = 1;  /* always running — no host clock query */
    gi->sync_mode = 0;
    gi->step_length = DEFAULT_STEP_LENGTH;
    gi->internal_bpm = (uint16_t)DEFAULT_BPM;

    gi->note[0] = DEFAULT_NOTE_KICK;
    gi->note[1] = DEFAULT_NOTE_SNARE;
    gi->note[2] = DEFAULT_NOTE_HAT;
    gi->preview_dirty = 1;

    return gi;
}

static void grids_destroy_instance(void *instance)
{
    free(instance);
}

static int grids_process_midi(void *instance,
                               const uint8_t *in_msg, int in_len,
                               uint8_t out_msgs[][3], int out_lens[],
                               int max_out)
{
    GridsInstance *gi = (GridsInstance *)instance;
    if (!gi || in_len == 0) return 0;

    if (gi->sync_mode != 0) {
        if (in_msg[0] == 0xFA) {
            grids_engine_reset(&gi->engine);
            gi->frames_until_tick = frames_per_step(44100, current_bpm(gi));
            gi->clock_running = 1;
            return flush_all_notes(gi, out_msgs, out_lens, max_out, 0);
        }
        return 0;
    }

    if (in_msg[0] == 0xFA) {
        grids_engine_reset(&gi->engine);
        gi->frames_until_tick = frames_per_step(44100, current_bpm(gi));
        gi->clock_running = 1;
        return flush_all_notes(gi, out_msgs, out_lens, max_out, 0);
    }
    if (in_msg[0] == 0xFB) {
        gi->clock_running = 1;
        return flush_all_notes(gi, out_msgs, out_lens, max_out, 0);
    }
    if (in_msg[0] == 0xFC) {
        gi->clock_running = 0;
        return flush_all_notes(gi, out_msgs, out_lens, max_out, 0);
    }
    return 0;
}

static int grids_plugin_tick(void *instance,
                              int frames, int sample_rate,
                              uint8_t out_msgs[][3], int out_lens[],
                              int max_out)
{
    GridsInstance *gi = (GridsInstance *)instance;
    if (!gi) return 0;

    float bpm = current_bpm(gi);
    uint32_t fps = frames_per_step(sample_rate, bpm);
    uint32_t gate = frames_per_gate(sample_rate, bpm);
    uint32_t nf = (uint32_t)frames;
    int count = advance_pending_notes(gi, nf, out_msgs, out_lens, max_out, 0);
    if (count >= max_out) return count;

    /* clock_running is always 1 after init; 0xFC (Stop) can pause it */
    if (!gi->clock_running) return count;

    if (gi->frames_until_tick <= nf) {
        uint32_t carry = nf - gi->frames_until_tick;
        gi->frames_until_tick = fps > carry ? fps - carry : 1u;
        return count + do_step(gi, gate, out_msgs + count, out_lens + count, max_out - count);
    }
    gi->frames_until_tick -= nf;
    return count;
}

static void grids_set_param(void *instance, const char *key, const char *val)
{
    GridsInstance *gi = (GridsInstance *)instance;
    if (!gi || !key || !val) return;

    if      (strcmp(key, "map_x")         == 0)
        grids_set_map_xy(&gi->engine, parse_norm(val), gi->engine.map_y);
    else if (strcmp(key, "map_y")         == 0)
        grids_set_map_xy(&gi->engine, gi->engine.map_x, parse_norm(val));
    else if (strcmp(key, "density_kick")  == 0)
        grids_set_density(&gi->engine, 0, parse_norm(val));
    else if (strcmp(key, "density_snare") == 0)
        grids_set_density(&gi->engine, 1, parse_norm(val));
    else if (strcmp(key, "density_hat")   == 0)
        grids_set_density(&gi->engine, 2, parse_norm(val));
    else if (strcmp(key, "randomness")    == 0)
        grids_set_randomness(&gi->engine, parse_norm(val));
    else if (strcmp(key, "steps")         == 0) {
        gi->step_length = parse_steps(val);
        if (gi->engine.step >= gi->step_length) {
            gi->engine.step = 0;
        }
        mark_preview_dirty(gi);
    }
    else if (strcmp(key, "sync")          == 0) {
        gi->sync_mode = parse_sync_mode(val);
        gi->frames_until_tick = frames_per_step(44100, current_bpm(gi));
        if (gi->sync_mode != 0) {
            gi->clock_running = 1;
        } else if (g_host && g_host->get_clock_status) {
            gi->clock_running = (uint8_t)(g_host->get_clock_status() == MOVE_CLOCK_STATUS_RUNNING);
        }
    }
    else if (strcmp(key, "bpm")           == 0) {
        gi->internal_bpm = parse_bpm(val);
        if (gi->sync_mode != 0) {
            gi->frames_until_tick = frames_per_step(44100, current_bpm(gi));
        }
    }
    else if (strcmp(key, "kick_note")     == 0)
        gi->note[0] = parse_note(val);
    else if (strcmp(key, "snare_note")    == 0)
        gi->note[1] = parse_note(val);
    else if (strcmp(key, "hat_note")      == 0)
        gi->note[2] = parse_note(val);
    else if (strcmp(key, "grid_view")     == 0)
        gi->grid_view = (atoi(val) != 0) ? 1 : 0;

    if (strcmp(key, "map_x") == 0 ||
        strcmp(key, "map_y") == 0 ||
        strcmp(key, "density_kick") == 0 ||
        strcmp(key, "density_snare") == 0 ||
        strcmp(key, "density_hat") == 0 ||
        strcmp(key, "randomness") == 0) {
        mark_preview_dirty(gi);
    }
}

static int grids_get_param(void *instance, const char *key,
                            char *buf, int buf_len)
{
    GridsInstance *gi = (GridsInstance *)instance;
    if (!gi || !key || !buf || buf_len <= 0) return -1;

    if (strcmp(key, "steps") == 0)
        return snprintf(buf, buf_len, "%u", gi->step_length);
    if (strcmp(key, "sync") == 0)
        return snprintf(buf, buf_len, "%s", gi->sync_mode ? "internal" : "move");
    if (strcmp(key, "bpm") == 0)
        return snprintf(buf, buf_len, "%u", gi->internal_bpm);
    if (strcmp(key, "kick_note") == 0)
        return snprintf(buf, buf_len, "%d", gi->note[0]);
    if (strcmp(key, "snare_note") == 0)
        return snprintf(buf, buf_len, "%d", gi->note[1]);
    if (strcmp(key, "hat_note") == 0)
        return snprintf(buf, buf_len, "%d", gi->note[2]);
    if (strcmp(key, "grid_view") == 0)
        return snprintf(buf, buf_len, "%d", gi->grid_view);
    if (strcmp(key, "play_step") == 0)
        return snprintf(buf, buf_len, "%u", gi->engine.step);
    if (strcmp(key, "preview_rev") == 0) {
        refresh_preview_cache(gi);
        return snprintf(buf, buf_len, "%u", gi->preview_revision);
    }
    if (strcmp(key, "preview_kick") == 0) {
        refresh_preview_cache(gi);
        return snprintf(buf, buf_len, "%s", gi->preview[0]);
    }
    if (strcmp(key, "preview_snare") == 0) {
        refresh_preview_cache(gi);
        return snprintf(buf, buf_len, "%s", gi->preview[1]);
    }
    if (strcmp(key, "preview_hat") == 0) {
        refresh_preview_cache(gi);
        return snprintf(buf, buf_len, "%s", gi->preview[2]);
    }
    if (strcmp(key, "preview_kick_1") == 0)  return write_preview_chunk(gi, 0,  0, buf, buf_len);
    if (strcmp(key, "preview_kick_2") == 0)  return write_preview_chunk(gi, 0,  4, buf, buf_len);
    if (strcmp(key, "preview_kick_3") == 0)  return write_preview_chunk(gi, 0,  8, buf, buf_len);
    if (strcmp(key, "preview_kick_4") == 0)  return write_preview_chunk(gi, 0, 12, buf, buf_len);
    if (strcmp(key, "preview_snare_1") == 0) return write_preview_chunk(gi, 1,  0, buf, buf_len);
    if (strcmp(key, "preview_snare_2") == 0) return write_preview_chunk(gi, 1,  4, buf, buf_len);
    if (strcmp(key, "preview_snare_3") == 0) return write_preview_chunk(gi, 1,  8, buf, buf_len);
    if (strcmp(key, "preview_snare_4") == 0) return write_preview_chunk(gi, 1, 12, buf, buf_len);
    if (strcmp(key, "preview_hat_1") == 0)   return write_preview_chunk(gi, 2,  0, buf, buf_len);
    if (strcmp(key, "preview_hat_2") == 0)   return write_preview_chunk(gi, 2,  4, buf, buf_len);
    if (strcmp(key, "preview_hat_3") == 0)   return write_preview_chunk(gi, 2,  8, buf, buf_len);
    if (strcmp(key, "preview_hat_4") == 0)   return write_preview_chunk(gi, 2, 12, buf, buf_len);

    float v = -1.0f;
    if      (strcmp(key, "map_x")         == 0) v = gi->engine.map_x      / 255.0f;
    else if (strcmp(key, "map_y")         == 0) v = gi->engine.map_y      / 255.0f;
    else if (strcmp(key, "density_kick")  == 0) v = gi->engine.density[0] / 255.0f;
    else if (strcmp(key, "density_snare") == 0) v = gi->engine.density[1] / 255.0f;
    else if (strcmp(key, "density_hat")   == 0) v = gi->engine.density[2] / 255.0f;
    else if (strcmp(key, "randomness")    == 0) v = gi->engine.randomness / 255.0f;

    if (v < 0.0f) return -1;
    return snprintf(buf, buf_len, "%.4f", v);
}

/* -------------------------------------------------------------------------
 * Module entry point
 * ---------------------------------------------------------------------- */

static midi_fx_api_v1_t g_api = {
    .api_version      = MIDI_FX_API_VERSION,
    .create_instance  = grids_create_instance,
    .destroy_instance = grids_destroy_instance,
    .process_midi     = grids_process_midi,
    .tick             = grids_plugin_tick,
    .set_param        = grids_set_param,
    .get_param        = grids_get_param,
};

midi_fx_api_v1_t *move_midi_fx_init(const host_api_v1_t *host)
{
    g_host = host;
    return &g_api;
}
