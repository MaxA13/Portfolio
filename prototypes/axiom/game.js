/* AXIOM — slot preview
   Vanilla JS, no build step. Works from file:// and static hosting.
   Built so far: stage, reels (steps 1–2), UI + wins + paylines (steps 3–4). */
'use strict';

/* =========================================================================
   LAYOUT — copied from layout.json (coordinates in main_screen_clean.png)
   Inlined so the page works when opened via file:// (no fetch).
   ========================================================================= */
const LAYOUT = {
  size: [2752, 1536],
  reel_window: { x: 498, y: 276, w: 1750, h: 972 },
  grid: {
    cols: 5, rows: 3, cell_w: 350, cell_h: 324,
    column_x: [498, 848, 1198, 1548, 1898],
    row_y: [276, 600, 924],
  },
  logo_plate_center: [1372, 160],
  spin_button: { cx: 1376, cy: 1408, r: 150 },
  autoplay_button: { cx: 1128, cy: 1408, r: 70 },
  bet_button: { cx: 1624, cy: 1408, r: 70 },
  balance_window: { x: 480, y: 1372, w: 460, h: 136 },
  total_bet_window: { x: 1852, y: 1372, w: 460, h: 136 },
};

/* Visual nudges measured once on screen (layout.json is auto-measured):
   - SPIN sprite best fit is 328px wide, 2px right/down of spin_button.
   - AUTOPLAY / BET are baked as icons on plates (the round sprites are a
     different design), so their pressable faces are crops of the backdrop. */
const FIT = {
  spin: { cx: 1378, cy: 1410, r: 164 },
  autoplay_face: { x: 1040, y: 1354, w: 162, h: 116 },
  bet_face: { x: 1544, y: 1354, w: 164, h: 116 },
};

const COLS = LAYOUT.grid.cols;
const ROWS = LAYOUT.grid.rows;
const CELL_W = LAYOUT.grid.cell_w;
const CELL_H = LAYOUT.grid.cell_h;

/* =========================================================================
   MATH — symbols, paytable, paylines, outcome generation.
   Demo-only numbers: tuned so a win lands ~1 in 3 spins and a Big Win
   (>= 15x bet) ~1 in 25.
   ========================================================================= */
const SYM_DIR = 'sprites/symbols/';
const SYMBOLS = {
  //     file                            reel weight  stack weight  pays x3/x4/x5 (x line bet)
  WILD: { file: 'wild_axiom.webp',            weight: 4,   stack: 3, reels: [1, 2, 3] },
  SC:   { file: 'scatter_override_chip.webp', weight: 2.5 },
  BN:   { file: 'bonus_emp_charge.webp',      weight: 2.5 },
  H1:   { file: 'h1_gold_chip.webp',          weight: 2,   stack: 2, pays: [10, 40, 150] },
  H2:   { file: 'h2_platinum_chip.webp',      weight: 3,   stack: 3, pays: [8, 30, 100] },
  H3:   { file: 'h3_plasma_core.webp',        weight: 4,   stack: 4, pays: [6, 20, 75] },
  H4:   { file: 'h4_atomic_core.webp',        weight: 5,   stack: 5, pays: [5, 15, 50] },
  H5:   { file: 'h5_sentinel_head.webp',      weight: 6,   stack: 6, pays: [4, 12, 40] },
  A:    { file: 'low_a.webp',                 weight: 10,  stack: 3, pays: [2, 5, 20] },
  K:    { file: 'low_k.webp',                 weight: 11,  stack: 3, pays: [2, 5, 15] },
  Q:    { file: 'low_q.webp',                 weight: 12,  stack: 3, pays: [1, 4, 12] },
  J:    { file: 'low_j.webp',                 weight: 13,  stack: 3, pays: [1, 3, 10] },
  T:    { file: 'low_10.webp',                weight: 13,  stack: 3, pays: [1, 3, 8] },
};
const SYMBOL_IDS = Object.keys(SYMBOLS);
const HIGH_IDS = ['H1', 'H2', 'H3', 'H4', 'H5'];
const SINGLE_PER_REEL = new Set(['SC', 'BN']); // max one per reel, like real slots
const STACK_CHANCE = 0.14;                      // a whole column of one symbol

/* 20 fixed paylines, row index per reel (0 = top). */
const PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0],
];

const BET_STEPS = [0.20, 0.50, 1, 2, 5];
const START_BALANCE = 1000;

/* Win tiers in x total bet (plaques arrive in step 5). */
const TIER = { BIG: 15, MEGA: 40, EPIC: 100 };
const ODDS = {
  bigWin: 0.04,       // ~1 in 25 spins: constructed Big/Mega/Epic win
  bigSplit: [0.70, 0.22, 0.08], // of those: BIG / MEGA / EPIC
  forcedSmall: 0.09,  // tops natural hit rate (~23%) up to ~1 in 3
};

function pickWeighted(ids, weightOf) {
  let total = 0;
  for (const id of ids) total += weightOf(id);
  let r = Math.random() * total;
  for (const id of ids) { r -= weightOf(id); if (r <= 0) return id; }
  return ids[ids.length - 1];
}

const allowedOn = (id, reel) => !SYMBOLS[id].reels || SYMBOLS[id].reels.includes(reel);

function weightedPick(reel, exclude) {
  const ids = SYMBOL_IDS.filter((id) => allowedOn(id, reel) && !(exclude && exclude.has(id)));
  return pickWeighted(ids, (id) => SYMBOLS[id].weight);
}

/* A column of ROWS symbols respecting per-reel rules, with occasional stacks. */
function randomColumn(reel) {
  if (Math.random() < STACK_CHANCE) {
    const ids = SYMBOL_IDS.filter((id) => SYMBOLS[id].stack && allowedOn(id, reel));
    const s = pickWeighted(ids, (id) => SYMBOLS[id].stack);
    return [s, s, s];
  }
  const col = [];
  const used = new Set();
  for (let r = 0; r < ROWS; r++) {
    const id = weightedPick(reel, used);
    if (SINGLE_PER_REEL.has(id)) used.add(id);
    col.push(id);
  }
  return col;
}

const randomGrid = () => Array.from({ length: COLS }, (_, i) => randomColumn(i));

/* Evaluate all paylines left -> right. grid[reel][row].
   `sentinelWild`: during OVERRIDE free spins every Sentinel Head (H5) is Wild.
   Returns { lines: [{ line, sym, count, cells:[[reel,row]], pay }], total } with
   pay in line-bet units. */
function evaluate(grid, sentinelWild = false) {
  const isWild = (x) => x === 'WILD' || (sentinelWild && x === 'H5');
  const lines = [];
  let total = 0;
  PAYLINES.forEach((rows, li) => {
    const syms = rows.map((row, reel) => grid[reel][row]);
    // candidates: the first non-wild symbol, and (in free spins) a pure Sentinel run
    const cands = [syms.find((x) => !isWild(x))];
    if (sentinelWild) cands.push('H5');
    let best = null;
    for (const sym of cands) {
      if (!sym || !SYMBOLS[sym].pays) continue;
      let n = 0;
      while (n < COLS && (syms[n] === sym || isWild(syms[n]))) n++;
      if (n < 3) continue;
      const pay = SYMBOLS[sym].pays[n - 3];
      if (!best || pay > best.pay) best = { line: li, sym, count: n, cells: rows.slice(0, n).map((row, reel) => [reel, row]), pay };
    }
    if (best) { lines.push(best); total += best.pay; }
  });
  return { lines, total };
}

const countSym = (grid, id) => grid.reduce((n, col) => n + col.filter((s) => s === id).length, 0);
const winX = (grid) => evaluate(grid).total / PAYLINES.length; // win in x total bet

/* Build a grid whose line win lands in [lo, hi) x bet: stacked high symbol
   from reel 1 with some wild stacks on reels 2–4. */
function constructWin(lo, hi) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const sym = pickWeighted(HIGH_IDS, (id) => SYMBOLS[id].stack);
    const reach = 3 + Math.floor(Math.random() * 3);   // 3..5 reels
    const grid = randomGrid().map((col) => col.map((s) => (s === 'SC' || s === 'BN' ? 'T' : s)));
    for (let reel = 0; reel < reach; reel++) {
      const wild = reel >= 1 && reel <= 3 && Math.random() < 0.28;
      const fill = wild ? 'WILD' : sym;
      if (Math.random() < 0.8) grid[reel] = [fill, fill, fill];
      else grid[reel][Math.floor(Math.random() * ROWS)] = fill === 'WILD' ? sym : fill;
    }
    // break the run after `reach` so it doesn't accidentally extend
    if (reach < COLS) grid[reach] = grid[reach].map((s) => (s === sym || s === 'WILD' ? 'J' : s));
    const x = winX(grid);
    if (x >= lo && x < hi) return grid;
  }
  // deterministic fallback
  const s = lo >= TIER.EPIC ? 'H1' : lo >= TIER.MEGA ? 'H4' : 'H5';
  return Array.from({ length: COLS }, (_, i) => (i < (lo >= TIER.MEGA ? 5 : 4) ? [s, s, s] : ['J', 'Q', 'T']));
}

