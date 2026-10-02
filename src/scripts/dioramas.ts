import type { Formation } from '../data/projects';
import { AREAS, LAND, PRICE_MAX, SPAN } from '../data/finland';

/** Particle formations, per stage. Pure (no DOM/WebGL), so cards can sketch them at build time. */

export const TAU = Math.PI * 2;

export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const gauss = (rnd: () => number) => (rnd() + rnd() + rnd() - 1.5) / 1.5;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const snap = (v: number, step: number) => Math.round(v / step) * step;

export interface PointInfo {
  role: number;
  u: [number, number, number];
  s: number;
  time: number;
  /** Baked stages only; live dioramas would flicker. */
  rnd: () => number;
}
export type Vec = [x: number, y: number, z: number, tone: number];
type Vec3 = [number, number, number];
interface StageSpec {
  rx: number;
  ry: number;
  at: (p: PointInfo) => Vec;
}
export interface SequenceSpec {
  /** Relative share of points per role. */
  roles: number[];
  stages: StageSpec[];
  scale?: number;
  /** Recomputed every frame from `time` (single stage). */
  live?: boolean;
}

// ---------- Samplers ----------

function onBox(p: PointInfo, cx: number, cy: number, cz: number, w: number, h: number, d: number): Vec3 {
  const [a, b, c] = p.u;
  let x = (a - 0.5) * w;
  let y = (b - 0.5) * h;
  let z = (c - 0.5) * d;
  const face = p.s;
  if (face < 0.4) x = Math.sign(x || 1) * w * 0.5;
  else if (face < 0.8) z = Math.sign(z || 1) * d * 0.5;
  else if (face < 0.9) y = Math.sign(y || 1) * h * 0.5;
  return [cx + x, cy + y, cz + z];
}

function onSphere(p: PointInfo, cx: number, cy: number, cz: number, r: number): Vec3 {
  const theta = p.u[0] * TAU;
  const cos = p.u[1] * 2 - 1;
  const sin = Math.sqrt(1 - cos * cos);
  const rr = r * (0.9 + p.u[2] * 0.15);
  return [cx + Math.cos(theta) * sin * rr, cy + cos * rr, cz + Math.sin(theta) * sin * rr];
}

function onSegment(p: PointInfo, a: Vec3, b: Vec3, t: number, spread: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t + gauss(p.rnd) * spread,
    a[1] + (b[1] - a[1]) * t + gauss(p.rnd) * spread,
    a[2] + (b[2] - a[2]) * t + gauss(p.rnd) * spread,
  ];
}

function onRect(t: number, x0: number, y0: number, w: number, h: number): [number, number] {
  const s = t * 2 * (w + h);
  if (s < w) return [x0 + s, y0 + h];
  if (s < w + h) return [x0 + w, y0 + h - (s - w)];
  if (s < 2 * w + h) return [x0 + w - (s - w - h), y0];
  return [x0, y0 + (s - 2 * w - h)];
}

// ---------- Recommender ----------

// The "Balanced optimizer" row from the recommender's own comparison tool.
const SCORES = [0.44, 0.82, 0.49, 0.75, 0.45];
const RANK = SCORES.map((s) => SCORES.filter((o) => o > s).length);
const column = (p: PointInfo, slot: number, forward: number): Vec3 => {
  const h = SCORES[p.role] * 3.6;
  return onBox(p, (slot - 2) * 1.15, -1.7 + h / 2, forward, 0.55, h, 0.55);
};

// ---------- The presentation's world ----------

const LAKE = { x: 0.9, z: 0.7, rx: 1.3, rz: 0.9 };
const inLake = (x: number, z: number) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
const ground = (x: number, z: number) =>
  inLake(x, z) ? -0.62 : 0.32 * Math.sin(1.1 * x + 0.4) * Math.cos(0.9 * z) + 0.14 * Math.sin(2.1 * x + 1.7 * z) - 0.28;
