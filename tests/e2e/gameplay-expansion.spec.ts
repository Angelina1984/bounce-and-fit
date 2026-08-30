import { test, expect, type Page } from "@playwright/test";
import { BALL_SPEED } from "../../src/constants";
import {
  advanceToLevel,
  catchStarPowerUp,
  clickCanvasAt,
  getCanvasBox,
  getPrototypeScene,
  waitForGameReady,
} from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickCanvasAt(page, 240, 460); // Play
  await page.waitForTimeout(200);
}

test.describe("Tough bricks", () => {
  test("a top-row brick survives one hit and only actually destroys on the second", async ({ page }) => {
    await startGame(page);

    const before = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") !== undefined);
      return { hitsRemaining: brick.getData("hitsRemaining"), bricksLeft: s.bricks.countActive(true) };
    });
    expect(before.hitsRemaining).toBe(2);

    // First hit: decrements and updates the label, but does not destroy it.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") !== undefined);
      s.handleBrickHit(s.primaryBall, brick);
    });
    const afterFirstHit = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") !== undefined);
      return {
        hitsRemaining: brick?.getData("hitsRemaining"),
        labelText: (brick?.getData("hitsLabel") as { text: string } | undefined)?.text,
        bricksLeft: s.bricks.countActive(true),
      };
    });
    expect(afterFirstHit.bricksLeft).toBe(before.bricksLeft); // still there
    expect(afterFirstHit.hitsRemaining).toBe(1);
    expect(afterFirstHit.labelText).toBe("1");

    // Second hit: now it's actually destroyed.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") !== undefined);
      s.handleBrickHit(s.primaryBall, brick);
    });
    const bricksLeftAfterSecondHit = await page.evaluate(() =>
      window.__game.scene.getScene("prototype").bricks.countActive(true),
    );
    expect(bricksLeftAfterSecondHit).toBe(before.bricksLeft - 1);
  });
});

test.describe("Catch & Aim (sticky paddle)", () => {
  test("a ball sticks on paddle contact, follows real paddle movement, and releases on tap with real velocity", async ({
    page,
  }) => {
    await startGame(page);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("sticky-paddle");
      s.state = "playing";
      s.paddle.x = 240;
      s.primaryBall.x = 240;
      s.primaryBall.y = 715;
      s.primaryBall.body.setVelocity(0, 300); // driven down into the real paddle collider
    });
    await page.waitForTimeout(150);

    const stuckState = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return {
        stuck: s.primaryBall.getData("stuck"),
        vx: s.primaryBall.body.velocity.x,
        vy: s.primaryBall.body.velocity.y,
      };
    });
    expect(stuckState.stuck).toBe(true);
    expect(stuckState.vx).toBe(0);
    expect(stuckState.vy).toBe(0);

    // Follows a real pointer move, not just internally-set state.
    const box = await getCanvasBox(page);
    const xBefore = await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.x);
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const xAfter = await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.x);
    expect(xAfter).toBeGreaterThan(xBefore);

    // A real tap releases it with genuine non-zero velocity — an aimed
    // shot, not the flag alone (see coding-hygiene.md's "physical
    // consequence, not the flag" principle).
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const released = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return {
        stuck: s.primaryBall.getData("stuck"),
        speed: Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y),
      };
    });
    expect(released.stuck).toBe(false);
    expect(released.speed).toBeGreaterThan(50);
  });

  test("a second contact while still active sticks again, not just the first", async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("sticky-paddle");
      s.state = "playing";
      s.paddle.x = 240;
      s.primaryBall.x = 240;
      s.primaryBall.y = 715;
      s.primaryBall.body.setVelocity(0, 300);
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.getData("stuck"))).toBe(
      true,
    );

    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9); // release — always launches upward
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.getData("stuck"))).toBe(
      false,
    );

    // Send it back down toward the paddle again — standing in for it
    // eventually coming back around during real play, sped up for the
    // test — and confirm the real collider sticks it a second time rather
    // than treating "already used once" as some kind of one-shot exemption.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.primaryBall.x = s.paddle.x;
      s.primaryBall.y = 715;
      s.primaryBall.body.setVelocity(0, 300);
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.getData("stuck"))).toBe(
      true,
    );
  });
});

test.describe("Foresight", () => {
  test("the aim preview only draws while a ball is stuck and the booster is active", async ({ page }) => {
    await startGame(page);

    // Stuck, but Foresight not yet active — no preview.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("sticky-paddle");
      s.state = "playing";
      s.paddle.x = 240;
      s.primaryBall.x = 240;
      s.primaryBall.y = 715;
      s.primaryBall.body.setVelocity(0, 300);
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.getData("stuck"))).toBe(
      true,
    );
    let commandCount = await page.evaluate(
      () => window.__game.scene.getScene("prototype").foresightGraphics.commandBuffer.length,
    );
    expect(commandCount).toBe(0);

    // Active and stuck — preview now draws.
    await page.evaluate(() => window.__game.scene.getScene("prototype").boosters.apply("foresight"));
    await page.waitForTimeout(50);
    commandCount = await page.evaluate(
      () => window.__game.scene.getScene("prototype").foresightGraphics.commandBuffer.length,
    );
    expect(commandCount).toBeGreaterThan(0);

    // Released — nothing stuck anymore, preview clears even though the
    // booster is still active.
    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
    await page.waitForTimeout(50);
    commandCount = await page.evaluate(
      () => window.__game.scene.getScene("prototype").foresightGraphics.commandBuffer.length,
    );
    expect(commandCount).toBe(0);
  });
});