/* A grid with `n` copies of `sym` (SC / BN) on different reels, nothing else special. */
function featureGrid(sym, n) {
  const grid = randomGrid().map((col) => col.map((x) => (x === 'SC' || x === 'BN' ? 'Q' : x)));
  const reels = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, n);
  for (const r of reels) grid[r][Math.floor(Math.random() * ROWS)] = sym;
  return grid;
}

/* Pick the next outcome. `force`: 'big' | 'mega' | 'epic' | 'sc3' | 'sc4' | 'sc5' | 'bonus' | null.
   In free spins the Bonus symbol is taken off the reels. */
function rollOutcome(force, free = false) {
  let g = rollBase(force);
  if (free) g = g.map((col) => col.map((x) => (x === 'BN' ? 'K' : x)));
  return g;
}

function rollBase(force) {
  if (force && force.startsWith('sc')) return featureGrid('SC', +force.slice(2));
  if (force === 'bonus') return featureGrid('BN', 3);
  if (force === 'big') return constructWin(TIER.BIG, TIER.MEGA);
  if (force === 'mega') return constructWin(TIER.MEGA, TIER.EPIC);
  if (force === 'epic') return constructWin(TIER.EPIC, 400);
  const r = Math.random();
  if (r < ODDS.bigWin) {
    const t = Math.random();
    const [b, m] = ODDS.bigSplit;
    if (t < b) return constructWin(TIER.BIG, TIER.MEGA);
    if (t < b + m) return constructWin(TIER.MEGA, TIER.EPIC);
    return constructWin(TIER.EPIC, 400);
  }
  const wantWin = r < ODDS.bigWin + ODDS.forcedSmall;
  for (let i = 0; i < 200; i++) {
    const g = randomGrid();
    const x = winX(g);
    if (x >= TIER.BIG) continue;            // big wins only come from the roll above
    if (wantWin && x === 0) continue;
    return g;
  }
  return randomGrid();
}

/* =========================================================================
   SPIN TIMING (ms / design px)
   ========================================================================= */
const SPIN = {
  startStagger: 40,     // reels kick off one after another
  stopStagger: 130,     // and land one after another, left -> right
  windup: 150,          // little lift before the drop
  windupLift: 38,       // px the strip lifts up during windup
  baseRun: 760,         // main travel time of reel 1
  maxSpeed: 9.2,        // px per ms at cruise (~28 symbols / s)
  accelFrac: 0.16,
  decelFrac: 0.22,
  landSpeedRatio: 0.16, // speed left when the reel hits its stop -> drives the bounce
  springHz: 5.2,
  springDamp: 0.42,
  springTime: 380,
  slamDur: 90,          // quick stop: last stretch of travel
  slamStagger: 45,
};

