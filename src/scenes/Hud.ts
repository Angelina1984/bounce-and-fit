import Phaser from "phaser";
import { TEXT_COLOR_GOLD, TEXT_COLOR_WHITE } from "../constants";
import {
  BUTTON_DEPTH,
  outlinedTextStyle,
  paintGlossyButtonBackground,
  paintPillBackground,
  popButton,
  squashButton,
} from "../ui/theme";

/**
 * All of PrototypeScene's on-screen text in one place — lives/level/booster
 * status in the corner, plus the win/lose message and its action button.
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

  private readonly cornerPanel: Phaser.GameObjects.Graphics;
  private readonly actionButtonBg: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;

    // Drawn first so it renders behind the corner text stack.
    this.cornerPanel = scene.add.graphics();
    this.livesText = scene.add.text(28, 18, "", outlinedTextStyle("20px", 3));
    this.levelText = scene.add.text(28, 44, "", outlinedTextStyle("15px", 2));
    this.boosterText = scene.add.text(28, 66, "", outlinedTextStyle("14px", 2, TEXT_COLOR_GOLD));
    this.redrawCornerPanel();

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

  private redrawCornerPanel(): void {
    const pad = 10;
    const width = Math.max(this.livesText.width, this.levelText.width, this.boosterText.width) + pad * 2;
    const top = this.livesText.y - pad;
    const bottom = this.boosterText.y + this.boosterText.height + pad;
    // Rounded-rect corners, not a full pill — a half-height radius on a
    // panel this tall reads as a lozenge and crowds the text.
    paintPillBackground(this.cornerPanel, 16, top, width, bottom - top, 14);
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
    this.redrawCornerPanel();
  }

  setLevel(levelIndex: number, levelName: string): void {
    this.levelText.setText(`Level ${levelIndex + 1}: ${levelName}`);
    this.redrawCornerPanel();
  }

  setBoosterStatus(text: string): void {
    this.boosterText.setText(text);
    this.redrawCornerPanel();
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
