/**
 * ui_chain.js — Grilles compact chain UI
 *
 * Loaded by the Signal Chain host when Grilles sits in a MIDI FX slot.
 * Exposes globalThis.chain_ui = { init, tick, onMidiMessageInternal }.
 *
 * Shows only the 6 live-performance params: X, Y, Kick, Snare, Hat, Chaos.
 * Knobs 71–76 map directly to these six, same as the full UI.
 * Track buttons and jog wheel also work.
 *
 * ── Display layout (128×64) ──────────────────────────────────────────────
 *  y= 0  GRILLES  K.S.H.  07
 *  y=10  X [████████████████]
 *  y=18  Y [████████████████]
 *  y=27  K [████] S [████] H [██]
 *  y=36  ~ [██░░░░░░░░░░░░░░]
 */

'use strict';

import {
  decodeDelta,
  decodeAcceleratedDelta,
  isCapacitiveTouchMessage,
  setLED as sharedSetLED,
} from '/data/UserData/schwung/shared/input_filter.mjs';

/* ── Constants ─────────────────────────────────────────────────────────── */

const PAD_BASE = 68;

const KNOB_PARAMS = {
  71: 'map_x',
  72: 'map_y',
  73: 'density_kick',
  74: 'density_snare',
  75: 'density_hat',
  76: 'randomness',
};

const TRACK_FOCUS = {
  43: 'density_kick',
  42: 'density_snare',
  41: 'density_hat',
  40: 'randomness',
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
};

const FLASH_TICKS = 5;
const PAD_BRIGHT_NEAR = 0.07;
const PAD_BRIGHT_MED  = 0.22;
const PAD_BRIGHT_FAR  = 0.45;

/* ── State ─────────────────────────────────────────────────────────────── */

const s = {
  params:       { ...PARAM_DEFAULTS },
  step:         0,
  flash:        [0, 0, 0],
  focused:      null,
  dirty:        true,
  padLEDCache:  new Uint8Array(32),
  padDirty:     true,
  padDirtyPhase: 0,
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

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

function clampFloat(v) { return clamp01(v); }

function setParam(key, value) {
  const next = clampFloat(value);
  s.params[key] = next;
  host_module_set_param(key, next.toFixed(4));
  s.dirty = true;
}

function refreshPlayhead() {
  const raw = host_module_get_param('play_step');
  if (raw === undefined || raw === null) return;
  const step = parseInt(raw, 10);
  if (Number.isFinite(step)) s.step = step & 31;
}

/* ── Render ─────────────────────────────────────────────────────────────── */

function drawBar(bx, by, bw, bh, value) {
  const filled = Math.round(clamp01(value) * bw);
  draw_rect(bx - 1, by - 1, bw + 2, bh + 2, 1);
  if (filled > 0)    fill_rect(bx, by, filled, bh, 1);
  if (filled < bw)   fill_rect(bx + filled, by, bw - filled, bh, 0);
}

function render() {
  clear_screen();
  const p = s.params;

  /* Title + trigger indicators + step */
  const kDot   = s.flash[0] > 0 ? '*' : '.';
  const sDot   = s.flash[1] > 0 ? '*' : '.';
  const hDot   = s.flash[2] > 0 ? '*' : '.';
  const stepNum = String(s.step + 1).padStart(2, '0');
  print(0,   0, 'GRILLES', 1);
  print(50,  0, `K${kDot}S${sDot}H${hDot}`, 1);
  print(104, 0, stepNum, 1);

  /* Map X / Y bars */
  print(0, 10, 'X', 1);  drawBar(10, 11, 114, 5, p.map_x);
  print(0, 18, 'Y', 1);  drawBar(10, 19, 114, 5, p.map_y);

  /* Density bars */
  const dw  = 32;
  const focK = s.focused === 'density_kick'  ? '>' : ' ';
  const focS = s.focused === 'density_snare' ? '>' : ' ';
  const focH = s.focused === 'density_hat'   ? '>' : ' ';
  print(0,  27, `K${focK}`, 1);  drawBar(13, 28, dw,      5, p.density_kick);
  print(48, 27, `S${focS}`, 1);  drawBar(61, 28, dw,      5, p.density_snare);
  print(96, 27, `H${focH}`, 1);  drawBar(109, 28, dw - 15, 5, p.density_hat);

  /* Chaos bar */
  const focC = s.focused === 'randomness' ? '>' : ' ';
  print(0, 36, `~${focC}`, 1);
  drawBar(13, 37, 111, 5, p.randomness);
}

/* ── Pad LEDs ───────────────────────────────────────────────────────────── */

function updatePadSlice() {
  const mx   = s.params.map_x;
  const my   = s.params.map_y;
  const base = s.padDirtyPhase * 8;
  for (let i = base; i < base + 8; i++) {
    const target = padGlow(i, mx, my);
    if (s.padLEDCache[i] !== target) {
      s.padLEDCache[i] = target;
      setLED(PAD_BASE + i, target);
    }
  }
  s.padDirtyPhase = (s.padDirtyPhase + 1) & 3;
  if (s.padDirtyPhase === 0) s.padDirty = false;
}

/* ── Lifecycle ──────────────────────────────────────────────────────────── */

function init() {
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    const raw = host_module_get_param(key);
    if (raw !== undefined && raw !== null) s.params[key] = parseFloat(raw);
  }
  refreshPlayhead();
  s.padDirty = true;
}