test.describe("Double Ball / Triple Ball", () => {
  test("compound additively — catching both reaches the exact total, and every ball is genuinely playable", async ({
    page,
  }) => {
    await startGame(page);

    // Launched first so each catch's spawned balls have a real trajectory
    // to diverge from (an unlaunched primary ball reads as a false failure
    // here, not a real one — same reasoning as the Extra Ball tests).
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(0, -300);
    });

    expect(await catchStarPowerUp(page, "double-ball")).toBe(true);
    expect((await getPrototypeScene(page)).ballCount).toBe(3); // 1 (primary) + 2

    expect(await catchStarPowerUp(page, "triple-ball")).toBe(true);
    expect((await getPrototypeScene(page)).ballCount).toBe(6); // 3 + 3, not reset to 3

    // Existence alone isn't proof — the exact bug this session's Extra Ball
    // regression looked like (see coding-hygiene.md): every ball must have
    // real, non-zero velocity, not just be present in the group.
    const velocities = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .balls.getChildren()
        .map((b: any) => Math.hypot(b.body.velocity.x, b.body.velocity.y)),
    );
    expect(velocities).toHaveLength(6);
    for (const speed of velocities) expect(speed).toBeGreaterThan(50);
  });

  // Regression test: reported live as "the whole game freezes when the
  // paddle catches the blue booster." Root cause: if the *original*
  // primaryBall (not just any "extra" one) falls off-screen while other
  // balls survive, update() destroyed it without ever reassigning
  // primaryBall to a still-alive ball. The next Extra/Double/Triple Ball
  // catch then read .velocity off the destroyed ball's null body inside a
  // real Phaser physics-step callback — an uncaught exception there halts
  // the whole game loop (paddle, ball, every booster timer all stop, since
  // none of them run again after that).
  test("catching another ball booster still works after the original primary ball (not an extra one) falls", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await startGame(page);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.primaryBall.body.setVelocity(0, -300);
    });

    expect(await catchStarPowerUp(page, "extra-ball")).toBe(true);
    expect((await getPrototypeScene(page)).ballCount).toBe(2);

    // Force the original primaryBall specifically off-screen, leaving the
    // extra ball alive — the "some balls fell, not all" branch, which is
    // exactly where the stale reference went unfixed.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.primaryBall.y = s.scale.height + 999;
      s.primaryBall.body.setVelocity(0, 0);
    });
    await page.waitForTimeout(300);
    expect((await getPrototypeScene(page)).ballCount).toBe(1);

    // Catching another blue booster must not throw, and must still
    // actually add a real, moving ball — not just silently fail to crash.
    expect(await catchStarPowerUp(page, "double-ball")).toBe(true);
    await page.waitForTimeout(150);
    expect((await getPrototypeScene(page)).ballCount).toBe(3);

    // The whole game loop must still be alive: real pointer input still
    // moves the paddle (the actual symptom reported — paddle stopped
    // responding once the uncaught exception hit).
    const before = (await getPrototypeScene(page)).paddleX;
    const box = await getCanvasBox(page);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const after = (await getPrototypeScene(page)).paddleX;
    expect(after).not.toBe(before);

    expect(pageErrors).toEqual([]);
  });
});

test.describe("Freeze Paddle placement", () => {
  test("does not appear before the last level, and does appear there", async ({ page }) => {
    await startGame(page);

    const hasFreezeOnLevel1 = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .bricks.getChildren()
        .some((b: any) => b.getData("hazard") === "freeze-paddle"),
    );
    expect(hasFreezeOnLevel1).toBe(false);

    await advanceToLevel(page, 5); // Gauntlet — the last level
    expect((await getPrototypeScene(page)).levelText).toContain("Gauntlet");

    const hasFreezeOnLastLevel = await page.evaluate(() =>
      window.__game.scene
        .getScene("prototype")
        .bricks.getChildren()
        .some((b: any) => b.getData("hazard") === "freeze-paddle"),
    );
    expect(hasFreezeOnLastLevel).toBe(true);
  });
});

test.describe("Challenge speed ramp", () => {
  // Levels are 0-indexed, so level 5 is index 4 — a player who's cleared
  // the first 4 (calm, all-ages) levels is judged "good" and the ball
  // starts getting progressively faster from here to actually challenge
  // them (see the design brief §3 and gameplayMath.ts's ballSpeedForLevel).
  test("serves at the standard speed through level 4, then faster from level 5 on", async ({ page }) => {
    await startGame(page);

    await clickCanvasAt(page, 240, 460); // serve on level 1
    await page.waitForTimeout(100);
    const level1Speed = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y);
    });
    expect(level1Speed).toBeCloseTo(BALL_SPEED, 0);

    await advanceToLevel(page, 4); // level 5, "Burn Through"
    expect((await getPrototypeScene(page)).levelText).toContain("Burn Through");

    await clickCanvasAt(page, 240, 460); // serve on level 5
    await page.waitForTimeout(100);
    const level5Speed = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y);
    });
    expect(level5Speed).toBeGreaterThan(level1Speed);
  });
});
