/**
 * Every gray-box tuning number, key, and color in one place. Extracted from
 * PrototypeScene.ts (and the scene files) so a value like "how long Wide
 * Paddle lasts" isn't buried in the middle of a 500-line class — see
 * TASKS.md for the refactor this came out of.
 *
 * index.html's CSS background (#1b1f2a) has to be kept in sync with
 * BACKGROUND_COLOR by hand — there's no build step sharing a constant
 * between TS and static HTML/CSS here.
 */

// Scene & asset keys
export const SCENE_KEY_TITLE = "title";
export const SCENE_KEY_PROTOTYPE = "prototype";
export const TEXTURE_KEY_PIXEL = "pixel";

// PrototypeScene's state machine. A const object (not just the derived type
// below) so both source and tests can reference GAME_STATE.PLAYING instead
// of the raw string "playing" — see coding-hygiene.md.
export const GAME_STATE = {
  SERVING: "serving",
  PLAYING: "playing",
  WON: "won",
  LOST: "lost",
} as const;
export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE];

// Canvas / world
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 800;
export const BACKGROUND_COLOR = 0x1b1f2a;

// Lives — see design brief §3. Catching the ball is free and unlimited;
// only letting it fall past the paddle costs a life.
export const MAX_LIVES = 5;

// Paddle
export const PADDLE_WIDTH = 90;
export const PADDLE_HEIGHT = 14;
export const PADDLE_Y = 720;
export const PADDLE_TINT = 0xd8d8e0;

// Ball
export const BALL_RADIUS = 8;
export const BALL_SPEED = 420;
export const BALL_TINT = 0xffffff;
// Levels are 0-indexed, so index 4 is "level 5" — a player who's cleared
// the first 4 levels has demonstrated enough basic proficiency to count as
// "good," and from here on the ball gets progressively faster to actually
// challenge that player, rather than staying at the same calm baseline the
// first 4 (all-ages, non-reflex) levels intentionally hold to. See
// ballSpeedForLevel() in gameplayMath.ts and the design brief §3.
export const CHALLENGE_START_LEVEL_INDEX = 4;
export const CHALLENGE_SPEED_STEP = 0.15;
// Extra Ball/Double Ball/Triple Ball all compound additively (catching a
// Triple Ball with 3 already in play aims for 6, not a jump-to-3) — this is
// a generous upper bound on total balls in play, not a target count.
export const MAX_BALLS = 12;
// Clear of the paddle body (half paddle height + ball radius + a gap) so
// the resting ball doesn't overlap it and trigger a phantom collision.
export const BALL_SERVE_Y = PADDLE_Y - PADDLE_HEIGHT / 2 - BALL_RADIUS - 4;

// Power-up drop
export const POWER_UP_DROP_SPEED = 130;

// Every booster/hazard duration is real-time now (see the design brief's
// reconciliation record) — none of them decay by bricks destroyed anymore.
// Durations below keep the same relative ordering the old hit-counts had
// (Wide Paddle was always the longest-lasting, Burning Ball/Catch & Aim the
// shortest), just expressed in seconds instead of hits.

// Wide Paddle / Narrow Paddle (mutually exclusive — see BoosterController)
export const WIDE_PADDLE_MULTIPLIER = 1.4;
export const WIDE_PADDLE_DURATION_MS = 8000;
export const NARROW_PADDLE_MULTIPLIER = 0.5;
export const NARROW_PADDLE_DURATION_MS = 3000;

// Freeze Paddle
export const FREEZE_PADDLE_DURATION_MS = 3000;

// Slow Ball
export const SLOW_BALL_MULTIPLIER = 0.6;
export const SLOW_BALL_DURATION_MS = 3000;

// Big Ball
export const BIG_BALL_MULTIPLIER = 1.6;
export const BIG_BALL_DURATION_MS = 6000;

// Burning Ball
export const BURNING_BALL_TINT = 0xff7a45;
export const BURNING_BALL_DURATION_MS = 5000;

// Catch & Aim (sticky paddle) — ball sticks to the paddle on contact
// instead of bouncing, until released by a tap; see BoosterController.
export const STICKY_PADDLE_DURATION_MS = 5000;

// Foresight (aim guide) — dotted trajectory preview, only drawn while a
// ball is stuck via Catch & Aim (see PrototypeScene's update()).
export const FORESIGHT_DURATION_MS = 6000;
export const FORESIGHT_DOT_SPACING = 14;
export const FORESIGHT_PREVIEW_LENGTH = 260;
export const FORESIGHT_MAX_WALL_BOUNCES = 2;

// Double Ball / Triple Ball — one-shot spawns like Extra Ball (no decay),
// just adding more than one ball per catch. Purely additive/compounding:
// each catch adds this many *more* balls to however many are already in
// play, not a jump to a fixed total.
export const DOUBLE_BALL_SPAWN_COUNT = 2;
export const TRIPLE_BALL_SPAWN_COUNT = 3;

// Brick grid
export const BRICK_COLS = 8;
export const BRICK_ROWS = 7;
export const BRICK_WIDTH = 52;
export const BRICK_HEIGHT = 24;
export const BRICK_GAP = 6;
export const BRICK_TOP = 90;
export const BRICK_TINT_NORMAL = 0x6c7a96;
export const BRICK_TINT_STAR = 0xf4c95d;

// Tough bricks — the top N rows of every level need multiple hits to
// destroy (a structural brick property, not a catchable booster).
export const TOUGH_BRICK_ROWS = 1;
export const TOUGH_BRICK_HITS = 2;
export const TOUGH_BRICK_LABEL_COLOR = "#1b1f2a";

// HUD / UI text colors
export const TEXT_COLOR_WHITE = "#ffffff";
export const TEXT_COLOR_MUTED = "#9aa5b8";
export const TEXT_COLOR_ACCENT = "#8fd3ff";
export const TEXT_COLOR_ACCENT_HOVER = "#a8dfff";
export const TEXT_COLOR_GOLD = "#f4c95d";
// Dark text sitting on an accent-colored button background (the Play
// button) — matches BACKGROUND_COLOR's hex, but named for what it's used
// for rather than tied to that constant, since the two could diverge.
export const TEXT_COLOR_ON_ACCENT = "#1b1f2a";
