import Phaser from "phaser";
import { BALL_TINT, MAX_LIVES, TEXT_COLOR_GOLD, TEXT_COLOR_WHITE, TEXTURE_KEY_BALL } from "../constants";
import type { ActiveBooster } from "../gameplay/BoosterController";

// Top status bar geometry — the band above the arena (see ARENA_TOP).
const HUD_EDGE = 16;
const HUD_PAD_X = 13;
const HUD_ROW_Y = 40;
const HUD_BOOSTER_Y = 78;
// Lives are drawn as a row of ball icons rather than a number — see setLives().
const LIFE_ICON_SIZE = 15;
const LIFE_ICON_GAP = 6;
// Booster countdown badges. Capped because they lay out in one centered
// row — more than four would overflow the 480-wide design width.
const MAX_BOOSTER_BADGES = 4;
const BADGE_PAD_X = 9;
const BADGE_GAP = 6;
const BADGE_DOT = 9;
import {
  addPill,
  BUTTON_DEPTH,
  outlinedTextStyle,
  paintGlossyButtonBackground,
  paintPillBackground,
  popButton,
  squashButton,
} from "../ui/theme";

/**
 * All of PrototypeScene's on-screen readouts in one place — a top status
 * bar (lives as ball icons on the left, score centered, level right, active
 * boosters beneath), plus the win/lose message and its action button. The bar spans the full width
 * rather than stacking in one corner: the band above the arena is dead
 * space otherwise, and a lone box with an empty half reads as unfinished.
 * Pulled out of the scene so create() isn't the one composing five
 * Phaser.GameObjects.Text calls inline.
 *
 * The public fields stay plain Phaser.GameObjects.Text (not theme.ts's
 * Container-based PillBadge/GlossyButton) so gameHooks.ts's E2E snapshots
 * can keep reading `.text`/`.visible`/`.x`/`.y` directly — the candy-UI
 * pill/gloss backgrounds are separate Graphics companions redrawn to match
 * each text's own bounds whenever it changes.
 */
export class Hud {
  /** One icon per possible life, left to right. Index i is visible while
   * the player has more than i lives, so losing one always removes the
   * rightmost — public so E2E can assert what's actually on screen. */
  readonly livesIcons: Phaser.GameObjects.Image[] = [];
  readonly scoreText: Phaser.GameObjects.Text;
  readonly levelText: Phaser.GameObjects.Text;
  readonly breakdownText: Phaser.GameObjects.Text;
  readonly messageText: Phaser.GameObjects.Text;
  readonly actionText: Phaser.GameObjects.Text;

  private readonly scene: Phaser.Scene;
  private lastLives = MAX_LIVES;
  private readonly livesPill: Phaser.GameObjects.Graphics;
  private readonly scorePill: Phaser.GameObjects.Graphics;
  private readonly levelPill: Phaser.GameObjects.Graphics;
  private readonly breakdownPill: Phaser.GameObjects.Graphics;
  /** One Graphics for every badge's pill + dot, redrawn as a set — cheaper
   * than a Graphics per badge, and they always change together. */
  private readonly boosterBadges: Phaser.GameObjects.Graphics;
  /** Public so E2E can read what the badges actually say. */
  readonly boosterLabels: Phaser.GameObjects.Text[] = [];
  /** What the badges currently show, so a per-frame update can bail out
   * when nothing visible has changed (see setBoosters). */
  private badgeSignature = "";
  private readonly actionButtonBg: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;

    // Each pill is drawn before its content so it renders behind it.
    this.livesPill = scene.add.graphics();
    // Lives as balls, not a number: it reads at a glance, needs no reading
    // at all for the youngest players (§7's all-ages positioning), and uses
    // the ball's own texture and tint so the icons are unmistakably "the
    // thing you're about to lose".
    for (let i = 0; i < MAX_LIVES; i++) {
      const icon = scene.add
        .image(
          HUD_EDGE + HUD_PAD_X + i * (LIFE_ICON_SIZE + LIFE_ICON_GAP) + LIFE_ICON_SIZE / 2,
          HUD_ROW_Y,
          TEXTURE_KEY_BALL,
        )
        .setDisplaySize(LIFE_ICON_SIZE, LIFE_ICON_SIZE)
        .setTint(BALL_TINT);
      this.livesIcons.push(icon);
    }
    this.redrawLivesPill();

