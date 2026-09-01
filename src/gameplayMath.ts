/**
 * Pure gameplay math, kept free of Phaser so it can be unit tested directly
 * instead of only through a live scene (see gameplayMath.test.ts).
 */

/**
 * The paddle-bounce formula: where the ball hit the paddle (as an offset
 * from -1 at the left edge to +1 at the right edge) determines the return
 * angle, up to a max deflection — the "angles matter" lesson from the
 * design brief's level 2. Offset is clamped to ±0.9 rather than ±1 so an
 * edge hit still angles hard without ever going fully sideways.
 */
export function bounceOffsetToAngleRad(offset: number, maxOffset = 0.9, maxDeflectionDeg = 60): number {
  const clamped = clamp(offset, -maxOffset, maxOffset);
  return degToRad(-90 + clamped * maxDeflectionDeg);
}

export function velocityFromAngle(angleRad: number, speed: number): { x: number; y: number } {
  return { x: Math.cos(angleRad) * speed, y: Math.sin(angleRad) * speed };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * The base ball speed for a given (0-indexed) level. Flat at `baseSpeed`
 * through the first `challengeStartLevelIndex` levels — the calm, all-ages,
 * non-reflex zone — then grows by `step` per level from there, on the
 * premise that clearing those first levels already marks a player as
 * "good," worth actually challenging. See constants.ts's
 * CHALLENGE_START_LEVEL_INDEX/CHALLENGE_SPEED_STEP and the design brief §3.
 */
export function ballSpeedForLevel(
  levelIndex: number,
  baseSpeed: number,
  challengeStartLevelIndex: number,
  step: number,
): number {
  return challengeRamp(levelIndex, baseSpeed, challengeStartLevelIndex, step);
}

/** The shared "flat, then climbing" curve the challenge levels run on. Two
 * things ride it now — the ball and the booster drops — at their own base
 * and their own step, so the shape lives in one place. */
function challengeRamp(levelIndex: number, base: number, challengeStartLevelIndex: number, step: number): number {
  const challengeLevels = levelIndex - challengeStartLevelIndex + 1;
  if (challengeLevels <= 0) return base;
  return base * (1 + challengeLevels * step);
}

/**
 * How fast a booster drop falls on a given (0-indexed) level.
 *
 * Same premise as the ball's ramp and the same trigger level: calm and
 * unhurried while the game is still teaching, then a real coordination
 * demand once a player has cleared the first levels and earned one. A drop
 * at full ball speed from level 1 was the version that got rejected — it
 * turns every star brick into a reflex test before anyone has agreed to
 * take one.
 *
 * `step` is far steeper than the ball's because the base starts so much
 * lower and has ground to make up. `levelBallSpeed` caps it: a drop that
 * outran the ball would be the fastest thing on screen, which is not what
 * "as fast as the ball" was ever asking for, and without the cap a steep
 * step would do exactly that as soon as levels are added past the sixth.
 */
export function powerUpDropSpeedForLevel(
  levelIndex: number,
  baseDropSpeed: number,
  levelBallSpeed: number,
  challengeStartLevelIndex: number,
  step: number,
): number {
  return Math.min(challengeRamp(levelIndex, baseDropSpeed, challengeStartLevelIndex, step), levelBallSpeed);
}

/**
 * The game's design height for a given viewport, so the canvas matches the
 * device's aspect ratio instead of letterboxing.
 *
 * The width is fixed (everything is laid out against it), so height is what
 * flexes: a 440x956 phone wants a ~1047-tall canvas to fill the screen,
 * while a landscape desktop window wants the shortest allowed one. Clamped
 * at both ends because the layout stops making sense outside that band —
 * too short and the brick grid crowds the paddle, too tall and the ball
 * spends its life in empty space.
 */
export function gameHeightForViewport(
  viewportWidth: number,
  viewportHeight: number,
  designWidth: number,
  minHeight: number,
  maxHeight: number,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return minHeight;
  return Math.round(clamp((designWidth * viewportHeight) / viewportWidth, minHeight, maxHeight));
}

/**
 * Whether a given (0-indexed) level carries an Extra Life star brick.
 *
 * Every `interval`-th level counting from 1, so with the default interval of
 * 5 that is levels 5, 10, 15, 20 — and no others. Takes the interval rather
 * than reading the constant so the rule can be tested at other spacings, and
 * so `validateLevels` can check level data against the same single
 * definition the game plays by.
 *
 * A non-positive interval means "never", not "every level": `n % 0` is NaN,
 * which compares false and would silently turn the rule off for every level
 * rather than reporting anything.
 */
export function levelGrantsExtraLife(levelIndex: number, interval: number): boolean {
  if (interval <= 0) return false;
  return (levelIndex + 1) % interval === 0;
}
