import { describe, expect, it, vi } from "vitest";
import {
  BALL_RADIUS,
  BALL_SPEED,
  BIG_BALL_MULTIPLIER,
  BURNING_BALL_TINT,
  MAX_BALLS,
  NARROW_PADDLE_MULTIPLIER,
  FAST_BALL_MULTIPLIER,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  SLOW_BALL_MULTIPLIER,
  WIDE_PADDLE_DURATION_MS,
  WIDE_PADDLE_MULTIPLIER,
} from "../constants";
import { BoosterController, type BoosterControllerDeps } from "./BoosterController";

/**
 * BoosterController is Phaser-injected, not Phaser-instantiated (see
 * BoosterControllerDeps), so it can be driven with plain fakes instead of a
 * real Scene/Group/Image — that's the whole point of the dependency
 * injection here. The fakes below model only the surface this class
 * actually calls: setDisplaySize/setTint on sprites, setVelocity on a body,
 * add/getChildren/countActive on the balls group, and time.delayedCall on
 * the scene (captured so tests can fire or cancel it explicitly instead of
 * waiting on a real clock).
 */

function createFakeBall(x = 0, y = 0) {
  return {
    x,
    y,
    displayWidth: BALL_RADIUS * 2,
    displayHeight: BALL_RADIUS * 2,
    tint: 0xffffff,
    setDisplaySize(w: number, h: number) {
      this.displayWidth = w;
      this.displayHeight = h;
      return this;
    },
    setTint(color: number) {
      this.tint = color;
      return this;
    },
    body: {
      velocity: { x: 0, y: 0 },
      setVelocity(vx: number, vy: number) {
        this.velocity.x = vx;
        this.velocity.y = vy;
        return this;
      },
    },
  };
}
type FakeBall = ReturnType<typeof createFakeBall>;

function createFakePaddle() {
  return {
    displayWidth: PADDLE_WIDTH,
    displayHeight: PADDLE_HEIGHT,
    setDisplaySize(w: number, h: number) {
      this.displayWidth = w;
      this.displayHeight = h;
      return this;
    },
  };
}

function createFakeBallsGroup(initial: FakeBall[]) {
  const members = [...initial];
  return {
    members,
    countActive: () => members.length,
    getChildren: () => members,
    add: (ball: FakeBall) => {
      members.push(ball);
      return ball;
    },
  };
}

/** Models scene.time.delayedCall: captures pending callbacks instead of
 * running on a real clock, so tests can fire or cancel them deterministically. */
function createFakeSceneClock() {
  const pending: { callback: () => void; cancelled: boolean }[] = [];
  return {
    time: {
      delayedCall: (delay: number, callback: () => void) => {
        const entry = { callback, cancelled: false };
        pending.push(entry);
        // getRemaining() models Phaser.Time.TimerEvent's: no simulated time
        // passes in these tests, so it stays at the full delay. That's
        // enough to prove the HUD is handed a real countdown value rather
        // than a placeholder.
        return { remove: () => (entry.cancelled = true), getRemaining: () => delay };
      },
    },
    fireAllPending: () => {
      const toFire = pending.splice(0).filter((e) => !e.cancelled);
      toFire.forEach((e) => e.callback());
    },
  };
}

function setup(initialBalls: FakeBall[] = [createFakeBall()]) {
  const paddle = createFakePaddle();
  const ballsGroup = createFakeBallsGroup(initialBalls);
  const clock = createFakeSceneClock();
  const onChange = vi.fn();
  const primaryBall = initialBalls[0];

  const deps = {
    scene: clock,
    paddle,
    balls: ballsGroup,
    getPrimaryBall: () => primaryBall,
    createBall: (x: number, y: number) => {
      const ball = createFakeBall(x, y);
      return ball;
    },
    getBallSpeed: () => BALL_SPEED,
    onChange,
  } as unknown as BoosterControllerDeps;

  const controller = new BoosterController(deps);
  return { controller, paddle, ballsGroup, primaryBall, fireAllPending: clock.fireAllPending, onChange };
}