/* =========================================================================
   HELPERS
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const now = () => performance.now();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);

/* rAF tween of a number. Returns a cancel function. */
function tween(from, to, dur, onUpdate, onDone) {
  const t0 = now();
  let id = 0;
  const step = () => {
    const k = Math.min(1, (now() - t0) / dur);
    onUpdate(from + (to - from) * easeOutCubic(k));
    if (k < 1) id = requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}

/* =========================================================================
   ASSETS — load symbol images and bake motion-blur variants.
   Blur variants are canvases (drawn, never read back), so this stays
   legal under file:// where canvas pixel reads would be blocked.
   ========================================================================= */
const IMG = {};
const BLUR = {};
const BLUR_SCALE = 0.5;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

function drawContained(ctx, img, w, h) {
  const pad = 0.08;
  const bw = w * (1 - pad * 2), bh = h * (1 - pad * 2);
  const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/* Vertical smear: additive average of N shifted copies with gaussian weights. */
function makeSmear(img, spreadPx, taps) {
  const w = Math.round(CELL_W * BLUR_SCALE), h = Math.round(CELL_H * BLUR_SCALE);
  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  drawContained(base.getContext('2d'), img, w, h);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  const weights = [];
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const t = (i / (taps - 1)) * 2 - 1;
    const wgt = Math.exp(-t * t * 2.2);
    weights.push(wgt); sum += wgt;
  }
  for (let i = 0; i < taps; i++) {
    const t = (i / (taps - 1)) * 2 - 1;
    ctx.globalAlpha = weights[i] / sum;
    ctx.drawImage(base, 0, t * spreadPx * BLUR_SCALE);
  }
  return out;
}

/* Everything the game shows, preloaded behind the splash so nothing pops in later. */
const PRELOAD = [
  'art/screens/main_screen_clean.webp',
  'art/screens/11_free_spins_intro_16x9_bigheads.webp',
  'art/screens/12_hack_bonus_nohand.webp',
  'sprites/fx/plaque_big_win.webp',
  'sprites/fx/plaque_mega_win.webp',
  'sprites/fx/plaque_epic_win.webp',
  'sprites/ui/btn_spin.webp',
];
const PRELOADED = [];  // keep references so the decoded images stay cached

async function loadAssets(onProgress = () => {}) {
  const total = SYMBOL_IDS.length + PRELOAD.length;
  let done = 0;
  const tick = () => onProgress(++done / total);
  await Promise.all([
    ...SYMBOL_IDS.map(async (id) => {
      IMG[id] = await loadImage(SYM_DIR + SYMBOLS[id].file);
      BLUR[id] = { light: makeSmear(IMG[id], 34, 7), heavy: makeSmear(IMG[id], 96, 13) };
      tick();
    }),
    ...PRELOAD.map(async (src) => { PRELOADED.push(await loadImage(src)); tick(); }),
  ]);
}

/* =========================================================================
   STAGE — scale the 2752x1536 design box into the window (letterboxed).
   ========================================================================= */
const stage = $('#stage');

function fitStage() {
  const [W, H] = LAYOUT.size;
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  stage.style.transform = `translate(${(vw - W * s) / 2}px, ${(vh - H * s) / 2}px) scale(${s})`;
  if (typeof Particles !== 'undefined') Particles.resize(s);
}

function placeBox(node, box) {
  Object.assign(node.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
}

function placeCircle(node, b, scale = 1) {
  const r = b.r * scale;
  placeBox(node, { x: b.cx - r, y: b.cy - r, w: r * 2, h: r * 2 });
}

/* =========================================================================
   REEL — one column. Strip layout during a spin (top -> bottom):

     [buffer][final x3][blur segment xK][current x3][buffer]

   The strip slides DOWN until the final symbols sit in the window, then a
   damped spring gives the landing bounce. Idle strip: [buffer][x3][buffer].
   ========================================================================= */
class Reel {
  constructor(index, container) {
    this.index = index;
    this.node = el('div', 'reel');
    this.node.style.left = index * CELL_W + 'px';
    this.strip = el('div', 'strip');
    this.node.appendChild(this.strip);
    container.appendChild(this.node);
    this.blurCanvas = el('canvas', 'blur-seg');
    this.symbols = randomColumn(index).map((s) => (s === 'SC' || s === 'BN' ? 'A' : s));
    this.state = 'idle';
    this.renderIdle();
  }

  makeCell(id) {
    const c = el('div', 'cell');
    c.dataset.sym = id;
    const img = el('img');
    img.src = IMG[id].src;
    img.alt = '';
    img.draggable = false;
    c.appendChild(img);
    return c;
  }

  setY(y) { this.y = y; this.strip.style.transform = `translate3d(0, ${y}px, 0)`; }

  renderIdle() {
    this.strip.replaceChildren(
      this.makeCell(weightedPick(this.index)),
      ...this.symbols.map((id) => this.makeCell(id)),
      this.makeCell(weightedPick(this.index)),
    );
    this.cells = Array.from(this.strip.children).slice(1, 1 + ROWS);
    this.setY(-CELL_H);
  }

  paintBlur(k) {
    const cw = Math.round(CELL_W * BLUR_SCALE), ch = Math.round(CELL_H * BLUR_SCALE);
    const cv = this.blurCanvas;
    cv.width = cw;
    cv.height = ch * k;
    cv.style.height = CELL_H * k + 'px';
    const ctx = cv.getContext('2d');
    for (let i = 0; i < k; i++) {
      const id = weightedPick(this.index);
      const edge = i < 2 || i >= k - 2;
      ctx.drawImage(edge ? BLUR[id].light : BLUR[id].heavy, 0, i * ch);
    }
  }

  spin(final, startAt, run, anticipate = false) {
    this.final = final;
    this.node.classList.toggle('anticipate', anticipate);
    const a = SPIN.accelFrac, d = SPIN.decelFrac, r = SPIN.landSpeedRatio;
    const k = Math.max(4, Math.round((SPIN.maxSpeed * run * (1 - a / 2 - d * (1 - r) / 2)) / CELL_H) - ROWS);
    this.paintBlur(k);
    this.strip.replaceChildren(
      this.makeCell(weightedPick(this.index)),
      ...final.map((id) => this.makeCell(id)),
      this.blurCanvas,
      ...this.symbols.map((id) => this.makeCell(id)),
      this.makeCell(weightedPick(this.index)),
    );
    this.y0 = -CELL_H * (1 + ROWS + k);
    this.y1 = -CELL_H;
    this.dist = this.y1 - this.y0;
    this.setY(this.y0);

    this.startAt = startAt;
    this.run = run;
    this.state = 'spinning';
    this.landAt = null;
    this.slamAt = null;
    this.slamFrom = null;
    this.vPeak = 1 / (a / 2 + (1 - a - d) + d * (1 + r) / 2);
    this.landVel = this.vPeak * r * this.dist / run;
  }

  travel(u) {
    const a = SPIN.accelFrac, d = SPIN.decelFrac, r = SPIN.landSpeedRatio, V = this.vPeak;
    if (u < a) return V * u * u / (2 * a);
    if (u < 1 - d) return V * (a / 2 + (u - a));
    const tau = u - (1 - d);
    return V * (a / 2 + (1 - a - d)) + V * (tau - (1 - r) * tau * tau / (2 * d));
  }

  /* Quick stop: from `at`, jump to the last stretch and land fast. */
  slam(at) {
    if (this.state !== 'spinning' || this.landAt !== null) return;
    this.slamAt = at;
  }

  update(t) {
    if (this.state !== 'spinning') return true;

    // landing bounce: damped spring driven by the landing velocity
    if (this.landAt !== null) {
      const s = (t - this.landAt) / 1000;
      if (s * 1000 < SPIN.springTime) {
        const w = 2 * Math.PI * SPIN.springHz;
        const wd = w * Math.sqrt(1 - SPIN.springDamp * SPIN.springDamp);
        const amp = (this.landVel * 1000) / wd;
        this.setY(this.y1 + amp * Math.exp(-SPIN.springDamp * w * s) * Math.sin(wd * s));
        return false;
      }
      this.finish();
      return true;
    }

    // quick stop
    if (this.slamAt !== null && t >= this.slamAt) {
      if (this.slamFrom === null) this.slamFrom = Math.max(this.y, this.y1 - CELL_H * 1.1);
      const k = (t - this.slamAt) / SPIN.slamDur;
      if (k < 1) { this.setY(this.slamFrom + (this.y1 - this.slamFrom) * k); return false; }
      this.landVel = Math.min(this.landVel, ((this.y1 - this.slamFrom) / SPIN.slamDur) * 0.5);
      this.land(this.slamAt + SPIN.slamDur);
      return false;
    }

    const e = t - this.startAt;
    if (e < 0) return false;
    if (e < SPIN.windup) {
      this.setY(this.y0 - SPIN.windupLift * Math.sin(Math.PI * (e / SPIN.windup)));
      return false;
    }
    const m = e - SPIN.windup;
    if (m < this.run) {
      this.setY(this.y0 + this.dist * this.travel(m / this.run));
      return false;
    }
    this.land(this.startAt + SPIN.windup + this.run);
    return false;
  }

  land(at) {
    this.landAt = at;
    this.setY(this.y1);
    this.node.classList.remove('landed');
    void this.node.offsetWidth; // restart the landing flash
    this.node.classList.add('landed');
    this.node.classList.remove('anticipate');
    // special symbols "clunk" in with a pop + flash
    for (const c of Array.from(this.strip.children).slice(1, 1 + ROWS)) {
      if (c.dataset.sym === 'SC' || c.dataset.sym === 'BN') c.classList.add('land-pop');
    }
    Sfx.play(Array.from(this.strip.children).slice(1, 1 + ROWS).some((c) => c.dataset.sym === 'SC' || c.dataset.sym === 'BN') ? 'special' : 'stop', this.index);
    if (this.onLanded) this.onLanded(this.index);
  }

  /* Keep the landed nodes (so landing animations aren't cut), drop the rest. */
  finish() {
    this.state = 'idle';
    this.symbols = this.final;
    const kids = Array.from(this.strip.children);
    kids.slice(1 + ROWS).forEach((k) => k.remove());
    this.strip.appendChild(this.makeCell(weightedPick(this.index)));
    this.cells = kids.slice(1, 1 + ROWS);
    this.setY(-CELL_H);
  }
}

/* =========================================================================
   WIN PRESENTATION — frames, dimming, SVG paylines, line cycling.
   ========================================================================= */
const SVGNS = 'http://www.w3.org/2000/svg';

const WinFx = {
  timer: 0,
  active: false,

  init() {
    this.layer = $('#win-layer');
    placeBox(this.layer, LAYOUT.reel_window);
    this.svg = $('#paylines');
    this.amount = $('#win-amount');
  },

  cellCenter(reel, row) {
    return [LAYOUT.grid.column_x[reel] + CELL_W / 2, LAYOUT.grid.row_y[row] + CELL_H / 2];
  },

  linePoints(li) {
    const rows = PAYLINES[li];
    const pts = rows.map((row, reel) => this.cellCenter(reel, row));
    const rw = LAYOUT.reel_window;
    pts.unshift([rw.x - 26, pts[0][1]]);
    pts.push([rw.x + rw.w + 26, pts[pts.length - 1][1]]);
    return pts.map((p) => p.join(',')).join(' ');
  },

  drawLines(lineIdxs) {
    this.svg.replaceChildren();
    for (const li of lineIdxs) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'payline');
      for (const cls of ['pl-glow', 'pl-core', 'pl-hot']) {
        const p = document.createElementNS(SVGNS, 'polyline');
        p.setAttribute('points', this.linePoints(li));
        p.setAttribute('class', cls);
        p.setAttribute('pathLength', '1000');
        g.appendChild(p);
      }
      this.svg.appendChild(g);
    }
  },

  /* Frame `cells` ([reel,row]), dim every other cell, optional badge. */
  showCells(reels, cells, badge, frameCls = '') {
    const key = (r, c) => r * 10 + c;
    const on = new Set(cells.map(([r, c]) => key(r, c)));
    reels.forEach((reel, r) => reel.cells.forEach((cell, row) => {
      const hit = on.has(key(r, row));
      cell.classList.toggle('win', hit);
      cell.classList.toggle('dim', !hit);
    }));
    this.layer.replaceChildren();
    for (const [r, row] of cells) {
      const f = el('div', 'win-frame ' + frameCls);
      Object.assign(f.style, { left: r * CELL_W + 'px', top: row * CELL_H + 'px' });
      this.layer.appendChild(f);
    }
    if (badge) {
      const [r, row] = cells[cells.length - 1];
      const b = el('div', 'line-badge');
      b.textContent = badge;
      Object.assign(b.style, { left: r * CELL_W + CELL_W / 2 + 'px', top: row * CELL_H + CELL_H - 34 + 'px' });
      this.layer.appendChild(b);
    }
  },

  /* Plays: all lines together, then each line in turn, looping. Resolves
     after the first "all lines" beat so autoplay can continue. */
  present(reels, result, lineBet, totalWin, quiet = false) {
    if (!quiet) Sfx.play('win');
    this.clear(reels);
    this.active = true;
    stage.classList.add('has-win');

    const all = [];
    const seen = new Set();
    for (const ln of result.lines) for (const c of ln.cells) {
      const k = c.join(); if (!seen.has(k)) { seen.add(k); all.push(c); }
    }
    this.showCells(reels, all);
    this.drawLines(result.lines.map((l) => l.line));
    if (!quiet) this.showAmount(totalWin);

    let i = -1;
    const cycle = () => {
      if (!this.active) return;
      i = (i + 1) % result.lines.length;
      const ln = result.lines[i];
      this.showCells(reels, ln.cells, fmt(ln.pay * lineBet));
      this.drawLines([ln.line]);
      this.timer = setTimeout(cycle, 1100);
    };
    this.timer = setTimeout(() => { this.hideAmount(); cycle(); }, 1900);
    return wait(1900);
  },

  showAmount(v) {
    const a = this.amount;
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
    const num = $('.num', a);
    if (this.cancelCount) this.cancelCount();
    this.cancelCount = tween(0, v, Math.min(1400, 500 + v * 30), (x) => { num.textContent = fmt(x); });
  },

  hideAmount() { this.amount.classList.remove('show'); },

  clear(reels) {
    this.active = false;
    clearTimeout(this.timer);
    if (this.cancelCount) this.cancelCount();
    stage.classList.remove('has-win');
    this.svg.replaceChildren();
    this.layer.replaceChildren();
    this.hideAmount();
    for (const reel of reels) for (const c of reel.cells || []) c.classList.remove('win', 'dim');
  },
};

