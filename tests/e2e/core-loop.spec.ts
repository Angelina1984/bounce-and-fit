import { test, expect, type Page } from "@playwright/test";
import { GAME_STATE } from "../../src/constants";
import {
  clickActionButton,
  waitForGameState,
  getCanvasBox,
  getPrototypeScene,
  waitForGameReady,
  winCurrentLevel,
  clickPlay,
} from "./gameHooks";

async function startGame(page: Page): Promise<void> {
  await page.goto("/");
  await waitForGameReady(page);
  await clickPlay(page);
  await page.waitForTimeout(200);
}

test.describe("Core loop", () => {
  test("paddle follows the pointer", async ({ page }) => {
    await startGame(page);
    const box = await getCanvasBox(page);

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const left = await getPrototypeScene(page);

    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await page.waitForTimeout(100);
    const right = await getPrototypeScene(page);

    expect(right.paddleX).toBeGreaterThan(left.paddleX);
  });

  test("tapping serves the ball, and catching it never costs a life", async ({ page }) => {
    await startGame(page);
    const box = await getCanvasBox(page);

    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
    await page.waitForTimeout(200);

    let state = await getPrototypeScene(page);
    expect(state.state).toBe(GAME_STATE.PLAYING);
    expect(state.lives).toBe(5);

    // 15 real paddle catches in a row — lives must stay untouched (design
    // brief §3: catching the ball is free and unlimited).
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      for (let i = 0; i < 15; i++) {
        s.state = "playing";
        s.handlePaddleHit(s.primaryBall, s.paddle);
      }
    });

    state = await getPrototypeScene(page);
    expect(state.lives).toBe(5);
  });

  test("winning a level shows the congrats message and a Next Level button", async ({ page }) => {
    await startGame(page);
    await winCurrentLevel(page);
    await page.waitForTimeout(150);

    const state = await getPrototypeScene(page);
    expect(state.state).toBe(GAME_STATE.WON);
    expect(state.messageText).toContain("Congrats");
    expect(state.actionText).toBe("Next Level");
    expect(state.actionVisible).toBe(true);
  });

  test("running out of lives ends the run, and retry resets all the way to level 1 with full lives", async ({
    page,
  }) => {
    await startGame(page);

    // Advance to level 2 first, specifically to prove retry-after-game-over
    // sends the player back past whatever level they were on.
    await winCurrentLevel(page);
    await page.waitForTimeout(150);
    await clickActionButton(page);
    await page.waitForTimeout(200);
    expect((await getPrototypeScene(page)).levelIndex).toBe(1);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      s.livesRemaining = 1;
      s.state = "playing";
      s.paddle.x = 50; // out of the way, so the ball genuinely misses
      s.primaryBall.x = 400;
      s.primaryBall.y = s.paddle.y - 30;
      s.primaryBall.body.setVelocity(0, 500);
    });
    await waitForGameState(page, GAME_STATE.LOST);

    let state = await getPrototypeScene(page);
    expect(state.state).toBe(GAME_STATE.LOST);
    expect(state.actionText).toBe("Tap to retry");

    await clickActionButton(page);
    await page.waitForTimeout(200);

    state = await getPrototypeScene(page);
    expect(state.levelIndex).toBe(0);
    expect(state.lives).toBe(5);
    expect(state.state).toBe(GAME_STATE.SERVING);
  });
});
