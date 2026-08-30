import js from "@eslint/js";
import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      // Matches this codebase's existing convention: an intentionally-
      // unused callback parameter (Phaser's fixed collider/event
      // signatures often force accepting one) is prefixed with `_`.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        // Type-aware rules (no-floating-promises, no-misused-promises, etc.)
        // need a tsconfig — projectService auto-discovers it per file
        // instead of hand-listing tsconfig paths. Root-level config files
        // aren't covered by tsconfig.json's include (["src", "tests"]), so
        // they need an explicit opt-in to a default (non-type-checked)
        // project rather than erroring as "not found."
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // tests/e2e's window.__game hook deliberately crosses into a live
    // Phaser scene's private fields untyped — see the comment on AnyScene
    // in gameHooks.ts for why. Loosening these two rules there is a
    // conscious tradeoff, not a blanket opt-out for the whole test suite.
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["tests/e2e/**/*.ts"],
    ...playwright.configs["flat/recommended"],
  },
  {
    // playwright/no-wait-for-timeout assumes a DOM-driven app where a
    // network response or element appearing is always available to wait on
    // instead. This game renders to one opaque <canvas> with no DOM
    // reflecting game state, and much of what these tests wait for is
    // physics simulation time passing (a ball falling, a booster timer
    // expiring) — there's no equivalent signal to await instead. Accepted
    // as a structural property of testing a canvas game, not a smell.
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "playwright/no-wait-for-timeout": "off",
    },
  },
  prettier,
);
