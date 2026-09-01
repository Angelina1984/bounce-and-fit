# Bounce & Fit

A fun, puzzle-driven brick breaker. Players clear levels using a limited
number of lives, with star bricks that drop strategic power-ups when caught
— no timers, no reflex pressure, no predatory monetization.

This is the **ugly prototype** stage (gray-box graphics, no art/audio pass
yet) — it exists to validate that the core loop is actually fun before any
polish gets added. See
[`.claude/skills/bounce_and_fit_design_brief.md`](.claude/skills/bounce_and_fit_design_brief.md)
for the full game design (rules, the booster/hazard catalog, level list,
accessibility and monetization plans) and
[`TASKS.md`](TASKS.md) for engineering task history and backlog.

## Tech stack

- [Phaser 3](https://phaser.io/) (Arcade Physics) for the game itself
- TypeScript, strict mode
- [Vite](https://vitejs.dev/) for dev server and bundling
- [Vitest](https://vitest.dev/) for unit tests, [Playwright](https://playwright.dev/) for E2E
- ESLint (type-checked) + Prettier, enforced via a Husky pre-commit hook

Eventual target platforms are Web, iOS, and Android (via
[Capacitor](https://capacitorjs.com/), once the prototype validates the
core loop) — see the design brief §6 for the full build-scope plan.

## Getting started

Requires Node 20+.

```bash
npm install
npm run dev
```

Opens the game at `http://localhost:5173/` with hot reload.

## Building

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
```

## Testing & code quality

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run lint:fix       # ESLint, auto-fixing what it can
npm run format          # Prettier, write mode
npm run format:check    # Prettier, check-only (what CI/hooks run)
npm run test:unit       # Vitest — pure logic only (no Phaser, no DOM)
npm run test:unit:watch # Vitest in watch mode
npm run test:e2e        # Playwright — drives the real game in a browser
npm run test            # everything above, in sequence — run before pushing
```

A Husky pre-commit hook runs `lint-staged` (ESLint `--fix` + Prettier
`--write`, scoped to staged files) and a full `typecheck` on every commit.
It deliberately does **not** run the test suites — they're slower (the E2E
suite spins up a real browser) and belong in CI instead; run
`npm run test` yourself before pushing. See
[`.claude/skills/coding-hygiene.md`](.claude/skills/coding-hygiene.md) for
the reasoning behind the testing strategy, the linting rule deviations, and
a running list of Phaser gotchas worth knowing before touching physics code.

## Project structure

```
src/
  main.ts                 Phaser game config, scene registration
  constants.ts             every tuning number, key, and gray-box color
  gameplayMath.ts          pure paddle-bounce angle math (unit tested)
  levelData.ts             level/booster data + validateLevels() (unit tested)
  gameplay/
    BoosterController.ts   all 7 boosters' state, application, decay, reset
    brickGrid.ts            builds a level's brick grid from levelData
  scenes/
    TitleScene.ts           title screen, Play button
    PrototypeScene.ts       the game itself — physics, collisions, state machine
    Hud.ts                  on-screen text (lives, level, boosters, win/lose)
tests/
  e2e/                     Playwright suite — see gameHooks.ts for the driver
.claude/skills/            design brief + engineering-practice reference docs
```

## Status

Solo project, actively in the ugly-prototype phase. Not yet published — see
`TASKS.md`'s backlog for what's planned before/around that (CI workflow,
mobile-viewport E2E coverage, etc.).
