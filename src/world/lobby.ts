import { TILE, LAMP_RADIUS, TERMINAL_GLOW_RADIUS } from '../config';
import { SolidGrid } from './solidGrid';

/** Legend: '#' wall, '.' floor, ' ' void, 'L' floor + ceiling lamp, 'P' spawn, 'T' terminal (solid). */
const A = '.........', B = '..........';
const room = `#${A}#${B}#${A}#`;
const hall = '#' + '.'.repeat(30) + '#';
const put = (s: string, m: Record<number, string>) => {
  const a = s.split('');
  for (const k in m) a[+k] = m[k];
  return a.join('');
};
const south = ' '.repeat(9) + '#' + '.'.repeat(12) + '#' + ' '.repeat(9);

export const LOBBY_ROWS: string[] = [
  '#'.repeat(32),
  room,
  put(room, { 5: 'L', 16: 'L' }),
  hall,
  room,
  room,
  '#'.repeat(5) + '.' + '#'.repeat(9) + '.' + '#'.repeat(10) + '.' + '#'.repeat(5),
  hall,
  put(hall, { 5: 'L', 15: 'L' }),
  hall,
  hall,
  '#'.repeat(15) + '..' + '#'.repeat(15),
  put(south, { 13: 'N' }), // 'N': No-clip point into the Wikipedia-based Levels (Phase 2)
  put(south, { 12: 'L', 16: 'P', 19: 'L' }),
  south,
  put(south, { 16: 'T' }),
  ' '.repeat(9) + '#'.repeat(14) + ' '.repeat(9),
];

export interface LightDef { x: number; y: number; radius: number; flicker: boolean }

export class TileGrid implements SolidGrid {
  readonly w: number;
  readonly h: number;
  readonly lights: LightDef[] = [];
  readonly lamps: { x: number; y: number }[] = [];
  spawn = { x: TILE, y: TILE };
  private cells: string[][];

  constructor(rows: string[]) {
    this.h = rows.length;
    this.w = Math.max(...rows.map(r => r.length));
    this.cells = rows.map(r => r.padEnd(this.w, ' ').split(''));
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const c = this.cells[ty][tx];
        const cx = (tx + 0.5) * TILE;
        if (c === 'L') {
          this.lights.push({ x: cx, y: (ty + 0.5) * TILE, radius: LAMP_RADIUS, flicker: (tx + ty) % 4 === 0 });
          this.lamps.push({ x: cx, y: (ty + 0.5) * TILE - 6 });
        } else if (c === 'P') {
          this.spawn = { x: cx, y: (ty + 1) * TILE - 6 };
        } else if (c === 'T') {
          // Glow sits in the tile north of the terminal so the ray origin is never inside a solid tile.
          this.lights.push({ x: cx, y: ty * TILE - 8, radius: TERMINAL_GLOW_RADIUS, flicker: true });
        }
      }
    }
  }

  at(tx: number, ty: number): string {
    return this.cells[ty]?.[tx] ?? ' ';
  }

  /** Solid for both movement and line of sight. Void and terminals are solid. */
  isSolidPx(x: number, y: number): boolean {
    const c = this.at(Math.floor(x / TILE), Math.floor(y / TILE));
    return c === '#' || c === ' ' || c === 'T';
  }
}
