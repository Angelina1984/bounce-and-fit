import Phaser from "phaser";
import { SCENE_KEY_PROTOTYPE, SCENE_KEY_TITLE, TEXT_COLOR_MUTED } from "../constants";
import { GlossyButton, outlinedTextStyle } from "../ui/theme";
import { addBackdrop, ensureCandyTextures } from "../ui/textures";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEY_TITLE);
  }

  create(): void {
    const { width, height } = this.scale;

    ensureCandyTextures(this);
    addBackdrop(this);

    this.add.text(width / 2, height / 2 - 70, "Bounce & Fit", outlinedTextStyle("40px", 5)).setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 - 30,
        "A calm, puzzle-driven brick breaker",
        outlinedTextStyle("16px", 2, TEXT_COLOR_MUTED),
      )
      .setOrigin(0.5);

    const playButton = new GlossyButton(this, width / 2, height / 2 + 60, "Play", { fontSize: "28px" });
    playButton.onClick(() => this.scene.start(SCENE_KEY_PROTOTYPE));
  }
}
