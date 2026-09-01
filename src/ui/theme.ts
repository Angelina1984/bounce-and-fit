// Type-only: every Phaser reference below is a type annotation, and the
// color helpers are pure math — a real `import Phaser from "phaser"` reads
// `window` at module-load time and would crash under plain Vitest. Keeping
// it type-only is what lets theme.test.ts run without a DOM environment
// (same reasoning as BoosterController.ts).
import type Phaser from "phaser";
import {
  COLOR_BUTTON_GREEN,
  COLOR_GOLD,
  COLOR_GOLD_DARK,
  COLOR_GOLD_LIGHT,
  COLOR_PANEL_VIOLET,
  FONT_FAMILY,
  TEXT_COLOR_OUTLINE,
  TEXT_COLOR_WHITE,
} from "../constants";

/**
 * Candy-UI building blocks: chunky 3D buttons and rounded HUD panels, drawn
 * with Phaser Graphics primitives (no bitmap assets).
 *
 * Phaser's Graphics has no gradient fill, so every gradient here is faked
 * from stacked flat shapes (see fillVerticalGradient). Every tone is derived
 * from one base color via shadeColor()/desaturateColor()/lerpColor() rather
 * than hand-picked, so restyling means changing a single palette constant.
 *
 * Two things carry the "molded plastic" read, and the first pass had
 * neither: a real vertical gradient across every face, and a rim that is a
 * *filled frame* on the shape's own edge rather than a stroked line inset
 * inside it. Flat fill + inset hairline is what made the chrome look cheap
 * next to the casual-puzzle reference art.
 */

/** How far the vibrant face sits above its darker base platform, in px. */
export const BUTTON_DEPTH = 7;
/**
 * Thickness of the dark seam ringing a button, in px. Kept thinner than the
 * depth on purpose — a heavier seam visually merges with the base platform
 * and the button flattens back out.
 */
export const OUTLINE_THICKNESS = 2;

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

/** Mixes two colors channel-wise. Every gradient band is one of these. */
export function lerpColor(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  return pack(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
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

/** A vertical gradient, as the color at a surface's top and bottom edges. */
interface Surface {
  top: number;
  bottom: number;
}

/**
 * Derives a surface from one base color: lifted at the top, darkened and
 * slightly desaturated at the bottom. The desaturation matters — a purely
 * darkened tone still reads as "the same candy color" and the face goes
 * flat again.
 */
const surfaceOf = (base: number, lift = 0.3, drop = 0.24): Surface => ({
  top: shadeColor(base, lift),
  bottom: desaturateColor(shadeColor(base, -drop), 0.06),
});

/**
 * The gold frame every panel and button face is set into. Kept saturated at
 * both ends: blackening the dark end turns the rim brown, and a brown rim
 * reads as dirt rather than as the shadowed side of gold.
 */
const GOLD_RIM: Surface = { top: 0xffd24a, bottom: 0xe8951a };
/** That frame in shadow — the base a lifted button face sits on. */
const GOLD_RIM_SHADED: Surface = {
  top: shadeColor(COLOR_GOLD_DARK, -0.22),
  bottom: shadeColor(COLOR_GOLD_DARK, -0.42),
};
// A gentler lift than a button's: a badge is a surface to read off, and the
// stronger gradient that makes a button look pressable makes a readout look
// like it wants to be pressed.
const PANEL_SURFACE = surfaceOf(COLOR_PANEL_VIOLET, 0.24, 0.26);
/** The dark ring drawn just outside a button's rim. */
const SEAM_TONE = desaturateColor(shadeColor(COLOR_PANEL_VIOLET, -0.85), 0.3);

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Bold white text with a dark outline + drop shadow, legible over any of this palette's fills. */
export const outlinedTextStyle = (
  fontSize: string,
  strokeThickness: number,
  color: string = TEXT_COLOR_WHITE,
): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize,
  color,
  fontStyle: "bold",
  stroke: TEXT_COLOR_OUTLINE,
  strokeThickness,
  shadow: { offsetX: 0, offsetY: 2, color: "rgba(0, 0, 0, 0.35)", blur: 3, fill: true },
});

// ---------------------------------------------------------------------------
// Shared painting pieces
// ---------------------------------------------------------------------------

// How many bands a faked gradient is stacked from. Phaser's Graphics has no
// gradient fill, so a gradient here is always N flat shapes; 16 is where the
// banding stops being visible at these sizes.
// Strip height for a faked gradient, in px. Phaser's Graphics has no
// gradient fill, so a gradient here is always N flat shapes; 2px is below
// the eye's banding threshold at these sizes and costs ~50 fills on the
// largest panel, redrawn only when the panel's contents change.
const GRADIENT_STRIP = 2;
/** Bands the top-of-face highlight fades out over — see paintTopGloss. */
const GLOSS_BANDS = 7;

