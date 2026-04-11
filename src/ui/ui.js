'use strict';

import {
  decodeDelta,
} from '/data/UserData/schwung/shared/input_filter.mjs';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const PAD_BASE     = 68;
const CC_JOG_WHEEL = 14;
const CC_JOG_CLICK = 3;
const PAGE_MAIN    = 0;
const PAGE_PARAMS  = 1;
const FLASH_TICKS  = 5;

const PAD_BRIGHT_NEAR = 0.07;
const PAD_BRIGHT_MED  = 0.22;
const PAD_BRIGHT_FAR  = 0.45;

// Knobs 71-76 → param (contrôle direct, toujours actifs)
const KNOB_PARAMS = {
  71: 'map_x',
  72: 'map_y',
  73: 'density_kick',
  74: 'density_snare',
  75: 'density_hat',
  76: 'randomness',
};

const MAIN_PARAM_LIST = [
  'map_x', 'map_y',
  'density_kick', 'density_snare', 'density_hat',
  'randomness',
];

const PARAMS_PARAM_LIST = [
  'kick_note', 'snare_note', 'hat_note',
  'steps', 'sync', 'bpm',
];

const PARAM_DEFAULTS = {
  map_x: 0.5, map_y: 0.5,
  density_kick: 0.5, density_snare: 0.5, density_hat: 0.5,
  randomness: 0.0,
  kick_note: 36, snare_note: 38, hat_note: 42,
  steps: 16, sync: 0, bpm: 120,
};

/* ── State ─────────────────────────────────────────────────────────────────── */

const g = {
  params:        { ...PARAM_DEFAULTS },
  page:          PAGE_MAIN,    // 0 = MAIN, 1 = PARAMS
  focused:       'map_x',      // toujours une string valide
  editing:       false,
  step:          0,
  flash:         [0, 0, 0],
  padLEDCache:   new Uint8Array(32),
  padDirty:      true,
  padDirtyPhase: 0,
};

/* ── Param helpers ─────────────────────────────────────────────────────────── */

