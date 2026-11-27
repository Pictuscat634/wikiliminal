import Phaser from 'phaser';
import { TILE } from '../config';
import { mulberry32 } from '../systems/rng';

/**
 * All art is generated here as placeholder pixel art. To replace it, load real images in
 * BootScene.preload() under the same texture keys: floor0-2, wall_front, wall_top, terminal, lamp,
 * noclip, and 'player' (frames down_0, down_1, up_0 ... right_1). Levels generated with a
 * non-default palette (see world/infiniteLevel.ts) look for 'aqua_floor0' etc. the same way.
 */
type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const rng = mulberry32;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  const t = scene.textures.createCanvas(key, w, h)!;
  draw(t.getContext());
  t.refresh();
  return t;
}

function drawPlayer(c: Ctx, ox: number, dir: string, f: number) {
  rect(c, 'rgba(0,0,0,0.35)', ox + 9, 27, 14, 3);
  rect(c, '#4a4838', ox + 11, 22, 4, f === 0 ? 6 : 4);          // legs, alternating stride
  rect(c, '#4a4838', ox + 17, 22, 4, f === 0 ? 4 : 6);
  if (dir === 'left') rect(c, '#8a7c3c', ox + 19, 14, 5, 8);    // backpack (side views)
  if (dir === 'right') rect(c, '#8a7c3c', ox + 8, 14, 5, 8);
  rect(c, '#c9b45a', ox + 10, 12, 12, 11);                       // protective suit
  rect(c, '#d9d7c8', ox + 10, 18, 12, 1);                        // reflective band
  if (dir === 'up' || dir === 'down') { rect(c, '#b39f48', ox + 8, 13, 2, 8); rect(c, '#b39f48', ox + 22, 13, 2, 8); }
  else rect(c, '#b39f48', ox + 14, 13, 4, 8);
  if (dir === 'up') rect(c, '#8a7c3c', ox + 11, 13, 10, 9);
  rect(c, '#d6d0ae', ox + 11, 3, 10, 10);                        // helmet
  if (dir === 'down') { rect(c, '#27343d', ox + 12, 6, 8, 4); rect(c, '#6f8c9a', ox + 13, 7, 2, 1); rect(c, '#f4efb0', ox + 7, 20, 2, 2); }
  if (dir === 'left') rect(c, '#27343d', ox + 11, 6, 5, 4);
  if (dir === 'right') rect(c, '#27343d', ox + 16, 6, 5, 4);
  if (dir === 'up') rect(c, '#b9b393', ox + 13, 5, 6, 2);
}

interface ArtPalette {
  floors: [string, string, string];
  floorGrout: string; floorHighlight: string; floorSpeckleA: string; floorSpeckleB: string;
  wallBase: string; wallTopEdge: string; wallMid: string; wallSeam: string;
  wallBaseboard: string; wallBaseboardDark: string; wallTopBase: string; wallTopInner: string;
}

// Identical to Phase 1's hardcoded colors, so the default (no-prefix) texture set this
// produces is pixel-for-pixel the same as before.
const DEFAULT_PALETTE: ArtPalette = {
  floors: ['#8b8870', '#86836b', '#908d75'],
  floorGrout: '#6c6955', floorHighlight: '#9a977f', floorSpeckleA: '#7a7761', floorSpeckleB: '#999680',
  wallBase: '#566456', wallTopEdge: '#8c9684', wallMid: '#6f7c6d', wallSeam: '#4a574b',
  wallBaseboard: '#46524a', wallBaseboardDark: '#2f3832', wallTopBase: '#3b453e', wallTopInner: '#4a564c',
};

// Levels whose article leans toward water/ocean subjects (see infiniteLevel.ts's palette pick).
const AQUA_PALETTE: ArtPalette = {
  floors: ['#4d6b76', '#4a6670', '#51707a'],
  floorGrout: '#334a52', floorHighlight: '#6b8e98', floorSpeckleA: '#3e5862', floorSpeckleB: '#5c7e88',
  wallBase: '#2f4a52', wallTopEdge: '#5c7e86', wallMid: '#3c5b63', wallSeam: '#24383e',
  wallBaseboard: '#213438', wallBaseboardDark: '#141f22', wallTopBase: '#1f3034', wallTopInner: '#2a3f44',
};

