/**
 * ui.js — Grilles Move UI
 *
 * Two pages, jog wheel navigation, click-to-edit.
 *
 * ── Pages ────────────────────────────────────────────────────────────────────
 *  PAGE_MAIN  (0): map_x, map_y, density_kick, density_snare, density_hat, randomness
 *  PAGE_PARAMS(1): kick_note, snare_note, hat_note, steps, sync, bpm
 *
 * ── Jog navigation ───────────────────────────────────────────────────────────
 *  Jog turn (not editing) → move cursor between params (wraps pages)
 *  Jog click              → toggle edit mode on focused param
 *  Jog turn (editing)     → change focused param value
 *
 * ── Hardware shortcuts ───────────────────────────────────────────────────────
 *  KNOBS 71-76 → direct param control (always work, auto-focus)
 *  TRACK 40-43 → direct focus density params
 *  STEP  16-18 → direct focus note params (jumps to PAGE_PARAMS)
 *  PADS  68-99 → set map XY position (PAGE_MAIN only)
 */

'use strict';

import {
  decodeDelta,
  decodeAcceleratedDelta,
  setLED as sharedSetLED,
} from '/data/UserData/schwung/shared/input_filter.mjs';

/* ═══════════════════════════════════════════════════════════════════════════
 * Constants
 * ═══════════════════════════════════════════════════════════════════════════ */

const PAD_BASE  = 68;
const STEP_BASE = 16;

const CC_JOG_WHEEL  = 14;
const CC_JOG_CLICK  = 3;
const CC_KNOB_BASE  = 71;
const CC_TRACK_BASE = 40;

const PAGE_MAIN   = 0;
const PAGE_PARAMS = 1;

const FLASH_TICKS = 5;

const PAD_BRIGHT_NEAR = 0.07;
const PAD_BRIGHT_MED  = 0.22;
const PAD_BRIGHT_FAR  = 0.45;

// Knob → param key (apply on both pages)
const KNOB_PARAMS = {
  71: 'map_x',
  72: 'map_y',
  73: 'density_kick',
  74: 'density_snare',
  75: 'density_hat',
  76: 'randomness',
};

// Track button → density param (direct focus)
const TRACK_FOCUS = {
  43: 'density_kick',
  42: 'density_snare',
  41: 'density_hat',
  40: 'randomness',
};

// Step button → note param (direct focus, jumps to PAGE_PARAMS)
const STEP_FOCUS = {
  16: 'kick_note',
  17: 'snare_note',
  18: 'hat_note',
};

const MAIN_PARAM_LIST   = ['map_x', 'map_y', 'density_kick', 'density_snare', 'density_hat', 'randomness'];
const PARAMS_PARAM_LIST = ['kick_note', 'snare_note', 'hat_note', 'steps', 'sync', 'bpm'];