function tick() {
  for (let i = 0; i < 3; i++) {
    if (s.flash[i] > 0) { s.flash[i]--; s.dirty = true; }
  }
  const prev = s.step;
  refreshPlayhead();
  if (s.step !== prev) s.dirty = true;

  if (s.dirty) { render(); s.dirty = false; }
  if (s.padDirty) updatePadSlice();
}

/* ── Input ──────────────────────────────────────────────────────────────── */

function onMidiMessageInternal(data) {
  if (!data || data.length < 3) return;
  if (isCapacitiveTouchMessage(data)) return;

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  const type   = status & 0xF0;

  if (type === 0xB0) {
    if (b1 >= 71 && b1 <= 76 && KNOB_PARAMS[b1]) {
      const key   = KNOB_PARAMS[b1];
      const delta = decodeDelta(b2) * 0.01;
      setParam(key, s.params[key] + delta);
      s.focused = key;
      if (key === 'map_x' || key === 'map_y') s.padDirty = true;
      return;
    }
    if (b1 >= 40 && b1 <= 43 && b2 > 0 && TRACK_FOCUS[b1]) {
      s.focused = TRACK_FOCUS[b1];
      s.dirty = true;
      return;
    }
    if (b1 === 14 && s.focused && PARAM_DEFAULTS[s.focused] !== undefined) {
      const delta = decodeDelta(b2) * 0.005;
      setParam(s.focused, s.params[s.focused] + delta);
      if (s.focused === 'map_x' || s.focused === 'map_y') s.padDirty = true;
      return;
    }
  }

  if (type === 0x90 && b1 >= PAD_BASE && b1 < PAD_BASE + 32 && b2 > 0) {
    const idx    = b1 - PAD_BASE;
    const { x, y } = padIndexToXY(idx);
    setParam('map_x', x);
    setParam('map_y', y);
    s.padDirty = true;
  }
}

function onMidiMessageExternal(data) {
  if (!data || data.length < 2) return;
  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  if (status === 0x90 && b2 > 0) {
    const p = s.params;
    if (b1 === p.kick_note)  s.flash[0] = FLASH_TICKS;
    if (b1 === p.snare_note) s.flash[1] = FLASH_TICKS;
    if (b1 === p.hat_note)   s.flash[2] = FLASH_TICKS;
    s.dirty = true;
  }
}

/* ── Export chain_ui ────────────────────────────────────────────────────── */

globalThis.chain_ui = {
  init,
  tick,
  onMidiMessageInternal,
  onMidiMessageExternal,
};
