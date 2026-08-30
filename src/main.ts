import Phaser from "phaser";
import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { TitleScene } from "./scenes/TitleScene";
import { PrototypeScene } from "./scenes/PrototypeScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND_COLOR,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, PrototypeScene],
});

// Dev/test-only hook so Playwright (tests/e2e) can drive and inspect scene
// state directly instead of fighting canvas-coordinate clicks for every
// assertion. import.meta.env.DEV is stripped by `vite build`, so this never
// reaches a production bundle.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