/* =========================================================================
   PARTICLES — coins + sparks on one canvas, drawn at screen resolution
   (canvas backing store follows the stage scale, coordinates stay in
   design px). Coins are procedural: no coin art exists.
   ========================================================================= */
const Particles = {
  list: [],
  running: false,
  scale: 1,
  emitters: [],

  init() {
    this.canvas = $('#fx');
    this.ctx = this.canvas.getContext('2d');
    this.coin = this.makeCoin(64);
    this.resize(this.scale);
  },

  resize(stageScale) {
    this.scale = stageScale;
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = stageScale * dpr;
    this.canvas.width = Math.round(LAYOUT.size[0] * k);
    this.canvas.height = Math.round(LAYOUT.size[1] * k);
    this.k = k;
  },

  makeCoin(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    let grd = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    grd.addColorStop(0, '#FFF6C8');
    grd.addColorStop(0.45, '#F5C542');
    grd.addColorStop(1, '#9A5B07');
    g.fillStyle = grd;
    g.beginPath(); g.arc(r, r, r - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120, 66, 0, .9)'; g.lineWidth = size * 0.06;
    g.beginPath(); g.arc(r, r, r * 0.72, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255, 244, 200, .8)'; g.lineWidth = size * 0.025;
    g.beginPath(); g.arc(r, r, r * 0.64, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
    // little "A" chevron in the middle, nod to the AXIOM logo
    g.fillStyle = 'rgba(110, 60, 0, .85)';
    g.beginPath(); g.moveTo(r, r * 0.55); g.lineTo(r * 1.32, r * 1.38); g.lineTo(r * 1.12, r * 1.38);
    g.lineTo(r, r * 1.05); g.lineTo(r * 0.88, r * 1.38); g.lineTo(r * 0.68, r * 1.38); g.closePath(); g.fill();
    return c;
  },

  coinBurst(n, x, y, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const v = (1100 + Math.random() * 1500) * power;
      this.list.push({
        type: 'coin', x: x + (Math.random() - 0.5) * 160, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: 54 + Math.random() * 46, phase: Math.random() * 6, spin: 8 + Math.random() * 14,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, life: 0, max: 2.6 + Math.random(),
      });
    }
    this.start();
  },

  coinRain(n) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        type: 'coin', x: Math.random() * LAYOUT.size[0], y: -80 - Math.random() * 500,
        vx: (Math.random() - 0.5) * 200, vy: 300 + Math.random() * 500,
        size: 44 + Math.random() * 40, phase: Math.random() * 6, spin: 6 + Math.random() * 10,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, life: 0, max: 3.2,
      });
    }
    this.start();
  },

  sparkBurst(n, x, y, color = '255, 214, 120', speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (500 + Math.random() * 1700) * speed;
      this.list.push({
        type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0, max: 0.5 + Math.random() * 0.7, color, w: 3 + Math.random() * 5,
      });
    }
    this.start();
  },

  /* continuous fountain while `until()` returns true */
  fountain(x, y, rate, until) {
    this.emitters.push({ x, y, rate, until, acc: 0 });
    this.start();
  },

  clearEmitters() { this.emitters.length = 0; },

  start() {
    if (this.running) return;
    this.running = true;
    this.last = now();
    const tick = () => {
      const t = now();
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      if (this.list.length || this.emitters.length) requestAnimationFrame(tick);
      else { this.running = false; this.clear(); }
    };
    requestAnimationFrame(tick);
  },

  clear() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); },

  step(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (!e.until()) { this.emitters.splice(i, 1); continue; }
      e.acc += e.rate * dt;
      const n = Math.floor(e.acc);
      if (n > 0) { e.acc -= n; this.coinBurst(n, e.x, e.y, 0.85); }
      if (Math.random() < dt * 14) this.sparkBurst(3, e.x + (Math.random() - 0.5) * 500, e.y - Math.random() * 500, '255, 220, 140', 0.5);
    }

    const ctx = this.ctx;
    const k = this.k;
    this.clear();
    const G = 2600;
    const keep = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life > p.max || p.y > LAYOUT.size[1] + 200) continue;
      keep.push(p);
      if (p.type === 'coin') {
        p.vy += G * dt; p.vx *= 0.995;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.phase += p.spin * dt; p.rot += p.vr * dt;
        const flip = Math.cos(p.phase);
        const fade = Math.min(1, (p.max - p.life) * 3);
        const sx = Math.max(0.08, Math.abs(flip)) * k, c = Math.cos(p.rot), sn = Math.sin(p.rot);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade * (flip < 0 ? 0.8 : 1);
        // translate * rotate * scaleX in one matrix: no save/restore per coin
        ctx.setTransform(c * sx, sn * sx, -sn * k, c * k, p.x * k, p.y * k);
        ctx.drawImage(this.coin, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        p.vy += G * 0.25 * dt; p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = 1 - p.life / p.max;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.strokeStyle = `rgba(${p.color}, 1)`;
        ctx.lineWidth = p.w * a + 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.list = keep;
  },
};

/* =========================================================================
   BIG WIN — plaque celebration. The counter climbs through the tiers:
   BIG -> MEGA -> EPIC, swapping plaques with a punch as thresholds pass.
   Click / tap / Space: first = jump to the end, second = close.
   ========================================================================= */
const BIG_TIERS = [
  { key: 'big',  name: 'BIG WIN',  x: TIER.BIG,  img: 'sprites/fx/plaque_big_win.webp',  rgb: '25, 227, 255' },
  { key: 'mega', name: 'MEGA WIN', x: TIER.MEGA, img: 'sprites/fx/plaque_mega_win.webp', rgb: '196, 72, 255' },
  { key: 'epic', name: 'EPIC WIN', x: TIER.EPIC, img: 'sprites/fx/plaque_epic_win.webp', rgb: '255, 190, 60' },
];
const PLAQUE_SCALE = 0.86;            // of native sprite size, all three share it
const PLAQUE_CENTER = [1376, 640];
const BIG_AMOUNT_Y = 1262;

