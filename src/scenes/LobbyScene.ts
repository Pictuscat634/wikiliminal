import Phaser from 'phaser';
import { TILE, DEPTH, PLAYER_LIGHT_RADIUS, ENTRY_ARTICLE_TITLE, MAX_CHAIN_DEPTH } from '../config';
import { TileGrid, LOBBY_ROWS } from '../world/lobby';
import { findMarker } from '../world/markers';
import { LightingSystem } from '../systems/lighting';
import { Player } from '../entities/Player';
import { loadJSON, saveJSON } from '../systems/storage';
import { fetchArticle } from '../net/wikipedia';
import { ExploreInitData, seedFor } from './ExploreScene';

type Key = Phaser.Input.Keyboard.Key;

interface PlayerSave { version: number; x: number; y: number }
const SAVE_KEY = 'player';
const SAVE_VERSION = 1;
const NOCLIP_RADIUS = 14;

export class LobbyScene extends Phaser.Scene {
  private player!: Player;
  private lighting!: LightingSystem;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & { W: Key; A: Key; S: Key; D: Key };
  private hint!: Phaser.GameObjects.Text;
  private hintFading = false;
  private status!: Phaser.GameObjects.Text;
  private noclipSpot: { x: number; y: number } | null = null;
  private transitioning = false;

  constructor() { super('Lobby'); }

  create(): void {
    this.transitioning = false;
    const grid = new TileGrid(LOBBY_ROWS);
    this.renderMap(grid);
    this.noclipSpot = findMarker(LOBBY_ROWS, 'N');

    // Resume where the player left off, if a save exists and looks valid; otherwise spawn normally.
    const saved = loadJSON<PlayerSave>(SAVE_KEY, { version: SAVE_VERSION, x: grid.spawn.x, y: grid.spawn.y });
    const start = saved.version === SAVE_VERSION && !grid.isSolidPx(saved.x, saved.y) ? saved : grid.spawn;

    this.player = new Player(this, grid, start.x, start.y);
    this.lighting = new LightingSystem(this, grid);
    grid.lights.forEach(l => this.lighting.addFixedLight(l));
    grid.lamps.forEach(l => this.add.image(l.x, l.y, 'lamp').setDepth(DEPTH.lamps));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, grid.w * TILE, grid.h * TILE);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.roundPixels = true;

    const kb = this.input.keyboard!;
    this.keys = { ...kb.createCursorKeys(), ...(kb.addKeys('W,A,S,D') as { W: Key; A: Key; S: Key; D: Key }) };

    const style = { fontFamily: 'monospace', fontSize: '10px', color: '#c9c6a0' };
    this.add.text(8, 6, 'LOBBY', style).setScrollFactor(0).setDepth(DEPTH.hud);
    this.hint = this.add.text(8, 346, 'WASD / arrow keys to move', { ...style, color: '#8d8a72' }).setScrollFactor(0).setDepth(DEPTH.hud);
    this.status = this.add.text(8, 334, '', { ...style, color: '#b7a8c9' }).setScrollFactor(0).setDepth(DEPTH.hud);

    // Autosave periodically, and on tab hide / close, so progress survives a reload.
    // Position is the only thing worth saving in Phase 1; later phases add inventory, SAN, etc. here.
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.savePlayer() });
    const onHide = () => this.savePlayer();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      this.savePlayer();
    });
  }

  private savePlayer(): void {
    saveJSON<PlayerSave>(SAVE_KEY, { version: SAVE_VERSION, x: this.player.x, y: this.player.y });
  }

  update(_t: number, delta: number): void {
    if (this.transitioning) return;
    const dt = Math.min(delta / 1000, 0.05);
    const k = this.keys;
    const ix = (k.D.isDown || k.right.isDown ? 1 : 0) - (k.A.isDown || k.left.isDown ? 1 : 0);
    const iy = (k.S.isDown || k.down.isDown ? 1 : 0) - (k.W.isDown || k.up.isDown ? 1 : 0);
    this.player.update(dt, ix, iy);
    if ((ix || iy) && !this.hintFading) {
      this.hintFading = true;
      this.tweens.add({ targets: this.hint, alpha: 0, delay: 4000, duration: 1500 });
    }
    // Light origin sits inside the feet box's tile, so it is never embedded in a wall.
    this.lighting.update(this.player.x, this.player.y - 4, PLAYER_LIGHT_RADIUS);

    if (this.noclipSpot && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.noclipSpot.x, this.noclipSpot.y) < NOCLIP_RADIUS) {
      this.enterWikipedia();
    }
  }

  /** Fetches the Phase 2 entry article and hands off to ExploreScene. There's no article
   * picker yet (that's the Phase 5 Level Management Terminal), so this always leads to
   * the same fixed starting article for now. */
  private async enterWikipedia(): Promise<void> {
    this.transitioning = true;
    this.status.setText('Fetching entry point...');
    try {
      const article = await fetchArticle(ENTRY_ARTICLE_TITLE);
      const data: ExploreInitData = {
        article,
        seed: seedFor(article),
        depth: 0,
        hasForward: MAX_CHAIN_DEPTH > 0 && article.links.some(l => l !== article.title),
        backTarget: 'lobby',
      };
      this.scene.start('Explore', data);
    } catch {
      this.status.setText('No-clip failed — try again.');
      this.transitioning = false;
    }
  }

  private renderMap(grid: TileGrid): void {
    for (let ty = 0; ty < grid.h; ty++) {
      for (let tx = 0; tx < grid.w; tx++) {
        const c = grid.at(tx, ty);
        const x = tx * TILE, y = ty * TILE;
        if (c === ' ') continue;
        if (c === '#') {
          this.add.image(x, y, grid.at(tx, ty + 1) === '#' ? 'wall_top' : 'wall_front').setOrigin(0);
          continue;
        }
        this.add.image(x, y, `floor${(tx * 7 + ty * 13) % 3}`).setOrigin(0);
        if (c === 'T') this.add.image(x, y, 'terminal').setOrigin(0).setDepth(y + TILE - 4);
        if (c === 'N') this.add.image(x + TILE / 2, y + TILE / 2, 'noclip').setDepth(y + TILE - 4);
      }
    }
  }
}
