import { PERSONAL_BEST_STORAGE_KEY } from "../constants";

/**
 * The best score across runs, kept in `localStorage`.
 *
 * The design brief's §6b puts save state in MVP scope, not the prototype
 * ("no high-score persistence"), so this is a deliberate early exception,
 * asked for directly: without a number to beat, a run that ends has nothing
 * to compare itself to, which is most of why replaying one felt pointless.
 * It is the only persisted state in the game, and it stays that way — the
 * rest of §6b's save scope is still deferred.
 *
 * The Storage is passed in rather than reaching for `window.localStorage`
 * so this is testable against a fake, and so a caller that has no storage
 * at all (SSR, a locked-down browser) is an ordinary case rather than a
 * crash.
 */

/** A Storage that may be absent — every entry point tolerates `undefined`. */
export type MaybeStorage = Pick<Storage, "getItem" | "setItem"> | undefined;

/**
 * The stored best, or 0 if there isn't a usable one.
 *
 * Every failure mode collapses to 0 rather than propagating: reading
 * `localStorage` *throws* (not returns null) in Safari's private mode and
 * wherever site data is blocked, and the stored string is user-editable, so
 * a corrupt, negative, infinite or non-numeric value has to be treated as
 * "no best yet". A high score is not worth breaking the title screen over.
 */
export function readPersonalBest(storage: MaybeStorage): number {
  if (!storage) return 0;
  try {
    const parsed = Number(storage.getItem(PERSONAL_BEST_STORAGE_KEY));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
  } catch {
    return 0;
  }
}

/**
 * Records `score` if it beats the stored best, and reports what happened.
 *
 * Returns the best *after* the write and whether this call set it, so a
 * caller can both display the number and celebrate the moment without
 * reading back and re-deriving which it was. A write that throws still
 * returns the correct in-memory answer: the run genuinely was the best one,
 * and the screen should say so even when the browser refuses to remember it.
 */
export function recordScore(storage: MaybeStorage, score: number): { best: number; isNewBest: boolean } {
  const previous = readPersonalBest(storage);
  // Strictly greater, so replaying to exactly the same total is not
  // announced as a new best — and a zero-score run never is.
  if (!Number.isFinite(score) || score <= previous) return { best: previous, isNewBest: false };

  const best = Math.floor(score);
  try {
    storage?.setItem(PERSONAL_BEST_STORAGE_KEY, String(best));
  } catch {
    // Storage full or blocked. The run still was the best of the session.
  }
  return { best, isNewBest: true };
}
