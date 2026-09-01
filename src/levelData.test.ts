import { describe, expect, it } from "vitest";
import { BRICK_COLS, BRICK_ROWS, MAX_BRICK_HITS } from "./constants";
import { LEVELS, validateLevels } from "./levelData";
import type { LevelDef } from "./levelData";

describe("validateLevels", () => {
  it("finds no issues in the shipped level list", () => {
    expect(validateLevels(LEVELS)).toEqual([]);
  });

  it("flags a star brick placed outside the grid", () => {
    const levels: LevelDef[] = [
      {
        name: "Bad",
        starBricks: [{ row: 0, col: 99, powerUp: "wide-paddle" }],
        hazardBricks: [],
        toughBricks: [],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/outside the/);
  });

  it("flags a star brick and a hazard brick sharing the same cell", () => {
    const levels: LevelDef[] = [
      {
        name: "Overlap",
        starBricks: [{ row: 1, col: 1, powerUp: "wide-paddle" }],
        hazardBricks: [{ row: 1, col: 1, hazard: "freeze-paddle" }],
        toughBricks: [],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/collides with star brick/);
  });

  it("flags a star brick placed on a skipped cell", () => {
    const levels: LevelDef[] = [
      {
        name: "Skip clash",
        starBricks: [{ row: 2, col: 2, powerUp: "big-ball" }],
        hazardBricks: [],
        toughBricks: [],
        skip: [[2, 2]],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/collides with skip/);
  });

  it("flags more star bricks than the configured max", () => {
    const levels: LevelDef[] = [
      {
        name: "Too many stars",
        starBricks: [
          { row: 1, col: 0, powerUp: "wide-paddle" },
          { row: 1, col: 1, powerUp: "slow-ball" },
          { row: 1, col: 2, powerUp: "big-ball" },
        ],
        hazardBricks: [],
        toughBricks: [],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS, 2);
    expect(issues.some((i) => i.message.includes("exceeds the max"))).toBe(true);
  });

  it("allows exactly the max number of star bricks", () => {
    const levels: LevelDef[] = [
      {
        name: "At the limit",
        starBricks: [
          { row: 1, col: 0, powerUp: "wide-paddle" },
          { row: 1, col: 1, powerUp: "slow-ball" },
        ],
        hazardBricks: [],
        toughBricks: [],
        skip: [],
      },
    ];
    expect(validateLevels(levels, BRICK_COLS, BRICK_ROWS, 2)).toEqual([]);
  });

  it("flags more hazard bricks than the configured max", () => {
    const levels: LevelDef[] = [
      {
        name: "Too many hazards",
        starBricks: [],
        hazardBricks: [
          { row: 1, col: 0, hazard: "narrow-paddle" },
          { row: 1, col: 1, hazard: "freeze-paddle" },
        ],
        toughBricks: [],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS, 8, 1);
    expect(issues.some((i) => i.message.includes("hazard bricks exceeds the max"))).toBe(true);
  });
});

describe("validateLevels — Extra Life placement", () => {
  const bare = (name: string, starBricks: { row: number; col: number; powerUp: "extra-life" | "mystery" }[]) => ({
    name,
    starBricks,
    hazardBricks: [],
    toughBricks: [],
    skip: [],
  });

  const messages = (levels: Parameters<typeof validateLevels>[0], interval: number) =>
    validateLevels(levels, BRICK_COLS, BRICK_ROWS, 14, 4, undefined, interval).map((i) => i.message);

  it("flags an Extra Life on a level that should not have one", () => {
    const levels = [bare("Level 1", [{ row: 0, col: 0, powerUp: "extra-life" }])];
    expect(messages(levels, 5).join(" ")).toContain("has 1 Extra Life star bricks, expected 0");
  });

  // The opposite direction matters just as much: a level 10 that quietly
  // lost its Extra Life is a run that is harder than designed, and nothing
  // on screen would say so.
  it("flags a qualifying level that is missing its Extra Life", () => {
    const levels = [bare("Level 1", []), bare("Level 2", [])];
    expect(messages(levels, 2).join(" ")).toContain("has 0 Extra Life star bricks, expected 1");
  });

  it("accepts data that matches the rule", () => {
    const levels = [
      bare("Level 1", [{ row: 0, col: 0, powerUp: "mystery" }]),
      bare("Level 2", [{ row: 0, col: 0, powerUp: "extra-life" }]),
    ];
    expect(messages(levels, 2)).toEqual([]);
  });
});

describe("LEVELS content", () => {
  // The pacing set. A level was reported as taking too long and playing
  // boring, and these five are the boosters that answer that directly:
  // three that put more balls on the field, one that pierces a whole
  // column, and one that speeds the ball up. Every level carries all five,
  // so no level can quietly regress to a slow one.
  const PACE_BOOSTERS = ["double-ball", "triple-ball", "extra-ball", "burning-ball", "fast-ball"] as const;

  it("carries the whole pace set on every level", () => {
    for (const level of LEVELS) {
      for (const booster of PACE_BOOSTERS) {
        const present = level.starBricks.some((s) => s.powerUp === booster);
        expect(present, `${level.name} should carry ${booster}`).toBe(true);
      }
    }
  });

  // Mystery is on every level: a "?" the player only meets on some levels
  // teaches nothing.
  it("puts Mystery on every level", () => {
    for (const level of LEVELS) {
      expect(
        level.starBricks.some((s) => s.powerUp === "mystery"),
        `${level.name} should carry mystery`,
      ).toBe(true);
    }
  });

  // Extra Life is the exception: every 5th level and nowhere else, so that
  // reaching one is a milestone rather than a refill. validateLevels()
  // enforces this against the real data (see the suite above); this pins
  // the concrete shape of it so the intent survives a level being added.
  it("puts Extra Life on level 5 only, of the levels that exist so far", () => {
    const levelsWithExtraLife = LEVELS.map((level, i) =>
      level.starBricks.some((s) => s.powerUp === "extra-life") ? i + 1 : null,
    ).filter((n): n is number => n !== null);

    expect(levelsWithExtraLife).toEqual([5]);
  });

  it("keeps Triple Ball to one per level — it is the strongest of the three", () => {
    for (const level of LEVELS) {
      const tripleBalls = level.starBricks.filter((s) => s.powerUp === "triple-ball");
      expect(tripleBalls, `${level.name} should have exactly one Triple Ball`).toHaveLength(1);
    }
  });

  it("gives every level at least four ball-spawning star bricks", () => {
    for (const level of LEVELS) {
      const spawners = level.starBricks.filter(
        (s) => s.powerUp === "extra-ball" || s.powerUp === "double-ball" || s.powerUp === "triple-ball",
      );
      expect(spawners.length, `${level.name} ball spawners`).toBeGreaterThanOrEqual(4);
    }
  });

  it("reserves Freeze Paddle for the last level only", () => {
    const levelsWithFreezePaddle = LEVELS.filter((level) =>
      level.hazardBricks.some((h) => h.hazard === "freeze-paddle"),
    );
    expect(levelsWithFreezePaddle).toHaveLength(1);
    expect(levelsWithFreezePaddle[0].name).toBe(LEVELS[LEVELS.length - 1].name);
  });

  it("keeps Paddle Cut (narrow-paddle) available from level 1", () => {
    expect(LEVELS[0].hazardBricks.some((h) => h.hazard === "narrow-paddle")).toBe(true);
  });

  it("flags a star brick landing on a tough brick — a star must never need 2 hits to trigger", () => {
    const levels: LevelDef[] = [
      {
        name: "Star on tough",
        starBricks: [{ row: 2, col: 3, powerUp: "wide-paddle" }],
        hazardBricks: [],
        toughBricks: [{ row: 2, col: 3, hits: 2 }],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/collides with tough brick/);
  });

  it("flags a tough brick with a hit count outside the supported shades", () => {
    const levels: LevelDef[] = [
      {
        name: "Too tough",
        starBricks: [],
        hazardBricks: [],
        // 1 would be an ordinary brick; 9 has no shade to render it with.
        toughBricks: [
          { row: 1, col: 1, hits: 1 },
          { row: 1, col: 2, hits: 9 },
        ],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toMatch(/outside the supported 2\.\./);
  });

  it("flags a tough brick placed outside the grid", () => {
    const levels: LevelDef[] = [
      { name: "Bad tough", starBricks: [], hazardBricks: [], toughBricks: [{ row: 99, col: 0, hits: 2 }], skip: [] },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS);
    expect(issues.some((i) => /outside the/.test(i.message))).toBe(true);
  });

  it("every shipped level's tough bricks stay within the supported shade range", () => {
    for (const level of LEVELS) {
      for (const t of level.toughBricks) {
        expect(t.hits).toBeGreaterThanOrEqual(2);
        expect(t.hits).toBeLessThanOrEqual(MAX_BRICK_HITS);
      }
    }
  });
});
