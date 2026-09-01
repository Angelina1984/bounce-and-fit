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
// Generated at runtime by ui/textures.ts — rounded, beveled, grayscale so
// every existing setTint() call still colors them correctly.
export const TEXTURE_KEY_TILE = "candy-tile";
export const TEXTURE_KEY_PADDLE = "candy-paddle";
export const TEXTURE_KEY_BALL = "candy-ball";
export const TEXTURE_KEY_CHIP = "candy-chip";
export const TEXTURE_KEY_BACKDROP = "candy-backdrop";

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

// Canvas / world. Width is fixed — every layout number below is measured
// against it. Height is derived from the viewport's aspect at boot (see
// gameHeightForViewport() and main.ts) so the canvas fills a phone screen
// instead of letterboxing, and is clamped to the band where this layout
// still works. GAME_HEIGHT is the fallback/design value.
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 900;
export const MIN_GAME_HEIGHT = 760;
export const MAX_GAME_HEIGHT = 1100;
export const BACKGROUND_COLOR = 0x35196a;

// Lives — see design brief §3. Catching the ball is free and unlimited;
// only letting it fall past the paddle costs a life.
export const MAX_LIVES = 5;

// Paddle. Its Y is derived from the actual canvas height at create() time
// (canvas height is viewport-dependent — see above), not a fixed constant:
// this is how far above the bottom edge it sits.
export const PADDLE_WIDTH = 90;
export const PADDLE_HEIGHT = 10;
export const PADDLE_BOTTOM_MARGIN = 80;
export const PADDLE_TINT = 0xe8e4ff;

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
// How far above the paddle's center a resting ball sits — clear of the
// paddle body (half paddle height + ball radius + a gap) so it doesn't
// overlap and trigger a phantom collision. Applied to the live paddle Y.
export const BALL_SERVE_OFFSET_Y = PADDLE_HEIGHT / 2 + BALL_RADIUS + 4;

// Power-up drop.
//
// The base is the *calm* speed, used through the non-challenge levels, and
// it ramps from CHALLENGE_START_LEVEL_INDEX on exactly like the ball does —
// see powerUpDropSpeedForLevel(). Matching the ball from level 1 (which
// this briefly did) made every star brick a reflex test before the game had
// asked anyone for reflexes; 130 before that read as floating. This keeps
// the design brief's §3 "readable drop" promise where it matters, in the
// all-ages levels, and spends it deliberately where the player has already
// proven the coordination.
//
// Concretely: 170 through levels 1-4, 323 on level 5, 476 on level 6 — and
// never faster than that level's ball, which is what the cap is for.
export const POWER_UP_DROP_SPEED = 170;
// Steeper than CHALLENGE_SPEED_STEP because the drop starts at 40% of the
// ball's speed and only has the challenge levels to close the gap in.
export const POWER_UP_DROP_SPEED_STEP = 0.9;
export const POWER_UP_SIZE = 16;

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

// Fast Ball — Slow Ball's mirror, and the first booster in the catalog that
// is a *trade* rather than a straight gift: a quicker ball clears bricks
// faster and feeds the combo (which counts bricks per paddle trip, so a
// faster ball rakes more per trip), at the cost of less time to read the
// bounce. Kept at 1.5x rather than something wilder, and short, because §7's
// all-ages positioning means the ceiling on "how fast is fun" is lower here
// than in a reflex game. The two share one slot in BoosterController —
// catching either replaces the other rather than multiplying with it.
export const FAST_BALL_MULTIPLIER = 1.5;
export const FAST_BALL_DURATION_MS = 5000;

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

