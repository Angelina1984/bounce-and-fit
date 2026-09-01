import { test, expect, type Page } from "@playwright/test";
import { FAST_BALL_MULTIPLIER, GAME_STATE } from "../../src/constants";
import {
  advanceToLevel,
  catchStarPowerUp,
  clickActionButton,
  getPrototypeScene,
  triggerHazardBrick,
  waitForGameReady,
  winCurrentLevel,
  clickPlay,
  tapToServe,
} from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

test.describe("Boosters", () => {
  // Real-time revert itself (the timer actually firing after its full
  // duration) is unit-tested with a fake clock in BoosterController.test.ts,
  // not waited out here in real wall-clock time — Phaser's scene.time.Clock
  // is driven by the game's own delta time, which can lag behind wall-clock
  // time if the browser throttles a backgrounded/parallel tab's rendering,
  // making a multi-second real wait unreliable in a real browser (same
  // reason Freeze Paddle/Paddle Cut's reverts were never wait-tested here
  // either). This test instead covers what's actually new and E2E-relevant:
  // destroying bricks no longer affects it at all.
  test("Wide Paddle is unaffected by bricks destroyed — only its real-time timer reverts it", async ({ page }) => {
    await startGame(page);

    expect(await catchStarPowerUp(page, "wide-paddle")).toBe(true);
    let state = await getPrototypeScene(page);
    expect(state.paddleWidthState).toBe("wide");

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => !b.getData("starPowerUp") && !b.getData("hazard"));
      if (brick) s.handleBrickHit(s.primaryBall, brick);
    });
    state = await getPrototypeScene(page);
    expect(state.paddleWidthState).toBe("wide");
  });

  test("hazard bricks trigger immediately on destruction — no falling item, no catch", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 5); // "Gauntlet"
    expect((await getPrototypeScene(page)).levelText).toContain("Gauntlet");

    expect(await triggerHazardBrick(page, "narrow-paddle")).toBe(true);
    const state = await getPrototypeScene(page);
    expect(state.paddleWidthState).toBe("narrow");
    expect(state.paddleWidth).toBe(45);

    const powerUpsSpawned = await page.evaluate(() =>
      window.__game.scene.getScene("prototype").powerUps.countActive(true),
    );
    expect(powerUpsSpawned).toBe(0);
  });

  test("Extra Ball + Burning Ball compound: every ball in play catches fire", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 4); // "Burn Through"
    expect((await getPrototypeScene(page)).levelText).toContain("Burn Through");

    // Launch the primary ball first — catching a star brick's drop mid-play
    // is the realistic scenario, and it's what makes "every ball has real
    // velocity" below a meaningful check instead of a false failure (a
    // still-resting, never-served primary ball legitimately has 0 velocity).
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(80, -350);
    });

    expect(await catchStarPowerUp(page, "extra-ball")).toBe(true);
    expect((await getPrototypeScene(page)).ballCount).toBe(2);

    // Existence alone isn't proof it's actually playing — see
    // levels.spec.ts's Level 4 test for why this check exists (a real bug
    // shipped where the extra ball spawned with its velocity silently
    // zeroed by Group#add() re-applying defaults; ballCount === 2 passed
    // right through it).
    const extraBallVelocities = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .balls.getChildren()
        .map((b: any) => Math.hypot(b.body.velocity.x, b.body.velocity.y)),
    );
    for (const speed of extraBallVelocities) {
      expect(speed).toBeGreaterThan(50);
    }

    expect(await catchStarPowerUp(page, "burning-ball")).toBe(true);
    expect((await getPrototypeScene(page)).burningActive).toBe(true);

    const tints = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return s.balls.getChildren().map((b: any) => b.tintTopLeft);
    });
    expect(tints).toHaveLength(2);
    expect(new Set(tints).size).toBe(1); // both balls share the same (burning) tint
  });

  test("any missed ball clears every active booster back to native", async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("wide-paddle");
      s.boosters.apply("slow-ball");
      s.boosters.apply("big-ball");
      s.boosters.apply("burning-ball");
    });
    let state = await getPrototypeScene(page);
    expect(state.paddleWidthState).toBe("wide");
    expect(state.ballSpeedMultiplier).toBeLessThan(1);
    expect(state.ballsBig).toBe(true);
    expect(state.burningActive).toBe(true);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.y = s.scale.height + 999;
      s.primaryBall.body.setVelocity(0, 0);
    });
    await page.waitForTimeout(200);

    state = await getPrototypeScene(page);
    expect(state.paddleWidthState).toBe("normal");
    expect(state.paddleWidth).toBe(90);
    expect(state.ballSpeedMultiplier).toBe(1);
    expect(state.ballsBig).toBe(false);
    expect(state.burningActive).toBe(false);
  });
});

