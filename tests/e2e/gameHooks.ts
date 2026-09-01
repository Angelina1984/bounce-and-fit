import type { Page } from "@playwright/test";

/**
 * Shared driver for the E2E suite. Uses the window.__game hook that main.ts
 * exposes under import.meta.env.DEV (see the "dev-only hook" comment there
 * and global.d.ts's ambient declaration) so tests can assert on real scene
 * state and drive deterministic scenarios (a specific miss, a specific
 * booster catch) instead of only being able to fight ball physics through
 * mouse coordinates for every case. Paddle movement, clicks, and screen
 * transitions still go through the real pointer/canvas, since those are
 * exactly what a player does.
 */

export interface SceneSnapshot {
  state: string;
  lives: number;
  /** Ball icons actually visible in the HUD — the on-screen life count. */
  lifeIconsVisible: number;
  levelIndex: number;
  score: number;
  scoreText: string;
  levelText: string;
  messageText: string;
  /** The win/lose panel's rows, as one string with newlines. */
  breakdownText: string;
  actionText: string;
  actionVisible: boolean;
  paddleX: number;
  paddleWidth: number;
  paddleWidthState: string;
  paddleFrozen: boolean;
  ballCount: number;
  burningActive: boolean;
  ballSpeedMultiplier: number;
  ballsBig: boolean;
  bricksLeft: number;
}

export async function waitForGameReady(page: Page): Promise<void> {
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => Boolean(window.__game));
}

/**
 * Waits for the scene to actually reach `state`, rather than sleeping long
 * enough that it probably has. Anything driven by ball motion crosses a
 * physics distance, not a wall-clock duration — and Phaser's clock advances
 * on `requestAnimationFrame`, which browsers throttle hard when several
 * Playwright workers compete for the machine. A fixed `waitForTimeout` that
 * passes solo then fails at `--workers=8` is that throttling, not a bug in
 * the game (see coding-hygiene.md).
 */
export async function waitForGameState(page: Page, state: string): Promise<void> {
  await page.waitForFunction((expected) => window.__game.scene.getScene("prototype").state === expected, state, {
    timeout: 10_000,
  });
}

export async function getActiveSceneKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__game.scene.getScenes(true).map((s: any) => s.scene.key));
}

/** The canvas's bounding box, or throws — pulled out as its own helper so
 * the null-guard lives in one place instead of being repeated inline in
 * every test that needs real pointer coordinates. */
export async function getCanvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  return box;
}

/** Polls the real ball body until the next real Arcade collision destroys a
 * brick (bricksLeft drops below `initialBricksLeft`), capturing the primary
 * ball's Y velocity just before and just after. Used by physics.spec.ts to
 * verify an actual bounce, not a handleBrickHit() call made directly. */
export async function waitForNextBrickDestroyed(
  page: Page,
  initialBricksLeft: number,
): Promise<{ velocityYBefore: number; velocityYAfter: number }> {
  let lastSnapshot = { vy: 0, bricksLeft: initialBricksLeft };
  for (let i = 0; i < 100; i++) {
    const snap = await page.evaluate(() => {
      const s = window.__game.scene.getScene("prototype");
      return { vy: s.primaryBall.body.velocity.y as number, bricksLeft: s.bricks.countActive(true) as number };
    });
    const brickJustDestroyed = snap.bricksLeft < initialBricksLeft;
    if (brickJustDestroyed) return { velocityYBefore: lastSnapshot.vy, velocityYAfter: snap.vy };
    lastSnapshot = snap;
    await page.waitForTimeout(20);
  }
  throw new Error("no brick was destroyed within the poll window");
}

/** Clicks at a point given in the game's internal coordinate space (e.g.
 * the 480x800 space PrototypeScene positions things in), converting to CSS
 * pixels via the canvas's actual rendered size — Phaser's Scale.FIT mode
 * means those two are not the same, so a raw pixel click would miss. */
export async function clickCanvasAt(page: Page, gameX: number, gameY: number): Promise<void> {
  const box = await getCanvasBox(page);
  const { cssW, cssH, gameW, gameH } = await page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { cssW: r.width, cssH: r.height, gameW: window.__game.scale.width, gameH: window.__game.scale.height };
  });
  await page.mouse.click(box.x + gameX * (cssW / gameW), box.y + gameY * (cssH / gameH));
}

/**
 * Clicks the title screen's Play button, deriving its position from the live
 * canvas rather than hardcoding one. The canvas height depends on the
 * viewport's aspect (see main.ts's gameHeightForViewport), so a fixed
 * coordinate silently drifts off the button the moment layout changes.
 */
export async function clickPlay(page: Page): Promise<void> {
  const { x, y } = await page.evaluate(() => ({
    x: window.__game.scale.width / 2,
    y: window.__game.scale.height / 2 + 60,
  }));
  await clickCanvasAt(page, x, y);
}

/** Taps in the lower play area to serve — anywhere works, so this just needs
 * to be inside the canvas at whatever height it currently is. */
