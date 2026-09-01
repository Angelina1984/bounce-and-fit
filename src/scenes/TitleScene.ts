import Phaser from "phaser";
import { SCENE_KEY_PROTOTYPE, SCENE_KEY_TITLE, TEXT_COLOR_MUTED } from "../constants";
import { readPersonalBest } from "../gameplay/personalBest";
import { GlossyButton, PillBadge, outlinedTextStyle } from "../ui/theme";
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
        "Aim your bounce. Break every brick.",
        outlinedTextStyle("16px", 2, TEXT_COLOR_MUTED),
      )
      .setOrigin(0.5);

    const playButton = new GlossyButton(this, width / 2, height / 2 + 60, "Play", { fontSize: "28px" });
    playButton.onClick(() => this.scene.start(SCENE_KEY_PROTOTYPE));

    // Only shown once there is one. A "Best 0" badge on a first launch
    // advertises a scoreboard the player hasn't played for yet, and the
    // number to beat is the whole reason this is on the title screen.
    const best = readPersonalBest(globalThis.localStorage);
    if (best > 0) {
      new PillBadge(this, width / 2, height / 2 + 130, `Best  ${best.toLocaleString()}`, {
        fontSize: "16px",
        originX: 0.5,
      });
    }
  }
}
