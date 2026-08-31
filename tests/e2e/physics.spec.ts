import { test, expect, type Page } from "@playwright/test";
import { getCanvasBox, getPrototypeScene, waitForGameReady, waitForNextBrickDestroyed, clickPlay } from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

test.describe("Real collision physics", () => {
  // Regression test for a bug where the ball stopped bouncing off world
  // bounds and stopped dead (instead of reversing) on a brick hit, after
  // being added to a `physics.add.group()` with no explicit config.
  // Phaser's Group#createCallbackHandler re-applies the group's *defaults*
  // to every member on every group.add() call — collideWorldBounds: false,
  // bounceX/Y: 0 — silently overwriting whatever createBallSprite() had
  // just set. Every other test in this suite calls scene methods like
  // handleBrickHit directly, bypassing Phaser's actual collider/physics
  // pipeline entirely, so none of them could have caught this. This test
  // deliberately drives a real ball with real velocity into a real brick
  // through the actual registered collider, specifically to keep that gap
  // covered.
  test("a real brick collision reverses velocity, and world-bounds collision still works afterward", async ({
    page,
  }) => {
    await startGame(page);
    const box = await getCanvasBox(page);

    // Serve toward the brick field with a real click (goes through the
    // actual pointerdown handler and launchBall()).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);

    // Poll until the real collider fires and destroys a brick, capturing
    // velocity just before and just after. Read the starting count live
    // rather than hardcoding it — the grid's total brick count is a level-
    // design detail (BRICK_ROWS, skip cells), not something this test
    // should have to track.
    const initialBricksLeft = (await getPrototypeScene(page)).bricksLeft;
    const { velocityYBefore, velocityYAfter } = await waitForNextBrickDestroyed(page, initialBricksLeft);

    // A real elastic bounce (bounce: 1) reverses the sign of the velocity
    // component that hit the brick — it must not go to (or stay near) zero,
    // which is what "stops dead instead of bouncing" looks like.
    expect(Math.sign(velocityYAfter)).not.toBe(Math.sign(velocityYBefore));
    expect(Math.abs(velocityYAfter)).toBeGreaterThan(100);

    // Let it keep playing for a couple of seconds — with collideWorldBounds
    // broken, it drifts monotonically past the world's edges (x well below
    // 0 or well above 480) and never comes back.
    await page.waitForTimeout(2000);
    const positions: number[] = [];
    for (let i = 0; i < 10; i++) {
      const x = await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.x);
      positions.push(x);
      await page.waitForTimeout(100);
    }
    for (const x of positions) {
      expect(x).toBeGreaterThanOrEqual(-16);
      expect(x).toBeLessThanOrEqual(496);
    }
  });

  // Regression test for a bug where a real paddle hit sent the ball's
  // velocity onto the PADDLE's body instead — the paddle flew off the top
  // of the screen (given the ball's speed) while the ball kept drifting on
  // whatever velocity it already had. Root cause: `physics.add.collider(this.balls, this.paddle, cb)`
  // registers the group first — Phaser's dispatcher (World#collideHandler)
  // normalizes a group-vs-single-object pair by swapping to
  // (singleObject, groupMember) internally whenever the group comes first,
  // so the callback fires as (paddle, ball), not (ball, paddle) matching
  // registration order. The one existing test that exercises
  // handlePaddleHit calls it directly with manually-correct arguments
  // (`s.handlePaddleHit(s.primaryBall, s.paddle)`), which — like the brick
  // regression above — bypasses Phaser's real dispatch entirely and could
  // never have caught an argument-order bug specific to how Phaser invokes
  // it for real.
  test("a real paddle hit moves the ball, not the paddle, and angles off the hit position", async ({ page }) => {
    await startGame(page);

    const before = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return { paddleY: s.paddle.y };
    });

    const after = await page.evaluate(async () => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.paddle.x = 240;
      // Hit near the paddle's right edge, moving straight down, so a
      // correct bounce must deflect the ball to the right (not straight up).
      s.primaryBall.x = 240 + s.paddle.displayWidth / 2 - 5;
      s.primaryBall.y = s.paddle.y - 5;
      s.primaryBall.body.setVelocity(0, 360);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        paddleY: s.paddle.y,
        paddleVelY: s.paddle.body.velocity.y,
        ballVX: s.primaryBall.body.velocity.x,
        ballVY: s.primaryBall.body.velocity.y,
      };
    });

    // The paddle must not have moved or picked up velocity from the hit.
    expect(after.paddleY).toBe(before.paddleY);
    expect(after.paddleVelY).toBe(0);
    // The ball must have bounced back up, angled toward the side it was hit on.
    expect(after.ballVY).toBeLessThan(-50);
    expect(after.ballVX).toBeGreaterThan(50);
  });
});
