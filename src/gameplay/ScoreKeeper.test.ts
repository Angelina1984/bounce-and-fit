import { describe, expect, it } from "vitest";
import { ScoreKeeper } from "./ScoreKeeper";
import {
  SCORE_LEVEL_CLEAR,
  SCORE_MAX_COMBO,
  SCORE_PER_BOOSTER_CAUGHT,
  SCORE_PER_BRICK,
  SCORE_PER_LIFE_REMAINING,
} from "../constants";

describe("ScoreKeeper", () => {
  it("starts at zero, or at a score carried in from a previous level", () => {
    expect(new ScoreKeeper().score).toBe(0);
    expect(new ScoreKeeper(1200).score).toBe(1200);
  });

  it("scores the first brick of a trip at x1", () => {
    const s = new ScoreKeeper();
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK);
    expect(s.score).toBe(SCORE_PER_BRICK);
  });

  it("multiplies each further brick destroyed within the same trip", () => {
    const s = new ScoreKeeper();
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK * 1);
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK * 2);
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK * 3);
    expect(s.score).toBe(SCORE_PER_BRICK * (1 + 2 + 3));
  });

  // The whole point of the model: the same bricks are worth more when one
  // shot clears them than when each needs its own trip.
  it("scores one shot clearing four bricks higher than four separate shots", () => {
    const oneShot = new ScoreKeeper();
    for (let i = 0; i < 4; i++) oneShot.registerBrickDestroyed();

    const fourShots = new ScoreKeeper();
    for (let i = 0; i < 4; i++) {
      fourShots.registerBrickDestroyed();
      fourShots.registerPaddleContact();
    }

    expect(oneShot.score).toBeGreaterThan(fourShots.score);
    expect(fourShots.score).toBe(SCORE_PER_BRICK * 4); // every brick at x1
  });

  it("caps the multiplier so a piercing run can't run away", () => {
    const s = new ScoreKeeper();
    for (let i = 0; i < SCORE_MAX_COMBO; i++) s.registerBrickDestroyed();
    const atCap = s.registerBrickDestroyed();
    const stillAtCap = s.registerBrickDestroyed();
    expect(atCap).toBe(SCORE_PER_BRICK * SCORE_MAX_COMBO);
    expect(stillAtCap).toBe(SCORE_PER_BRICK * SCORE_MAX_COMBO);
  });

  it("resets the combo on paddle contact", () => {
    const s = new ScoreKeeper();
    s.registerBrickDestroyed();
    s.registerBrickDestroyed();
    expect(s.comboCount).toBe(2);
    s.registerPaddleContact();
    expect(s.comboCount).toBe(0);
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK); // back to x1
  });

  it("resets the combo when a life is lost", () => {
    const s = new ScoreKeeper();
    s.registerBrickDestroyed();
    s.registerBrickDestroyed();
    s.registerLifeLost();
    expect(s.comboCount).toBe(0);
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK);
  });

  it("pays a tough brick in proportion to the hits it cost to clear", () => {
    const s = new ScoreKeeper();
    expect(s.registerBrickDestroyed(3)).toBe(SCORE_PER_BRICK * 3);
  });

  it("reports the multiplier the next brick would score at", () => {
    const s = new ScoreKeeper();
    expect(s.comboMultiplier).toBe(1);
    s.registerBrickDestroyed();
    expect(s.comboMultiplier).toBe(2);
  });

  it("awards a level-clear bonus plus one per life still in hand", () => {
    const s = new ScoreKeeper();
    const result = s.registerLevelClear(3);
    expect(result.levelClear).toBe(SCORE_LEVEL_CLEAR);
    expect(result.livesBonus).toBe(SCORE_PER_LIFE_REMAINING * 3);
    expect(result.total).toBe(SCORE_LEVEL_CLEAR + SCORE_PER_LIFE_REMAINING * 3);
    expect(s.score).toBe(result.total);
  });

  // The win screen prints these rows as a column that has to sum to the
  // total — a breakdown that doesn't add up reads as a bug to the player.
  it("returns a breakdown whose parts sum exactly to the total", () => {
    const s = new ScoreKeeper(1200); // carried in from earlier levels
    s.registerBrickDestroyed();
    s.registerBrickDestroyed();
    s.registerBoosterCaught();

    const r = s.registerLevelClear(2);
    expect(r.carriedIn + r.earned + r.levelClear + r.livesBonus).toBe(r.total);
    expect(r.carriedIn).toBe(1200);
  });

  it("separates points earned this level from the score carried into it", () => {
    const s = new ScoreKeeper(500);
    expect(s.earnedThisLevel).toBe(0);
    s.registerBrickDestroyed();
    expect(s.earnedThisLevel).toBe(SCORE_PER_BRICK);
    expect(s.score).toBe(500 + SCORE_PER_BRICK);
  });

  it("pays no life bonus at zero lives, and never a negative one", () => {
    expect(new ScoreKeeper().registerLevelClear(0).livesBonus).toBe(0);
    expect(new ScoreKeeper().registerLevelClear(-2).livesBonus).toBe(0);
  });

  it("ends the trip on level clear, so the next level starts at x1", () => {
    const s = new ScoreKeeper();
    s.registerBrickDestroyed();
    s.registerBrickDestroyed();
    s.registerLevelClear(1);
    expect(s.comboCount).toBe(0);
  });

  it("pays a flat bonus for catching a booster", () => {
    const s = new ScoreKeeper();
    expect(s.registerBoosterCaught()).toBe(SCORE_PER_BOOSTER_CAUGHT);
    expect(s.score).toBe(SCORE_PER_BOOSTER_CAUGHT);
  });

  // Catching happens at the paddle, but it is not a paddle *bounce* — the
  // combo deliberately survives it, so grabbing a drop mid-rally neither
  // helps nor hurts the multiplier.
  it("leaves the combo untouched when a booster is caught", () => {
    const s = new ScoreKeeper();
    s.registerBrickDestroyed();
    s.registerBrickDestroyed();
    s.registerBoosterCaught();
    expect(s.comboCount).toBe(2);
    expect(s.registerBrickDestroyed()).toBe(SCORE_PER_BRICK * 3);
  });
});