function isIntParam(key) {
  return key === 'kick_note' || key === 'snare_note' || key === 'hat_note' ||
         key === 'steps' || key === 'bpm';
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function clampParam(key, value) {
  if (key === 'kick_note' || key === 'snare_note' || key === 'hat_note') {
    const n = Math.round(value); return n < 0 ? 0 : n > 127 ? 127 : n;
  }
  if (key === 'steps') { const n = Math.round(value); return n < 1 ? 1 : n > 32 ? 32 : n; }
  if (key === 'bpm')   { const n = Math.round(value); return n < 40 ? 40 : n > 240 ? 240 : n; }
  if (key === 'sync')  { return Math.round(value) !== 0 ? 1 : 0; }
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

function setParam(key, value) {
  const next = clampParam(key, value);
  g.params[key] = next;
  host_module_set_param(key, formatParamValue(key, next));
}

/* ── Page / cursor — copié sur Branchage ──────────────────────────────────── */

function currentParamList() {
  return g.page === PAGE_PARAMS ? PARAMS_PARAM_LIST : MAIN_PARAM_LIST;
}

function cyclePage(delta, resetFocus) {
  g.page = (g.page + delta + 2) % 2;
  if (resetFocus) { g.focused = currentParamList()[0]; g.editing = false; }
  else            { g.editing = false; }
}

function moveCursor(delta) {
  const list = currentParamList();
  const idx  = list.indexOf(g.focused);
  const raw  = idx < 0 ? 0 : idx + delta;
  if (raw < 0) {
    cyclePage(-1, false);
    const nl = currentParamList();
    g.focused = nl[nl.length - 1];
  } else if (raw >= list.length) {
    cyclePage(1, false);
    g.focused = currentParamList()[0];
  } else {
    g.focused = list[raw];
  }
}

/* ── Pad LEDs ──────────────────────────────────────────────────────────────── */

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

function setLED(note, vel) {
  move_midi_internal_send([0, 0x90, note, vel]);
}

function updatePadSlice() {
  const mx = g.params.map_x, my = g.params.map_y;
  const base = g.padDirtyPhase * 8;
  for (let i = base; i < base + 8; i++) {
    const t = padGlow(i, mx, my);
    if (g.padLEDCache[i] !== t) { g.padLEDCache[i] = t; setLED(PAD_BASE + i, t); }
  }
  g.padDirtyPhase = (g.padDirtyPhase + 1) & 3;
  if (g.padDirtyPhase === 0) g.padDirty = false;
}

/* ── Rendering ─────────────────────────────────────────────────────────────── */

function drawBar(bx, by, bw, bh, value) {
  const filled = Math.round(clamp01(value) * bw);
  draw_rect(bx - 1, by - 1, bw + 2, bh + 2, 1);
  if (filled > 0)  fill_rect(bx, by, filled, bh, 1);
  if (filled < bw) fill_rect(bx + filled, by, bw - filled, bh, 0);
}

// Indicateur de focus — identique à Branchage
function foc(key) {
  return g.focused === key ? (g.editing ? '[' : '>') : ' ';
}

function dispVal(key) {
  const v = g.params[key];
  if (isIntParam(key)) return String(Math.round(v));
  if (key === 'sync')  return Math.round(v) === 0 ? 'MOV' : 'INT';
  return v.toFixed(2);
}

function renderMainPage() {
  const p     = g.params;
  const kDot  = g.flash[0] > 0 ? '*' : '.';
  const sDot  = g.flash[1] > 0 ? '*' : '.';
  const hDot  = g.flash[2] > 0 ? '*' : '.';
  const step  = String(g.step + 1).padStart(2, '0');

  print(0,   0, 'GRIDS v4', 1);
  print(66,  0, `K${kDot}S${sDot}H${hDot}`, 1);
  print(110, 0, step, 1);

  print(0, 10, `X${foc('map_x')}`, 1);
  drawBar(16, 11, 108, 5, p.map_x);

  print(0, 18, `Y${foc('map_y')}`, 1);
  drawBar(16, 19, 108, 5, p.map_y);

  print(0,  26, `K${foc('density_kick')}`,  1); drawBar(16,  27, 26, 5, p.density_kick);
  print(46, 26, `S${foc('density_snare')}`, 1); drawBar(62,  27, 26, 5, p.density_snare);
  print(92, 26, `H${foc('density_hat')}`,   1); drawBar(108, 27, 16, 5, p.density_hat);

  print(0, 34, `~${foc('randomness')}`, 1);
  drawBar(16, 35, 108, 5, p.randomness);

  // Ligne de statut — toujours visible
  const mark = g.editing ? '[EDIT]' : '[ NAV]';
  print(0, 54, `${mark} ${g.focused}: ${dispVal(g.focused)}`, 1);
}

function renderParamsPage() {
  print(0, 0, 'GRIDS 2/2', 1);

  print(0,  10, `K${foc('kick_note')}${dispVal('kick_note')}`, 1);
  print(50, 10, `S${foc('snare_note')}${dispVal('snare_note')}`, 1);
  print(100,10, `H${foc('hat_note')}${dispVal('hat_note')}`, 1);

  print(0, 26, `ST${foc('steps')}${dispVal('steps')}`, 1);

  print(0,  42, `SY${foc('sync')}${dispVal('sync')}`, 1);
  print(64, 42, `BP${foc('bpm')}${dispVal('bpm')}`, 1);

  const mark = g.editing ? '[EDIT]' : '[ NAV]';
  print(0, 54, `${mark} ${g.focused}: ${dispVal(g.focused)}`, 1);
}

function render() {
  clear_screen();
  if (g.page === PAGE_PARAMS) renderParamsPage();
  else                        renderMainPage();
}

function refreshPlayhead() {
  const raw = host_module_get_param('play_step');
  if (raw == null) return;
  const s = parseInt(raw, 10);
  if (Number.isFinite(s)) g.step = s & 31;
}

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

globalThis.init = function () {
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    const raw = host_module_get_param(key);
    if (raw != null) g.params[key] = parseFloat(raw);
  }
  g.page    = PAGE_MAIN;
  g.focused = 'map_x';
  g.editing = false;
  refreshPlayhead();
  g.padDirty = true;
};

globalThis.tick = function () {
  for (let i = 0; i < 3; i++) if (g.flash[i] > 0) g.flash[i]--;
  refreshPlayhead();
  render();
  if (g.padDirty) updatePadSlice();
};

/* ── Internal MIDI ─────────────────────────────────────────────────────────── */

globalThis.onMidiMessageInternal = function (data) {
  if (!data || data.length < 3) return;
  if (data[0] === 0x90 && data[1] < 10) return;  // filtre capacitif

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  const type   = status & 0xF0;

  if (type === 0xB0) {
    // Knobs 71-76 : contrôle direct
    if (b1 >= 71 && b1 <= 76 && KNOB_PARAMS[b1]) {
      const key   = KNOB_PARAMS[b1];
      const delta = decodeDelta(b2);
      const step  = isIntParam(key) ? (delta > 0 ? 1 : -1) : delta * 0.01;
      setParam(key, g.params[key] + step);
      g.focused = key;
      g.editing = true;
      g.page    = MAIN_PARAM_LIST.includes(key) ? PAGE_MAIN : PAGE_PARAMS;
      if (key === 'map_x' || key === 'map_y') g.padDirty = true;
      return;
    }

    // Jog wheel — navigation ou édition (copié sur Branchage)
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

    // Jog click — bascule mode édition (copié sur Branchage)
    if (b1 === CC_JOG_CLICK && b2 > 0) {
      if (!g.focused) {
        g.focused = currentParamList()[0];
        g.editing = false;
      } else {
        g.editing = !g.editing;
      }
      return;
    }
    return;
  }

  // Pads : set map XY
  if (type === 0x90 && b2 > 0 && b1 >= PAD_BASE && b1 < PAD_BASE + 32) {
    const idx = b1 - PAD_BASE;
    const { x, y } = padIndexToXY(idx);
    setParam('map_x', x);
    setParam('map_y', y);
    g.padDirty = true;
  }
};

/* ── External MIDI ─────────────────────────────────────────────────────────── */

globalThis.onMidiMessageExternal = function (data) {
  if (!data || data.length < 3) return;
  if (data[0] === 0x90 && data[2] > 0) {
    if (data[1] === g.params.kick_note)  g.flash[0] = FLASH_TICKS;
    if (data[1] === g.params.snare_note) g.flash[1] = FLASH_TICKS;
    if (data[1] === g.params.hat_note)   g.flash[2] = FLASH_TICKS;
  }
};
