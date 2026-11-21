// VELMARA — a travel poster for a place that isn't there.
//
// A deterministic, stdlib-only Node 22 program. It paints a 1024x1024
// flat-design travel poster — a lighthouse islet above a sea of clouds at
// golden hour, under an aurora ribbon — and writes it to entry.png.
//
// Usage:  node main.ts [output-dir]        (default: /output)
// The output is byte-identical on every run: fixed seed, no clock, no
// network, no randomness outside the seeded generator below.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Seeded randomness (mulberry32). Every value in the poster comes from this.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);

// ---------------------------------------------------------------------------
// Canvas: an RGBA buffer with alpha-blend drawing primitives.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const img = Buffer.alloc(W * H * 4);

function setPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H || a <= 0) return;
  const i = (yi * W + xi) * 4;
  if (a >= 1) {
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255;
    return;
  }
  const dr = img[i], dg = img[i + 1], db = img[i + 2];
  img[i] = Math.round(r * a + dr * (1 - a));
  img[i + 1] = Math.round(g * a + dg * (1 - a));
  img[i + 2] = Math.round(b * a + db * (1 - a));
  img[i + 3] = 255;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Vertical gradient over the whole canvas through colour stops.
function vgrad(stops: Array<{ y: number; c: RGB }>): void {
  for (let y = 0; y < H; y++) {
    let c: RGB = stops[0].c;
    for (let s = 0; s < stops.length - 1; s++) {
      const a = stops[s], b = stops[s + 1];
      if (y >= a.y && y <= b.y) {
        c = mix(a.c, b.c, (y - a.y) / Math.max(1, b.y - a.y));
        break;
      }
      if (y > b.y) c = b.c;
    }
    const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255;
    }
  }
}

function rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) setPx(x, y, c[0], c[1], c[2], a);
  }
}

// Soft radial glow: alpha falls off quadratically to zero at radius r.
function glow(cx: number, cy: number, r: number, c: RGB, peak: number): void {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const fall = (1 - d) * (1 - d);
      setPx(x, y, c[0], c[1], c[2], peak * fall);
    }
  }
}

// Hard disc with a 1px antialiased rim.
function disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
      if (d >= 1) continue;
      const aa = d <= 0 ? 1 : 1 - d;
      setPx(x, y, c[0], c[1], c[2], a * aa);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1.21) continue;
      const aa = d <= 1 ? 1 : 1 - (Math.sqrt(d) - 1) / 0.1;
      setPx(x, y, c[0], c[1], c[2], a * Math.max(0, Math.min(1, aa)));
    }
  }
}

// Scanline fill of a simple (non self-intersecting) polygon.
function poly(points: Array<[number, number]>, c: RGB, a = 1): void {
  let minY = H, maxY = 0;
  for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1p] = points[i];
      const [x2, y2p] = points[(i + 1) % points.length];
      if ((y1p <= y && y2p > y) || (y2p <= y && y1p > y)) {
        xs.push(x1 + ((y - y1p) / (y2p - y1p)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c[0], c[1], c[2], a);
    }
  }
}

// Thick line segment with round caps, antialiased at the edge.
function thickLine(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a = 1): void {
  const r = w / 2;
  const x0 = Math.max(0, Math.floor(Math.min(x1, x2) - r - 1));
  const x1b = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(y1, y2) - r - 1));
  const y1b = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r + 1));
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = y0; y <= y1b; y++) {
    for (let x = x0; x <= x1b; x++) {
      let t = len2 === 0 ? 0 : ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + t * dx, py = y1 + t * dy;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py) - r;
      if (d >= 1) continue;
      const aa = d <= 0 ? 1 : 1 - d;
      setPx(x, y, c[0], c[1], c[2], a * aa);
    }
  }
}

