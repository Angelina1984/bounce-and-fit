import Phaser from "phaser";
import { BoosterController } from "../gameplay/BoosterController";
import { ScoreKeeper } from "../gameplay/ScoreKeeper";
import { recordScore } from "../gameplay/personalBest";
import { buildBrickGrid } from "../gameplay/brickGrid";
import {
  ballSpeedForLevel,
  bounceOffsetToAngleRad,
  powerUpDropSpeedForLevel,
  velocityFromAngle,
} from "../gameplayMath";
import {
  BALL_RADIUS,
  ARENA_MARGIN_X,
  ARENA_TOP,
  BALL_SERVE_OFFSET_Y,
  EXTRA_LIFE_GAIN,
  BRICK_TINTS_BY_HITS,
  BALL_SPEED,
  BALL_TINT,
  CHALLENGE_SPEED_STEP,
  CHALLENGE_START_LEVEL_INDEX,
  FORESIGHT_DOT_SPACING,
  FORESIGHT_MAX_WALL_BOUNCES,
  FORESIGHT_PREVIEW_LENGTH,
  GAME_STATE,
  MAX_LIVES,
  PADDLE_HEIGHT,
  PADDLE_TINT,
  PADDLE_WIDTH,
  PADDLE_BOTTOM_MARGIN,
  POWER_UP_DROP_SPEED,
  POWER_UP_DROP_SPEED_STEP,
  SCENE_KEY_PROTOTYPE,
  POWER_UP_SIZE,
  TEXTURE_KEY_BALL,
  TEXTURE_KEY_CHIP,
  TEXTURE_KEY_PADDLE,
  TEXTURE_KEY_PIXEL,
} from "../constants";
import type { GameState } from "../constants";
import { LEVELS, POWER_UP_TINTS } from "../levelData";
import type { BoosterType, HazardType } from "../levelData";
import { Hud } from "./Hud";
import { addBackdrop, ensureCandyTextures } from "../ui/textures";
import { paintArena } from "../ui/theme";
import { brickBurst, catchPop, lifeLostShake, paddleSquash } from "../ui/juice";

// Matches Phaser.Types.Physics.Arcade.ArcadePhysicsCallback's parameter
// type — collider callbacks receive this union, not a concrete GameObject.
type Collided =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Physics.Arcade.Body
  | Phaser.Physics.Arcade.StaticBody
  | Phaser.Tilemaps.Tile;

interface PrototypeSceneData {
  /** Set only by the "Next Level" handler in endLevel() — everything else
   * (first boot, retry, Play Again) omits this so create() defaults to a
   * full life count. Passed as one-shot scene-restart data rather than a
   * persistent field, so there's nothing to remember to reset between runs. */
  carryLives?: boolean;
  /** The run score to continue from, set by "Next Level" only. Omitted on a
   * retry or "Play Again", which start a fresh run back at zero — score is
   * a run-wide resource, same as lives. */
  carryScore?: number;
}

// Lives and score are the *only* two things that cross a level boundary,
// and both are run-wide resources by design. Nothing a player earned inside
// a level does: extra balls used to (an `extraBallCount` was snapshotted at
// the win and rebuilt in the next level's serving formation) and no longer
// do, and no booster or hazard ever did — every one of them is a real-time
// timer now (see the design brief's reconciliation record), and real-time
// timers don't survive scene.restart() regardless of whether anything tries
// to snapshot them. Every level therefore opens the same way: one ball, no
// effects running.

export class PrototypeScene extends Phaser.Scene {
  private paddle!: Phaser.Physics.Arcade.Image;
  private balls!: Phaser.Physics.Arcade.Group;
  private primaryBall!: Phaser.Physics.Arcade.Image;
  private bricks!: Phaser.Physics.Arcade.StaticGroup;
  private powerUps!: Phaser.Physics.Arcade.Group;
  private boosters!: BoosterController;
  private hud!: Hud;
  private scoring!: ScoreKeeper;
  private foresightGraphics!: Phaser.GameObjects.Graphics;