// Scoring — see the design brief's scoring reconciliation record. The
// combo is the part that carries the design intent: points scale with how
// many bricks a single well-aimed shot clears, so planning a angle that
// rakes a row beats poking at bricks one at a time. Capped so Burning Ball
// (which can pierce a whole column in one trip) stays a strong reward
// rather than a runaway one.
export const SCORE_PER_BRICK = 10;
export const SCORE_MAX_COMBO = 5;
// Catching a drop is a real intercept across the arena and was worth
// nothing until now. A flat bonus rewards it without punishing a miss,
// which §3 explicitly forbids — the drop you don't catch still costs you
// nothing, you just don't get the bonus.
export const SCORE_PER_BOOSTER_CAUGHT = 25;
// The one persisted key in the game. Namespaced because a dev build shares
// localStorage with everything else served from the same origin.
export const PERSONAL_BEST_STORAGE_KEY = "bounce-and-fit:personal-best";
export const SCORE_LEVEL_CLEAR = 100;
export const SCORE_PER_LIFE_REMAINING = 50;

// Playfield arena — the ball's world bounds are inset to these, and a
// frame is drawn exactly on them, so the walls the player can see are the
// walls the ball actually bounces off. Previously the bounds were the raw
// canvas edge, which left the bricks floating in an undefined space.
export const ARENA_MARGIN_X = 7;
export const ARENA_TOP = 104;

// Brick grid
export const BRICK_COLS = 8;
export const BRICK_ROWS = 7;
export const BRICK_WIDTH = 51;
export const BRICK_HEIGHT = 32;
export const BRICK_GAP = 5;
// Pushed down from the old gray-box value to clear the candy-UI HUD panel
// in the top-left corner (see Hud.ts's corner pill).
export const BRICK_TOP = 132;
export const BRICK_TINT_STAR = 0xf4c95d;

// Tough bricks — how many hits a brick takes, read off its shade rather
// than a number printed inside it. Indexed by hits remaining minus one, so
// index 0 is an ordinary one-hit brick and darker means more hits left.
// Each hit re-tints the brick one step lighter, so it visibly wears down
// toward an ordinary brick and the player never has to read a digit.
// Adding a shade here is all it takes to support a 4-hit brick.
export const BRICK_TINTS_BY_HITS = [0x8fa4e8, 0x4b62c4, 0x27317f] as const;
export const MAX_BRICK_HITS = BRICK_TINTS_BY_HITS.length;
export const BRICK_TINT_NORMAL = BRICK_TINTS_BY_HITS[0];

// Candy UI palette — deep violet + warm gold, for the pill badges and
// glossy buttons built in ui/theme.ts. Scoped to HUD/title chrome for now;
// bricks/paddle/ball tints below are a later pass — see the design brief's
// "Prototype to Polish" reconciliation record.
// Saturated on purpose. The first pass picked a panel violet (0x3d2470)
// only a shade off BACKGROUND_COLOR, so every badge and button sank into
// the ground it sat on — the reference art gets its "candy" read from a
// bright face against a deep ground, not from the outline around it.
export const COLOR_PANEL_VIOLET = 0x5b2fc9;
export const COLOR_GOLD = 0xffc93c;
export const COLOR_GOLD_LIGHT = 0xffe8a3;
// Deep amber rather than a muted brown-gold: it is the *bottom* of the rim
// gradient, and a rim that darkens toward orange is what makes the gold
// read as metal instead of as a yellow line.
export const COLOR_GOLD_DARK = 0xd88a12;
// Primary-action green. Gold is the chrome accent (rims, HUD readouts), so
// a gold button is the same material as the frame around it and stops
// reading as the thing to press — the reference screenshots put every
// primary CTA in green inside a gold rim for exactly that reason.
export const COLOR_BUTTON_GREEN = 0x6ecc22;

// Every text object uses this. The quoted family comes from index.html's
// Google Fonts link; the fallbacks matter because a missing webfont
// silently reverts Phaser to monospace, which is exactly the look this
// replaced.
export const FONT_FAMILY = '"Fredoka", "Trebuchet MS", "Segoe UI", sans-serif';

// HUD / UI text colors
export const TEXT_COLOR_WHITE = "#ffffff";
export const TEXT_COLOR_MUTED = "#c9b8ea";
export const TEXT_COLOR_GOLD = "#ffd75e";
// Dark violet outline stroke for bold text sitting on busy/bright
// backgrounds (pill badges, glossy buttons) — matches BACKGROUND_COLOR's
// hue rather than its exact hex, since the two could diverge.
export const TEXT_COLOR_OUTLINE = "#1d0f3d";
