import Phaser from 'phaser';
import { TILE, DEPTH } from '../config';
import { TileGrid, LightDef } from '../world/lobby';

const RAYS = 200;
const STEP = 2;           // ray-march step in px; walls are 32px thick so nothing is skipped
const WALL_BLEED = 10;    // light spills slightly into the wall so lit wall faces are visible
const RINGS = [0.45, 0.7, 0.88, 1]; // stacked polygons approximate a radial falloff
const DARK_COLOR = 0x04070a;
const DARK_ALPHA = 0.95;

/** Distance to the first solid tile for each of N evenly spaced rays, capped at `radius`. */
export function castVisibility(grid: TileGrid, ox: number, oy: number, radius: number): Float32Array {
  const out = new Float32Array(RAYS);
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = 0;
    while (t < radius) {
      t += STEP;
      if (grid.isSolidPx(ox + dx * t, oy + dy * t)) { t += WALL_BLEED; break; }
    }
    out[i] = Math.min(t, radius);
  }
  return out;
}

interface Fixed { def: LightDef; g: Phaser.GameObjects.Graphics; flickerLeft: number }

/**
 * Darkness layer: a world-sized RenderTexture filled with near-black each frame, with
 * line-of-sight polygons erased out of it. Walls shape every polygon, so light never
 * leaks through them. (Swap to a view-sized texture when levels get large.)
 */
export class LightingSystem {
  private rt: Phaser.GameObjects.RenderTexture;
  private playerG: Phaser.GameObjects.Graphics;
  private fixed: Fixed[] = [];

  constructor(private scene: Phaser.Scene, private grid: TileGrid) {
    this.rt = scene.add.renderTexture(0, 0, grid.w * TILE, grid.h * TILE).setOrigin(0, 0).setDepth(DEPTH.darkness);
    this.playerG = scene.make.graphics({}, false);
  }

  addFixedLight(def: LightDef): void {
    const g = this.scene.make.graphics({}, false);
    this.drawRings(g, def.x, def.y, castVisibility(this.grid, def.x, def.y, def.radius), def.radius, 0.36);
    this.fixed.push({ def, g, flickerLeft: 0 }); // fixed lights are computed once and reused
  }

  update(px: number, py: number, playerRadius: number): void {
    const rt = this.rt;
    rt.clear();
    rt.fill(DARK_COLOR, DARK_ALPHA);
    const v = this.scene.cameras.main.worldView;

    for (const f of this.fixed) {
      const { x, y, radius } = f.def;
      if (x + radius < v.x || x - radius > v.right || y + radius < v.y || y - radius > v.bottom) continue;
      if (f.def.flicker) {
        if (f.flickerLeft > 0) { f.flickerLeft--; f.g.setAlpha(0.3 + Math.random() * 0.5); }
        else { f.g.setAlpha(1); if (Math.random() < 0.004) f.flickerLeft = 4 + Math.floor(Math.random() * 8); }
      }
      rt.erase(f.g);
    }

    const d = castVisibility(this.grid, px, py, playerRadius);
    this.drawRings(this.playerG, px, py, d, playerRadius, 0.26);
    rt.erase(this.playerG);
  }

  private drawRings(g: Phaser.GameObjects.Graphics, ox: number, oy: number, d: Float32Array, radius: number, alpha: number): void {
    g.clear();
    for (const k of RINGS) {
      g.fillStyle(0xffffff, alpha);
      g.beginPath();
      for (let i = 0; i < d.length; i++) {
        const a = (i / d.length) * Math.PI * 2;
        const dist = Math.min(d[i], radius * k);
        const x = ox + Math.cos(a) * dist, y = oy + Math.sin(a) * dist;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    }
  }
}
