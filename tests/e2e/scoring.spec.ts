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

  // The only persisted state in the game, so it is also the only thing a
  // test can leave behind for the next one — every case here sets the
  // stored value explicitly rather than relying on what a prior run wrote.
  test.describe("Personal best", () => {
    const setStoredBest = (page: Page, value: string | null) =>
      page.evaluate((v) => {
        if (v === null) localStorage.removeItem("bounce-and-fit:personal-best");
        else localStorage.setItem("bounce-and-fit:personal-best", v);
      }, value);

    const storedBest = (page: Page) => page.evaluate(() => localStorage.getItem("bounce-and-fit:personal-best"));

    async function loseTheRun(page: Page): Promise<void> {
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
    }

    test("a losing run records its score and says so when it beat the old best", async ({ page }) => {
      await page.goto("/");
      await waitForGameReady(page);
      await setStoredBest(page, "5");
      await clickPlay(page);
      await destroyPlainBricks(page, 3);
      const score = (await getPrototypeScene(page)).score;
      expect(score).toBeGreaterThan(5);

      await loseTheRun(page);

      expect(await storedBest(page)).toBe(String(score));
      const ended = await getPrototypeScene(page);
      expect(ended.messageText).toContain("new best");
      expect(ended.breakdownText).toContain("Personal best");
      expect(ended.breakdownText).toContain(score.toLocaleString());
    });

    test("a run that falls short leaves the stored best alone and does not celebrate", async ({ page }) => {
      await page.goto("/");
      await waitForGameReady(page);
      await setStoredBest(page, "999999");
      await clickPlay(page);
      await destroyPlainBricks(page, 2);

      await loseTheRun(page);

      expect(await storedBest(page)).toBe("999999");
      const ended = await getPrototypeScene(page);
      expect(ended.messageText).toBe("Out of lives");
      expect(ended.breakdownText).toContain("999,999");
    });

    // Clearing a level banks the total then and there, because the score is
    // run-wide: a player who clears five levels and loses the sixth should
    // still keep what those five were worth.
    test("clearing a level banks the total, without waiting for the run to end", async ({ page }) => {
      await page.goto("/");
      await waitForGameReady(page);
      await setStoredBest(page, null);
      await clickPlay(page);
      await winCurrentLevel(page);
      await page.waitForTimeout(200);

      const won = await getPrototypeScene(page);
      expect(await storedBest(page)).toBe(String(won.score));
      // Banked silently. The win screen keeps naming the level: with no
      // stored best, every early clear is a record, so announcing it here
      // would say "new best" almost every time and mean nothing.
      expect(won.messageText).toBe("Level 1 clear!");
      // Nor a breakdown row — those rows sum to Total, and a number after
      // the total that is not part of the sum is the bug this screen had.
      expect(won.breakdownText).not.toContain("Personal best");
    });

    test("the title screen shows the best once there is one, and not before", async ({ page }) => {
      await page.goto("/");
      await waitForGameReady(page);
      await setStoredBest(page, null);
      await page.reload();
      await waitForGameReady(page);
      // Walks into Containers, not just the scene's own display list:
      // PillBadge nests its label inside a Container, and Container.add
      // removes the child from the display list, so a flat scan finds the
      // title and tagline but never the badge.
      const titleTexts = () =>
        page.evaluate(() => {
          const walk = (list: any[]): string[] =>
            list.flatMap((c: any) =>
              typeof c.text === "string" ? [c.text] : Array.isArray(c.list) ? walk(c.list) : [],
            );
          return walk(window.__game.scene.getScene("title").children.list);
        });
      expect((await titleTexts()).join(" ")).not.toContain("Best");

      await setStoredBest(page, "4321");
      await page.reload();
      await waitForGameReady(page);
      expect((await titleTexts()).join(" ")).toContain("4,321");
    });
  });
});
