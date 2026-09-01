/**
 * Level/booster data and its validation — kept free of Phaser so both can be
 * unit tested directly (see levelData.test.ts) instead of only discovered
 * live in a browser.
 */

import { BRICK_COLS, BRICK_ROWS, EXTRA_LIFE_LEVEL_INTERVAL, MAX_BRICK_HITS } from "./constants";
import { levelGrantsExtraLife } from "./gameplayMath";

// Boosters live on star bricks and are always positive — catching one is
// optional and never required to clear a level. Hazards live on a separate,
// distinctly-tinted brick type instead and trigger the moment that brick is
// destroyed, no catch involved — this keeps every star-brick catch
// unconditionally good, per the design brief §3.
export type BoosterType =
  | "wide-paddle"
  | "slow-ball"
  | "fast-ball"
  | "big-ball"
  | "burning-ball"
  | "extra-ball"
  | "sticky-paddle"
  | "foresight"
  | "double-ball"
  | "triple-ball"
  | "extra-life"
  | "mystery";
export type HazardType = "narrow-paddle" | "freeze-paddle";
export type PowerUpType = BoosterType | HazardType;

export const POWER_UP_TINTS: Record<PowerUpType, number> = {
  "wide-paddle": 0x62e0c4,
  "narrow-paddle": 0xe0616c,
  "freeze-paddle": 0x8fd9f0,
  "slow-ball": 0xb98ce0,
  // Hot red, deliberately far from Slow Ball's violet: these two are
  // opposites and a player has to tell them apart at a glance mid-rally.
  "fast-ball": 0xff3b6b,
  "big-ball": 0xc7e05d,
  "burning-ball": 0xff7a45,
  "extra-ball": 0x5da8ff,
  "sticky-paddle": 0xe05dc7,
  foresight: 0xc7c7f5,
  "double-ball": 0x3d8bff,
  "triple-ball": 0x1f5fcc,
  "extra-life": 0xffd166,
  mystery: 0x8b3dff,
};

export const POWER_UP_LABELS: Record<PowerUpType, string> = {
  "wide-paddle": "Wide Paddle",
  "narrow-paddle": "Paddle Cut",
  "freeze-paddle": "Frozen Paddle",
  "slow-ball": "Slow Ball",
  "fast-ball": "Fast Ball",
  "big-ball": "Big Ball",
  "burning-ball": "Burning Ball",
  "extra-ball": "Extra Ball",
  "sticky-paddle": "Catch & Aim",
  foresight: "Foresight",
  "double-ball": "Double Ball",
  "triple-ball": "Triple Ball",
  "extra-life": "Extra Life",
  mystery: "Mystery",
};

/**
 * A symbol drawn on the brick itself, for the boosters whose payload can't
 * be inferred from anything else on screen.
 *
 * Only two carry one. Extra Life is the single booster that changes a
 * *run-wide* resource rather than the ball or the paddle, and Mystery has no
 * fixed effect at all — for both, the gold "this is a star brick" tint says
 * nothing about what you are about to get, and for Mystery that is exactly
 * the point: the "?" is the feature.
 *
 * This is also the first step toward the icon cue §7 has wanted for a while
 * (color must never be a booster's only signal). The other boosters still
 * lean on the falling chip's tint alone — unfinished, not decided against.
 */
export const POWER_UP_GLYPHS: Partial<Record<PowerUpType, string>> = {
  "extra-life": "★",
  mystery: "?",
};

export interface StarBrickDef {
  row: number;
  col: number;
  powerUp: BoosterType;
}

export interface HazardBrickDef {
  row: number;
  col: number;
  hazard: HazardType;
}

export interface ToughBrickDef {
  row: number;
  col: number;
  /** Total hits to destroy (2..MAX_BRICK_HITS). Drawn as a shade, not a number. */
  hits: number;
}

export interface LevelDef {
  name: string;
  starBricks: StarBrickDef[];
  hazardBricks: HazardBrickDef[];
  /** Multi-hit bricks, scattered anywhere in the grid — no longer a
   * reserved top row. Never shares a cell with a star or hazard. */
  toughBricks: ToughBrickDef[];
  // [row, col] pairs to leave empty, for a level-specific brick shape.
  skip: Array<[number, number]>;
}