const PARAM_DEFAULTS = {
  map_x:         0.5,
  map_y:         0.5,
  density_kick:  0.5,
  density_snare: 0.5,
  density_hat:   0.5,
  randomness:    0.0,
  kick_note:     36,
  snare_note:    38,
  hat_note:      42,
  steps:         16,
  sync:          0,
  bpm:           120,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * State
 * ═══════════════════════════════════════════════════════════════════════════ */

const g = {
  params:       { ...PARAM_DEFAULTS },
  page:         PAGE_MAIN,
  focused:      null,
  editing:      false,
  step:         0,
  flash:        [0, 0, 0],
  padLEDCache:  new Uint8Array(32),
  padDirty:     true,
  padDirtyPhase: 0,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Param helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

function isIntParam(key) {
  return key === 'kick_note' || key === 'snare_note' || key === 'hat_note' ||
         key === 'steps' || key === 'bpm';
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function clampParam(key, value) {
  if (key === 'kick_note' || key === 'snare_note' || key === 'hat_note') {
    const n = Math.round(value);
    return n < 0 ? 0 : n > 127 ? 127 : n;
  }
  if (key === 'steps') {
    const n = Math.round(value);
    return n < 1 ? 1 : n > 32 ? 32 : n;
  }
  if (key === 'bpm') {
    const n = Math.round(value);
    return n < 40 ? 40 : n > 240 ? 240 : n;
  }
  if (key === 'sync') return Math.round(value) !== 0 ? 1 : 0;
  return clamp01(value);
}

function formatParamValue(key, value) {
  if (isIntParam(key) || key === 'sync') return String(Math.round(value));
  return value.toFixed(4);
}

function paramDelta(key, delta) {
  if (isIntParam(key) || key === 'sync') return delta > 0 ? 1 : -1;
  return delta * 0.005;
}

function knobDelta(key, delta) {
  if (isIntParam(key)) return decodeAcceleratedDelta !== undefined
    ? delta : (delta > 0 ? 1 : -1);
  return delta * 0.01;
}

function setParam(key, value) {
  const next = clampParam(key, value);
  g.params[key] = next;
  host_module_set_param(key, formatParamValue(key, next));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Page / cursor navigation
 * ═══════════════════════════════════════════════════════════════════════════ */

function currentParamList() {
  return g.page === PAGE_PARAMS ? PARAMS_PARAM_LIST : MAIN_PARAM_LIST;
}

function moveCursor(delta) {
  const list = currentParamList();
  const idx  = list.indexOf(g.focused);
  const raw  = idx < 0 ? 0 : idx + delta;

  if (raw < 0) {
    // début de liste → page précédente, dernier param
    g.page    = PAGE_MAIN;
    g.focused = MAIN_PARAM_LIST[MAIN_PARAM_LIST.length - 1];
    g.editing = false;
  } else if (raw >= list.length) {
    // fin de liste → page suivante, premier param
    g.page    = PAGE_PARAMS;
    g.focused = PARAMS_PARAM_LIST[0];
    g.editing = false;
  } else {
    g.focused = list[raw];
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pad LED management
 * ═══════════════════════════════════════════════════════════════════════════ */

function padIndexToXY(idx) {
  return { x: (idx % 8) / 7, y: Math.floor(idx / 8) / 3 };
}

function padGlow(idx, mx, my) {
  const { x, y } = padIndexToXY(idx);
  const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
  if (d < PAD_BRIGHT_NEAR) return 127;
  if (d < PAD_BRIGHT_MED)  return 50;
  if (d < PAD_BRIGHT_FAR)  return 12;
  return 0;
}

function setLED(note, vel) { sharedSetLED(note, vel); }

function updatePadSlice() {
  const mx   = g.params.map_x;
  const my   = g.params.map_y;
  const base = g.padDirtyPhase * 8;

  for (let i = base; i < base + 8; i++) {
    const target = padGlow(i, mx, my);
    if (g.padLEDCache[i] !== target) {
      g.padLEDCache[i] = target;
      setLED(PAD_BASE + i, target);
    }
  }

  g.padDirtyPhase = (g.padDirtyPhase + 1) & 3;
  if (g.padDirtyPhase === 0) g.padDirty = false;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Rendering
 * ═══════════════════════════════════════════════════════════════════════════ */

function drawBar(bx, by, bw, bh, value) {
  const filled = Math.round(clamp01(value) * bw);
  draw_rect(bx - 1, by - 1, bw + 2, bh + 2, 1);
  if (filled > 0)  fill_rect(bx, by, filled, bh, 1);
  if (filled < bw) fill_rect(bx + filled, by, bw - filled, bh, 0);
}

function foc(key) { return g.focused === key ? (g.editing ? '[' : '>') : ' '; }

function renderMainPage() {
  const p = g.params;
  const kDot   = g.flash[0] > 0 ? '*' : '.';
  const sDot   = g.flash[1] > 0 ? '*' : '.';
  const hDot   = g.flash[2] > 0 ? '*' : '.';
  const stepNum = String(g.step + 1).padStart(2, '0');

  // Header
  print(0,   0, 'GRIDS', 1);
  print(44,  0, `K${kDot}S${sDot}H${hDot}`, 1);
  print(104, 0, stepNum, 1);

  // Map X/Y bars
  print(0, 10, `X${foc('map_x')}`, 1);
  drawBar(16, 11, 108, 5, p.map_x);

  print(0, 18, `Y${foc('map_y')}`, 1);
  drawBar(16, 19, 108, 5, p.map_y);

  // Density bars
  print(0,  26, `K${foc('density_kick')}`,  1); drawBar(16, 27, 26, 5, p.density_kick);
  print(45, 26, `S${foc('density_snare')}`, 1); drawBar(61, 27, 26, 5, p.density_snare);
  print(90, 26, `H${foc('density_hat')}`,   1); drawBar(106, 27, 18, 5, p.density_hat);

  // Chaos bar
  print(0, 34, `~${foc('randomness')}`, 1);
  drawBar(16, 35, 108, 5, p.randomness);

  // Footer: focused param or page hint
  if (g.focused && MAIN_PARAM_LIST.includes(g.focused)) {
    const val = isIntParam(g.focused)
      ? Math.round(p[g.focused])
      : p[g.focused].toFixed(3);
    print(0, 54, `${g.editing ? '[' : '>'}${g.focused}: ${val}`, 1);
  } else {
    print(0, 54, 'JOG:nav CLICK:edit P2>', 1);
  }
}

function renderParamsPage() {
  const p = g.params;
  const syncStr = Math.round(p.sync) === 0 ? 'MOV' : 'INT';

  // Header
  print(0, 0, 'GRIDS PARAMS', 1);

  // Notes row
  print(0,  10, `K${foc('kick_note')}${Math.round(p.kick_note)}`, 1);
  print(44, 10, `S${foc('snare_note')}${Math.round(p.snare_note)}`, 1);
  print(88, 10, `H${foc('hat_note')}${Math.round(p.hat_note)}`, 1);

  // Steps
  print(0, 24, `STEPS${foc('steps')}${Math.round(p.steps)}`, 1);

  // Sync + BPM
  print(0,  38, `SYNC${foc('sync')}${syncStr}`, 1);
  print(64, 38, `BPM${foc('bpm')}${Math.round(p.bpm)}`, 1);

  // Footer
  if (g.focused && PARAMS_PARAM_LIST.includes(g.focused)) {
    const val = isIntParam(g.focused)
      ? Math.round(p[g.focused])
      : p[g.focused].toFixed(3);
    print(0, 54, `${g.editing ? '[' : '>'}${g.focused}: ${val}`, 1);
  } else {
    print(0, 54, '<P1 JOG:nav CLICK:edit', 1);
  }
}

function render() {
  clear_screen();
  if (g.page === PAGE_PARAMS) {
    renderParamsPage();
  } else {
    renderMainPage();
  }
}

function refreshPlayhead() {
  const raw = host_module_get_param('play_step');
  if (raw === undefined || raw === null) return;
  const step = parseInt(raw, 10);
  if (Number.isFinite(step)) g.step = step & 31;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Lifecycle
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.init = function () {
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    const raw = host_module_get_param(key);
    if (raw !== undefined && raw !== null) {
      g.params[key] = parseFloat(raw);
    }
  }
  refreshPlayhead();
  g.padDirty = true;
};

globalThis.tick = function () {
  for (let i = 0; i < 3; i++) {
    if (g.flash[i] > 0) g.flash[i]--;
  }
  refreshPlayhead();
  render();
  if (g.padDirty) updatePadSlice();
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Internal MIDI
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageInternal = function (data) {
  if (!data || data.length < 3) return;
  // Filter capacitive touch notes (note-on, notes 0-9) — NOT CC messages
  if (data[0] === 0x90 && data[1] < 10) return;

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  const type   = status & 0xF0;

  if (type === 0xB0) {
    // Knobs 71-76: direct param control
    if (b1 >= 71 && b1 <= 76 && KNOB_PARAMS[b1]) {
      const key   = KNOB_PARAMS[b1];
      const delta = isIntParam(key)
        ? decodeAcceleratedDelta(b2, b1)
        : decodeDelta(b2);
      setParam(key, g.params[key] + knobDelta(key, delta));
      g.focused = key;
      g.editing = true;
      if (key === 'map_x' || key === 'map_y') g.padDirty = true;
      // Switch to correct page for knob param
      g.page = MAIN_PARAM_LIST.includes(key) ? PAGE_MAIN : PAGE_PARAMS;
      return;
    }

    // Track buttons 40-43: direct focus density param
    if (b1 >= 40 && b1 <= 43 && b2 > 0 && TRACK_FOCUS[b1]) {
      g.focused = TRACK_FOCUS[b1];
      g.editing = false;
      g.page    = PAGE_MAIN;
      return;
    }

    // Jog wheel
    if (b1 === CC_JOG_WHEEL) {
      const d = decodeDelta(b2);
      if (g.editing && g.focused) {
        setParam(g.focused, g.params[g.focused] + paramDelta(g.focused, d));
        if (g.focused === 'map_x' || g.focused === 'map_y') g.padDirty = true;
      } else {
        moveCursor(d > 0 ? 1 : -1);
      }
      return;
    }

    // Jog click: toggle edit mode
    if (b1 === CC_JOG_CLICK && b2 > 0) {
      if (!g.focused) {
        g.focused = currentParamList()[0];
        g.editing = false;
      } else {
        g.editing = !g.editing;
      }
      return;
    }
  }

  if (type === 0x90 && b2 > 0) {
    // Step buttons 16-18: focus note param on PAGE_PARAMS
    if (b1 >= STEP_BASE && b1 <= STEP_BASE + 2 && STEP_FOCUS[b1]) {
      g.focused = STEP_FOCUS[b1];
      g.editing = false;
      g.page    = PAGE_PARAMS;
      return;
    }

    // Pads: set map XY (always, any page)
    if (b1 >= PAD_BASE && b1 < PAD_BASE + 32) {
      const idx = b1 - PAD_BASE;
      const { x, y } = padIndexToXY(idx);
      setParam('map_x', x);
      setParam('map_y', y);
      g.padDirty = true;
    }
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 * External MIDI — trigger flash from DSP output
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageExternal = function (data) {
  if (!data || data.length < 2) return;
  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;

  if (status === 0x90 && b2 > 0) {
    if (b1 === g.params.kick_note)  g.flash[0] = FLASH_TICKS;
    if (b1 === g.params.snare_note) g.flash[1] = FLASH_TICKS;
    if (b1 === g.params.hat_note)   g.flash[2] = FLASH_TICKS;
  }
};
