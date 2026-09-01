import { describe, expect, it } from "vitest";
import { desaturateColor, lerpColor, shadeColor } from "./theme";

/**
 * Only the pure color math is unit-tested here — the paint functions issue
 * Phaser Graphics draw calls, whose real output is pixels, and asserting a
 * sequence of fillRoundedRect() calls would test the implementation rather
 * than the look. Those are verified by eye in a real browser instead (see
 * coding-hygiene.md on what's worth an assertion).
 */

const GOLD = 0xf4c95d;

const channels = (color: number) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];

describe("shadeColor", () => {
  it("returns the color unchanged at amount 0", () => {
    expect(shadeColor(GOLD, 0)).toBe(GOLD);
  });

  it("darkens toward black for negative amounts", () => {
    const darker = shadeColor(GOLD, -0.5);
    channels(darker).forEach((c, i) => expect(c).toBeLessThan(channels(GOLD)[i]));
  });

  it("lightens toward white for positive amounts", () => {
    const lighter = shadeColor(GOLD, 0.5);
    channels(lighter).forEach((c, i) => expect(c).toBeGreaterThan(channels(GOLD)[i]));
  });

  it("lands exactly on black and white at the extremes", () => {
    expect(shadeColor(GOLD, -1)).toBe(0x000000);
    expect(shadeColor(GOLD, 1)).toBe(0xffffff);
  });

  it("clamps rather than overshooting past the extremes", () => {
    expect(shadeColor(GOLD, -5)).toBe(0x000000);
    expect(shadeColor(GOLD, 5)).toBe(0xffffff);
  });

  it("keeps every channel in range for pure black and white inputs", () => {
    expect(shadeColor(0x000000, -1)).toBe(0x000000);
    expect(shadeColor(0xffffff, 1)).toBe(0xffffff);
  });
});

describe("desaturateColor", () => {
  it("returns the color unchanged at amount 0", () => {
    expect(desaturateColor(GOLD, 0)).toBe(GOLD);
  });

  it("collapses to a true gray at amount 1 — every channel equal", () => {
    const [r, g, b] = channels(desaturateColor(GOLD, 1));
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("narrows the spread between channels without fully flattening it partway", () => {
    const spread = (color: number) => Math.max(...channels(color)) - Math.min(...channels(color));
    expect(spread(desaturateColor(GOLD, 0.5))).toBeLessThan(spread(GOLD));
    expect(spread(desaturateColor(GOLD, 0.5))).toBeGreaterThan(0);
  });

  it("leaves an already-gray color alone", () => {
    const gray = 0x808080;
    expect(desaturateColor(gray, 1)).toBe(gray);
  });

  it("clamps out-of-range amounts instead of inverting the mix", () => {
    expect(desaturateColor(GOLD, -1)).toBe(GOLD);
    expect(desaturateColor(GOLD, 5)).toBe(desaturateColor(GOLD, 1));
  });
});

describe("lerpColor", () => {
  it("returns each endpoint exactly at t=0 and t=1", () => {
    expect(lerpColor(GOLD, 0x000000, 0)).toBe(GOLD);
    expect(lerpColor(GOLD, 0x000000, 1)).toBe(0x000000);
  });

  it("lands on the channel-wise midpoint at t=0.5", () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });

  it("clamps out-of-range t rather than extrapolating past the endpoints", () => {
    // Every gradient strip derives its t from a position/height ratio, so a
    // rounding overshoot must saturate rather than wrap a channel around.
    expect(lerpColor(0x000000, 0xffffff, -3)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 4)).toBe(0xffffff);
  });

  it("is symmetric — swapping the endpoints mirrors t", () => {
    expect(lerpColor(GOLD, 0x102030, 0.25)).toBe(lerpColor(0x102030, GOLD, 0.75));
  });
});
