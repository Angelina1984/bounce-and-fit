import Phaser from "phaser";
import {
  BRICK_COLS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_ROWS,
  BRICK_TINT_STAR,
  BRICK_TOP,
  BRICK_WIDTH,
  TEXTURE_KEY_TILE,
  BRICK_TINTS_BY_HITS,
} from "../constants";
import { POWER_UP_TINTS } from "../levelData";
import type { LevelDef } from "../levelData";

/**
 * Builds one level's brick grid into `bricks`, tagging each brick with
 * whichever star/hazard data it carries (read back in
 * PrototypeScene#handleBrickHit). Pulled out of PrototypeScene since it's a
 * self-contained "given a level and a group, populate it" step.
 */
export function buildBrickGrid(scene: Phaser.Scene, bricks: Phaser.Physics.Arcade.StaticGroup, level: LevelDef): void {
  const gridWidth = BRICK_COLS * BRICK_WIDTH + (BRICK_COLS - 1) * BRICK_GAP;
  const startX = (scene.scale.width - gridWidth) / 2 + BRICK_WIDTH / 2;
  const skip = new Set(level.skip.map(([row, col]) => `${row},${col}`));
  const starMap = new Map(level.starBricks.map((s) => [`${s.row},${s.col}`, s.powerUp]));
  const hazardMap = new Map(level.hazardBricks.map((h) => [`${h.row},${h.col}`, h.hazard]));
  const toughMap = new Map(level.toughBricks.map((t) => [`${t.row},${t.col}`, t.hits]));

  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const key = `${row},${col}`;
      if (skip.has(key)) continue;

      const starPowerUp = starMap.get(key);
      const hazard = hazardMap.get(key);
      const x = startX + col * (BRICK_WIDTH + BRICK_GAP);
      const y = BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP);

      // Tough bricks are scattered per level (validateLevels guarantees they
      // never share a cell with a star/hazard), and their hit count is shown
      // purely as a darker shade — no number. Each hit re-tints one step
      // lighter, so a 3-hit brick visibly becomes a 2-hit one and then an
      // ordinary brick. See PrototypeScene#handleBrickHit.
      const hits = toughMap.get(key) ?? 1;

      const brick = bricks.create(x, y, TEXTURE_KEY_TILE) as Phaser.Physics.Arcade.Image;
      brick.setDisplaySize(BRICK_WIDTH, BRICK_HEIGHT);
      brick.setTint(starPowerUp ? BRICK_TINT_STAR : hazard ? POWER_UP_TINTS[hazard] : BRICK_TINTS_BY_HITS[hits - 1]);
      brick.setData("starPowerUp", starPowerUp);
      brick.setData("hazard", hazard);
      if (hits > 1) brick.setData("hitsRemaining", hits);
      // Original cost, kept alongside the decrementing counter so scoring
      // can pay for what the brick cost rather than what's left of it.
      brick.setData("maxHits", hits);

      brick.refreshBody();
    }
  }
}
