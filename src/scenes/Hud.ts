import Phaser from "phaser";
import { TEXT_COLOR_GOLD, TEXT_COLOR_WHITE } from "../constants";

// Top status bar geometry — the band above the arena (see ARENA_TOP).
const HUD_EDGE = 16;
const HUD_PAD_X = 13;
const HUD_ROW_Y = 40;
const HUD_BOOSTER_Y = 78;
import {
  BUTTON_DEPTH,
  outlinedTextStyle,
  paintGlossyButtonBackground,
  paintPillBackground,
  popButton,
  squashButton,
} from "../ui/theme";

/**
 * All of PrototypeScene's on-screen text in one place — a top status bar
 * (lives left, level right, active boosters centered beneath), plus the
 * win/lose message and its action button. The bar spans the full width
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
  readonly livesText: Phaser.GameObjects.Text;
  readonly levelText: Phaser.GameObjects.Text;
  readonly boosterText: Phaser.GameObjects.Text;
  readonly messageText: Phaser.GameObjects.Text;
  readonly actionText: Phaser.GameObjects.Text;

  private readonly livesPill: Phaser.GameObjects.Graphics;
  private readonly levelPill: Phaser.GameObjects.Graphics;
  private readonly boosterPill: Phaser.GameObjects.Graphics;
  private readonly actionButtonBg: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;

    // Each pill is drawn before its label so it renders behind it.
    this.livesPill = scene.add.graphics();
    this.livesText = scene.add
      .text(HUD_EDGE + HUD_PAD_X, HUD_ROW_Y, "", outlinedTextStyle("19px", 3))
      .setOrigin(0, 0.5);

    this.levelPill = scene.add.graphics();
    this.levelText = scene.add
      .text(width - HUD_EDGE - HUD_PAD_X, HUD_ROW_Y, "", outlinedTextStyle("15px", 2))
      .setOrigin(1, 0.5);

    this.boosterPill = scene.add.graphics();
    this.boosterText = scene.add
      .text(width / 2, HUD_BOOSTER_Y, "", outlinedTextStyle("13px", 2, TEXT_COLOR_GOLD))
      .setOrigin(0.5, 0.5);

    // Drawn before actionText so it renders behind it; hidden until setAction().
    this.actionButtonBg = scene.add.graphics().setVisible(false);

    this.messageText = scene.add
      .text(width / 2, height / 2 - 20, "", outlinedTextStyle("30px", 5, TEXT_COLOR_WHITE))
      .setOrigin(0.5)
      .setVisible(false);

    // Label and click behavior are set per-outcome via setAction() — this is
    // "Tap to retry" after a loss, "Next Level" (or "Play Again" on the
    // last level) after a win.
    this.actionText = scene.add
      .text(width / 2, height / 2 + 35, "", outlinedTextStyle("20px", 4))
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

  setLives(lives: number): void {
    this.livesText.setText(`Lives: ${lives}`);
    this.redrawPill(this.livesPill, this.livesText, 0);
  }

  setLevel(levelIndex: number, levelName: string): void {
    this.levelText.setText(`Level ${levelIndex + 1}: ${levelName}`);
    this.redrawPill(this.levelPill, this.levelText, 1);
  }

  setBoosterStatus(text: string): void {
    this.boosterText.setText(text);
    this.redrawPill(this.boosterPill, this.boosterText, 0.5);
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
