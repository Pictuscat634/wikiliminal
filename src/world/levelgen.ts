import { TILE } from '../config';
import { TileGrid } from './lobby';
import { findMarker } from './markers';
import { mulberry32 } from '../systems/rng';
import { WikiArticle } from '../net/wikipedia';

export type PaletteName = 'default' | 'aqua' | 'industrial';

export interface GeneratedLevel {
  rows: string[];
  grid: TileGrid;
  spawn: { x: number; y: number };
  backSpot: { x: number; y: number } | null;    // no-clip back to the previous Level or Lobby
  forwardSpot: { x: number; y: number } | null; // no-clip onward to a linked article, if any
  signs: { x: number; y: number; text: string }[];
  palette: PaletteName;
}

const W = 22, H = 16; // small, bounded Level size for Phase 2

/** Environment flavor from the article's own title/categories. A coarse keyword match,
 * not real NLP - enough for "Article Echo" at this stage. */
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
 * Carves a single connected corridor network with a seeded random walk, then marks a
 * back no-clip near the start, an onward no-clip at the far end (only if the caller says
 * one should exist), and a couple of "echo" sign spots drawn from the article itself.
 *
 * Deterministic: the same (article, seed) always produces the same rows. Given the same
 * article revision and GENERATOR_VERSION, that seed is itself always the same - so the
 * same article always regenerates the same Level, per the spec's reproducibility rule.
 */
export function generateLevel(article: WikiArticle, seed: number, hasForward: boolean): GeneratedLevel {
  const rand = mulberry32(seed);
  const cells: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));

  let x = Math.floor(W / 2), y = Math.floor(H / 2);
  const visited: { x: number; y: number }[] = [];
  const steps = 160 + Math.floor(rand() * 60);
  for (let i = 0; i < steps; i++) {
    cells[y][x] = '.';
    visited.push({ x, y });
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[Math.floor(rand() * 4)];
    x = Math.min(W - 3, Math.max(2, x + dx));
    y = Math.min(H - 3, Math.max(2, y + dy));
  }

  // Wall off every floor tile's void neighbours, then close the outer border.
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (cells[ty][tx] !== '.') continue;
      const neighbours: [number, number][] = [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]];
      for (const [nx, ny] of neighbours) if (cells[ny]?.[nx] === ' ') cells[ny][nx] = '#';
    }
  }
  for (let tx = 0; tx < W; tx++) {
    if (cells[0][tx] === ' ') cells[0][tx] = '#';
    if (cells[H - 1][tx] === ' ') cells[H - 1][tx] = '#';
  }
  for (let ty = 0; ty < H; ty++) {
    if (cells[ty][0] === ' ') cells[ty][0] = '#';
    if (cells[ty][W - 1] === ' ') cells[ty][W - 1] = '#';
  }

  // Spawn one step into the walk (not on the start tile itself), so the player never
  // stands exactly on the back-marker tile they'd otherwise instantly re-trigger.
  const markerTile = visited[0];
  const spawnTile = visited[1] ?? visited[0];
  const farTile = visited[visited.length - 1];
  cells[markerTile.y][markerTile.x] = 'B';
  if (hasForward) cells[farTile.y][farTile.x] = 'F';

  // A few lamps along the path so it isn't pitch black throughout.
  for (let i = 40; i < visited.length; i += 55) {
    const p = visited[i];
    if (cells[p.y][p.x] === '.') cells[p.y][p.x] = 'L';
  }

  const signTexts = buildEchoTexts(article);
  const signs: { x: number; y: number; text: string }[] = [];
  for (let i = 0; i < signTexts.length; i++) {
    const p = visited[Math.floor(((i + 1) * visited.length) / (signTexts.length + 1))];
    if (cells[p.y][p.x] === '.') {
      cells[p.y][p.x] = 'S';
      signs.push({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE, text: signTexts[i] });
    }
  }

  const rows = cells.map(r => r.join(''));
  const grid = new TileGrid(rows);

  return {
    rows,
    grid,
    spawn: { x: (spawnTile.x + 0.5) * TILE, y: (spawnTile.y + 0.5) * TILE },
    backSpot: findMarker(rows, 'B'),
    forwardSpot: hasForward ? findMarker(rows, 'F') : null,
    signs,
    palette: choosePalette(article),
  };
}
