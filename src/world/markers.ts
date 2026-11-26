import { TILE } from '../config';

/** First occurrence of `ch` in a set of raw map rows, as a pixel-space tile center. */
export function findMarker(rows: string[], ch: string): { x: number; y: number } | null {
  for (let ty = 0; ty < rows.length; ty++) {
    const tx = rows[ty].indexOf(ch);
    if (tx !== -1) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
