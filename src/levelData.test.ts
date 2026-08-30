import { describe, expect, it } from "vitest";
import { BRICK_COLS, BRICK_ROWS } from "./constants";
import { LEVELS, validateLevels } from "./levelData";
import type { LevelDef } from "./levelData";

describe("validateLevels", () => {
  it("finds no issues in the shipped level list", () => {
    expect(validateLevels(LEVELS)).toEqual([]);
  });

  it("flags a star brick placed outside the grid", () => {
    const levels: LevelDef[] = [
      { name: "Bad", starBricks: [{ row: 0, col: 99, powerUp: "wide-paddle" }], hazardBricks: [], skip: [] },
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
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS, 8, 1);
    expect(issues.some((i) => i.message.includes("hazard bricks exceeds the max"))).toBe(true);
  });

  it("flags a star or hazard brick placed on a tough-brick row", () => {
    const levels: LevelDef[] = [
      {
        name: "Tough row clash",
        starBricks: [{ row: 0, col: 0, powerUp: "wide-paddle" }],
        hazardBricks: [{ row: 0, col: 1, hazard: "freeze-paddle" }],
        skip: [],
      },
    ];
    const issues = validateLevels(levels, BRICK_COLS, BRICK_ROWS, 8, 4, 1);
    expect(issues.filter((i) => i.message.includes("tough-brick row"))).toHaveLength(2);
  });
});

describe("LEVELS content", () => {
  it("gives every level exactly one Double Ball and one Triple Ball star brick", () => {
    for (const level of LEVELS) {
      const doubleBalls = level.starBricks.filter((s) => s.powerUp === "double-ball");
      const tripleBalls = level.starBricks.filter((s) => s.powerUp === "triple-ball");
      expect(doubleBalls, `${level.name} should have exactly one Double Ball`).toHaveLength(1);
      expect(tripleBalls, `${level.name} should have exactly one Triple Ball`).toHaveLength(1);
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
});
