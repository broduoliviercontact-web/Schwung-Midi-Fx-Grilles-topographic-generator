/*
 * grids_midi_fx_test.c
 * Verifies the Schwung MIDI FX wrapper emits note-ons first and note-offs later.
 *
 * Build/run:
 *   cc -std=c99 -Wall -Wextra -O2 -Isrc/dsp -Isrc/host \
 *      tests/grids_midi_fx_test.c src/dsp/grids_engine.c src/dsp/grids_tables.c src/host/grids_plugin.c
 */

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

#include "../src/host/midi_fx_api_v1.h"
#include "../src/host/plugin_api_v1.h"

extern midi_fx_api_v1_t *move_midi_fx_init(const host_api_v1_t *host);

static void fail(const char *msg)
{
    fprintf(stderr, "FAIL: %s\n", msg);
    exit(1);
}

int main(void)
{
    const host_api_v1_t host = {0};
    midi_fx_api_v1_t *api = move_midi_fx_init(&host);
    if (!api) fail("move_midi_fx_init returned NULL");

    void *instance = api->create_instance(NULL, NULL);
    if (!instance) fail("create_instance returned NULL");

    api->set_param(instance, "density_kick", "1.0");
    api->set_param(instance, "density_snare", "1.0");
    api->set_param(instance, "density_hat", "1.0");

    uint8_t out[16][3];
    int lens[16];
    const uint8_t start_msg[1] = { 0xFA };

    api->process_midi(instance, start_msg, 1, out, lens, 16);

    int saw_note_on = 0;
    int saw_same_block_note_off = 0;
    int saw_later_note_off = 0;

    for (int i = 0; i < 256; i++) {
        int count = api->tick(instance, 128, 44100, out, lens, 16);
        if (count <= 0) continue;

        int block_has_on = 0;
        int block_has_off = 0;
        for (int j = 0; j < count; j++) {
            if (lens[j] != 3) fail("unexpected MIDI message length");
            if ((out[j][0] & 0xF0) == 0x90 && out[j][2] > 0) block_has_on = 1;
            if ((out[j][0] & 0xF0) == 0x80) block_has_off = 1;
        }

        if (!saw_note_on && block_has_on) {
            saw_note_on = 1;
            if (block_has_off) saw_same_block_note_off = 1;
        } else if (saw_note_on && block_has_off) {
            saw_later_note_off = 1;
            break;
        }
    }

    api->destroy_instance(instance);

    if (!saw_note_on) fail("wrapper never emitted a note-on");
    if (saw_same_block_note_off) fail("note-off was emitted in the same block as first note-on");
    if (!saw_later_note_off) fail("wrapper never emitted a later note-off");

    puts("PASS: wrapper emits note-ons with non-zero duration");
    return 0;
}