test("an active booster shows a countdown badge that ticks down and then disappears", async ({ page }) => {
  await startGame(page);

  const badges = () =>
    page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .boosters.getActiveBoosters()
        .map((b: any) => ({ type: b.type, remainingMs: b.remainingMs })),
    );

  expect(await badges()).toEqual([]);

  await page.evaluate(() => window.__game.scene.getScene("prototype").boosters.apply("big-ball"));
  const first = await badges();
  expect(first).toHaveLength(1);
  expect(first[0].type).toBe("big-ball");

  // Real time has to actually reduce it — this is the whole feature.
  await page.waitForFunction(
    (startMs) => {
      const list = window.__game.scene.getScene("prototype").boosters.getActiveBoosters();
      return list.length === 1 && list[0].remainingMs < startMs - 400;
    },
    first[0].remainingMs,
    { timeout: 8000 },
  );

  // And the HUD label reflects it, not just the controller.
  const labelText = await page.evaluate(() => {
    const hud = window.__game.scene.getScene("prototype").hud;
    return hud.boosterLabels.filter((l: any) => l.visible).map((l: any) => l.text);
  });
  expect(labelText.join(" ")).toContain("Big Ball");
});

test.describe("Level progression", () => {
  test("winning every level wraps back to level 1 with a full life count", async ({ page }) => {
    await startGame(page);

    for (let i = 0; i < 6; i++) {
      await winCurrentLevel(page);
      await page.waitForTimeout(150);
      const midState = await getPrototypeScene(page);
      expect(midState.actionText).toBe(i < 5 ? "Next Level" : "Play Again");
      await clickActionButton(page);
      await page.waitForTimeout(150);
    }

    const final = await getPrototypeScene(page);
    expect(final.levelIndex).toBe(0);
    expect(final.lives).toBe(5);
  });

  test("lives carry forward across a Next Level transition", async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__game.scene.getScene("prototype").livesRemaining = 3;
    });
    await winCurrentLevel(page);
    await page.waitForTimeout(150);
    await clickActionButton(page);
    await page.waitForTimeout(150);

    const state = await getPrototypeScene(page);
    expect(state.levelIndex).toBe(1);
    expect(state.lives).toBe(3);
  });

  // Every booster/hazard used to be a real-time-vs-hit-based mix, and only
  // the hit-based ones carried across "Next Level" (Slow Ball was the one
  // exception, kept real-time on purpose). Now that *everything* is
  // real-time, nothing carries at all — real-time timers don't survive
  // scene.restart() regardless of what set them up. This replaces the old
  // "a hit-based booster still active when a level is won carries into the
  // next level" test, which asserted the opposite of current behavior.
  test("a booster still active when a level is won does not carry into the next level", async ({ page }) => {
    await startGame(page);

    // Trigger level 1's narrow-paddle hazard brick first — it cancels Wide
    // Paddle (the two are mutually exclusive on paddle width) if applied
    // *after* it, and winCurrentLevel() below destroys every remaining
    // brick including that one. Getting it out of the way before catching
    // Wide Paddle means the win doesn't re-trigger it a second time.
    expect(await triggerHazardBrick(page, "narrow-paddle")).toBe(true);

    expect(await catchStarPowerUp(page, "wide-paddle")).toBe(true);
    expect((await getPrototypeScene(page)).paddleWidthState).toBe("wide");

    await winCurrentLevel(page);
    await page.waitForTimeout(150);
    let state = await getPrototypeScene(page);
    expect(state.state).toBe(GAME_STATE.WON);
    expect(state.paddleWidthState).toBe("wide"); // still active going into "Next Level"

    await clickActionButton(page);
    await page.waitForTimeout(200);

    state = await getPrototypeScene(page);
    expect(state.levelIndex).toBe(1);
    expect(state.paddleWidthState).toBe("normal"); // reset, not carried
    expect(state.paddleWidth).toBe(90);
    // The sprite alone isn't proof — same "physical consequence, not the
    // flag" principle as levels.spec.ts: the paddle's real collision body
    // must be back to native too, not just its display size.
    const bodyWidth = await page.evaluate(() => window.__game.scene.getScene("prototype").paddle.body.width);
    expect(bodyWidth).toBeCloseTo(90, 0);
  });

  // Regression test: reported as "level 2 feels slower than level 1" —
  // Slow Ball was still active (per the carry-over rule the test above
  // exercises for Wide Paddle) at the moment level 1 was won, so its speed
  // reduction carried into level 2. Slow Ball is the one hit-based booster
  // that never carries; every level always starts at the standard speed.
  test("Slow Ball never carries into the next level — it always starts at the standard ball speed", async ({
    page,
  }) => {
    await startGame(page);

    // Same setup pattern as the Wide Paddle test above: leave only the
    // Slow Ball star brick standing, so catching it is also the winning
    // move, with no other bricks destroyed afterward to decay it.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      for (let pass = 0; pass < 5; pass++) {
        const remaining = s.bricks.getChildren().filter((b: any) => b.getData("starPowerUp") !== "slow-ball");
        if (remaining.length <= 1) break;
        for (const brick of remaining.slice(1)) s.handleBrickHit(s.primaryBall, brick);
      }
    });

    expect(await catchStarPowerUp(page, "slow-ball")).toBe(true);
    await winCurrentLevel(page); // destroys the one remaining brick and ends the level
    let state = await getPrototypeScene(page);
    expect(state.state).toBe(GAME_STATE.WON);
    expect(state.ballSpeedMultiplier).toBeLessThan(1); // still active going into "Next Level"

    await clickActionButton(page);
    await page.waitForTimeout(200);

    state = await getPrototypeScene(page);
    expect(state.levelIndex).toBe(1);
    expect(state.ballSpeedMultiplier).toBe(1); // reset, not carried

    // Physical consequence, not just the flag: a real serve in the new
    // level must actually move at the standard speed.
    await clickPlay(page);
    await page.waitForTimeout(100);
    const speed = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y);
    });
    expect(speed).toBeGreaterThan(400); // BALL_SPEED is 420; a slowed serve would read ~252
  });

  // The counterpart to the booster test above: *nothing* earned inside a
  // level crosses out of it. Lives and score still carry, because those are
  // run-wide resources — a level that opened with three balls would be a
  // level whose opening was decided by the previous one.
  test("extra balls still in play when a level is won do not carry into the next level", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 3); // "Double Up" — Extra Ball
    expect((await getPrototypeScene(page)).levelText).toContain("Double Up");

    // Launched first so Extra Ball's spawn has a real velocity to diverge
    // from — see the "Extra Ball + Burning Ball" test above for why this
    // matters (an unlaunched primary ball reads as a false failure, not a
    // real one, if the extra ball ever regresses back to motionless).
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(0, -300);
    });
    expect(await catchStarPowerUp(page, "extra-ball")).toBe(true);
    expect((await getPrototypeScene(page)).ballCount).toBe(2);

    const beforeWin = await getPrototypeScene(page);
    await winCurrentLevel(page);
    await page.waitForTimeout(150);
    expect((await getPrototypeScene(page)).ballCount).toBe(2); // both survived to the win screen

    await clickActionButton(page);
    await page.waitForTimeout(200);

    const state = await getPrototypeScene(page);
    expect(state.levelIndex).toBe(4);
    expect(state.ballCount).toBe(1);
    // Lives and score are the two things that do cross the boundary.
    expect(state.lives).toBe(beforeWin.lives);
    expect(state.score).toBeGreaterThanOrEqual(beforeWin.score);

    // The single ball is a real, serveable one — not a leftover in a
    // formation built for two, which is what a half-removed carry-over
    // would leave behind.
    const ball = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const b = s.balls.getChildren()[0];
      return { x: b.x, paddleX: s.paddle.x, serveOffsetX: b.getData("serveOffsetX") };
    });
    expect(ball.serveOffsetX).toBe(0);
    expect(ball.x).toBeCloseTo(ball.paddleX, 1);

    await tapToServe(page);
    await page.waitForTimeout(100);
    const velocities = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .balls.getChildren()
        .map((b: any) => Math.hypot(b.body.velocity.x, b.body.velocity.y)),
    );
    expect(velocities).toHaveLength(1);
    expect(velocities[0]).toBeGreaterThan(50);
  });
});

