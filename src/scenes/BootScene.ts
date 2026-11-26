import Phaser from 'phaser';
import { generatePlaceholderArt } from '../art/placeholderArt';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    generatePlaceholderArt(this);
    this.scene.start('Lobby');
  }
}
