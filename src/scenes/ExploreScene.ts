import Phaser from 'phaser';
import { TILE, DEPTH, PLAYER_LIGHT_RADIUS, MAX_CHAIN_DEPTH, GENERATOR_VERSION, LAMP_RADIUS } from '../config';
import { planLevel, getChunk, isSolidAt, InfiniteGrid, LevelPlan, CHUNK_SIZE } from '../world/infiniteLevel';
import { LightingSystem } from '../systems/lighting';
import { Player } from '../entities/Player';
import { TouchControls, isTouch } from '../systems/touchControls';
import { HamburgerMenu } from '../systems/menu';
import { fetchArticle, WikiArticle } from '../net/wikipedia';
import { hashSeed } from '../systems/rng';

/** Where "back" leads: the Lobby, or the exact previous Level instance (same article + seed),
 * so retracing a chain regenerates each Level identically. */
export type BackTarget = 'lobby' | ExploreInitData;

export interface ExploreInitData {
  article: WikiArticle;
  seed: number;
  depth: number;        // link-hops from the entry article; gates how far forward chaining goes
  hasForward: boolean;
  backTarget: BackTarget;
}

export function seedFor(article: WikiArticle): number {
  return hashSeed(`${article.pageId}:${article.revisionId}:${GENERATOR_VERSION}`);
}

type Key = Phaser.Input.Keyboard.Key;
type Px = { x: number; y: number };
const NOCLIP_RADIUS = 14;
const ARRIVAL_GRACE_MS = 500;
const LOAD_RADIUS_CHUNKS = 1; // 3x3 chunks rendered around the player

export class ExploreScene extends Phaser.Scene {
  private levelData!: ExploreInitData;
  private plan!: LevelPlan;
  private grid!: InfiniteGrid;
  private player!: Player;
  private lighting!: LightingSystem;
  private touch!: TouchControls;
  private menu!: HamburgerMenu;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & { W: Key; A: Key; S: Key; D: Key };
  private status!: Phaser.GameObjects.Text;
  private signLabels: { x: number; y: number; text: string; obj: Phaser.GameObjects.Text }[] = [];
  private transitioning = false;
  private arrivedAt = 0;
  private backPx: Px | null = null;
  private forwardPx: Px | null = null;

  private loadedChunks = new Map<string, Phaser.GameObjects.Image[]>();
  private registeredLamps = new Set<string>();
  private lastChunkKey = '';

  constructor() { super('Explore'); }

  init(initData: ExploreInitData): void {
    this.levelData = initData;
    this.transitioning = false;
    this.signLabels = [];
    this.loadedChunks = new Map();
    this.registeredLamps = new Set();
    this.lastChunkKey = '';
  }

  create(): void {
    this.plan = planLevel(this.levelData.article, this.levelData.seed, this.levelData.hasForward);
    this.grid = new InfiniteGrid(this.plan);
    this.lighting = new LightingSystem(this, this.grid);

    const center = (p: { x: number; y: number }): Px => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
    this.backPx = center(this.plan.backSpot);
    this.forwardPx = this.plan.forwardSpot ? center(this.plan.forwardSpot) : null;

    this.player = new Player(this, this.grid, (this.plan.spawn.x + 0.5) * TILE, (this.plan.spawn.y + 1) * TILE - 6);
    this.refreshChunks();

    for (const spot of [this.backPx, this.forwardPx]) {
      if (spot) this.add.image(spot.x, spot.y, 'noclip').setDepth(spot.y + TILE);
    }
    for (const s of this.plan.signs) {
      const p = center(s.pos);
      const label = this.add.text(p.x, p.y - 20, s.text, {
        fontFamily: 'monospace', fontSize: '9px', color: '#d8d4ad', backgroundColor: '#14171099',
        padding: { x: 3, y: 2 }, wordWrap: { width: 110 },
      }).setOrigin(0.5, 1).setDepth(DEPTH.hud - 10).setVisible(false);
      this.signLabels.push({ x: p.x, y: p.y, text: s.text, obj: label });
    }

    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.15, 0.15); // no setBounds: the Level has no edges
    cam.roundPixels = true;

    const kb = this.input.keyboard!;
    this.keys = { ...kb.createCursorKeys(), ...(kb.addKeys('W,A,S,D') as { W: Key; A: Key; S: Key; D: Key }) };
    this.touch = new TouchControls(this);

    const style = { fontFamily: 'monospace', fontSize: '10px', color: '#c9c6a0' };
    this.add.text(8, 6, `LEVEL: ${this.levelData.article.title}`, style).setScrollFactor(0).setDepth(DEPTH.hud);
    if (this.levelData.article.offline) {
      this.add.text(8, 20, '(offline sample data)', { ...style, fontSize: '8px', color: '#6a6752' })
        .setScrollFactor(0).setDepth(DEPTH.hud);
    }
    this.status = this.add.text(8, 346, this.hintText(), { ...style, color: '#8d8a72' })
      .setScrollFactor(0).setDepth(DEPTH.hud);

    this.menu = new HamburgerMenu(this, [{ label: 'RETURN TO LOBBY', onSelect: () => this.warpToLobby() }]);

