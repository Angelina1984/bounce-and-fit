import { describe, expect, it } from "vitest";
import { readPersonalBest, recordScore, type MaybeStorage } from "./personalBest";
import { PERSONAL_BEST_STORAGE_KEY } from "../constants";

function fakeStorage(initial?: string): MaybeStorage & { value?: string } {
  let value = initial;
  return {
    get value() {
      return value;
    },
    getItem: (key: string) => (key === PERSONAL_BEST_STORAGE_KEY ? (value ?? null) : null),
    setItem: (key: string, next: string) => {
      if (key === PERSONAL_BEST_STORAGE_KEY) value = next;
    },
  };
}

/** Storage that throws on every access — Safari private mode and any
 * browser with site data blocked behave exactly like this. */
const hostileStorage: MaybeStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("readPersonalBest", () => {
  it("is 0 with nothing stored, and reads a stored value back", () => {
    expect(readPersonalBest(fakeStorage())).toBe(0);
    expect(readPersonalBest(fakeStorage("2450"))).toBe(2450);
  });

  it("treats a corrupt or nonsensical stored value as no best at all", () => {
    // The value is a plain string in a store the player can edit.
    for (const stored of ["", "abc", "-5", "NaN", "Infinity", "0", "{}"]) {
      expect(readPersonalBest(fakeStorage(stored)), stored).toBe(0);
    }
  });

  it("floors a fractional stored value rather than showing decimals in the HUD", () => {
    expect(readPersonalBest(fakeStorage("1234.9"))).toBe(1234);
  });

  it("returns 0 rather than throwing when storage itself is unavailable", () => {
    expect(readPersonalBest(undefined)).toBe(0);
    expect(readPersonalBest(hostileStorage)).toBe(0);
  });
});

describe("recordScore", () => {
  it("stores a score that beats the stored best and reports it as new", () => {
    const storage = fakeStorage("1000");
    expect(recordScore(storage, 1500)).toEqual({ best: 1500, isNewBest: true });
    expect(storage.value).toBe("1500");
  });

  it("leaves a lower score alone and reports the existing best", () => {
    const storage = fakeStorage("1000");
    expect(recordScore(storage, 400)).toEqual({ best: 1000, isNewBest: false });
    expect(storage.value).toBe("1000");
  });

  // Replaying to exactly the same total is not an achievement, and
  // announcing it as one would make the celebration meaningless.
  it("does not call an equal score a new best", () => {
    expect(recordScore(fakeStorage("1000"), 1000)).toEqual({ best: 1000, isNewBest: false });
  });

  it("sets the first best from nothing, but never from a scoreless run", () => {
    expect(recordScore(fakeStorage(), 250)).toEqual({ best: 250, isNewBest: true });
    expect(recordScore(fakeStorage(), 0)).toEqual({ best: 0, isNewBest: false });
  });

  // The run really was the best one; the browser just won't remember it.
  // Reporting otherwise would make the end screen contradict what happened.
  it("still reports a new best when the write is refused", () => {
    expect(recordScore(hostileStorage, 900)).toEqual({ best: 900, isNewBest: true });
    expect(recordScore(undefined, 900)).toEqual({ best: 900, isNewBest: true });
  });
});