const BUILDING = { x: -1.3, z: -0.9 };
const TREES = (() => {
  const rnd = random(41);
  const out: Array<[number, number]> = [];
  while (out.length < 22) {
    const x = (rnd() - 0.5) * 6.2;
    const z = (rnd() - 0.5) * 4.4;
    if (!inLake(x, z) && Math.hypot(x - BUILDING.x, z - BUILDING.z) > 0.9) out.push([x, z]);
  }
  return out;
})();

function worldGround(p: PointInfo): Vec {
  if (p.role === 1) {
    const a = p.u[0] * TAU;
    const r = Math.sqrt(p.u[1]);
    return [LAKE.x + Math.cos(a) * r * LAKE.rx, -0.62 + Math.sin(p.u[2] * 30) * 0.015, LAKE.z + Math.sin(a) * r * LAKE.rz, 0.85];
  }
  if (p.role === 2) {
    const a = p.u[0] * TAU;
    const x = -0.7 + Math.cos(a) * 1.9;
    const z = -0.3 + Math.sin(a) * 1.15;
    return [x, ground(x, z) + 0.03, z, 0.7];
  }
  if (p.role === 3) {
    const [tx, tz] = TREES[Math.floor(p.u[0] * TREES.length)];
    return [tx + (p.s - 0.5) * 0.3, ground(tx, tz), tz + (p.u[2] - 0.5) * 0.3, 0.3];
  }
  if (p.role === 4) {
    const x = BUILDING.x + (p.u[0] - 0.5) * 0.9;
    const z = BUILDING.z + (p.u[1] - 0.5) * 0.6;
    return [x, ground(BUILDING.x, BUILDING.z), z, 0.3];
  }
  let x = (p.u[0] - 0.5) * 6.6;
  let z = (p.u[1] - 0.5) * 4.8;
  if (p.u[2] < 0.5) x = snap(x, 0.3);
  else z = snap(z, 0.3);
  if (inLake(x, z)) x += x > LAKE.x ? LAKE.rx : -LAKE.rx;
  return [x, ground(x, z), z, 0.55];
}

function turnY([x, y, z, t]: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c, t];
}

function worldBuilt(p: PointInfo): Vec {
  if (p.role === 3) {
    const tree = Math.floor(p.u[0] * TREES.length);
    const [tx, tz] = TREES[tree];
    const h = 0.55 + (tree % 4) * 0.08;
    const v = Math.pow(p.u[1], 0.8);
    const r = (1 - v) * 0.2;
    const a = p.u[2] * TAU;
    return [tx + Math.cos(a) * r, ground(tx, tz) + v * h, tz + Math.sin(a) * r, 0.5];
  }
  if (p.role === 4) {
    const base = ground(BUILDING.x, BUILDING.z);
    const [x, y, z] = onBox(p, BUILDING.x, base + 0.75, BUILDING.z, 0.9, 1.5, 0.6);
    return [snap(x - BUILDING.x, 0.1) + BUILDING.x, base + snap(y - base, 0.15), snap(z - BUILDING.z, 0.1) + BUILDING.z, 0.9];
  }
  return worldGround(p);
}

// ---------- Lakehouse ----------

const TABLE_X = { bronze: -2.5, silver: 0, gold: 2.5 };
const TABLE_W = 1.1;
const rowY = (r: number) => 0.85 - r * 0.2;
const hash = (n: number) => Math.abs((Math.sin(n * 91.345 + 7.13) * 43758.5453) % 1);
const fadeEnds = (t: number, edge = 0.06) => smooth(clamp01(t / edge)) * (1 - smooth(clamp01((t - (1 - edge)) / edge)));
/** A tone that fades out to hidden (-1) as `fade` goes to 0. */
const faded = (tone: number, fade: number) => -1 + (tone + 1) * fade;

