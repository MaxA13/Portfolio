'use strict';
/* KONGŌ GATE — live slot preview. Vanilla JS, no build step.
   Demo only: fake balance, no backend, no real money.
   Hidden debug keys: 1 big · 2 mega · 3 epic · 4 three scatters · 5 both guardians (next free spin). */

// =====================================================================
// ENGINE (pure, no DOM) — outcome category is chosen first, then a grid
// matching it is generated, so the demo hits its target frequencies:
// any win ~1/3, big+ ~1/25, free spins ~1/60.
// =====================================================================
const Engine = (() => {
  const PAYS = {
    H1: [10, 40, 150], H2: [10, 40, 150], H3: [8, 30, 100], H4: [6, 20, 75], H5: [5, 15, 50], H6: [4, 12, 40],
    L1: [2, 5, 20], L2: [2, 5, 15], L3: [1, 4, 12], L4: [1, 3, 10],
  };
  const SCATTER_PAY = [2, 10, 50];
  const FS_AWARD = [8, 12, 15];
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
  ];
  const BASE_W = { WILD: 2, SC: 2, H1: 3, H2: 3, H3: 4, H4: 5, H5: 6, H6: 7, L1: 10, L2: 10, L3: 10, L4: 10 };
  const NO_SC = Object.assign({}, BASE_W, { SC: 0 });
  const FS_W = Object.assign({}, BASE_W, { SC: 0, H1: 2.2, H2: 2.2 });
  const TIERS = [['epic', 100], ['mega', 40], ['big', 15]];

  const round2 = v => Math.round(v * 100) / 100;
  const rnd = n => Math.floor(Math.random() * n);
  const tierOf = m => { for (const [t, x] of TIERS) if (m >= x - 1e-9) return t; return null; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function pick(w) {
    let s = 0; for (const k in w) s += w[k];
    let r = Math.random() * s;
    for (const k in w) { r -= w[k]; if (r < 0) return k; }
    return 'L4';
  }
  // WILD only on reels 2–4; at most one scatter per reel
  const cellOk = (s, c, col) => !(s === 'WILD' && (c === 0 || c === 4)) && !(s === 'SC' && col.includes('SC'));
  function pickFor(w, c, col) { let s; do { s = pick(w); } while (!cellOk(s, c, col)); return s; }

  function randomGrid(w) {
    const g = [];
    for (let c = 0; c < 5; c++) { const col = []; for (let r = 0; r < 3; r++) col.push(pickFor(w, c, col)); g.push(col); }
    return g;
  }
  function biasedGrid(S, p, q) {
    const g = [];
    for (let c = 0; c < 5; c++) {
      const col = [];
      for (let r = 0; r < 3; r++) {
        const x = Math.random();
        if (x < p) col.push(S);
        else if (x < p + q && c > 0 && c < 4) col.push('WILD');
        else col.push(pickFor(NO_SC, c, col));
      }
      g.push(col);
    }
    return g;
  }

  // first H1/H2 per column → expands to a full-reel guardian wild (free spins only)
  function guardians(grid) {
    const out = [];
    grid.forEach((col, c) => {
      const r = col.findIndex(s => s === 'H1' || s === 'H2');
      if (r >= 0) out.push({ col: c, row: r, sym: col[r] });
    });
    return out;
  }

  function evaluate(grid, bet, expanded = []) {
    const lineBet = bet / 20;
    const exp = new Set(expanded.map(e => e.col));
    const at = (c, r) => (exp.has(c) ? 'WILD' : grid[c][r]);
    const lines = [];
    LINES.forEach((ln, i) => {
      const syms = ln.map((r, c) => at(c, r));
      const target = syms.find(s => s !== 'WILD') || 'H1';
      if (target === 'SC') return;
      let n = 0;
      while (n < 5 && (syms[n] === target || syms[n] === 'WILD')) n++;
      if (n >= 3) lines.push({ line: i, sym: target, count: n, win: PAYS[target][n - 3] * lineBet, cells: ln.slice(0, n).map((r, c) => [c, r]) });
    });
    const scCells = [];
    grid.forEach((col, c) => { if (!exp.has(c)) col.forEach((s, r) => { if (s === 'SC') scCells.push([c, r]); }); });
    const n = scCells.length;
    const scatter = { count: n, cells: scCells, win: n >= 3 ? SCATTER_PAY[Math.min(n, 5) - 3] * bet : 0 };
    const both = expanded.some(e => e.sym === 'H1') && expanded.some(e => e.sym === 'H2');
    const mult = both ? 3 : 1;
    const raw = lines.reduce((a, l) => a + l.win, 0) + scatter.win;
    return { lines, scatter, mult, total: round2(raw * mult), fs: n >= 3 ? FS_AWARD[Math.min(n, 5) - 3] : 0 };
  }

  const multOf = g => evaluate(g, 1).total; // total at bet 1 == win multiplier
  function genWhere(w, test, tries = 600) { let g; for (let i = 0; i < tries; i++) { g = randomGrid(w); if (test(g)) return g; } return g; }
  const genLose = () => genWhere(BASE_W, g => { const e = evaluate(g, 1); return e.total === 0 && e.scatter.count < 3; });
  const genSmall = () => genWhere(BASE_W, g => { const e = evaluate(g, 1); return e.total > 0 && e.total < 15 && e.scatter.count < 3; });

  function genScatter(n) {
    const g = genWhere(NO_SC, x => multOf(x) < 15);
    shuffle([0, 1, 2, 3, 4]).slice(0, n).forEach(c => { g[c][rnd(3)] = 'SC'; });
    return g;
  }

  function genTier(tier) {
    const lo = { big: 15, mega: 40, epic: 100 }[tier];
    const hi = { big: 40, mega: 100, epic: Infinity }[tier];
    const pool = { big: ['H1', 'H2', 'H3', 'H4', 'H5'], mega: ['H1', 'H2', 'H3'], epic: ['H1', 'H2'] }[tier];
    let best = null;
    for (let round = 0; round < 12; round++) {
      const S = pool[rnd(pool.length)];
      let p = { big: .55, mega: .75, epic: .9 }[tier];
      for (let i = 0; i < 500; i++) {
        const g = biasedGrid(S, p, .07);
        const m = multOf(g);
        if (m >= lo && m < hi) return g;
        if (m < lo) p = Math.min(.98, p + .006); else p = Math.max(.15, p - .006);
        best = g;
      }
    }
    return best;
  }

  function baseGrid(force) {
    if (force === 'big' || force === 'mega' || force === 'epic') return genTier(force);
    if (force === 'fs') return genScatter(3);
    const r = Math.random();
    let a = 1 / 60;
    if (r < a) { const x = Math.random(); return genScatter(x < .03 ? 5 : x < .15 ? 4 : 3); }
    if (r < (a += .004)) return genTier('epic');
    if (r < (a += .008)) return genTier('mega');
    if (r < (a += .028)) return genTier('big');
    if (r < (a += .285)) return genSmall();
    return genLose();
  }

  function fsGrid(forceBoth) {
    const g = randomGrid(FS_W);
    if (forceBoth) {
      g.forEach(col => col.forEach((s, r) => { if (s === 'H1' || s === 'H2') col[r] = 'L' + (1 + rnd(4)); }));
      const [a, b] = shuffle([0, 1, 2]); // early reels, so the wild columns connect to a left-to-right win
      g[a][rnd(3)] = 'H1'; g[b][rnd(3)] = 'H2';
    }
    return g;
  }

  const filler = () => pick(BASE_W);
  return { PAYS, LINES, SCATTER_PAY, FS_AWARD, evaluate, baseGrid, fsGrid, guardians, tierOf, filler, round2, randomGrid, BASE_W };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine; // allows `bun`/node simulation of the maths
} else {
  window.addEventListener('DOMContentLoaded', boot);
}

// =====================================================================
// LAYOUT — copied from layout.json (fetch() is blocked on file://)
// =====================================================================
// (single source for positions: build() applies these; style.css holds no coordinates for them)
const L = {
  W: 2752, H: 1536,
  reel: { x: 713, y: 399, w: 1327, h: 803 },
  colX: [713, 981, 1249, 1517, 1785], colW: 255, rowY0: 399, pitch: 268,
  frame: { x: 612, y: 298, w: 1529, h: 1007 },
  logo: { cx: 1376, cy: 150, w: 600 },
  win: { cx: 1376, cy: 308, w: 480 },
  spin: { cx: 1376, cy: 1415, d: 190, rotor: 534 / 740 }, // base never rotates; only the rotor does
  auto: { cx: 1182, cy: 1415, d: 120 },
  minus: { cx: 1560, cy: 1415, d: 100 },
  plus: { cx: 2024, cy: 1415, d: 100 },
  betPanel: { cx: 1792, cy: 1415, w: 320, h: 400 * 275 / 1289 }, // same height as balance, 20% narrower
  balPanel: { cx: 900, cy: 1415, w: 400 },
  menu: { cx: 2622, cy: 118, d: 110 },
};
const cellCX = c => L.colX[c] + L.colW / 2;
const cellCY = r => L.rowY0 + r * L.pitch + L.pitch / 2;

const SYMFILE = { WILD: 'wild_lotus', SC: 'scatter_bell', H1: 'h1_agyo', H2: 'h2_ungyo', H3: 'h3_vajra', H4: 'h4_pagoda', H5: 'h5_koi', H6: 'h6_lantern', L1: 'l1_daruma', L2: 'l2_fan', L3: 'l3_incense', L4: 'l4_beads' };
const SYMNAME = { WILD: 'Lotus Wild', SC: 'Temple Bell', H1: 'Agyō', H2: 'Ungyō', H3: 'Vajra', H4: 'Pagoda', H5: 'Koi', H6: 'Lantern', L1: 'Daruma', L2: 'Fan', L3: 'Incense', L4: 'Beads' };
const symSrc = id => `sprites/symbols/${SYMFILE[id]}.webp`;
const A = {
  bg: 'art/screens/game_bg.webp', bgfs: 'art/screens/game_bg_freespins.webp', intro: 'art/screens/freespins_intro_16x9.webp',
  frame: 'sprites/ui/reel_frame.webp', logo: 'sprites/ui/logo_kongo_gate.webp', tomoe: 'sprites/ui/preloader_tomoe.webp',
  spinBase: 'sprites/ui/btn_spin_base.webp', spinRotor: 'sprites/ui/btn_spin_rotor.webp', auto: 'sprites/ui/btn_autoplay.webp', plus: 'sprites/ui/btn_plus.webp', minus: 'sprites/ui/btn_minus.webp', menu: 'sprites/ui/btn_menu.webp',
  pBal: 'sprites/ui/panel_balance.webp', pBet: 'sprites/ui/panel_bet.webp', pWin: 'sprites/ui/panel_win.webp', pSpare: 'sprites/ui/panel_spare.webp',
  vajra: 'sprites/fx/vajra_spin.webp',
  bolt: i => `sprites/fx/lightning_${i}.webp`, flame: i => `sprites/fx/flame_${i}.webp`,
  dragon: t => `sprites/win/dragon_${t}.webp`, plaque: t => `sprites/win/plaque_${t}_win.webp`, plaqueFs: 'sprites/win/plaque_free_spins.webp',
  wild: s => `sprites/wilds/wild_${s === 'H1' ? 'agyo' : 'ungyo'}_full.webp`,
};
// blank cartouche centre on each dragon panel (fraction of panel height)
const CARTOUCHE = { big: .875, mega: .82, epic: .865 };
const BETS = [0.2, 0.5, 1, 2, 5];

// =====================================================================
// helpers
// =====================================================================
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const fmt = v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function el(tag, cls, parent, props) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (props) for (const k in props) {
    if (k === 'style') Object.assign(e.style, props.style);
    else if (k === 'text') e.textContent = props.text;
    else if (k === 'html') e.innerHTML = props.html;
    else e.setAttribute(k, props[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
function img(src, cls, parent, props) { const i = el('img', cls, parent, props); i.src = src; i.alt = ''; i.draggable = false; return i; }
const px = v => v + 'px';
function centre(e, cx, cy, w, h) { Object.assign(e.style, { left: px(cx), top: px(cy), width: px(w) }); if (h) e.style.height = px(h); return e; }
function tween(dur, fn, ease = t => 1 - Math.pow(1 - t, 3)) {
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => { const u = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur); fn(ease(u), u); if (u < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
}

// =====================================================================
// state + DOM refs
// =====================================================================
const S = {
  balance: 1000, shownBal: 1000, betIdx: 2,
  busy: false, spinning: false, auto: false, fs: null,
  force: null, forceBoth: false, overlay: 'splash', overlayAction: null,
  cycleId: 0, balTween: 0, winHideT: 0, btnAngle: 0, btnSpeed: 0,
  vajraAngle: 0, vajraSpeed: 0, vajraTarget: .12, bwTier: null,
};
const bet = () => BETS[S.betIdx];
const U = {};          // UI element refs
const reels = [];      // reel objects
const wildEls = [];    // expanded guardian panels by column
const IMG = {};        // preloaded Image objects (kept so decoded bitmaps stay cached)

// =====================================================================
// build
// =====================================================================
function build() {
  const stage = document.getElementById('stage');
  U.stage = stage;
  const game = U.game = el('div', '', stage, { id: 'game' });

  img(A.bg, 'bgimg', game, { id: 'bg' });
  img(A.bgfs, 'bgimg', game, { id: 'bgfs' });
  el('div', '', el('div', '', game, { id: 'sunWrap' }), { id: 'sun' });

  // depth: stage vignette (edges darker, frame area clear) + soft shadow hugging the reel frame
  el('div', 'layer noptr', game, { id: 'vignette' });
  el('div', 'noptr', game, { id: 'frameShadow', style: { left: px(L.frame.x + 40), top: px(L.frame.y + 40), width: px(L.frame.w - 80), height: px(L.frame.h - 80) } });
  img(A.frame, '', game, { id: 'frame', style: { left: px(L.frame.x), top: px(L.frame.y), width: px(L.frame.w), height: px(L.frame.h) } });
  const reelBox = U.reels = el('div', '', game, { id: 'reels', style: { left: px(L.reel.x), top: px(L.reel.y), width: px(L.reel.w), height: px(L.reel.h) } });
  const START = [['H4', 'L4', 'L3'], ['H3', 'H6', 'SC'], ['H1', 'WILD', 'L1'], ['L2', 'H5', 'H6'], ['H2', 'L1', 'L4']];
  for (let c = 0; c < 5; c++) {
    const col = el('div', 'col', reelBox, { style: { left: px(L.colX[c] - L.reel.x) } });
    const strip = el('div', 'strip', col);
    const R = { c, col, strip, cells: [], syms: [] };
    reels.push(R);
    setReel(R, START[c]);
  }
  U.wilds = el('div', '', game, { id: 'wilds' });

  // fx: paylines svg + lightning + ripples
  U.fx = el('div', '', game, { id: 'fx' });
  U.fx.innerHTML = `<svg id="lines" viewBox="0 0 2752 1536" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="lineGlow" x="-10%" y="-30%" width="120%" height="160%">
      <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs><g id="lineG"></g></svg>`;
  U.lineG = U.fx.querySelector('#lineG');

  // win panel (hidden unless there is a win) + ×3 stamp
  U.winPanel = centre(el('div', 'abs', game, { id: 'winPanel' }), L.win.cx, L.win.cy, L.win.w);
  img(A.pWin, '', U.winPanel);
  U.winVal = el('div', 'val ivory', U.winPanel);
  U.stamp = centre(el('div', 'ctr goldtext', game, { id: 'stamp', text: '×3' }), L.win.cx + L.win.w / 2 + 84, L.win.cy - 3);
  U.stamp.style.width = '';

  // logo + soft pulsing glow behind it
  centre(el('div', 'ctr logoGlow', game, { id: 'logoGlow' }), L.logo.cx, L.logo.cy, L.logo.w * 1.5, L.logo.w * .85);
  U.logo = centre(el('div', 'ctr', game, { id: 'logo' }), L.logo.cx, L.logo.cy, L.logo.w);
  U.logoImg = img(A.logo, '', U.logo);
  U.shine = el('canvas', '', U.logo, { id: 'logoShine', width: 1120, height: 535 });
  letterShine(U.logo, 'lsGame');

  // free spins HUD near the logo
  const hud = el('div', '', game, { id: 'fsHud' });
  U.fsLeft = panel(hud, A.pSpare, 640, L.logo.cy, 430, 'FREE SPINS');
  U.fsWin = panel(hud, A.pSpare, 2112, L.logo.cy, 430, 'TOTAL WIN');

  // bottom bar + menu
  U.bal = panel(game, A.pBal, L.balPanel.cx, L.balPanel.cy, L.balPanel.w, 'BALANCE');
  U.bet = panel(game, A.pBet, L.betPanel.cx, L.betPanel.cy, L.betPanel.w, 'BET');
  slicePanel(U.bet.root, A.pBet, L.betPanel.h);
  U.autoBtn = button(game, A.auto, L.auto, toggleAuto, 'autoBtn', 'Autoplay');
  U.spinBtn = button(game, A.spinBase, L.spin, onSpinPress, 'spinBtn', 'Spin');
  // static base (lighting baked in) + rotor: only the inner tomoe disc ever rotates
  U.spinBtn.querySelector('img').classList.add('base');
  // the rotor sprite has top-lit lighting baked in; a counter-gradient (rotates with it) cancels that,
  // so the spinning disc reads evenly lit instead of a light/shadow side wheeling around
  U.spinImg = el('div', 'rotorWrap', U.spinBtn.querySelector('.press'));
  Object.assign(U.spinImg.style, { width: (L.spin.rotor * 100) + '%', height: (L.spin.rotor * 100) + '%' });
  img(A.spinRotor, 'rotor', U.spinImg);
  el('div', 'rotorFlat', U.spinImg);
  U.minusBtn = button(game, A.minus, L.minus, () => changeBet(-1), 'minusBtn', 'Lower bet');
  U.plusBtn = button(game, A.plus, L.plus, () => changeBet(1), 'plusBtn', 'Raise bet');
  U.menuBtn = button(game, A.menu, L.menu, openPaytable, 'menuBtn', 'Paytable');
  // sound toggle: code-drawn (no sprite exists for it), sits left of the menu
  const sb = U.sndBtn = centre(el('div', 'btn', game, { id: 'sndBtn', role: 'button', 'aria-label': 'Sound on/off' }), L.menu.cx - 132, L.menu.cy, 84, 84);
  el('div', 'press', sb, { html: `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="sp" d="M12 25h9l13-11v36L21 39h-9z"/>
    <path class="wv" d="M41 24q6 8 0 16M47 18q11 14 0 28"/><path class="x" d="M41 24l14 16M55 24L41 40"/></svg>` });
  sb.addEventListener('pointerdown', e => { e.preventDefault(); sb.classList.add('down'); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(k => sb.addEventListener(k, () => sb.classList.remove('down')));
  sb.addEventListener('click', e => { e.stopPropagation(); toggleSound(); });
  sb.classList.toggle('muted', !SFX.on);

  U.petals = el('canvas', 'pcanvas', game, { width: 1376, height: 768 });

  buildBigWin(stage);
  buildFsIntro(stage);
  buildFsEnd(stage);
  buildPaytable(stage);
  buildPreloader();

  updateBalance(S.balance); updateBet();
}

// draw a panel narrower than its art without distorting it: the left and right halves are drawn at
// the art's true scale (nothing compressed) and overlap in the plain middle, where the right half fades
// in over the left, so no seam shows. The sprite file is untouched.
function slicePanel(p, src, h) {
  // same <img> at the same size as the balance panel (400 wide), cropped by two clip boxes: left box shows
  // the art's left end, right box its right end; they overlap in the plain middle with a soft fade
  const imgEl = p.querySelector('img'); imgEl.remove();
  p.style.height = px(h);
  const W = parseFloat(p.style.width), full = h * 1289 / 275, ov = 60, half = (W + ov) / 2;
  const box = (side) => {
    const b = el('div', '', null, { style: { position: 'absolute', top: '0', [side]: '0', width: px(half), height: '100%', overflow: 'hidden' } });
    img(src, '', b, { style: { position: 'absolute', top: '0', [side]: '0', width: px(full), height: 'auto', maxWidth: 'none' } });
    return b;
  };
  const l = box('left'), r = box('right');
  const fade = `linear-gradient(to right, transparent 0, #000 ${ov}px)`;
  r.style.maskImage = fade; r.style.webkitMaskImage = fade;
  p.insertBefore(r, p.firstChild); p.insertBefore(l, r);
}

function panel(parent, src, cx, cy, w, label) {
  const p = centre(el('div', 'panel', parent), cx, cy, w);
  img(src, '', p);
  const t = el('div', 'txt', p);
  el('div', 'lab', t, { text: label });
  const v = el('div', 'val ivory', t);
  return { root: p, val: v };
}

function button(parent, src, pos, fn, id, label) {
  const b = centre(el('div', 'btn', parent, { id, role: 'button', 'aria-label': label }), pos.cx, pos.cy, pos.d, pos.d);
  const p = el('div', 'press', b);
  img(src, '', p);
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); });
  const up = () => b.classList.remove('down');
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  b.addEventListener('click', e => { e.stopPropagation(); if (id !== 'spinBtn') SFX.click(id === 'plusBtn' ? 1 : id === 'minusBtn' ? -1 : 0); fn(); });
  return b;
}

// =====================================================================
// reels
// =====================================================================
// High coins (H1–H6) get a code-drawn gold rim: three masked blend layers over the sprite's dark
// rim band (art untouched). Wild stays the only fully gold coin. `plain` skips the layers for
// filler cells that only ever pass by blurred mid-spin.
const HIGH = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
function coinEl(sym, plain) {
  const c = el('div', 'coin');
  img(symSrc(sym), '', c);
  if (HIGH.has(sym) && !plain) {
    el('div', 'gild lift', c); el('div', 'gild ov', c); el('div', 'gild ov2', c);
  }
  return c;
}
function makeCell(sym, i, plain) {
  const d = el('div', 'cell', null, { style: { top: px(i * L.pitch) } });
  d.appendChild(coinEl(sym, plain));
  return d;
}
function setReel(R, syms) {
  R.strip.textContent = '';
  R.cells = syms.map((s, i) => R.strip.appendChild(makeCell(s, i)));
  R.syms = syms.slice();
  R.strip.style.transform = 'translate3d(0,0,0)';
}

const WIND = 160, SETTLE = 250, OS = 26;
// velocity profile: heavy ease-in, cruise, ease-out that still carries speed into the landing
function prof(u) {
  const a = .3, b = .66, ve = .14;
  const A_ = a / 2 + (b - a) + (1 - b) * (1 + ve) / 2;
  let p;
  if (u < a) p = u * u / (2 * a);
  else if (u < b) p = a / 2 + (u - a);
  else { const x = u - b, Ln = 1 - b; p = a / 2 + (b - a) + x - (1 - ve) * x * x / (2 * Ln); }
  return p / A_;
}

function spinReels(grid) {
  return new Promise(resolve => {
    const now = performance.now();
    let scSeen = 0, extra = 0;
    reels.forEach((R, c) => {
      const antic = !S.fs && scSeen >= 2;
      if (antic) extra += 800;
      const T = 860 + c * 130 + extra;
      const K = Math.round(T / 64);
      const filler = Array.from({ length: K }, Engine.filler);
      const syms = [...grid[c], ...filler, ...R.syms];
      R.strip.textContent = '';
      R.cells = syms.map((s, i) => R.strip.appendChild(makeCell(s, i, i >= 3 && i < 3 + K)));
      Object.assign(R, { D: (K + 3) * L.pitch, T, t0: now, antic, landed: false, done: false, blur: false, final: grid[c].slice() });
      R.col.classList.add('clip');
      R.strip.style.transform = `translate3d(0,${-R.D}px,0)`;
      scSeen += grid[c].filter(s => s === 'SC').length;
    });
    S.spinning = true; S.scLanded = 0;
    SFX.spinStart();
    S.onReelsDone = resolve;
    requestAnimationFrame(reelTick);
  });
}

function reelTick(now) {
  let all = true;
  for (const R of reels) {
    if (R.done) continue;
    all = false;
    const t = now - R.t0;
    let y, blur = false;
    if (t < WIND) y = -R.D - OS * Math.sin(Math.PI * t / WIND);           // heavy lift before the drop
    else if (t < WIND + R.T) { const u = (t - WIND) / R.T; y = -R.D + R.D * prof(u); blur = u > .12 && u < .9; }
    else if (t < WIND + R.T + SETTLE) {                                        // overshoot + settle
      if (!R.landed) land(R);
      const s = (t - WIND - R.T) / SETTLE;
      y = OS * Math.sin(Math.PI * s) * (1 - s);
    } else { if (!R.landed) land(R); finishReel(R); continue; }
    R.strip.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
    if (blur !== R.blur) { R.blur = blur; R.strip.classList.toggle('blur', blur); }
  }
  if (all) { S.spinning = false; const f = S.onReelsDone; S.onReelsDone = null; if (f) f(); }
  else requestAnimationFrame(reelTick);
}

function land(R) {
  R.landed = true;
  R.blur = false; R.strip.classList.remove('blur');
  R.col.classList.remove('antic');
  for (let r = 0; r < 3; r++) {
    const d = R.cells[r];
    d.classList.add(R.final[r] === 'SC' ? 'bell' : 'thud');
    if (R.final[r] === 'SC') SFX.scatter(S.scLanded++, R.c);
    setTimeout(() => d.classList.remove('thud', 'bell'), 900);
  }
  SFX.reelStop(R.c);
  const next = reels[R.c + 1];
  if (next && next.antic && !next.landed) {
    next.col.classList.add('antic');
    SFX.antic((next.t0 + WIND + next.T - performance.now()) / 1000, next.c);
  }
}

function finishReel(R) {
  R.done = true;
  R.strip.style.transform = 'translate3d(0,0,0)';
  R.cells.slice(3).forEach(d => d.remove());
  R.cells = R.cells.slice(0, 3);
  R.syms = R.final;
  R.col.classList.remove('clip');
}

function slam() {
  const now = performance.now();
  let k = 0;
  for (const R of reels) {
    if (R.landed) continue;
    const t = now - R.t0;
    const target = WIND + R.T - (120 + k * 70);
    k++;
    if (target > t) R.t0 = now - target;
    R.col.classList.remove('antic');
  }
}

// =====================================================================
// spin flow
// =====================================================================
function onSpinPress() {
  if (S.overlay === 'splash') return;
  if (S.overlay) { if (S.overlayAction) S.overlayAction(); return; }
  if (S.spinning) { slam(); return; }
  if (S.busy) return;
  if (S.auto) { toggleAuto(); return; }
  baseSpin();
}

async function baseSpin() {
  if (S.busy || S.overlay) return;
  if (S.balance < bet() - 1e-9) {
    U.bal.val.classList.add('bad'); setTimeout(() => U.bal.val.classList.remove('bad'), 900);
    if (S.auto) toggleAuto();
    return;
  }
  S.busy = true; setControls();
  credit(-bet(), true);
  const win = await playSpin(false);
  S.busy = false; setControls();
  if (S.auto) setTimeout(() => { if (S.auto && !S.busy && !S.overlay) baseSpin(); }, win > 0 ? 1600 : 650);
}

async function playSpin(inFs) {
  stopCycle(); hideWinPanel(); clearWilds();
  let grid;
  if (inFs) { grid = Engine.fsGrid(S.forceBoth); S.forceBoth = false; }
  else { grid = Engine.baseGrid(S.force); S.force = null; }
  S.btnSpin = true;
  await spinReels(grid);
  S.btnSpin = false;
  return resolveSpin(grid, inFs);
}

async function resolveSpin(grid, inFs) {
  let expanded = [];
  if (inFs) {
    expanded = Engine.guardians(grid);
    for (const g of expanded) { await strike(g.col); await growGuardian(g); }
  }
  const b = bet();
  const ev = Engine.evaluate(grid, b, expanded);
  if (ev.scatter.count >= 3) await ringBells(ev.scatter.cells);
  if (ev.total > 0) {
    const tier = Engine.tierOf(ev.total / b);
    highlight(winCells(ev));
    if (tier) { await sleep(650); await bigWin(ev.total); }
    else SFX.win(ev.total / b);
    credit(ev.total);
    if (inFs) { S.fs.win = Engine.round2(S.fs.win + ev.total); updateFsHud(); }
    showWinPanel(ev.total, ev.mult === 3);
    startCycle(ev);
    if (!tier) await sleep(inFs ? 1500 : 350);
  }
  if (ev.fs && !inFs) { await sleep(500); await freeSpins(ev.fs); }
  return ev.total;
}

function setControls() {
  const locked = S.busy || !!S.fs;
  U.minusBtn.classList.toggle('off', locked || S.betIdx === 0);
  U.plusBtn.classList.toggle('off', locked || S.betIdx === BETS.length - 1);
}
function changeBet(d) {
  if (S.busy || S.fs) return;
  S.betIdx = Math.max(0, Math.min(BETS.length - 1, S.betIdx + d));
  updateBet(); setControls();
}
function updateBet() { U.bet.val.textContent = fmt(bet()); fillPaytable(); }
function toggleAuto() {
  S.auto = !S.auto;
  U.autoBtn.classList.toggle('on', S.auto);
  if (S.auto && !S.busy && !S.overlay) baseSpin();
}

function toggleSound() { const on = SFX.toggle(); U.sndBtn.classList.toggle('muted', !on); if (on) { SFX.ambient(S.fs ? 'storm' : 'base'); SFX.click(); } }

function updateBalance(v) { U.bal.val.textContent = fmt(v); }
function credit(amt, instant) {
  S.balance = Engine.round2(S.balance + amt);
  const from = S.shownBal, to = S.balance, id = ++S.balTween;
  const dur = instant ? 0 : Math.min(1800, 500 + (amt / bet()) * 60);
  tween(dur, k => { if (id !== S.balTween) return; S.shownBal = from + (to - from) * k; updateBalance(S.shownBal); })
    .then(() => { if (id === S.balTween) { S.shownBal = to; updateBalance(to); } });
}

// =====================================================================
// win presentation
// =====================================================================
function winCells(ev) {
  const set = new Map();
  ev.lines.forEach(l => l.cells.forEach(([c, r]) => set.set(c + ':' + r, [c, r])));
  ev.scatter.win && ev.scatter.cells.forEach(([c, r]) => set.set(c + ':' + r, [c, r]));
  return [...set.values()];
}
function clearHL() {
  U.reels.classList.remove('hl'); U.wilds.classList.remove('hl');
  reels.forEach(R => R.cells.forEach(d => d.classList.remove('win')));
  wildEls.forEach(w => w && w.classList.remove('win'));
}
function highlight(cells) {
  clearHL();
  U.reels.classList.add('hl'); U.wilds.classList.add('hl');
  cells.forEach(([c, r]) => { if (wildEls[c]) wildEls[c].classList.add('win'); else reels[c].cells[r].classList.add('win'); });
}

function linePoints(i) {
  const ln = Engine.LINES[i];
  return [[L.colX[0] - 46, cellCY(ln[0])], ...ln.map((r, c) => [cellCX(c), cellCY(r)]), [L.colX[4] + L.colW + 46, cellCY(ln[4])]];
}
function drawLine(i, faint) {
  const d = 'M' + linePoints(i).map(p => p.join(',')).join(' L');
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('opacity', faint ? '.55' : '1');
  const mk = (stroke, w, filter) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', w);
    p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('pathLength', '1');
    p.setAttribute('stroke-dasharray', '1'); p.setAttribute('stroke-dashoffset', '1');
    if (filter) p.setAttribute('filter', 'url(#lineGlow)');
    g.appendChild(p);
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: faint ? 450 : 380, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  };
  mk('rgba(40,22,8,.85)', 17); mk('#D4A63C', 10, true); mk('#FFF3C4', 3.5);
  U.lineG.appendChild(g);
}
const clearLines = () => { U.lineG.textContent = ''; };

function flashBolt(c, r) {
  const b = img(A.bolt(1 + rnd(4)), 'bolt', U.fx);
  const rot = (Math.random() * 36 - 18).toFixed(1);
  Object.assign(b.style, { left: px(cellCX(c)), top: px(cellCY(r)), height: '400px' });
  const tf = s => `translate(-50%,-50%) rotate(${rot}deg) scale(${s})`;
  b.animate([{ opacity: 0, transform: tf(.3) }, { opacity: 1, transform: tf(1.08), offset: .3 }, { opacity: 0, transform: tf(1) }],
    { duration: 420, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
}

function startCycle(ev) {
  const id = ++S.cycleId;
  const items = ev.lines.map(l => ({ line: l.line, cells: l.cells }));
  if (ev.scatter.win) items.push({ line: null, cells: ev.scatter.cells });
  (async () => {
    ev.lines.forEach(l => drawLine(l.line, true));
    await sleep(1400);
    while (id === S.cycleId) {
      for (const it of items) {
        if (id !== S.cycleId) return;
        clearLines(); highlight(it.cells);
        if (it.line !== null) drawLine(it.line);
        SFX.line(items.indexOf(it));
        const mid = it.cells[Math.floor((it.cells.length - 1) / 2)];
        flashBolt(mid[0], mid[1]);
        await sleep(1200);
      }
    }
  })();
}
function stopCycle() { S.cycleId++; clearLines(); clearHL(); }

function showWinPanel(amount, x3) {
  clearTimeout(S.winHideT);
  U.winPanel.classList.add('show');
  tween(Math.min(900, 300 + amount / bet() * 40), k => { U.winVal.textContent = fmt(amount * k); });
  U.stamp.classList.remove('show');
  if (x3) { void U.stamp.offsetWidth; U.stamp.classList.add('show'); SFX.x3(); }
  S.winHideT = setTimeout(hideWinPanel, S.fs ? 3200 : 4200);
}
function hideWinPanel() { clearTimeout(S.winHideT); U.winPanel.classList.remove('show'); U.stamp.classList.remove('show'); }

async function ringBells(cells) {
  SFX.templeBell();
  cells.forEach(([c, r]) => {
    reels[c].cells[r].classList.add('ring');
    for (let k = 0; k < 3; k++) {
      const ring = el('div', 'ripple', U.fx, { style: { left: px(cellCX(c)), top: px(cellCY(r)), animationDelay: k * 280 + 'ms' } });
      setTimeout(() => ring.remove(), 2200);
    }
  });
  await sleep(1800);
  cells.forEach(([c, r]) => reels[c].cells[r] && reels[c].cells[r].classList.remove('ring'));
}

function shake(mag = 8, dur = 320) {
  const k = [];
  for (let i = 0; i <= 8; i++) { const f = (1 - i / 8) * mag; k.push({ transform: `translate(${(Math.random() * 2 - 1) * f}px,${(Math.random() * 2 - 1) * f}px)` }); }
  U.game.animate(k, { duration: dur, easing: 'linear' });
}

// =====================================================================
// guardians (free spins expanding wilds)
// =====================================================================
async function strike(c) {
  const b = img(A.bolt(1 + rnd(4)), 'bolt', U.fx);
  Object.assign(b.style, { left: px(cellCX(c)), top: px(L.reel.y - 150), height: '1100px', transformOrigin: '50% 0' });
  SFX.strike(c);
  b.animate([
    { opacity: 0, transform: 'translateX(-50%) scaleY(.08)' },
    { opacity: 1, transform: 'translateX(-50%) scaleY(1)', offset: .22 },
    { opacity: 1, transform: 'translateX(-50%) scaleY(1)', offset: .55 },
    { opacity: 0, transform: 'translateX(-50%) scaleY(1)' },
  ], { duration: 620, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
  const f = el('div', 'colflash', U.fx, { style: { left: px(L.colX[c] - 30), top: px(L.reel.y), width: px(L.colW + 60), height: px(L.reel.h) } });
  f.animate([{ opacity: 0 }, { opacity: .9, offset: .2 }, { opacity: 0 }], { duration: 520 }).onfinish = () => f.remove();
  await sleep(110); shake(7, 300);
  await sleep(260);
}

async function growGuardian({ col, row, sym }) {
  SFX.guardian(sym, col);
  const h = L.reel.h - 6, w = Math.round(h * 459 / 1100);
  const left = cellCX(col) - w / 2, top = L.reel.y + 3;
  // flame halo flickering behind
  const fl = img(A.flame(1), 'flamefx', U.wilds, { style: { left: px(cellCX(col)), top: px(L.reel.y - 120) } });
  let fi = 0; const ft = setInterval(() => { fl.src = A.flame(1 + (++fi % 4)); }, 85);
  fl.animate([{ opacity: 0 }, { opacity: .95, offset: .25 }, { opacity: .7, offset: .6 }, { opacity: 0 }], { duration: 1300, fill: 'forwards' })
    .onfinish = () => { clearInterval(ft); fl.remove(); };
  const p = img(A.wild(sym), 'wildpanel', U.wilds, { style: { left: px(left), top: px(top), width: px(w), height: px(h), transformOrigin: `${w / 2}px ${cellCY(row) - top}px` } });
  wildEls[col] = p;
  const flip = sym === 'H2' ? ' scaleX(-1)' : '';   // Ungyō mirrored in code so both guardians face the same way (art untouched)
  p.animate([
    { opacity: 0, transform: `scale(.31)${flip}` },
    { opacity: 1, transform: `scale(.34)${flip}`, offset: .12 },
    { opacity: 1, transform: `scale(1.05)${flip}`, offset: .72 },
    { opacity: 1, transform: `scale(1)${flip}` },
  ], { duration: 720, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
  setTimeout(() => { reels[col].col.style.visibility = 'hidden'; }, 260);
  await sleep(780);
}

function clearWilds() {
  wildEls.forEach((w, c) => { if (w) { w.remove(); wildEls[c] = null; reels[c].col.style.visibility = ''; } });
}

// =====================================================================
// big win
// =====================================================================
function buildBigWin(stage) {
  const o = U.bw = el('div', 'overlay', stage, { id: 'bigwin' });
  U.bwParticles = el('canvas', 'pcanvas', o, { width: 1376, height: 768 });
  U.bwFlameL = img(A.flame(1), 'flame', o, { style: { left: '640px' } });
  U.bwFlameR = img(A.flame(2), 'flame', o, { style: { left: '2112px', transform: 'translate(-50%,-50%) scaleX(-1)' } });
  // fixed-size box; one stacked layer per tier (dragon + its plaque), crossfaded on upgrade
  U.bwPanel = el('div', 'ctr', o, { id: 'bwPanel' });
  U.bwLayers = {};
  for (const t of ['big', 'mega', 'epic']) {
    const ly = el('div', 'bwLayer', U.bwPanel);
    img(A.dragon(t), 'dragon', ly);
    const pq = img(A.plaque(t), 'bwPlaque', ly, { style: { top: (CARTOUCHE[t] * 100) + '%' } });
    U.bwLayers[t] = { ly, pq };
  }
  U.bwVajra = img(A.vajra, 'ctr vajra', o, { id: 'bwVajra' });
  U.bwAmount = el('div', 'ctr goldtext', o, { id: 'bwAmount' });
  el('div', 'ctr hint', o, { id: 'bwHint', text: 'CLICK TO SKIP' });
}

const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
function setTier(t, first) {
  const prev = S.bwTier;
  S.bwTier = t;
  U.bw.classList.toggle('epic', t === 'epic');
  S.vajraTarget = { big: .12, mega: .22, epic: .36 }[t]; // deg per ms
  P.rate = { big: 1, mega: 2, epic: 3.4 }[t];
  if (t === 'epic' && !U.flameT) {
    let f = 0;
    U.flameT = setInterval(() => { f++; U.bwFlameL.src = A.flame(1 + (f % 4)); U.bwFlameR.src = A.flame(1 + ((f + 2) % 4)); }, 95);
  }
  const cur = U.bwLayers[t];
  if (first) {
    for (const k in U.bwLayers) {
      const { ly, pq } = U.bwLayers[k];
      ly.getAnimations().concat(pq.getAnimations()).forEach(a => a.cancel());
      ly.style.opacity = k === t ? 1 : 0;
    }
    U.bwPanel.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) translateY(50px) scale(.85)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: 900, easing: EASE_OUT, fill: 'both' });
    cur.pq.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: 700, delay: 500, easing: EASE_OUT, fill: 'both' });
    U.bwVajra.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out', fill: 'both' });
  } else {
    // upgrade: old tier fades out, new one fades in from a soft gold flash and settles
    if (prev && U.bwLayers[prev]) U.bwLayers[prev].ly.animate({ opacity: 0 }, { duration: 600, easing: 'ease-in-out', fill: 'forwards' });
    cur.ly.animate([
      { opacity: 0, transform: 'translateY(-50%) scale(1.03)', filter: 'brightness(1.7)' },
      { opacity: 1, transform: 'translateY(-50%) scale(1)', filter: 'brightness(1)' },
    ], { duration: 800, easing: EASE_OUT, fill: 'forwards' });
    cur.pq.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.18)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: 700, delay: 200, easing: EASE_OUT, fill: 'both' });
  }
}

function bigWin(amount) {
  const b = bet();
  const finalTier = Engine.tierOf(amount / b);
  const dur = { big: 3400, mega: 5200, epic: 7200 }[finalTier];
  let tier = 'big';
  return new Promise(res => {
    setTier(tier, true);
    SFX.bigStart();
    U.bwAmount.textContent = fmt(0);
    U.bw.classList.add('show');
    S.overlay = 'bigwin';
    startParticles(U.bwParticles);
    let skip = false, finished = false, closed = false, autoT = 0;
    const t0 = performance.now() + 500;
    const close = () => {
      if (closed) return; closed = true; clearTimeout(autoT);
      U.bw.classList.remove('show'); stopParticles(); SFX.coinRain(0);
      clearInterval(U.flameT); U.flameT = 0;
      S.overlay = null; S.overlayAction = null;
      setTimeout(res, 450);
    };
    S.overlayAction = () => { if (!finished) skip = true; else close(); };
    U.bw.onclick = () => S.overlayAction && S.overlayAction();
    const step = now => {
      if (closed) return;
      let u = Math.max(0, Math.min(1, (now - t0) / dur));
      if (skip) u = 1;
      const v = amount * (1 - Math.pow(1 - u, 1.7));
      U.bwAmount.textContent = fmt(v);
      const nt = Engine.tierOf(v / b) || 'big';
      if (nt !== tier && (nt === 'mega' || nt === 'epic')) { tier = nt; setTier(tier, false); SFX.tierUp(tier); }
      if (u < 1) requestAnimationFrame(step);
      else {
        finished = true;
        if (tier !== finalTier) { tier = finalTier; setTier(tier, false); SFX.tierUp(tier); }
        SFX.bigEnd();
        U.bwAmount.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.07)', offset: .35 }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 700, easing: 'ease-in-out' });
        autoT = setTimeout(close, S.auto || S.fs ? 1800 : 3000);
      }
    };
    requestAnimationFrame(step);
  });
}

