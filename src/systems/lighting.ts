import Phaser from 'phaser';
import { VIEW_W, VIEW_H, TILE, DEPTH } from '../config';
import { SolidGrid } from '../world/solidGrid';
import { LightDef } from '../world/lobby';

const RAYS = window.matchMedia?.('(pointer: coarse)').matches ? 120 : 200; // fewer rays on phones
const STEP = 2;           // ray-march step in px; walls are 32px thick so nothing is skipped
const WALL_BLEED = 10;    // light spills slightly into the wall so lit wall faces are visible
const RINGS = [0.45, 0.7, 0.88, 1]; // stacked polygons approximate a radial falloff
const DARK_COLOR = 0x04070a;
const DARK_ALPHA = 0.97;
const FIXED_ALPHA = 0.3;  // per-ring strength of lamps (lower = dimmer)
const PLAYER_ALPHA = 0.2; // per-ring strength of the player's light
const MARGIN = TILE * 4;  // extra border so lights just off-screen still erase cleanly

/** Distance to the first solid tile for each of N evenly spaced rays, capped at `radius`. */
export function castVisibility(grid: SolidGrid, ox: number, oy: number, radius: number): Float32Array {
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
 * Darkness layer: a screen-fixed RenderTexture (viewport + margin), refilled every frame.
 * Each light's wall-occluded polygon is baked once centered on its own origin, then stamped
 * at its current position relative to the camera. Nothing depends on world size, so the
 * same system lights the small Lobby and unbounded Levels.
 */
export class LightingSystem {
  private rt: Phaser.GameObjects.RenderTexture;
  private playerG: Phaser.GameObjects.Graphics;
  private fixed: Fixed[] = []; // TODO: lights are never pruned when their chunk unloads

  constructor(private scene: Phaser.Scene, private grid: SolidGrid) {
    this.rt = scene.add
      .renderTexture(-MARGIN, -MARGIN, VIEW_W + MARGIN * 2, VIEW_H + MARGIN * 2)
      .setOrigin(0, 0)
      .setDepth(DEPTH.darkness)
      .setScrollFactor(0);
    this.playerG = scene.make.graphics({}, false);
  }

  addFixedLight(def: LightDef): void {
    const g = this.scene.make.graphics({}, false);
    const d = castVisibility(this.grid, def.x, def.y, def.radius); // raycast uses the real world position
    this.drawRings(g, d, def.radius, FIXED_ALPHA);
    this.fixed.push({ def, g, flickerLeft: 0 });
  }

  update(px: number, py: number, playerRadius: number): void {
    const rt = this.rt;
    rt.clear();
    rt.fill(DARK_COLOR, DARK_ALPHA);

    const cam = this.scene.cameras.main;
    const ox = cam.scrollX - MARGIN, oy = cam.scrollY - MARGIN; // world position of the texture's top-left
    const v = cam.worldView;

    for (const f of this.fixed) {
      const { x, y, radius } = f.def;
      if (x + radius < v.x || x - radius > v.right || y + radius < v.y || y - radius > v.bottom) continue;
      if (f.def.flicker) {
        if (f.flickerLeft > 0) { f.flickerLeft--; f.g.setAlpha(0.3 + Math.random() * 0.5); }
        else { f.g.setAlpha(1); if (Math.random() < 0.004) f.flickerLeft = 4 + Math.floor(Math.random() * 8); }
      }
      rt.erase(f.g, x - ox, y - oy);
    }

    this.drawRings(this.playerG, castVisibility(this.grid, px, py, playerRadius), playerRadius, PLAYER_ALPHA);
    rt.erase(this.playerG, px - ox, py - oy);
  }

  /** Polygons are drawn around local (0,0); the caller positions them via rt.erase(g, x, y). */
  private drawRings(g: Phaser.GameObjects.Graphics, d: Float32Array, radius: number, alpha: number): void {
    g.clear();
    for (const k of RINGS) {
      g.fillStyle(0xffffff, alpha);
      g.beginPath();
      for (let i = 0; i < d.length; i++) {
        const a = (i / d.length) * Math.PI * 2;
        const dist = Math.min(d[i], radius * k);
        const x = Math.cos(a) * dist, y = Math.sin(a) * dist;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    }
  }
}
