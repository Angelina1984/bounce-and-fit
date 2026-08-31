import { test, expect, type Page } from "@playwright/test";
import { BALL_SPEED, GAME_STATE } from "../../src/constants";
import {
  advanceToLevel,
  catchStarPowerUp,
  getCanvasBox,
  getPrototypeScene,
  waitForGameReady,
  clickPlay,
  tapToServe,
} from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

test.describe("Tough bricks", () => {
  test("a 3-hit brick lightens one shade per hit and only destroys on the third", async ({ page }) => {
    await startGame(page);

    // The shade IS the hit-count readout now — there's no number to read —
    // so this asserts the tint actually changes, not just the data value.
    const before = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") === 3);
      return {
        found: Boolean(brick),
        hits: brick?.getData("hitsRemaining"),
        tint: brick?.tintTopLeft,
        bricksLeft: s.bricks.countActive(true),
      };
    });
    expect(before.found).toBe(true);
    expect(before.hits).toBe(3);

    const hitTheSameBrick = async () =>
      page.evaluate(() => {
        const s = window.__game.scene.getScene("prototype");
        // Re-find by position: after a hit its hitsRemaining changes, so it
        // can't be looked up by the old value.
        const brick = s.bricks.getChildren().find((b: any) => b.getData("toughProbe") === true);
        s.handleBrickHit(s.primaryBall, brick);
      });

    // Tag the brick so later lookups find the same one as its data changes.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const brick = s.bricks.getChildren().find((b: any) => b.getData("hitsRemaining") === 3);
      brick.setData("toughProbe", true);
    });

    const readProbe = () =>
      page.evaluate(() => {
        const s = window.__game.scene.getScene("prototype");
        const brick = s.bricks.getChildren().find((b: any) => b.getData("toughProbe") === true);
        return {
          alive: Boolean(brick),
          hits: brick?.getData("hitsRemaining"),
          tint: brick?.tintTopLeft,
          bricksLeft: s.bricks.countActive(true),
        };
      });

    await hitTheSameBrick();
    const afterFirst = await readProbe();
    expect(afterFirst.alive).toBe(true);
    expect(afterFirst.bricksLeft).toBe(before.bricksLeft); // survived
    expect(afterFirst.hits).toBe(2);
    expect(afterFirst.tint).not.toBe(before.tint); // visibly lighter

    await hitTheSameBrick();
    const afterSecond = await readProbe();
    expect(afterSecond.alive).toBe(true);
    expect(afterSecond.bricksLeft).toBe(before.bricksLeft);
    expect(afterSecond.hits).toBe(1);
    expect(afterSecond.tint).not.toBe(afterFirst.tint);

    // Worn all the way down, it now looks like an ordinary brick — and the
    // next hit destroys it like one.
    const ordinaryTint = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      const plain = s.bricks
        .getChildren()
        .find(
          (b: any) => b.getData("hitsRemaining") === undefined && !b.getData("starPowerUp") && !b.getData("hazard"),
        );
      return plain?.tintTopLeft;
    });
    expect(afterSecond.tint).toBe(ordinaryTint);

    await hitTheSameBrick();
    const afterThird = await readProbe();
    expect(afterThird.alive).toBe(false);
    expect(afterThird.bricksLeft).toBe(before.bricksLeft - 1);
  });

  test("tough bricks are scattered through the grid, not confined to the top row", async ({ page }) => {
    await startGame(page);

    const rows = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      // Recover each tough brick's grid row from its Y position.
      const ys = s.bricks
        .getChildren()
        .filter((b: any) => b.getData("hitsRemaining") !== undefined)
        .map((b: any) => Math.round(b.y));
      return [...new Set<number>(ys)].sort((a, b) => a - b);
    });

    expect(rows.length).toBeGreaterThan(1); // more than one row has tough bricks
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
      s.primaryBall.y = s.paddle.y - 5;
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
      s.primaryBall.y = s.paddle.y - 5;
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
      s.primaryBall.y = s.paddle.y - 5;
      s.primaryBall.body.setVelocity(0, 300);
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").primaryBall.getData("stuck"))).toBe(
      true,
    );
  });
});

test.describe("Foresight", () => {
  test("during play, the aim preview draws only while a ball is stuck and the booster is active", async ({ page }) => {
    await startGame(page);

    // Stuck, but Foresight not yet active — no preview.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.boosters.apply("sticky-paddle");
      s.state = "playing";
      s.paddle.x = 240;
      s.primaryBall.x = 240;
      s.primaryBall.y = s.paddle.y - 5;
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

  test("previews the serve with Foresight alone — Catch & Aim is not required to see it", async ({ page }) => {
    // Foresight used to draw only for a ball stuck via Catch & Aim, which
    // made it invisible unless both boosters were active at once — with 6s
    // and 5s timers, usually never. It now also previews the serve, the
    // game's other aiming moment. Reported live as "when I collect foresight
    // I don't see anything."
    await startGame(page);

    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").state)).toBe(GAME_STATE.SERVING);
    let commandCount = await page.evaluate(
      () => window.__game.scene.getScene("prototype").foresightGraphics.commandBuffer.length,
    );
    expect(commandCount).toBe(0);

    // Foresight only — no sticky-paddle anywhere in this test.
    await page.evaluate(() => window.__game.scene.getScene("prototype").boosters.apply("foresight"));
    await page.waitForTimeout(80);

    const state = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return {
        commandCount: s.foresightGraphics.commandBuffer.length as number,
        sticky: s.boosters.stickyPaddleActive as boolean,
        stuck: Boolean(s.primaryBall.getData("stuck")),
      };
    });
    expect(state.sticky).toBe(false);
    expect(state.stuck).toBe(false);
    expect(state.commandCount).toBeGreaterThan(0);

    // Launching clears it — a ball in flight is no longer being aimed.
    const box = await getCanvasBox(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
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

    await tapToServe(page); // serve on level 1
    await page.waitForTimeout(100);
    const level1Speed = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y);
    });
    expect(level1Speed).toBeCloseTo(BALL_SPEED, 0);

    await advanceToLevel(page, 4); // level 5, "Burn Through"
    expect((await getPrototypeScene(page)).levelText).toContain("Burn Through");

    await tapToServe(page); // serve on level 5
    await page.waitForTimeout(100);
    const level5Speed = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return Math.hypot(s.primaryBall.body.velocity.x, s.primaryBall.body.velocity.y);
    });
    expect(level5Speed).toBeGreaterThan(level1Speed);
  });
});
