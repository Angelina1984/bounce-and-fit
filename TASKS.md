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
- [x] **All boosters converted to real-time timers; carry-over removed**
      (Aug 30, 2026). Following the Slow Ball timer fix above, converted the
      last five hit-based boosters (Wide Paddle, Big Ball, Burning Ball,
      Catch & Aim, Foresight) to the same `scene.time.delayedCall` pattern —
      durations translated from their old bricks-destroyed budgets (Wide
      Paddle 8s, Big Ball 6s, Burning Ball 5s, Catch & Aim 5s, Foresight
      6s). `BoosterController` lost its entire hit-based-decay bucket
      (`HitBasedBuff`, `hitBuffCounters`, `onBrickDestroyed()`, `revert()`)
      in favor of 8 timer fields, one per timed effect. Since every timed
      effect is now real-time and none can survive `scene.restart()`, the
      cross-level carry-over mechanism (`getCarrySnapshot`/`applySnapshot`,
      `PrototypeSceneData.boosterSnapshot`) became fully dead code and was
      deleted rather than left unused — no booster or hazard carries into
      "Next Level" anymore, only Extra Ball's already-spawned balls do.
      Rewrote `BoosterController.test.ts` (fake-timer apply/revert coverage
      per effect, replacing the hit-count tests) and
      `boosters-and-levels.spec.ts` (removed a flaky real-time
      `page.waitForTimeout` E2E assertion in favor of the existing unit-test
      coverage — Phaser's clock is rAF-driven and unreliable to wall-clock
      wait on under parallel Playwright load; inverted the carry-over test
      to assert nothing carries, fixing a hazard-brick-ordering issue along
      the way). Design brief (`bounce_and_fit_design_brief.md`) and
      `coding-hygiene.md` updated to match.
- [x] **CI workflow** (Aug 30, 2026). Added a GitHub Actions workflow
      (`.github/workflows/ci.yml`) that triggers on every push and PR to
      run `npm test` (including typecheck, linting, formatting, unit tests,
      and Playwright E2E tests).

- [x] **Candy UI, pass 1 — HUD and title chrome** (Aug 30, 2026). First
      slice of the prototype-to-polish transition, deliberately scoped to UI
      chrome before gameplay sprites: the palette and components get proven
      on text and rectangles, where nothing can break collision or booster
      readability, and the bricks/paddle/ball pass then reuses them instead
      of re-deriving the palette. New `src/ui/theme.ts` holds the whole
      vocabulary — `outlinedTextStyle()` (bold white, dark-violet stroke,
      drop shadow), `paintPillBackground()`, `paintGlossyButtonBackground()`
      (gold gradient-ish top gloss + border + shadow), plus `PillBadge` and
      `GlossyButton` container classes for callers that want a whole
      component. Palette moved from the old slate/ice-blue to deep violet
      (`BACKGROUND_COLOR` `0x1b1f2a` → `0x2a1454`, kept in sync with
      `index.html`'s CSS by hand as that file's comment requires) plus warm
      gold. `TitleScene` now uses a real `GlossyButton`; `Hud` keeps its
      public `Phaser.GameObjects.Text` fields (so `gameHooks.ts`'s E2E
      snapshots keep reading `.text`/`.visible`/`.x`/`.y` unchanged) and
      layers rounded-panel/glossy-button Graphics companions behind them,
      redrawn from each text's own bounds. `BRICK_TOP` 90 → 116 so the grid
      clears the new corner panel. Verified by screenshotting the title,
      in-level HUD, and win state in a real browser, not just by the suite
      passing. Also added `.claude/settings.local.json` and
      `scheduled_tasks.lock` to `.prettierignore` — machine-local,
      git-ignored state that was failing `format:check` on local churn.