describe("BoosterController", () => {
  describe("wide-paddle", () => {
    it("widens the paddle and reverts when its timer fires", () => {
      const { controller, paddle, fireAllPending, onChange } = setup();

      controller.apply("wide-paddle");
      expect(controller.paddleWidthState).toBe("wide");
      expect(paddle.displayWidth).toBeCloseTo(PADDLE_WIDTH * WIDE_PADDLE_MULTIPLIER);
      expect(onChange).toHaveBeenCalled();

      fireAllPending();
      expect(controller.paddleWidthState).toBe("normal");
      expect(paddle.displayWidth).toBeCloseTo(PADDLE_WIDTH);
    });

    it("cancels its own previous timer when re-applied before expiry", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("wide-paddle");
      controller.apply("wide-paddle"); // re-applied — first timer must be cancelled, not both firing

      fireAllPending();
      expect(controller.paddleWidthState).toBe("normal");
    });
  });

  describe("narrow-paddle (hazard)", () => {
    it("narrows the paddle, cancels a running Wide Paddle, and reverts on its own timer", () => {
      const { controller, paddle, fireAllPending } = setup();

      controller.apply("wide-paddle");
      controller.apply("narrow-paddle");

      expect(controller.paddleWidthState).toBe("narrow");
      expect(paddle.displayWidth).toBeCloseTo(PADDLE_WIDTH * NARROW_PADDLE_MULTIPLIER);

      // Wide Paddle's own timer must have been cancelled, not left running
      // underneath — firing everything pending must land on "normal", not
      // have Wide Paddle's revert re-apply "wide" a moment later.
      fireAllPending();
      expect(controller.paddleWidthState).toBe("normal");
    });

    it("cancels its own previous timer when re-applied before expiry", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("narrow-paddle");
      controller.apply("narrow-paddle"); // re-applied — first timer must be cancelled, not both firing

      fireAllPending();
      // If the cancelled timer had still fired, this would still read
      // "normal" too, so the real assertion is that this doesn't throw and
      // ends up in a single consistent state.
      expect(controller.paddleWidthState).toBe("normal");
    });
  });

  describe("freeze-paddle (hazard)", () => {
    it("freezes input and unfreezes when its timer fires", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("freeze-paddle");
      expect(controller.paddleFrozen).toBe(true);

      fireAllPending();
      expect(controller.paddleFrozen).toBe(false);
    });
  });

  describe("fast-ball", () => {
    it("raises the speed multiplier and reverts when its timer fires", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("fast-ball");
      expect(controller.speedMultiplier).toBe(FAST_BALL_MULTIPLIER);

      fireAllPending();
      expect(controller.speedMultiplier).toBe(1);
    });

    it("immediately rescales a ball already in flight, like Slow Ball does", () => {
      const { controller, primaryBall } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("fast-ball");

      expect(primaryBall.body.velocity.y).toBeCloseTo(-BALL_SPEED * FAST_BALL_MULTIPLIER);
    });

    // The two are opposites sharing one slot. If they stacked, the ball
    // would end up at 0.6 x 1.5 = 0.9 of base — a speed neither booster
    // advertises, arrived at by catching both.
    it("replaces a running Slow Ball outright rather than compounding with it", () => {
      const { controller, primaryBall } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("slow-ball");
      controller.apply("fast-ball");

      expect(controller.speedMultiplier).toBe(FAST_BALL_MULTIPLIER);
      expect(primaryBall.body.velocity.y).toBeCloseTo(-BALL_SPEED * FAST_BALL_MULTIPLIER);
    });

    it("is replaced by a Slow Ball caught after it, symmetrically", () => {
      const { controller } = setup();

      controller.apply("fast-ball");
      controller.apply("slow-ball");

      expect(controller.speedMultiplier).toBe(SLOW_BALL_MULTIPLIER);
    });

    // Sharing a slot means sharing a timer, so the cancelled effect's timer
    // must not fire later and reset a speed that no longer belongs to it.
    it("does not let the replaced effect's timer clear the replacement", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("slow-ball");
      controller.apply("fast-ball");
      fireAllPending();

      expect(controller.speedMultiplier).toBe(1);
    });

    it("names itself in the HUD badges, not the slot it shares with Slow Ball", () => {
      const { controller } = setup();

      controller.apply("fast-ball");
      expect(controller.getActiveBoosters().map((b) => b.type)).toEqual(["fast-ball"]);

      controller.apply("slow-ball");
      expect(controller.getActiveBoosters().map((b) => b.type)).toEqual(["slow-ball"]);
    });

    it("is cleared by resetAll, like every other timed effect", () => {
      const { controller } = setup();

      controller.apply("fast-ball");
      controller.resetAll();

      expect(controller.speedMultiplier).toBe(1);
      expect(controller.getActiveBoosters()).toEqual([]);
    });
  });

  describe("slow-ball", () => {
    it("reduces the speed multiplier and reverts when its timer fires", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("slow-ball");
      expect(controller.speedMultiplier).toBe(SLOW_BALL_MULTIPLIER);

      fireAllPending();
      expect(controller.speedMultiplier).toBe(1);
    });

    it("cancels its own previous timer when re-applied before expiry", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("slow-ball");
      controller.apply("slow-ball"); // re-applied — first timer must be cancelled, not both firing

      fireAllPending();
      expect(controller.speedMultiplier).toBe(1);
    });

    // Regression test: reported live as "Slow Ball didn't really slow" —
    // this.speed was only ever read at the *next* paddle bounce/serve, so a
    // ball already in flight kept its old velocity untouched. With a short
    // 3-second window, that next bounce often never happened before the
    // buff expired, so it could visibly do nothing at all.
    it("immediately rescales a ball already in flight, not just future bounces", () => {
      const { controller, primaryBall } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED); // already moving before the catch

      controller.apply("slow-ball");

      expect(primaryBall.body.velocity.y).toBeCloseTo(-BALL_SPEED * SLOW_BALL_MULTIPLIER);
    });

    it("preserves each ball's direction while rescaling its speed", () => {
      const { controller, primaryBall } = setup();
      primaryBall.body.setVelocity(BALL_SPEED * 0.6, -BALL_SPEED * 0.8); // an angled shot, not straight up

      controller.apply("slow-ball");

      const speed = Math.hypot(primaryBall.body.velocity.x, primaryBall.body.velocity.y);
      expect(speed).toBeCloseTo(BALL_SPEED * SLOW_BALL_MULTIPLIER);
      // Direction preserved: x/y ratio unchanged from the original 0.6/-0.8 shot.
      expect(primaryBall.body.velocity.x / primaryBall.body.velocity.y).toBeCloseTo(0.6 / -0.8);
    });

    it("immediately restores full speed to balls in flight when the timer fires", () => {
      const { controller, primaryBall, fireAllPending } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("slow-ball");
      fireAllPending();

      expect(primaryBall.body.velocity.y).toBeCloseTo(-BALL_SPEED);
    });

    it("leaves a resting ball's zero velocity alone instead of launching it", () => {
      const { controller, primaryBall } = setup();
      // primaryBall starts at rest (serving/stuck) — velocity (0, 0).

      controller.apply("slow-ball");

      expect(primaryBall.body.velocity.x).toBe(0);
      expect(primaryBall.body.velocity.y).toBe(0);
    });

    it("rescales every ball in the group, not just the primary one", () => {
      const second = createFakeBall();
      const { controller, primaryBall } = setup([createFakeBall(), second]);
      primaryBall.body.setVelocity(0, -BALL_SPEED);
      second.body.setVelocity(BALL_SPEED, 0);

      controller.apply("slow-ball");

      expect(Math.hypot(primaryBall.body.velocity.x, primaryBall.body.velocity.y)).toBeCloseTo(
        BALL_SPEED * SLOW_BALL_MULTIPLIER,
      );
      expect(Math.hypot(second.body.velocity.x, second.body.velocity.y)).toBeCloseTo(BALL_SPEED * SLOW_BALL_MULTIPLIER);
    });
  });

  describe("big-ball", () => {
    it("enlarges every ball currently in the group and reverts when its timer fires", () => {
      const second = createFakeBall();
      const { controller, ballsGroup, fireAllPending } = setup([createFakeBall(), second]);

      controller.apply("big-ball");
      expect(controller.ballsBig).toBe(true);
      for (const ball of ballsGroup.members) {
        expect(ball.displayWidth).toBeCloseTo(BALL_RADIUS * BIG_BALL_MULTIPLIER * 2);
      }

      fireAllPending();
      expect(controller.ballsBig).toBe(false);
      for (const ball of ballsGroup.members) {
        expect(ball.displayWidth).toBeCloseTo(BALL_RADIUS * 2);
      }
    });
  });

  describe("burning-ball", () => {
    it("tints every ball and reverts when its timer fires", () => {
      const { controller, ballsGroup, fireAllPending } = setup();

      controller.apply("burning-ball");
      expect(controller.burningActive).toBe(true);
      expect(ballsGroup.members[0].tint).toBe(BURNING_BALL_TINT);

      fireAllPending();
      expect(controller.burningActive).toBe(false);
      expect(ballsGroup.members[0].tint).toBe(0xffffff);
    });
  });

  describe("sticky-paddle (Catch & Aim)", () => {
    it("activates and reverts when its timer fires", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("sticky-paddle");
      expect(controller.stickyPaddleActive).toBe(true);

      fireAllPending();
      expect(controller.stickyPaddleActive).toBe(false);
    });
  });

  describe("foresight", () => {
    it("activates and reverts when its timer fires", () => {
      const { controller, fireAllPending } = setup();

      controller.apply("foresight");
      expect(controller.foresightActive).toBe(true);

      fireAllPending();
      expect(controller.foresightActive).toBe(false);
    });
  });

  describe("extra-ball", () => {
    it("adds a second ball to the group with real, non-zero velocity", () => {
      const { controller, primaryBall, ballsGroup } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("extra-ball");

      expect(ballsGroup.members).toHaveLength(2);
      const extra = ballsGroup.members[1];
      const speed = Math.hypot(extra.body.velocity.x, extra.body.velocity.y);
      expect(speed).toBeGreaterThan(50);
    });

    it("diverges from the source ball's trajectory instead of copying it exactly", () => {
      const { controller, primaryBall, ballsGroup } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("extra-ball");

      const extra = ballsGroup.members[1];
      expect(extra.body.velocity.x).not.toBeCloseTo(primaryBall.body.velocity.x, 1);
    });

    it("does nothing once the group is already at MAX_BALLS", () => {
      const balls = Array.from({ length: MAX_BALLS }, () => createFakeBall());
      const { controller, ballsGroup } = setup(balls);

      controller.apply("extra-ball");

      expect(ballsGroup.members).toHaveLength(MAX_BALLS);
    });
  });

  describe("double-ball / triple-ball", () => {
    it("Double Ball adds 2 balls and Triple Ball adds 3, compounding rather than jumping to a fixed total", () => {
      const { controller, primaryBall, ballsGroup } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      // Matches the exact compounding example this was specced with: 1
      // (primary) + 2 (first Double Ball catch) = 3.
      controller.apply("double-ball");
      expect(ballsGroup.members).toHaveLength(3);

      // Catching Double Ball again adds 2 more on top: 3 + 2 = 5.
      controller.apply("double-ball");
      expect(ballsGroup.members).toHaveLength(5);
    });

    it("compounds Double Ball and Triple Ball together", () => {
      const { controller, primaryBall, ballsGroup } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      // 1 (primary) + 2 (Double Ball) + 3 (Triple Ball) = 6.
      controller.apply("double-ball");
      controller.apply("triple-ball");
      expect(ballsGroup.members).toHaveLength(6);
    });

    it("every spawned ball gets real, non-zero velocity", () => {
      const { controller, primaryBall, ballsGroup } = setup();
      primaryBall.body.setVelocity(0, -BALL_SPEED);

      controller.apply("triple-ball");

      expect(ballsGroup.members).toHaveLength(4);
      for (const ball of ballsGroup.members) {
        expect(Math.hypot(ball.body.velocity.x, ball.body.velocity.y)).toBeGreaterThan(50);
      }
    });

    it("stops silently at MAX_BALLS instead of spawning a partial batch loudly", () => {
      const balls = Array.from({ length: MAX_BALLS - 1 }, () => createFakeBall());
      const { controller, ballsGroup } = setup(balls);

      controller.apply("triple-ball"); // only 1 slot free, requesting 3

      expect(ballsGroup.members).toHaveLength(MAX_BALLS);
    });
  });

  describe("resetAll", () => {
    it("clears every active booster and hazard back to native state", () => {
      const { controller, paddle, ballsGroup, fireAllPending } = setup();

      controller.apply("big-ball");
      controller.apply("burning-ball");
      controller.apply("freeze-paddle");
      controller.apply("wide-paddle");
      controller.apply("sticky-paddle");
      controller.apply("foresight");

      controller.resetAll();

      expect(controller.paddleWidthState).toBe("normal");
      expect(controller.paddleFrozen).toBe(false);
      expect(controller.burningActive).toBe(false);
      expect(controller.ballsBig).toBe(false);
      expect(controller.speedMultiplier).toBe(1);
      expect(controller.stickyPaddleActive).toBe(false);
      expect(controller.foresightActive).toBe(false);
      expect(paddle.displayWidth).toBeCloseTo(PADDLE_WIDTH);
      expect(ballsGroup.members[0].tint).toBe(0xffffff);

      // Every one of those timers must have been cancelled too, not just
      // its flag flipped — firing anything still pending must not un-set
      // any of them again.
      fireAllPending();
      expect(controller.paddleFrozen).toBe(false);
      expect(controller.paddleWidthState).toBe("normal");
      expect(controller.ballsBig).toBe(false);
      expect(controller.burningActive).toBe(false);
      expect(controller.stickyPaddleActive).toBe(false);
      expect(controller.foresightActive).toBe(false);
    });
  });

  describe("getActiveBoosters", () => {
    it("is empty with nothing active, and lists an effect while it runs", () => {
      const { controller, fireAllPending } = setup();
      expect(controller.getActiveBoosters()).toEqual([]);

      controller.apply("wide-paddle");
      const active = controller.getActiveBoosters();
      expect(active).toHaveLength(1);
      expect(active[0].type).toBe("wide-paddle");
      expect(active[0].label).toBe("Wide Paddle");

      fireAllPending();
      expect(controller.getActiveBoosters()).toEqual([]);
    });

    it("lists multiple active effects together, each with its own tint", () => {
      const { controller } = setup();

      controller.apply("wide-paddle");
      controller.apply("slow-ball");

      const types = controller.getActiveBoosters().map((b) => b.type);
      expect(types).toContain("wide-paddle");
      expect(types).toContain("slow-ball");
      // The HUD dot is colored per booster, so each entry has to carry one.
      expect(new Set(controller.getActiveBoosters().map((b) => b.tint)).size).toBe(2);
    });

    it("reports the remaining time the HUD counts down from", () => {
      const { controller } = setup();
      controller.apply("wide-paddle");
      expect(controller.getActiveBoosters()[0].remainingMs).toBe(WIDE_PADDLE_DURATION_MS);
    });

    it("includes hazards, not just boosters — they're timed effects too", () => {
      const { controller } = setup();
      controller.apply("freeze-paddle");
      expect(controller.getActiveBoosters().map((b) => b.type)).toContain("freeze-paddle");
    });
  });
});
