import { test, expect } from "@playwright/test";
import { clickPlay, getActiveSceneKeys, waitForGameReady } from "./gameHooks";

test.describe("Title screen", () => {
  test("shows first, and Play takes the player into level 1", async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);

    await expect(page.locator("canvas")).toBeVisible();
    expect(await getActiveSceneKeys(page)).toEqual(["title"]);

    // clickPlay() derives the button's position from the live canvas —
    // the height varies with the viewport's aspect (see main.ts).
    await clickPlay(page);
    await page.waitForTimeout(300);

    expect(await getActiveSceneKeys(page)).toEqual(["prototype"]);
  });
});
