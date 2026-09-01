import { describe, expect, it } from "vitest";
import {
  ballSpeedForLevel,
  levelGrantsExtraLife,
  powerUpDropSpeedForLevel,
  gameHeightForViewport,
  bounceOffsetToAngleRad,
  clamp,
  degToRad,
  velocityFromAngle,
} from "./gameplayMath";

describe("bounceOffsetToAngleRad", () => {
  it("returns straight up (-90deg) for a dead-center hit", () => {
    expect(bounceOffsetToAngleRad(0)).toBeCloseTo(degToRad(-90));
  });

  it("deflects toward the max angle at the paddle's right edge", () => {
    expect(bounceOffsetToAngleRad(1)).toBeCloseTo(degToRad(-90 + 0.9 * 60));
  });

  it("deflects toward the max angle at the paddle's left edge", () => {
    expect(bounceOffsetToAngleRad(-1)).toBeCloseTo(degToRad(-90 - 0.9 * 60));
  });

  it("clamps an offset beyond the paddle's edges rather than deflecting further", () => {
    expect(bounceOffsetToAngleRad(5)).toBeCloseTo(bounceOffsetToAngleRad(1));
    expect(bounceOffsetToAngleRad(-5)).toBeCloseTo(bounceOffsetToAngleRad(-1));
  });

  it("is symmetric around a dead-center hit", () => {
    const centerDeg = -90;
    const right = bounceOffsetToAngleRad(0.5);
    const left = bounceOffsetToAngleRad(-0.5);
    expect(right - degToRad(centerDeg)).toBeCloseTo(-(left - degToRad(centerDeg)));
  });
});

describe("velocityFromAngle", () => {
  it("points straight up at full speed for -90deg", () => {
    const v = velocityFromAngle(degToRad(-90), 360);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-360);
  });

  it("preserves speed as the vector magnitude regardless of angle", () => {
    const v = velocityFromAngle(degToRad(-45), 200);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(200);
  });
});

describe("ballSpeedForLevel", () => {
  // Real values: BALL_SPEED=420, CHALLENGE_START_LEVEL_INDEX=4, step=0.15 —
  // levels 1-4 (index 0-3) are the calm/all-ages zone, level 5+ (index 4+)
  // ramps up to challenge a player who's already cleared those.
  it("stays flat at the base speed through every level before the challenge zone", () => {
    expect(ballSpeedForLevel(0, 420, 4, 0.15)).toBe(420);
    expect(ballSpeedForLevel(3, 420, 4, 0.15)).toBe(420);
  });

  it("steps up starting exactly at the challenge start index", () => {
    expect(ballSpeedForLevel(4, 420, 4, 0.15)).toBeCloseTo(420 * 1.15);
  });

  it("keeps ramping for every level past the start of the challenge zone", () => {
    expect(ballSpeedForLevel(5, 420, 4, 0.15)).toBeCloseTo(420 * 1.3);
    expect(ballSpeedForLevel(6, 420, 4, 0.15)).toBeCloseTo(420 * 1.45);
  });
});

describe("clamp", () => {
  it("passes values already inside the range through unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the lower bound", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to the upper bound", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("gameHeightForViewport", () => {
  // The point of this is filling a phone screen instead of letterboxing:
  // a 480-wide canvas in a 440x956 viewport needs to be ~1043 tall, not 800.
  it("matches the viewport's aspect ratio at the design width", () => {
    expect(gameHeightForViewport(440, 956, 480, 700, 1100)).toBe(1043);
  });

  it("clamps tall/narrow viewports to the max height", () => {
    expect(gameHeightForViewport(300, 2000, 480, 700, 1100)).toBe(1100);
  });

  it("clamps short/wide viewports (a landscape desktop window) to the min", () => {
    expect(gameHeightForViewport(1920, 900, 480, 700, 1100)).toBe(700);
  });

  it("returns a usable height rather than 0 or NaN for a degenerate viewport", () => {
    expect(gameHeightForViewport(0, 0, 480, 700, 1100)).toBe(700);
    expect(gameHeightForViewport(-10, 500, 480, 700, 1100)).toBe(700);
  });
});

describe("powerUpDropSpeedForLevel", () => {
  // Levels 1-4 are the calm, all-ages zone; the ramp starts at index 4.
  const BALL_AT = (levelIndex: number) => ballSpeedForLevel(levelIndex, 420, 4, 0.15);
  const dropAt = (levelIndex: number) => powerUpDropSpeedForLevel(levelIndex, 170, BALL_AT(levelIndex), 4, 0.9);

  it("holds the calm base through every pre-challenge level", () => {
    expect(dropAt(0)).toBe(170);
    expect(dropAt(3)).toBe(170);
  });

  it("climbs once the challenge levels begin", () => {
    expect(dropAt(4)).toBeCloseTo(170 * 1.9);
    expect(dropAt(5)).toBeCloseTo(170 * 2.8);
  });

  it("is slower than that level's ball everywhere it is not capped", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      expect(dropAt(level)).toBeLessThan(BALL_AT(level));
    }
  });

  // The drop's step is steep enough to overtake the ball's if left to run,
  // which would make a falling booster the fastest thing on screen — the
  // opposite of the complaint that started this. The cap is what stops it,
  // and it only starts biting on levels past the sixth.
  it("never exceeds the ball, however far the ramp runs", () => {
    for (const level of [6, 8, 12, 40]) {
      expect(dropAt(level)).toBe(BALL_AT(level));
    }
  });

  it("caps at the ball even when the base already starts above it", () => {
    expect(powerUpDropSpeedForLevel(0, 900, 420, 4, 0.9)).toBe(420);
  });
});

describe("levelGrantsExtraLife", () => {
  // Levels are 0-indexed here and 1-indexed on screen, which is exactly the
  // off-by-one this function exists to hold in one place: the rule the
  // player was promised is "levels 5, 10, 15, 20".
  it("grants on every 5th level counting from 1, and no other", () => {
    const granted = Array.from({ length: 20 }, (_, i) => (levelGrantsExtraLife(i, 5) ? i + 1 : null)).filter(Boolean);
    expect(granted).toEqual([5, 10, 15, 20]);
  });

  it("never grants on the first level, however the interval is set", () => {
    for (const interval of [1, 2, 5, 10]) {
      expect(levelGrantsExtraLife(0, interval), `interval ${interval}`).toBe(interval === 1);
    }
  });

  it("honours a different interval", () => {
    const granted = Array.from({ length: 9 }, (_, i) => (levelGrantsExtraLife(i, 3) ? i + 1 : null)).filter(Boolean);
    expect(granted).toEqual([3, 6, 9]);
  });

  // `n % 0` is NaN, which compares false — so a zero interval has to be
  // handled deliberately. Left to the modulo it would read as "never" by
  // accident rather than by decision, and a negative one likewise.
  it("means never, not always, for a non-positive interval", () => {
    for (const levelIndex of [0, 4, 9, 99]) {
      expect(levelGrantsExtraLife(levelIndex, 0), `level ${levelIndex}`).toBe(false);
      expect(levelGrantsExtraLife(levelIndex, -5), `level ${levelIndex}`).toBe(false);
    }
  });
});