test.describe("Fast Ball", () => {
  test("speeds a ball already in flight, and reverts on its own", async ({ page }) => {
    await startGame(page);
    await tapToServe(page);
    await page.waitForTimeout(120);

    const speed = () =>
      page.evaluate(() => {
        const b = window.__game.scene.getScene("prototype").primaryBall.body;
        return Math.hypot(b.velocity.x, b.velocity.y);
      });

    const before = await speed();
    expect(before).toBeGreaterThan(0);

    // Two things other than the timer can change the multiplier inside the
    // 5s window, and both had to be removed for this to mean anything.
    // A ball left to itself gets missed, and a miss resets every booster —
    // so the paddle is widened past the arena to make the rally unmissable.
    // But a paddle that wide then catches every drop that falls, and with
    // two Fast Balls and a Slow Ball per level, those catches kept re-arming
    // the very timer under test (this failed 3/3 that way before the arena
    // was emptied). Destroying the bricks directly, rather than through
    // handleBrickHit, drops nothing and does not end the level.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.bricks
        .getChildren()
        .slice()
        .forEach((b: { destroy: () => void }) => b.destroy());
      s.powerUps.clear(true, true);
      s.paddle.setDisplaySize(2000, s.paddle.displayHeight);
    });

    await page.evaluate(() => window.__game.scene.getScene("prototype").boosters.apply("fast-ball"));
    expect(await speed()).toBeCloseTo(before * FAST_BALL_MULTIPLIER, 0);

    const livesDuring = (await getPrototypeScene(page)).lives;
    // Generous, and not arbitrarily: the 5s here is *game* time, and
    // Phaser's clock advances on requestAnimationFrame, which browsers
    // throttle hard when several Playwright workers compete for the machine.
    // A timeout sized to the duration plus a little passes solo and fails
    // every time in parallel (see gameHooks.ts and coding-hygiene.md).
    await page.waitForFunction(
      () => window.__game.scene.getScene("prototype").boosters.speedMultiplier === 1,
      undefined,
      { timeout: 30_000 },
    );

    const after = await getPrototypeScene(page);
    // No life was lost, so the revert came from the booster's own timer
    // rather than from the reset a miss performs.
    expect(after.lives).toBe(livesDuring);
    expect(await speed()).toBeCloseTo(before, 0);
  });

  // The two are opposites sharing one slot in BoosterController. If they
  // stacked, the ball would end up at a speed neither booster advertises.
  test("replaces a running Slow Ball rather than compounding with it", async ({ page }) => {
    await startGame(page);
    await tapToServe(page);
    await page.waitForTimeout(120);

    const active = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("slow-ball");
      s.boosters.apply("fast-ball");
      return {
        types: s.boosters.getActiveBoosters().map((b: { type: string }) => b.type),
        multiplier: s.boosters.speedMultiplier,
      };
    });

    expect(active.types).toEqual(["fast-ball"]);
    expect(active.multiplier).toBeCloseTo(FAST_BALL_MULTIPLIER);
  });
});

