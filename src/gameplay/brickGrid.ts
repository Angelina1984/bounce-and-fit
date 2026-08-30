import Phaser from "phaser";
import {
  BRICK_COLS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_ROWS,
  BRICK_TINT_NORMAL,
  BRICK_TINT_STAR,
  BRICK_TOP,
  BRICK_WIDTH,
  TEXTURE_KEY_PIXEL,
  TOUGH_BRICK_HITS,
  TOUGH_BRICK_LABEL_COLOR,
  TOUGH_BRICK_ROWS,
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

  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const key = `${row},${col}`;
      if (skip.has(key)) continue;

      const starPowerUp = starMap.get(key);
      const hazard = hazardMap.get(key);
      const x = startX + col * (BRICK_WIDTH + BRICK_GAP);
      const y = BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP);

      const brick = bricks.create(x, y, TEXTURE_KEY_PIXEL) as Phaser.Physics.Arcade.Image;
      brick.setDisplaySize(BRICK_WIDTH, BRICK_HEIGHT);
      brick.setTint(starPowerUp ? BRICK_TINT_STAR : hazard ? POWER_UP_TINTS[hazard] : BRICK_TINT_NORMAL);
      brick.setData("starPowerUp", starPowerUp);
      brick.setData("hazard", hazard);

      // Tough brick: top row(s) take multiple hits — see
      // PrototypeScene#handleBrickHit for the decrement-then-destroy logic.
      // Applies uniformly whether or not this cell also carries a star/
      // hazard: that effect only fires on the hit that actually destroys it.
      if (row < TOUGH_BRICK_ROWS) {
        brick.setData("hitsRemaining", TOUGH_BRICK_HITS);
        const label = scene.add
          .text(x, y, String(TOUGH_BRICK_HITS), { fontSize: "14px", color: TOUGH_BRICK_LABEL_COLOR, fontStyle: "bold" })
          .setOrigin(0.5);
        brick.setData("hitsLabel", label);
      }

      brick.refreshBody();
    }
  }
}
