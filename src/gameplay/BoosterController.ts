// Type-only: this file never touches the Phaser runtime (see the pure
// clamp()/degToRad() calls below, in place of Phaser.Math.*) — a real
// `import Phaser from "phaser"` crashes outside a browser (Device.OS reads
// `window` at module-load time), which would make this class unit-testable
// only under a DOM-emulating test environment. Keeping it type-only is what
// lets BoosterController.test.ts run under plain Vitest.
import type Phaser from "phaser";
import {
  BALL_RADIUS,
  BIG_BALL_DURATION_MS,
  BIG_BALL_MULTIPLIER,
  BURNING_BALL_DURATION_MS,
  BURNING_BALL_TINT,
  DOUBLE_BALL_SPAWN_COUNT,
  FORESIGHT_DURATION_MS,
  FREEZE_PADDLE_DURATION_MS,
  MAX_BALLS,
  NARROW_PADDLE_DURATION_MS,
  NARROW_PADDLE_MULTIPLIER,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  SLOW_BALL_DURATION_MS,
  SLOW_BALL_MULTIPLIER,
  STICKY_PADDLE_DURATION_MS,
  TRIPLE_BALL_SPAWN_COUNT,
  WIDE_PADDLE_DURATION_MS,
  WIDE_PADDLE_MULTIPLIER,
} from "../constants";
import { clamp, degToRad } from "../gameplayMath";
import { POWER_UP_LABELS, POWER_UP_TINTS } from "../levelData";
import type { PowerUpType } from "../levelData";

/** One active timed effect, as the HUD needs to draw it. */
export interface ActiveBooster {
  type: PowerUpType;
  label: string;
  tint: number;
  /** Milliseconds left on its timer; 0 once the timer has fired. */
  remainingMs: number;
}

type PaddleWidthState = "normal" | "wide" | "narrow";

export interface BoosterControllerDeps {
  scene: Phaser.Scene;
  paddle: Phaser.Physics.Arcade.Image;
  balls: Phaser.Physics.Arcade.Group;
  getPrimaryBall: () => Phaser.Physics.Arcade.Image;
  createBall: (x: number, y: number) => Phaser.Physics.Arcade.Image;
  /** The level's current base ball speed (see PrototypeScene's
   * `ballSpeed`/`ballSpeedForLevel()`) — Extra Ball/Double Ball/Triple Ball
   * clamp a spawned ball's speed against this, not the flat BALL_SPEED
   * constant, so a spawn on a later, faster level doesn't get capped too low. */
  getBallSpeed: () => number;
  /** Called after any state change (applied, decayed, reset) so the HUD can refresh. */
  onChange: () => void;
}

/**
 * Owns every booster and hazard's state, application, and reset — pulled
 * out of PrototypeScene so the scene only has to know "apply this type" and
 * "a life was lost", not the mechanics of each of the 9 power-ups. See the
 * design brief §3 for what each does.
 *
 * Every timed booster/hazard is real-time now (a `scene.time.delayedCall`),
 * not decayed by bricks destroyed — see the design brief's reconciliation
 * record for why the whole catalog moved off "N bricks destroyed" durations.
 * A direct consequence: nothing here has state worth snapshotting across a
 * "Next Level" transition anymore, since real-time timers don't survive
 * `scene.restart()` regardless — the carry-over mechanism this class used
 * to expose (`getCarrySnapshot()`/`applySnapshot()`) was removed along with
 * the last hit-based booster, not left in as dead code.
 *
 * Must be reconstructed every time PrototypeScene#create() runs (retry,
 * next level) — its paddle/balls references would otherwise go stale, since
 * Phaser destroys and recreates those GameObjects on every scene restart.
 */
export class BoosterController {
  private widthState: PaddleWidthState = "normal";
  private frozen = false;
  private burning = false;
  private big = false;
  private speed = 1;
  private sticky = false;
  private foresight = false;