/**
 * Fills a rounded rect with a vertical gradient.
 *
 * Drawn as horizontal strips whose left and right edges are inset to follow
 * the corner curves, rather than as stacked rounded rects. Stacked rounded
 * rects are the obvious approach and they do not work: a band shorter than
 * the corner radius cannot be expressed as a rounded rect that stays inside
 * the silhouette, so the light bands at the top of a face came out
 * square-cornered and overhung the shape — and on a pill, where the radius
 * is half the height, *every* band is shorter than the radius.
 *
 * The exact silhouette is filled once underneath in a mid tone, and the
 * strips sit 1px inside it, so the shape keeps its antialiased edge instead
 * of showing the strips' stair-stepping at the corners.
 */
function fillVerticalGradient(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  surface: Surface,
): void {
  if (w <= 0 || h <= 0) return;

  const r = Math.min(radius, w / 2, h / 2);
  gfx.fillStyle(lerpColor(surface.top, surface.bottom, 0.5), 1);
  gfx.fillRoundedRect(x, y, w, h, radius);

  // How far the silhouette has pulled in, `dist` px from the nearer end.
  const capInset = (dist: number): number =>
    dist >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - dist) * (r - dist)));

  for (let top = 0; top < h; top += GRADIENT_STRIP) {
    const strip = Math.min(GRADIENT_STRIP, h - top);
    // Inset by whichever of the strip's two edges sits at the narrower point
    // of the curve, so no part of it overhangs.
    const inset = Math.max(capInset(top), capInset(h - (top + strip))) + 1;
    const width = w - inset * 2;
    if (width <= 0) continue;

    gfx.fillStyle(lerpColor(surface.top, surface.bottom, (top + strip / 2) / h), 1);
    gfx.fillRect(x + inset, y + top, width, strip);
  }
}

/**
 * The soft highlight across the upper part of a face — inset from the edges,
 * with a rounded underside: the shape a light source makes on curved
 * plastic.
 *
 * Deliberately *not* the specular dot this used to also draw. On a narrow
 * pill that dot sat in the corner curve and read as a catch of light, but on
 * a button as wide as "Next Level" it landed out in the open field and read
 * as a stray white speck. A highlight positioned to work at one aspect ratio
 * is a bug waiting for the next label.
 */
function paintTopGloss(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const inset = Math.max(2, Math.min(5, h * 0.14));
  const bw = w - inset * 2;
  const bh = h * 0.34 - inset;
  if (bw <= 0 || bh <= 0) return;

  // Stacked shorter and shorter, at a low alpha that accumulates toward the
  // top. One flat band at the full alpha instead leaves a hard line straight
  // across the middle of the face, which reads as two slabs stacked rather
  // than as one lit surface.
  const tl = Math.max(0, radius - inset);
  for (let i = 0; i < GLOSS_BANDS; i++) {
    const bandHeight = bh * (1 - (i * 0.7) / GLOSS_BANDS);
    const under = Math.min(bandHeight / 2, bw / 2);
    gfx.fillStyle(0xffffff, 0.028);
    gfx.fillRoundedRect(x + inset, y + inset, bw, bandHeight, { tl, tr: tl, bl: under, br: under });
  }
}

/**
 * Rim thickness for a shape of this height. Scaled rather than fixed: one
 * constant that looks right on a booster badge is a hairline on the win
 * panel, and one that suits the panel swallows the badge.
 */
function rimFor(height: number): number {
  return Math.max(2.5, Math.min(5, height * 0.11));
}

/** A fake soft shadow — three offset copies at low alpha, since Graphics has
 * no blur. Buttons only: they are what should look lifted off the ground. */
function paintDropShadow(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  for (const { dy, alpha } of [
    { dy: 2, alpha: 0.1 },
    { dy: 5, alpha: 0.09 },
    { dy: 8, alpha: 0.07 },
  ]) {
    const spread = dy * 0.25;
    gfx.fillStyle(0x000000, alpha);
    gfx.fillRoundedRect(x - spread, y + dy, w + spread * 2, h, radius + spread);
  }
}

/**
 * The shared material: a gold frame with a gradient face set into it.
 *
 * The rim is a *filled* frame — a full-footprint rounded rect with the face
 * inset on top of it — never a stroked line. A stroke centers on the path,
 * so half its width falls outside the shape and it reads as a hairline; and
 * the version this replaced stroked 3px *inside* the fill, leaving a band of
 * face color outside the gold, which is what made every edge look
 * misprinted.
 *
 * `seam` draws a dark ring just outside the rim. Buttons take it — they have
 * to pop off whatever is behind them. HUD badges deliberately do not: a dark
 * ring around a badge on a quiet background reads as grime, which is why it
 * came off them in the first place.
 */
function paintCandyFrame(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  face: Surface,
  rim: Surface,
  options: { seam?: boolean; gloss?: boolean } = {},
): void {
  if (options.seam) {
    const t = OUTLINE_THICKNESS;
    gfx.fillStyle(SEAM_TONE, 0.32);
    gfx.fillRoundedRect(x - t, y - t, w + t * 2, h + t * 2, radius + t);
  }

  fillVerticalGradient(gfx, x, y, w, h, radius, rim);

  const rimWidth = rimFor(h);
  const fw = w - rimWidth * 2;
  const fh = h - rimWidth * 2;
  if (fw <= 0 || fh <= 0) return;

  const fr = Math.max(1, radius - rimWidth);
  fillVerticalGradient(gfx, x + rimWidth, y + rimWidth, fw, fh, fr, face);
  if (options.gloss !== false) paintTopGloss(gfx, x + rimWidth, y + rimWidth, fw, fh, fr);
}

