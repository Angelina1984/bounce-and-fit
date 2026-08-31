// Type-only: every Phaser reference below is a type annotation, and the
// color helpers are pure math — a real `import Phaser from "phaser"` reads
// `window` at module-load time and would crash under plain Vitest. Keeping
// it type-only is what lets theme.test.ts run without a DOM environment
// (same reasoning as BoosterController.ts).
import type Phaser from "phaser";
import { COLOR_GOLD, COLOR_GOLD_LIGHT, COLOR_PANEL_VIOLET, TEXT_COLOR_OUTLINE, TEXT_COLOR_WHITE } from "../constants";

/**
 * Candy-UI building blocks: chunky 3D buttons and rounded HUD panels, drawn
 * with Phaser Graphics primitives (no bitmap assets).
 *
 * The look comes from stacking flat shapes rather than from gradients —
 * Phaser's Graphics has no gradient fill, so a "gradient" here is always
 * several translucent shapes layered on top of each other. Every tone is
 * derived from one base color via shadeColor()/desaturateColor() rather
 * than hand-picked, so restyling means changing a single palette constant.
 */

/** How far the vibrant face sits above its darker base platform, in px. */
export const BUTTON_DEPTH = 10;
/**
 * Thickness of the dark outline ringing a button or panel, in px. Kept
 * thinner than the depth on purpose — a heavier outline visually merges
 * with the base platform and the button flattens back out.
 */
export const OUTLINE_THICKNESS = 3;

// ---------------------------------------------------------------------------
// Pure color math (no Phaser) — unit-tested in theme.test.ts
// ---------------------------------------------------------------------------

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const channels = (color: number): [number, number, number] => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];

const pack = (r: number, g: number, b: number): number =>
  (clampChannel(r) << 16) | (clampChannel(g) << 8) | clampChannel(b);

/**
 * Mixes `color` toward white (positive `amount`) or black (negative), where
 * ±1 lands fully on the target. Used to derive every lighter/darker tone in
 * a button's sandwich from its single base color.
 */
export function shadeColor(color: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const [r, g, b] = channels(color);
  return pack(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

/**
 * Pulls `color` toward its own perceived luminance, draining saturation
 * without changing how bright it reads. The base platform under a button
 * uses this on top of a darken — a purely darkened tone still reads as
 * "the same candy color", which flattens the 3D effect.
 */
export function desaturateColor(color: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const [r, g, b] = channels(color);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return pack(r + (luminance - r) * t, g + (luminance - g) * t, b + (luminance - b) * t);
}

/** The four derived tones every sandwiched shape is drawn from. */
interface CandyTones {
  face: number;
  platform: number;
  innerBorder: number;
  outline: number;
}

function tonesFor(base: number): CandyTones {
  return {
    face: base,
    // Darkened and slightly desaturated — enough to read as shadow, but not
    // so far that it merges with the outline and the depth disappears.
    platform: desaturateColor(shadeColor(base, -0.4), 0.25),
    innerBorder: shadeColor(base, 0.55),
    outline: desaturateColor(shadeColor(base, -0.82), 0.3),
  };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Bold white text with a dark outline + drop shadow, legible over any of this palette's fills. */
export const outlinedTextStyle = (
  fontSize: string,
  strokeThickness: number,
  color: string = TEXT_COLOR_WHITE,
): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize,
  color,
  fontStyle: "bold",
  stroke: TEXT_COLOR_OUTLINE,
  strokeThickness,
  shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 2, fill: true },
});

// ---------------------------------------------------------------------------
// Shared painting pieces
// ---------------------------------------------------------------------------

/**
 * Fills the dark outline as one enlarged shape *behind* everything else,
 * rather than stroking each layer. Stroking leaves a visible seam where the
 * platform and face silhouettes overlap; an oversized fill behind them
 * traces their union cleanly.
 */
function paintOutline(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  tone: number,
): void {
  const s = OUTLINE_THICKNESS;
  gfx.fillStyle(tone, 1);
  gfx.fillRoundedRect(x - s, y - s, w + s * 2, h + s * 2, r + s);
}

/**
 * Fakes a vertical gloss gradient with stacked translucent capsules — each
 * band is shorter than the one below it, so the alphas accumulate toward
 * the top and fall off smoothly. Plus a crisp specular dot in the
 * upper-left, which is what actually sells the "glassy" read.
 */
function paintGloss(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const inset = 5;
  const glossHeight = h * 0.4;
  // Alphas stay low because the bands overlap — they sum toward the top,
  // and anything higher bleaches the candy color out to near-white.
  const bands = [
    { inset, height: glossHeight, alpha: 0.16 },
    { inset: inset * 2.2, height: glossHeight * 0.55, alpha: 0.12 },
  ];

  for (const band of bands) {
    if (w - band.inset * 2 <= 0 || band.height <= 0) continue;
    gfx.fillStyle(0xffffff, band.alpha);
    gfx.fillRoundedRect(x + band.inset, y + inset * 0.8, w - band.inset * 2, band.height, band.height / 2);
  }

  // Specular reflection: a small dot tucked into the upper-left curve. Sits
  // near the corner rather than out in the open field, where it reads as a
  // stray speck instead of a light catching the edge.
  const r = Math.max(2, h * 0.055);
  gfx.fillStyle(0xffffff, 0.85);
  gfx.fillCircle(x + h * 0.34, y + h * 0.26, r);
}

// ---------------------------------------------------------------------------
// Public paint functions
// ---------------------------------------------------------------------------

/**
 * Draws a chunky 3D candy button into `gfx`. The given rect is the button's
 * **total footprint including its depth** — the vibrant face is computed
 * inside and sits BUTTON_DEPTH px above the base platform, so callers can
 * lay out against the real visual bounds without knowing the layer offsets.
 */