const BigWin = {
  active: false,

  init() {
    this.root = $('#bigwin');
    this.plaqueBox = $('.bw-plaque', this.root);
    this.amount = $('.bw-amount', this.root);
    this.flash = $('.bw-flash', this.root);
    this.root.addEventListener('pointerdown', () => this.skip());
    // preload plaques so swaps never flicker
    this.imgs = BIG_TIERS.map((t) => { const i = new Image(); i.src = t.img; return i; });
    Object.assign(this.plaqueBox.style, { left: PLAQUE_CENTER[0] + 'px', top: PLAQUE_CENTER[1] + 'px' });
    this.amount.style.top = BIG_AMOUNT_Y + 'px';
  },

  tierFor(x) {
    let t = -1;
    BIG_TIERS.forEach((tier, i) => { if (x >= tier.x) t = i; });
    return t;
  },

  setTier(i, punch = true) {
    if (i !== this.tier && punch) Sfx.play('tier', i);
    if (i === this.tier) return;
    this.tier = i;
    const t = BIG_TIERS[i];
    this.root.dataset.tier = t.key;
    this.root.style.setProperty('--tier-rgb', t.rgb);
    this.root.setAttribute('aria-label', t.name);

    // plaque + a light sweep masked to the plaque's own silhouette
    const old = $('.plaque-wrap:not(.plaque-out)', this.plaqueBox);
    const src = this.imgs[i];
    const wrap = el('div', 'plaque-wrap plaque-in');
    Object.assign(wrap.style, {
      width: src.naturalWidth * PLAQUE_SCALE + 'px',
      height: src.naturalHeight * PLAQUE_SCALE + 'px',
    });
    const img = src.cloneNode();
    img.alt = t.name;
    img.draggable = false;
    wrap.appendChild(img);
    // CSS masks load images in CORS mode, which file:// blocks, so the sweep
    // is only added when served over http(s) (local server / GitHub Pages).
    if (location.protocol !== 'file:') {
      const shine = el('div', 'plaque-shine');
      shine.style.webkitMaskImage = shine.style.maskImage = `url("${t.img}")`;
      shine.appendChild(el('div', 'band'));
      wrap.appendChild(shine);
    }
    this.plaqueBox.appendChild(wrap);
    if (old) { old.classList.replace('plaque-in', 'plaque-out'); setTimeout(() => old.remove(), 400); }

    if (punch) {
      this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
      const [cx, cy] = PLAQUE_CENTER;
      Particles.sparkBurst(70 + i * 40, cx, cy, t.rgb, 1.2 + i * 0.2);
      Particles.coinBurst(26 + i * 16, cx, 1580, 1.25);
      if (i >= 1) Particles.coinRain(30 + i * 25);
      this.root.classList.remove('shake'); void this.root.offsetWidth; this.root.classList.add('shake');
    }
  },

  /* Resolves when the celebration is closed. */
  play(win, bet) {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.active = true;
      this.win = win;
      this.bet = bet;
      this.tier = -1;
      this.done = false;
      this.plaqueBox.replaceChildren();
      this.amount.textContent = fmt(0);
      this.root.classList.add('show');
      stage.classList.add('bigwin-on');

      const finalTier = this.tierFor(win / bet);
      this.duration = 3200 + finalTier * 2300;
      this.t0 = now();
      this.setTier(0);
      Particles.fountain(PLAQUE_CENTER[0], 1580, 16 + finalTier * 10, () => this.active && !this.done);

      const tick = () => {
        if (!this.active) return;
        const k = Math.min(1, (now() - this.t0) / this.duration);
        const eased = 1 - Math.pow(1 - k, 2.2);
        const v = this.win * eased;
        this.amount.textContent = fmt(v);
        const ti = this.tierFor(v / this.bet);
        if (ti > this.tier) this.setTier(ti);
        if (k < 1) this.raf = requestAnimationFrame(tick);
        else this.land();
      };
      this.raf = requestAnimationFrame(tick);
    });
  },

  /* counter finished: final punch, then auto-close after a beat */
  land() {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    this.amount.textContent = fmt(this.win);
    this.setTier(this.tierFor(this.win / this.bet));
    this.amount.classList.remove('land'); void this.amount.offsetWidth; this.amount.classList.add('land');
    Particles.sparkBurst(60, PLAQUE_CENTER[0], BIG_AMOUNT_Y, BIG_TIERS[this.tier].rgb, 1);
    Particles.coinBurst(36, PLAQUE_CENTER[0], 1580, 1.3);
    this.closeTimer = setTimeout(() => this.close(), 2600);
  },

  skip() {
    if (!this.active) return;
    if (!this.done) {
      if (now() - this.t0 < 350) return; // ignore the click that started the spin
      this.land();
    } else this.close();
  },

  close() {
    if (!this.active) return;
    clearTimeout(this.closeTimer);
    this.active = false;
    Particles.clearEmitters();
    this.root.classList.remove('show');
    stage.classList.remove('bigwin-on');
    setTimeout(() => this.resolve && this.resolve(), 350);
  },
};

/* =========================================================================
   FEATURES CONFIG — OVERRIDE free spins + Hack Bonus
   The 9:16 feature screens are letterboxed into the 16:9 stage; children
   of a portrait container are positioned in that image's own pixels.
   ========================================================================= */
const FS_AWARD = { 3: 8, 4: 12, 5: 20 };
const INTRO_ART_SPINS = 12;                 // number baked into 11_free_spins_intro.png
const PORTRAIT = { w: 1536, h: 2752 };
PORTRAIT.scale = LAYOUT.size[1] / PORTRAIT.h;
PORTRAIT.left = (LAYOUT.size[0] - PORTRAIT.w * PORTRAIT.scale) / 2;
const toStage = (x, y) => [PORTRAIT.left + x * PORTRAIT.scale, y * PORTRAIT.scale];

/* The 16:9 intro (big-heads version) is full-stage (same 2752x1536 box as the game). */
const INTRO = {
  src: 'art/screens/11_free_spins_intro_16x9_bigheads.webp',
  spinsPatch: { x: 700, y: 1284, w: 1356, h: 222 },  // where "12 FREE SPINS" is baked in
  tapY: 1490,
};

const HACK = {
  // rack centres / size in 12_hack_bonus.png pixels (pitch measured by image matching)
  rack: { x0: 375, y0: 970, dx: 381, dy: 424, w: 336, h: 396 },
  bar: { x: 312, y: 258, w: 912, h: 72 },   // baked progress bar track (covered + driven by code)
  picks: 3,
  coins: [3, 5, 8, 10, 15, 20, 30],         // x total bet
  mults: [2, 3, 5],
  baseIfNoCoins: 5,                         // x bet, if only multipliers were picked
};

/* Build a letterboxed portrait screen inside `root`; returns the container
   whose children use the source image's pixel coordinates. */
function setupPortrait(root, src) {
  const bg = el('img', 'pt-bg');
  bg.src = src; bg.alt = ''; bg.draggable = false;
  const pt = el('div', 'pt');
  Object.assign(pt.style, {
    left: PORTRAIT.left + 'px', width: PORTRAIT.w + 'px', height: PORTRAIT.h + 'px',
    transform: `scale(${PORTRAIT.scale})`,
  });
  const img = el('img', 'pt-img');
  img.src = src; img.alt = ''; img.draggable = false;
  pt.appendChild(img);
  root.append(bg, pt);
  return pt;
}

/* Full-stage 16:9 screen: children use stage pixels directly. */
function setupFull(root, src) {
  const img = el('img', 'pt-img');
  img.src = src; img.alt = ''; img.draggable = false;
  root.appendChild(img);
  return root;
}

/* =========================================================================
   OVERRIDE INTRO — 11_free_spins_intro_16x9.png (full stage), tap to start.
   The art says "12 FREE SPINS"; for 8 / 20 the line is covered with a
   dark band and re-set in CSS type.
   ========================================================================= */
const Intro = {
  init() {
    this.root = $('#fs-intro');
    this.pt = setupFull(this.root, INTRO.src);
    this.patch = el('div', 'spins-patch');
    placeBox(this.patch, INTRO.spinsPatch);
    this.patchText = el('div', 'spins-text');
    this.patch.appendChild(this.patchText);
    this.tap = el('div', 'tap-hint');
    this.tap.textContent = 'TAP TO START';
    this.tap.style.top = INTRO.tapY + 'px';
    this.pt.append(this.patch, this.tap, el('div', 'pt-scan full'));
  },

  show(n) {
    return new Promise((resolve) => {
      this.patch.style.display = n === INTRO_ART_SPINS ? 'none' : '';
      this.patchText.innerHTML = `<b>${n}</b> FREE SPINS`;
      this.root.classList.add('show');
      let ready = false;
      setTimeout(() => { ready = true; this.root.classList.add('ready'); }, 900);
      const go = () => {
        if (!ready) return;
        clearTimeout(auto);
        Game.modal = null;
        this.root.onpointerdown = null;
        this.root.classList.remove('show', 'ready');
        setTimeout(resolve, 450);
      };
      const auto = setTimeout(() => { ready = true; go(); }, Game.autoplay ? 4000 : 15000);
      this.root.onpointerdown = go;
      Game.modal = go;
    });
  },
};

/* =========================================================================
   PANEL — feature summary (OVERRIDE complete / Hack Bonus win).
   ========================================================================= */
