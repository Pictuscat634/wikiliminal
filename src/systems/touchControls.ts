import Phaser from 'phaser';
import { DEPTH } from '../config';

const BASE_R = 36;    // joystick travel, in game pixels
const THUMB_R = 16;
const DEADZONE = 0.2;

export const isTouch = (scene: Phaser.Scene): boolean => scene.sys.game.device.input.touch;

/**
 * Floating virtual joystick: touch anywhere, drag to move, release to stop.
 * Touch only (mouse input is ignored). Read `x` / `y`, each in [-1, 1].
 */
export class TouchControls {
  x = 0;
  y = 0;
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud).setVisible(false);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (!p.wasTouch || this.pointerId !== null || over.length > 0) return; // over: a UI element was hit
    this.pointerId = p.id;
    this.ox = p.x; this.oy = p.y;
    this.gfx.setVisible(true);
    this.draw(0, 0);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    let dx = p.x - this.ox, dy = p.y - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > BASE_R) { dx = (dx / len) * BASE_R; dy = (dy / len) * BASE_R; }
    const mag = Math.min(len, BASE_R) / BASE_R;
    if (mag < DEADZONE) { this.x = 0; this.y = 0; }
    else { this.x = dx / BASE_R; this.y = dy / BASE_R; }
    this.draw(dx, dy);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.x = 0; this.y = 0;
    this.gfx.setVisible(false);
  }

  private draw(dx: number, dy: number): void {
    this.gfx.clear();
    this.gfx.lineStyle(2, 0xc9c6a0, 0.5).strokeCircle(this.ox, this.oy, BASE_R);
    this.gfx.fillStyle(0xc9c6a0, 0.35).fillCircle(this.ox + dx, this.oy + dy, THUMB_R);
  }
}