export function paintGlossyButtonBackground(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  hover = false,
): void {
  const faceHeight = height - BUTTON_DEPTH;
  const radius = faceHeight / 2;
  const tones = tonesFor(hover ? COLOR_GOLD_LIGHT : COLOR_GOLD);

  gfx.clear();
  paintOutline(gfx, x, y, width, height, radius, tones.outline);

  // Layer 1 — the darker platform the face rests on, offset down.
  gfx.fillStyle(tones.platform, 1);
  gfx.fillRoundedRect(x, y + BUTTON_DEPTH, width, faceHeight, radius);

  // Layer 2 — the vibrant face, lifted clear of the platform.
  gfx.fillStyle(tones.face, 1);
  gfx.fillRoundedRect(x, y, width, faceHeight, radius);

  // Layer 3 — thin bright border just inside the face edge.
  gfx.lineStyle(2, tones.innerBorder, 1);
  gfx.strokeRoundedRect(x + 3, y + 3, width - 6, faceHeight - 6, Math.max(0, radius - 3));

  paintGloss(gfx, x, y, width, faceHeight);
}

/**
 * Draws a HUD panel/badge into `gfx`. Deliberately a flatter treatment than
 * the button above — no lifted face, since a readout that looks pressable
 * invites taps that do nothing. It keeps the family resemblance through the
 * same outline, inner border, and top gloss.
 */
export function paintPillBackground(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number = height / 2,
): void {
  const tones = tonesFor(COLOR_PANEL_VIOLET);

  gfx.clear();
  paintOutline(gfx, x, y, width, height, cornerRadius, tones.outline);

  gfx.fillStyle(tones.face, 0.96);
  gfx.fillRoundedRect(x, y, width, height, cornerRadius);

  gfx.lineStyle(2, shadeColor(COLOR_GOLD, -0.1), 0.75);
  gfx.strokeRoundedRect(x + 3, y + 3, width - 6, height - 6, Math.max(0, cornerRadius - 3));

  gfx.fillStyle(0xffffff, 0.07);
  gfx.fillRoundedRect(x + 4, y + 4, width - 8, height * 0.38, Math.min(cornerRadius, (height * 0.38) / 2));
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

type TweenTarget = Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[];

/**
 * Squash-and-stretch on hover/press: a touch wider and shorter, as if the
 * button has weight. Expo.easeOut on both directions so it snaps to the new
 * shape immediately and settles, rather than easing in symmetrically.
 *
 * Pass the whole visual group (background + label) so they deform together —
 * scaling only one of the two would slide the label off its face.
 */
export function squashButton(scene: Phaser.Scene, target: TweenTarget): void {
  scene.tweens.add({ targets: target, scaleX: 1.05, scaleY: 0.95, duration: 140, ease: "Expo.easeOut" });
}

/** Pops the button back to rest. Slightly slower than the squash, so the release reads as a rebound. */
export function popButton(scene: Phaser.Scene, target: TweenTarget): void {
  scene.tweens.add({ targets: target, scaleX: 1, scaleY: 1, duration: 260, ease: "Expo.easeOut" });
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** A rounded, gold-bordered badge that auto-sizes to its text — lives, level, and booster-status readouts. */
export class PillBadge {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly padX = 14;
  private readonly padY = 6;
  private readonly originX: number;
  private readonly height: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: { fontSize?: string; originX?: number } = {},
  ) {
    this.originX = options.originX ?? 0;
    this.label = scene.add.text(0, 0, text, outlinedTextStyle(options.fontSize ?? "16px", 3)).setOrigin(0, 0.5);
    this.height = this.label.height + this.padY * 2;
    this.bg = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.bg, this.label]);
    this.redraw(text);
  }

  private redraw(text: string): void {
    this.label.setText(text);
    const width = this.label.width + this.padX * 2;
    const left = -this.originX * width;
    this.label.setPosition(left + this.padX, -this.label.height / 2);
    paintPillBackground(this.bg, left, -this.height / 2, width, this.height);
  }

  setText(text: string): void {
    this.redraw(text);
  }

  setVisible(visible: boolean): this {
    this.container.setVisible(visible);
    return this;
  }
}

/** A chunky 3D candy button — the Play button and Hud's win/lose action. */
export class GlossyButton {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly width: number;
  private readonly height: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: { fontSize?: string; paddingX?: number; paddingY?: number } = {},
  ) {
    const paddingX = options.paddingX ?? 30;
    const paddingY = options.paddingY ?? 14;

    this.label = scene.add.text(0, 0, text, outlinedTextStyle(options.fontSize ?? "24px", 4)).setOrigin(0.5);
    this.width = this.label.width + paddingX * 2;
    this.height = this.label.height + paddingY * 2 + BUTTON_DEPTH;
    // The label belongs on the face, which is BUTTON_DEPTH/2 above the
    // footprint's own center.
    this.label.setY(-BUTTON_DEPTH / 2);

    this.bg = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.bg, this.label]);
    this.container.setSize(this.width, this.height);
    this.container.setInteractive({ useHandCursor: true });

    this.paint(false);
    this.container.on("pointerover", () => {
      this.paint(true);
      squashButton(scene, this.container);
    });
    this.container.on("pointerout", () => {
      this.paint(false);
      popButton(scene, this.container);
    });
    this.container.on("pointerup", () => popButton(scene, this.container));
  }

  private paint(hover: boolean): void {
    paintGlossyButtonBackground(this.bg, -this.width / 2, -this.height / 2, this.width, this.height, hover);
  }

  onClick(handler: () => void): void {
    this.container.off("pointerdown");
    this.container.on("pointerdown", handler);
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setVisible(visible: boolean): this {
    this.container.setVisible(visible);
    return this;
  }
}