// A wavy ridge line: points across the width, y = base + layered sines.
function ridgePoints(base: number, amp1: number, amp2: number, f1: number, f2: number, ph: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let x = -8; x <= W + 8; x += 8) {
    const y = base
      + amp1 * Math.sin(x * f1 + ph)
      + amp2 * Math.sin(x * f2 + ph * 2.3);
    pts.push([x, y]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Vector lettering. Single-stroke geometric capitals on a 10 x 14 grid,
// drawn thick so the place name reads like hand-lettered poster type.
// Each glyph is a list of strokes; each stroke a list of [x, y] grid points.
// ---------------------------------------------------------------------------
type Stroke = Array<[number, number]>;
const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 14], [5, 0], [10, 14]], [[2.8, 8], [7.2, 8]]],
  B: [[[0, 0], [0, 14]], [[0, 0], [7, 0], [9, 2], [9, 5], [7, 7], [0, 7]], [[0, 7], [7, 7], [9, 9], [9, 12], [7, 14], [0, 14]]],
  C: [[[9, 2], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [9, 12]]],
  D: [[[0, 0], [0, 14]], [[0, 0], [6, 0], [9, 3], [9, 11], [6, 14], [0, 14]]],
  E: [[[0, 0], [0, 14]], [[0, 0], [9, 0]], [[0, 7], [7, 7]], [[0, 14], [9, 14]]],
  F: [[[0, 0], [0, 14]], [[0, 0], [9, 0]], [[0, 7], [7, 7]]],
  G: [[[9, 2], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [9, 12], [9, 8], [5, 8]]],
  H: [[[0, 0], [0, 14]], [[10, 0], [10, 14]], [[0, 7], [10, 7]]],
  I: [[[5, 0], [5, 14]], [[2, 0], [8, 0]], [[2, 14], [8, 14]]],
  J: [[[8, 0], [8, 11], [6, 14], [3, 14], [1, 12]]],
  K: [[[0, 0], [0, 14]], [[9, 0], [0, 7], [9, 14]]],
  L: [[[0, 0], [0, 14]], [[0, 14], [9, 14]]],
  M: [[[0, 14], [0, 0], [5, 9], [10, 0], [10, 14]]],
  N: [[[0, 14], [0, 0], [10, 14], [10, 0]]],
  O: [[[3, 0], [7, 0], [10, 3], [10, 11], [7, 14], [3, 14], [0, 11], [0, 3], [3, 0]]],
  P: [[[0, 0], [0, 14]], [[0, 0], [7, 0], [9, 2], [9, 5], [7, 7], [0, 7]]],
  Q: [[[3, 0], [7, 0], [10, 3], [10, 11], [7, 14], [3, 14], [0, 11], [0, 3], [3, 0]], [[6, 10], [10, 14]]],
  R: [[[0, 0], [0, 14]], [[0, 0], [7, 0], [9, 2], [9, 5], [7, 7], [0, 7]], [[6, 7], [10, 14]]],
  S: [[[9, 2], [7, 0], [3, 0], [1, 2], [1, 5], [4, 7], [9, 8], [10, 10], [10, 12], [7, 14], [3, 14], [0, 12]]],
  T: [[[0, 0], [10, 0]], [[5, 0], [5, 14]]],
  U: [[[0, 0], [0, 11], [3, 14], [7, 14], [10, 11], [10, 0]]],
  V: [[[0, 0], [5, 14], [10, 0]]],
  W: [[[0, 0], [2.5, 14], [5, 5], [7.5, 14], [10, 0]]],
  X: [[[0, 0], [10, 14]], [[10, 0], [0, 14]]],
  Y: [[[0, 0], [5, 7], [10, 0]], [[5, 7], [5, 14]]],
  Z: [[[0, 0], [10, 0], [0, 14], [10, 14]]],
};