- [x] **Candy UI, pass 1b — high-fidelity button/panel rendering** (Aug 30,
      2026). The first pass's flat two-tone button read as cheap, so
      `theme.ts`'s paint functions were rewritten for real depth. Each
      button is now a four-layer sandwich: an oversized dark shape filled
      _behind_ everything as the outline (filling one union shape avoids the
      seam that stroking each layer separately leaves), a darkened and
      desaturated platform, the vibrant face lifted `BUTTON_DEPTH` px off
      it, and a 2px bright interior stroke. Gloss is stacked translucent
      white capsules of decreasing width — Phaser Graphics has no gradient
      fill — plus a specular dot in the upper-left curve. All tones derive
      from one base color through new pure `shadeColor()`/`desaturateColor()`
      helpers rather than being hand-picked, so restyling is a one-constant
      change. Added `squashButton()`/`popButton()` (scaleX 1.05 / scaleY
      0.95, `Expo.easeOut`) and wired both the title button and the HUD
      action button to them; `Hud`'s button Graphics moved to the button's
      own center with shapes drawn in local coordinates so scale tweens
      pivot correctly, and it tweens text + background together so the label
      can't slide off its face. `theme.ts`'s Phaser import is now type-only,
      which is what lets the new `theme.test.ts` (11 cases over the two
      color helpers) run under plain Vitest. Tuned by screenshotting the
      real render three times: the first attempt's gloss alphas summed to
      near-white, and the outline was thick enough to swallow the platform
      and flatten the button back out.

- [x] **Candy UI, pass 2 — rounded, beveled gameplay sprites** (Aug 30,
      2026). Bricks, paddle, balls, and power-up drops were all the same 1x1
      `pixel` texture stretched to a hard-edged rectangle. New
      `src/ui/textures.ts` generates rounded, beveled textures at runtime
      with `Graphics.generateTexture()` — a tile (bricks), a full pill
      (paddle), and an orb (balls, power-up drops). Each bakes the same
      outline → platform → face → gloss layering as `theme.ts`'s buttons, so
      a brick and a button read as the same material at different scales.
      **Drawn in grayscale on purpose:** every caller already colors these
      via `setTint()`, which multiplies, so one generated tile serves the
      whole brick palette with its highlight and shadow landing correctly
      under any tint — no per-color texture, and not one call site's tint
      logic had to change. Generated at 3x and scaled down, since a rounded
      corner rasterized at 1x on a 24px brick is visibly jagged. Palette
      warmed to suit the violet ground (`BRICK_TINT_NORMAL` slate →
      periwinkle, `PADDLE_TINT` gray → pale lavender). Verified by
      screenshotting the real grid, paddle, ball, and falling drops.
- [x] **Fixed a flaky test: core-loop's "running out of lives"** (Aug 30,
      2026). Failed twice at 8 workers (`state` still `"playing"`) while
      passing at `--workers=1`. Not a regression — it waited a fixed 600ms
      of wall-clock for a rAF-driven ball to fall, and rAF is throttled hard
      when workers compete for the machine, so less simulated time passes
      than the sleep assumes. Same root cause as the Wide Paddle timer
      assertion removed earlier. Fixed properly rather than by raising the
      sleep: new `waitForGameState()` helper in `gameHooks.ts` polls for the
      state the scene actually reaches. Two consecutive clean 8-worker runs
      after. Worth reusing anywhere else a fixed timeout stands in for "the
      ball got there."
- [x] **Foresight now previews the serve, not just Catch & Aim** (Aug 30,
      2026). Reported live: "when I collect foresight I don't see anything."
      Confirmed by reading the code rather than guessing — `drawForesight()`
      bailed unless a ball was stuck, and only Catch & Aim sticks one, so
      catching Foresight alone drew nothing _ever_. With 6s and 5s timers
      the two boosters had to be caught within seconds of each other for it
      to render at all, so in practice it read as broken. Now it draws at
      both of the game's aiming moments — the serve and a held ball — and
      still deliberately not for a ball in flight, since it previews a shot
      the player is _about to choose_. Needed a second entry point in
      `update()`, which returns early during SERVING. New E2E test catches
      the regression by construction (it never applies Catch & Aim at all);
      the existing test was renamed to scope it to the in-play case.