  // Layout derived from the live canvas height, which depends on the
  // viewport's aspect (see main.ts) — not fixed constants.
  private paddleY = 0;
  private ballServeY = 0;
  private arenaLeft = 0;
  private arenaRight = 0;

  private livesRemaining = MAX_LIVES;
  private state: GameState = GAME_STATE.SERVING;
  private levelIndex = 0;
  // Recomputed in create() from levelIndex — flat through the first
  // CHALLENGE_START_LEVEL_INDEX levels, then progressively faster from
  // there (see ballSpeedForLevel() and the design brief §3).
  private ballSpeed = BALL_SPEED;
  // Recomputed in create() alongside ballSpeed, and capped by it — drops
  // ride the same challenge ramp the ball does, from their own calm base.
  private dropSpeed = POWER_UP_DROP_SPEED;

  constructor() {
    super(SCENE_KEY_PROTOTYPE);
  }

  preload(): void {
    // Gray-box: 1x1 white pixel, tinted per-object. No art pass yet.
    // Textures are global, not scene-scoped, but preload() reruns on every
    // scene.restart() (retry, next level) — regenerating the same key logs
    // a "Texture key already in use" error, so only do it once.
    if (!this.textures.exists(TEXTURE_KEY_PIXEL)) {
      this.textures.generate(TEXTURE_KEY_PIXEL, { data: ["1"], pixelWidth: 1, pixelHeight: 1 });
    }
    ensureCandyTextures(this);
  }

