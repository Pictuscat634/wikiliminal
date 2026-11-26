import Phaser from 'phaser';
import { TILE, DEPTH, PLAYER_LIGHT_RADIUS, MAX_CHAIN_DEPTH, GENERATOR_VERSION } from '../config';
import { generateLevel, GeneratedLevel } from '../world/levelgen';
import { LightingSystem } from '../systems/lighting';
import { Player } from '../entities/Player';
import { fetchArticle, WikiArticle } from '../net/wikipedia';
import { hashSeed } from '../systems/rng';

/** Where "back" leads: either to the Lobby, or to the exact previous Level instance
 * (same article + seed), so retracing a chain of Levels regenerates them identically. */
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
const NOCLIP_RADIUS = 14;
const ARRIVAL_GRACE_MS = 500; // ignore no-clip triggers briefly after arriving, in case of overlap

export class ExploreScene extends Phaser.Scene {
  private levelData!: ExploreInitData;
  private level!: GeneratedLevel;
  private player!: Player;
  private lighting!: LightingSystem;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & { W: Key; A: Key; S: Key; D: Key };
  private status!: Phaser.GameObjects.Text;
  private signLabels: { x: number; y: number; text: string; obj: Phaser.GameObjects.Text }[] = [];
  private transitioning = false;
  private arrivedAt = 0;

  constructor() { super('Explore'); }

  init(initData: ExploreInitData): void {
    this.levelData = initData;
    this.transitioning = false;
    this.signLabels = [];
  }

  create(): void {
    this.level = generateLevel(this.levelData.article, this.levelData.seed, this.levelData.hasForward);
    this.renderMap(this.level);

    this.player = new Player(this, this.level.grid, this.level.spawn.x, this.level.spawn.y);
    this.lighting = new LightingSystem(this, this.level.grid);
    this.level.grid.lights.forEach(l => this.lighting.addFixedLight(l));
    this.level.grid.lamps.forEach(l => this.add.image(l.x, l.y, 'lamp').setDepth(DEPTH.lamps));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.grid.w * TILE, this.level.grid.h * TILE);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.roundPixels = true;

    const kb = this.input.keyboard!;
    this.keys = { ...kb.createCursorKeys(), ...(kb.addKeys('W,A,S,D') as { W: Key; A: Key; S: Key; D: Key }) };

    const style = { fontFamily: 'monospace', fontSize: '10px', color: '#c9c6a0' };
    this.add.text(8, 6, `LEVEL: ${this.levelData.article.title}`, style).setScrollFactor(0).setDepth(DEPTH.hud);
    if (this.levelData.article.offline) {
      this.add.text(8, 20, '(offline sample data)', { ...style, fontSize: '8px', color: '#6a6752' })
        .setScrollFactor(0).setDepth(DEPTH.hud);
    }
    this.status = this.add.text(8, 346, this.hintText(), { ...style, color: '#8d8a72' })
      .setScrollFactor(0).setDepth(DEPTH.hud);

    this.arrivedAt = this.time.now;
  }

  update(_t: number, delta: number): void {
    if (this.transitioning) return;
    const dt = Math.min(delta / 1000, 0.05);
    const k = this.keys;
    const ix = (k.D.isDown || k.right.isDown ? 1 : 0) - (k.A.isDown || k.left.isDown ? 1 : 0);
    const iy = (k.S.isDown || k.down.isDown ? 1 : 0) - (k.W.isDown || k.up.isDown ? 1 : 0);
    this.player.update(dt, ix, iy);
    this.lighting.update(this.player.x, this.player.y - 4, PLAYER_LIGHT_RADIUS);

    let nearSign = '';
    for (const s of this.signLabels) {
      const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) < 40;
      s.obj.setVisible(near);
      if (near) nearSign = s.text;
    }
    this.status.setText(nearSign || this.hintText());

    if (this.time.now - this.arrivedAt < ARRIVAL_GRACE_MS) return;
    if (this.level.backSpot && this.near(this.level.backSpot)) this.goBack();
    else if (this.level.forwardSpot && this.near(this.level.forwardSpot)) this.goForward();
  }

  private hintText(): string {
    const parts = ['WASD to move'];
    if (this.level.backSpot) parts.push('walk onto a glow to no-clip');
    return parts.join(' — ');
  }

  private near(spot: { x: number; y: number }): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, spot.x, spot.y) < NOCLIP_RADIUS;
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
    const nextTitle = this.levelData.article.links.find(l => l !== this.levelData.article.title) ?? this.levelData.article.title;
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

  private renderMap(level: GeneratedLevel): void {
    const grid = level.grid;
    const prefix = level.palette === 'default' ? '' : `${level.palette}_`;
    for (let ty = 0; ty < grid.h; ty++) {
      for (let tx = 0; tx < grid.w; tx++) {
        const c = grid.at(tx, ty);
        const x = tx * TILE, y = ty * TILE;
        if (c === ' ') continue;
        if (c === '#') {
          this.add.image(x, y, grid.at(tx, ty + 1) === '#' ? `${prefix}wall_top` : `${prefix}wall_front`).setOrigin(0);
          continue;
        }
        this.add.image(x, y, `${prefix}floor${(tx * 7 + ty * 13) % 3}`).setOrigin(0);
        if (c === 'B' || c === 'F') this.add.image(x + TILE / 2, y + TILE / 2, 'noclip').setDepth(y + TILE - 4);
      }
    }
    for (const s of level.signs) {
      const label = this.add.text(s.x, s.y - 20, s.text, {
        fontFamily: 'monospace', fontSize: '9px', color: '#d8d4ad', backgroundColor: '#14171099',
        padding: { x: 3, y: 2 }, wordWrap: { width: 110 },
      }).setOrigin(0.5, 1).setDepth(DEPTH.hud - 10).setVisible(false);
      this.signLabels.push({ x: s.x, y: s.y, text: s.text, obj: label });
    }
  }
}
