import { describe, expect, it } from "vitest";
import { ballSpeedForLevel, bounceOffsetToAngleRad, clamp, degToRad, velocityFromAngle } from "./gameplayMath";

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
