import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns tests/e2e/*.spec.ts — scoping Vitest to src/ keeps the
    // two runners from fighting over the same files (test.describe() isn't
    // valid outside Playwright's own runner).
    include: ["src/**/*.test.ts"],
  },
});
