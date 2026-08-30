# Bounce & Fit — Task List

Engineering/build tasks, separate from game-design decisions (those live in
`.claude/skills/bounce_and_fit_design_brief.md`).

## Done

- [x] **Add Playwright E2E tests** (Aug 29, 2026). `tests/e2e/` — title screen →
      Play → level 1, paddle/serve/bounce/lives core loop, retry resets to
      level 1 with full lives, all 5 hit-based boosters' decay math, hazard
      bricks triggering on destruction with no falling item, Extra Ball +
      Burning Ball compounding across multiple balls, and full 6-level
      progression with the run-wide life carryover. Run: `npm run test:e2e`.
      Drives real pointer input for what a player actually does (paddle
      movement, clicks) and calls the scene's own methods directly (via a
      `window.__game` hook, dev-only — stripped from production builds) for
      deterministic setup of things that would otherwise mean physically
      landing dozens of real ball bounces per test.
- [x] **Add unit tests** (Aug 29, 2026). Extracted the pure, Phaser-free
      logic into `src/gameplayMath.ts` (paddle-bounce angle math) and
      `src/levelData.ts` (level/booster data plus `validateLevels()`, which
      encodes the design brief's own placement rules — no overlapping
      star/hazard/skip cells, no more star bricks than §3 allows). Tested
      with Vitest: `src/gameplayMath.test.ts`, `src/levelData.test.ts`. Run:
      `npm run test:unit`.
- [x] Added `.gitignore` (node_modules, dist, Playwright/Vitest artifacts) —
      needed before this repo gets `git init` + pushed.
- [x] **Add ESLint/Prettier** (Aug 29, 2026). `eslint.config.js` (flat
      config) using typescript-eslint's type-checked rule set, not just
      `recommended` — worth it for an async-heavy codebase where a dropped
      `await` in a test is a real bug. Prettier owns formatting;
      `eslint-config-prettier` keeps the two from fighting. See
      `coding-hygiene.md`'s "Linting & formatting" section for the specific
      rule deviations and why (unbound-method fixed properly via arrow
      wrappers rather than suppressed, `no-wait-for-timeout` off for
      `tests/e2e` since a canvas game has no DOM signal to wait on instead).
      Added `@types/node` alongside it (needed for `process.env` in
      `playwright.config.ts`/`eslint.config.js`, previously untyped).
      Scripts: `npm run lint`, `npm run lint:fix`, `npm run format`,
      `npm run format:check` — both now gate `npm run test`.
- [x] **Fixed a real bug: balls stopped bouncing off bricks and world edges**
      (Aug 29, 2026). Reported as "the ball hit a brick and slid off-screen."
      Root cause: `this.balls = this.physics.add.group()` had no config, and
      Phaser's `Group#createCallbackHandler` re-applies the group's defaults
      (`collideWorldBounds: false`, `bounce: 0`) to every member on _every_
      `.add()` call — silently wiping out what `createBallSprite()` had just
      set. Fixed by configuring the group itself
      (`{ collideWorldBounds: true, bounceX: 1, bounceY: 1 }`). Notable: the
      entire existing test suite passed both before and after this bug,
      because most tests call `handleBrickHit` directly rather than through
      a real Phaser collision — added `tests/e2e/physics.spec.ts`
      specifically to drive a real collider and close that blind spot;
      verified it actually fails against the reintroduced bug before
      confirming the fix. See `coding-hygiene.md`'s Phaser gotchas.
- [x] **Initialized git** (`git init`, no remote, no commits yet) — needed
      for Husky's hooks mechanism to have something to hook into.
