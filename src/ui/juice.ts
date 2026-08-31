// Type-only, same reasoning as theme.ts/textures.ts — only the Scene
// instance passed in is touched at runtime.
import type Phaser from "phaser";
import { TEXTURE_KEY_CHIP } from "../constants";

/**
 * Short, self-contained feedback effects: the "juice" layer.
 *
 * Every function here is fire-and-forget — it spawns whatever it needs,
 * animates it, and cleans up after itself. None of them return handles or
 * hold state, and **none of them affect physics or game state**, so a
 * caller can drop one into a collision handler without changing what that
 * handler does. That separation is the point: if an effect ever needs to be
 * awaited or cancelled, it doesn't belong in this file.
 *
 * They're also all safe to call while another instance is still running —
 * relevant because a burning ball can destroy several bricks in one frame.
 */

/** A burst of small squares in the destroyed brick's own color. */
export function brickBurst(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const count = 7;
  for (let i = 0; i < count; i++) {
    const shard = scene.add.image(x, y, TEXTURE_KEY_CHIP).setDisplaySize(6, 6).setTint(tint).setDepth(5);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const distance = 18 + Math.random() * 26;

    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0,
      duration: 280 + Math.random() * 160,
      ease: "Quad.easeOut",
      onComplete: () => shard.destroy(),
    });
  }
}

/**
 * Squash on impact. Tweens displayWidth/displayHeight rather than scale,
 * because the paddle's width is owned by BoosterController (Wide/Narrow
 * Paddle) — a scale tween would fight it, and whichever wrote last would
 * win. Reading the current display size and returning to it keeps this
 * effect correct at any booster width.
 */
export function paddleSquash(scene: Phaser.Scene, paddle: Phaser.GameObjects.Image): void {
  const w = paddle.displayWidth;
  const h = paddle.displayHeight;

  scene.tweens.killTweensOf(paddle);
  scene.tweens.add({
    targets: paddle,
    displayWidth: w * 1.12,
    displayHeight: h * 0.7,
    duration: 70,
    ease: "Quad.easeOut",
    yoyo: true,
    onComplete: () => paddle.setDisplaySize(w, h),
  });
}

/** A quick expanding ring where a power-up was caught. */
export function catchPop(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const ring = scene.add.image(x, y, TEXTURE_KEY_CHIP).setDisplaySize(16, 16).setTint(tint).setDepth(5);

  scene.tweens.add({
    targets: ring,
    displayWidth: 54,
    displayHeight: 54,
    alpha: 0,
    duration: 300,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy(),
  });
}

/** Brief camera shake — reserved for losing a life, so it stays meaningful. */
export function lifeLostShake(scene: Phaser.Scene): void {
  scene.cameras.main.shake(220, 0.008);
}
