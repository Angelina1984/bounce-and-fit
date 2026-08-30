export {};

declare global {
  interface Window {
    // Dev-only hook set by src/main.ts under import.meta.env.DEV — see the
    // comment there. Untyped on purpose: it exposes the live Phaser scene's
    // private fields, which is the whole point of using it from tests.
    __game: any;
  }
}
