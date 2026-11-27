import Phaser from 'phaser';
import { VIEW_W, VIEW_H, DEPTH } from '../config';

export interface MenuItem { label: string; onSelect: () => void }

const D = DEPTH.hud + 10;
const INK = '#c9c6a0';

/**
 * Hamburger button (top-right) that opens a simple panel. Works with mouse and touch.
 * Everything is screen-fixed. Check `isOpen` in update() to pause gameplay while it shows.
 * Esc also toggles it. A "Resume" entry is always added first.
 */
export class HamburgerMenu {
  isOpen = false;
  private panel: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, items: MenuItem[]) {
    // --- button ---
    const bx = VIEW_W - 24, by = 20;
    scene.add.rectangle(bx, by, 32, 28, 0x14171a, 0.6).setStrokeStyle(1, 0x6a6752)
      .setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggle());
    const icon = scene.add.graphics().setScrollFactor(0).setDepth(D + 1);
    icon.fillStyle(0xc9c6a0, 0.9);
    for (let i = 0; i < 3; i++) icon.fillRect(bx - 9, by - 8 + i * 6, 18, 3);

    // --- panel (hidden until opened) ---
    const all = [{ label: 'RESUME', onSelect: () => this.close() }, ...items];
    const w = 220, rowH = 34, h = 52 + all.length * rowH;
    const cx = VIEW_W / 2, cy = VIEW_H / 2, top = cy - h / 2;

    const dim = scene.add.rectangle(cx, cy, VIEW_W, VIEW_H, 0x000000, 0.7).setScrollFactor(0).setDepth(D + 2)
      .setInteractive().on('pointerdown', () => this.close()); // tap outside to close
    const box = scene.add.rectangle(cx, cy, w, h, 0x14171a, 0.95).setStrokeStyle(1, 0x6a6752)
      .setScrollFactor(0).setDepth(D + 3).setInteractive(); // swallows taps on the panel itself
    const title = scene.add.text(cx, top + 16, 'MENU', { fontFamily: 'monospace', fontSize: '10px', color: '#8d8a72' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(D + 4);
    this.panel.push(dim, box, title);

    all.forEach((item, i) => {
      const y = top + 48 + i * rowH;
      const row = scene.add.rectangle(cx, y, w - 28, 26, 0x2a2d28, 1).setStrokeStyle(1, 0x6a6752)
        .setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { if (this.isOpen) item.onSelect(); });
      const label = scene.add.text(cx, y, item.label, { fontFamily: 'monospace', fontSize: '11px', color: INK })
        .setOrigin(0.5).setScrollFactor(0).setDepth(D + 5);
      this.panel.push(row, label);
    });

    this.apply(false);
    scene.input.keyboard?.on('keydown-ESC', () => this.toggle());
  }

  toggle(): void { this.apply(!this.isOpen); }
  close(): void { this.apply(false); }

  private apply(open: boolean): void {
    this.isOpen = open;
    for (const obj of this.panel) {
      (obj as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(open);
      if (obj.input) obj.input.enabled = open; // hidden panels must not catch taps
    }
  }
}