function drawText(text: string, cx: number, top: number, height: number, c: RGB, a = 1): void {
  const scale = height / 14;
  const adv = 11.6 * scale; // glyph advance incl. spacing
  const totalW = text.length * adv - 1.6 * scale;
  let x = cx - totalW / 2;
  const w = 1.35 * scale; // stroke width
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      for (const stroke of glyph) {
        for (let i = 0; i + 1 < stroke.length; i++) {
          const [gx1, gy1] = stroke[i];
          const [gx2, gy2] = stroke[i + 1];
          thickLine(x + gx1 * scale, top + gy1 * scale, x + gx2 * scale, top + gy2 * scale, w, c, a);
        }
        // Round caps at stroke ends.
        const [fx, fy] = stroke[0];
        const [lx, ly] = stroke[stroke.length - 1];
        disc(x + fx * scale, top + fy * scale, w / 2, c, a);
        disc(x + lx * scale, top + ly * scale, w / 2, c, a);
      }
    }
    x += adv;
  }
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const SKY_TOP: RGB = [30, 42, 85];
const SKY_MID: RGB = [111, 74, 114];
const SKY_LOW: RGB = [224, 122, 78];
const HORIZON: RGB = [255, 201, 120];
const SUN_CORE: RGB = [255, 233, 168];
const SUN_GLOW: RGB = [255, 207, 125];
const AURORA: RGB = [143, 227, 192];
const AURORA2: RGB = [111, 211, 184];
const ISLE_FAR: RGB = [90, 74, 122];
const ISLE_NEAR: RGB = [74, 63, 110];
const CLOUD_LT: RGB = [255, 227, 184];
const CLOUD_MD: RGB = [246, 180, 141];
const CLOUD_DK: RGB = [224, 138, 109];
const LAGOON_TOP: RGB = [242, 160, 94];
const LAGOON_BOT: RGB = [122, 74, 114];
const ROCK: RGB = [46, 33, 64];
const TOWER: RGB = [247, 234, 208];
const TOWER_BAND: RGB = [178, 58, 48];
const DOME: RGB = [46, 33, 64];
const BEAM: RGB = [255, 233, 168];
const CLIFF: RGB = [26, 18, 48];
const PINE: RGB = [18, 13, 36];
const BAND: RGB = [23, 18, 48];
const NAME_CREAM: RGB = [246, 231, 198];
const NAME_SHADOW: RGB = [120, 70, 60];
const RULE_GOLD: RGB = [217, 164, 65];

