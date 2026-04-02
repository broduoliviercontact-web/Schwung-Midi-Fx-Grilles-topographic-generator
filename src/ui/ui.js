/**
 * ui.js — Grids Move UI
 *
 * Single performance page. No menu depth.
 *
 * ── Hardware mapping ─────────────────────────────────────────────────────
 *
 *  KNOBS (CCs 71-76, relative)
 *    71 → map_x        72 → map_y
 *    73 → density_kick  74 → density_snare
 *    75 → density_hat   76 → randomness
 *
 *  PADS (notes 68-99, 4 rows × 8 cols)
 *    32 pads act as a 2-D XY map navigator.
 *    Col 0-7 = X: 0.0 → 1.0 (left → right)
 *    Row 0-3 = Y: 0.0 → 1.0 (bottom → top)
 *    Nearest active pad is lit bright; adjacents fade by distance.
 *
 *  TRACK BUTTONS (CCs 40-43)
 *    40 → focus density_kick   41 → focus density_snare
 *    42 → focus density_hat    43 → focus randomness
 *    Focused param: jog wheel fine-tunes it; highlighted on display.
 *
 *  STEP BUTTONS (notes 16-18)
 *    16 → focus kick_note   17 → focus snare_note   18 → focus hat_note
 *    Use jog wheel to change the selected note by semitone.
 *
 *  JOG WHEEL (CC 14 relative)
 *    Fine-tunes focused param (±0.005 per click).
 *
 *  JOG CLICK (CC 3)
 *    Reset focused param to its default value.
 *
 * ── Display layout (128×64 monochrome) ───────────────────────────────────
 *
 *  y= 0 h= 8  Title row:  GRIDS  K● S  H●  07
 *  y=10 h= 7  X bar:      [████████████████░░░░]  (full width minus label)
 *  y=18 h= 7  Y bar:      [████████░░░░░░░░░░░░]
 *  y=26 h= 7  Density row: K[████]  S[██░░]  H[████░]
 *  y=34 h= 7  Chaos row:   ~[██░░░░░░░░░░░░░░░░]
 *  y=44 h=20  Step runner: 32 columns × 4 px, current step = filled column,
 *                          rest = tick mark; K/S/H trigger lights at step.
 *
 * ── LED budget ───────────────────────────────────────────────────────────
 *  Normal tick:  ≤ 8 LED writes (pad XY proximity diff, spread over 4 ticks)
 *  Trigger tick: 3 extra writes (trigger flash on pads, auto-fades)
 *  Full pad redraw (on XY param change): 32 writes spread over 4 ticks = 8/tick
 */

'use strict';

import {
  decodeDelta,
  isCapacitiveTouchMessage
} from '/data/UserData/schwung/shared/input_filter.mjs';

/* ═══════════════════════════════════════════════════════════════════════════
 * Constants
 * ═══════════════════════════════════════════════════════════════════════════ */

const PAD_BASE  = 68;   // pad notes 68..99
const STEP_BASE = 16;   // step button notes 16..31

const CC_KNOB_BASE   = 71;   // knobs 71..78
const CC_TRACK_BASE  = 40;   // track buttons 40..43
const CC_JOG_WHEEL   = 14;
const CC_JOG_CLICK   = 3;

// Knob → param key
const KNOB_PARAMS = {
  71: 'map_x',
  72: 'map_y',
  73: 'density_kick',
  74: 'density_snare',
  75: 'density_hat',
  76: 'randomness',
};

// Track button → focus target
const TRACK_FOCUS = {
  40: 'density_kick',
  41: 'density_snare',
  42: 'density_hat',
  43: 'randomness',
};

const STEP_FOCUS = {
  16: 'kick_note',
  17: 'snare_note',
  18: 'hat_note',
  19: 'grid_view',
};

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
  grid_view:     0,
};

// Trigger flash duration in ticks (~44 ticks/s)
const FLASH_TICKS = 5;
const GRID_VIEW_STEPS = 16;

// Pad glow thresholds (normalised XY distance)
const PAD_BRIGHT_NEAR = 0.07;   // 127
const PAD_BRIGHT_MED  = 0.22;   // 50
const PAD_BRIGHT_FAR  = 0.45;   // 12

/* ═══════════════════════════════════════════════════════════════════════════
 * Module state  (pure data, no DOM)
 * ═══════════════════════════════════════════════════════════════════════════ */