// particles: gold coins + sakura petals on a half-res canvas
const P = { list: [], on: false, rate: 1, cv: null, acc: 0 };
function startParticles(cv) { P.cv = cv; P.on = true; P.list = []; P.acc = 0; P.last = performance.now(); requestAnimationFrame(particleTick); }
function stopParticles() { P.on = false; }
function particleTick(now) {
  const cv = P.cv, ctx = cv.getContext('2d');
  const dt = Math.min(50, now - P.last) / 16.7; P.last = now;
  if (P.on) {
    P.acc += P.rate * dt * .9;
    while (P.acc >= 1) {
      P.acc--;
      if (Math.random() < .93) P.list.push({ k: 'c', x: 688 + (Math.random() - .5) * 360, y: 470, vx: (Math.random() - .5) * 13, vy: -(9 + Math.random() * 10), r: 9 + Math.random() * 8, a: Math.random() * 6, va: .1 + Math.random() * .25 });
      else P.list.push({ k: 'p', x: Math.random() * 1376, y: -20, vx: .6 + Math.random() * 1.2, vy: 1.2 + Math.random() * 1.6, r: 7 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - .5) * .08, ph: Math.random() * 6 });
    }
  }
  ctx.clearRect(0, 0, cv.width, cv.height);
  P.list = P.list.filter(p => p.y < 820 && p.x > -40 && p.x < 1420);
  for (const p of P.list) {
    p.a += p.va * dt;
    if (p.k === 'c') {
      p.vy += .42 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const sx = Math.abs(Math.cos(p.a));
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(Math.max(.12, sx), 1);
      const g = ctx.createRadialGradient(-p.r * .3, -p.r * .3, 1, 0, 0, p.r);
      g.addColorStop(0, '#FFF3C4'); g.addColorStop(.45, '#F6DC8A'); g.addColorStop(.8, '#D4A63C'); g.addColorStop(1, '#7A5230');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(122,82,48,.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, p.r * .62, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else drawPetal(ctx, p, dt);
  }
  if (P.on || P.list.length) requestAnimationFrame(particleTick);
  else ctx.clearRect(0, 0, cv.width, cv.height);
}
function drawPetal(ctx, p, dt) {
  p.ph += .03 * dt;
  p.x += (p.vx + Math.sin(p.ph) * .9) * dt; p.y += p.vy * dt;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, .55 + .45 * Math.abs(Math.sin(p.ph * 1.3)));
  ctx.fillStyle = p.alpha ? `rgba(242,184,192,${p.alpha})` : '#F2B8C0';
  ctx.beginPath();
  ctx.moveTo(0, -p.r);
  ctx.bezierCurveTo(p.r * .9, -p.r * .6, p.r * .8, p.r * .6, 0, p.r);
  ctx.bezierCurveTo(-p.r * .8, p.r * .6, -p.r * .9, -p.r * .6, 0, -p.r);
  ctx.fill();
  ctx.fillStyle = 'rgba(176,100,60,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, p.r * .18, p.r * .6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// =====================================================================
// free spins: THE GUARDIANS AWAKEN
// =====================================================================
function buildFsIntro(stage) {
  const o = U.fsi = el('div', 'overlay', stage, { id: 'fsIntro' });
  img(A.intro, 'bgimg', o);
  // (no sprite vajra here: the intro art already has the carved vajra at the top)
  U.fsiBolts = el('div', 'layer noptr', o);
  U.fsiFlash = el('div', 'layer noptr', o, { id: 'fsFlash' });
  U.fsiNum = el('div', 'ctr goldtext', o, { id: 'fsNum' });
  U.fsiPlaque = img(A.plaqueFs, 'ctr', o, { id: 'fsPlaque' });
  U.fsiTap = el('div', 'ctr hint pulseText', o, { id: 'fsTap', text: 'TAP TO BEGIN' });
}
function buildFsEnd(stage) {
  const o = U.fse = el('div', 'overlay', stage, { id: 'fsEnd' });
  U.fseParticles = el('canvas', 'pcanvas', o, { width: 1376, height: 768 });
  img(A.vajra, 'ctr spinc vajra', o, { id: 'feVajra', style: { '--dur': '2.2s' } });
  U.fsePlaque = img(A.plaqueFs, 'ctr', o, { id: 'fePlaque' });
  el('div', 'ctr', o, { id: 'feLabel', text: 'TOTAL WIN' });
  U.fseAmount = el('div', 'ctr goldtext', o, { id: 'feAmount' });
  el('div', 'ctr hint pulseText', o, { id: 'feTap', text: 'TAP TO CONTINUE' });
}

function waitOverlay(o, name, autoMs) {
  return new Promise(res => {
    let done = false, t = 0;
    const finish = () => { if (done) return; done = true; clearTimeout(t); S.overlayAction = null; o.onclick = null; res(); };
    S.overlay = name;
    S.overlayAction = finish;
    o.onclick = finish;
    if (autoMs) t = setTimeout(finish, autoMs);
  });
}

// ---- intro storm: carved gold bolts strike down beside the carved vajra, each with a sky flash
const VAJRA_X = 1359; // carved vajra centre on freespins_intro_16x9
function stormStrike(big, forceSide) {
  const side = forceSide || (Math.random() < .5 ? -1 : 1);
  // open sky = the gaps between the carved centre bolts and each guardian's flame halo
  const x = VAJRA_X + side * (250 + Math.random() * 220);
  const rot = side * (3 + Math.random() * 8);               // lean slightly inward, framing the count
  const h = (big ? 1000 : 720) + Math.random() * 200;
  SFX.stormStrike(big, side);
  const b = img(A.bolt(1 + rnd(4)), 'bolt', U.fsiBolts, { style: { left: px(x), top: '-60px', height: px(h), transformOrigin: '50% 0' } });
  const tf = sy => `translateX(-50%) rotate(${rot.toFixed(1)}deg) scaleY(${sy})`;
  b.animate([
    { opacity: 0, transform: tf(.04) },
    { opacity: 1, transform: tf(1), offset: .14 },             // snap down
    { opacity: .3, transform: tf(1), offset: .24 },            // flicker
    { opacity: 1, transform: tf(1), offset: .34 },
    { opacity: 1, transform: tf(1), offset: .5 },
    { opacity: 0, transform: tf(1) },
  ], { duration: big ? 820 : 640, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
  const f = el('div', 'layer noptr fsFlashBurst', U.fsiFlash, {
    style: { background: `radial-gradient(circle at ${x.toFixed(0)}px 300px, rgba(255,248,222,.95), rgba(246,220,138,.4) 22%, rgba(212,166,60,0) 52%)` },
  });
  f.animate([{ opacity: 0 }, { opacity: big ? .9 : .6, offset: .12 }, { opacity: .15, offset: .3 }, { opacity: big ? .6 : .35, offset: .4 }, { opacity: 0 }],
    { duration: big ? 700 : 520, easing: 'ease-out', fill: 'forwards' }).onfinish = () => f.remove();
}
function startStorm() {
  let on = true;
  const tick = () => {
    if (!on) return;
    stormStrike(false);
    if (Math.random() < .35) setTimeout(() => on && stormStrike(false), 120 + Math.random() * 120); // occasional double
    setTimeout(tick, 650 + Math.random() * 1000);
  };
  setTimeout(tick, 350);
  return () => { on = false; };
}

async function freeSpins(n) {
  // 1 · intro screen
  U.fsiNum.textContent = '0';
  U.fsiPlaque.classList.remove('punch'); U.fsiPlaque.style.opacity = 0;
  U.fsiTap.style.visibility = 'hidden';
  U.fsi.classList.add('show');
  S.overlay = 'fsintro'; S.overlayAction = null;
  SFX.ambient('storm');
  const stopStorm = startStorm();
  await sleep(800);
  void U.fsiPlaque.offsetWidth; U.fsiPlaque.style.opacity = ''; U.fsiPlaque.classList.add('punch'); SFX.fsPlaque();
  stormStrike(true, -1); setTimeout(() => stormStrike(true, 1), 90);   // twin strike as the plaque lands
  await sleep(450);
  await tween(1100, k => { const v = String(Math.round(n * k)); if (v !== U.fsiNum.textContent) { U.fsiNum.textContent = v; SFX.tick(+v); } }, t => t);
  U.fsiNum.animate([{ transform: 'translate(-50%,-50%) scale(1.25)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.4,1)' });
  U.fsiTap.style.visibility = '';
  await waitOverlay(U.fsi, 'fsintro', S.auto ? 3500 : 0);
  stopStorm();
  U.fsi.classList.remove('show');
  S.overlay = null;

  // 2 · storm stage
  U.game.classList.add('fs');
  S.fs = { total: n, played: 0, win: 0 };
  setControls(); updateFsHud();
  await sleep(1300);
  while (S.fs.played < S.fs.total) {
    S.fs.played++; updateFsHud();
    await playSpin(true);
    await sleep(800);
  }
  await sleep(600);
  stopCycle(); hideWinPanel(); clearWilds();

  // 3 · total win
  const total = S.fs.win;
  U.fseAmount.textContent = fmt(0);
  U.fse.classList.add('show'); SFX.fsEnd();
  U.fsePlaque.classList.remove('punch'); void U.fsePlaque.offsetWidth; U.fsePlaque.classList.add('punch');
  P.rate = 1.6; startParticles(U.fseParticles);
  tween(Math.min(3500, 900 + total / bet() * 30), k => { U.fseAmount.textContent = fmt(total * k); });
  await waitOverlay(U.fse, 'fsend', S.auto ? 4500 : 9000);
  stopParticles(); SFX.coinRain(0);
  U.fse.classList.remove('show');
  S.overlay = null;
  U.game.classList.remove('fs'); SFX.ambient('base');
  S.fs = null; setControls();
  await sleep(900);
}

function updateFsHud() {
  if (!S.fs) return;
  U.fsLeft.val.textContent = `${S.fs.played} / ${S.fs.total}`;
  U.fsWin.val.textContent = fmt(S.fs.win);
}

// =====================================================================
// paytable (menu)
// =====================================================================
function buildPaytable(stage) {
  const o = U.pay = el('div', 'overlay', stage, { id: 'pay' });
  const sh = el('div', 'ctr', o, { id: 'paySheet' });
  el('h2', 'goldtext', sh, { text: 'PAYTABLE' });
  U.payGrid = el('div', '', sh, { id: 'payGrid' });
  el('div', '', sh, { id: 'payRules', html: `
    <div class="rule"><h3>LOTUS WILD</h3>Lands on reels 2, 3 and 4 and substitutes for every symbol except the Temple Bell.</div>
    <div class="rule"><h3>THE GUARDIANS AWAKEN</h3>3, 4 or 5 Temple Bells anywhere award 8, 12 or 15 free spins. In free spins every Agyō or Ungyō that lands expands into a full-reel guardian wild. Both on one spin: all wins ×3.</div>
    <div class="rule"><h3>20 PAYLINES</h3>Wins pay left to right on 20 fixed lines, highest win per line. Line wins are shown at the current bet. Scatter wins multiply the total bet.</div>` });
  el('div', '', sh, { id: 'payFoot', text: 'DEMO PREVIEW · NO REAL MONEY' });
  const x = el('div', '', sh, { id: 'payClose', text: '×', role: 'button', 'aria-label': 'Close' });
  x.onclick = closePaytable;
  o.onclick = e => { if (e.target === o) closePaytable(); };
}
function fillPaytable() {
  if (!U.payGrid) return;
  const b = bet(), lb = b / 20;
  const order = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'L1', 'L2', 'L3', 'L4', 'WILD', 'SC'];
  U.payGrid.innerHTML = '';
  for (const id of order) {
    const it = el('div', 'pitem', U.payGrid);
    it.appendChild(coinEl(id));
    el('div', 'nm', it, { text: SYMNAME[id].toUpperCase() });
    let html;
    if (id === 'WILD') html = 'Substitutes<br>reels 2 – 4';
    else if (id === 'SC') html = [5, 4, 3].map(n => `<b>${n}×</b>${fmt(Engine.SCATTER_PAY[n - 3] * b)}`).join('<br>');
    else html = [5, 4, 3].map(n => `<b>${n}×</b>${fmt(Engine.PAYS[id][n - 3] * lb)}`).join('<br>');
    el('div', 'py', it, { html });
  }
}
function openPaytable() {
  if (S.overlay || S.busy) return;
  fillPaytable();
  U.pay.classList.add('show');
  S.overlay = 'menu'; S.overlayAction = closePaytable;
}
function closePaytable() { U.pay.classList.remove('show'); S.overlay = null; S.overlayAction = null; }

// =====================================================================
// splash + preload
// =====================================================================
// =====================================================================
// preloader — full-window layer (outside the 16:9 stage). Landscape uses the
// key art (game_bg = flaq_keyart_metal_v01), portrait uses splash_9x16.
// Letterbox areas are filled with a blurred copy of the same art.
// =====================================================================
const SPLASH_PORTRAIT = 'art/screens/splash_9x16.webp';
const PRE = {
  land: { w: 2752, h: 1536, art: A.bg, logo: [1376, 1000, 900], plate: [1376, 1335, 660], sun: [1376, 255, 1100], demo: 1478 },
  port: { w: 1536, h: 2752, art: SPLASH_PORTRAIT, logo: [768, 1430, 900], plate: [768, 1850, 660], sun: [768, 190, 900], demo: 2668 },
};
const preMode = () => (innerWidth / innerHeight < 0.8 ? 'port' : 'land');

function buildPreloader() {
  const o = U.pre = el('div', '', document.body, { id: 'pre' });
  U.preFill = el('div', '', o, { id: 'preFill' });
  const box = U.preBox = el('div', '', o, { id: 'preBox' });
  U.preArt = img(A.bg, '', box, { id: 'preArt' });
  U.preSun = el('div', 'ctr', box, { id: 'preSun' });
  el('div', '', box, { id: 'preVignette' });
  U.prePetals = el('canvas', '', box, { id: 'prePetals', width: 688, height: 768 });
  U.preGlow = el('div', 'ctr logoGlow', box, { id: 'preGlow' });   // pulsing light behind the logo
  U.preLogo = el('div', 'ctr', box, { id: 'preLogo' });
  U.preLogoImg = img(A.logo, '', U.preLogo);
  U.preShine = el('canvas', '', U.preLogo, { width: 1120, height: 535 });
  letterShine(U.preLogo, 'lsPre');
  const pl = U.prePlate = el('div', 'ctr', box, { id: 'prePlate' });
  img(A.pSpare, '', pl);
  U.preTomoeL = img(A.tomoe, 'ctr preTomoe', pl, { style: { left: '0%' } });
  U.preTomoeR = img(A.tomoe, 'ctr preTomoe', pl, { style: { left: '100%' } });
  const inner = el('div', 'preInner', pl);
  U.prePct = el('div', 'prePct', inner, { text: 'LOADING' });
  const track = el('div', 'preTrack', inner);
  U.preBar = el('div', 'preBar', track);
  U.preTap = el('div', 'preTap ivory', pl, { text: 'TAP TO START' });
  U.preDemo = el('div', 'ctr', box, { id: 'preDemo', text: 'DEMO PREVIEW · NO REAL MONEY' });
  S.preMode = null;
  layoutPreloader();
  // reveal art / logo the moment their own bitmaps arrive
  const showArt = () => o.classList.add('art');
  U.preArt.complete && U.preArt.naturalWidth ? showArt() : U.preArt.addEventListener('load', showArt);
  const showLogo = () => o.classList.add('logo');
  U.preLogoImg.complete && U.preLogoImg.naturalWidth ? showLogo() : U.preLogoImg.addEventListener('load', showLogo);
}

function layoutPreloader() {
  if (!U.pre) return;
  const m = preMode(), P_ = PRE[m];
  if (m !== S.preMode) {
    S.preMode = m;
    U.preArt.src = P_.art;
    U.preFill.style.backgroundImage = `url("${P_.art}")`;
    Object.assign(U.preBox.style, { width: px(P_.w), height: px(P_.h) });
    Object.assign(U.preArt.style, { width: px(P_.w), height: px(P_.h) });
    centre(U.preLogo, P_.logo[0], P_.logo[1], P_.logo[2]);
    centre(U.preGlow, P_.logo[0], P_.logo[1], P_.logo[2] * 1.5, P_.logo[2] * .85);
    centre(U.prePlate, P_.plate[0], P_.plate[1], P_.plate[2]);
    centre(U.preSun, P_.sun[0], P_.sun[1], P_.sun[2], P_.sun[2] * .7);
    Object.assign(U.preDemo.style, { left: px(P_.w / 2), top: px(P_.demo) });
    Object.assign(U.prePetals.style, { width: px(P_.w), height: px(P_.h) });
    U.prePetals.width = Math.round(P_.w / 2); U.prePetals.height = Math.round(P_.h / 2);
  }
  const s = Math.min(innerWidth / P_.w, innerHeight / P_.h);
  U.preBox.style.transform = `translate(${(innerWidth - P_.w * s) / 2}px,${(innerHeight - P_.h * s) / 2}px) scale(${s})`;
}

function setProgress(p) {
  U.preBar.style.width = (p * 100).toFixed(1) + '%';
  U.prePct.textContent = `LOADING · ${Math.round(p * 100)}%`;
}

// tomoe clasps + petals; tomoe speed eases (no CSS duration swaps → no angle jumps)
function preTick(now) {
  if (!S.preOn) return;
  const dt = Math.min(50, now - (S.preLast || now)); S.preLast = now;
  S.preSpeed += (S.preTarget - S.preSpeed) * .04;
  S.preAngle = (S.preAngle + S.preSpeed * dt) % 360;
  U.preTomoeL.style.transform = `translate(-50%,-50%) rotate(${S.preAngle.toFixed(2)}deg)`;
  U.preTomoeR.style.transform = `translate(-50%,-50%) rotate(${(-S.preAngle).toFixed(2)}deg)`;
  const cv = U.prePetals, ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (const p of S.prePetalList) {
    drawPetal(ctx, p, dt / 16.7 * .5);
    if (p.y > cv.height + 20 || p.x > cv.width + 30) { resetPetal(p, false); p.x = Math.random() * cv.width * .6 - 30; }
  }
  requestAnimationFrame(preTick);
}

function startPreTick() {
  Object.assign(S, { preOn: true, preAngle: 0, preSpeed: 0, preTarget: .14, preLast: 0 });
  S.prePetalList = Array.from({ length: 12 }, () => { const p = {}; resetPetal(p, true); p.x *= .5; return p; });
  requestAnimationFrame(preTick);
}

function shineOn(canvas, image, dur = 1400) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, t0 = performance.now();
  const step = now => {
    const u = Math.min(1, (now - t0) / dur);
    const x = -w * .4 + u * w * 1.8;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(x - 160, 0, x + 40, h);
    g.addColorStop(0, 'rgba(255,240,190,0)'); g.addColorStop(.5, 'rgba(255,244,205,.75)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(image, 0, 0, w, h);
    if (u < 1) requestAnimationFrame(step);
    else { ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h); }
  };
  requestAnimationFrame(step);
}

// reels drop into the plate one column at a time after the preloader opens
function reelDropIn() {
  reels.forEach((R, c) => {
    R.col.classList.add('clip');
    R.strip.animate([
      { transform: 'translate3d(0,-840px,0)', easing: 'cubic-bezier(.55,0,.85,.5)' },
      { transform: 'translate3d(0,24px,0)', offset: .78, easing: 'cubic-bezier(.2,.6,.35,1)' },
      { transform: 'translate3d(0,0,0)' },
    ], { duration: 820, delay: 350 + c * 130, fill: 'backwards' }).onfinish = () => {
      R.col.classList.remove('clip');
      R.cells.forEach(d => { d.classList.add('thud'); setTimeout(() => d.classList.remove('thud'), 400); });
      SFX.reelStop(c, true);
    };
  });
}

function allAssets() {
  const list = [A.tomoe, A.pSpare, PRE[preMode()].art, A.logo, A.bg, A.bgfs, A.intro, A.frame, A.spinBase, A.spinRotor, A.auto, A.plus, A.minus, A.menu, A.pBal, A.pBet, A.pWin, A.vajra, A.plaqueFs];
  Object.keys(SYMFILE).forEach(k => list.push(symSrc(k)));
  for (let i = 1; i <= 4; i++) list.push(A.bolt(i), A.flame(i));
  ['big', 'mega', 'epic'].forEach(t => list.push(A.dragon(t), A.plaque(t)));
  list.push(A.wild('H1'), A.wild('H2'));
  return list;
}
async function preload() {
  const list = allAssets();
  let done = 0;
  const missing = [];
  const one = src => new Promise(res => {
    const i = new Image();
    IMG[src] = i;
    i.onload = () => { (i.decode ? i.decode() : Promise.resolve()).catch(() => {}).then(res); };
    i.onerror = () => { missing.push(src); res(); };
    i.src = src;
  }).then(() => {
    done++;
    setProgress(done / list.length);
  });
  // plate + tomoe first, then key art + logo, then everything else in parallel
  await Promise.all(list.slice(0, 2).map(one));
  U.pre.classList.add('plate');
  await Promise.all(list.slice(2, 4).map(one));
  await Promise.all(list.slice(4).map(one));
  if (missing.length) console.warn('KONGŌ GATE: missing assets', missing);
}

// =====================================================================
// idle polish: logo shine, sakura petals, spin-button rotation
// =====================================================================
const petals = [];
function ambientTick(now) {
  // spin button: rotate while spinning, then ease to the nearest 120° (tomoe is 3-fold symmetric)
  const dt = Math.min(50, now - (S.lastAmb || now)); S.lastAmb = now;
  if (S.btnSpin) { S.btnSpeed += (0.95 - S.btnSpeed) * .12; S.btnAngle += S.btnSpeed * dt; }
  else {
    S.btnSpeed *= .93;
    const target = Math.ceil(S.btnAngle / 120) * 120;
    S.btnAngle += Math.max(S.btnSpeed * dt * .5, (target - S.btnAngle) * .08);
    if (target - S.btnAngle < .05) S.btnAngle = target % 360;
  }
  U.spinImg.style.transform = `rotate(${S.btnAngle.toFixed(2)}deg)`;

  // big-win vajra: speed eases toward the tier's target, so tier changes never jump the angle
  if (S.overlay === 'bigwin' || S.vajraSpeed > .001) {
    S.vajraSpeed += ((S.overlay === 'bigwin' ? S.vajraTarget : 0) - S.vajraSpeed) * .03;
    S.vajraAngle = (S.vajraAngle + S.vajraSpeed * dt) % 360;
    U.bwVajra.style.transform = `translate(-50%,-50%) rotate(${S.vajraAngle.toFixed(2)}deg)`;
  }

  // petals
  const ctx = U.petals.getContext('2d');
  ctx.clearRect(0, 0, 1376, 768);
  const k = dt / 16.7;
  for (const p of petals) {
    drawPetal(ctx, p, k * .55);
    if (p.y > 790 || p.x > 1410) resetPetal(p, false);
  }
  requestAnimationFrame(ambientTick);
}
function resetPetal(p, anywhere) {
  Object.assign(p, {
    x: anywhere ? Math.random() * 1376 : -30 + Math.random() * 700, y: anywhere ? Math.random() * 768 : -20,
    vx: .5 + Math.random() * .9, vy: .5 + Math.random() * .7, r: 5 + Math.random() * 5,
    a: Math.random() * 6, va: (Math.random() - .5) * .05, ph: Math.random() * 6, alpha: .55 + Math.random() * .35,
  });
}

// subtle gold glint that travels across the logo LETTERS only. The letters are found live with an
// SVG colour-matrix mask (gold = red well above blue; the navy plaque drops out), clipped to the
// lettering box, so it works on file:// too and the art is untouched.
function letterShine(parent, id) {
  const W = 2399, H = 1145;                      // logo_kongo_gate size
  const box = { x: 320, y: 555, w: 1750, h: 260 };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'letterShine');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>
    <filter id="${id}F" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.2 0 -3.2 0 -.45"/>
    </filter>
    <clipPath id="${id}C"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>
    <mask id="${id}M" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <image href="${A.logo}" width="${W}" height="${H}" filter="url(#${id}F)" clip-path="url(#${id}C)"/>
    </mask>
    <linearGradient id="${id}G" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFF3CC" stop-opacity="0"/>
      <stop offset=".5" stop-color="#FFF6D8" stop-opacity=".55"/>
      <stop offset="1" stop-color="#FFF3CC" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g mask="url(#${id}M)"><rect class="sweep" x="-520" y="0" width="360" height="${H}" fill="url(#${id}G)" transform="skewX(-18)"/></g>`;
  parent.appendChild(svg);
  return svg;
}

function logoShine() { shineOn(U.shine, U.logoImg); }

// =====================================================================
// sound: everything synthesised live with Web Audio — no audio files, nothing to license.
// Palette from the lore: bronze temple bell (bonshō) + small rin bells, taiko, wooden clappers,
// thunder for the vajra, wind around the gate (rain + storm in free spins), koto plucks in the
// Japanese "in" scale for wins. Agyō roars an open "A", Ungyō hums a closed "Un".
// =====================================================================
const SFX = (() => {
  let ctx = null, out, sfx, amb, verb, noiseBuf, on = true;
  let ambMode = null, ambNodes = [], ambTimer = 0, rainT = 0;
  try { on = localStorage.getItem('kg_sound') !== 'off'; } catch (e) { /* storage blocked: default on */ }
  const IN = [293.66, 311.13, 392, 440, 466.16];                 // D in-scale: D Eb G A Bb
  const scale = i => IN[((i % 5) + 5) % 5] * Math.pow(2, Math.floor(i / 5));
  const VOL = .8;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = .003; comp.release.value = .3;
    out = ctx.createGain(); out.gain.value = on ? VOL : 0;
    out.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(out);
    amb = ctx.createGain(); amb.gain.value = .6; amb.connect(out);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.8);        // stone-and-timber temple hall
    const vg = ctx.createGain(); vg.gain.value = .55; verb.connect(vg); vg.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
  }
  function impulse(sec) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * .3; d[i] = lp * Math.pow(1 - i / n, 2.8); }
    }
    return b;
  }
  const live = () => !!ctx && on;
  const now = () => ctx.currentTime;

  // voice bus: gain -> (pan) -> dest, plus a reverb send
  function bus(pan = 0, wet = .25, dest = sfx) {
    const g = ctx.createGain(); let node = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(dest);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verb); }
    return g;
  }
  function env(param, t, a, peak, d) {
    param.setValueAtTime(.0001, t);
    param.linearRampToValueAtTime(Math.max(.0002, peak), t + a);
    param.exponentialRampToValueAtTime(.0001, t + a + d);
  }
  function tone(type, f, t, a, peak, d, dest, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    env(g.gain, t, a, peak, d); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + d + .05);
    return o;
  }
  function noise(t, dur, dest, type = 'bandpass', f = 1000, Q = 1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5);
    if (dur) s.stop(t + dur + .05);
    return { s, fl, g };
  }

  // ---- instruments ---------------------------------------------------------------------
  // bronze bell: hum, prime, tierce, quint, nominal + upper partials; each a detuned pair -> slow beating
  const BONSHO = [[.5, 1, 1], [1, .6, .8], [1.19, .3, .6], [1.5, .2, .5], [2, .32, .45], [2.74, .14, .3], [3.76, .08, .2], [5.4, .05, .12]];
  const RIN = [[1, 1, 1], [2.76, .45, .55], [5.4, .22, .3], [8.93, .1, .15]];
  function bell(f0, { t = now(), vel = 1, len = 8, pan = 0, wet = .45, partials = BONSHO } = {}) {
    const v = bus(pan, wet);
    partials.forEach(([r, a, l], i) => {
      for (const s of [-1, 1]) tone('sine', f0 * r, t, .005, a * vel * .2, len * l, v, s * (3 + i * 1.5));
    });
    const n = noise(t, .3, v, 'lowpass', partials === RIN ? 2500 : 420, .7);   // wooden beam / striker
    env(n.g.gain, t, .004, (partials === RIN ? .12 : .55) * vel, .16);
  }
  function rin(f, o = {}) { bell(f, { len: 3.2, wet: .4, partials: RIN, ...o }); }
  function taiko(t = now(), { f = 62, vel = 1, pan = 0, wet = .3 } = {}) {
    const v = bus(pan, wet);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.9, t); o.frequency.exponentialRampToValueAtTime(f, t + .09);
    env(g.gain, t, .003, .95 * vel, .6); o.connect(g); g.connect(v); o.start(t); o.stop(t + .75);
    tone('sine', f * 2.31, t, .002, .16 * vel, .16, v);
    const n = noise(t, .12, v, 'lowpass', 1300, .8); env(n.g.gain, t, .002, .5 * vel, .07);   // skin slap
  }
  // hyoshigi-style wooden knock (UI)
  function knock(t = now(), { f = 1800, vel = .5, pan = 0, twice = false } = {}) {
    const v = bus(pan, .15);
    for (const dt of twice ? [0, .06] : [0]) {
      const n = noise(t + dt, .06, v, 'bandpass', f, 8); env(n.g.gain, t + dt, .001, vel * 2.4 * (dt ? .6 : 1), .045);
      tone('sine', f * .55, t + dt, .001, vel * .22, .05, v);
    }
  }
  function coin(t = now(), { vel = .3, pan = (Math.random() - .5) * .9, f = 2500 + Math.random() * 1500 } = {}) {
    const v = bus(pan, .2);
    [[1, 1, .16], [1.47, .5, .11], [2.09, .35, .07], [2.89, .2, .05]].forEach(([r, a, d]) =>
      tone('sine', f * r, t, .001, a * vel * .22, d * (.8 + Math.random() * .6), v));
  }
  function koto(f, t = now(), { vel = .5, pan = 0 } = {}) {
    const v = bus(pan, .35);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.5;
    fl.frequency.setValueAtTime(f * 10, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + .4); fl.connect(v);
    tone('sawtooth', f, t, .002, vel * .2, 1.8, fl);
    tone('triangle', f * 2, t, .002, vel * .1, 1, fl, 4);
    const n = noise(t, .03, v, 'highpass', 3200, .7); env(n.g.gain, t, .001, vel * .25, .02);  // plectrum
  }
  function thunder({ t = now(), big = false, pan = 0, dist = 0 } = {}) {
    const v = bus(pan, .35 + dist * .4);
    const near = 1 - dist * .7;
    if (dist < .5) {                                       // the clap: a deep boom, no hiss
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(big ? 95 : 110, t); o.frequency.exponentialRampToValueAtTime(34, t + .6);
      env(og.gain, t, .01, (big ? 1 : .7) * near, .9); o.connect(og); og.connect(v); o.start(t); o.stop(t + 1);
      const n = noise(t, .6, v, 'lowpass', 520, .7); env(n.g.gain, t, .008, (big ? 1.3 : .9) * near, .35);
    }
    const len = big ? 3.4 : 2.4;                           // the rumble rolling away
    const r = noise(t, len + 1.2, v, 'lowpass', 220, .7);
    r.fl.frequency.setValueAtTime(big ? 240 : 190, t); r.fl.frequency.exponentialRampToValueAtTime(55, t + len);
    const g = r.g.gain; let tt = t + .03 + dist * .5;
    g.setValueAtTime(.0001, t); g.exponentialRampToValueAtTime((big ? 1.5 : 1) * near, tt);
    for (let i = 0; i < 4; i++) {
      tt += len / 6 * (.6 + Math.random() * .8);
      g.exponentialRampToValueAtTime((big ? 1.1 : .75) * (.3 + Math.random() * .7) * near * (1 - i * .18), tt);
    }
    g.exponentialRampToValueAtTime(.0001, t + len + 1.1);
  }
  // rising rush for upgrades / awakenings
  function swell(t, dur, f0, f1, vel = .4, pan = 0) {
    const n = noise(t, dur + .3, bus(pan, .4), 'bandpass', f0, 2.5);
    n.fl.frequency.setValueAtTime(f0, t); n.fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.g.gain.setValueAtTime(.0001, t); n.g.gain.exponentialRampToValueAtTime(vel, t + dur * .85); n.g.gain.exponentialRampToValueAtTime(.0001, t + dur + .25);
  }
  function arp(steps, t, vel = .45, gap = .085) { steps.forEach((s, i) => koto(scale(s), t + i * gap, { vel, pan: (i / Math.max(1, steps.length - 1) - .5) * .6 })); }

  // ---- ambience --------------------------------------------------------------------------
  function ambient(mode) {
    if (!ctx || mode === ambMode) return;
    ambMode = mode;
    const t = now();
    ambNodes.forEach(n => { n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(0, t, .9); n.s.stop(t + 5); n.lfo && n.lfo.stop(t + 5); });
    ambNodes = []; clearTimeout(ambTimer);
    if (!mode) return;
    const add = (type, f, Q, level, lfoHz, depth) => {
      const n = noise(t, 0, amb, type, f, Q);
      n.g.gain.setValueAtTime(0, t); n.g.gain.setTargetAtTime(level, t, 1.6);
      if (lfoHz) {
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.frequency.value = lfoHz; lg.gain.value = depth; l.connect(lg); lg.connect(n.fl.frequency); l.start(t); n.lfo = l;
      }
      ambNodes.push(n);
    };
    if (mode === 'base') {
      const distantBell = () => { if (ambMode !== 'base') return; if (live()) bell(98, { vel: .22, len: 7, wet: .95, pan: -.35 }); ambTimer = setTimeout(distantBell, 32000 + Math.random() * 26000); };
      ambTimer = setTimeout(distantBell, 9000);
    } else {                                              // storm: distant thunder rolls
      const roll = () => { if (ambMode !== 'storm') return; if (live()) thunder({ dist: .75 + Math.random() * .2, pan: Math.random() * 1.6 - .8 }); ambTimer = setTimeout(roll, 5500 + Math.random() * 8000); };
      ambTimer = setTimeout(roll, 2500);
    }
  }

  // ---- game events -------------------------------------------------------------------
  let rainOn = 0;
  const api = {
    get on() { return on; },
    unlock() { init(); },
    toggle() {
      on = !on;
      try { localStorage.setItem('kg_sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (!ctx && on) init();
      if (ctx) out.gain.setTargetAtTime(on ? VOL : 0, now(), .06);
      if (!on) api.coinRain(0);
      return on;
    },
    ambient,
    click(pitch = 0) { if (live()) knock(now(), { f: 1700 * Math.pow(1.12, pitch), vel: .45 }); },
    gateOpen() {
      if (!live()) return; const t = now();
      bell(110, { t, vel: 1.1, len: 9, wet: .55 });
      taiko(t + .02, { f: 52, vel: 1 }); taiko(t + .62, { f: 58, vel: .55 });
    },
    spinStart() {
      if (!live()) return; const t = now();
      knock(t, { f: 1500, vel: .35 });
      swell(t + .02, .32, 260, 900, .22);
      const o = ctx.createOscillator(), g = ctx.createGain(), v = bus(0, .1);
      o.frequency.setValueAtTime(42, t); o.frequency.exponentialRampToValueAtTime(70, t + .3);
      env(g.gain, t, .08, .35, .5); o.connect(g); g.connect(v); o.start(t); o.stop(t + .7);
    },
    reelStop(c, soft) {
      if (!live()) return; const t = now(), pan = (c - 2) * .3;
      taiko(t, { f: 56 + c * 3, vel: soft ? .5 : .75, pan, wet: .18 });
      const v = bus(pan, .15);                                   // heavy coin seating in the plate
      tone('sine', 410 * (1 + c * .05), t, .001, .1, .14, v); tone('sine', 1130 * (1 + c * .05), t, .001, .05, .07, v);
    },
    scatter(n, c) { if (live()) rin(scale(8 + n * 2), { vel: .75, pan: (c - 2) * .3 }); },
    antic(sec, c) {
      if (!live()) return;
      const t = now(), dur = Math.max(.4, sec);
      let tt = t, k = 0;
      while (tt < t + dur) {                                     // taiko roll, accelerating + crescendo
        const u = (tt - t) / dur;
        taiko(tt, { f: 66 + (k % 2) * 6, vel: .18 + u * .45, pan: (c - 2) * .3 + (k % 2 ? .1 : -.1), wet: .12 });
        tt += .13 - u * .085; k++;
      }
      swell(t, dur, 300, 2400, .18, (c - 2) * .3);
    },
    templeBell() {                                                // 3+ scatters: the guardians are rung awake
      if (!live()) return; const t = now();
      bell(110, { t, vel: 1.2, len: 10, wet: .6 });
      taiko(t, { f: 50, vel: .9 });
      [0, 1, 2].forEach(k => rin(scale(10 + k), { t: t + .28 * (k + 1), vel: .4, pan: (k - 1) * .5 }));
    },
    win(x) {
      if (!live()) return; const t = now();
      const n = x >= 5 ? 5 : x >= 2 ? 4 : 3;
      arp([5, 6, 7, 8, 9].slice(0, n), t, .4);
      for (let i = 0; i < n + 1; i++) coin(t + .05 + i * .07, { vel: .22 });
    },
    line(i) {
      if (!live()) return; const t = now();
      koto(scale(5 + (i % 7)), t, { vel: .28 });
    },
    x3() {
      if (!live()) return; const t = now();
      taiko(t, { f: 54, vel: .9 }); taiko(t + .15, { f: 54, vel: .9 });
      bell(220, { t: t + .15, vel: .6, len: 4 });
    },
    strike(c) { if (live()) thunder({ big: true, pan: (c - 2) * .35 }); },
    guardian(sym, c) {
      if (!live()) return; const t = now(), pan = (c - 2) * .3;
      taiko(t, { f: 46, vel: 1, pan });
      swell(t, .6, 500, 1900, .3, pan);                            // flame halo flaring
      const v = bus(pan, .45), o = ctx.createOscillator(); o.type = 'sawtooth';
      if (sym === 'H1') {                                          // Agyō: open mouth, the sound "A"
        o.frequency.setValueAtTime(62, t); o.frequency.linearRampToValueAtTime(70, t + .3); o.frequency.linearRampToValueAtTime(58, t + 1.3);
        const g = ctx.createGain(); env(g.gain, t, .22, .5, 1.2); g.connect(v);
        for (const [f, q, a] of [[720, 5, 1], [1150, 6, .7], [2500, 8, .25]]) {
          const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
          const bg = ctx.createGain(); bg.gain.value = a * 2.2; o.connect(b); b.connect(bg); bg.connect(g);
        }
        const br = noise(t, 1.5, v, 'bandpass', 900, 1.5); env(br.g.gain, t, .2, .22, 1);   // breath
      } else {                                                     // Ungyō: closed mouth, the sound "Un"
        o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(52, t + 1.6);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
        const g = ctx.createGain(); env(g.gain, t, .3, .75, 1.5); o.connect(lp); lp.connect(g); g.connect(v);
        tone('sine', 110, t, .3, .2, 1.4, v);
      }
      o.start(t); o.stop(t + 1.9);
    },
    bigStart() {
      if (!live()) return; const t = now();
      bell(110, { t, vel: 1, len: 8 });
      [0, .2, .4].forEach((d, i) => taiko(t + d, { f: 50 + i * 4, vel: .85 }));
      api.coinRain(1);
    },
    tierUp(tier) {
      if (!live()) return; const t = now();
      const f = tier === 'epic' ? 196 : 146.83;
      swell(t - .02, .5, 400, 3500, .3);
      taiko(t, { f: 48, vel: 1 }); taiko(t + .14, { f: 52, vel: .8 });
      bell(f, { t: t + .05, vel: .9, len: 7 });
      api.coinRain(tier === 'epic' ? 3 : 2);
    },
    bigEnd() {
      if (!live()) return; const t = now();
      arp([5, 6, 7, 8, 9, 10], t, .45, .07);
      rin(scale(10), { t: t + .45, vel: .5 });
    },
    coinRain(rate) {
      clearInterval(rainT); rainOn = rate;
      if (!rate || !live()) return;
      rainT = setInterval(() => { if (!live() || document.hidden) return; if (Math.random() < rainOn * .32) coin(now(), { vel: .08 + Math.random() * .14 }); }, 55);
    },
    tick(k) { if (live()) coin(now(), { vel: .16, f: 2000 * Math.pow(1.03, k), pan: 0 }); },
    fsPlaque() {
      if (!live()) return; const t = now();
      bell(110, { t, vel: 1.1, len: 9, wet: .6 });
      taiko(t, { f: 46, vel: 1 }); taiko(t + .22, { f: 52, vel: .7 });
    },
    stormStrike(big, side) { if (live()) thunder({ big, pan: side * (.3 + Math.random() * .3), dist: big ? 0 : .2 + Math.random() * .25 }); },
    fsEnd() {
      if (!live()) return; const t = now();
      bell(146.83, { t, vel: 1, len: 8 });
      arp([5, 7, 8, 9, 10, 12], t + .3, .45, .09);
      api.coinRain(1.4);
    },
  };
  return api;
})();

// =====================================================================
// scale + input + boot
// =====================================================================
function fit() {
  const s = Math.min(innerWidth / L.W, innerHeight / L.H);
  U.stage.style.transform = `translate(${(innerWidth - L.W * s) / 2}px,${(innerHeight - L.H * s) / 2}px) scale(${s})`;
}

function onKey(e) {
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) onSpinPress(); return; }
  if (e.key === 'Escape' && S.overlay === 'menu') { closePaytable(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
  const dbg = { '1': 'big', '2': 'mega', '3': 'epic', '4': 'fs' }[e.key];
  if (dbg) { S.force = dbg; if (!S.busy && !S.overlay && !S.fs) baseSpin(); return; }
  if (e.key === '5') S.forceBoth = true;
}

async function boot() {
  build();
  fit();
  addEventListener('resize', () => { fit(); layoutPreloader(); });
  addEventListener('keydown', onKey);
  setControls();
  startPreTick();
  const t0 = performance.now();
  await preload();
  await sleep(Math.max(0, 1400 - (performance.now() - t0))); // let the screen breathe on fast local loads
  setProgress(1);
  await sleep(250);
  U.pre.classList.add('ready');
  S.preTarget = .9;                                   // tomoe clasps whirl, then settle
  setTimeout(() => { S.preTarget = .1; }, 700);
  await new Promise(res => {
    const go = () => { removeEventListener('keydown', key); res(); };
    const key = e => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); go(); } };
    U.pre.onclick = go;
    addEventListener('keydown', key);
  });
  SFX.unlock(); SFX.gateOpen(); setTimeout(() => SFX.ambient('base'), 900);
  U.pre.onclick = null;
  U.pre.classList.add('out');
  reelDropIn();
  setTimeout(() => { S.preOn = false; U.pre.remove(); U.pre = null; }, 1300);
  S.overlay = null;
  for (let i = 0; i < 9; i++) { const p = {}; resetPetal(p, true); petals.push(p); }
  requestAnimationFrame(ambientTick);
}