// Every level now draws from the whole catalog from the start (the
// original "one new booster taught per level" progression rule was dropped
// — see the design brief's reconciliation record). Tough (multi-hit) bricks
// are scattered per level rather than filling a reserved top row, and still
// deliberately never carry a star/hazard, so a "tough" brick's extra hits
// stay a purely structural property, independent of the catch mechanic —
// no star/hazard ever needs 2 hits to actually trigger.
//
// 14 star bricks per level, up from 8. The first four added were the *pace*
// set — a second multi-ball, an Extra Ball, a Burning Ball (which pierces a
// whole column) and Fast Ball — raised because a level was reported as
// taking too long and playing boring. The last two are Extra Life and
// Mystery, the only boosters that carry a symbol on the brick face (see
// POWER_UP_GLYPHS). Duplicates within a level are intentional and allowed —
// a level having two Burning Balls is more fire, which is the point. Each
// level still rotates out exactly one of the original 7 boosters (never a
// hazard), and Double Ball and Triple Ball are on every level
// unconditionally.
// Freeze Paddle is reserved for the last level only (Gauntlet) rather than
// appearing everywhere — it's a harsher hazard (paddle ignores input
// entirely) than Paddle Cut, so it's held back as part of that level's
// finale rather than unlocked from level 1 like everything else.
export const LEVELS: LevelDef[] = [
  {
    name: "Warmup",
    starBricks: [
      { row: 1, col: 1, powerUp: "wide-paddle" },
      { row: 1, col: 6, powerUp: "slow-ball" },
      { row: 2, col: 3, powerUp: "big-ball" },
      { row: 3, col: 0, powerUp: "burning-ball" },
      { row: 3, col: 7, powerUp: "extra-ball" },
      { row: 4, col: 4, powerUp: "sticky-paddle" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 2, col: 6, powerUp: "fast-ball" },
      { row: 4, col: 1, powerUp: "burning-ball" },
      { row: 5, col: 6, powerUp: "extra-ball" },
      { row: 1, col: 3, powerUp: "double-ball" },
      { row: 4, col: 3, powerUp: "mystery" },
    ],
    hazardBricks: [{ row: 5, col: 1, hazard: "narrow-paddle" }],
    toughBricks: [
      { row: 0, col: 1, hits: 2 },
      { row: 0, col: 6, hits: 2 },
      { row: 0, col: 3, hits: 3 },
      { row: 2, col: 0, hits: 2 },
      { row: 3, col: 3, hits: 3 },
      { row: 4, col: 6, hits: 2 },
      { row: 5, col: 4, hits: 2 },
    ],
    skip: [],
  },
  {
    name: "Left Lock",
    starBricks: [
      { row: 1, col: 1, powerUp: "wide-paddle" },
      { row: 1, col: 6, powerUp: "slow-ball" },
      { row: 2, col: 1, powerUp: "big-ball" },
      { row: 2, col: 6, powerUp: "burning-ball" },
      { row: 3, col: 3, powerUp: "extra-ball" },
      { row: 4, col: 4, powerUp: "foresight" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 4, col: 1, powerUp: "fast-ball" },
      { row: 5, col: 6, powerUp: "burning-ball" },
      { row: 0, col: 1, powerUp: "extra-ball" },
      { row: 3, col: 4, powerUp: "double-ball" },
      { row: 4, col: 5, powerUp: "mystery" },
    ],
    hazardBricks: [{ row: 5, col: 0, hazard: "narrow-paddle" }],
    toughBricks: [
      { row: 0, col: 2, hits: 2 },
      { row: 0, col: 5, hits: 2 },
      { row: 0, col: 7, hits: 3 },
      { row: 3, col: 0, hits: 2 },
      { row: 3, col: 6, hits: 3 },
      { row: 4, col: 7, hits: 2 },
      { row: 5, col: 3, hits: 2 },
    ],
    skip: [
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
    ],
  },
  {
    name: "Big Break",
    starBricks: [
      { row: 1, col: 1, powerUp: "wide-paddle" },
      { row: 1, col: 4, powerUp: "slow-ball" },
      { row: 2, col: 2, powerUp: "big-ball" },
      { row: 2, col: 6, powerUp: "burning-ball" },
      { row: 3, col: 0, powerUp: "sticky-paddle" },
      { row: 4, col: 4, powerUp: "foresight" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 2, col: 1, powerUp: "fast-ball" },
      { row: 4, col: 6, powerUp: "burning-ball" },
      { row: 5, col: 3, powerUp: "extra-ball" },
      { row: 3, col: 6, powerUp: "double-ball" },
      { row: 4, col: 2, powerUp: "mystery" },
    ],
    hazardBricks: [{ row: 5, col: 1, hazard: "narrow-paddle" }],
    toughBricks: [
      { row: 0, col: 0, hits: 2 },
      { row: 0, col: 3, hits: 2 },
      { row: 0, col: 5, hits: 3 },
      { row: 2, col: 4, hits: 2 },
      { row: 3, col: 3, hits: 3 },
      { row: 4, col: 0, hits: 2 },
      { row: 5, col: 5, hits: 2 },
    ],
    skip: [
      [0, 6],
      [0, 7],
      [1, 7],
    ],
  },
  {
    name: "Double Up",
    starBricks: [
      { row: 1, col: 1, powerUp: "wide-paddle" },
      { row: 1, col: 6, powerUp: "slow-ball" },
      { row: 2, col: 3, powerUp: "big-ball" },
      { row: 3, col: 4, powerUp: "extra-ball" },
      { row: 4, col: 0, powerUp: "sticky-paddle" },
      { row: 4, col: 7, powerUp: "foresight" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 2, col: 1, powerUp: "fast-ball" },
      { row: 3, col: 5, powerUp: "burning-ball" },
      { row: 5, col: 1, powerUp: "extra-ball" },
      { row: 1, col: 3, powerUp: "double-ball" },
      { row: 4, col: 5, powerUp: "mystery" },
    ],
    hazardBricks: [{ row: 5, col: 2, hazard: "narrow-paddle" }],
    toughBricks: [
      { row: 0, col: 1, hits: 2 },
      { row: 0, col: 4, hits: 2 },
      { row: 0, col: 6, hits: 3 },
      { row: 2, col: 5, hits: 2 },
      { row: 3, col: 2, hits: 3 },
      { row: 4, col: 3, hits: 2 },
      { row: 5, col: 6, hits: 2 },
    ],
    skip: [
      [2, 0],
      [3, 0],
      [2, 7],
      [3, 7],
    ],
  },
  {
    name: "Burn Through",
    // Every ball in play shares whatever's active (applyPowerUp/setBallsTint
    // both operate on the whole `balls` group, not a single ball) — catching
    // Extra Ball and Burning Ball together lets the player see boosters
    // compound: a second ball catches fire too.
    starBricks: [
      { row: 1, col: 0, powerUp: "wide-paddle" },
      { row: 1, col: 7, powerUp: "slow-ball" },
      { row: 2, col: 7, powerUp: "extra-ball" },
      { row: 3, col: 2, powerUp: "burning-ball" },
      { row: 3, col: 5, powerUp: "sticky-paddle" },
      { row: 4, col: 3, powerUp: "foresight" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 1, col: 3, powerUp: "fast-ball" },
      { row: 4, col: 1, powerUp: "burning-ball" },
      { row: 5, col: 5, powerUp: "extra-ball" },
      { row: 3, col: 4, powerUp: "double-ball" },
      { row: 2, col: 3, powerUp: "extra-life" },
      { row: 4, col: 4, powerUp: "mystery" },
    ],
    hazardBricks: [{ row: 5, col: 1, hazard: "narrow-paddle" }],
    toughBricks: [
      { row: 0, col: 2, hits: 2 },
      { row: 0, col: 5, hits: 2 },
      { row: 0, col: 7, hits: 3 },
      { row: 2, col: 0, hits: 2 },
      { row: 3, col: 7, hits: 3 },
      { row: 4, col: 6, hits: 2 },
      { row: 5, col: 4, hits: 2 },
    ],
    skip: [
      [1, 2],
      [1, 5],
      [2, 2],
      [2, 5],
    ],
  },
  {
    name: "Gauntlet",
    // The one level that keeps Freeze Paddle (see the note above LEVELS) —
    // its original identity as the hazards-only finale, minus the "no star
    // bricks" part of that framing, which went away with the rest of the
    // progression rule.
    starBricks: [
      { row: 1, col: 1, powerUp: "wide-paddle" },
      { row: 1, col: 6, powerUp: "big-ball" },
      { row: 2, col: 1, powerUp: "burning-ball" },
      { row: 2, col: 6, powerUp: "extra-ball" },
      { row: 3, col: 1, powerUp: "sticky-paddle" },
      { row: 3, col: 6, powerUp: "foresight" },
      { row: 6, col: 2, powerUp: "double-ball" },
      { row: 6, col: 5, powerUp: "triple-ball" },
      { row: 5, col: 1, powerUp: "fast-ball" },
      { row: 5, col: 5, powerUp: "burning-ball" },
      { row: 1, col: 5, powerUp: "extra-ball" },
      { row: 3, col: 5, powerUp: "double-ball" },
      { row: 5, col: 4, powerUp: "mystery" },
    ],
    hazardBricks: [
      { row: 4, col: 2, hazard: "narrow-paddle" },
      { row: 4, col: 5, hazard: "freeze-paddle" },
    ],
    toughBricks: [
      { row: 0, col: 0, hits: 2 },
      { row: 0, col: 3, hits: 2 },
      { row: 0, col: 7, hits: 2 },
      { row: 0, col: 5, hits: 3 },
      { row: 4, col: 0, hits: 2 },
      { row: 4, col: 7, hits: 3 },
      { row: 5, col: 3, hits: 2 },
    ],
    skip: [
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 3],
      [3, 4],
    ],
  },
];