function lakehouse(p: PointInfo): Vec {
  const [a, b, c] = p.u;
  const z = (p.s - 0.5) * 0.12;
  if (p.role === 0) {
    const r = Math.floor(a * 9);
    const len = 0.6 + hash(r) * 0.4;
    const x = TABLE_X.bronze - TABLE_W / 2 + (hash(r + 20) - 0.5) * 0.3 + b * TABLE_W * len;
    return [x, rowY(r) + (c - 0.5) * 0.06, z, 0.3];
  }
  if (p.role === 1) {
    const r = Math.floor(a * 9);
    return [TABLE_X.silver - TABLE_W / 2 + b * TABLE_W, rowY(r), z, 0.55];
  }
  if (p.role === 2) {
    const r = Math.floor(a * 6);
    return [TABLE_X.gold - TABLE_W / 2 + b * TABLE_W, rowY(r) - 0.3, z, 1];
  }
  if (p.role === 3) {
    return [TABLE_X.silver + (b - 0.5) * 0.9, -1.4 + c * 0.22, z, 0.12];
  }
  const t = (p.time * 0.1 + a) % 1;
  const row = 1 + Math.floor(b * 3) * 2;
  if (t < 0.5) {
    const q = t / 0.5;
    const x = TABLE_X.bronze + TABLE_W / 2 + 0.1 + q * (TABLE_X.silver - TABLE_X.bronze - TABLE_W - 0.2);
    return [x, rowY(row + 1), z, faded(0.95, fadeEnds(q))];
  }
  const q = (t - 0.5) / 0.5;
  if (c < 0.18) {
    return [TABLE_X.silver + (b - 0.5) * 0.6, -0.95 - q * 0.4, z, faded(0.6, fadeEnds(q, 0.12))];
  }
  const x = TABLE_X.silver + TABLE_W / 2 + 0.1 + q * (TABLE_X.gold - TABLE_X.silver - TABLE_W - 0.2);
  return [x, rowY(row + 1) + (rowY(row % 6) - 0.3 - rowY(row + 1)) * q, z, faded(1, fadeEnds(q))];
}

// ---------- Data curator ----------

const CELLS = { cols: 6, rows: 5, x: 0.7, y: 0.95, pitch: 0.42, size: 0.3 };
const cellAt = (k: number): [number, number] => [CELLS.x + (k % CELLS.cols) * CELLS.pitch, CELLS.y - Math.floor(k / CELLS.cols) * CELLS.pitch];
const GATE_X = -0.35;

function curator(p: PointInfo): Vec {
  const [a, b, c] = p.u;
  const z = (p.s - 0.5) * 0.1;
  if (p.role === 0) {
    const [cx, cy] = cellAt(Math.floor(a * CELLS.cols * CELLS.rows));
    const [x, y] = onRect(b, cx - CELLS.size / 2, cy - CELLS.size / 2, CELLS.size, CELLS.size);
    return [x, y, z, 0.3];
  }
  if (p.role === 1) {
    return [GATE_X + (c - 0.5) * 0.05, -1.05 + b * 2.1, z, 0.75];
  }
  const t = (p.time * 0.08 + a) % 1;
  const lane = (Math.floor(b * 5) / 4 - 0.5) * 1.5 + (p.s - 0.5) * 0.04;
  const fade = fadeEnds(t, 0.05);
  if (t < 0.45) {
    const q = t / 0.45;
    return [-3.3 + q * (GATE_X - 0.1 + 3.3), lane, z, faded(0.5, fade)];
  }
  const q = smooth(clamp01(((t - 0.45) / 0.55) * 1.8));
  if (p.role === 2) {
    const [cx, cy] = cellAt(Math.floor(c * CELLS.cols * CELLS.rows));
    return [GATE_X + (cx + (b - 0.5) * 0.18 - GATE_X) * q, lane * 0.7 + (cy + (p.s - 0.5) * 0.18 - lane * 0.7) * q, z, faded(1, fade)];
  }
  if (p.role === 3) {
    const r = (t - 0.45) / 0.55;
    return [GATE_X + r * 1.1, lane * 0.7 - r * r * 2.4, z, faded(0.45 - r * 0.45, fade * (1 - smooth(clamp01((r - 0.5) / 0.5))))];
  }
  return [GATE_X + (CELLS.x - 0.1 + c * 2.4 - GATE_X) * q, lane * 0.7 + (1.75 - lane * 0.7) * q, z, faded(0.7, fade)];
}

