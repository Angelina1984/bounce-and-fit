import Phaser from "phaser";
import {
  SCENE_KEY_PROTOTYPE,
  SCENE_KEY_TITLE,
  TEXT_COLOR_ACCENT,
  TEXT_COLOR_ACCENT_HOVER,
  TEXT_COLOR_MUTED,
  TEXT_COLOR_ON_ACCENT,
  TEXT_COLOR_WHITE,
} from "../constants";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEY_TITLE);
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 70, "Bounce & Fit", {
        fontSize: "40px",
        color: TEXT_COLOR_WHITE,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 30, "A calm, puzzle-driven brick breaker", {
        fontSize: "16px",
        color: TEXT_COLOR_MUTED,
      })
      .setOrigin(0.5);

    const playButton = this.add
      .text(width / 2, height / 2 + 60, "Play", {
        fontSize: "28px",
        color: TEXT_COLOR_ON_ACCENT,
        backgroundColor: TEXT_COLOR_ACCENT,
        padding: { x: 36, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playButton.on("pointerover", () => playButton.setBackgroundColor(TEXT_COLOR_ACCENT_HOVER));
    playButton.on("pointerout", () => playButton.setBackgroundColor(TEXT_COLOR_ACCENT));
    playButton.on("pointerdown", () => this.scene.start(SCENE_KEY_PROTOTYPE));
  }
}
