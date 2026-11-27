import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from './config';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ExploreScene } from './scenes/ExploreScene';

document.addEventListener('gesturestart', e => e.preventDefault()); // block iOS pinch-zoom

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#050709',
  input: { activePointers: 3 },
  disableContextMenu: true,
  pixelArt: true,      // nearest-neighbour scaling
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, LobbyScene, ExploreScene],
});