  create(data: PrototypeSceneData = {}): void {
    const { width, height } = this.scale;

    this.paddleY = height - PADDLE_BOTTOM_MARGIN;
    this.ballServeY = this.paddleY - BALL_SERVE_OFFSET_Y;

    addBackdrop(this);

    // The arena's visible frame and the physics world bounds are the same
    // rectangle by construction — see paintArena()'s note on why a wall you
    // can see but not bounce off is worse than none.
    this.arenaLeft = ARENA_MARGIN_X;
    this.arenaRight = width - ARENA_MARGIN_X;
    const arenaWidth = this.arenaRight - this.arenaLeft;
    this.physics.world.setBounds(this.arenaLeft, ARENA_TOP, arenaWidth, height - ARENA_TOP);
    paintArena(this.add.graphics().setDepth(-50), this.arenaLeft, ARENA_TOP, arenaWidth, height - ARENA_TOP);

    // scene.restart() (from "Tap to retry"/"Next Level"/"Play Again") reuses
    // this same instance rather than reconstructing it, so class-field
    // initializers won't run again — reset state explicitly here instead.
    // levelIndex is deliberately NOT reset — it's set by the action button
    // right before restart() to pick which level loads next, and must
    // survive the restart it triggers.
    if (!data.carryLives) {
      this.livesRemaining = MAX_LIVES;
    }
    this.state = GAME_STATE.SERVING;
    this.scoring = new ScoreKeeper(data.carryScore ?? 0);
    this.ballSpeed = ballSpeedForLevel(this.levelIndex, BALL_SPEED, CHALLENGE_START_LEVEL_INDEX, CHALLENGE_SPEED_STEP);
    this.dropSpeed = powerUpDropSpeedForLevel(
      this.levelIndex,
      POWER_UP_DROP_SPEED,
      this.ballSpeed,
      CHALLENGE_START_LEVEL_INDEX,
      POWER_UP_DROP_SPEED_STEP,
    );

    this.paddle = this.physics.add
      .image(width / 2, this.paddleY, TEXTURE_KEY_PADDLE)
      .setDisplaySize(PADDLE_WIDTH, PADDLE_HEIGHT)
      .setTint(PADDLE_TINT)
      .setImmovable(true);
    (this.paddle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // World bottom stays open: a missed ball must actually fall past the
    // screen for update()'s y > height + radius check to ever see it,
    // otherwise it just bounces off the floor like a wall and the level
    // can never end. (Body#checkWorldBounds reads world.checkCollision,
    // not body.checkCollision — the per-body flag only gates collider
    // resolution, so it must be set here on the world, not the body.)
    this.physics.world.setBoundsCollision(true, true, true, false);

    // Group-level physics defaults, not per-ball setDisplaySize-style calls —
    // Arcade's Group#createCallbackHandler runs on every group.add(), and it
    // unconditionally re-applies the group's defaults (collideWorldBounds:
    // false, bounceX/Y: 0, etc. — Phaser's own defaults, not "leave alone")
    // to whatever was already set on that body. A ball configured correctly
    // in createBallSprite() and then added to an unconfigured group had all
    // of that silently wiped back to collideWorldBounds=false, bounce=(0,0)
    // — a ball that no longer bounces off world edges, and stops dead
    // instead of bouncing off a brick. Configuring these here means every
    // ball — the initial one and every Extra Ball spawned later — gets the
    // right physics from the group itself, not from a call that's about to
    // be undone.
    this.balls = this.physics.add.group({ collideWorldBounds: true, bounceX: 1, bounceY: 1 });
    // Exactly one ball, every level, always — see PrototypeSceneData.
    this.primaryBall = this.createBallSprite(width / 2, this.ballServeY);
    this.balls.add(this.primaryBall);
    this.positionBallsForServe();

    this.bricks = this.physics.add.staticGroup();
    buildBrickGrid(this, this.bricks, LEVELS[this.levelIndex]);

    this.powerUps = this.physics.add.group();

    this.hud = new Hud(this);
    this.boosters = new BoosterController({
      scene: this,
      paddle: this.paddle,
      balls: this.balls,
      getPrimaryBall: () => this.primaryBall,
      createBall: (x, y) => this.createBallSprite(x, y),
      getBallSpeed: () => this.ballSpeed,
      // Lives are the scene's, not the controller's — every other booster
      // acts on the ball or the paddle, which the controller owns outright.
      // Routing this through a dep keeps apply() the single funnel for
      // "a booster was caught" rather than special-casing one type upstream.
      onExtraLife: () => this.grantExtraLife(),
      onChange: () => this.hud.setBoosters(this.boosters.getActiveBoosters()),
    });

    // Wrapped in arrow functions rather than passed as bare method
    // references (`this.handlePaddleHit`) — Phaser does correctly bind
    // `this` via the trailing context argument at call time, but an
    // unbound method reference is still a footgun if that argument is ever
    // dropped later, so the arrow closure makes the binding explicit.
    //
    // Argument order here is (paddle, ball), NOT (ball, paddle) matching the
    // registration order below — Phaser's World#collideHandler normalizes a
    // group-vs-single-object pair by swapping to (singleObject, groupMember)
    // internally whenever the group is passed first (World.js's
    // collideHandler: `object1.isParent && object2.body` → dispatches as
    // `collideSpriteVsGroup(object2, object1, ...)`, and that always invokes
    // the callback as (theSprite, theGroupMember)). Getting this backwards
    // doesn't error — it silently calls handlePaddleHit with the paddle and
    // ball swapped, so `body.setVelocity(...)` lands on the PADDLE's body
    // instead of the ball's. That shipped as a real bug: the paddle flew
    // off the top of the screen (given the ball's velocity) while the ball
    // kept drifting on whatever velocity it already had.
    this.physics.add.collider(this.balls, this.paddle, (paddle, ball) => this.handlePaddleHit(ball, paddle));
    // Burning Ball needs to pass through bricks instead of bouncing, so
    // brick contact is split across a collider (normal bounce) and an
    // overlap (no physical separation) gated on opposite states of
    // burningActive — only one of the two is ever "live" at a time, and
    // both funnel into the same handleBrickHit callback.
    this.physics.add.collider(
      this.balls,
      this.bricks,
      (ball, brick) => this.handleBrickHit(ball, brick),
      () => !this.boosters.burningActive,
    );
    this.physics.add.overlap(
      this.balls,
      this.bricks,
      (ball, brick) => this.handleBrickHit(ball, brick),
      () => this.boosters.burningActive,
    );
    this.physics.add.overlap(this.paddle, this.powerUps, (paddle, powerUp) => this.handlePowerUpCatch(paddle, powerUp));

    this.foresightGraphics = this.add.graphics();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.movePaddle(pointer.x));
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.movePaddle(pointer.x);
      if (this.state === GAME_STATE.SERVING) this.launchBall();
      this.releaseStuckBalls();
    });

    this.hud.setLevel(this.levelIndex, LEVELS[this.levelIndex].name);
    this.hud.setLives(this.livesRemaining);
    this.hud.setScore(this.scoring.score);
    this.hud.setBoosters(this.boosters.getActiveBoosters());
  }

  private createBallSprite(x: number, y: number): Phaser.Physics.Arcade.Image {
    const ball = this.physics.add.image(x, y, TEXTURE_KEY_BALL);
    ball.setDisplaySize(BALL_RADIUS * 2, BALL_RADIUS * 2).setTint(BALL_TINT);
    // collideWorldBounds and bounce come from the `balls` group's config
    // (see create()) once this is added there, not from this method — a
    // per-body setCollideWorldBounds()/setBounce() call here would just be
    // silently overwritten by Group#createCallbackHandler on that add().
    (ball.body as Phaser.Physics.Arcade.Body).onWorldBounds = true;
    return ball;
  }

  /** Lines up every ball currently in `balls` on the paddle in serving
   * formation, each keeping a fixed offset from paddle center (stored as
   * GameObject data) so movePaddle() can keep them all following without
   * recomputing the formation on every pointer move. Used for the normal
   * one-ball case (offset 0) and for the multi-ball case within a level,
   * where Extra Ball/Double Ball/Triple Ball have spawned and a life is then
   * lost. Nothing carries across a level boundary — see create(). */
  private positionBallsForServe(): void {
    const balls = this.balls.getChildren() as Phaser.Physics.Arcade.Image[];
    const spacing = BALL_RADIUS * 3;
    balls.forEach((ball, i) => {
      const offset = (i - (balls.length - 1) / 2) * spacing;
      ball.setData("serveOffsetX", offset);
      ball.setPosition(this.paddle.x + offset, this.ballServeY);
    });
  }

  private movePaddle(pointerX: number): void {
    if (this.boosters.paddleFrozen) return; // Freeze Paddle hazard: input is ignored while active.

    const halfWidth = this.paddle.displayWidth / 2;
    const clampedX = Phaser.Math.Clamp(pointerX, this.arenaLeft + halfWidth, this.arenaRight - halfWidth);
    this.paddle.x = clampedX;
    if (this.state === GAME_STATE.SERVING) {
      (this.balls.getChildren() as Phaser.Physics.Arcade.Image[]).forEach((ball) => {
        const offset = (ball.getData("serveOffsetX") as number | undefined) ?? 0;
        ball.x = clampedX + offset;
      });
    }
  }

  private launchBall(): void {
    this.state = GAME_STATE.PLAYING;
    const speed = this.ballSpeed * this.boosters.speedMultiplier;
    // Every ball in serving formation launches together on the same tap —
    // matters once more than one ball can be resting there (a carried-over
    // Extra Ball, see create()). Each gets its own random angle within the
    // usual spread rather than sharing one, so they don't launch stacked.
    (this.balls.getChildren() as Phaser.Physics.Arcade.Image[]).forEach((ball) => {
      const body = ball.body as Phaser.Physics.Arcade.Body;
      const angle = Phaser.Math.DegToRad(-90 + Phaser.Math.Between(-20, 20));
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    });
  }

  private handlePaddleHit(ballObj: Collided, _paddle: Collided): void {
    // Guards against a phantom hit while the ball is resting on serve
    // (belt-and-suspenders alongside ballServeY's physical clearance).
    if (this.state !== GAME_STATE.PLAYING) return;

    const ball = ballObj as Phaser.Physics.Arcade.Image;

    // An already-stuck ball (Catch & Aim) keeps resting on the paddle every
    // frame via update()'s follow logic, which can re-overlap the paddle's
    // collider — ignore those instead of re-sticking or re-bouncing it.
    if (ball.getData("stuck")) return;

    // Catch & Aim: stick instead of bouncing immediately. The player then
    // drags (via movePaddle()'s follow logic below) and releases with a tap
    // — see the pointerdown handler — instead of an automatic return angle.
    this.scoring.registerPaddleContact();

    if (this.boosters.stickyPaddleActive) {
      const body = ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      ball.setData("stuck", true);
      ball.setData("stuckOffsetX", ball.x - this.paddle.x);
      ball.y = this.ballServeY; // rest on the paddle, same clearance a serving ball uses
      return;
    }

    // Angle the return by where it hit the paddle — the "angles matter"
    // lesson from level 2 of the design brief's progression (§5). Pure
    // math lives in gameplayMath.ts so it's unit-testable on its own.
    const offset = (ball.x - this.paddle.x) / (this.paddle.displayWidth / 2);
    const angle = bounceOffsetToAngleRad(offset);
    const speed = this.ballSpeed * this.boosters.speedMultiplier;
    const velocity = velocityFromAngle(angle, speed);
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(velocity.x, velocity.y);
    paddleSquash(this, this.paddle);
  }

  private handleBrickHit(_ball: Collided, brick: Collided): void {
    const brickImage = brick as Phaser.Physics.Arcade.Image;

    // Tough bricks (scattered per level, see buildBrickGrid) take more than
    // one hit — decrement and re-tint one shade lighter, but don't actually
    // destroy it (no star/hazard trigger, no win-check) until the hit that
    // brings it to 1. The shade IS the hit-count readout, so this is the
    // only feedback the player gets and it has to happen here. An ordinary
    // brick has no "hitsRemaining" data at all, so this never runs for it.
    const hitsRemaining = brickImage.getData("hitsRemaining") as number | undefined;
    if (hitsRemaining !== undefined && hitsRemaining > 1) {
      const left = hitsRemaining - 1;
      brickImage.setData("hitsRemaining", left);
      brickImage.setTint(BRICK_TINTS_BY_HITS[left - 1]);
      return;
    }

    const starPowerUp = brickImage.getData("starPowerUp") as BoosterType | undefined;
    const hazard = brickImage.getData("hazard") as HazardType | undefined;

    if (starPowerUp) this.spawnPowerUp(brickImage.x, brickImage.y, starPowerUp);
    // Hazards trigger immediately on destruction, no catch needed — unlike
    // star bricks, so a hazard can never be dodged by simply not catching it
    // (nor mistaken for a positive drop) once you've broken it.
    if (hazard) this.boosters.apply(hazard);
    this.scoring.registerBrickDestroyed((brickImage.getData("maxHits") as number | undefined) ?? 1);
    this.hud.setScore(this.scoring.score);
    brickBurst(this, brickImage.x, brickImage.y, brickImage.tintTopLeft);
    // The star/question-mark drawn on the brick is its own game object, not
    // part of the tinted image, so it has to go with it.
    (brickImage.getData("glyphText") as Phaser.GameObjects.Text | undefined)?.destroy();
    brickImage.destroy();

    if (this.bricks.countActive(true) === 0) this.endLevel(GAME_STATE.WON);
  }

  /** Extra Life's payload. Capped at MAX_LIVES because the HUD draws
   * exactly that many icons — a sixth life would be invisible, and an
   * invisible reward reads as a bug. Catching one at full lives is still
   * worth the catch bonus, so it is never a punishment, just not a life. */
  private grantExtraLife(): void {
    if (this.livesRemaining >= MAX_LIVES) return;
    this.livesRemaining += EXTRA_LIFE_GAIN;
    this.hud.setLives(this.livesRemaining);
  }

  private spawnPowerUp(x: number, y: number, type: BoosterType): void {
    const powerUp = this.powerUps.create(x, y, TEXTURE_KEY_CHIP) as Phaser.Physics.Arcade.Image;
    powerUp.setDisplaySize(POWER_UP_SIZE, POWER_UP_SIZE).setTint(POWER_UP_TINTS[type]);
    powerUp.setData("type", type);
    const body = powerUp.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(0, this.dropSpeed);
  }

  private handlePowerUpCatch(_paddle: Collided, powerUp: Collided): void {
    const puImage = powerUp as Phaser.Physics.Arcade.Image;
    const type = puImage.getData("type") as BoosterType;
    catchPop(this, puImage.x, puImage.y, POWER_UP_TINTS[type]);
    this.scoring.registerBoosterCaught();
    this.hud.setScore(this.scoring.score);
    puImage.destroy();
    this.boosters.apply(type);
  }

  /** Catch & Aim: releases every currently-stuck ball on a tap, aiming
   * each with the same bounce-offset-to-angle formula a normal paddle hit
   * uses — wherever the player dragged it while stuck becomes the aim. */
  private releaseStuckBalls(): void {
    const speed = this.ballSpeed * this.boosters.speedMultiplier;
    (this.balls.getChildren() as Phaser.Physics.Arcade.Image[]).forEach((ball) => {
      if (!ball.getData("stuck")) return;
      const offset = (ball.x - this.paddle.x) / (this.paddle.displayWidth / 2);
      const angle = bounceOffsetToAngleRad(offset);
      const velocity = velocityFromAngle(angle, speed);
      const body = ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(velocity.x, velocity.y);
      ball.setData("stuck", false);
    });
  }

  /** Foresight: a dotted preview of a resting ball's aim, drawn at both of
   * the game's aiming moments — the serve, and a ball held by Catch & Aim.
   * It deliberately does NOT draw for a ball in flight: this previews a shot
   * the player is about to choose, not one already taken. (Originally it
   * drew for Catch & Aim only, which made Foresight invisible unless both
   * boosters happened to be active at once — see the design brief.)
   * Reflects off the two side walls only, not off individual bricks, which
   * would need a much heavier raycast against the whole grid. */
  private drawForesight(aimingBalls: Phaser.Physics.Arcade.Image[]): void {
    this.foresightGraphics.clear();
    if (!this.boosters.foresightActive || aimingBalls.length === 0) return;

    this.foresightGraphics.fillStyle(0xffffff, 0.6);
    aimingBalls.forEach((ball) => {
      const offset = (ball.x - this.paddle.x) / (this.paddle.displayWidth / 2);
      const angle = bounceOffsetToAngleRad(offset);
      this.drawTrajectoryDots(ball.x, ball.y, angle);
    });
  }

  private drawTrajectoryDots(startX: number, startY: number, angle: number): void {
    let x = startX;
    let y = startY;
    let dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let remaining = FORESIGHT_PREVIEW_LENGTH;

    for (let bounce = 0; bounce <= FORESIGHT_MAX_WALL_BOUNCES; bounce++) {
      const distToWall = dx < 0 ? (this.arenaLeft - x) / dx : dx > 0 ? (this.arenaRight - x) / dx : Infinity;
      const segmentLength = Math.min(distToWall, remaining);

      for (let d = FORESIGHT_DOT_SPACING; d < segmentLength; d += FORESIGHT_DOT_SPACING) {
        this.foresightGraphics.fillCircle(x + dx * d, y + dy * d, 2);
      }

      x += dx * segmentLength;
      y += dy * segmentLength;
      remaining -= segmentLength;

      if (remaining <= 0 || segmentLength < distToWall) break;
      dx = -dx; // reflect off the side wall
    }
  }

  update(): void {
    // Badges tick down in real time, so they refresh before any state guard
    // below — boosters keep running while SERVING (Foresight in particular).
    this.hud.setBoosters(this.boosters.getActiveBoosters());

    // Foresight also previews the *serve*, which happens in the SERVING
    // state — so it has to be drawn before the PLAYING-only guard below.
    if (this.state === GAME_STATE.SERVING) {
      this.drawForesight(this.balls.getChildren() as Phaser.Physics.Arcade.Image[]);
      return;
    }
    if (this.state !== GAME_STATE.PLAYING) {
      this.foresightGraphics.clear();
      return;
    }

    const balls = this.balls.getChildren() as Phaser.Physics.Arcade.Image[];

    const stuckBalls: Phaser.Physics.Arcade.Image[] = [];
    balls.forEach((ball) => {
      if (!ball.getData("stuck")) return;
      const offset = (ball.getData("stuckOffsetX") as number | undefined) ?? 0;
      ball.x = this.paddle.x + offset;
      stuckBalls.push(ball);
    });
    this.drawForesight(stuckBalls);

    const fallen = balls.filter(
      (ball) => !ball.getData("stuck") && ball.y > this.scale.height + ball.displayHeight / 2,
    );

    if (fallen.length > 0) {
      const survivorCount = balls.length - fallen.length;
      if (survivorCount > 0) {
        // Extra ball(s) lost — no penalty, per Multi-Ball's design (§3):
        // only running out of every ball in play counts as a miss.
        fallen.forEach((ball) => this.balls.remove(ball, true, true));
        // The ball that fell here might have been the current primaryBall
        // itself, not just an "extra" one — spawnExtraBalls() (via a fresh
        // Extra/Double/Triple Ball catch) reads getPrimaryBall().body to
        // compute a new spawn's trajectory, and a destroyed ball's body is
        // null/undefined. That throws inside Phaser's own physics-step call
        // stack (a real paddle-vs-powerUps overlap callback), which is
        // uncaught and halts the whole game loop — paddle, balls, and every
        // booster timer all stop, since none of them run again after that.
        // Reported live as "the whole game freezes when the paddle catches
        // the blue booster." primaryBall must always point at a ball that's
        // still actually in the group.
        if (!this.balls.getChildren().includes(this.primaryBall)) {
          this.primaryBall = this.balls.getChildren()[0] as Phaser.Physics.Arcade.Image;
        }
      } else {
        // The last ball fell — a genuine miss. Reuse one of the fallen ball
        // objects as the re-served ball instead of destroying + recreating.
        const [keep, ...extra] = fallen;
        extra.forEach((ball) => this.balls.remove(ball, true, true));

        this.livesRemaining -= 1;
        this.hud.setLives(this.livesRemaining);
        this.boosters.resetAll();
        this.scoring.registerLifeLost();
        lifeLostShake(this);
        if (this.livesRemaining <= 0) {
          this.endLevel(GAME_STATE.LOST);
        } else {
          this.reserveBall(keep);
        }
      }
    }

    this.powerUps.children.each((child) => {
      const powerUp = child as Phaser.Physics.Arcade.Image;
      if (powerUp.y > this.scale.height) powerUp.destroy();
      return true;
    });
  }

  private reserveBall(ball: Phaser.Physics.Arcade.Image): void {
    this.state = GAME_STATE.SERVING;
    this.primaryBall = ball;
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    ball.setDisplaySize(BALL_RADIUS * 2, BALL_RADIUS * 2).setTint(BALL_TINT);
    // positionBallsForServe() (not a direct setPosition to paddle.x) so this
    // ball's serveOffsetX data gets reset to 0 too — it may be the sole
    // survivor of a formation carried over from Extra Ball, and a stale
    // nonzero offset would otherwise pull it away from the paddle center on
    // the very next movePaddle() call.
    this.positionBallsForServe();
  }

  private endLevel(result: typeof GAME_STATE.WON | typeof GAME_STATE.LOST): void {
    this.state = result;
    this.balls.getChildren().forEach((child) => {
      const body = (child as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
    });

    if (result === GAME_STATE.WON) {
      // Bonuses land before the breakdown is rendered, so the number shown
      // is the score the next level actually starts from.
      const bonus = this.scoring.registerLevelClear(this.livesRemaining);
      this.hud.setScore(bonus.total);

      // Every row is shown so the column visibly adds up to the total.
      // Listing only the two bonuses (as this first did) left most of the
      // score unexplained — "Level clear 100" next to "Total 2,455" reads
      // like broken arithmetic, and prompted "what is the 100 for?".
      const plus = (n: number) => `+${n.toLocaleString()}`;
      const rows: Array<[string, string]> = [];
      if (bonus.carriedIn > 0) rows.push(["Carried over", bonus.carriedIn.toLocaleString()]);
      rows.push([`Bricks & catches`, plus(bonus.earned)]);
      rows.push(["Level clear bonus", plus(bonus.levelClear)]);
      rows.push([`Lives left x${this.livesRemaining}`, plus(bonus.livesBonus)]);
      rows.push(["Total", bonus.total.toLocaleString()]);
      this.hud.showScoreBreakdown(rows);

      // Banked on every level clear, not only when a run ends: the score is
      // run-wide and carries forward, so the highest total a run ever
      // reaches is the one worth keeping — a player who clears five levels
      // and then loses the sixth should keep what those five were worth.
      //
      // Silent here, deliberately. Announcing it on the win screen would
      // fire on nearly every early clear (with no stored best, everything
      // is a record), which makes the celebration mean nothing, and it
      // would cost the level name — added because "which level was that?"
      // is a real question on a screen showing a running total. A personal
      // best is a property of a *run*, so it is announced where a run ends.
      // It is also not a breakdown row: those rows sum to Total, and a
      // number after the total that isn't part of the sum is exactly the
      // "arithmetic doesn't add up" bug this screen already had once.
      recordScore(globalThis.localStorage, bonus.total);
      this.hud.showMessage(`Level ${this.levelIndex + 1} clear!`);

      const isLastLevel = this.levelIndex >= LEVELS.length - 1;
      this.hud.setAction(isLastLevel ? "Play Again" : "Next Level", () => {
        this.levelIndex = isLastLevel ? 0 : this.levelIndex + 1;
        // "Play Again" after the last level starts a fresh run (full lives,
        // one ball); "Next Level" mid-run carries the current lives and any
        // extra balls still in play forward — see PrototypeSceneData's
        // field comments. No booster/hazard state carries either way
        // anymore: every one of them is a real-time timer now, and
        // real-time timers don't survive scene.restart() regardless (see
        // coding-hygiene.md). Always pass an explicit object — Phaser's
        // Systems#start only overwrites scene.settings.data when the
        // argument is truthy (`if (data) settings.data = data`), so
        // omitting it on a later restart() silently REUSES whatever data a
        // previous restart() call set, rather than clearing it. Omitting it
        // here once caused a stale carryLives:true from an earlier "Next
        // Level" to leak into a later "Tap to retry", refilling zero lives
        // instead of MAX_LIVES.
        const carry = !isLastLevel;
        this.scene.restart({
          carryLives: carry,
          carryScore: carry ? this.scoring.score : undefined,
        });
      });
    } else {
      // Lives are a run-wide resource (they carry across levels), so running
      // out is a full game over — retry restarts the whole run from level 1,
      // not just a replay of the level you happened to be on.
      // The lose screen's breakdown is a plain list, not a column that has
      // to sum, so the best belongs here where it can be compared directly
      // against the score that just ended.
      const { best, isNewBest } = recordScore(globalThis.localStorage, this.scoring.score);
      this.hud.showMessage(isNewBest ? "Game over — new best!" : "Game over");
      this.hud.showScoreBreakdown([
        ["Final score", this.scoring.score.toLocaleString()],
        ["Personal best", best.toLocaleString()],
      ]);
      // "Start Over", not "Tap to retry" — reported as misleading, and it
      // was: the button restarts the whole run from level 1, and a player
      // who lost on level 6 read "retry" as another go at level 6. Lives are
      // a run-wide resource, so running out ends the run, not the level.
      this.hud.setAction("Start Over", () => {
        this.levelIndex = 0;
        // A fresh run: no carryScore, so the next create() starts at 0.
        this.scene.restart({ carryLives: false });
      });
    }
  }
}