- [x] **Candy UI, pass 3 — juice** (Aug 30, 2026). New `src/ui/juice.ts`:
      particle burst in the destroyed brick's own tint, paddle squash on
      ball contact, expanding ring on power-up catch, camera shake on life
      lost (reserved for that alone, so it stays meaningful). Every effect
      is fire-and-forget and touches no physics or game state, so callers
      can drop one into a collision handler without changing what it does —
      if an effect ever needs awaiting or cancelling, it doesn't belong
      there. `paddleSquash()` tweens displayWidth/Height rather than scale
      on purpose: paddle width is owned by `BoosterController` (Wide/Narrow
      Paddle) and a scale tween would fight it, with whichever wrote last
      winning.

- [x] **Responsive canvas — fixed the letterbox and the visible "walls"**
      (Aug 30, 2026). Reported live from real screenshots: on an iPhone-sized
      viewport the game left 223px of dead space (a fixed 480x800 canvas FIT
      into a 440x956 viewport scales to 440x733), and on desktop the play
      field's boundary was plainly visible as a rectangle. Fixed by deriving
      the canvas height from the viewport's aspect at boot — new pure
      `gameHeightForViewport()` in `gameplayMath.ts`, clamped to the band
      where this layout still works (760-1100), unit-tested including the
      degenerate 0x0 case. `PADDLE_Y` and `BALL_SERVE_Y` stopped being
      constants and are now derived from the live canvas height in
      `create()` (`PADDLE_BOTTOM_MARGIN`/`BALL_SERVE_OFFSET_Y` replace them).
      The canvas now fills a 440x956 viewport exactly, top offset 0. The
      visible boundary was the backdrop's vignette darkening the canvas edge
      against a flat page background: weakened the vignette and gave
      `index.html` the same gradient, so the two blend at the seam.
