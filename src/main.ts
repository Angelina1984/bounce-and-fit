import Phaser from "phaser";
import { BACKGROUND_COLOR, GAME_WIDTH, MAX_GAME_HEIGHT, MIN_GAME_HEIGHT } from "./constants";
import { gameHeightForViewport } from "./gameplayMath";
import { TitleScene } from "./scenes/TitleScene";
import { PrototypeScene } from "./scenes/PrototypeScene";

function startGame(): Phaser.Game {
  return new Phaser.Game({
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
      // Centering is index.html's job (#app is a flex centering box), so
      // Phaser must not also do it. CENTER_BOTH sets a margin-left of half
      // the gutter on the canvas, and flexbox then centers the canvas
      // *plus that margin* — the two compound and the game sits visibly
      // right of center. One owner per layout concern.
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [TitleScene, PrototypeScene],
  });
}

/**
 * Wait for the webfont before booting. Phaser measures and caches each Text
 * object's metrics when it's created; if the font arrives after that, the
 * text keeps its fallback layout (and Phaser has no reflow). `document.fonts`
 * is guarded because the API is absent in some environments, and a font that
 * never loads must not block the game from starting at all.
 */
async function fontsReady(): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await document.fonts.load('600 20px "Fredoka"');
    await document.fonts.ready;
  } catch {
    // Offline or blocked — start anyway on the fallback stack.
  }
}

void fontsReady().then(() => {
  const game = startGame();
  // Dev/test-only hook so Playwright (tests/e2e) can drive and inspect scene
  // state directly instead of fighting canvas-coordinate clicks for every
  // assertion. import.meta.env.DEV is stripped by `vite build`, so this never
  // reaches a production bundle.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
});