test.describe("Extra Life", () => {
  // Level 5 is the first level that carries one — every 5th level and no
  // other (EXTRA_LIFE_LEVEL_INTERVAL). Getting there through the real
  // Next Level flow is also what proves the rule holds in the built grid,
  // not just in the level data.
  const EXTRA_LIFE_LEVEL_INDEX = 4;

  test("is absent from the early levels and present on level 5", async ({ page }) => {
    await startGame(page);
    const carries = () =>
      page.evaluate(() =>
        window.__game.scene
          .getScene("prototype")
          .bricks.getChildren()
          .some((b: any) => b.getData("starPowerUp") === "extra-life"),
      );

    expect(await carries()).toBe(false);
    await advanceToLevel(page, EXTRA_LIFE_LEVEL_INDEX);
    expect(await carries()).toBe(true);
  });

  test("gives a life back, icon and all, after one has been lost", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, EXTRA_LIFE_LEVEL_INDEX);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.livesRemaining = 3;
      s.hud.setLives(3);
    });

    expect(await catchStarPowerUp(page, "extra-life")).toBe(true);

    const after = await getPrototypeScene(page);
    expect(after.lives).toBe(4);
    // The icon row is the actual readout, so it has to move too.
    expect(after.lifeIconsVisible).toBe(4);
  });

  // The HUD draws exactly MAX_LIVES icons, so a life past the cap would be
  // invisible — and an invisible reward reads as the booster being broken.
  test("is capped at the full life count rather than going past the icon row", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, EXTRA_LIFE_LEVEL_INDEX);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.livesRemaining = 5;
      s.hud.setLives(5);
    });
    const before = await getPrototypeScene(page);

    expect(await catchStarPowerUp(page, "extra-life")).toBe(true);

    const after = await getPrototypeScene(page);
    expect(after.lives).toBe(5);
    expect(after.lifeIconsVisible).toBe(5);
    // Still paid for the catch, so a full-lives catch is never a punishment.
    expect(after.score).toBeGreaterThan(before.score);
  });
});