export interface LevelValidationIssue {
  levelIndex: number;
  levelName: string;
  message: string;
}

/**
 * Encodes the design brief's own rules about star/hazard brick placement so
 * a level-design mistake (an out-of-bounds coordinate, two special bricks
 * landing on the same cell, more star/hazard bricks than intended, one
 * landing on a tough row) is caught by a test instead of discovered by a
 * player. Density caps went up (2 → 8 star bricks) once the "one new
 * booster taught per level" progression rule was dropped in favor of
 * unlocking the whole catalog from level 1 — see the design brief.
 */
export function validateLevels(
  levels: LevelDef[],
  cols: number = BRICK_COLS,
  rows: number = BRICK_ROWS,
  maxStarBricks = 14,
  maxHazardBricks = 4,
  maxBrickHits: number = MAX_BRICK_HITS,
  extraLifeInterval: number = EXTRA_LIFE_LEVEL_INTERVAL,
): LevelValidationIssue[] {
  const issues: LevelValidationIssue[] = [];

  levels.forEach((level, levelIndex) => {
    const claimedBy = new Map<string, string>();

    const claim = (row: number, col: number, kind: string): boolean => {
      if (row < 0 || row >= rows || col < 0 || col >= cols) {
        issues.push({
          levelIndex,
          levelName: level.name,
          message: `${kind} at (${row},${col}) is outside the ${cols}x${rows} grid`,
        });
        return false;
      }
      const key = `${row},${col}`;
      const existing = claimedBy.get(key);
      if (existing) {
        issues.push({
          levelIndex,
          levelName: level.name,
          message: `${kind} at (${row},${col}) collides with ${existing} on the same cell`,
        });
      } else {
        claimedBy.set(key, kind);
      }
      return true;
    };

    // Tough bricks are claimed first, so a star/hazard landing on one is
    // reported as a cell collision — a star/hazard must never need more
    // than one hit to trigger (design brief §3).
    level.toughBricks.forEach((t) => {
      claim(t.row, t.col, "tough brick");
      if (t.hits < 2 || t.hits > maxBrickHits) {
        issues.push({
          levelIndex,
          levelName: level.name,
          message: `tough brick at (${t.row},${t.col}) has ${t.hits} hits, outside the supported 2..${maxBrickHits}`,
        });
      }
    });
    level.skip.forEach(([row, col]) => claim(row, col, "skip"));
    level.starBricks.forEach((s) => claim(s.row, s.col, "star brick"));
    level.hazardBricks.forEach((h) => claim(h.row, h.col, "hazard brick"));

    if (level.starBricks.length > maxStarBricks) {
      issues.push({
        levelIndex,
        levelName: level.name,
        message: `${level.starBricks.length} star bricks exceeds the max of ${maxStarBricks}`,
      });
    }
    if (level.hazardBricks.length > maxHazardBricks) {
      issues.push({
        levelIndex,
        levelName: level.name,
        message: `${level.hazardBricks.length} hazard bricks exceeds the max of ${maxHazardBricks}`,
      });
    }

    // Extra Life is deliberately scarce — every EXTRA_LIFE_LEVEL_INTERVAL-th
    // level and nowhere else (see the constant). Checked in both directions
    // on purpose: a stray one on level 2 quietly erases the lives
    // constraint, and a missing one on level 10 quietly makes the run
    // harder than designed. Neither is visible by reading the level data.
    const extraLives = level.starBricks.filter((s) => s.powerUp === "extra-life").length;
    const expected = levelGrantsExtraLife(levelIndex, extraLifeInterval) ? 1 : 0;
    if (extraLives !== expected) {
      issues.push({
        levelIndex,
        levelName: level.name,
        message: `has ${extraLives} Extra Life star bricks, expected ${expected} — Extra Life belongs on every ${extraLifeInterval}th level only`,
      });
    }
  });

  return issues;
}
