import Phaser from 'phaser';
import { PLAYER_SPEED } from '../config';
import { TileGrid } from '../world/lobby';

type Dir = 'down' | 'up' | 'left' | 'right';

/** (x, y) is the point between the feet. Collision is a small feet box checked against the grid. */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  private dir: Dir = 'down';
  private walkT = 0;

  constructor(scene: Phaser.Scene, private grid: TileGrid, x: number, y: number) {
    this.x = x; this.y = y;
    this.sprite = scene.add.sprite(x, y, 'player', 'down_0').setOrigin(0.5, 28 / 32);
  }

  private blocked(x: number, y: number): boolean {
    const g = this.grid;
    return g.isSolidPx(x - 6, y - 8) || g.isSolidPx(x + 6, y - 8) || g.isSolidPx(x - 6, y) || g.isSolidPx(x + 6, y);
  }

  update(dt: number, ix: number, iy: number): void {
    const moving = ix !== 0 || iy !== 0;
    if (moving) {
      const len = Math.hypot(ix, iy);
      const vx = (ix / len) * PLAYER_SPEED * dt, vy = (iy / len) * PLAYER_SPEED * dt;
      if (!this.blocked(this.x + vx, this.y)) this.x += vx;   // axes resolved separately
      if (!this.blocked(this.x, this.y + vy)) this.y += vy;   // so the player slides along walls
      this.dir = Math.abs(ix) >= Math.abs(iy) ? (ix < 0 ? 'left' : 'right') : (iy < 0 ? 'up' : 'down');
      this.walkT += dt * 7;
    }
    const frame = moving ? Math.floor(this.walkT) % 2 : 0;
    this.sprite.setFrame(`${this.dir}_${frame}`);
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.sprite.setDepth(this.y);
  }
}