// ---------- Screening agent ----------

const DOC_LINES = [0.9, 1.5, 1.2, 1.6, 0.7, 1.4, 1.5, 1.0, 1.6, 1.3, 0.8];
function declaration(p: PointInfo, tone: number): Vec {
  const cx = -1.4;
  if (p.u[2] < 0.25) {
    const [x, y] = onRect(p.u[0], -1.1, -1.5, 2.2, 3);
    return [cx + x, y, gauss(p.rnd) * 0.02, tone];
  }
  const l = Math.floor(p.u[1] * DOC_LINES.length);
  return [cx - 0.85 + p.u[0] * DOC_LINES[l], 1.15 - l * 0.24 + gauss(p.rnd) * 0.02, gauss(p.rnd) * 0.02, tone];
}
function drawing(p: PointInfo, tone: number): Vec {
  const cx = -0.2;
  const cy = -0.9;
  if (p.u[1] < 0.5) {
    const [x, y] = onRect(p.u[0], -0.6, -0.4, 1.2, 0.8);
    return [cx + x, cy + y, 0.05, tone];
  }
  if (p.u[1] < 0.8) {
    const a = p.u[0] * TAU;
    return [cx + Math.cos(a) * 0.18, cy + Math.sin(a) * 0.18, 0.05, tone + 0.2];
  }
  return [cx - 0.6 + p.u[0] * 1.2, cy - 0.58, 0.05, tone];
}
function checklist(p: PointInfo): Vec {
  const row = Math.floor(p.u[0] * 5);
  const y = 1.0 - row * 0.5;
  const lengths = [1.2, 0.9, 1.4, 1.0, 1.25];
  if (p.u[1] < 0.35) {
    const [x, yy] = onRect(p.u[2], 0, 0, 0.24, 0.24);
    return [0.9 + x, y - 0.12 + yy, 0, 0.8];
  }
  return [1.35 + p.u[2] * lengths[row], y + gauss(p.rnd) * 0.03, 0, 0.7];
}
function checkmark(p: PointInfo): Vec {
  const t = p.u[0];
  const [x, y, z] =
    t < 0.32
      ? onSegment(p, [0.55, 0.15, 0], [1.1, -0.5, 0], t / 0.32, 0.07)
      : onSegment(p, [1.1, -0.5, 0], [2.3, 1.0, 0], (t - 0.32) / 0.68, 0.07);
  return [x, y, z, 1];
}

// ---------- Impact predictor ----------