- [x] **Grid density and backdrop** (Aug 30, 2026). Tiles read as small and
      far apart — partly real gaps, partly the baked outline eating each
      brick's visible face. Gap 6→5 but bricks 52x24→54x32 and the texture's
      baked outline thinned (2→1.5 subpixels), so the colored faces grew
      while the space between them shrank; grid now fills the width
      edge-to-edge. Added a real gradient backdrop with a soft vignette —
      `textures.createCanvas()` exposes a 2D context, so `createLinearGradient`
      genuinely works there, unlike Graphics (this is the one place in the
      codebase that isn't faking a gradient with stacked translucent shapes).
- [x] **E2E tests stopped hardcoding layout coordinates** (Aug 30, 2026).
      Ten call sites clicked a literal `(240, 460)` for Play and set
      `primaryBall.y = 715` for "just above the paddle" — all silently tied
      to the old fixed 480x800 layout, and all would have drifted off-target
      the moment the canvas became viewport-dependent. Replaced with
      `clickPlay()`/`tapToServe()` helpers that read the live canvas, and
      paddle-relative ball placement (`s.paddle.y - 5`). The layout can now
      change without touching a single test.

- [x] **Tough bricks: shade replaces the number, and they scatter** (Aug 30,
      2026). Every brick was the same light blue with a digit printed inside
      the multi-hit ones. Now a brick's hit count _is_ its shade — darker
      means more hits left, and each hit re-tints it one step lighter, so a
      3-hit brick visibly becomes a 2-hit brick and then an ordinary one.
      No number to read. Shades live in `BRICK_TINTS_BY_HITS`, indexed by
      hits-remaining minus one, with `MAX_BRICK_HITS` derived from its
      length — supporting a 4-hit brick is adding one hex value.
      `TOUGH_BRICK_ROWS`/`TOUGH_BRICK_HITS`/`TOUGH_BRICK_LABEL_COLOR` and the
      label GameObject are all gone. Tough bricks also stopped being "the top
      row": `LevelDef` gained a `toughBricks: {row, col, hits}[]` list,
      hand-placed and scattered through all six levels (7 per level, mixing
      2- and 3-hit). `validateLevels()` now claims tough cells first, so a
      star/hazard landing on one is caught as a cell collision — preserving
      the §3 rule that a star/hazard never needs two hits to trigger, which
      the old "row 0 is reserved" check enforced positionally. New unit
      coverage for out-of-range hit counts, out-of-grid placement,
      star-on-tough collision, and every shipped level's tough bricks; the
      E2E test was rewritten to assert the _tint actually changes per hit_
      and that a fully-worn brick matches an ordinary brick's tint exactly —
      the shade is the only feedback now, so asserting the data value alone
      would miss the whole point.

- [x] **Candy UI, pass 4 — typography and a real arena** (Aug 30, 2026).
      Prompted by "I still don't like the look-n-feel — should we use a
      dedicated framework?" The answer was no, and the diagnosis was
      specific rather than general: every text object was rendering in
      Phaser's default **monospace** fallback, which is the loudest possible
      "programmer prototype" signal and has nothing to do with the engine.
      Loaded Fredoka (rounded display face) via Google Fonts, with
      `document.fonts.load()`/`.ready` awaited before `new Phaser.Game()` —
      Phaser measures and caches Text metrics at creation and never reflows,
      so booting first would have locked in the fallback layout. Guarded so
      a blocked/offline font never prevents the game from starting.
      Second fix: the bricks floated in undefined space. Added a **playfield
      arena** — `physics.world.setBounds()` inset to `ARENA_MARGIN_X`/
      `ARENA_TOP` with a frame drawn on exactly those bounds, so the walls
      the player sees are the walls the ball bounces off. Drawn with left,
      top and right rails only: the bottom is where the ball is lost, and a
      rail across it would promise a floor the bounds deliberately don't
      have. `BRICK_WIDTH` 54→51 so the grid fits inside the rails.
      Third: the HUD was one box in a corner with an empty half beside it —
      now a top bar with the lives pill left, level pill right, and active
      boosters centered beneath.
- [x] **Fixed a test that hardcoded the old grid position** (Aug 30, 2026).
      Level 5's Burning Ball test started the ball at a literal `y = 145`,
      which after the grid moved sat close enough to the new arena's top
      rail that the ball bounced off it — reversing velocity and failing an
      assertion that it never reverses. A real consequence of the arena
      change, caught by the suite. Now derives the start point from the
      column's own lowest brick, so it stays clear of the rail whatever the
      grid does. Third instance of the same root cause (see the `(240, 460)`
      cleanup above) — layout literals in tests are a recurring trap here.

- [x] **Scoring** (Aug 30, 2026). Reported live: "I have no idea how many
      points I scored." Checked the design brief first rather than
      inventing: it had **no point-score spec at all**, and §5's 1★/2★/3★
      formula had been unimplementable since Aug 29 — both its criteria
      reference "bounces remaining", and the bounce budget was replaced by
      lives that day. The brief's own change note already listed this as
      unreconciled, so implementing scoring was the moment to close it.
      New `ScoreKeeper` (`src/gameplay/ScoreKeeper.ts`) — Phaser-free and
      owns no GameObjects, so the whole model is unit-tested (13 cases)
      without a browser. Model: 10 pts per brick × its hit cost × a combo
      multiplier that rises per brick destroyed **within one paddle-to-paddle
      trip** (capped ×5), plus 100 on level clear and 50 per life still in
      hand. The combo is the point: a flat per-brick score rewards grinding,
      which pulls against §2's planning-over-reflex hook, while scaling by
      what a single aimed shot achieves rewards exactly that. Score is
      run-wide like lives — carried via `PrototypeSceneData.carryScore` on
      "Next Level", reset on retry/"Play Again". HUD gained a live score
      pill in the top bar and a win/lose breakdown panel. Design brief §3
      gained a Scoring section; §5's star line is marked superseded and the
      change-note item struck through as resolved.
- [x] **Fixed another fixed-sleep flake** (Aug 30, 2026). Level 5's Burning
      Ball test slept a flat 400ms then sampled velocity once; it passed at
      `--workers=1` and failed at 8. Now samples once per `requestAnimationFrame`
      until bricks actually fall, which both tracks the real physics step
      under throttling and gives a stronger assertion — velocity must never
      go positive at _any_ frame, rather than merely being negative at the
      end. Fourth instance of wall-clock sleeps standing in for simulation
      progress; `waitForGameState()` and this rAF-sampling loop are the two
      shapes that actually work.

- [x] **Lives shown as ball icons, not a number** (Aug 30, 2026). "Lives: 5"
      replaced by a row of five ball icons in the top-left, using the ball's
      own texture and tint so the icons are unmistakably the thing you're
      about to lose. Icons vanish right-to-left (index i is visible only
      while `lives > i`), and a lost life pops and fades rather than simply
      disappearing. Reads at a glance and needs no reading at all for the
      youngest players (§7's all-ages positioning). The pill stays sized for
      the full row rather than shrinking with the count — a shrinking pill
      would make the whole bar jitter, and the empty slots are themselves
      the "how many you've lost" readout. `livesText` is gone; nothing
      outside `Hud` referenced it. E2E asserts the _positions_ of the
      surviving icons, not just how many are visible — "5 became 4" would
      pass even if the wrong icon disappeared.

- [x] **Booster countdown badges, catch bonus, and HUD polish** (Aug 31,
      2026). Three requests plus one question, from live play.
      (1) The HUD pills had a black halo outside their gold border — removed.
      A badge sits on a quiet background and doesn't need the outline a
      tappable button does; it just read as grime. `paintPillBackground` no
      longer draws the outer ring (buttons keep theirs).
      (2) Title tagline no longer says "calm": now "Aim your bounce. Break
      every brick." **Note:** §7/§8 of the design brief still use "calm" as
      the product positioning — only the on-screen tagline changed. Worth
      deciding whether the positioning language should follow.
      (3) Answering "does catching a booster score?" — it did not.
      `handlePowerUpCatch` applied the effect and never touched the scorer,
      so a real intercept across the arena was worth nothing. Now +25
      (`SCORE_PER_BOOSTER_CAUGHT`), deliberately _not_ extending the combo:
      a catch isn't a bounce, and letting it hold a multiplier alive would
      reward fishing for drops over clearing bricks.
      (4) Borrowed the reference games' countdown badges. `getStatusText()`
      (a bare label list) replaced by `getActiveBoosters()`, returning each
      live effect's type, label, tint and `remainingMs` from its own
      `TimerEvent.getRemaining()`. The HUD draws a colored dot + name +
      seconds per effect and ticks them from `update()`. It early-outs on a
      signature of types+rounded-seconds, so the labels only re-rasterize
      when a displayed second actually changes rather than 60×/second.
      Activeness is read from each effect's _state flag_, not from whether a
      timer object exists — a fired timer clears itself, so trusting the
      flag stays correct on the frame an effect ends.
      **Bug caught in review, not by a test:** `paintPillBackground` starts
      with `gfx.clear()`, so drawing four badges into one shared Graphics
      left only the last one visible. Split out `addPill()` (no clear) with
      `paintPillBackground` as the single-pill convenience over it.

- [x] **Win screen: a breakdown that actually adds up, and names the level**
      (Aug 31, 2026). Asked "what is the level clear 100 number for?" — and
      the real problem was bigger than the label. The panel listed only the
      two bonuses (+100, +250) beside a total of 2,455, leaving ~2,100
      points unexplained; it read as broken arithmetic, which is why the
      100 looked like it might be a level number. Root cause: score is
      run-wide and carries between levels, so a single running total can't
      distinguish "carried in" from "earned here". `ScoreKeeper` now retains
      `levelStartScore` and exposes `earnedThisLevel`, and
      `registerLevelClear()` returns a full breakdown
      (`carriedIn + earned + levelClear + livesBonus === total`) with a unit
      test asserting exactly that identity. The panel shows every row, with
      "Carried over" appearing only when non-zero, so the column visibly
      sums. Bonus rows are signed ("+100") and values right-aligned into a
      column. Also, the message names the level — "Level 2 clear!" rather
      than a generic "Congrats! Level clear!", since on a screen showing a
      running total "which level was that?" is a real question.
      `showScoreBreakdown()` now takes preformatted strings: the scene
      decides signs and emphasis, the HUD only lays out.

- [x] **Candy-UI material rebuild — gradients, filled rims, a green CTA**
      (Aug 31, 2026). "Buttons shading and lines look ugly, cheap and not
      polished looking. Why can't our colors and buttons look like these
      images", with two casual-puzzle reference screenshots.
      Four things were actually wrong, only one of which was color:
      (1) Every face was a flat fill. Molded plastic has a lit top and a
      shadowed underside; a single fill has neither, however correct the
      layers around it are. Added `fillVerticalGradient`.
      (2) The rim was a 2px line stroked 3px _inside_ the fill, so a band of
      face color sat outside the gold — the edges read as misprinted. Rims
      are now filled frames across the whole footprint with the face inset
      on top (`paintCandyFrame`).
      (3) `COLOR_PANEL_VIOLET` (0x3d2470) was one shade off
      `BACKGROUND_COLOR` (0x2a1454), so every badge sank into the ground it
      sat on. Both re-saturated; gold's dark end moved off brown, which was
      reading as dirt rather than as the shadowed side of gold.
      (4) Primary actions are green now. Gold is the chrome accent, so a
      gold button was the same material as the frame around it and stopped
      reading as pressable. `paintGlossyButtonBackground` takes a variant;
      `GlossyButton` passes it through.
      Also removed the specular dot `paintGloss` drew at a fixed fraction of
      the height: fine on a narrow pill, but on a button as wide as "Next
      Level" it landed in open field and read as a stray white speck — it is
      visible in the screenshot that prompted this.
      **The bug that cost the most time was not the one reported.** Two
      passes went into "the gloss is too strong" before the real fault
      turned out to be underneath it: stacked rounded rects cannot express a
      band shorter than the corner radius, so the gradient's light bands
      were square-cornered slabs overhanging the shape. Drawn as inset
      horizontal strips now — see coding-hygiene.md.
      Verified by screenshotting the real app (title, play, win) between
      each pass rather than by assertion; the paint functions emit draw
      calls whose real output is pixels.

- [x] **The game sat right of center on desktop** (Aug 31, 2026). Reported
      alongside the material rebuild. Two layout owners: `index.html`'s
      `#app` is a flex centering box, _and_ Phaser's scale config asked for
      `autoCenter: CENTER_BOTH`. Phaser's version sets a `margin-left` of
      half the gutter on the canvas element, and flexbox then centers the
      canvas _plus that margin_ — so the two compounded and pushed the game
      right by half a gutter again. Invisible on a phone, where FIT leaves
      no gutter to halve, which is why it survived this long. Phaser now
      uses `NO_CENTER` and CSS owns centering alone.

- [x] **Thinner paddle, and drops that fall at the ball's speed** (Aug 31,
      2026). "Can we make paddle skinnier? Speed of boosters as fast as the
      speed of bouncing ball?"
      "Skinnier" was ambiguous between the two dimensions and they are not
      the same change — narrower is a difficulty change, thinner is
      cosmetic. Asked; the answer was thinner. `PADDLE_HEIGHT` 14 → 10,
      which is purely visual: `BALL_SERVE_OFFSET_Y` derives from it, the
      paddle texture's corner radius is `padH / 2` so it stays a stadium,
      and the Arcade body follows `setDisplaySize` (verified in the running
      app — displayHeight 10, body height 10). The intercept width is
      untouched.
      `POWER_UP_DROP_SPEED` 130 → `BALL_SPEED` (420) — **and that overshot**,
      corrected in the entry below. See there for where it landed.

- [x] **Drops ride the challenge ramp instead of matching the ball flat**
      (Aug 31, 2026). "Boosters coming down same speed as ball — it is too
      fast, maybe we add this as a challenge on higher levels (as player
      proves they are good at the game with coordination)."
      Exactly the argument §3 already makes for the _ball's_ speed, so the
      drop now rides the same curve rather than a new one:
      `challengeRamp()` was extracted from `ballSpeedForLevel()` and
      `powerUpDropSpeedForLevel()` was added over it, with its own base
      (170, vs the ball's 420) and its own much steeper step (0.9 vs 0.15 —
      it starts at 40% of the ball and has only the challenge levels to
      close the gap in).
      **The step is steep enough to overtake the ball if left to run**,
      which would make a falling booster the fastest thing on screen — the
      exact opposite of the complaint that started this, and it would bite
      the moment a seventh level is added. Capped at the level's ball speed,
      with a unit test that runs the ramp out to level 40 to prove the cap
      holds rather than asserting only the levels that exist today.
      Measured in the running app across all six levels: 170 (40% of ball)
      on levels 1-4, 323 (67%) on level 5, 476 (87%) on level 6.

- [x] **Fast Ball, a denser booster set, and a persisted personal best**
      (Aug 31, 2026). "Lets introduce another booster can be making the ball
      go faster. Add more boosters to each level (multi-balls) and fire
      ball. The game is taking too long and is boring. Let's also add the
      scoring for personal-best."
      (1) **Fast Ball** (`×1.5`, 5s). Slow Ball and Fast Ball are the same
      effect at different multipliers, so they were merged onto one slot:
      `setBallSpeedEffect()` with a shared `speedTimer` and a `speedEffect`
      naming which is running. Catching either now _replaces_ the other —
      left stacking, they would land the ball at `0.6 × 1.5 = 0.9` of base,
      a speed neither booster advertises, reachable only by catching both.
      `getActiveBoosters()` had to stop inferring the badge from
      `speed !== 1`, which can't say which of the two is on.
      **A quieter bug in the same change:** `spawnExtraBalls()` clamps a new
      ball's speed to `[base × SLOW_BALL_MULTIPLIER, base]` — so a ball
      spawned during Fast Ball was instantly clamped back down to base. The
      upper bound is `base × FAST_BALL_MULTIPLIER` now.
      (2) **12 star bricks per level**, up from 8, all four additions being
      pace boosters (second Double Ball, Extra Ball, Burning Ball, Fast
      Ball). The `levelData` test asserting "exactly one Double Ball per
      level" encoded the old rule and was rewritten to the new one: every
      level carries the whole pace set, Triple Ball stays capped at one, and
      every level has at least four ball spawners.
      (3) **Personal best**, `localStorage`, one namespaced key. Every
      failure mode collapses to 0 rather than propagating — reading
      `localStorage` _throws_ (not returns null) in Safari private mode, and
      the stored string is player-editable, so corrupt/negative/infinite
      values are "no best yet". A refused _write_ still reports `isNewBest`:
      the run really was the best one, and the screen shouldn't contradict
      that because the browser won't remember it.
      **Design call made mid-implementation:** the first version announced a
      new best on the win screen, which broke a core-loop test — correctly.
      With no stored best every early clear is a record, so it would have
      said "new best" almost every time, and it displaced the level name
      that was added because "which level was that?" is a real question. A
      personal best is a property of a _run_, so it is banked silently on
      each level clear and announced only where a run ends.
      **Not addressed, and it is half the complaint:** the brick count. A
      level is still up to 56 bricks plus tough-brick hits. If it still
      drags, the grid is the next lever — see the design brief.

- [x] **Extra Life, Mystery, brick-face symbols, and "Start Over"**
      (Aug 31, 2026). "Let's add another powerup - catching a extra life
      showing a star inside block? another unknown powerup that shows a
      question-mark in the block. On level 6 I lost last life: it showed
      button Tap to retry. But it is really a game over, no retrying the
      level, they have to start over from level 1."
      (1) **Extra Life** — the only booster that touches a run-wide
      resource, so it is the only one that can't live inside
      `BoosterController` (which owns the ball and the paddle, not lives).
      Routed back out through an `onExtraLife` dep so `apply()` stays the
      single funnel for "a booster was caught". Capped at `MAX_LIVES`
      because the HUD draws exactly that many icons — a sixth life would be
      invisible, and an invisible reward reads as a broken booster. Still
      pays the catch bonus at full lives, so it is never a punishment.
      (2) **Mystery** — resolves at _catch_ time, not spawn, so what falls
      is genuinely unknown. `MYSTERY_OUTCOMES` is boosters only: §3's "a
      star brick is always good" has zero exceptions, and a "?" that could
      freeze the paddle would break the one guarantee the star/hazard split
      exists to protect. The roll is injected (`random` dep) purely so a
      test can assert _which_ booster came out rather than only that
      something did, and it is clamped — a `random()` returning exactly 1
      would index past the table and apply `undefined`, silently doing
      nothing on a catch the player earned.
      (3) **Brick-face symbols** (`POWER_UP_GLYPHS`). The glyph is a
      separate Text object, since a tinted Image can't show one — so the
      brick holds a reference and `handleBrickHit` destroys the pair
      together. A glyph left behind would float over an empty cell for the
      rest of the level; there is an E2E test for exactly that.
      (4) **"Tap to retry" → "Start Over"**, and "Out of lives" → "Game
      over". The label was wrong, not just terse: lives are run-wide, so
      running out ends the run and the button always restarts from level 1.
      A player who lost on level 6 reasonably read "retry" as another go at
      level 6.
      **Caught by a cast, not by the compiler:** `BoosterController.test`'s
      fake deps are `as unknown as BoosterControllerDeps`, so adding a
      required `onExtraLife` did not fail typecheck — the fake would just
      have thrown at runtime on the first Extra Life. The cast is what let a
      required dependency go missing silently.

- [x] **Extra Life restricted to every 5th level** (Aug 31, 2026). "Make
      sure not every level gets extra life. Starting level 5 they will get
      it on certain levels, level 10, level 15, level 20 — let's document
      that (x5 — every 5th level)."
      `EXTRA_LIFE_LEVEL_INTERVAL = 5` plus `levelGrantsExtraLife()` in
      `gameplayMath`, so the 0-indexed/1-indexed off-by-one lives in exactly
      one place — the promise to the player is "levels 5, 10, 15, 20", and
      the code indexes from 0. Data updated: only Burn Through (level 5)
      keeps its Extra Life.
      **Enforced in `validateLevels()`, in both directions**, rather than
      left to the level data being written correctly. A stray Extra Life on
      level 2 quietly erases the lives constraint; a _missing_ one on level
      10 quietly makes the run harder than designed. Neither is visible by
      reading the data, and the existing `validateLevels(LEVELS)` test now
      fails on either.
      **The rule had a back door I closed at the same time:** Mystery's
      outcome table included `extra-life`, so a "?" on level 2 could hand
      one out — roughly 1 in 11 catches, rare but enough to make the
      documented rule untrue. Removed. This is a judgment call on the
      user's intent rather than something they asked for directly, and it is
      a one-line revert if Mystery should be a jackpot instead.
      `levelGrantsExtraLife` treats a non-positive interval as "never", not
      "always": `n % 0` is NaN, which compares false, so the modulo alone
      would turn the rule off by accident rather than by decision.
      The E2E tests written for Extra Life all assumed level 1 and had to
      move to level 5 via the real Next Level flow — which is a better test
      than they were, since it now also proves the rule survives into the
      built grid rather than only living in the level data.

- [x] **Nothing carries across a level boundary except lives and score**
      (Aug 31, 2026). "Let's not carry over to next level extra balls. It
      resets to single ball. Same with other boosters. Let's not carry them
      over."
      Boosters and hazards already didn't — they became real-time timers on
      Aug 30, and real-time timers don't survive `scene.restart()`, so that
      half of the request was already true and is now just stated plainly in
      the docs rather than implied by a mechanism.
      Extra Ball's balls were the one remaining exception:
      `PrototypeSceneData.extraBallCount` snapshotted how many were in play
      at the win, and `create()` rebuilt them in the next level's serving
      formation. Deleted — the field, the rebuild loop, and the snapshot at
      the restart call.
      The old reasoning ("a ball in play isn't a timed effect") was true and
      the rule was still wrong: a level that opens with three balls is a
      level whose opening was decided by the previous one, which makes the
      same level a different level depending on what you caught thirty
      seconds earlier — impossible to tune, impossible to compare.
      The E2E test asserted the old behavior and was inverted rather than
      deleted, and strengthened while it was open: it now also checks the
      surviving ball has `serveOffsetX === 0` and sits on the paddle center,
      because a half-removed carry-over would leave a single ball still
      positioned in a formation built for two.

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
