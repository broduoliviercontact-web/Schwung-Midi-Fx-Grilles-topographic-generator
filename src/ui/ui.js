/**
 * ui.js — Grilles Move UI (v0.2.3)
 *
 * Navigation: jog wheel only.
 *   Jog turn  → déplacer le curseur (traverse les pages automatiquement)
 *   Jog click → entrer/sortir du mode édition
 *   Jog turn (édition) → changer la valeur du paramètre sélectionné
 *
 * Pages:
 *   PAGE_MAIN   : map_x, map_y, density_kick, density_snare, density_hat, randomness
 *   PAGE_PARAMS : kick_note, snare_note, hat_note, steps, sync, bpm
 *
 * Les knobs 71-76 fonctionnent aussi (contrôle direct).
 */

'use strict';

import {
  decodeDelta,
  decodeAcceleratedDelta,
  setLED as sharedSetLED,
} from '/data/UserData/schwung/shared/input_filter.mjs';

/* ═══════════════════════════════════════════════════════════════════════
 * Constants
 * ═══════════════════════════════════════════════════════════════════════ */

const PAD_BASE = 68;
const CC_JOG_WHEEL = 14;
const CC_JOG_CLICK = 3;

const PAGE_MAIN   = 0;
const PAGE_PARAMS = 1;
const FLASH_TICKS = 5;

const PAD_BRIGHT_NEAR = 0.07;
const PAD_BRIGHT_MED  = 0.22;
const PAD_BRIGHT_FAR  = 0.45;

// Knobs 71-76 → param (toujours actifs)
const KNOB_PARAMS = {
  71: 'map_x',
  72: 'map_y',
  73: 'density_kick',
  74: 'density_snare',
  75: 'density_hat',
  76: 'randomness',
};

// Ordre des paramètres dans chaque page
const MAIN_PARAMS = [
  { key: 'map_x',        label: 'Map X',   type: 'float' },
  { key: 'map_y',        label: 'Map Y',   type: 'float' },
  { key: 'density_kick', label: 'Kick',    type: 'float' },
  { key: 'density_snare',label: 'Snare',   type: 'float' },
  { key: 'density_hat',  label: 'Hat',     type: 'float' },
  { key: 'randomness',   label: 'Chaos',   type: 'float' },
];

const PARAMS_PARAMS = [
  { key: 'kick_note',  label: 'K.Note', type: 'int', min: 0,  max: 127 },
  { key: 'snare_note', label: 'S.Note', type: 'int', min: 0,  max: 127 },
  { key: 'hat_note',   label: 'H.Note', type: 'int', min: 0,  max: 127 },
  { key: 'steps',      label: 'Steps',  type: 'int', min: 1,  max: 32  },
  { key: 'sync',       label: 'Sync',   type: 'enum' },
  { key: 'bpm',        label: 'BPM',    type: 'int', min: 40, max: 240 },
];

const ALL_PARAMS = [...MAIN_PARAMS, ...PARAMS_PARAMS];

const PARAM_DEFAULTS = {
  map_x: 0.5, map_y: 0.5,
  density_kick: 0.5, density_snare: 0.5, density_hat: 0.5,
  randomness: 0.0,
  kick_note: 36, snare_note: 38, hat_note: 42,
  steps: 16, sync: 0, bpm: 120,
};

/* ═══════════════════════════════════════════════════════════════════════
 * State
 * ═══════════════════════════════════════════════════════════════════════ */

const g = {
  params:        { ...PARAM_DEFAULTS },
  page:          PAGE_MAIN,
  cursorIdx:     0,           // index dans ALL_PARAMS
  editing:       false,
  step:          0,
  flash:         [0, 0, 0],
  padLEDCache:   new Uint8Array(32),
  padDirty:      true,
  padDirtyPhase: 0,
};

/* ═══════════════════════════════════════════════════════════════════════
 * Param helpers
 * ═══════════════════════════════════════════════════════════════════════ */