const Panel = {
  init() {
    this.root = $('#panel');
    this.title = $('.pn-title', this.root);
    this.label = $('.pn-label', this.root);
    this.amount = $('.pn-amount', this.root);
    this.sub = $('.pn-sub', this.root);
  },

  show({ title, label, amount, sub = '', theme = 'amber' }) {
    return new Promise((resolve) => {
      this.root.dataset.theme = theme;
      this.title.textContent = title;
      this.label.textContent = label;
      this.sub.textContent = sub;
      this.amount.textContent = fmt(0);
      this.root.classList.add('show');
      let ready = false;
      const cancel = tween(0, amount, Math.min(2200, 900 + amount * 8), (v) => { this.amount.textContent = fmt(v); }, () => {
        this.amount.classList.remove('land'); void this.amount.offsetWidth; this.amount.classList.add('land');
        Particles.coinBurst(40, 1376, 1580, 1.25);
        Particles.sparkBurst(60, 1376, 760, theme === 'cyan' ? '25, 227, 255' : '255, 190, 80', 1);
        ready = true;
        this.root.classList.add('ready');
      });
      const close = () => {
        if (!ready) { cancel(); this.amount.textContent = fmt(amount); ready = true; this.root.classList.add('ready'); return; }
        clearTimeout(auto);
        Game.modal = null;
        this.root.onpointerdown = null;
        this.root.classList.remove('show', 'ready');
        setTimeout(resolve, 400);
      };
      const auto = setTimeout(() => { ready = true; close(); }, 9000);
      setTimeout(() => { this.root.onpointerdown = close; Game.modal = close; }, 500);
    });
  },
};

/* =========================================================================
   HACK BONUS — 3x3 server racks on 12_hack_bonus.png. Every rack starts
   behind a "firewall" panel (the art has three racks drawn already open, so
   the panels give all nine one clean state). Pick 3: coins add up,
   multipliers multiply.
   ========================================================================= */
const Hack = {
  init() {
    this.root = $('#hack');
    this.pt = setupPortrait(this.root, 'art/screens/12_hack_bonus_nohand.webp');

    this.bar = el('div', 'hk-bar');
    placeBox(this.bar, HACK.bar);
    this.fill = el('div', 'hk-fill');
    this.barText = el('div', 'hk-bar-text');
    this.bar.append(this.fill, this.barText);

    this.head = el('div', 'hk-head');
    this.head.innerHTML = '<div class="hk-title">HACK BONUS</div><div class="hk-sub">BREACH 3 FIREWALLS</div>';
    this.tally = el('div', 'hk-tally');

    this.racks = [];
    const R = HACK.rack;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const b = el('button', 'hk-rack');
      b.setAttribute('aria-label', `Server rack ${row * 3 + col + 1}`);
      const cx = R.x0 + col * R.dx, cy = R.y0 + row * R.dy;
      placeBox(b, { x: cx - R.w / 2, y: cy - R.h / 2, w: R.w, h: R.h });
      b.innerHTML = `
        <span class="hk-shield"><span class="hk-lock"><i></i></span><span class="hk-code">ENCRYPTED</span></span>
        <span class="hk-prize"><span class="v"></span><span class="t"></span></span>
        <span class="hk-flash"></span>`;
      const i = this.racks.length;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pick(i); });
      this.racks.push({ node: b, cx, cy });
    }
    this.pt.append(this.bar, this.head, this.tally, ...this.racks.map((r) => r.node), el('div', 'pt-scan'));
  },

  makePrizes() {
    const coins = [...HACK.coins].sort(() => Math.random() - 0.5).slice(0, 6).map((x) => ({ type: 'coin', x }));
    const mults = HACK.mults.map((m) => ({ type: 'mult', m }));
    return [...coins, ...mults].sort(() => Math.random() - 0.5);
  },

  sums(list) {
    const coins = list.filter((p) => p.type === 'coin').reduce((a, p) => a + p.x, 0);
    const mult = list.filter((p) => p.type === 'mult').reduce((a, p) => a * p.m, 1);
    return { coins, mult, totalX: (coins || HACK.baseIfNoCoins) * mult };
  },

  updateTally() {
    const { coins, mult } = this.sums(this.picked.map((i) => this.prizes[i]));
    const c = fmt((coins || 0) * this.bet);
    this.tally.innerHTML = this.picked.length ? `<span class="c">${c}</span><span class="x">× ${mult}</span>` : '';
    this.tally.classList.remove('bump'); void this.tally.offsetWidth; this.tally.classList.add('bump');
    this.fill.style.width = (this.picked.length / HACK.picks) * 100 + '%';
    this.barText.textContent = this.picked.length >= HACK.picks ? 'ACCESS GRANTED' : `ACCESS ${this.picked.length} / ${HACK.picks}`;
  },

  play(bet) {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.bet = bet;
      this.prizes = this.makePrizes();
      this.picked = [];
      this.locked = true;
      this.racks.forEach((r) => { r.node.className = 'hk-rack'; });
      this.updateTally();
      this.tally.classList.remove('bump');
      this.root.classList.add('show');
      setTimeout(() => { this.locked = false; this.root.classList.add('ready'); }, 1100);
    });
  },

  reveal(i, picked) {
    const r = this.racks[i];
    const p = this.prizes[i];
    $('.v', r.node).textContent = p.type === 'coin' ? fmt(p.x * this.bet) : `x${p.m}`;
    $('.t', r.node).textContent = p.type === 'coin' ? 'CREDITS' : 'MULTIPLIER';
    r.node.classList.add('open', p.type, picked ? 'picked' : 'missed');
    if (picked) {
      const [sx, sy] = toStage(r.cx, r.cy);
      Particles.sparkBurst(55, sx, sy, p.type === 'mult' ? '25, 227, 255' : '255, 200, 90', 0.9);
    }
  },

  pick(i) {
    if (this.locked || !this.picked || this.picked.includes(i) || this.picked.length >= HACK.picks) return;
    this.picked.push(i);
    Sfx.play('pick', this.prizes[i].type === 'mult' ? 1 : 0);
    this.reveal(i, true);
    this.updateTally();
    if (this.picked.length >= HACK.picks) {
      this.locked = true;
      this.root.classList.remove('ready');
      setTimeout(() => this.finish(), 900);
    }
  },

  async finish() {
    // show what the other racks held
    let d = 0;
    this.racks.forEach((_, i) => {
      if (!this.picked.includes(i)) setTimeout(() => this.reveal(i, false), (d++) * 90);
    });
    await wait(1300);
    const { coins, mult, totalX } = this.sums(this.picked.map((i) => this.prizes[i]));
    const total = Math.round(totalX * this.bet * 100) / 100;
    await Panel.show({
      title: 'HACK COMPLETE', label: 'BONUS WIN', amount: total, theme: 'cyan',
      sub: `${fmt((coins || HACK.baseIfNoCoins) * this.bet)}  ×  ${mult}`,
    });
    this.root.classList.remove('show');
    await wait(450);
    this.resolve(total);
  },
};

/* =========================================================================
   GAME — round flow. A round = spin, line wins, then any feature it
   triggered. Free spins reuse the same round with `free = true`.
   ========================================================================= */
const round2 = (v) => Math.round(v * 100) / 100;

