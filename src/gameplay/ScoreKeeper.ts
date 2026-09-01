import {
  SCORE_LEVEL_CLEAR,
  SCORE_MAX_COMBO,
  SCORE_PER_BOOSTER_CAUGHT,
  SCORE_PER_BRICK,
  SCORE_PER_LIFE_REMAINING,
} from "../constants";

/**
 * The run's score, and the combo state that drives it.
 *
 * Deliberately Phaser-free and owns no GameObjects — it's told what
 * happened ("a brick was destroyed", "the paddle was hit") and answers with
 * numbers, so the whole scoring model is unit-testable without a browser
 * (see ScoreKeeper.test.ts and coding-hygiene.md's testing strategy).
 *
 * **The combo is the design point, not decoration.** Points multiply by how
 * many bricks fall within a single paddle-to-paddle trip, so a shot aimed
 * to rake along a row scores far more than the same bricks poked out one at
 * a time. That rewards the planning the game claims to be about (§2's Core
 * Hook) instead of rewarding volume, which a flat per-brick score would.
 */
export class ScoreKeeper {
  private total: number;
  /** The score this level began with — everything carried in from earlier
   * levels. Kept so the win screen can separate "what you earned here" from
   * "what you already had", which is otherwise impossible to tell apart in
   * a single running total. */
  private readonly levelStartScore: number;
  /** Bricks destroyed since the last paddle contact — the current trip. */
  private bricksThisTrip = 0;

  constructor(startingScore = 0) {
    this.total = startingScore;
    this.levelStartScore = startingScore;
  }

  /** Points earned since this level began, excluding end-of-level bonuses. */
  get earnedThisLevel(): number {
    return this.total - this.levelStartScore;
  }

  get score(): number {
    return this.total;
  }

  /** The multiplier the *next* brick in this trip would score at. */
  get comboMultiplier(): number {
    return Math.min(this.bricksThisTrip + 1, SCORE_MAX_COMBO);
  }

  /** Bricks destroyed so far in the current trip — 0 right after a paddle hit. */
  get comboCount(): number {
    return this.bricksThisTrip;
  }

  /**
   * Scores one destroyed brick and advances the combo. `brickHits` is the
   * brick's *original* hit count (1 for ordinary, 2/3 for tough), so a
   * tough brick is worth proportionally more — it cost proportionally more
   * to clear. Returns the points awarded, for a floating "+N" if wanted.
   */
  registerBrickDestroyed(brickHits = 1): number {
    this.bricksThisTrip += 1;
    const multiplier = Math.min(this.bricksThisTrip, SCORE_MAX_COMBO);
    const points = SCORE_PER_BRICK * Math.max(1, brickHits) * multiplier;
    this.total += points;
    return points;
  }

  /**
   * Flat bonus for catching a booster drop. Deliberately does NOT touch the
   * combo: the catch is its own reward, and letting it extend a multiplier
   * would push players to fish for drops instead of clearing bricks.
   */
  registerBoosterCaught(): number {
    this.total += SCORE_PER_BOOSTER_CAUGHT;
    return SCORE_PER_BOOSTER_CAUGHT;
  }

  /** Ends the current trip. Every paddle contact resets the combo, which is
   * what makes "how much one shot achieved" the thing being measured. */
  registerPaddleContact(): void {
    this.bricksThisTrip = 0;
  }

  /** A miss ends the trip too — the shot is over, and it went badly. */
  registerLifeLost(): void {
    this.bricksThisTrip = 0;
  }

  /**
   * Level-clear award: a flat bonus plus one per life still in hand, so
   * finishing without missing is worth materially more than scraping
   * through.
   *
   * Returns a breakdown whose parts genuinely sum to `total`
   * (carriedIn + earned + levelClear + livesBonus), so the win screen can
   * show a player where every point came from. A breakdown listing only the
   * bonuses looks like arithmetic that doesn't work.
   */
  registerLevelClear(livesRemaining: number): {
    carriedIn: number;
    earned: number;
    levelClear: number;
    livesBonus: number;
    total: number;
  } {
    const carriedIn = this.levelStartScore;
    const earned = this.earnedThisLevel;
    const levelClear = SCORE_LEVEL_CLEAR;
    const livesBonus = Math.max(0, livesRemaining) * SCORE_PER_LIFE_REMAINING;
    this.total += levelClear + livesBonus;
    this.bricksThisTrip = 0;
    return { carriedIn, earned, levelClear, livesBonus, total: this.total };
  }
}