// ---------------------------------------------------------------------------
// Public paint functions
// ---------------------------------------------------------------------------

/**
 * Which color a button's face is. Gold is the *chrome* accent — rims, HUD
 * readouts — so a gold button is the same material as the frame around it
 * and stops reading as the thing to press. Green is the primary action.
 */
export type ButtonVariant = "primary" | "gold";

const BUTTON_BASE: Record<ButtonVariant, number> = {
  primary: COLOR_BUTTON_GREEN,
  gold: COLOR_GOLD,
};

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
  variant: ButtonVariant = "primary",
): void {
  const faceHeight = height - BUTTON_DEPTH;
  const radius = faceHeight * 0.34;
  const base = BUTTON_BASE[variant];

  gfx.clear();
  paintDropShadow(gfx, x, y + BUTTON_DEPTH, width, faceHeight, radius);

  // The base the face is lifted off — the same frame in shadow, offset down.
  // Only its bottom lip ever shows, and that lip is the entire 3D read, so
  // it gets no gloss of its own: a highlight on a surface in shadow is what
  // makes a fake bevel look fake.
  paintCandyFrame(
    gfx,
    x,
    y + BUTTON_DEPTH,
    width,
    faceHeight,
    radius,
    surfaceOf(shadeColor(base, -0.5), 0.1, 0.2),
    GOLD_RIM_SHADED,
    { seam: true, gloss: false },
  );

  // Hover lifts the face and brightens the rim together. Lightening only one
  // of the two reads as the button changing material, not lighting up.
  paintCandyFrame(
    gfx,
    x,
    y,
    width,
    faceHeight,
    radius,
    surfaceOf(hover ? shadeColor(base, 0.16) : base),
    hover ? { top: shadeColor(COLOR_GOLD_LIGHT, 0.35), bottom: COLOR_GOLD } : GOLD_RIM,
    { seam: true },
  );
}

/**
 * Draws a HUD panel/badge into `gfx`. Deliberately a flatter treatment than
 * the button above — no lifted face, no drop shadow, since a readout that
 * looks pressable invites taps that do nothing. It keeps the family
 * resemblance through the same gold rim, gradient face and top gloss.
 */
export function paintPillBackground(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number = height / 2,
): void {
  gfx.clear();
  addPill(gfx, x, y, width, height, cornerRadius);
}

/**
 * Draws a pill *without* clearing first, so several can share one Graphics.
 * `paintPillBackground` is the single-pill convenience on top of this — the
 * clear-then-draw version silently erases its predecessors when reused in a
 * loop, which is exactly the bug the booster badge row hit.
 */
export function addPill(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number = height / 2,
): void {
  paintCandyFrame(gfx, x, y, width, height, cornerRadius, PANEL_SURFACE, GOLD_RIM);
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
  private readonly variant: ButtonVariant;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: { fontSize?: string; paddingX?: number; paddingY?: number; variant?: ButtonVariant } = {},
  ) {
    const paddingX = options.paddingX ?? 38;
    const paddingY = options.paddingY ?? 17;
    this.variant = options.variant ?? "primary";

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
    paintGlossyButtonBackground(
      this.bg,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height,
      hover,
      this.variant,
    );
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

/**
 * The playfield frame: a rounded border drawn exactly on the physics world
 * bounds, with a faint inner wash so the arena reads as a surface rather
 * than as absence. Drawn behind the bricks.
 *
 * Keeping this aligned to the real bounds is the point — a frame that only
 * looks like a wall, while the ball bounces somewhere else, is worse than
 * no frame at all.
 */
export function paintArena(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const radius = 18;
  gfx.clear();

  // Inner surface, a touch lighter than the backdrop behind it. Square at
  // the bottom because there is no bottom edge — see below.
  gfx.fillStyle(0xffffff, 0.035);
  gfx.fillRoundedRect(x, y, width, height, { tl: radius, tr: radius, bl: 0, br: 0 });

  // Left, top and right rails only — deliberately NOT a closed rectangle.
  // The bottom is where the ball is lost, so drawing a rail across it would
  // promise a floor that the physics bounds don't have (bottom collision is
  // off). An open-bottomed arena reads as "this edge is the danger."
  const railPath = (g: Phaser.GameObjects.Graphics) => {
    g.beginPath();
    g.moveTo(x, y + height);
    g.lineTo(x, y + radius);
    g.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
    g.lineTo(x + width - radius, y);
    g.arc(x + width - radius, y + radius, radius, Math.PI * 1.5, Math.PI * 2);
    g.lineTo(x + width, y + height);
    g.strokePath();
  };

  gfx.lineStyle(6, shadeColor(COLOR_PANEL_VIOLET, -0.55), 0.95);
  railPath(gfx);
  gfx.lineStyle(2.5, COLOR_GOLD_DARK, 0.85);
  railPath(gfx);
}