// Levels whose article leans industrial (factories, plants, machinery).
const INDUSTRIAL_PALETTE: ArtPalette = {
  floors: ['#6b6558', '#655f53', '#6f6a5c'],
  floorGrout: '#454038', floorHighlight: '#827c6a', floorSpeckleA: '#56503f', floorSpeckleB: '#766f5c',
  wallBase: '#4a443a', wallTopEdge: '#746b55', wallMid: '#5a5345', wallSeam: '#332e26',
  wallBaseboard: '#2c2820', wallBaseboardDark: '#1a1712', wallTopBase: '#26221b', wallTopInner: '#332e26',
};

function generateFloorWallSet(scene: Phaser.Scene, prefix: string, p: ArtPalette): void {
  p.floors.forEach((base, v) => tex(scene, `${prefix}floor${v}`, TILE, TILE, c => {
    const r = rng(100 + v + prefix.length * 37);
    rect(c, base, 0, 0, TILE, TILE);
    rect(c, p.floorGrout, 0, TILE - 1, TILE, 1);
    rect(c, p.floorGrout, TILE - 1, 0, 1, TILE);
    rect(c, p.floorHighlight, 0, 0, TILE - 1, 1);
    for (let i = 0; i < 14; i++) rect(c, r() > 0.5 ? p.floorSpeckleA : p.floorSpeckleB, (r() * TILE) | 0, (r() * TILE) | 0, 2, 1);
  }));

  tex(scene, `${prefix}wall_front`, TILE, TILE, c => {
    rect(c, p.wallBase, 0, 0, TILE, TILE);
    rect(c, p.wallTopEdge, 0, 0, TILE, 5);          // lit top edge
    rect(c, p.wallMid, 0, 5, TILE, 2);
    rect(c, p.wallSeam, 15, 7, 1, TILE - 13);       // panel seam
    rect(c, p.wallBaseboard, 0, TILE - 6, TILE, 4);
    rect(c, p.wallBaseboardDark, 0, TILE - 2, TILE, 2);
  });

  tex(scene, `${prefix}wall_top`, TILE, TILE, c => {
    rect(c, p.wallTopBase, 0, 0, TILE, TILE);
    rect(c, p.wallTopInner, 2, 2, TILE - 4, TILE - 4);
  });
}

export function generatePlaceholderArt(scene: Phaser.Scene): void {
  generateFloorWallSet(scene, '', DEFAULT_PALETTE);
  generateFloorWallSet(scene, 'aqua_', AQUA_PALETTE);
  generateFloorWallSet(scene, 'industrial_', INDUSTRIAL_PALETTE);

  // A pale, faintly unnatural glow marking a No-clip point - distinct from the terminal's
  // steady green, meant to read as "not quite part of this place."
  tex(scene, 'noclip', TILE, TILE, c => {
    rect(c, 'rgba(0,0,0,0.25)', 2, TILE - 6, TILE - 4, 4);
    rect(c, '#caa6e0', 6, 6, TILE - 12, TILE - 12);
    rect(c, '#8a5fae', 9, 9, TILE - 18, TILE - 18);
    rect(c, '#efe0f7', 13, 13, TILE - 26, TILE - 26);
  });

  tex(scene, 'terminal', TILE, TILE, c => {
    rect(c, 'rgba(0,0,0,0.3)', 3, 27, 26, 4);
    rect(c, '#2f3436', 4, 6, 24, 22);
    rect(c, '#1c2022', 7, 9, 18, 11);
    rect(c, '#6fbf9a', 8, 10, 16, 9);
    for (let y = 11; y < 19; y += 2) rect(c, '#58a583', 8, y, 16, 1);
    rect(c, '#454b4d', 6, 22, 20, 4);
  });

  tex(scene, 'lamp', 24, 8, c => {
    rect(c, '#2a2d28', 0, 0, 24, 8);
    rect(c, '#e9e8c9', 2, 2, 20, 4);
    rect(c, '#ffffff', 4, 3, 16, 2);
  });

  const dirs = ['down', 'up', 'left', 'right'];
  const sheet = tex(scene, 'player', TILE * 8, TILE, () => {});
  const c = sheet.getContext();
  dirs.forEach((d, i) => [0, 1].forEach(f => {
    const ox = (i * 2 + f) * TILE;
    drawPlayer(c, ox, d, f);
    sheet.add(`${d}_${f}`, 0, ox, 0, TILE, TILE);
  }));
  sheet.refresh();
}
