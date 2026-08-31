import Phaser from "phaser";
import { BACKGROUND_COLOR, GAME_WIDTH, MAX_GAME_HEIGHT, MIN_GAME_HEIGHT } from "./constants";
import { gameHeightForViewport } from "./gameplayMath";
import { TitleScene } from "./scenes/TitleScene";
import { PrototypeScene } from "./scenes/PrototypeScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  // Matched to the viewport's aspect so FIT scales it edge-to-edge on a
  // phone rather than leaving letterbox bands (a 480x800 canvas in a
  // 440x956 viewport wastes 223px of screen). Read once at boot — the
  // layout doesn't reflow on rotate/resize, which is fine for a portrait
  // game, but is the thing to revisit if landscape ever matters.
  height: gameHeightForViewport(window.innerWidth, window.innerHeight, GAME_WIDTH, MIN_GAME_HEIGHT, MAX_GAME_HEIGHT),
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
