import { test, expect, type Page } from "@playwright/test";
import {
  advanceToLevel,
  dropAndCatchPowerUp,
  getCanvasBox,
  getPrototypeScene,
  triggerHazardBrick,
  waitForGameReady,
  clickPlay,
} from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

/**
 * One test per level's specific booster/hazard. Deliberately asserts on the
 * *physical* consequence (a body's real width, a ball's real velocity, a
 * paddle that genuinely doesn't move under real input) rather than just an
 * internal state flag — checking only `ballsBig === true` or `ballCount === 2`
 * is exactly what let the Extra Ball motionless-ball bug (TASKS.md) pass
 * unnoticed: the flag was right, the physics wasn't. Catches power-ups via
 * dropAndCatchPowerUp (real overlap dispatch), not a direct
 * handlePowerUpCatch() call, for the same reason.
 */
test.describe("Per-level booster behavior", () => {
  test("Level 1 — Warmup: Wide Paddle widens both the sprite and its physics body", async ({ page }) => {
    await startGame(page);
    const before = await getPrototypeScene(page);
    expect(before.levelText).toContain("Warmup");
    expect(before.paddleWidth).toBe(90);

    await dropAndCatchPowerUp(page, "wide-paddle");

    const after = await getPrototypeScene(page);
    expect(after.paddleWidthState).toBe("wide");
    expect(after.paddleWidth).toBeCloseTo(126, 0);

    // The sprite alone isn't proof — this is exactly what the
    // Body#setSize double-scaling bug (coding-hygiene.md) broke: a wide
    // sprite with a collision box that didn't match it.
    const bodyWidth = await page.evaluate(() => window.__game.scene.getScene("prototype").paddle.body.width);
    expect(bodyWidth).toBeCloseTo(126, 0);
  });

  test("Level 2 — Left Lock: Slow Ball reduces speed but the ball keeps moving", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 1);
    expect((await getPrototypeScene(page)).levelText).toContain("Left Lock");

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(0, -360);
    });
    await dropAndCatchPowerUp(page, "slow-ball");

    const state = await getPrototypeScene(page);
    expect(state.ballSpeedMultiplier).toBeLessThan(1);
    expect(state.ballSpeedMultiplier).toBeGreaterThan(0);

    // Slow is not stopped — position must keep changing.
    const before = await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.y);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.y);
    expect(after).not.toBe(before);
  });

  test("Level 3 — Big Break: Big Ball enlarges both the sprite and its physics body", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 2);
    expect((await getPrototypeScene(page)).levelText).toContain("Big Break");

    await dropAndCatchPowerUp(page, "big-ball");

    const state = await getPrototypeScene(page);
    expect(state.ballsBig).toBe(true);

    const sizes = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return { display: s.primaryBall.displayWidth, body: s.primaryBall.body.width };
    });
    expect(sizes.display).toBeGreaterThan(16); // native is BALL_RADIUS*2 = 16
    expect(sizes.body).toBeCloseTo(sizes.display, 0);
  });

  // Regression test for the exact bug this level exposed in real play:
  // The extra ball spawned but never moved (velocity silently zeroed by
  // Group#add() re-applying defaults — see coding-hygiene.md). Confirms
  // both balls have real velocity immediately and have each actually moved
  // to a new position a moment later — existence and a tint match aren't
  // enough, per this file's own doc comment above.
  test("Level 4 — Double Up: Extra Ball actually moves, not just exists", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 3);
    expect((await getPrototypeScene(page)).levelText).toContain("Double Up");

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(100, -340);
    });
    await dropAndCatchPowerUp(page, "extra-ball");

    const velocitiesRightAfter = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return s.balls.getChildren().map((b: any) => ({ vx: b.body.velocity.x, vy: b.body.velocity.y }));
    });
    expect(velocitiesRightAfter).toHaveLength(2);
    for (const v of velocitiesRightAfter) {
      expect(Math.hypot(v.vx, v.vy)).toBeGreaterThan(50);
    }

    const positionsBefore = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .balls.getChildren()
        .map((b: any) => ({ x: b.x, y: b.y })),
    );
    await page.waitForTimeout(300);
    const positionsAfter = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .balls.getChildren()
        .map((b: any) => ({ x: b.x, y: b.y })),
    );
    for (let i = 0; i < positionsBefore.length; i++) {
      const moved =
        Math.abs(positionsAfter[i].x - positionsBefore[i].x) > 1 ||
        Math.abs(positionsAfter[i].y - positionsBefore[i].y) > 1;
      expect(moved).toBe(true);
    }
  });

  test("Level 5 — Burn Through: Burning Ball passes through a real brick column without bouncing", async ({ page }) => {
    await startGame(page);
    await advanceToLevel(page, 4);
    expect((await getPrototypeScene(page)).levelText).toContain("Burn Through");

    await dropAndCatchPowerUp(page, "burning-ball");
    expect((await getPrototypeScene(page)).burningActive).toBe(true);

    // Fire straight up through a real column of bricks via the actual
    // registered collider/overlap pair — velocity must never reverse
    // (a reversal would mean it bounced instead of piercing).
    //
    // The start point is derived from the column's own lowest brick rather
    // than hardcoded: it has to be far enough below the arena's top rail
    // that the ball can't reach and bounce off it within the sample window
    // (300px/s for 400ms travels ~120px), and a literal Y silently stopped
    // satisfying that the moment the grid moved.
    const result = await page.evaluate(async () => {
      const s = window.__game.scene.getScene("prototype");
      const colX = s.bricks.getChildren()[0].x as number;
      const column = s.bricks.getChildren().filter((b: any) => Math.abs(b.x - colX) < 2);
      const lowestY = Math.max(...column.map((b: any) => b.y as number));
      const bricksBefore = s.bricks.countActive(true);
      s.state = "playing";
      s.primaryBall.x = colX;
      s.primaryBall.y = lowestY + 40;
      s.primaryBall.body.setVelocity(0, -300);

      // Sampled per animation frame rather than after a fixed sleep: the
      // physics step is driven by requestAnimationFrame, which browsers
      // throttle hard when Playwright workers compete for the machine, so
      // "wait 400ms" can advance far less simulation than it looks like.
      // Watching frames also gives a stronger assertion than one sample —
      // the velocity must never go positive at ANY point, not merely be
      // negative at the end.
      let peakVy = -Infinity;
      const deadline = performance.now() + 5000;
      let bricksAfter = bricksBefore;
      while (performance.now() < deadline && bricksAfter > bricksBefore - 2) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        peakVy = Math.max(peakVy, s.primaryBall.body.velocity.y as number);
        bricksAfter = s.bricks.countActive(true) as number;
      }
      return { peakVy, bricksAfter, bricksBefore };
    });
    expect(result.peakVy).toBeLessThan(0); // never reversed — pierced, didn't bounce
    expect(result.bricksAfter).toBeLessThan(result.bricksBefore);
  });

  test("Level 6 — Gauntlet: Paddle Cut shrinks the paddle, Freeze Paddle genuinely blocks real input", async ({
    page,
  }) => {
    await startGame(page);
    await advanceToLevel(page, 5);
    expect((await getPrototypeScene(page)).levelText).toContain("Gauntlet");

    expect(await triggerHazardBrick(page, "narrow-paddle")).toBe(true);
    // Arcade's body-width auto-sync runs on the next physics step, not
    // synchronously with setDisplaySize() — without this wait, reading
    // body.width right after triggerHazardBrick() is a race that flakes
    // under load (see coding-hygiene.md's Phaser gotchas).
    await page.waitForTimeout(50);
    const afterCut = await getPrototypeScene(page);
    expect(afterCut.paddleWidthState).toBe("narrow");
    expect(afterCut.paddleWidth).toBeLessThan(90);
    const bodyWidth = await page.evaluate(() => window.__game.scene.getScene("prototype").paddle.body.width);
    expect(bodyWidth).toBeCloseTo(afterCut.paddleWidth, 0);

    expect(await triggerHazardBrick(page, "freeze-paddle")).toBe(true);

    // Prove input is genuinely blocked with a real mouse move, not just the
    // paddleFrozen flag — movePaddle() could report frozen while still
    // moving the sprite if the early-return were ever misplaced.
    const box = await getCanvasBox(page);
    const before = await page.evaluate(() => window.__game.scene.getScene("prototype").paddle.x);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__game.scene.getScene("prototype").paddle.x);
    expect(after).toBe(before);
  });
});