const Game = {
  reels: [],
  spinning: false,
  autoplay: false,
  locked: false,        // a feature is pending / running
  mode: 'base',         // 'base' | 'free' | 'bonus'
  modal: null,          // Space / Enter handler of an open overlay
  roundId: 0,
  rafId: 0,
  balance: START_BALANCE,
  shownBalance: START_BALANCE,
  betIndex: 2,
  forceNext: null,
  fs: null,

  get bet() { return BET_STEPS[this.betIndex]; },
  get lineBet() { return this.bet / PAYLINES.length; },

  init() {
    const reelsNode = $('#reels');
    placeBox(reelsNode, LAYOUT.reel_window);
    for (let i = 0; i < COLS; i++) this.reels.push(new Reel(i, reelsNode));
    WinFx.init();
    UI.init();
    Particles.init();
    BigWin.init();
    Intro.init();
    Panel.init();
    Hack.init();
    UI.setBalance(this.balance);
    UI.setBet(this.bet);
    this.buildLayoutDebug();
  },

  canStart() {
    return !this.spinning && !this.locked && !this.modal && !BigWin.active && this.mode === 'base';
  },

  /* SPIN button / Space */
  pressSpin() {
    if (this.modal) { this.modal(); return; }
    if (BigWin.active) { BigWin.skip(); return; }
    if (this.spinning) { this.quickStop(); return; }
    if (!this.canStart()) return;
    this.startRound();
  },

  async startRound() {
    const r = await this.playRound(false);
    if (!r || r.id !== this.roundId) return;          // player already started another spin
    if (!this.autoplay) return;
    await wait(r.win > 0 ? 150 : 380);
    if (r.id === this.roundId && this.autoplay && this.canStart()) this.startRound();
  },

  async playRound(free) {
    if (!free && this.balance < this.bet) {
      UI.toast('DEMO CREDITS TOPPED UP');
      this.setBalance(this.balance + START_BALANCE, 900);
      await wait(950);
    }
    const id = ++this.roundId;
    WinFx.clear(this.reels);
    if (!free) this.setBalance(this.balance - this.bet, 250);

    const grid = rollOutcome(this.forceNext, free);
    this.forceNext = null;
    await this.spinReels(grid);

    const fsAward = FS_AWARD[Math.min(countSym(grid, 'SC'), 5)] || 0;
    const bonus = !free && countSym(grid, 'BN') >= 3;
    if (fsAward || bonus) this.locked = true;

    const result = evaluate(grid, free);
    const win = round2(result.total * this.lineBet);
    if (win > 0) {
      if (free) { this.fs.won = round2(this.fs.won + win); UI.fsUpdate(); }
      if (win >= this.bet * TIER.BIG) {
        WinFx.showCells(this.reels, result.lines.flatMap((l) => l.cells));
        await BigWin.play(win, this.bet);
        this.setBalance(this.balance + win, 900);
        await WinFx.present(this.reels, result, this.lineBet, win, true);
      } else {
        this.setBalance(this.balance + win, Math.min(2200, 600 + (win / this.bet) * 120));
        await WinFx.present(this.reels, result, this.lineBet, win);
      }
    }

    if (fsAward) {
      await this.celebrateTrigger(grid, 'SC');
      if (free) {
        this.fs.left += fsAward;
        this.fs.total += fsAward;
        UI.fsUpdate(true);
        UI.toast(`+${fsAward} FREE SPINS`);
        await wait(1400);
      } else {
        await this.runFreeSpins(fsAward);
      }
    }
    if (bonus) {
      await this.celebrateTrigger(grid, 'BN');
      await this.runHackBonus();
    }
    if ((fsAward || bonus) && !free) this.locked = false;
    return { id, win };
  },

  /* Spin the reels to `grid`; resolves when every reel has settled.
     Two scatters (or bonus symbols) in view -> later reels slow down and glow. */
  spinReels(grid) {
    return new Promise((resolve) => {
      this.spinDone = resolve;
      this.spinning = true;
      this.spinStartedAt = now();
      Sfx.play('spin');
      UI.setSpinning(true);
      const t0 = now() + 16;
      let sc = 0, bn = 0, extra = 0;
      this.reels.forEach((reel, i) => {
        // tease while more scatters still pay more, or the 3rd bonus symbol is missing
        const tease = sc >= 2 || bn === 2;
        if (tease) extra += 650;
        const run = SPIN.baseRun + i * (SPIN.stopStagger - SPIN.startStagger) + extra;
        reel.spin(grid[i], t0 + i * SPIN.startStagger, run, tease);
        sc += grid[i].includes('SC') ? 1 : 0;
        bn += grid[i].includes('BN') ? 1 : 0;
      });
      this.loop();
    });
  },

  quickStop() {
    if (now() - this.spinStartedAt < 180) return;
    const t = now();
    let n = 0;
    for (const reel of this.reels) {
      if (reel.state === 'spinning' && reel.landAt === null && reel.slamAt === null) reel.slam(t + n++ * SPIN.slamStagger);
    }
  },

  loop() {
    cancelAnimationFrame(this.rafId);
    const tick = () => {
      const t = now();
      let done = true;
      for (const reel of this.reels) done = reel.update(t) && done;
      if (done) {
        this.spinning = false;
        UI.setSpinning(false);
        if (this.spinDone) { const r = this.spinDone; this.spinDone = null; r(); }
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  },

  /* frame the trigger symbols, spark them, short beat */
  async celebrateTrigger(grid, sym) {
    WinFx.clear(this.reels);
    const cells = [];
    grid.forEach((col, r) => col.forEach((x, row) => { if (x === sym) cells.push([r, row]); }));
    WinFx.showCells(this.reels, cells, null, 'trigger');
    for (const [r, row] of cells) {
      const [x, y] = WinFx.cellCenter(r, row);
      Particles.sparkBurst(36, x, y, sym === 'SC' ? '255, 180, 60' : '25, 227, 255', 0.8);
    }
    UI.toast(sym === 'SC' ? 'OVERRIDE TRIGGERED' : 'HACK BONUS TRIGGERED');
    await wait(1900);
    WinFx.clear(this.reels);
  },

  async runFreeSpins(n) {
    this.mode = 'free';
    UI.setFeature(true);
    await Intro.show(n);
    this.fs = { left: n, total: n, played: 0, won: 0 };
    stage.classList.add('fs');
    UI.fsShow();
    await wait(1100);
    while (this.fs.left > 0) {
      this.fs.left--;
      this.fs.played++;
      UI.fsUpdate(true);
      const r = await this.playRound(true);
      await wait(r.win > 0 ? 350 : 520);
    }
    await wait(300);
    WinFx.clear(this.reels);
    await Panel.show({
      title: 'OVERRIDE COMPLETE', label: 'TOTAL WIN', amount: this.fs.won, theme: 'amber',
      sub: `${this.fs.played} FREE SPINS`,
    });
    stage.classList.remove('fs');
    UI.fsHide();
    this.fs = null;
    this.mode = 'base';
    UI.setFeature(false);
  },

  async runHackBonus() {
    this.mode = 'bonus';
    UI.setFeature(true);
    const total = await Hack.play(this.bet);
    this.setBalance(this.balance + total, 1200);
    this.mode = 'base';
    UI.setFeature(false);
  },

  setBalance(v, dur = 600) {
    this.balance = round2(v);
    if (this.cancelBal) this.cancelBal();
    const from = this.shownBalance;
    this.cancelBal = tween(from, this.balance, dur, (x) => { this.shownBalance = x; UI.setBalance(x); });
    UI.balanceFlash(this.balance > from);
  },

  cycleBet() {
    if (this.spinning || this.mode !== 'base' || this.locked) return;
    this.betIndex = (this.betIndex + 1) % BET_STEPS.length;
    UI.setBet(this.bet);
  },

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    UI.setAutoplay(this.autoplay);
    if (this.autoplay && this.canStart()) this.startRound();
  },

  buildLayoutDebug() {
    const root = $('#layout-debug');
    const add = (box, round) => { const d = el('div', round ? 'round' : ''); placeBox(d, box); root.appendChild(d); };
    const g = LAYOUT.grid;
    g.column_x.forEach((x) => g.row_y.forEach((y) => add({ x, y, w: g.cell_w, h: g.cell_h })));
    for (const k of ['spin_button', 'autoplay_button', 'bet_button']) {
      const b = LAYOUT[k];
      add({ x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 }, true);
    }
    add(LAYOUT.balance_window);
    add(LAYOUT.total_bet_window);
  },
};

/* =========================================================================
   UI — hotspot buttons over the baked bottom bar, number windows, toast,
   free-spins counter on the logo plate.
   ========================================================================= */
const UI = {
  init() {
    this.spinBtn = $('#btn-spin');
    this.autoBtn = $('#btn-auto');
    this.betBtn = $('#btn-bet');
    placeCircle(this.spinBtn, FIT.spin);
    for (const [btn, box] of [[this.autoBtn, FIT.autoplay_face], [this.betBtn, FIT.bet_face]]) {
      placeBox(btn, box);
      $('.face', btn).style.backgroundPosition = `-${box.x}px -${box.y}px`;
    }
    placeBox($('#balance'), LAYOUT.balance_window);
    placeBox($('#total-bet'), LAYOUT.total_bet_window);
    this.balanceNum = $('#balance .num');
    this.betNum = $('#total-bet .num');
    this.fsBox = $('#fs-counter');
    const [lx, ly] = LAYOUT.logo_plate_center;
    Object.assign(this.fsBox.style, { left: lx + 'px', top: ly + 104 + 'px' });

    const press = (btn, fn) => {
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        btn.classList.add('pressed');
        fn();
      });
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    };
    press(this.spinBtn, () => Game.pressSpin());
    press(this.autoBtn, () => Game.toggleAutoplay());
    press(this.betBtn, () => Game.cycleBet());
  },

  setBalance(v) { this.balanceNum.textContent = fmt(v); },

  setBet(v) {
    this.betNum.textContent = fmt(v);
    const w = $('#total-bet');
    w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
  },

  balanceFlash(up) {
    const w = $('#balance');
    w.classList.remove('up');
    if (up) { void w.offsetWidth; w.classList.add('up'); }
  },

  setSpinning(on) {
    stage.classList.toggle('is-spinning', on);
    this.betBtn.classList.toggle('disabled', on || Game.mode !== 'base');
  },

  setFeature(on) {
    stage.classList.toggle('in-feature', on);
    this.betBtn.classList.toggle('disabled', on);
  },

  setAutoplay(on) { this.autoBtn.classList.toggle('active', on); },

  fsShow() { this.fsUpdate(); this.fsBox.classList.add('show'); },
  fsHide() { this.fsBox.classList.remove('show'); },
  fsUpdate(bump) {
    const fs = Game.fs;
    if (!fs) return;
    $('.val', this.fsBox).textContent = `${fs.played} / ${fs.total}`;
    $('.won', this.fsBox).textContent = fs.won > 0 ? 'WIN ' + fmt(fs.won) : '';
    if (bump) { this.fsBox.classList.remove('bump'); void this.fsBox.offsetWidth; this.fsBox.classList.add('bump'); }
  },

  toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  },
};

