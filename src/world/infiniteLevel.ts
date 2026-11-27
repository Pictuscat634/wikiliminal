import { TILE } from '../config';
import { WikiArticle } from '../net/wikipedia';
import { mulberry32 } from '../systems/rng';
import { hash01, valueNoise } from './noise';
import { SolidGrid } from './solidGrid';

export type PaletteName = 'default' | 'aqua' | 'industrial';
export const CHUNK_SIZE = 16;

export interface Pt { x: number; y: number } // tile coordinates, level-local; (0,0) is the entry point

export interface LevelPlan {
  seed: number;
  palette: PaletteName;
  spawn: Pt;
  backSpot: Pt;
  forwardSpot: Pt | null;
  anchors: Pt[];                       // points joined by guaranteed-walkable paths
  signs: { pos: Pt; text: string }[];  // "Article Echo" texts placed along the guaranteed path
}

/** Environment flavor from the article's title/categories. Coarse keyword match, not NLP. */
function choosePalette(article: WikiArticle): PaletteName {
  const text = (article.title + ' ' + article.categories.join(' ')).toLowerCase();
  if (/(海|深海|水|ocean|sea|marine)/.test(text)) return 'aqua';
  if (/(発電|工場|機械|industrial|plant|factory|reactor)/.test(text)) return 'industrial';
  return 'default';
}

function buildEchoTexts(article: WikiArticle): string[] {
  const texts = [article.title];
  if (article.categories[0]) texts.push(article.categories[0]);
  if (article.extract) texts.push(article.extract.slice(0, 60) + (article.extract.length > 60 ? '…' : ''));
  return texts;
}

/**
 * Plans one Level: where spawn / back / forward sit. Everything else (terrain) is generated
 * lazily per chunk. Pure function of (article, seed): same inputs, same Level.
 */
export function planLevel(article: WikiArticle, seed: number, hasForward: boolean): LevelPlan {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const backSpot: Pt = { x: 0, y: 0 };
  const spawn: Pt = { x: 2, y: 0 }; // beside, not on, the back marker, so arrival never re-triggers it
  let forwardSpot: Pt | null = null;
  if (hasForward) {
    const angle = rand() * Math.PI * 2;
    const dist = 45 + Math.floor(rand() * 25); // 45-70 tiles away: a real walk
    forwardSpot = { x: spawn.x + Math.round(Math.cos(angle) * dist), y: spawn.y + Math.round(Math.sin(angle) * dist) };
  }
  const anchors = [backSpot, spawn, ...(forwardSpot ? [forwardSpot] : [])];

  const texts = buildEchoTexts(article);
  const target = forwardSpot ?? { x: spawn.x + 10, y: spawn.y };
  const signs = texts.map((text, i) => {
    const t = (i + 1) / (texts.length + 1);
    return { text, pos: { x: Math.round(spawn.x + (target.x - spawn.x) * t), y: Math.round(spawn.y + (target.y - spawn.y) * t) } };
  });

  return { seed, palette: choosePalette(article), spawn, backSpot, forwardSpot, anchors, signs };
}

// --- terrain -------------------------------------------------------------------------
const ANCHOR_CLEAR_RADIUS = 2.2; // always-floor disk around spawn/back/forward
const PATH_WIDTH = 1.4;          // half-width of the guaranteed corridor between anchors
const FREQ_A = 0.07, WIDTH_A = 0.085;
const FREQ_B = 0.05, WIDTH_B = 0.07;
const LAMP_CHANCE = 0.008;       // per floor tile; lower = darker world

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onGuaranteedPath(plan: LevelPlan, gx: number, gy: number): boolean {
  for (const a of plan.anchors) if (Math.hypot(gx - a.x, gy - a.y) < ANCHOR_CLEAR_RADIUS) return true;
  for (let i = 0; i < plan.anchors.length - 1; i++) {
    const a = plan.anchors[i], b = plan.anchors[i + 1];
    if (distToSegment(gx, gy, a.x, a.y, b.x, b.y) < PATH_WIDTH) return true;
  }
  return false;
}

/** Floor where either noise field is near its midline (winding bands = corridors), plus the guaranteed path. */
function isFloor(plan: LevelPlan, gx: number, gy: number): boolean {
  if (onGuaranteedPath(plan, gx, gy)) return true;
  const a = Math.abs(valueNoise(plan.seed, gx * FREQ_A, gy * FREQ_A) - 0.5) < WIDTH_A;
  const b = Math.abs(valueNoise(plan.seed + 91, gx * FREQ_B, gy * FREQ_B) - 0.5) < WIDTH_B;
  return a || b;
}

export interface Chunk {
  cx: number; cy: number;
  rows: string[]; // CHUNK_SIZE strings of '#' / '.'
  lamps: Pt[];    // global tile coordinates
}

// Tile data is tiny (strings), so generated chunks are kept for the whole session:
// revisiting an area never regenerates it, only the on-screen sprites come and go.
const chunkCache = new Map<string, Chunk>();

export function getChunk(plan: LevelPlan, cx: number, cy: number): Chunk {
  const key = `${plan.seed}:${cx}:${cy}`;
  const hit = chunkCache.get(key);
  if (hit) return hit;

  const rows: string[] = [];
  const lamps: Pt[] = [];
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    let row = '';
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const gx = cx * CHUNK_SIZE + lx, gy = cy * CHUNK_SIZE + ly;
      const floor = isFloor(plan, gx, gy);
      row += floor ? '.' : '#';
      if (floor && hash01(plan.seed + 500, gx, gy) < LAMP_CHANCE) lamps.push({ x: gx, y: gy });
    }
    rows.push(row);
  }
  const chunk = { cx, cy, rows, lamps };
  chunkCache.set(key, chunk);
  return chunk;
}

export function isSolidAt(plan: LevelPlan, gx: number, gy: number): boolean {
  const cx = Math.floor(gx / CHUNK_SIZE), cy = Math.floor(gy / CHUNK_SIZE);
  return getChunk(plan, cx, cy).rows[gy - cy * CHUNK_SIZE][gx - cx * CHUNK_SIZE] === '#';
}

/** Pixel-space view of an unbounded Level, for collision and the lighting raycaster. */
export class InfiniteGrid implements SolidGrid {
  constructor(private plan: LevelPlan) {}
  isSolidPx(x: number, y: number): boolean {
    return isSolidAt(this.plan, Math.floor(x / TILE), Math.floor(y / TILE));
  }
}