- [x] **Add Husky pre-commit hooks** (Aug 29, 2026). `.husky/pre-commit` runs
      `npx lint-staged` (ESLint `--fix` + Prettier `--write`, scoped to
      staged files, config in `package.json`) then `npm run typecheck`.
      Deliberately does _not_ run the test suites (too slow for a hook that
      fires on every commit — see `coding-hygiene.md`'s "Pre-commit hooks"
      section for why that matters). Verified by staging everything and
      running `npx lint-staged` directly (no commit made — nothing has been
      committed to this repo yet, that's still yours to do).
- [x] **Add README.md** (Aug 29, 2026). Project description, tech stack,
      getting-started/build/test commands, project structure, links to the
      design brief and coding-hygiene doc.
- [x] **Fixed a second real bug: a real paddle hit sent the ball's velocity
      onto the paddle's body instead** (Aug 29, 2026). Reported as "the ball
      is moving left and right, and my paddle floated to the top." Root
      cause: `physics.add.collider(this.balls, this.paddle, cb)` registers
      the group first — Phaser's dispatcher normalizes a group-vs-single-object
      pair to always invoke the callback as `(theSingleObject, theGroupMember)`,
      so `cb` actually received `(paddle, ball)`, not `(ball, paddle)` as the
      registration order implied. `handlePaddleHit` read/wrote the first
      argument as "the ball," so it was reading and writing the paddle's
      body instead — paddle flew off-screen at the ball's speed, real ball
      kept its old velocity, and the return-angle math was silently always
      "straight up" the whole time (`paddle.x - paddle.x` is always 0).
      Confirmed straight from Phaser's `World.js` source before fixing, not
      guessed. Fixed by swapping the callback's parameter order to match
      Phaser's real behavior, with a comment on-site explaining why. Same
      test-coverage gap as the bug above — the one existing test touching
      `handlePaddleHit` calls it directly with manually-correct arguments,
      so it could never have caught an argument-order bug specific to real
      Phaser dispatch. Added a second `physics.spec.ts` case; verified it
      fails against the reintroduced bug before confirming the fix. See
      `coding-hygiene.md`'s Phaser gotchas — also confirmed the _other_
      group/single-object pair in the codebase (`paddle`, `powerUps`) does
      NOT have this bug, since the single object is registered first there.
- [x] **Fixed a third real bug: Extra Ball spawned motionless** (Aug 29,
      2026). Reported on Level 4 "Double Up": catching the power-up creates
      a second ball that just sits there while the original keeps playing.
      Root cause: the same `physics.add.group()` defaults-reapplication
      mechanism as the first bug, in a call site that fix didn't touch —
      `spawnExtraBall()` called `extraBody.setVelocity(...)` _before_
      `this.deps.balls.add(extra)`, and `Group#add()` resets
      `velocityX`/`velocityY` back to 0 (this group's config never
      overrides them) on every `.add()`. Fixed by moving `.add()` to before
      the velocity/size/tint setup. Verified with the same reproduce →
      confirm-fails → fix → confirm-passes sequence as the other two bugs.
      Also fixed a real gap this exposed: the existing "Extra Ball +
      Burning Ball compound" test only checked `ballCount` and tint, never
      velocity — extended it to check speed, and it needed its own fix too
      (a false failure from never launching the primary ball, unrelated to
      the real bug — caught because red-green requires watching a test
      _pass_ for the right reason, not just fail for some reason).
- [x] **Add a per-level E2E test suite** (Aug 29, 2026). `tests/e2e/levels.spec.ts`
      — one test per level, each asserting the level's specific
      booster/hazard produces genuine _physical_ behavior (a body's real
      width, a ball's real velocity and changed position, a paddle that
      provably doesn't move under real mouse input) rather than just an
      internal flag, which is exactly what let the Extra Ball bug above
      pass unnoticed elsewhere. Added `dropAndCatchPowerUp()` to
      `gameHooks.ts` — spawns the power-up and lets Phaser's real
      paddle-vs-powerUps overlap resolve the catch, instead of calling
      `handlePowerUpCatch()` directly.
- [x] **Add unit tests for `BoosterController`** (Aug 29, 2026). It couldn't
      be unit tested as originally written — it did `import Phaser from
"phaser"`, and merely importing that package crashes under Vitest's
      default Node environment (`window is not defined` in
      `phaser/src/device/OS.js`, at module load, before any API call — see
      `coding-hygiene.md`'s Phaser gotchas). Since the class is
      dependency-injected and only used `Phaser` for type annotations plus
      `Phaser.Math.Clamp`/`Phaser.Math.DegToRad`, switched the import to
      `import type Phaser from "phaser"` (erased at compile time) and
      swapped those two calls for the pure `clamp()`/`degToRad()` already in
      `gameplayMath.ts` — no new jsdom/happy-dom dependency needed.
      `src/gameplay/BoosterController.test.ts` (12 tests) drives it with
      plain fake objects satisfying `BoosterControllerDeps` (fake
      paddle/balls-group/scene-clock), covering every booster/hazard's
      apply/decay/revert, `resetAll()`, `getStatusText()`, and Extra Ball's
      spawn (added ball, real non-zero velocity, trajectory divergence,
      MAX_BALLS cap).
- [x] **Extract `GameState` string literals into a `GAME_STATE` constant**
      (Aug 29, 2026). `"serving"/"playing"/"won"/"lost"` were duplicated
      across `PrototypeScene.ts` and several `tests/e2e/*.spec.ts` files with
      no single source of truth. Added `GAME_STATE` to `constants.ts` (a
      `const` object, with `GameState` derived from it via `(typeof
GAME_STATE)[keyof typeof GAME_STATE]`) and updated `PrototypeScene.ts`
      and the Node-side test assertions (`expect(state.state).toBe(...)`) to
      use it. Deliberately left the raw string literals that appear _inside_
      `page.evaluate()` setup blocks (`s.state = "playing"`) alone — a
      `page.evaluate()` callback can't close over a Node-side import
      (Playwright re-evaluates the callback's source in the browser), so
      using the constant there would require a new `window.__GAME_STATE`
      dev-only global, which isn't worth it for values whose only failure
      mode is a loud, immediate test failure. See `coding-hygiene.md`.
- [x] **Fixed a flaky Level 6 test** (Aug 29, 2026). Found while confirming
      the two changes above didn't regress anything: running the full suite
      under Playwright's default 8 parallel workers, `levels.spec.ts`'s
      Level 6 test intermittently read `paddle.body.width` as `90` (full
      width) right after `triggerHazardBrick(page, "narrow-paddle")` —
      passed reliably alone, failed under worker contention. Same root cause
      as an already-documented gotcha (`coding-hygiene.md`: Arcade's
      body-width auto-sync runs on the next physics step, not synchronously
      with `setDisplaySize()`), just missing its wait in this particular
      assertion. Added `await page.waitForTimeout(50)` between the trigger
      and the read; reran the full suite to confirm it's no longer racy.
- [x] **Boosters (and extra balls) now carry across a "Next Level"
      transition** (Aug 29, 2026). Previously every `scene.restart()` —
      "Next Level" included, not just retry-after-loss — threw away
      `BoosterController` and rebuilt it from scratch, so Wide Paddle and
      the other hit-based boosters silently reset even though the design
      brief's own rule ("losing a life clears every active booster") only
      ever named life loss as the reset trigger. Added
      `BoosterController.getCarrySnapshot()`/`applySnapshot()` (captures the
      four hit-based boosters' remaining budgets; deliberately excludes
      hazards, which stay real-time and reset on every transition, and
      Extra Ball, which has no duration to snapshot) and threaded a
      `boosterSnapshot`/`extraBallCount` pair through `PrototypeSceneData`,
      captured in the "Next Level" click handler and applied at the top of
      the next `create()`. Carrying extra balls forward as real balls
      required generalizing `movePaddle()`'s serving-follow and
      `launchBall()` from "the one primary ball" to "every ball currently in
      the group" (each keeping a `serveOffsetX` so they don't stack) — see
      `coding-hygiene.md`'s "Structuring a Phaser Scene" for the pattern and
      a subtle bug caught along the way (`reserveBall()`'s single-surviving-ball
      path needed the same offset-reset, or a ball that used to be part of a
      multi-ball formation would drift off paddle center after a miss).
      Scope decided with the user up front: hazards never carry (that
      level's own cost, not a following penalty), and "Play Again" after the
      last level still resets everything, matching how it already resets
      lives. Design brief §3 updated with the explicit rule. New tests:
      `BoosterController.test.ts`'s "getCarrySnapshot / applySnapshot"
      block (5 cases) and two `boosters-and-levels.spec.ts` E2E tests — one
      proving a booster's _remaining budget_ carries (not just a flag,
      continuing to decay from where it left off), one proving carried extra
      balls are genuinely playable (distinct serve positions, both get real
      velocity on the next tap).
- [x] **Gameplay expansion: 7-row grid, faster ball, tough bricks, Catch &
      Aim, Foresight, and denser levels** (Aug 30, 2026). Planned and scoped
      with the user up front (see the approved plan in this session), since
      it touched core mechanics and reversed a documented design rule:
  - `BRICK_ROWS` 4 → 7, `BALL_SPEED` 360 → 420.
  - **Tough bricks**: the top row of every level now takes 2 hits to
    destroy (`TOUGH_BRICK_ROWS`/`TOUGH_BRICK_HITS` in `constants.ts`),
    marked with a numbered label. A structural brick property, not a
    booster — `handleBrickHit()` decrements and bails before the normal
    destroy/star/hazard/win-check logic runs, only proceeding once a hit
    brings it to 0. Deliberately never placed under a star/hazard brick, so
    "needs 2 hits" and "also drops something" never entangle.
  - **Catch & Aim** (new booster, `sticky-paddle`): a ball sticks to the
    paddle on contact instead of bouncing, follows the paddle horizontally
    while stuck (per-ball `stuck`/`stuckOffsetX` data, reusing the same
    "follow by stored offset" idea as multi-ball serving), and every
    currently-stuck ball releases together on the next tap, aimed with the
    same `bounceOffsetToAngleRad()` formula a normal paddle hit already
    uses. Scoped as a temporary hit-based booster (decays like the other
    five), not a permanent rule change — confirmed with the user, since
    it's arguably the mechanic most aligned with the game's actual premise
    ("bounces are a planning puzzle, not a reflex test").
  - **Foresight** (new booster): a dotted trajectory preview (reflecting off
    the two side walls, drawn via a `Phaser.GameObjects.Graphics` with a
    loop of small `fillCircle` dots), visible only while a ball is stuck via
    Catch & Aim and this booster is active — not a continuously-live
    preview during normal flight, a deliberately smaller scope confirmed
    with the user.
  - **Level content**: dropped the "one new booster taught per level"
    progression rule per the user's explicit choice — every level (6 of the
    now-7 boosters, rotated per level, plus both hazards) draws from the
    full catalog from level 1 on. `validateLevels()`'s `maxStarBricks`
    raised 2 → 8, a new `maxHazardBricks` cap added, and a new check added
    that a star/hazard brick never lands on a tough row.
  - Fixing this surfaced several real test-helper bugs, not just new-feature
    gaps: `winCurrentLevel()`/`destroyOneNormalBrick()` assumed one
    `handleBrickHit()` call always destroys a brick (broke once tough
    bricks needed 2), a test-specific "destroy all but one brick" setup
    loop excluded _every_ star brick instead of just the one under test
    (each of the level's other 5 star bricks then got destroyed for real by
    a later `winCurrentLevel()` call, over-decaying a booster's counter),
    and one test hardcoded the old 4-row grid's total brick count instead
    of reading it live. See `coding-hygiene.md`'s newest entries for the
    full detail on each, plus the Burning Ball hit-budget interaction the
    taller grid exposed (a real mechanic, not a bug — its fix was in the
    test, not the code).
  - New tests: `BoosterController.test.ts` gained `sticky-paddle`/
    `foresight` coverage (apply/decay, `resetAll`, snapshot/restore) plus 3
    new `levelData.test.ts` cases for the new validation rules. New
    `tests/e2e/gameplay-expansion.spec.ts` (4 tests) covers tough-brick
    hit-then-destroy, real paddle-collider sticking + real-pointer
    following + real-velocity release, sticking again on a second contact
    (not just the first), and Foresight's preview only rendering while
    actually aiming (verified via `Graphics.commandBuffer.length`, confirmed
    empirically to be a real, readable property before relying on it).
  - Design brief (`.claude/skills/bounce_and_fit_design_brief.md`) updated:
    new catalog entries for Catch & Aim/Foresight, a new "Tough bricks"
    subsection, and a reconciliation record documenting the dropped
    progression rule and Level 6's lost "hazards-only finale" framing.
  - Explicitly deferred (per the user's own sequencing): the "candy UI"
    visual/CSS restyling discussed earlier in this session.
- [x] **Freeze Paddle moved to the last level; Double Ball/Triple Ball added
      to every level** (Aug 30, 2026). Two follow-on refinements decided
      with the user after playing the denser catalog:
  - **Freeze Paddle** (input-ignoring hazard) is now only in level 6
    (`Gauntlet`) — removed from every earlier level's `hazardBricks`, per
    the user's call that it's harsher than Paddle Cut and shouldn't be
    unlocked everywhere. Paddle Cut stays available from level 1.
  - **Double Ball / Triple Ball** (new one-shot boosters, no decay): add 2
    or 3 more balls per catch. Explicitly **compounding, not a jump to a
    fixed total** — confirmed with the user via a concrete worked example
    (catch Double Ball twice → 1 + 2 + 2 = 5 balls; add a Triple Ball catch
    → 8). `BoosterController.spawnExtraBall()` generalized into
    `spawnExtraBalls(count)` (Extra Ball now just calls it with `count: 1`)
    — spawns up to `count` balls per catch, stopping silently at the cap
    rather than erroring, and gives each spawned ball its own diverging
    launch angle so a multi-ball catch fans out instead of stacking.
    `MAX_BALLS` raised 3 → 12 (a generous technical ceiling, not a design
    target) to make room for real compounding.
  - Added one Double Ball and one Triple Ball star brick to every level
    (row 6, unconditionally — not part of the existing "rotate out one
    booster" scheme, since the user asked for both in every level).
  - New tests: `BoosterController.test.ts` gained a "double-ball /
    triple-ball" block (4 cases — the exact compounding example, mixing
    both together, real velocity on every spawned ball, silent stop at
    `MAX_BALLS`). `levelData.test.ts` gained 3 cases (every level has
    exactly one of each new booster; Freeze Paddle only on the last level;
    Paddle Cut still on level 1). `gameplay-expansion.spec.ts` gained two
    E2E tests — real catches compounding to the exact total with every ball
    genuinely playable, and Freeze Paddle's absence/presence verified
    against the real brick data on level 1 vs. the last level.
  - Design brief updated: new catalog rows for Double Ball/Triple Ball, the
    compounding rule spelled out explicitly, Freeze Paddle's hazard-bricks
    note, §5's level table split into a booster-mix column and a
    per-level hazards column, and a new reconciliation record tying this
    back to the earlier Extra Ball-supersedes-Multi-Ball decision (now
    partly reopened, since Double/Triple Ball compound freely rather than
    staying "the lighter, incremental version").
- [x] **Fixed a real bug: level 2 played slower than level 1** (Aug 30,
      2026). Root cause: the "boosters carry across Next Level" feature
      (built earlier this session) was working exactly as designed — if
      Slow Ball was still active (hit-budget not yet spent) when a level
      was won, its speed reduction carried into the next level, same as
      Wide Paddle/Big Ball/etc. Confirmed scope with the user before
      fixing: only Slow Ball needed carving out, not the whole carry-over
      feature. Removed `slowRemaining` from `BoosterSnapshot`/
      `getCarrySnapshot()`/`applySnapshot()` entirely — Slow Ball still
      decays normally _within_ a level, it just never survives a level
      transition, so every level now always starts at the standard ball
      speed. Wide Paddle, Big Ball, Burning Ball, Catch & Aim, and
      Foresight are unaffected. New tests: a `BoosterController.test.ts`
      case proving Slow Ball's snapshot is always empty even while active,
      and a real-gameplay E2E regression test in `boosters-and-levels.spec.ts`
      reproducing the exact reported scenario (catch Slow Ball right before
      winning a level, confirm the _next_ level's real served ball speed,
      not just the flag). Design brief §3 updated (five of six boosters
      carry now, not six) with a new reconciliation record explaining why
      speed was carved out specifically.
- [x] **Slow Ball and Paddle Cut converted to short real-time timers** (Aug
      30, 2026). Slow Ball moved off its "6 bricks destroyed" decay entirely
      onto a flat 3-second `scene.time.delayedCall` timer, matching how
      Freeze Paddle already worked — confirmed with the user, following
      naturally from the carry-over fix just above (a real-time timer
      doesn't survive `scene.restart()`, so this also structurally
      guarantees Slow Ball can never carry across a level transition, not
      just by omission from `BoosterSnapshot`). Paddle Cut's duration
      shortened 6s → 3s in the same change so all three short real-time
      effects (Slow Ball, Paddle Cut, Freeze Paddle) now match. Removed
      `slow-ball` from `BoosterController`'s `HitBasedBuff` union entirely
      (added a `slowBallTimer` field alongside the existing
      `narrowTimer`/`freezeTimer`, mirroring their exact pattern);
      `SLOW_BALL_BRICK_HITS` replaced with `SLOW_BALL_DURATION_MS` in
      `constants.ts`. `getStatusText()` now shows Slow Ball as a plain label
      with no count, same as the two hazards, since a real-time effect has
      no meaningful "hits remaining" to display. Updated
      `BoosterController.test.ts`'s Slow Ball tests to use the existing fake
      timer harness (`fireAllPending()`) instead of `onBrickDestroyed()`
      loops, plus a new case proving bricks destroyed no longer decay it at
      all. Design brief updated: table durations, the "five bricks-destroyed
      boosters" duration rule, the non-rules line about countdown timers,
      and a new reconciliation record.
- [x] **Added a level-gated ball-speed challenge ramp** (Aug 30, 2026).
      Raised as an open design question — the game's own positioning (§8)
      is explicitly "planning over reflex," in tension with wanting to
      challenge motor-skilled players with more speed. Resolved with the
      user: the first 4 levels (index 0-3) stay exactly as calm/non-reflex
      as designed, but a player who clears those has proven enough
      proficiency to be worth challenging, so **level 5 onward (index 4+)
      ramps the ball's base speed up, one step per level**. New pure
      function `ballSpeedForLevel(levelIndex, baseSpeed,
challengeStartLevelIndex, step)` in `gameplayMath.ts` (flat through
      the calm zone, `baseSpeed * (1 + step * levelsIntoChallenge)` after);
      new constants `CHALLENGE_START_LEVEL_INDEX` (4) and
      `CHALLENGE_SPEED_STEP` (0.15) in `constants.ts`. `PrototypeScene`
      gained a `ballSpeed` field recomputed in `create()` from `levelIndex`,
      replacing every direct `BALL_SPEED` reference in `launchBall()`/
      `handlePaddleHit()`/`releaseStuckBalls()`. `BoosterControllerDeps`
      gained a `getBallSpeed()` accessor so Extra Ball/Double Ball/Triple
      Ball's spawn-speed clamp scales off the _level's_ speed, not the flat
      constant — a spawn on a later, faster level would otherwise have been
      capped too low. New tests: 3 `gameplayMath.test.ts` cases for the flat
      zone, the exact ramp-start level, and continued ramping past it; a
      real-gameplay E2E test confirming level 1 serves at the standard
      speed and level 5 serves faster. Design brief §3 gained a "Challenge
      speed ramp" subsection and a reconciliation record framing this as a
      narrow carve-out, not a reversal, of the "calm, non-reflex" positioning.
- [x] **Fixed a real bug: the whole game froze when catching an Extra
      Ball-family power-up** (Aug 30, 2026). Reported live as "paddle, ball,
      boosters — everything froze" after the paddle caught a "blue"
      booster. Root cause found by reproducing with a `page.on("pageerror")`
      listener attached (not guessed): if the _original_ `primaryBall` (not
      just an "extra" one) fell off-screen while other balls survived,
      `update()`'s "some balls fell, not all" branch destroyed it without
      ever reassigning `primaryBall` to a still-alive ball —
      `reserveBall()` (the "every ball fell" path) already got this right,
      but this sibling path didn't. The next Extra/Double/Triple Ball catch
      then called `getPrimaryBall()`, got the destroyed ball, and read
      `.velocity` off its now-null `.body` — an uncaught exception inside a
      real Phaser physics-step callback, which halts the entire
      `requestAnimationFrame` loop (paddle input, ball motion, and every
      booster timer are all driven by it, so all of them stopped at once).
      Fixed by checking `this.balls.getChildren().includes(this.primaryBall)`
      after removing fallen balls and reassigning to any survivor if it's
      gone. New E2E regression test in `gameplay-expansion.spec.ts`
      reproduces the exact scenario (extra ball caught, original ball
      forced off-screen, another ball booster caught) and asserts zero
      `pageerror` events plus that real pointer input still moves the
      paddle afterward. See `coding-hygiene.md`'s newest gotcha for the
      general lesson (an uncaught exception in a collider callback reads as
      "everything is broken," not "this one thing is null").
- [x] **Fixed a real bug: Slow Ball didn't really slow** (Aug 30, 2026).
      Reported live, and confirmed by inspection rather than assumed:
      `BoosterController.speed` was only ever consulted at the _next_
      `launchBall()`/`handlePaddleHit()` call — a ball already in flight
      when Slow Ball was caught kept its old velocity untouched until it
      next bounced off the paddle. Once Slow Ball's duration shortened to a
      3-second real-time timer (see the entry above this one), a ball
      mid-flight toward the brick field could easily never return to the
      paddle before the timer expired, so the whole effect could pass
      invisibly. Fixed with a new `BoosterController.rescaleBallSpeeds()`
      that rescales every ball currently in flight (preserving each one's
      direction) immediately on both apply and revert, not just on the next
      bounce. Resting balls (serving or stuck via Catch & Aim, both
      zero-velocity) are deliberately left alone. New tests: 5
      `BoosterController.test.ts` cases (immediate rescale on catch,
      direction preserved, immediate restore on revert, resting balls
      untouched, every ball in the group rescaled — not just the primary
      one) plus a manual verification confirming the real in-browser speed
      actually changes the instant the booster is caught.
- [x] **CI workflow** (Aug 30, 2026). Added a GitHub Actions workflow
      (`.github/workflows/ci.yml`) that triggers on every push and PR to
      run `npm test` (including typecheck, linting, formatting, unit tests,
      and Playwright E2E tests).

## Backlog

- [ ] **Integration-level coverage is currently folded into the E2E suite**
      (see gameHooks.ts's doc comment) rather than a separate layer — revisit
      if the scene logic ever gets complex enough to warrant testing without
      a real browser (e.g. via a headless Phaser/jsdom harness).
- [ ] Once §6b's touch-drag control support lands, add an E2E project using
      Playwright's mobile viewport + touch emulation (`devices["iPhone 13"]`
      etc.) alongside the existing desktop-mouse project.
- [ ] No visual/screenshot regression tests yet — worth adding once the art
      pass (§6, "look-and-feel, only now") replaces the gray-box tints,
      since that's exactly when a visual diff starts catching real
      regressions instead of expected gray-box churn.