/* =========================================================================
   DEBUG — hidden keys for recording the portfolio moments.
     1 = Big Win next spin (press again: Mega, then Epic)
     2 = 3 Scatters -> OVERRIDE (press again: 4, then 5 Scatters)
     3 = 3 Bonus symbols -> Hack Bonus
   ========================================================================= */
const Debug = {
  bigCycle: 0,
  scCycle: 0,
  force(what) {
    if (!Game.canStart()) return;
    Game.forceNext = what;
    console.info('[AXIOM debug] next spin:', what);
    Game.startRound();
  },
  forceBig() { this.force(['big', 'mega', 'epic'][this.bigCycle++ % 3]); },
  forceScatter() { this.force(['sc3', 'sc4', 'sc5'][this.scCycle++ % 3]); },
  forceBonus() { this.force('bonus'); },
};

/* =========================================================================
   INPUT
   ========================================================================= */
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      UI.spinBtn.classList.add('pressed');
      Game.pressSpin();
    }
    if (e.code === 'KeyL') stage.classList.toggle('show-layout');
    if (e.code === 'Escape') { if (Game.modal) Game.modal(); else if (BigWin.active) BigWin.skip(); }
    if (e.code === 'Digit1' || e.code === 'Numpad1') Debug.forceBig();
    if (e.code === 'Digit2' || e.code === 'Numpad2') Debug.forceScatter();
    if (e.code === 'Digit3' || e.code === 'Numpad3') Debug.forceBonus();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') UI.spinBtn.classList.remove('pressed');
  });
}

/* =========================================================================
   SPLASH — 14_splash_screen_16x9.png full stage (logo baked in). The baked
   amber bar is covered by a live track that follows real asset loading,
   then "TAP TO START".
   ========================================================================= */
const SPLASH = {
  track: { x: 730, y: 1451, w: 1284, h: 24 },   // inner track of the baked loading bar
  minTime: 1800,                                // never flash by faster than this
};

const Splash = {
  init() {
    this.root = $('#splash');
    placeBox($('.sp-track', this.root), SPLASH.track);
    this.fill = $('.sp-fill', this.root);
    this.pct = $('.sp-pct', this.root);
    this.target = 0;
    this.shown = 0;
    this.t0 = now();
    const step = () => {
      // ease toward the real progress, capped by a minimum on-screen time
      const cap = Math.min(1, (now() - this.t0) / SPLASH.minTime);
      const goal = Math.min(this.target, cap);
      this.shown += (goal - this.shown) * 0.12;
      if (goal - this.shown < 0.002) this.shown = goal;
      this.fill.style.transform = `scaleX(${this.shown})`;
      this.pct.textContent = 'LOADING ' + Math.round(this.shown * 100) + '%';
      if (this.shown >= 1 && this.loaded) { this.ready(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  setProgress(p) { this.target = p; },
  done() { this.target = 1; this.loaded = true; },

  ready() {
    this.root.classList.add('ready');
    this.pct.textContent = 'SYSTEM ONLINE';
    const go = () => {
      Game.modal = null;
      this.root.onpointerdown = null;
      this.root.classList.add('out');
      stage.classList.add('live');
      Sfx.unlock();
      setTimeout(() => this.root.remove(), 900);
    };
    this.root.onpointerdown = go;
    Game.modal = go;
  },
};

/* =========================================================================
   SOUND — no audio files exist, so effects are synthesized with WebAudio.
   OFF by default; the speaker button (or M) turns it on.
   ========================================================================= */
const Sfx = {
  on: false,
  ctx: null,

  unlock() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
    }
    this.unlock();
    $('#btn-sound').classList.toggle('on', this.on);
    $('#btn-sound').setAttribute('aria-pressed', String(this.on));
    if (this.on) this.play('click');
  },

  tone(freq, dur, { type = 'sine', vol = 0.5, at = 0, slide = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, { vol = 0.3, freq = 1200, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  play(name, arg = 0) {
    if (!this.on || !this.ctx) return;
    switch (name) {
      case 'click':   this.tone(1400, 0.05, { type: 'square', vol: 0.12 }); break;
      case 'spin':    this.noise(0.35, { vol: 0.35, freq: 900 }); this.tone(220, 0.25, { type: 'sawtooth', vol: 0.08, slide: 2 }); break;
      case 'stop':    this.tone(150 - arg * 6, 0.12, { type: 'triangle', vol: 0.4, slide: 0.5 }); this.noise(0.05, { vol: 0.2, freq: 3000 }); break;
      case 'special': this.tone(150, 0.12, { type: 'triangle', vol: 0.4, slide: 0.5 });
                      [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.5, { vol: 0.18, at: i * 0.05 })); break;
      case 'win':     [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.22, at: i * 0.07 })); break;
      case 'tier':    [392, 523, 659, 784, 1046, 1318].slice(0, 4 + arg).forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', vol: 0.12, at: i * 0.08 }));
                      this.noise(0.6, { vol: 0.25, freq: 600 }); break;
      case 'pick':    this.noise(0.18, { vol: 0.3, freq: 2500 }); this.tone(arg ? 1200 : 700, 0.3, { type: 'square', vol: 0.12, slide: 1.5 }); break;
    }
  },
};

/* =========================================================================
   CORNER CONTROLS — sound + fullscreen (handy for recording the case study)
   ========================================================================= */
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }

  // Some browsers refuse fullscreen (iPhone Safari) and some in-app browsers never answer at all.
  // Never fail silently: inside the case-study player, open the game on its own page; on that page, say why.
  let done = false;
  const fallback = () => {
    if (done || d.fullscreenElement || d.webkitFullscreenElement) return;
    done = true;
    if (window.self !== window.top) window.top.location.href = new URL('index.html', location.href).href;
    else UI.toast('FULLSCREEN NOT AVAILABLE IN THIS BROWSER');
  };
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || d.fullscreenEnabled === false) return fallback();
  const granted = () => { done = true; };          // the browser answered: no fallback needed
  d.addEventListener('fullscreenchange', granted, { once: true });
  d.addEventListener('webkitfullscreenchange', granted, { once: true });
  try {
    const p = req.call(el);
    if (p && typeof p.catch === 'function') p.catch(fallback);
  } catch (e) { fallback(); }
  setTimeout(fallback, 1200); // no answer in time: treat as refused
}

// Exit control: show "Back to case study" only when the game is its own page, not inside the case-study frame
if (window.self === window.top) document.documentElement.classList.add('standalone');

function syncFullscreenButton() {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const b = $('#btn-full');
  b.classList.toggle('on', on);
  b.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
  b.title = on ? 'Exit fullscreen (F / Esc)' : 'Fullscreen (F)';
}
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);

function bindCorner() {
  $('#btn-sound').addEventListener('click', () => Sfx.toggle());
  $('#btn-full').addEventListener('click', () => { Sfx.play('click'); toggleFullscreen(); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyM') Sfx.toggle();
    if (e.code === 'KeyF') toggleFullscreen();
  });
  // button presses get a click when sound is on
  for (const id of ['#btn-auto', '#btn-bet']) $(id).addEventListener('pointerdown', () => Sfx.play('click'));
}

/* =========================================================================
   BOOT
   ========================================================================= */
fitStage();
window.addEventListener('resize', fitStage);
Splash.init();

loadAssets((p) => Splash.setProgress(p))
  .then(() => { Game.init(); bindInput(); bindCorner(); Splash.done(); })
  .catch((err) => { console.error(err); Splash.done(); });