  private wideTimer?: Phaser.Time.TimerEvent;
  private narrowTimer?: Phaser.Time.TimerEvent;
  private freezeTimer?: Phaser.Time.TimerEvent;
  private slowBallTimer?: Phaser.Time.TimerEvent;
  private bigBallTimer?: Phaser.Time.TimerEvent;
  private burningBallTimer?: Phaser.Time.TimerEvent;
  private stickyPaddleTimer?: Phaser.Time.TimerEvent;
  private foresightTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly deps: BoosterControllerDeps) {}

  get paddleWidthState(): PaddleWidthState {
    return this.widthState;
  }

  get paddleFrozen(): boolean {
    return this.frozen;
  }

  get burningActive(): boolean {
    return this.burning;
  }

  get ballsBig(): boolean {
    return this.big;
  }

  get speedMultiplier(): number {
    return this.speed;
  }

  get stickyPaddleActive(): boolean {
    return this.sticky;
  }

  get foresightActive(): boolean {
    return this.foresight;
  }

  apply(type: PowerUpType): void {
    switch (type) {
      case "wide-paddle":
        this.narrowTimer?.remove();
        this.narrowTimer = undefined;
        this.setPaddleWidth("wide");
        this.wideTimer?.remove();
        this.wideTimer = this.deps.scene.time.delayedCall(WIDE_PADDLE_DURATION_MS, () => {
          if (this.widthState === "wide") this.setPaddleWidth("normal");
          this.wideTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "narrow-paddle":
        // Cancel a running Wide Paddle rather than let the two fight over
        // the paddle's width — the hazard always wins once triggered.
        this.wideTimer?.remove();
        this.wideTimer = undefined;
        this.setPaddleWidth("narrow");
        this.narrowTimer?.remove();
        this.narrowTimer = this.deps.scene.time.delayedCall(NARROW_PADDLE_DURATION_MS, () => {
          if (this.widthState === "narrow") this.setPaddleWidth("normal");
          this.narrowTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "freeze-paddle":
        this.freezeTimer?.remove();
        this.frozen = true;
        this.freezeTimer = this.deps.scene.time.delayedCall(FREEZE_PADDLE_DURATION_MS, () => {
          this.frozen = false;
          this.freezeTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "slow-ball":
        // Reported live as "Slow Ball didn't really slow": this.speed was
        // only ever read at the *next* paddle bounce or serve — a ball
        // already in flight kept its pre-catch velocity untouched. With a
        // short 3-second window, that next bounce often never happens
        // before the timer expires, so the booster could visibly do
        // nothing at all. Rescaling every ball currently in flight here
        // (and symmetrically on revert below) makes the effect immediate
        // and guaranteed, not dependent on when the ball next hits the paddle.
        this.slowBallTimer?.remove();
        this.speed = SLOW_BALL_MULTIPLIER;
        this.rescaleBallSpeeds(this.deps.getBallSpeed() * SLOW_BALL_MULTIPLIER);
        this.slowBallTimer = this.deps.scene.time.delayedCall(SLOW_BALL_DURATION_MS, () => {
          this.speed = 1;
          this.rescaleBallSpeeds(this.deps.getBallSpeed());
          this.slowBallTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "big-ball":
        this.bigBallTimer?.remove();
        this.setBallsBig(true);
        this.bigBallTimer = this.deps.scene.time.delayedCall(BIG_BALL_DURATION_MS, () => {
          this.setBallsBig(false);
          this.bigBallTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "burning-ball":
        this.burningBallTimer?.remove();
        this.burning = true;
        this.setBallsTint(BURNING_BALL_TINT);
        this.burningBallTimer = this.deps.scene.time.delayedCall(BURNING_BALL_DURATION_MS, () => {
          this.burning = false;
          this.setBallsTint(0xffffff);
          this.burningBallTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "extra-ball":
        this.spawnExtraBalls(1);
        break;

      case "double-ball":
        this.spawnExtraBalls(DOUBLE_BALL_SPAWN_COUNT);
        break;

      case "triple-ball":
        this.spawnExtraBalls(TRIPLE_BALL_SPAWN_COUNT);
        break;

      case "sticky-paddle":
        this.stickyPaddleTimer?.remove();
        this.sticky = true;
        this.stickyPaddleTimer = this.deps.scene.time.delayedCall(STICKY_PADDLE_DURATION_MS, () => {
          this.sticky = false;
          this.stickyPaddleTimer = undefined;
          this.deps.onChange();
        });
        break;

      case "foresight":
        this.foresightTimer?.remove();
        this.foresight = true;
        this.foresightTimer = this.deps.scene.time.delayedCall(FORESIGHT_DURATION_MS, () => {
          this.foresight = false;
          this.foresightTimer = undefined;
          this.deps.onChange();
        });
        break;
    }
    this.deps.onChange();
  }

  /** Clears every active booster and hazard back to native — called when a
   * life is lost, so a miss can't leave one running for free afterward. */
  resetAll(): void {
    this.setPaddleWidth("normal");
    this.wideTimer?.remove();
    this.wideTimer = undefined;
    this.narrowTimer?.remove();
    this.narrowTimer = undefined;
    this.freezeTimer?.remove();
    this.freezeTimer = undefined;
    this.slowBallTimer?.remove();
    this.slowBallTimer = undefined;
    this.bigBallTimer?.remove();
    this.bigBallTimer = undefined;
    this.burningBallTimer?.remove();
    this.burningBallTimer = undefined;
    this.stickyPaddleTimer?.remove();
    this.stickyPaddleTimer = undefined;
    this.foresightTimer?.remove();
    this.foresightTimer = undefined;
    this.frozen = false;
    this.speed = 1;
    this.burning = false;
    this.sticky = false;
    this.foresight = false;
    this.setBallsBig(false);
    this.setBallsTint(0xffffff);
    this.deps.onChange();
  }

  /**
   * Every currently-active timed effect with its remaining time, newest
   * timers last. Feeds the HUD's countdown badges.
   *
   * Reads each effect's *state flag* to decide whether it's active, and its
   * timer only for the remaining milliseconds — not the other way round.
   * A timer that has already fired is cleared to undefined by its own
   * callback, so trusting the flag keeps this correct on the frame an
   * effect ends, and keeps hazards (which set state the same way) in the
   * list alongside boosters.
   */
  getActiveBoosters(): ActiveBooster[] {
    const remaining = (timer?: Phaser.Time.TimerEvent): number => (timer ? Math.max(0, timer.getRemaining()) : 0);

    const active: ActiveBooster[] = [];
    const add = (type: PowerUpType, timer?: Phaser.Time.TimerEvent) =>
      active.push({ type, label: POWER_UP_LABELS[type], tint: POWER_UP_TINTS[type], remainingMs: remaining(timer) });

    if (this.widthState === "wide") add("wide-paddle", this.wideTimer);
    if (this.widthState === "narrow") add("narrow-paddle", this.narrowTimer);
    if (this.frozen) add("freeze-paddle", this.freezeTimer);
    if (this.speed !== 1) add("slow-ball", this.slowBallTimer);
    if (this.big) add("big-ball", this.bigBallTimer);
    if (this.burning) add("burning-ball", this.burningBallTimer);
    if (this.sticky) add("sticky-paddle", this.stickyPaddleTimer);
    if (this.foresight) add("foresight", this.foresightTimer);
    return active;
  }

  /** Extra Ball/Double Ball/Triple Ball all funnel through here — the only
   * difference between them is how many balls one catch spawns (1/2/3, see
   * DOUBLE_BALL_SPAWN_COUNT/TRIPLE_BALL_SPAWN_COUNT). Purely additive: each
   * catch adds `count` more balls on top of however many are already in
   * play, up to MAX_BALLS — catching Triple Ball with 3 balls already out
   * aims for 6, not a jump to 3. Stops silently once the cap is hit rather
   * than spawning a partial batch loudly; catching with no room left is a
   * no-op, same as it always was for Extra Ball at the old cap. */
  private spawnExtraBalls(count: number): void {
    const source = this.deps.getPrimaryBall();
    const sourceBody = source.body as Phaser.Physics.Arcade.Body;
    const levelBallSpeed = this.deps.getBallSpeed();
    const baseSpeed = clamp(
      Math.hypot(sourceBody.velocity.x, sourceBody.velocity.y),
      levelBallSpeed * SLOW_BALL_MULTIPLIER,
      levelBallSpeed,
    );
    const baseAngle =
      sourceBody.velocity.x === 0 && sourceBody.velocity.y === 0
        ? degToRad(-90)
        : Math.atan2(sourceBody.velocity.y, sourceBody.velocity.x);

    for (let i = 0; i < count; i++) {
      if (this.deps.balls.countActive(true) >= MAX_BALLS) return;

      const extra = this.deps.createBall(source.x, source.y);

      // Add to the group BEFORE setting velocity/size/tint below — Group#add()
      // re-applies the group's configured physics defaults to every member
      // (see the physics.add.group() gotcha in coding-hygiene.md), including
      // velocityX/velocityY resetting to 0 since this group's config doesn't
      // override them. Setting velocity first and adding second silently
      // zeroed it right back out: the extra ball spawned, then immediately
      // stopped dead wherever it appeared, while the original ball kept
      // playing normally.
      this.deps.balls.add(extra);

      // Diverge each ball from the source's trajectory, and from each other
      // when spawning more than one at once — "balls spaced in trajectory
      // to avoid chaotic spray" (design brief §3, Multi-Ball).
      const angle = baseAngle + degToRad(35 + i * 20);
      const extraBody = extra.body as Phaser.Physics.Arcade.Body;
      extraBody.setVelocity(Math.cos(angle) * baseSpeed, Math.sin(angle) * baseSpeed);

      if (this.big) extra.setDisplaySize(BALL_RADIUS * BIG_BALL_MULTIPLIER * 2, BALL_RADIUS * BIG_BALL_MULTIPLIER * 2);
      if (this.burning) extra.setTint(BURNING_BALL_TINT);
    }
  }

  private setPaddleWidth(widthState: PaddleWidthState): void {
    this.widthState = widthState;
    // Only setDisplaySize() here — Arcade bodies auto-resize every physics
    // step from the sprite's actual scale (Body#updateBounds tracks
    // sourceWidth/Height × current scale). Also calling body.setSize() with
    // the already-scaled display size double/triple-multiplies that scale
    // and blows the collision box up far beyond the paddle, so the ball
    // ends up bouncing off an invisible wall well above the visible sprite.
    const width =
      widthState === "wide"
        ? PADDLE_WIDTH * WIDE_PADDLE_MULTIPLIER
        : widthState === "narrow"
          ? PADDLE_WIDTH * NARROW_PADDLE_MULTIPLIER
          : PADDLE_WIDTH;
    this.deps.paddle.setDisplaySize(width, PADDLE_HEIGHT);
  }

  private setBallsBig(big: boolean): void {
    this.big = big;
    const size = (big ? BALL_RADIUS * BIG_BALL_MULTIPLIER : BALL_RADIUS) * 2;
    this.deps.balls.getChildren().forEach((child) => (child as Phaser.Physics.Arcade.Image).setDisplaySize(size, size));
  }

  private setBallsTint(color: number): void {
    this.deps.balls.getChildren().forEach((child) => (child as Phaser.Physics.Arcade.Image).setTint(color));
  }

  /** Rescales every ball currently in flight to `targetSpeed`, preserving
   * each one's current direction — used by Slow Ball's apply/revert so the
   * change is immediate, not dependent on the next paddle bounce (see the
   * comment in apply()'s "slow-ball" case). Resting balls (serving or stuck
   * via Catch & Aim, both zero-velocity) are left alone — there's nothing
   * to rescale, and forcing a nonzero velocity would launch them early. */
  private rescaleBallSpeeds(targetSpeed: number): void {
    this.deps.balls.getChildren().forEach((child) => {
      const body = (child as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body;
      if (body.velocity.x === 0 && body.velocity.y === 0) return;
      const angle = Math.atan2(body.velocity.y, body.velocity.x);
      body.setVelocity(Math.cos(angle) * targetSpeed, Math.sin(angle) * targetSpeed);
    });
  }
}
