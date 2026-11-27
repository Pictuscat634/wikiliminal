import { hashSeed } from '../systems/rng';

/** Deterministic pseudo-random value in [0,1) for an integer lattice point. */
export function hash01(seed: number, x: number, y: number): number {
  return hashSeed(`${seed}:${x}:${y}`) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Smooth 2D value noise in [0,1]. A pure function of absolute coordinates, so it is
 * continuous across chunk borders and needs no shared state between chunks.
 */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const sx = smooth(x - x0), sy = smooth(y - y0);
  const top = lerp(hash01(seed, x0, y0), hash01(seed, x0 + 1, y0), sx);
  const bot = lerp(hash01(seed, x0, y0 + 1), hash01(seed, x0 + 1, y0 + 1), sx);
  return lerp(top, bot, sy);
}
