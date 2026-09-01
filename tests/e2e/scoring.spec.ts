import { test, expect, type Page } from "@playwright/test";
import {
  SCORE_LEVEL_CLEAR,
  SCORE_PER_BOOSTER_CAUGHT,
  SCORE_PER_BRICK,
  SCORE_PER_LIFE_REMAINING,
} from "../../src/constants";
import { clickActionButton, clickPlay, getPrototypeScene, waitForGameReady, winCurrentLevel } from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

/** Destroys `count` ordinary (one-hit, no star/hazard) bricks in a single
 * trip — no paddle contact between them, so the combo builds. */
async function destroyPlainBricks(page: Page, count: number): Promise<void> {
  await page.evaluate((n) => {
    const s = window.__game.scene.getScene("prototype");
    const plain = s.bricks
      .getChildren()
      .filter((b: any) => b.getData("hitsRemaining") === undefined && !b.getData("starPowerUp") && !b.getData("hazard"))
      .slice(0, n);
    for (const b of plain) s.handleBrickHit(s.primaryBall, b);
  }, count);
}

test.describe("Scoring", () => {
  test("the HUD shows a live score that rises as bricks are destroyed", async ({ page }) => {
    await startGame(page);

    const start = await getPrototypeScene(page);
    expect(start.score).toBe(0);
    expect(start.scoreText).toBe("0");

    await destroyPlainBricks(page, 1);

    const after = await getPrototypeScene(page);
    expect(after.score).toBe(SCORE_PER_BRICK);
    // The visible readout, not just the internal number — the whole reason
    // this feature exists is that the player couldn't see their score.
    expect(after.scoreText).toBe(String(SCORE_PER_BRICK));
  });

  test("bricks cleared in one trip are worth more than the same bricks across separate trips", async ({ page }) => {
    await startGame(page);
    await destroyPlainBricks(page, 3);
    const oneTrip = (await getPrototypeScene(page)).score;

    // Same three bricks, but with a real paddle contact between each, which
    // ends the trip and drops the multiplier back to x1.
    await page.goto("/");
    await waitForGameReady(page);
    await clickPlay(page);
    await page.waitForTimeout(200);
    for (let i = 0; i < 3; i++) {
      await destroyPlainBricks(page, 1);
      await page.evaluate(() => {
        const s = window.__game.scene.getScene("prototype");
        s.scoring.registerPaddleContact();
      });
    }
    const separateTrips = (await getPrototypeScene(page)).score;

    expect(separateTrips).toBe(SCORE_PER_BRICK * 3);
    expect(oneTrip).toBeGreaterThan(separateTrips);
  });

  test("a real paddle hit resets the combo", async ({ page }) => {
    await startGame(page);
    await destroyPlainBricks(page, 2);
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").scoring.comboCount)).toBe(2);

    // Drive a genuine paddle collision rather than calling the scorer.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.state = "playing";
      s.paddle.x = 240;
      s.primaryBall.x = 240;
      s.primaryBall.y = s.paddle.y - 30;
      s.primaryBall.body.setVelocity(0, 300);
    });
    await page.waitForFunction(() => window.__game.scene.getScene("prototype").scoring.comboCount === 0, undefined, {
      timeout: 5000,
    });
  });

  test("clearing a level awards the clear bonus plus one per remaining life, and carries into the next level", async ({
    page,
  }) => {
    await startGame(page);
    const livesBefore = (await getPrototypeScene(page)).lives;

    await winCurrentLevel(page);
    await page.waitForTimeout(200);

    const won = await getPrototypeScene(page);
    // Whatever the bricks were worth, the bonuses are on top of it.
    expect(won.score).toBeGreaterThan(SCORE_LEVEL_CLEAR + SCORE_PER_LIFE_REMAINING * livesBefore);

    await clickActionButton(page);
    await page.waitForTimeout(300);

    const nextLevel = await getPrototypeScene(page);
    expect(nextLevel.levelIndex).toBe(1);
    expect(nextLevel.score).toBe(won.score); // carried, not reset
  });

  test("running out of lives ends the run and a retry starts the score back at zero", async ({ page }) => {
    await startGame(page);
    await destroyPlainBricks(page, 3);
    expect((await getPrototypeScene(page)).score).toBeGreaterThan(0);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.livesRemaining = 1;
      s.state = "playing";
      s.paddle.x = 50;
      s.primaryBall.x = 400;
      s.primaryBall.y = s.paddle.y - 30;
      s.primaryBall.body.setVelocity(0, 500);
    });
    await page.waitForFunction(() => window.__game.scene.getScene("prototype").state === "lost", undefined, {
      timeout: 10000,
    });

    await clickActionButton(page);
    await page.waitForTimeout(300);

    const afterRetry = await getPrototypeScene(page);
    expect(afterRetry.levelIndex).toBe(0);
    expect(afterRetry.score).toBe(0);
    expect(afterRetry.scoreText).toBe("0");
  });

  test("catching a booster drop awards a bonus without disturbing the combo", async ({ page }) => {
    await startGame(page);
    await destroyPlainBricks(page, 2);
    const before = await getPrototypeScene(page);
    const comboBefore = await page.evaluate(() => window.__game.scene.getScene("prototype").scoring.comboCount);

    // Catch through the real overlap handler, not by calling the scorer.
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.spawnPowerUp(s.paddle.x, s.paddle.y - 40, "wide-paddle");
      const drop = s.powerUps.getChildren()[0];
      s.handlePowerUpCatch(s.paddle, drop);
    });

    const after = await getPrototypeScene(page);
    expect(after.score).toBe(before.score + SCORE_PER_BOOSTER_CAUGHT);
    // A catch is not a bounce — the multiplier must survive it.
    expect(await page.evaluate(() => window.__game.scene.getScene("prototype").scoring.comboCount)).toBe(comboBefore);
  });
});