    this.scorePill = scene.add.graphics();
    this.scoreText = scene.add
      .text(width / 2, HUD_ROW_Y, "", outlinedTextStyle("19px", 3, TEXT_COLOR_GOLD))
      .setOrigin(0.5, 0.5);

    this.levelPill = scene.add.graphics();
    this.levelText = scene.add
      .text(width - HUD_EDGE - HUD_PAD_X, HUD_ROW_Y, "", outlinedTextStyle("15px", 2))
      .setOrigin(1, 0.5);

    this.boosterBadges = scene.add.graphics();

    // Drawn before actionText so it renders behind it; hidden until setAction().
    this.actionButtonBg = scene.add.graphics().setVisible(false);

    this.messageText = scene.add
      .text(width / 2, height / 2 - 70, "", outlinedTextStyle("30px", 5, TEXT_COLOR_WHITE))
      .setOrigin(0.5)
      .setVisible(false);

    this.breakdownPill = scene.add.graphics().setVisible(false);
    this.breakdownText = scene.add
      .text(width / 2, height / 2 + 20, "", {
        ...outlinedTextStyle("15px", 3),
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setLineSpacing(4);

    // Label and click behavior are set per-outcome via setAction() — this is
    // "Tap to retry" after a loss, "Next Level" (or "Play Again" on the
    // last level) after a win.
    this.actionText = scene.add
      .text(width / 2, height / 2 + 120, "", outlinedTextStyle("20px", 4))
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    // Both objects are tweened together so the button doesn't slide out
    // from under its own label — they share a center, so scaling each about
    // its own origin deforms them as one.
    const group = [this.actionText, this.actionButtonBg];
    this.actionText.on("pointerover", () => {
      this.paintActionButton(true);
      squashButton(scene, group);
    });
    this.actionText.on("pointerout", () => {
      this.paintActionButton(false);
      popButton(scene, group);
    });
  }

  /** Redraws one pill sized to its label's real rendered bounds. Works for
   * left-, right-, and centre-anchored labels alike by deriving the text's
   * left edge from its own origin rather than assuming one. */
  private redrawPill(gfx: Phaser.GameObjects.Graphics, label: Phaser.GameObjects.Text, originX: number): void {
    if (label.text.length === 0) {
      gfx.clear();
      return;
    }
    const textLeft = label.x - originX * label.width;
    const h = label.height + 10;
    paintPillBackground(gfx, textLeft - HUD_PAD_X, label.y - h / 2, label.width + HUD_PAD_X * 2, h);
  }

  private paintActionButton(hover: boolean): void {
    if (!this.actionButtonBg.visible) return;
    const paddingX = 28;
    const paddingY = 12;
    const w = this.actionText.width + paddingX * 2;
    const h = this.actionText.height + paddingY * 2 + BUTTON_DEPTH;

    // The Graphics is positioned at the button's center and its shape drawn
    // in local coordinates, so scale tweens pivot on the center rather than
    // on the scene origin. Nudged down by half the depth so the lifted face
    // — not the whole footprint — centers on the label.
    this.actionButtonBg.setPosition(this.actionText.x, this.actionText.y + BUTTON_DEPTH / 2);
    paintGlossyButtonBackground(this.actionButtonBg, -w / 2, -h / 2, w, h, hover);
  }

  private redrawLivesPill(): void {
    const rowWidth = MAX_LIVES * LIFE_ICON_SIZE + (MAX_LIVES - 1) * LIFE_ICON_GAP;
    const h = LIFE_ICON_SIZE + 16;
    // Sized for the full row, not the surviving icons — a pill that shrank
    // as lives were lost would make the whole bar jitter, and the empty
    // slots are themselves the "how many you've lost" readout.
    paintPillBackground(this.livesPill, HUD_EDGE, HUD_ROW_Y - h / 2, rowWidth + HUD_PAD_X * 2, h);
  }

  /**
   * Shows one ball icon per remaining life. Icons vanish right-to-left
   * because index i is visible only while `lives > i`.
   *
   * A life being lost is animated (the icon pops and fades); the initial
   * fill is not, since there is nothing to notice on the first paint. That
   * distinction is why this tracks the previous count rather than just
   * assigning visibility.
   */
  setLives(lives: number): void {
    this.livesIcons.forEach((icon, i) => {
      const shouldShow = i < lives;
      if (icon.visible && !shouldShow && this.lastLives > lives) {
        this.scene.tweens.add({
          targets: icon,
          scale: icon.scale * 1.8,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => icon.setVisible(false),
        });
        return;
      }
      if (shouldShow && !icon.visible) {
        // Reset whatever a previous loss animation left behind before
        // showing it again (a fresh run refills the row).
        icon.setAlpha(1).setDisplaySize(LIFE_ICON_SIZE, LIFE_ICON_SIZE);
      }
      icon.setVisible(shouldShow);
    });
    this.lastLives = lives;
  }

  setScore(score: number): void {
    this.scoreText.setText(score.toLocaleString());
    this.redrawPill(this.scorePill, this.scoreText, 0.5);
  }

  /** Win/lose breakdown: rows of label + preformatted value, aligned into
   * columns by padding since Phaser Text has no tab stops. Values arrive as
   * strings so the caller controls signs ("+100") and emphasis — this only
   * lays them out. */
  showScoreBreakdown(rows: Array<[string, string]>): void {
    const labelWidth = Math.max(...rows.map(([label]) => label.length));
    const valueWidth = Math.max(...rows.map(([, value]) => value.length));
    const body = rows.map(([label, value]) => `${label.padEnd(labelWidth)}   ${value.padStart(valueWidth)}`).join("\n");
    this.breakdownText.setText(body).setVisible(true);

    const padX = 20;
    const w = this.breakdownText.width + padX * 2;
    const h = this.breakdownText.height + 20;
    paintPillBackground(this.breakdownPill, this.breakdownText.x - w / 2, this.breakdownText.y - h / 2, w, h, 16);
    this.breakdownPill.setVisible(true);
  }

  setLevel(levelIndex: number, levelName: string): void {
    this.levelText.setText(`Level ${levelIndex + 1}: ${levelName}`);
    this.redrawPill(this.levelPill, this.levelText, 1);
  }

  /**
   * Draws one countdown badge per active effect: a dot in the booster's own
   * color, its name, and whole seconds remaining.
   *
   * Called every frame, so it early-outs unless the visible content actually
   * changed — the signature includes the rounded seconds, which is the only
   * part that ticks. Without that guard this would re-rasterize every label's
   * texture 60 times a second to show the same string.
   */
  setBoosters(active: ActiveBooster[]): void {
    const shown = active.slice(0, MAX_BOOSTER_BADGES);
    const signature = shown.map((b) => `${b.type}:${Math.ceil(b.remainingMs / 1000)}`).join("|");
    if (signature === this.badgeSignature) return;
    this.badgeSignature = signature;

    while (this.boosterLabels.length < shown.length) {
      this.boosterLabels.push(
        this.scene.add.text(0, HUD_BOOSTER_Y, "", outlinedTextStyle("12px", 2, TEXT_COLOR_GOLD)).setOrigin(0, 0.5),
      );
    }
    this.boosterLabels.forEach((label, i) => label.setVisible(i < shown.length));

    this.boosterBadges.clear();
    if (shown.length === 0) return;

    // Measure first, then lay the row out centered — a badge's width comes
    // from its own rendered text, so the total isn't known until every
    // label has its final string.
    const widths = shown.map((b, i) => {
      const label = this.boosterLabels[i];
      label.setText(`${b.label} ${Math.ceil(b.remainingMs / 1000)}s`);
      return BADGE_DOT + 6 + label.width + BADGE_PAD_X * 2;
    });
    const total = widths.reduce((a, b) => a + b, 0) + BADGE_GAP * (shown.length - 1);
    let x = (this.scene.scale.width - total) / 2;

    shown.forEach((booster, i) => {
      const w = widths[i];
      const h = this.boosterLabels[i].height + 8;
      addPill(this.boosterBadges, x, HUD_BOOSTER_Y - h / 2, w, h);
      this.boosterBadges.fillStyle(booster.tint, 1);
      this.boosterBadges.fillCircle(x + BADGE_PAD_X + BADGE_DOT / 2, HUD_BOOSTER_Y, BADGE_DOT / 2);
      this.boosterLabels[i].setPosition(x + BADGE_PAD_X + BADGE_DOT + 6, HUD_BOOSTER_Y);
      x += w + BADGE_GAP;
    });
  }

  showMessage(text: string): void {
    this.messageText.setText(text).setVisible(true);
  }

  setAction(label: string, onClick: () => void): void {
    this.actionText.off("pointerdown");
    this.actionText.setText(label);
    this.actionText.on("pointerdown", onClick);
    this.actionText.setVisible(true);
    this.actionButtonBg.setVisible(true);
    this.paintActionButton(false);
  }
}