    this.arrivedAt = this.time.now;
  }

  update(_t: number, delta: number): void {
    if (this.transitioning || this.menu.isOpen) return; // menu open = paused
    const dt = Math.min(delta / 1000, 0.05);
    const k = this.keys;
    let ix = (k.D.isDown || k.right.isDown ? 1 : 0) - (k.A.isDown || k.left.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.down.isDown ? 1 : 0) - (k.W.isDown || k.up.isDown ? 1 : 0);
    if (!ix && !iy) { ix = this.touch.x; iy = this.touch.y; } // touch joystick when no keys held
    this.player.update(dt, ix, iy);
    this.refreshChunks();
    this.lighting.update(this.player.x, this.player.y - 4, PLAYER_LIGHT_RADIUS);

    let nearSign = '';
    for (const s of this.signLabels) {
      const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) < 40;
      s.obj.setVisible(near);
      if (near) nearSign = s.text;
    }
    this.status.setText(nearSign || this.hintText());

    if (this.time.now - this.arrivedAt < ARRIVAL_GRACE_MS) return;
    if (this.backPx && this.near(this.backPx)) this.goBack();
    else if (this.forwardPx && this.near(this.forwardPx)) this.goForward();
  }

  private hintText(): string {
    return `${isTouch(this) ? 'Drag to move' : 'WASD to move'} — walk onto a glow to no-clip`;
  }

  private near(spot: Px): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, spot.x, spot.y) < NOCLIP_RADIUS;
  }

  private warpToLobby(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.scene.start('Lobby');
  }

  private goBack(): void {
    this.transitioning = true;
    const target = this.levelData.backTarget;
    if (target === 'lobby') this.scene.start('Lobby');
    else this.scene.start('Explore', target);
  }

  private async goForward(): Promise<void> {
    this.transitioning = true;
    this.status.setText('No-clipping...');
    const a = this.levelData.article;
    const nextTitle = a.links.find(l => l !== a.title) ?? a.title;
    try {
      const nextArticle = await fetchArticle(nextTitle);
      const nextDepth = this.levelData.depth + 1;
      const nextData: ExploreInitData = {
        article: nextArticle,
        seed: seedFor(nextArticle),
        depth: nextDepth,
        hasForward: nextDepth < MAX_CHAIN_DEPTH && nextArticle.links.some(l => l !== nextArticle.title),
        backTarget: this.levelData,
      };
      this.scene.start('Explore', nextData);
    } catch {
      this.status.setText('No-clip failed — the passage did not open.');
      this.transitioning = false;
    }
  }

  /** Keeps a ring of chunks around the player rendered. Tile data stays cached forever;
   * only the sprites of chunks left behind are destroyed. */
  private refreshChunks(): void {
    const pcx = Math.floor(Math.floor(this.player.x / TILE) / CHUNK_SIZE);
    const pcy = Math.floor(Math.floor(this.player.y / TILE) / CHUNK_SIZE);
    const key = `${pcx},${pcy}`;
    if (key === this.lastChunkKey) return;
    this.lastChunkKey = key;

    const needed = new Set<string>();
    for (let dy = -LOAD_RADIUS_CHUNKS; dy <= LOAD_RADIUS_CHUNKS; dy++) {
      for (let dx = -LOAD_RADIUS_CHUNKS; dx <= LOAD_RADIUS_CHUNKS; dx++) {
        const ck = `${pcx + dx},${pcy + dy}`;
        needed.add(ck);
        if (!this.loadedChunks.has(ck)) this.loadChunk(pcx + dx, pcy + dy, ck);
      }
    }
    for (const [ck, imgs] of this.loadedChunks) {
      if (needed.has(ck)) continue;
      imgs.forEach(img => img.destroy());
      this.loadedChunks.delete(ck);
    }
  }

  private loadChunk(cx: number, cy: number, key: string): void {
    const chunk = getChunk(this.plan, cx, cy);
    const prefix = this.plan.palette === 'default' ? '' : `${this.plan.palette}_`;
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const gx = cx * CHUNK_SIZE + lx, gy = cy * CHUNK_SIZE + ly;
        const x = gx * TILE, y = gy * TILE;
        const tex = chunk.rows[ly][lx] === '#'
          ? (isSolidAt(this.plan, gx, gy + 1) ? `${prefix}wall_top` : `${prefix}wall_front`)
          : `${prefix}floor${Math.abs(gx * 7 + gy * 13) % 3}`;
        imgs.push(this.add.image(x, y, tex).setOrigin(0));
      }
    }
    for (const lamp of chunk.lamps) {
      imgs.push(this.add.image((lamp.x + 0.5) * TILE, (lamp.y + 0.5) * TILE - 6, 'lamp').setDepth(DEPTH.lamps));
      const lk = `${lamp.x},${lamp.y}`;
      if (this.registeredLamps.has(lk)) continue; // the light itself is registered once, ever
      this.registeredLamps.add(lk);
      this.lighting.addFixedLight({
        x: (lamp.x + 0.5) * TILE, y: (lamp.y + 0.5) * TILE,
        radius: LAMP_RADIUS, flicker: Math.abs(lamp.x + lamp.y) % 4 === 0,
      });
    }
    this.loadedChunks.set(key, imgs);
  }
}