const LAYERS = [5, 8, 8, 5];
const nodeAt = (layer: number, k: number): Vec3 => [-2.1 + layer * 1.4, ((k + 0.5) / LAYERS[layer] - 0.5) * 2.9, 0];
const cellHeight = (a: number, b: number) => 0.3 + 1.7 * Math.abs((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1);

// ---------- Asumisvalinta ----------

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const decode = (s: string, i: number) => (ALPHA.indexOf(s[i]) << 6) | ALPHA.indexOf(s[i + 1]);
// Map coordinates, enlarged a little to fill the view.
const unq = (v: number) => ((v / 4095) * 2 * SPAN - SPAN) * 1.15;
const AREA_N = AREAS.length / 6;
const AREA_AT = Array.from({ length: AREA_N }, (_, k) => {
  const i = k * 6;
  return { x: unq(decode(AREAS, i)), z: unq(decode(AREAS, i + 2)), price: (decode(AREAS, i + 4) / 4095) * PRICE_MAX };
});
const LAND_N = LAND.length / 5;
const LAND_AT = Array.from({ length: LAND_N }, (_, k) => {
  const i = k * 5;
  return { x: unq(decode(LAND, i)), z: unq(decode(LAND, i + 2)), tone: ALPHA.indexOf(LAND[i + 4]) / 63 };
});
const priceTone = (price: number) => clamp01((Math.log(Math.max(price, 1)) - Math.log(600)) / (Math.log(7000) - Math.log(600)));
/** Picks from `items` in proportion to `weight`; items are sorted north to south so morphs stay local. */
function weighted<T extends { z: number; x: number }>(items: T[], weight: (item: T) => number) {
  const sorted = [...items].sort((a, b) => a.z - b.z || a.x - b.x);
  let sum = 0;
  const cum = sorted.map((item) => (sum += weight(item)));
  return (u: number) => {
    const target = u * sum;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return sorted[lo];
  };
}
// Areas by price, so the dearest places glow on the flat map.
const spikeArea = weighted(AREA_AT, (a) => a.price);
// The map as a grid of price columns. Heights are stylised: a low base, peaking at the big cities.
const CELL = 0.2;
const at = (lon: number, lat: number) => ({ x: (lon - 25.6) * Math.cos((64.5 * Math.PI) / 180) * 0.33 * 1.15, z: -(lat - 64.9) * 0.33 * 1.15 });
const CITIES = [
  { ...at(24.94, 60.17), h: 2.3 }, // Helsinki
  { ...at(23.76, 61.5), h: 1.25 }, // Tampere
  { ...at(22.27, 60.45), h: 1.1 }, // Turku
  { ...at(25.47, 65.01), h: 0.95 }, // Oulu
  { ...at(25.73, 62.24), h: 0.8 }, // Jyväskylä
  { ...at(27.68, 62.89), h: 0.75 }, // Kuopio
  { ...at(25.66, 60.98), h: 0.7 }, // Lahti
  { ...at(21.62, 63.1), h: 0.6 }, // Vaasa
  { ...at(29.76, 62.6), h: 0.55 }, // Joensuu
  { ...at(25.73, 66.5), h: 0.55 }, // Rovaniemi
];
const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const COLUMNS = (() => {
  const cells = new Map<string, { x: number; z: number }>();
  for (const a of AREA_AT) {
    cells.set(cellKey(a.x, a.z), { x: (Math.floor(a.x / CELL) + 0.5) * CELL, z: (Math.floor(a.z / CELL) + 0.5) * CELL });
  }
  return [...cells.values()].map((c) => {
    const peak = 1.3 * Math.max(...CITIES.map((city) => city.h * Math.exp(-((c.x - city.x) ** 2 + (c.z - city.z) ** 2) / 0.03)));
    const h = Math.max(0.08 + 0.1 * hash(c.x * 7 + c.z * 13), peak);
    return { ...c, h, price: 600 + (h / 3) * 6400 };
  });
})();
// Points per column follow its height, so every column is equally dense.
const pickColumn = weighted(COLUMNS, (c) => c.h + 0.12);
// The flat in the scenario below: postal code 00880, Herttoniemi, Helsinki.
const CHOSEN = AREA_AT[77];
const CHOSEN_COLUMN = COLUMNS.find((c) => cellKey(c.x, c.z) === cellKey(CHOSEN.x, CHOSEN.z))!;

// The app's own default scenario for a 50 m² one-bedroom flat in 00880 over 15 years:
// wealth by year (0 to 15) for buy, rent and right of occupancy (live planner API, 2026-10-02).
const WEALTH = {
  buy: [13981, 18841, 23839, 28980, 34269, 39709, 45306, 51064, 56990, 63087, 69361, 75819, 82465, 89306, 96348, 103598],
  rent: [23639, 27223, 30829, 34457, 38110, 41792, 45506, 49255, 53041, 56871, 60746, 64672, 68654, 72696, 76803, 80982],
  aso: [23639, 28597, 33748, 38880, 44068, 49315, 54622, 59994, 65434, 70945, 76532, 82199, 87949, 93787, 99719, 105750],
};
const YEARS = WEALTH.buy.length - 1;
// Plotted against renting: rent is the zero line, and buying crosses it at break-even.
const VS_RENT = {
  buy: WEALTH.buy.map((w, i) => w - WEALTH.rent[i]),
  rent: WEALTH.rent.map(() => 0),
  aso: WEALTH.aso.map((w, i) => w - WEALTH.rent[i]),
};
const ZERO = -0.35;
const chartX = (year: number) => -2 + (year / YEARS) * 4;
const chartY = (gap: number) => ZERO + (gap / 30000) * 1.8;
const gapAt = (series: number[], year: number) => {
  const k = Math.min(YEARS - 1, Math.floor(year));
  return series[k] + (series[k + 1] - series[k]) * (year - k);
};
const BREAK_EVEN = (() => {
  const k = VS_RENT.buy.findIndex((d) => d >= 0);
  const d0 = VS_RENT.buy[k - 1];
  return k - 1 + d0 / (d0 - VS_RENT.buy[k]);
})();

function landAt(p: PointInfo, dim: number): Vec {
  const l = LAND_AT[Math.floor(p.u[0] * LAND_N)];
  return [l.x + gauss(p.rnd) * 0.012, 0, l.z + gauss(p.rnd) * 0.012, (0.1 + 0.65 * Math.pow(l.tone, 1.4)) * dim];
}

function housingMap(p: PointInfo): Vec {
  if (p.role === 1) {
    const a = spikeArea(p.u[0]);
    return [a.x + gauss(p.rnd) * 0.008, 0, a.z + gauss(p.rnd) * 0.008, 0.2 + 0.6 * priceTone(a.price)];
  }
  if (p.role === 2) {
    const angle = p.u[0] * TAU;
    return [CHOSEN.x + Math.cos(angle) * 0.07, 0, CHOSEN.z + Math.sin(angle) * 0.07, 1];
  }
  return landAt(p, 1);
}

function housingColumns(p: PointInfo): Vec {
  // Most of the land rises into the columns too; a quarter stays as the floor.
  if (p.role === 1 || (p.role === 0 && p.s > 0.25)) {
    const c = pickColumn(p.u[0]);
    const half = CELL * 0.3;
    const tone = 0.15 + 0.6 * priceTone(c.price);
    if (p.u[1] < 0.72) {
      // Vertical edges.
      const corner = Math.floor(p.u[2] * 4);
      const v = p.rnd();
      return [c.x + (corner % 2 ? half : -half), v * c.h, c.z + (corner < 2 ? half : -half), tone + 0.15 * v];
    }
    const [x, z] = onRect(p.u[2], c.x - half, c.z - half, half * 2, half * 2);
    return [x, c.h, z, tone + 0.2];
  }
  if (p.role === 2) {
    // A ring above the column that holds the chosen flat.
    const angle = p.u[0] * TAU;
    return [CHOSEN_COLUMN.x + Math.cos(angle) * 0.1, CHOSEN_COLUMN.h + 0.12, CHOSEN_COLUMN.z + Math.sin(angle) * 0.1, 1];
  }
  return landAt(p, 0.35);
}

function housingChart(p: PointInfo): Vec {
  const z = gauss(p.rnd) * 0.03;
  if (p.role === 0) {
    // Buy, rent (the zero line) and right of occupancy.
    const line = Math.floor(p.u[2] * 3);
    const series = [VS_RENT.buy, VS_RENT.rent, VS_RENT.aso][line];
    const year = p.u[0] * YEARS;
    return [chartX(year) + gauss(p.rnd) * 0.008, chartY(gapAt(series, year)) + gauss(p.rnd) * 0.01, z, [1, 0.5, 0.4][line]];
  }
  if (p.role === 1) {
    // Area between buying and renting, dim while buying is behind.
    const year = p.u[0] * YEARS;
    const edge = chartY(gapAt(VS_RENT.buy, year));
    const f = 1 - p.u[1] * p.u[1];
    const ahead = edge > ZERO;
    return [chartX(year), ZERO + (edge - ZERO) * f, z, (ahead ? 0.05 : 0.03) + (ahead ? 0.26 : 0.12) * f * f];
  }
  if (p.role === 2) {
    // Break-even: a dashed line through the crossing, and a ring on it.
    const x = chartX(BREAK_EVEN);
    if (p.u[1] < 0.55) {
      const v = -1.05 + p.u[0] * 2.3;
      return [x + gauss(p.rnd) * 0.004, v, z, Math.floor((v + 1.05) * 14) % 2 === 0 ? 0.75 : -1];
    }
    const angle = p.u[0] * TAU;
    return [x + Math.cos(angle) * 0.085, ZERO + Math.sin(angle) * 0.085, z, 1];
  }
  // A tick on the zero line every five years, and a faint value axis.
  if (p.u[1] < 0.35) {
    const year = Math.floor(p.u[0] * 4) * 5;
    return [chartX(year) + gauss(p.rnd) * 0.004, ZERO - 0.04 - p.u[2] * 0.08, z, 0.4];
  }
  return [chartX(0) - 0.12 + gauss(p.rnd) * 0.004, -1.05 + p.u[0] * 2.3, z, 0.22];
}

// ---------- All formations ----------

function single(at: (p: PointInfo) => Vec): SequenceSpec {
  return { roles: [1], stages: [{ rx: 0, ry: 0, at }] };
}

export const sequences: Record<Exclude<Formation, 'name'>, SequenceSpec> = {
  scatter: single((p) => [(p.u[0] - 0.5) * 16, (p.u[1] - 0.5) * 10, -4 + p.u[2] * 8, 0.3]),

  galaxy: single((p) => {
    const r = 0.15 + 4 * Math.pow(p.u[0], 1.6);
    const arm = Math.floor(p.u[1] * 3) * (TAU / 3);
    const a = arm + r * 1.1 + gauss(p.rnd) * 0.45 * (0.3 + r / 4);
    const y = gauss(p.rnd) * 0.18 * (1 - r / 5);
    const z = Math.sin(a) * r;
    const c = Math.cos(1.18);
    const s = Math.sin(1.18);
    return [Math.cos(a) * r, y * c - z * s, y * s + z * c, 0.2 + 0.5 * (1 - r / 4.2)];
  }),

  recommender: {
    roles: [1, 1, 1, 1, 1],
    stages: [
      { rx: 0.22, ry: -0.5, at: (p) => [...onSphere(p, (p.role - 2) * 1.15, -0.9, 0, 0.32), 0.3] },
      { rx: 0.18, ry: -0.42, at: (p) => [...column(p, p.role, 0), 0.3 + SCORES[p.role] * 0.3] },
      {
        rx: 0.12,
        ry: -0.2,
        at: (p) => {
          const first = RANK[p.role] === 0;
          return [...column(p, RANK[p.role], first ? 0.45 : 0), first ? 1 : 0.2];
        },
      },
    ],
  },

  housing: {
    // Land / chart lines, price columns / area fill, the chosen flat / break-even, axis.
    roles: [0.5, 0.4, 0.025, 0.075],
    stages: [
      { rx: 1.2, ry: 0, at: housingMap },
      { rx: 0.62, ry: -0.5, at: housingColumns },
      { rx: 0, ry: -0.08, at: housingChart },
    ],
  },

  curator: {
    // Records, gate, applied / rejected / to a person.
    roles: [0.5, 0.1, 0.11, 0.18, 0.11],
    live: true,
    stages: [{ rx: 0.05, ry: -0.2, at: curator }],
  },

  world: {
    roles: [0.5, 0.14, 0.08, 0.14, 0.14],
    scale: 0.64,
    live: true,
    stages: [{ rx: 0.55, ry: 0, at: (p) => turnY(worldBuilt(p), p.time * 0.12) }],
  },

  medallion: {
    roles: [0.33, 0.29, 0.22, 0.07, 0.09],
    scale: 0.82,
    live: true,
    stages: [{ rx: 0.06, ry: -0.08, at: lakehouse }],
  },

  screening: {
    roles: [0.55, 0.2, 0.25],
    stages: [
      { rx: 0.04, ry: -0.3, at: (p) => (p.role === 1 ? drawing(p, 0.35) : declaration(p, p.role === 2 ? 0.6 : 0.35)) },
      { rx: 0.04, ry: -0.18, at: (p) => (p.role === 0 ? declaration(p, 0.3) : p.role === 1 ? drawing(p, 0.3) : checklist(p)) },
      { rx: 0.02, ry: -0.08, at: (p) => (p.role === 0 ? declaration(p, 0.1) : p.role === 1 ? drawing(p, 0.1) : checkmark(p)) },
    ],
  },

  predictor: {
    // Nodes, connections.
    roles: [0.4, 0.6],
    stages: [
      {
        rx: 0.25,
        ry: 0,
        at: (p) => {
          const shares = [0.45, 0.25, 0.2, 0.1];
          let seg = 0;
          let end = shares[0];
          while (p.u[0] > end && seg < shares.length - 1) end += shares[++seg];
          const start = end - shares[seg];
          const a = (start + (p.u[0] - start) * 0.92) * TAU;
          const r = 1.5 + gauss(p.rnd) * 0.14;
          return [Math.cos(a) * r, Math.sin(a) * r, gauss(p.rnd) * 0.12, 0.25 + seg * 0.25];
        },
      },
      {
        rx: 0.1,
        ry: -0.35,
        at: (p) => {
          if (p.role === 0) {
            const layer = Math.floor(p.u[0] * LAYERS.length);
            const [x, y, z] = nodeAt(layer, Math.floor(p.u[1] * LAYERS[layer]));
            return [...onSphere({ ...p, u: [p.u[2], p.rnd(), p.rnd()] }, x, y, z, 0.11), 0.9];
          }
          const layer = Math.floor(p.u[0] * (LAYERS.length - 1));
          const a = nodeAt(layer, Math.floor(p.u[1] * LAYERS[layer]));
          const b = nodeAt(layer + 1, Math.floor(p.u[2] * LAYERS[layer + 1]));
          return [...onSegment(p, a, b, p.rnd(), 0.012), 0.14];
        },
      },
      {
        rx: 0.42,
        ry: -0.5,
        at: (p) => {
          const cell = Math.floor(p.u[0] * 25);
          const a = cell % 5;
          const b = Math.floor(cell / 5);
          const h = cellHeight(a, b);
          const cx = (a - 2) * 0.62;
          const cz = (b - 2) * 0.62;
          const half = 0.18;
          const tone = 0.2 + h * 0.4;
          if (p.u[1] < 0.7) {
            const corner = Math.floor(p.u[2] * 4);
            const x = cx + (corner % 2 ? half : -half);
            const z = cz + (corner < 2 ? half : -half);
            return [x, -1.1 + p.rnd() * h, z, tone];
          }
          const [x, z] = onRect(p.u[2], cx - half, cz - half, half * 2, half * 2);
          return [x, -1.1 + h, z, tone + 0.2];
        },
      },
    ],
  },
};

/** A flat `[x, y, tone]` sketch of a formation's last stage, as the field shows it. */
export function sketch(name: Exclude<Formation, 'name'>, count: number): Array<[number, number, number]> {
  const spec = sequences[name];
  const stage = spec.stages[spec.stages.length - 1];
  const total = spec.roles.reduce((a, b) => a + b, 0);
  const rnd = random(5);
  const k = spec.scale ?? 1;
  const [cx, sx] = [Math.cos(stage.rx), Math.sin(stage.rx)];
  const [cy, sy] = [Math.cos(stage.ry), Math.sin(stage.ry)];
  return Array.from({ length: count }, () => {
    let r = rnd() * total;
    let role = 0;
    while (r > spec.roles[role] && role < spec.roles.length - 1) r -= spec.roles[role++];
    const [x0, y0, z0, tone] = stage.at({ role, u: [rnd(), rnd(), rnd()], s: rnd(), time: 0, rnd });
    // Same rotation order as the field: y, then x.
    const x1 = (x0 * cy + z0 * sy) * k;
    const z1 = (-x0 * sy + z0 * cy) * k;
    const y2 = y0 * k * cx - z1 * sx;
    return [x1, y2, tone];
  });
}