function paramDef(key) {
  return ALL_PARAMS.find(p => p.key === key);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function clampParam(key, value) {
  const def = paramDef(key);
  if (!def) return value;
  if (def.type === 'int') {
    const n = Math.round(value);
    return n < def.min ? def.min : n > def.max ? def.max : n;
  }
  if (def.type === 'enum') return Math.round(value) !== 0 ? 1 : 0;
  return clamp01(value);
}

function formatParamValue(key, value) {
  const def = paramDef(key);
  if (!def) return String(value);
  if (def.type === 'int') return String(Math.round(value));
  if (def.type === 'enum') return Math.round(value) === 0 ? 'move' : 'internal';
  return value.toFixed(4);
}

function displayValue(key, value) {
  const def = paramDef(key);
  if (!def) return String(value);
  if (def.type === 'int') return String(Math.round(value));
  if (def.type === 'enum') return Math.round(value) === 0 ? 'MOV' : 'INT';
  return value.toFixed(2);
}

function jogDelta(key, rawDelta) {
  const def = paramDef(key);
  if (!def) return rawDelta * 0.005;
  if (def.type === 'int' || def.type === 'enum') return rawDelta > 0 ? 1 : -1;
  return rawDelta * 0.005;
}

function setParam(key, value) {
  const next = clampParam(key, value);
  g.params[key] = next;
  host_module_set_param(key, formatParamValue(key, next));
}

/* ═══════════════════════════════════════════════════════════════════════
 * Cursor / page
 * ═══════════════════════════════════════════════════════════════════════ */

function currentParam() {
  return ALL_PARAMS[g.cursorIdx] || ALL_PARAMS[0];
}

function moveCursor(delta) {
  g.cursorIdx = g.cursorIdx + delta;
  if (g.cursorIdx < 0) g.cursorIdx = ALL_PARAMS.length - 1;
  if (g.cursorIdx >= ALL_PARAMS.length) g.cursorIdx = 0;
  // Met à jour la page selon l'index
  g.page = g.cursorIdx < MAIN_PARAMS.length ? PAGE_MAIN : PAGE_PARAMS;
  g.editing = false;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Pad LEDs
 * ═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
 * Rendering
 * ═══════════════════════════════════════════════════════════════════════ */

function drawBar(bx, by, bw, bh, value) {
  const filled = Math.round(clamp01(value) * bw);
  draw_rect(bx - 1, by - 1, bw + 2, bh + 2, 1);
  if (filled > 0)  fill_rect(bx, by, filled, bh, 1);
  if (filled < bw) fill_rect(bx + filled, by, bw - filled, bh, 0);
}

function renderMainPage() {
  const p   = g.params;
  const cur = currentParam();
  const kDot = g.flash[0] > 0 ? '*' : '.';
  const sDot = g.flash[1] > 0 ? '*' : '.';
  const hDot = g.flash[2] > 0 ? '*' : '.';
  const step  = String(g.step + 1).padStart(2, '0');

  // Header
  print(0,   0, 'GRIDS 1/2', 1);
  print(66,  0, `K${kDot}S${sDot}H${hDot}`, 1);
  print(110, 0, step, 1);

  // Map X/Y bars
  const focX = cur.key === 'map_x';
  const focY = cur.key === 'map_y';
  print(0, 10, focX ? (g.editing ? '[X' : '>X') : ' X', 1);
  drawBar(16, 11, 108, 5, p.map_x);

  print(0, 18, focY ? (g.editing ? '[Y' : '>Y') : ' Y', 1);
  drawBar(16, 19, 108, 5, p.map_y);

  // Densités
  const focK = cur.key === 'density_kick';
  const focS = cur.key === 'density_snare';
  const focH = cur.key === 'density_hat';
  print(0,  26, (focK ? (g.editing ? '[' : '>') : ' ') + 'K', 1); drawBar(16, 27, 26, 5, p.density_kick);
  print(46, 26, (focS ? (g.editing ? '[' : '>') : ' ') + 'S', 1); drawBar(62, 27, 26, 5, p.density_snare);
  print(92, 26, (focH ? (g.editing ? '[' : '>') : ' ') + 'H', 1); drawBar(108, 27, 16, 5, p.density_hat);

  // Chaos bar
  const focC = cur.key === 'randomness';
  print(0, 34, (focC ? (g.editing ? '[' : '>') : ' ') + '~', 1);
  drawBar(16, 35, 108, 5, p.randomness);

  // Barre de statut — toujours visible
  const editMark = g.editing ? 'EDIT' : 'NAV ';
  print(0, 54, `${editMark} ${cur.label}: ${displayValue(cur.key, p[cur.key])}`, 1);
}

function renderParamsPage() {
  const p   = g.params;
  const cur = currentParam();

  // Header
  print(0, 0, 'GRIDS 2/2', 1);

  // 6 paramètres sur 3 lignes de 2
  const paramList = PARAMS_PARAMS;
  const rows = [10, 24, 38];

  for (let i = 0; i < 3; i++) {
    const left  = paramList[i * 2];
    const right = paramList[i * 2 + 1];
    const y     = rows[i];

    const focL = cur.key === left.key;
    const focR = right && cur.key === right.key;

    const markL = focL ? (g.editing ? '[' : '>') : ' ';
    const valL  = displayValue(left.key, p[left.key]);
    print(0, y, `${markL}${left.label}:${valL}`, 1);

    if (right) {
      const markR = focR ? (g.editing ? '[' : '>') : ' ';
      const valR  = displayValue(right.key, p[right.key]);
      print(64, y, `${markR}${right.label}:${valR}`, 1);
    }
  }

  // Barre de statut — toujours visible
  const editMark = g.editing ? 'EDIT' : 'NAV ';
  print(0, 54, `${editMark} ${cur.label}: ${displayValue(cur.key, p[cur.key])}`, 1);
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

/* ═══════════════════════════════════════════════════════════════════════
 * Lifecycle
 * ═══════════════════════════════════════════════════════════════════════ */

globalThis.init = function () {
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    const raw = host_module_get_param(key);
    if (raw !== undefined && raw !== null) {
      g.params[key] = parseFloat(raw);
    }
  }
  // Toujours démarrer avec un curseur visible sur le premier param
  g.cursorIdx = 0;
  g.page      = PAGE_MAIN;
  g.editing   = false;
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

/* ═══════════════════════════════════════════════════════════════════════
 * Internal MIDI
 * ═══════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageInternal = function (data) {
  if (!data || data.length < 3) return;
  // Filtre les notes capacitives (note-on notes 0-9) — PAS les CC
  if (data[0] === 0x90 && data[1] < 10) return;

  const status = data[0];
  const b1     = data[1];
  const b2     = data.length > 2 ? data[2] : 0;
  const type   = status & 0xF0;

  if (type === 0xB0) {
    // Knobs 71-76 : contrôle direct
    if (b1 >= 71 && b1 <= 76 && KNOB_PARAMS[b1]) {
      const key   = KNOB_PARAMS[b1];
      const delta = decodeDelta(b2);
      const def   = paramDef(key);
      const step  = (def && def.type === 'float') ? delta * 0.01 : (delta > 0 ? 1 : -1);
      setParam(key, g.params[key] + step);
      // Met à jour le curseur pour montrer le param modifié
      const idx = ALL_PARAMS.findIndex(p => p.key === key);
      if (idx >= 0) {
        g.cursorIdx = idx;
        g.page      = idx < MAIN_PARAMS.length ? PAGE_MAIN : PAGE_PARAMS;
      }
      if (key === 'map_x' || key === 'map_y') g.padDirty = true;
      return;
    }

    // Jog wheel
    if (b1 === CC_JOG_WHEEL) {
      const d = decodeDelta(b2);
      if (g.editing) {
        // Changer la valeur du paramètre sélectionné
        const key = currentParam().key;
        setParam(key, g.params[key] + jogDelta(key, d));
        if (key === 'map_x' || key === 'map_y') g.padDirty = true;
      } else {
        // Naviguer vers le prochain/précédent paramètre
        moveCursor(d > 0 ? 1 : -1);
      }
      return;
    }

    // Jog click : basculer mode édition
    if (b1 === CC_JOG_CLICK && b2 > 0) {
      g.editing = !g.editing;
      return;
    }
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

/* ═══════════════════════════════════════════════════════════════════════
 * External MIDI — flash triggers
 * ═══════════════════════════════════════════════════════════════════════ */

globalThis.onMidiMessageExternal = function (data) {
  if (!data || data.length < 2) return;
  if (data[0] === 0x90 && data.length > 2 && data[2] > 0) {
    if (data[1] === g.params.kick_note)  g.flash[0] = FLASH_TICKS;
    if (data[1] === g.params.snare_note) g.flash[1] = FLASH_TICKS;
    if (data[1] === g.params.hat_note)   g.flash[2] = FLASH_TICKS;
  }
};