test.describe("Mystery", () => {
  test("resolves to a real booster on catch, and never to a hazard", async ({ page }) => {
    await startGame(page);

    // Rolled for real (Math.random in the browser), so this asserts the
    // contract — something good happened — rather than a fixed outcome.
    // Repeated, because a single roll proves very little about a table.
    for (let attempt = 0; attempt < 12; attempt++) {
      const before = await getPrototypeScene(page);
      const caught = await page.evaluate(() => {
        const s = window.__game.scene.getScene("prototype");
        // Below full lives, so an Extra Life roll actually registers. At the
        // cap it is correctly a no-op, which would look here like a Mystery
        // that resolved to nothing.
        s.livesRemaining = 2;
        const ballsBefore = s.balls.countActive(true);
        const livesBefore = s.livesRemaining;
        s.boosters.apply("mystery");
        return {
          active: s.boosters.getActiveBoosters().map((b: { type: string }) => b.type),
          ballsGained: s.balls.countActive(true) - ballsBefore,
          livesGained: s.livesRemaining - livesBefore,
        };
      });

      // Every outcome is one of: a timed effect (badge), more balls, or a life.
      const didSomething = caught.active.length > 0 || caught.ballsGained > 0 || caught.livesGained > 0;
      expect(didSomething, `attempt ${attempt}: ${JSON.stringify(caught)}`).toBe(true);
      expect(caught.active).not.toContain("mystery");
      expect(caught.active).not.toContain("narrow-paddle");
      expect(caught.active).not.toContain("freeze-paddle");

      // A hazard would also show up as a shrunken paddle, which the badge
      // list alone would miss if it were ever applied without one.
      const after = await getPrototypeScene(page);
      expect(after.paddleWidthState, `attempt ${attempt}`).not.toBe("narrow");
      expect(after.paddleFrozen, `attempt ${attempt}`).toBe(false);
      expect(before.lives).toBeGreaterThan(0);

      await page.evaluate(() => window.__game.scene.getScene("prototype").boosters.resetAll());
    }
  });

  test("its brick shows a question mark, and Extra Life's shows a star", async ({ page }) => {
    await startGame(page);
    const glyphs = () =>
      page.evaluate(() =>
        window.__game.scene
          .getScene("prototype")
          .bricks.getChildren()
          .map((b: any) => {
            const type = b.getData("starPowerUp");
            const text = b.getData("glyphText");
            return type && text ? { type, glyph: text.text } : null;
          })
          .filter(Boolean),
      );

    // Level 1 has no Extra Life to draw a star for, so Mystery is the only
    // symbol on the board — which is itself the placement rule showing up
    // in the rendered grid.
    expect(await glyphs()).toEqual([{ type: "mystery", glyph: "?" }]);

    await advanceToLevel(page, 4); // level 5, the first with an Extra Life
    const onLevelFive = await glyphs();
    expect(onLevelFive).toContainEqual({ type: "mystery", glyph: "?" });
    expect(onLevelFive).toContainEqual({ type: "extra-life", glyph: "★" });
    // Only those two carry one — every other star brick is bare.
    expect(onLevelFive.map((g: any) => g.type).sort()).toEqual(["extra-life", "mystery"]);
  });

  // The glyph is a separate game object from the tinted brick image, so it
  // does not get destroyed for free — one left behind floats over an empty
  // cell for the rest of the level.
  test("the symbol is destroyed along with its brick", async ({ page }) => {
    await startGame(page);
    const orphaned = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("starPowerUp") === "mystery");
      const glyph = brick.getData("glyphText");
      s.handleBrickHit(s.primaryBall, brick);
      return { active: glyph.active, stillOnDisplayList: s.children.list.includes(glyph) };
    });

    expect(orphaned.active).toBe(false);
    expect(orphaned.stillOnDisplayList).toBe(false);
  });
});
