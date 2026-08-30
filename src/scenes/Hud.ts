import Phaser from "phaser";
import { TEXT_COLOR_ACCENT, TEXT_COLOR_GOLD, TEXT_COLOR_MUTED, TEXT_COLOR_WHITE } from "../constants";

/**
 * All of PrototypeScene's on-screen text in one place — lives/level/booster
 * status in the corner, plus the win/lose message and its action button.
 * Pulled out of the scene so create() isn't the one composing five
 * Phaser.GameObjects.Text calls inline.
 */
export class Hud {
  readonly livesText: Phaser.GameObjects.Text;
  readonly levelText: Phaser.GameObjects.Text;
  readonly boosterText: Phaser.GameObjects.Text;
  readonly messageText: Phaser.GameObjects.Text;
  readonly actionText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;

    this.livesText = scene.add.text(16, 16, "", { fontSize: "20px", color: TEXT_COLOR_WHITE });
    this.levelText = scene.add.text(16, 42, "", { fontSize: "16px", color: TEXT_COLOR_MUTED });
    this.boosterText = scene.add.text(16, 64, "", { fontSize: "14px", color: TEXT_COLOR_GOLD });

    this.messageText = scene.add
      .text(width / 2, height / 2 - 20, "", { fontSize: "28px", color: TEXT_COLOR_WHITE })
      .setOrigin(0.5)
      .setVisible(false);

    // Label and click behavior are set per-outcome via setAction() — this is
    // "Tap to retry" after a loss, "Next Level" (or "Play Again" on the
    // last level) after a win.
    this.actionText = scene.add
      .text(width / 2, height / 2 + 30, "", { fontSize: "18px", color: TEXT_COLOR_ACCENT })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
  }

  setLives(lives: number): void {
    this.livesText.setText(`Lives: ${lives}`);
  }

  setLevel(levelIndex: number, levelName: string): void {
    this.levelText.setText(`Level ${levelIndex + 1}: ${levelName}`);
  }

  setBoosterStatus(text: string): void {
    this.boosterText.setText(text);
  }

  showMessage(text: string): void {
    this.messageText.setText(text).setVisible(true);
  }

  setAction(label: string, onClick: () => void): void {
    this.actionText.off("pointerdown");
    this.actionText.setText(label);
    this.actionText.on("pointerdown", onClick);
    this.actionText.setVisible(true);
  }
}