const g = {
  params: { ...PARAM_DEFAULTS },

  step:        0,        // 0..31 (read back from DSP host)

  // Per-lane trigger flash counters (counts down from FLASH_TICKS to 0)
  flash:       [0, 0, 0],   // 0=kick, 1=snare, 2=hat

  // Preview grid: 3 lanes × 32 steps. 0=empty, 1=trigger, 2=accent
  previewGrid: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
  previewRev:  -1,

  focused:     null,     // param key currently focused by track button / last knob

  // LED bookkeeping: avoid redundant writes
  padLEDCache: new Uint8Array(32),
  padDirty:    true,     // set true → spread 32 updates over 4 ticks
  padDirtyPhase: 0,      // 0..3, which 8-pad slice to update this tick
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Clamp a value to [0, 1] */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pad index → normalised { x, y }.
 *  Row 0 = bottom of device = Y=0; row 3 = top = Y=1. */
function padIndexToXY(idx) {
  return { x: (idx % 8) / 7, y: Math.floor(idx / 8) / 3 };
}

/** Target brightness for a pad given current map XY position. */
function padGlow(idx, mx, my) {
  const { x, y } = padIndexToXY(idx);
  const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
  if (d < PAD_BRIGHT_NEAR) return 127;
  if (d < PAD_BRIGHT_MED)  return 50;
  if (d < PAD_BRIGHT_FAR)  return 12;
  return 0;
}

/** Send an LED message to a pad.
 *  ASSUMPTION: Move LEDs accept note-on on internal channel 1.
 *  Adjust type byte (first arg) if Move hardware differs. */
function setLED(note, vel) {
  move_midi_internal_send([0, 0x90, note, vel]);
}

function clampParam(key, value) {
  if (key === 'kick_note' || key === 'snare_note' || key === 'hat_note') {
    const rounded = Math.round(value);
    return rounded < 0 ? 0 : rounded > 127 ? 127 : rounded;
  }
  if (key === 'grid_view') return value ? 1 : 0;
  return clamp01(value);
}

function formatParamValue(key, value) {
  if (key === 'kick_note' || key === 'snare_note' || key === 'hat_note') {
    return String(Math.round(value));
  }
  if (key === 'grid_view') return String(value ? 1 : 0);
  return value.toFixed(4);
}

function paramDelta(key, delta) {
  if (key === 'kick_note' || key === 'snare_note' || key === 'hat_note') {
    return delta;
  }
  return delta * 0.005;
}

function laneCharToCell(ch) {
  if (ch === 'A') return 2;
  if (ch === 'X') return 1;
  return 0;
}

function loadPreviewLane(raw, lane) {
  const target = g.previewGrid[lane];
  for (let i = 0; i < 32; i++) {
    target[i] = laneCharToCell(raw && i < raw.length ? raw[i] : '.');
  }
}

function refreshPreview(force = false) {
  const rawRev = host_module_get_param('preview_rev');
  const rev = rawRev !== undefined && rawRev !== null ? parseInt(rawRev, 10) : NaN;
  if (!force && Number.isFinite(rev) && rev === g.previewRev) return;

  loadPreviewLane(host_module_get_param('preview_kick') || '', 0);
  loadPreviewLane(host_module_get_param('preview_snare') || '', 1);
  loadPreviewLane(host_module_get_param('preview_hat') || '', 2);
  if (Number.isFinite(rev)) g.previewRev = rev;
}

function refreshPlayhead() {
  const raw = host_module_get_param('play_step');
  if (raw === undefined || raw === null) return;
  const step = parseInt(raw, 10);
  if (Number.isFinite(step)) g.step = step & 31;
}

/** Write a single param value to the DSP. */
function setParam(key, value) {
  const next = clampParam(key, value);
  g.params[key] = next;
  host_module_set_param(key, formatParamValue(key, next));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Display rendering
 * All pixel coords assume 128×64, 5×7 font (≈6 px/char).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Draw a pixel-based bar at (bx, by) with total inner width bw. */
function drawBar(bx, by, bw, bh, value) {
  const filled = Math.round(clamp01(value) * bw);
  draw_rect(bx - 1, by - 1, bw + 2, bh + 2, 1);  // outline
  if (filled > 0) fill_rect(bx, by, filled, bh, 1);
  if (filled < bw) fill_rect(bx + filled, by, bw - filled, bh, 0);
}

function renderParams() {
  const p = g.params;

  /* ── Row 0: title + trigger indicators + step number ─────────────── */
  const kDot = g.flash[0] > 0 ? '*' : '.';
  const sDot = g.flash[1] > 0 ? '*' : '.';
  const hDot = g.flash[2] > 0 ? '*' : '.';
  const stepNum = String(g.step + 1).padStart(2, '0');
  print(0,  0, 'GRIDS', 1);
  print(44, 0, `K${kDot}S${sDot}H${hDot}`, 1);
  print(104, 0, stepNum, 1);

  /* ── Row 1: Map X bar ────────────────────────────────────────────── */
  print(0, 10, 'X', 1);
  drawBar(10, 11, 114, 5, p.map_x);

  /* ── Row 2: Map Y bar ────────────────────────────────────────────── */
  print(0, 18, 'Y', 1);
  drawBar(10, 19, 114, 5, p.map_y);

  /* ── Row 3: Density bars ─────────────────────────────────────────── */
  const dw = 32;
  const focK = g.focused === 'density_kick'  ? '>' : ' ';
  const focS = g.focused === 'density_snare' ? '>' : ' ';
  const focH = g.focused === 'density_hat'   ? '>' : ' ';
  print(0,  26, `K${focK}`, 1);  drawBar(13, 27, dw, 5, p.density_kick);
  print(48, 26, `S${focS}`, 1);  drawBar(61, 27, dw, 5, p.density_snare);
  print(96, 26, `H${focH}`, 1);  drawBar(109, 27, dw - 15, 5, p.density_hat);

  /* ── Row 4: Chaos bar ────────────────────────────────────────────── */
  const focC = g.focused === 'randomness' ? '>' : ' ';
  print(0, 34, `~${focC}`, 1);
  drawBar(13, 35, 111, 5, p.randomness);

  /* ── Row 5: Note values ──────────────────────────────────────────── */
  const focKN = g.focused === 'kick_note'  ? '>' : ' ';
  const focSN = g.focused === 'snare_note' ? '>' : ' ';
  const focHN = g.focused === 'hat_note'   ? '>' : ' ';
  print(0, 42, `K${focKN}${p.kick_note} S${focSN}${p.snare_note} H${focHN}${p.hat_note}`, 1);

  /* ── Row 6: Grid view toggle ─────────────────────────────────────── */
  const focV = g.focused === 'grid_view' ? '>' : ' ';
  const viewLabel = g.params.grid_view ? 'ON ' : 'OFF';
  print(0, 54, `GRID${focV}${viewLabel}`, 1);
}

function renderGrid() {
  /* Full-screen step grid — compact 16-step preview.
   * 3 lanes × 16 visible steps. Display 128×64.
   * Lane row heights: 16px each, leaving 16px for header.
   * Each step cell uses 8 px stride → 16 steps fill the screen width.
   * cell=0 → single dot   cell=1 → outline rect   cell=2 → filled (accent)
   * Current step → inverted (white bg, black content). */

  /* ── Header: lane labels + step counter ─────────────────────────── */
  const stepNum = String(g.step + 1).padStart(2, '0');
  print(0,  0, 'K', 1);
  print(0, 18, 'S', 1);
  print(0, 36, 'H', 1);
  print(110, 0, stepNum, 1);

  /* step separator line */
  fill_rect(0, 14, 128, 1, 1);

  const LANE_Y  = [1, 19, 37];   // top-left y of each lane row
  const CELL_H  = 12;            // cell height (px)
  const CELL_W  = 5;
  const STEP_W  = 8;             // step stride
  const X0      = 0;
  const visibleStep = g.step % GRID_VIEW_STEPS;

  for (let s = 0; s < GRID_VIEW_STEPS; s++) {
    const sx  = X0 + s * STEP_W;
    const cur = s === visibleStep;

    if (s > 0 && s % 4 === 0) {
      fill_rect(sx - 1, 1, 1, 48, 1);
    }

    for (let lane = 0; lane < 3; lane++) {
      const ry   = LANE_Y[lane];
      const cell = g.previewGrid[lane][s];

      if (cur) {
        // current step: filled column, content inverted
        fill_rect(sx, ry, CELL_W, CELL_H, 1);
        if (cell === 0) {
          // empty: hollow centre
          fill_rect(sx + 1, ry + 4, 1, 4, 0);
        } else if (cell === 1) {
          // trigger: inverted solid block
          fill_rect(sx, ry + 2, CELL_W, CELL_H - 4, 0);
        }
        // accent (cell===2): stays fully filled
      } else if (cell === 2) {
        fill_rect(sx, ry + 1, CELL_W, CELL_H - 2, 1);   // accent: tall filled
      } else if (cell === 1) {
        fill_rect(sx, ry + 3, CELL_W, CELL_H - 6, 1);   // trigger: short filled
      } else {
        set_pixel(sx + 1, ry + 5, 1);                    // empty: dot
      }
    }
  }

  /* ── Bottom hint ─────────────────────────────────────────────────── */
  print(0, 54, '[43: params]', 1);
}

function render() {
  clear_screen();
  if (g.params.grid_view) {
    renderGrid();
  } else {
    renderParams();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pad LED management (spread updates to stay under 60/frame)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Refresh 8 pad LEDs (one phase of 4) per call.
 * Full pad redraw completes in 4 consecutive ticks = ≤8 writes/tick.
 */
function updatePadSlice() {
  const mx = g.params.map_x;
  const my = g.params.map_y;
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
 * Schwung lifecycle
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.init = function () {
  // Pull current param values from DSP
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    const raw = host_module_get_param(key);
    if (raw !== undefined && raw !== null) {
      g.params[key] = parseFloat(raw);
    }
  }
  refreshPreview(true);
  refreshPlayhead();
  g.padDirty = true;
};

globalThis.tick = function () {
  // Age flash counters
  for (let i = 0; i < 3; i++) {
    if (g.flash[i] > 0) g.flash[i]--;
  }

  refreshPlayhead();
  refreshPreview();

  render();

  if (g.padDirty) updatePadSlice();
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Internal MIDI — hardware inputs (knobs, pads, jog, track buttons)
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageInternal = function (data) {
  if (!data || data.length < 3) return;
  if (isCapacitiveTouchMessage(data)) return;

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  const type   = status & 0xF0;

  /* ── CC messages (knobs, jog, track buttons) ── */
  if (type === 0xB0) {

    // Knobs 71–76 → direct param control (coarse, ±1% per click)
    if (b1 >= 71 && b1 <= 76 && KNOB_PARAMS[b1]) {
      const key   = KNOB_PARAMS[b1];
      const delta = decodeDelta(b2) * 0.01;
      setParam(key, clamp01(g.params[key] + delta));
      g.focused = key;
      if (key === 'map_x' || key === 'map_y') g.padDirty = true;
      return;
    }

    // Track buttons 40–43 → focus a lane for jog-wheel control
    if (b1 >= 40 && b1 <= 43 && b2 > 0 && TRACK_FOCUS[b1]) {
      g.focused = TRACK_FOCUS[b1];
      return;
    }

    // Jog wheel → fine-tune focused param (±0.5% per click)
    if (b1 === CC_JOG_WHEEL && g.focused) {
      if (g.focused === 'grid_view') {
        setParam('grid_view', decodeDelta(b2) > 0 ? 1 : 0);
        return;
      }
      const delta = paramDelta(g.focused, decodeDelta(b2));
      setParam(g.focused, g.params[g.focused] + delta);
      if (g.focused === 'map_x' || g.focused === 'map_y') g.padDirty = true;
      return;
    }

    // Jog click → toggle grid_view if focused, else reset param to default
    if (b1 === CC_JOG_CLICK && b2 > 0 && g.focused) {
      if (g.focused === 'grid_view') {
        setParam('grid_view', g.params.grid_view ? 0 : 1);
        return;
      }
      setParam(g.focused, PARAM_DEFAULTS[g.focused]);
      if (g.focused === 'map_x' || g.focused === 'map_y') g.padDirty = true;
      return;
    }
  }

  /* ── Pad note-on → jump map XY ── */
  if (type === 0x90 && b1 >= PAD_BASE && b1 < PAD_BASE + 32 && b2 > 0) {
    const idx    = b1 - PAD_BASE;
    const { x, y } = padIndexToXY(idx);
    setParam('map_x', x);
    setParam('map_y', y);
    g.padDirty = true;
    return;
  }

  if (type === 0x90 && b2 > 0 && STEP_FOCUS[b1]) {
    g.focused = STEP_FOCUS[b1];
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 * External MIDI — DSP trigger output + optional MIDI clock
 * ═══════════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageExternal = function (data) {
  if (!data || data.length < 2) return;

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;

  // DSP sends note-on on channel 1 (0x90) for triggers
  // velocity 127 = accent, 80 = normal
  if (status === 0x90 && b2 > 0) {
    if (b1 === g.params.kick_note)  g.flash[0] = FLASH_TICKS;
    if (b1 === g.params.snare_note) g.flash[1] = FLASH_TICKS;
    if (b1 === g.params.hat_note)   g.flash[2] = FLASH_TICKS;
    return;
  }

  // MIDI clock (0xF8) — sync step counter to external tempo
  if (status === 0xF8) {
    return;
  }

  // MIDI Start (0xFA) — reset step
  if (status === 0xFA) {
    return;
  }
};
