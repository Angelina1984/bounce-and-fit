import { SCORE_LEVEL_CLEAR, SCORE_MAX_COMBO, SCORE_PER_BRICK, SCORE_PER_LIFE_REMAINING } from "../constants";

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
  /** Bricks destroyed since the last paddle contact — the current trip. */
  private bricksThisTrip = 0;

  constructor(startingScore = 0) {
    this.total = startingScore;
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
   * through. Returns the breakdown for the win screen to show.
   */
  registerLevelClear(livesRemaining: number): { levelClear: number; livesBonus: number; total: number } {
    const levelClear = SCORE_LEVEL_CLEAR;
    const livesBonus = Math.max(0, livesRemaining) * SCORE_PER_LIFE_REMAINING;
    this.total += levelClear + livesBonus;
    this.bricksThisTrip = 0;
    return { levelClear, livesBonus, total: this.total };
  }
}
