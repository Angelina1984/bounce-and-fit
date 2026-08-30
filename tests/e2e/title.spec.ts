import { test, expect } from "@playwright/test";
import { clickCanvasAt, getActiveSceneKeys, waitForGameReady } from "./gameHooks";

test.describe("Title screen", () => {
  test("shows first, and Play takes the player into level 1", async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);

    await expect(page.locator("canvas")).toBeVisible();
    expect(await getActiveSceneKeys(page)).toEqual(["title"]);

    // The Play button sits at (width/2, height/2 + 60) in TitleScene's own
    // 480x800 coordinate space.
    await clickCanvasAt(page, 240, 460);
    await page.waitForTimeout(300);

    expect(await getActiveSceneKeys(page)).toEqual(["prototype"]);
  });
});