// ---------------------------------------------------------------------------
// The poster
// ---------------------------------------------------------------------------
function drawPoster(): void {
  // 1. Golden-hour sky.
  vgrad([
    { y: 0, c: SKY_TOP },
    { y: 300, c: SKY_MID },
    { y: 520, c: SKY_LOW },
    { y: 620, c: HORIZON },
    { y: 1024, c: HORIZON },
  ]);

  // 2. Stars in the deep upper sky (seeded, fixed).
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * 260;
    const s = rand();
    const a = 0.25 + 0.55 * (1 - y / 300) * s;
    const r = s > 0.85 ? 1.8 : 1.1;
    disc(x, y, r, [255, 240, 210], a);
  }

  // 3. Aurora ribbons: two smooth translucent sine bands across the sky.
  for (const [baseY, amp, col, alpha, width] of [
    [150, 26, AURORA, 0.30, 13],
    [205, 34, AURORA2, 0.22, 11],
  ] as Array<[number, number, RGB, number, number]>) {
    let px = -10;
    let py = baseY + amp * Math.sin(px * 0.006 + 1.2) + 10 * Math.sin(px * 0.017);
    for (let x = -4; x <= W + 10; x += 6) {
      const y = baseY + amp * Math.sin(x * 0.006 + 1.2) + 10 * Math.sin(x * 0.017);
      thickLine(px, py, x, y, width, col, alpha * 0.6);
      thickLine(px, py, x, y, width * 0.45, col, alpha);
      px = x; py = y;
    }
  }

  // 4. The low sun and its glow.
  const sunX = 648, sunY = 318, sunR = 64;
  glow(sunX, sunY, 260, SUN_GLOW, 0.55);
  glow(sunX, sunY, 150, SUN_CORE, 0.5);
  disc(sunX, sunY, sunR, SUN_CORE, 1);
  disc(sunX, sunY, sunR - 10, [255, 244, 200], 1);

  // 5. Birds — a few small strokes crossing the light.
  const birds: Array<[number, number, number]> = [[420, 210, 16], [470, 180, 12], [790, 250, 14], [840, 205, 10], [380, 260, 9]];
  for (const [bx, by, bs] of birds) {
    thickLine(bx - bs, by - bs * 0.45, bx, by, 2.4, [40, 30, 60], 0.9);
    thickLine(bx, by, bx + bs, by - bs * 0.45, 2.4, [40, 30, 60], 0.9);
  }

  // 6. Distant isles, fading into the haze above the cloud sea.
  const far = ridgePoints(588, 16, 7, 0.006, 0.017, 0.8);
  poly([...far, [W + 8, 640], [-8, 640]], ISLE_FAR, 1);
  const near = ridgePoints(612, 12, 6, 0.008, 0.02, 2.1);
  poly([...near, [W + 8, 660], [-8, 660]], ISLE_NEAR, 1);

  // 7. The sea of clouds: three overlapping wavy bands, warm in the light.
  const cloudBands: Array<{ base: number; amp: number; c: RGB }> = [
    { base: 648, amp: 14, c: CLOUD_LT },
    { base: 690, amp: 18, c: CLOUD_MD },
    { base: 736, amp: 16, c: CLOUD_DK },
  ];
  for (const band of cloudBands) {
    const top = ridgePoints(band.base, band.amp, 6, 0.009, 0.023, band.base * 0.05);
    poly([...top, [W + 8, 830], [-8, 830]], band.c, 1);
    // Puffy cloud tops: a row of soft ellipses along the ridge.
    for (let x = 20; x < W; x += 64) {
      const y = band.base + band.amp * Math.sin(x * 0.009 + band.base * 0.05) - 4;
      ellipse(x, y, 46, 15, band.c, 1);
    }
  }

  // 8. The lagoon: a still band of water catching the sunset, with the
  //    sun's reflection streaking down from the horizon.
  for (let y = 760; y < 868; y++) {
    const t = (y - 760) / 108;
    const c = mix(LAGOON_TOP, LAGOON_BOT, t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img[i] = Math.round(c[0]); img[i + 1] = Math.round(c[1]); img[i + 2] = Math.round(c[2]); img[i + 3] = 255;
    }
  }
  // Sun reflection: one smooth tapering wedge of light under the sun,
  // on the open water above the islet (the rock hides anything lower).
  poly(
    [[sunX - 26, 764], [sunX + 26, 764], [sunX + 50, 800], [sunX - 50, 800]],
    SUN_CORE, 0.28,
  );

  // 9. The lighthouse islet — the poster's one landmark.
  const isleX = 512, rockTop = 800, rockBot = 868;
  poly(
    [[isleX - 150, rockBot], [isleX - 118, 812], [isleX - 70, rockTop], [isleX + 70, rockTop], [isleX + 118, 812], [isleX + 150, rockBot]],
    ROCK, 1,
  );
  // Rock shading on the lit side.
  poly(
    [[isleX - 118, 812], [isleX - 70, rockTop], [isleX + 4, rockTop], [isleX - 20, 812]],
    [62, 46, 84], 1,
  );

  // Tower: tapered, white with two red bands, gallery and dome.
  const towerBase = rockTop, towerTop = 596;
  const bw = 46, tw = 30; // half-widths at base / top
  poly(
    [[isleX - bw, towerBase], [isleX - tw, towerTop], [isleX + tw, towerTop], [isleX + bw, towerBase]],
    TOWER, 1,
  );
  // Red bands, clipped to the taper by interpolation.
  const bandAt = (y: number): number => bw + ((tw - bw) * (towerBase - y)) / (towerBase - towerTop);
  for (const [y0, y1] of [[700, 724], [640, 664]] as Array<[number, number]>) {
    poly(
      [[isleX - bandAt(y0), y0], [isleX - bandAt(y1), y1], [isleX + bandAt(y1), y1], [isleX + bandAt(y0), y0]],
      TOWER_BAND, 1,
    );
  }
  // Gallery + lamp room + dome.
  rect(isleX - 40, 580, isleX + 40, 596, DOME, 1);
  rect(isleX - 24, 556, isleX + 24, 580, [255, 244, 200], 1);
  for (let i = -1; i <= 1; i++) rect(isleX + i * 15 - 3, 560, isleX + i * 15 + 3, 576, DOME, 1);
  poly([[isleX - 30, 556], [isleX, 528], [isleX + 30, 556]], TOWER_BAND, 1);
  disc(isleX, 526, 5, TOWER_BAND, 1);
  // Lamp glow.
  glow(isleX, 568, 46, SUN_CORE, 0.85);
  disc(isleX, 568, 9, [255, 250, 220], 1);
  // The beam, sweeping up toward the sun.
  const beamAng = -0.62; // radians, up-right
  const bx = Math.cos(beamAng), by = Math.sin(beamAng);
  const px = -by, py = bx;
  const L = 430, spread = 46;
  poly(
    [[isleX, 568], [isleX + bx * L - px * spread, 568 + by * L - py * spread], [isleX + bx * L + px * spread, 568 + by * L + py * spread]],
    BEAM, 0.20,
  );
  poly(
    [[isleX, 568], [isleX + bx * (L * 0.7) - px * 18, 568 + by * (L * 0.7) - py * 18], [isleX + bx * (L * 0.7) + px * 18, 568 + by * (L * 0.7) + py * 18]],
    BEAM, 0.30,
  );
  // Tower windows.
  for (const wy of [742, 686]) {
    disc(isleX, wy, 5, [255, 214, 130], 1);
  }

  // 10. A small sailboat crossing the lagoon, heading for the islet.
  const boatX = 268, boatY = 838;
  poly([[boatX - 34, boatY], [boatX + 34, boatY], [boatX + 18, boatY + 12], [boatX - 18, boatY + 12]], [30, 20, 48], 1);
  thickLine(boatX, boatY - 44, boatX, boatY, 3, [30, 20, 48], 1);
  poly([[boatX + 3, boatY - 42], [boatX + 3, boatY - 4], [boatX + 30, boatY - 4]], [247, 234, 208], 1);
  poly([[boatX - 3, boatY - 36], [boatX - 3, boatY - 4], [boatX - 24, boatY - 4]], [224, 138, 109], 1);

  // 11. The name band.
  rect(0, 868, W - 1, H - 1, BAND, 1);
  rect(0, 868, W - 1, 871, RULE_GOLD, 0.9);

  // 12. Foreground cliffs framing the band, with pines.
  const leftCliff: Array<[number, number]> = [[-8, 1024], [-8, 900], [40, 884], [110, 912], [170, 940], [205, 1024]];
  poly(leftCliff, CLIFF, 1);
  const rightCliff: Array<[number, number]> = [[1032, 1024], [1032, 906], [990, 888], [930, 916], [868, 946], [838, 1024]];
  poly(rightCliff, CLIFF, 1);
  const pine = (x: number, y: number, s: number): void => {
    poly([[x, y - 34 * s], [x - 13 * s, y], [x + 13 * s, y]], PINE, 1);
    poly([[x, y - 52 * s], [x - 9 * s, y - 16 * s], [x + 9 * s, y - 16 * s]], PINE, 1);
    rect(x - 1.5 * s, y, x + 1.5 * s, y + 8 * s, PINE, 1);
  };
  pine(52, 906, 1.15);
  pine(108, 924, 0.9);
  pine(152, 946, 0.7);
  pine(968, 912, 1.1);
  pine(912, 930, 0.85);
  pine(872, 952, 0.65);

  // 13. The place's name — the only copy on the poster.
  //    A thin gold rule, a small diamond, then VELMARA in cream.
  const ruleY = 898;
  thickLine(300, ruleY, 470, ruleY, 2.5, RULE_GOLD, 1);
  thickLine(554, ruleY, 724, ruleY, 2.5, RULE_GOLD, 1);
  poly([[512, ruleY - 7], [519, ruleY], [512, ruleY + 7], [505, ruleY]], RULE_GOLD, 1);
  drawText("VELMARA", 512, 916, 88, NAME_SHADOW, 1); // offset shadow, drawn first
  drawText("VELMARA", 512, 912, 88, NAME_CREAM, 1);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder: 8-bit RGBA, filter 0, zlib level 9. No ancillary
// chunks, so the file carries no timestamps and is fully deterministic.
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    img.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
function main(): void {
  drawPoster();
  const outDir = process.argv[2] ?? process.env.OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG();
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
