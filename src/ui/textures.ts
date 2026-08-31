// Type-only, same reasoning as theme.ts — nothing here touches the Phaser
// namespace at runtime, only the Scene instance passed in.
import type Phaser from "phaser";
import {
  BALL_RADIUS,
  BRICK_HEIGHT,
  BRICK_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  POWER_UP_SIZE,
  TEXTURE_KEY_BALL,
  TEXTURE_KEY_CHIP,
  TEXTURE_KEY_BACKDROP,
  TEXTURE_KEY_PADDLE,
  TEXTURE_KEY_TILE,
} from "../constants";

/**
 * Generates the rounded, beveled sprite textures for bricks, the paddle,
 * balls, and power-up drops — the gameplay half of the Candy UI pass.
 *
 * Everything is drawn in **grayscale**, because every caller colors these
 * with `setTint()`, which multiplies. Baking the bevel as light-to-dark
 * grays means one texture tinted gold, red, or violet keeps its highlight
 * and shadow in the right places, so a single generated tile serves the
 * whole brick palette instead of needing one texture per color.
 *
 * Layer order deliberately mirrors theme.ts's button sandwich (outline →
 * platform → face → gloss) so a brick and a button read as the same
 * material at different scales.
 */

/** Grays the sandwich layers are baked at, before tinting. */
const OUTLINE_GRAY = 0x37373d;
const PLATFORM_GRAY = 0x9a9aa2;
const FACE_GRAY = 0xf2f2f5;

/** Textures are generated at this multiple of their logical size, then scaled
 * down at draw time — a rounded corner rasterized at 1x on a 24px-tall brick
 * is visibly jagged. */
const SUPERSAMPLE = 3;

function withGraphics(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/**
 * A rounded, beveled tile — bricks and (as a full pill) the paddle. `depth`
 * is how much darker platform shows below the face; 0 makes it flat.
 */
function drawTile(g: Phaser.GameObjects.Graphics, w: number, h: number, radius: number, depth: number): void {
  const outline = 1.5 * SUPERSAMPLE;
  const faceH = h - depth - outline * 2;

  g.fillStyle(OUTLINE_GRAY, 1);
  g.fillRoundedRect(0, 0, w, h, radius);

  if (depth > 0) {
    g.fillStyle(PLATFORM_GRAY, 1);
    g.fillRoundedRect(outline, outline + depth, w - outline * 2, faceH, Math.max(1, radius - outline));
  }

  g.fillStyle(FACE_GRAY, 1);
  g.fillRoundedRect(outline, outline, w - outline * 2, faceH, Math.max(1, radius - outline));

  // Gloss across the top of the face.
  const glossInset = outline + 2 * SUPERSAMPLE;
  const glossH = faceH * 0.38;
  if (w - glossInset * 2 > 0 && glossH > 0) {
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(glossInset, glossInset * 0.8, w - glossInset * 2, glossH, glossH / 2);
  }
}

/** A round candy — balls and power-up drops. */
function drawOrb(g: Phaser.GameObjects.Graphics, size: number): void {
  const r = size / 2;
  g.fillStyle(OUTLINE_GRAY, 1);
  g.fillCircle(r, r, r);
  g.fillStyle(PLATFORM_GRAY, 1);
  g.fillCircle(r, r, r - 2 * SUPERSAMPLE);
  g.fillStyle(FACE_GRAY, 1);
  g.fillCircle(r, r * 0.94, r - 3 * SUPERSAMPLE);
  // Specular highlight, upper-left — the same cue the buttons use.
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(r * 0.68, r * 0.62, Math.max(1, r * 0.2));
}

/**
 * Idempotent: textures live on the global TextureManager, which survives
 * `scene.restart()`, so this re-runs harmlessly on every level start.
 */
/**
 * A vertical gradient plus a soft vignette, as one texture.
 *
 * This is the one place a real gradient is possible: `textures.createCanvas`
 * hands back a 2D context, so `createLinearGradient` works — unlike Graphics,
 * which has no gradient fill and forces the stacked-translucent-shapes trick
 * used everywhere else in this file. Drawn narrow and stretched horizontally,
 * since a vertical gradient has no horizontal detail to lose.
 */
function ensureBackdrop(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE_KEY_BACKDROP)) return;
  const w = 64;
  const h = 256;
  const canvasTexture = scene.textures.createCanvas(TEXTURE_KEY_BACKDROP, w, h);
  if (!canvasTexture) return;
  const ctx = canvasTexture.getContext();

  const linear = ctx.createLinearGradient(0, 0, 0, h);
  linear.addColorStop(0, "#3d2075");
  linear.addColorStop(0.55, "#2a1454");
  linear.addColorStop(1, "#1c0d3a");
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, w, h);

  // Vignette: darken the corners so the play area reads as a lit stage
  // rather than a flat fill running off the edges. Kept deliberately weak —
  // on a desktop window the canvas is letterboxed against the page
  // background, and a strong vignette turns that boundary into a visible
  // rectangle ("you can see the walls"). index.html paints the same
  // gradient behind the page so the two blend at the seam.
  const radial = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75);
  radial.addColorStop(0, "rgba(0,0,0,0)");
  radial.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, w, h);

  canvasTexture.refresh();
}

/** Adds the backdrop image behind everything else in `scene`. */
export function addBackdrop(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  scene.add
    .image(0, 0, TEXTURE_KEY_BACKDROP)
    .setOrigin(0, 0)
    .setDisplaySize(width, height)
    .setDepth(-100)
    .setTint(0xffffff);
}

export function ensureCandyTextures(scene: Phaser.Scene): void {
  ensureBackdrop(scene);

  const tileW = BRICK_WIDTH * SUPERSAMPLE;
  const tileH = BRICK_HEIGHT * SUPERSAMPLE;
  withGraphics(scene, TEXTURE_KEY_TILE, tileW, tileH, (g) =>
    drawTile(g, tileW, tileH, 7 * SUPERSAMPLE, 3 * SUPERSAMPLE),
  );

  const padW = PADDLE_WIDTH * SUPERSAMPLE;
  const padH = PADDLE_HEIGHT * SUPERSAMPLE;
  withGraphics(scene, TEXTURE_KEY_PADDLE, padW, padH, (g) => drawTile(g, padW, padH, padH / 2, 0));

  const ballSize = BALL_RADIUS * 2 * SUPERSAMPLE;
  withGraphics(scene, TEXTURE_KEY_BALL, ballSize, ballSize, (g) => drawOrb(g, ballSize));

  const chipSize = POWER_UP_SIZE * SUPERSAMPLE;
  withGraphics(scene, TEXTURE_KEY_CHIP, chipSize, chipSize, (g) => drawOrb(g, chipSize));
}