export async function tapToServe(page: Page): Promise<void> {
  const { x, y } = await page.evaluate(() => ({
    x: window.__game.scale.width / 2,
    y: window.__game.scale.height * 0.6,
  }));
  await clickCanvasAt(page, x, y);
}

export async function getPrototypeScene(page: Page): Promise<SceneSnapshot> {
  return page.evaluate(() => {
    const s = window.__game.scene.getScene("prototype");
    return {
      state: s.state,
      lives: s.livesRemaining,
      lifeIconsVisible: s.hud.livesIcons.filter((i: any) => i.visible).length,
      levelIndex: s.levelIndex,
      score: s.scoring.score,
      scoreText: s.hud.scoreText.text,
      levelText: s.hud.levelText.text,
      messageText: s.hud.messageText.text,
      breakdownText: s.hud.breakdownText.text,
      actionText: s.hud.actionText.text,
      actionVisible: s.hud.actionText.visible,
      paddleX: s.paddle.x,
      paddleWidth: s.paddle.displayWidth,
      paddleWidthState: s.boosters.paddleWidthState,
      paddleFrozen: s.boosters.paddleFrozen,
      ballCount: s.balls.countActive(true),
      burningActive: s.boosters.burningActive,
      ballSpeedMultiplier: s.boosters.speedMultiplier,
      ballsBig: s.boosters.ballsBig,
      bricksLeft: s.bricks.countActive(true),
    };
  });
}

export async function clickActionButton(page: Page): Promise<void> {
  const { x, y } = await page.evaluate(() => {
    const s = window.__game.scene.getScene("prototype");
    return { x: s.hud.actionText.x as number, y: s.hud.actionText.y as number };
  });
  await clickCanvasAt(page, x, y);
}

/** Destroys every brick in the current level via the real collision
 * callback (star-brick/hazard/win-check logic all still runs), skipping the
 * need to physically land dozens of real ball bounces. Repeats passes over
 * whatever's still active rather than hitting each brick exactly once,
 * since a tough brick (top row — see TOUGH_BRICK_ROWS) survives a single
 * hit and needs to be hit again on a later pass before it's actually gone. */
export async function winCurrentLevel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = window.__game.scene.getScene("prototype");
    for (let pass = 0; pass < 5 && s.bricks.countActive(true) > 0; pass++) {
      for (const brick of s.bricks.getChildren().slice()) s.handleBrickHit(s.primaryBall, brick);
    }
  });
}

/** Wins levels and advances via the real "Next Level"/"Play Again" flow
 * until the scene reports the target level index. */
export async function advanceToLevel(page: Page, targetLevelIndex: number): Promise<void> {
  let snapshot = await getPrototypeScene(page);
  while (snapshot.levelIndex < targetLevelIndex) {
    await winCurrentLevel(page);
    await page.waitForTimeout(150);
    await clickActionButton(page);
    await page.waitForTimeout(150);
    snapshot = await getPrototypeScene(page);
  }
}

/** Destroys the star brick for `type` and, if a power-up fell, catches it —
 * mirroring what a player does, just without needing to physically time a
 * paddle intercept for every scenario. */
export async function catchStarPowerUp(page: Page, type: string): Promise<boolean> {
  return page.evaluate((t) => {
    const s = window.__game.scene.getScene("prototype");
    const star = s.bricks.getChildren().find((b: any) => b.getData("starPowerUp") === t);
    if (!star) return false;
    s.handleBrickHit(s.primaryBall, star);
    const powerUp = s.powerUps.getChildren().find((p: any) => p.getData("type") === t);
    if (!powerUp) return false;
    s.handlePowerUpCatch(s.paddle, powerUp);
    return true;
  }, type);
}

/** Spawns `type`'s power-up right above the paddle and waits for Phaser's
 * real paddle-vs-powerUps overlap to resolve the catch — unlike
 * catchStarPowerUp, this never calls handlePowerUpCatch directly, so it
 * also exercises the actual overlap dispatch (see the paddle/ball
 * argument-order gotcha in coding-hygiene.md — the reason to prefer this
 * over a direct call whenever a test can afford the extra ~200ms). */
export async function dropAndCatchPowerUp(page: Page, type: string): Promise<void> {
  await page.evaluate((t) => {
    const s = window.__game.scene.getScene("prototype");
    s.spawnPowerUp(s.paddle.x, s.paddle.y - 10, t);
  }, type);
  await page.waitForTimeout(200);
}

/** Destroys the hazard brick for `type`, triggering its effect immediately
 * (hazards have no catch step — see design brief §3). */
export async function triggerHazardBrick(page: Page, type: string): Promise<boolean> {
  return page.evaluate((t) => {
    const s = window.__game.scene.getScene("prototype");
    const brick = s.bricks.getChildren().find((b: any) => b.getData("hazard") === t);
    if (!brick) return false;
    s.handleBrickHit(s.primaryBall, brick);
    return true;
  }, type);
}
