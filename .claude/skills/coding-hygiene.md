# Bounce & Fit — Coding & Testing Hygiene

Practices actually in force in this repo, not aspirational boilerplate. If a
rule here doesn't match what the codebase does, fix the rule or fix the
codebase — don't let them drift apart.

---

## Type organization: colocate, don't centralize

No generic `types/` folder. Every type lives in the module that owns the
data or logic it describes:

- Used in exactly one file → keep it private to that file (`Collided` in
  `PrototypeScene.ts`; `PaddleWidthState` in `BoosterController.ts`).
- Used across several files → export it from whichever module is its
  natural domain owner, not a generic bucket. `LevelDef`, `BoosterType`,
  `HazardType`, `PowerUpType` live in `levelData.ts` because that's where
  `LEVELS` and `validateLevels()` live too — splitting the type away from
  the data/logic that gives it meaning would cost more than it saves.
  `GameState` moved from a `PrototypeScene.ts`-private union into
  `constants.ts` as `export const GAME_STATE = { SERVING: "serving", ... }
  as const` with the type derived from it (`(typeof GAME_STATE)[keyof
  typeof GAME_STATE]`) once the same string literals ("playing", "won", …)
  started appearing in test files too — a raw string in a Playwright
  assertion (`expect(state.state).toBe("playing")`) gets none of the
  literal-union's own typo protection, since it's compared against a
  `string`-typed field, not the union itself. Same colocation logic as
  above: it lives with the other scene-tuning constants because that's
  already where cross-file scene constants live, not because "constants
  belong in constants.ts" as a blanket rule.

Reconsider this only if a type is genuinely needed by multiple unrelated
domains with no sensible common owner — not preemptively, and not just
because "a types folder" is a familiar pattern elsewhere.

---

## Testing strategy

Two layers, not three:

- **Unit (Vitest, `npm run test:unit`):** no Phaser *at runtime* — importing
  the real `phaser` package crashes immediately under Vitest's default Node
  environment (`Device.OS` reads `window` at module-load time, before any
  API is even called), so anything under test must not execute a value
  import of it. `src/gameplayMath.ts` (bounce-angle math) and
  `src/levelData.ts` (`validateLevels()`, which encodes the design brief's
  own placement rules) need no Phaser at all. `BoosterController.ts` is a
  third case worth knowing about: it's dependency-injected (see
  "Structuring a Phaser Scene" below) so its *logic* has no real Phaser
  dependency either — it only used `Phaser` for type annotations plus two
  math calls (`Phaser.Math.Clamp`/`Phaser.Math.DegToRad`) that
  `gameplayMath.ts`'s `clamp()`/`degToRad()` already duplicate. Switching
  its import to `import type Phaser from "phaser"` (erased at compile time)
  and swapping those two calls for the pure helpers made it fully
  unit-testable with plain fake objects satisfying `BoosterControllerDeps`
  — see `BoosterController.test.ts` and the gotcha below. If a class
  genuinely needs to *call* Phaser at runtime (not just reference its
  types), it's not a unit-test candidate as written — don't force it by
  mocking the whole Phaser module.
- **E2E (Playwright, `npm run test:e2e`):** everything that's actually
  Scene/physics behavior. Drives real pointer input for what a player does
  (paddle movement, clicks, screen transitions) and uses a `window.__game`
  hook — gated behind `import.meta.env.DEV` in `main.ts`, confirmed stripped
  from production builds — to set up scenarios deterministically (a
  specific miss, a specific booster catch) instead of fighting ball physics
  through mouse timing for every case. `tests/e2e/levels.spec.ts` covers
  every level's specific booster/hazard one test at a time; every other
  spec file covers a cross-cutting mechanic (core loop, progression, raw
  collision physics).

**Assert the physical consequence, not the flag that's supposed to cause
it.** `ballsBig === true` or `ballCount === 2` reads as a passing test but
proves nothing about whether the booster actually *works* — the Extra Ball
bug (see "Known Phaser gotchas") shipped a second ball that never moved,
and a test checking only `ballCount` would never have caught it. Check the
thing a player would actually notice: a body's real width
(`paddle.body.width`, not just `displayWidth`), a ball's real velocity and
a position that's actually different a moment later, a paddle that
provably doesn't move under a real mouse event. `levels.spec.ts` is built
around this rule specifically.

**No separate integration layer.** This game has no backend, no API, no
database — the usual reason for an integration tier (verifying a module's
boundary against a real-ish collaborator without spinning up the whole
stack) doesn't apply. What would be "integration" here — a Scene's
collision handlers, its state machine, its collaboration with
BoosterController/Hud — is already covered by the E2E suite driving a real
browser. Revisit only if the Scene logic gets complex enough that testing
it without a browser becomes worth the cost of a headless Phaser/jsdom
harness (tracked in TASKS.md, not started).

### Run the full suite after every change — not just typecheck

`npm run test` runs typecheck → unit → e2e in sequence. Run it after every
source change, before considering the change done.

This isn't a formality: refactoring `PrototypeScene` into
`BoosterController`/`Hud` typechecked cleanly but shipped a real regression
— `scene.restart()` called with no arguments doesn't clear a previous
restart's data (see the Phaser gotcha below), which silently zeroed out
lives on retry. Only the E2E suite caught it. The type system has no way to
catch a stateful runtime gotcha like that.

### A passing suite isn't proof — check what your tests actually exercise

Most tests in this suite call scene methods directly (`s.handleBrickHit(s.primaryBall, brick)`)
rather than through a real Phaser collision, specifically so they're
deterministic and don't need to land a real ball bounce. That's the right
tradeoff for testing game *logic* — but it means the whole suite passed,
completely unchanged, across not one but *two* real physics bugs (see
"Known Phaser gotchas" below: the `physics.add.group()` defaults bug, and
the collider argument-order swap) before `tests/e2e/physics.spec.ts`
existed to catch them. Both times, the reason was the same: calling a
handler like `handleBrickHit`/`handlePaddleHit` directly never touches
Phaser's actual collider/physics pipeline, so a bug *in that pipeline* —
as opposed to a bug in what the handler itself does — is invisible to it.
When you fix a bug in how physics is wired up, ask whether the existing
tests could have caught it at all before trusting them to catch it again.

### Every bug fix: prove the test fails before you trust that it passes

For every bug fixed this session, the sequence was: reproduce the bug live,
write (or extend) a test for it, confirm that test **fails** against the
still-broken code, apply the fix, confirm the test now passes. Do this for
every bug fix — a test you never watched fail is not proof it would have
caught the bug, or would catch a regression of it later. Skipping straight
to "write a fix, write a test, both pass" leaves open the possibility that
the test would have passed against the broken code too (asserting the
wrong thing, or not actually exercising the buggy path) and you'd never know.

The reverse mistake is just as real: if a test fails against code you
believe is already correct, don't assume the fix didn't work — verify
*which one* is wrong. One of this session's regression tests failed after
a fix that had already been confirmed correct by hand; the fix was fine,
the test's own setup was the problem (it asserted every ball had real
velocity, but never actually launched the primary ball, so a legitimately
resting ball read as a failure). Found by re-checking the assertion against
what the code was actually doing, not by re-applying the "fix" a second time.

### Verify third-party behavior empirically — don't assume it

All three Phaser bugs found this session (see "Known Phaser gotchas" below)
came from an incorrect mental model of how a Phaser API behaves, not from
implementing the wrong thing relative to that model — `Group#add()` was
assumed to leave a body's existing config alone, and a collider's callback
was assumed to receive its arguments in registration order. Writing a test
*first* wouldn't have caught either one, because the test would have
encoded the same wrong assumption the code did — red-green-refactor only
surfaces a mismatch between a *correct* expectation and *incorrect* code,
and here the expectation itself was the thing that was wrong. What
actually would have caught them earlier: checking the library's real
behavior — a quick throwaway script, or five minutes in `node_modules`'s
source — before shipping code that depends on an assumption about it,
especially anywhere touching Phaser's Scene lifecycle, Groups, or collider
dispatch. That habit is the direct fix for this specific failure mode;
"write more tests" on its own is not, if the tests are written by the same
person with the same wrong model of the library.

---

## Structuring a Phaser Scene

A Scene subclass grows fast — paddle/ball/brick setup, collision routing,
booster state, HUD text, the win/lose state machine all start in `create()`
and `update()`. Split it before it becomes unreadable, not after:

- **Extract pure logic first.** Anything with no Phaser dependency at all
  (angle math, data validation) becomes its own module purely so it's
  unit-testable — that's the actual test, not "does it feel long."
- **Extract self-contained subsystems into their own class** once they have
  enough internal state and rules to reason about independently.
  `BoosterController` owns every booster/hazard's state, application,
  expiry timer, and reset so the Scene only has to know "apply this type"
  and "a life was lost" — not the mechanics of the whole catalog.
  Inject dependencies explicitly (paddle, balls group, a `createBall`
  factory, an `onChange` callback) rather than passing the whole Scene in.
- **Extract UI text into a small class** (`Hud`) once a Scene is composing
  more than a couple of `add.text()` calls inline in `create()`.
- **Shared visual style belongs in `src/ui/theme.ts`, not repeated per
  Scene.** Once two Scenes want the same button or badge, the styling moves
  there — as both a paint function (`paintPillBackground`,
  `paintGlossyButtonBackground`, taking a caller-owned `Graphics` plus a
  rect) and a self-contained component class (`PillBadge`, `GlossyButton`,
  owning their own Container). Offering both isn't redundancy: a caller
  that just wants a styled button uses the class, while a caller that must
  keep its own GameObjects for other reasons uses the paint function
  underneath. `Hud` is exactly that second case — its public
  `Phaser.GameObjects.Text` fields are read directly by `gameHooks.ts`'s
  E2E snapshots (`.text`, `.visible`, `.x`, `.y`), so it keeps plain Text
  objects and layers themed Graphics *behind* them rather than swapping in
  Containers and breaking every test that reads them. **A restyle should
  not change a test-visible interface** — when it looks like it must,
  reach for the paint function instead of the component class.
- **Depth in Phaser Graphics comes from stacking flat shapes, not from
  gradients — Graphics has no gradient fill.** A chunky "candy" button is
  four layers: an oversized dark shape behind everything (the outline), a
  darkened+desaturated platform, the vibrant face offset up off it, and a
  thin bright interior stroke. Gloss is several translucent white capsules
  of decreasing width stacked from the top, so their alphas accumulate into
  a fake vertical gradient. Two things learned by looking at the render
  rather than reasoning about it: overlapping gloss bands sum, so alphas
  that look reasonable individually (0.25/0.18/0.15) bleach the color to
  near-white; and the outline must stay *thinner* than the depth offset, or
  it merges with the platform and the button reads flat again.
- **Fill an oversized shape behind, don't stroke each layer.** Stroking the
  platform and the face separately leaves a seam where their silhouettes
  overlap. One enlarged filled shape drawn first traces their union
  cleanly, and it's one draw call instead of several.
- **Derive tones from one base color, don't hand-pick them.** `shadeColor()`
  and `desaturateColor()` in `theme.ts` are pure integer math with no Phaser
  dependency — which is both why restyling means changing one palette
  constant, and why they're the only part of that file worth unit-testing.
  The paint functions' real output is pixels; asserting their sequence of
  `fillRoundedRect()` calls would test the implementation, not the look, so
  those are checked by screenshotting a real browser instead.
- **`textures.createCanvas()` is the escape hatch when you genuinely need a
  gradient.** It hands back a real 2D context, so `createLinearGradient`/
  `createRadialGradient` work — unlike Graphics, which has no gradient fill.
  Generate once into a texture and stretch it; a vertical gradient has no
  horizontal detail, so 64px wide is plenty. Everything else in `ui/` fakes
  gradients with stacked translucent shapes because it's drawing *shapes*,
  not full-bleed backgrounds.
- **Layout constants that encode the canvas size are a trap once the canvas
  is responsive.** `PADDLE_Y = 720` and `BALL_SERVE_Y` were fine while the
  game was a fixed 480x800; the moment canvas height came from the viewport
  they were silently wrong. Derive positions from `this.scale.height` in
  `create()` and keep only the *relationship* as a constant
  (`PADDLE_BOTTOM_MARGIN`, `BALL_SERVE_OFFSET_Y`). Same rule applied to the
  E2E suite, which had ten hardcoded `(240, 460)` clicks — a test that
  encodes layout breaks on every layout change and teaches nothing when it
  does, so those became helpers that read the live canvas.
- **A paint helper that starts with `gfx.clear()` cannot be called in a
  loop.** `paintPillBackground` did, and drawing a row of booster badges
  into one shared Graphics left only the last one on screen — each call
  erased its predecessors. Split into `addPill()` (draws) and
  `paintPillBackground()` (clears, then draws one). When a helper both
  resets and draws, the reset is the part that stops composing; keep them
  separable from the start.
- **Two centering owners compound; they do not agree.** `#app` centered the
  canvas with flexbox while Phaser's scale config asked for
  `autoCenter: CENTER_BOTH`. Phaser centers by setting a `margin-left` on
  the canvas, and flexbox then centers the canvas *plus its margin*, so the
  game sat half a gutter right of center on desktop and looked fine on a
  phone (FIT leaves no gutter there to halve). When a framework and the page
  both offer to do a layout job, pick one and say so where the other one
  would have been configured.
- **A gradient cannot be faked with stacked rounded rects.** The obvious
  way to fake a vertical gradient in Phaser Graphics (no gradient fill) is
  to stack rounded rects of decreasing height. It does not work: a band
  shorter than the corner radius has no rounded-rect form that stays inside
  the silhouette, so the light bands at the top of a face came out
  square-cornered and overhung the shape — and on a pill, where the radius
  is half the height, *every* band is shorter than the radius. Draw
  horizontal strips inset to follow the corner curve instead, over one exact
  rounded-rect fill in a mid tone so the shape keeps its antialiased edge.
  The tell was visible in a screenshot long before it was understood; two
  tuning passes went into "the gloss is too strong" before the actual bug
  turned out to be the geometry underneath it.
- **A rim has to be a filled frame, not a stroked line.** Strokes center on
  the path, so half the width falls outside the shape and reads as a
  hairline. Worse, the version here stroked *inside* the fill, leaving a
  band of face color outside the gold border — the "why do the lines look
  cheap" complaint was that, not the color. Fill the rim across the whole
  footprint and inset the face on top of it.
- **A per-frame HUD update needs a change guard, not just cheap drawing.**
  The booster countdowns tick from `update()`, but `Text.setText()`
  re-rasterizes the label's texture — doing that 60×/second to render the
  same string is pure waste. Compare a signature of what's actually
  *displayed* (here: types plus whole seconds) and bail when it matches.
- **A Graphics background sized from its label's own text metrics beats a
  hand-measured rectangle.** `label.width`/`label.height` after `setText()`
  are the real rendered bounds, so a badge that redraws from them stays
  correct when the text changes length (booster status lines, level names
  of different lengths) with no per-call magic numbers. The cost is that
  every setter has to trigger the redraw — miss one and the background
  silently keeps the previous string's width.
- **Constants:** every tuning number, scene/texture key, and gray-box color
  lives in `src/constants.ts` — not because "constants files are good
  practice" in the abstract, but because these specific values (durations,
  multipliers, hit-counts) are exactly what a playtest session tends to
  want tweaked, and they were previously buried mid-class. Domain-specific
  lookup tables indexed by a type (`POWER_UP_TINTS` by `PowerUpType`) stay
  with that type instead of migrating to the generic constants file — same
  colocation reasoning as the type-organization rule above.
- Reconstruct any extracted class fresh inside `create()`, not in the
  constructor — Phaser destroys and recreates a Scene's GameObjects on
  every `scene.restart()`, so a class holding references to `paddle`/`balls`
  from a *previous* `create()` call would go stale.
- **Carrying state across a `scene.restart()` is a snapshot-and-restore
  problem, not a "keep the old instance" problem.** The instance holding
  the state to carry (a booster, an extra ball) is about to be thrown away
  along with everything else `create()` rebuilds — there's no way to keep
  it alive across the restart, only to read what it holds *before*
  `restart()` is called, pass that as scene-restart data, and apply it onto
  the fresh instance `create()` constructs. `PrototypeSceneData`'s
  `carryLives`/`extraBallCount` are the surviving example: captured in the
  "Next Level" click handler (still reading the *old*, still-valid
  instance), read back at the top of the next `create()`. A richer
  `BoosterController.getCarrySnapshot()`/`applySnapshot()` pair used to
  carry booster state the same way and was deleted once every booster
  became a real-time timer — which is the more useful lesson: **a
  restart-carry mechanism is only worth its weight while something
  genuinely needs to survive the restart.** Real-time `delayedCall` timers
  can't survive one by construction, so once every timed effect became one,
  the whole snapshot layer had nothing left to carry and became dead
  machinery. Check what actually needs to cross the boundary before
  building the bridge, and delete the bridge when the answer changes.
- **Generalizing "the one ball" to "however many balls happen to be in
  play" means finding every place code assumed there's exactly one**, not
  just the constructor. `primaryBall` positioning (`movePaddle()`'s
  serving-follow) and launch (`launchBall()`) both silently assumed a
  single ball until Extra Ball carrying across levels required more than
  one ball to sit in serving formation together — generalized by giving
  each ball an explicit `serveOffsetX` data value and having both methods
  iterate `balls.getChildren()` instead of touching `primaryBall` directly.
  The easy-to-miss third spot: `reserveBall()` (the single-surviving-ball
  path after a miss) needs the same generalized repositioning call, not
  just a direct `setPosition(paddle.x, ...)`, because a ball that
  previously belonged to a multi-ball serving formation still carries a
  stale nonzero `serveOffsetX` — skipping this reset would pull that one
  surviving ball away from paddle center on the very next pointer move.

---

## Playwright practices for a canvas game

Most locator-based advice ("prefer `getByRole`/`getByTestId` over CSS
selectors") doesn't apply here — the game renders to a single `<canvas>`
with no accessible DOM tree inside it. Instead:

- Convert a game-space coordinate to a CSS click point via the canvas's
  *actual rendered* bounding box, not raw pixels — Phaser's `Scale.FIT`
  mode means the two differ. See `tests/e2e/gameHooks.ts#clickCanvasAt`.
- Use the `window.__game` dev hook to read real scene state for assertions
  and to set up scenarios a mouse can't reliably reproduce (forcing a
  specific miss, checking a booster's internal counter) — but still drive
  paddle movement, clicks, and screen transitions through real pointer
  input, since that's what the test is actually meant to verify.
- Wait on real state changes (`page.waitForFunction`, polling a scene
  snapshot) over hardcoded `waitForTimeout` where practical; a short fixed
  wait is acceptable after a physics-driven action where there's no cheap
  event to await, but don't reach for it as the default.
- Each `test()` starts fresh via `page.goto("/")` — no test depends on
  another's leftover state or execution order.

Not applicable to this project (no network layer, no backend): API mocking,
`page.route()` interception, response-based waits. Revisit if/when
analytics or cloud save (design brief §6b) add a real network boundary.

**A `Phaser.GameObjects.Graphics` object's draw calls are observable via
its own `commandBuffer` array** (`graphics.commandBuffer.length`), even
though nothing in Phaser's public docs advertises it — confirmed empirically
with a throwaway script before relying on it (see "Verify third-party
behavior empirically" below), the same way the `physics.add.group()` and
collider-argument-order gotchas were confirmed by reading source rather
than assumed. Used by `gameplay-expansion.spec.ts`'s Foresight test to
prove the aim-preview line actually gets drawn (and cleared) rather than
just asserting the `foresightActive`/`stuck` flags in isolation — the same
"physical consequence, not the flag" principle as the rest of this suite,
just applied to a visual effect instead of a body property.

**A bulk "destroy everything in this level" test helper needs to account
for multi-hit (tough) bricks and for levels with several star/hazard
bricks, not just plain ones.** `winCurrentLevel()` in `gameHooks.ts` (and a
since-deleted `destroyOneNormalBrick()` sibling) originally assumed one
`handleBrickHit()` call destroys exactly one brick — true before tough
bricks (top row, 2 hits) existed and before levels carried more than one
star brick. Once levels got denser (§5's "unlock everything from level 1"),
a single-pass "hit every brick once" loop left tough bricks half-destroyed,
so a level never actually finished. Fixed by making the bulk helper repeat
passes until nothing destroyable remains (bounded to a few iterations,
since `TOUGH_BRICK_HITS` is small and finite) instead of a single sweep.

That helper's *other* original hazard is now gone rather than fixed, which
is worth recording as a shape: while boosters decayed by bricks destroyed,
any test helper that destroyed bricks was silently also a booster-decay
call, so "destroy all but one brick" setups had to be precise about exactly
which bricks they touched. Converting every booster to a real-time timer
removed that coupling entirely — bulk brick destruction no longer perturbs
booster state at all. **When a test helper needs surgical precision about
side effects, check whether the coupling itself is the thing to remove.**

**A `page.evaluate()` callback can't close over a Node-side import.**
Playwright serializes the callback's source and re-evaluates it inside the
page, so a free variable referencing something only imported on the Node
side (e.g. the `GAME_STATE` constant from `src/constants.ts`) resolves to
nothing in the browser. This is why `GAME_STATE.PLAYING` is used in this
file's own Node-side assertions (`expect(state.state).toBe(GAME_STATE.PLAYING)`)
but the handful of `s.state = "playing"` lines *inside* `page.evaluate()`
blocks (test setup, not assertions) are left as raw literals rather than
routed through a new `window.__GAME_STATE` global — the only place that
would actually need it. Not worth the extra dev-only global for a value
that, if mistyped, produces a loud, immediate downstream test failure
rather than a silent one.

---

## Known Phaser gotchas worth remembering

Found the hard way this session — recorded here so they don't get
rediscovered:

- **`physics.add.group()` silently overwrites a body's physics config on
  *every* `.add()` call, unless the group itself is configured — and this
  bit the codebase twice, in two different call sites, because the first
  fix only covered one of them.** `Group#createCallbackHandler` runs on
  every `group.add()`, not just `group.create()`, and unconditionally
  re-applies `this.defaults` (derived from the group's config, defaulting to
  Phaser's stock values — `collideWorldBounds: false`, `bounce: 0`,
  `velocityX`/`velocityY: 0`, and about 20 others — for anything the config
  doesn't override) to the body, discarding whatever was already set on it.
  - First occurrence: a ball built by `createBallSprite()` had
    `collideWorldBounds`/`bounce` set correctly, but `this.balls.add(ball)`
    reset both. Symptom: the ball stopped bouncing off a brick (velocity
    went to 0 instead of reversing) and stopped bouncing off the world
    edges entirely. Fixed by passing the real config to the group itself:
    `physics.add.group({ collideWorldBounds: true, bounceX: 1, bounceY: 1 })`.
  - Second occurrence, found *after* that fix shipped: `spawnExtraBall()`
    called `extraBody.setVelocity(...)` and *then* `this.deps.balls.add(extra)`
    — the group's velocity default (still 0, since the group config above
    never touched it) reset the just-set velocity right back to zero.
    Symptom: catching Extra Ball spawned a second ball that just sat there
    while the original kept playing. The first fix didn't generalize the
    lesson — it patched the group's config, not the actual rule, which is:
  - **The rule that actually matters: any per-body setup on something
    headed into a `physics.add.group()` — velocity, size, tint, anything —
    must happen *after* `.add()`, never before, unless it's also baked into
    the group's own config.** `.add()` is the reset point, not the
    creation call. When adding a new call site that creates-then-configures
    a group member, check this before assuming "it already works because
    the group is configured now" — the group being configured only covers
    the keys you put in its config object, not everything you might set on
    a member afterward.
- **A collider/overlap between a Group and a single GameObject does not
  guarantee the callback's argument order matches how you registered
  them.** `physics.add.collider(this.balls, this.paddle, cb)` (group first,
  single object second) fires `cb` as `(paddle, ball)`, not `(ball, paddle)`
  — Phaser's dispatcher (`World#collideHandler`) normalizes every
  group-vs-single-object pair to `(theSingleObject, theGroupMember)`
  internally whenever the group is the one passed first, confirmed straight
  from `World.js`: `object1.isParent && object2.body` routes through
  `collideSpriteVsGroup(object2, object1, ...)` — object1/object2 swapped —
  and `collideSpriteVsGroup` always invokes the callback as
  `(bodyA.gameObject, bodyB.gameObject)` where `bodyA` is the single
  object. (Register the single object *first* instead — `collider(this.paddle, this.balls, cb)`
  — and no swap happens, since it's already in the normalized order; that's
  why the `paddle`-vs-`powerUps` overlap in this file never had this bug.)
  Getting this backwards doesn't error or warn — it silently calls your
  handler with the two objects swapped. Symptom: a paddle-hit handler that
  reads `ball.x` and writes `ball.body.setVelocity(...)` was actually
  reading and writing the *paddle*'s x and body — the paddle flew off the
  top of the screen at the ball's speed, while the real ball kept whatever
  velocity it already had (and its return angle was always straight up,
  since `paddle.x - paddle.x` is always 0). Don't trust registration order
  to predict callback argument order for a group/single-object pair —
  verify against real Phaser behavior (or register the single object first)
  rather than assuming.
- **`scene.restart(data)` doesn't clear stale data when called without
  arguments.** `Systems#start` only does `if (data) settings.data = data`
  — an omitted argument silently *reuses* whatever a previous `restart()`
  call passed. Always pass an explicit data object on every restart call
  site; never rely on "omitting it resets to undefined."
- **`Arcade.Body#setSize()` with an already-scaled `displayWidth` blows up
  the collision box.** Bodies auto-resize every physics step from the
  sprite's actual scale (`Body#updateBounds`); calling `setSize()` on top
  of that double/triple-multiplies the tracked scale. Only ever call
  `setDisplaySize()` on the GameObject and let the body auto-sync.
- **`Body#checkWorldBounds()` reads `world.checkCollision`, not
  `body.checkCollision`.** The per-body flag only gates body-vs-body/tile
  collider resolution. To open one edge of the world bounds (letting a
  missed ball actually fall off-screen instead of bouncing off it like a
  wall), use `physics.world.setBoundsCollision(...)` on the World, not a
  flag on the Body.
- **`import Phaser from "phaser"` crashes outside a browser, even if
  nothing Phaser is ever called.** Confirmed by writing the smallest
  possible reproduction (`const Phaser = (await import("phaser")).default;`
  with no further calls) and running it under Vitest's default Node
  environment: `ReferenceError: window is not defined` at
  `phaser/src/device/OS.js`, triggered by device-detection code that runs
  at module-load time, not by any API call. This is why `BoosterController`
  couldn't be unit tested until its `Phaser` import became type-only (see
  "Testing strategy" above) — a class doesn't need a jsdom/happy-dom
  dependency just to be unit-testable if its only real dependency on Phaser
  is types plus a couple of math calls with pure equivalents already
  available. If a future class genuinely needs to *execute* Phaser code
  outside a browser context, that's the point to actually reach for a
  DOM-emulating test environment — don't reach for it preemptively.
- **A booster's own duration can run out mid-effect once the level geometry
  changes underneath it, and that's a real mechanic surfacing, not a bug.**
  Burning Ball's budget (then 5 bricks, now a 5-second timer) was always
  enough to pierce a full vertical brick column back when `BRICK_ROWS` was
  4. Once the grid grew to 7 rows, a ball piercing a full column can
  exhaust that budget partway through, at which point `burningActive` flips
  false mid-flight and the *next* brick in its path gets hit through the
  normal collider (a real bounce) instead of the overlap (a pierce) —
  confirmed by tracing `y`/`velocity`/`burningActive` together
  frame-by-frame rather than guessing from the end state alone (see "Every
  bug fix: prove the test fails" above — same discipline applies to
  confirming something is *not* a bug). The fix was in the test (start the
  ball closer, so it only needs to cross bricks within budget), not the
  code. The conversion to real-time timers changed *which* budget runs out,
  not this hazard: a longer traversal still risks outliving the effect.
- **An uncaught exception inside a collider/overlap callback halts the
  entire game, not just that one interaction — Phaser's core loop doesn't
  wrap each callback in its own try/catch.** Reported live as "the whole
  game froze — paddle, ball, boosters, everything" after catching an Extra
  Ball-family power-up. Confirmed by attaching a `page.on("pageerror", ...)`
  listener during a real reproduction: the exception's stack trace ran
  straight through `World#collideObjects` → `Collider#update` →
  `World#update`, i.e. Phaser's own per-frame physics step — since nothing
  catches it there, it propagates out of that frame's `requestAnimationFrame`
  callback, and nothing in that call chain reschedules the next frame once
  the current one throws. Paddle input, ball motion, and every
  `scene.time.delayedCall` timer are all driven by that same loop, so all of
  them stop at once, exactly matching the reported symptom. The general
  lesson: any reference a collider callback dereferences (`.body`, a
  GameObject's data, etc.) needs to be verified live, not assumed — a stale
  reference to a *destroyed* GameObject doesn't fail loudly at the point it
  went stale, it fails later, inside Phaser's own dispatch, in a way that
  reads as "everything is broken" rather than "this one thing is null."
- **A class field that's meant to always reference a live, in-group member
  needs to be fixed up at every point that member could be destroyed, not
  just the one path you built it for.** `PrototypeScene.primaryBall` is read
  by `BoosterController.spawnExtraBalls()` (via `getPrimaryBall()`) to
  compute a newly-spawned ball's trajectory — it assumes `.body` is real.
  `reserveBall()` (the "every ball fell, genuine miss" path) already kept
  this invariant correctly by reassigning `primaryBall` to the survivor.
  `update()`'s *other* fallen-ball path — "some balls fell, others
  survived" — destroyed the fallen ones without checking whether
  `primaryBall` itself was among them, since that path was written for the
  general "extra ball lost" case and nobody re-examined it once
  `primaryBall` specifically could also be the one that falls (true from
  the moment Extra Ball existed, but only actually exercised once a second
  ball-family catch could follow a first ball's loss in real play). Fixed
  by checking group membership (`this.balls.getChildren().includes(...)`)
  after removal and reassigning to any survivor if it's gone — the same
  invariant-check idea as validating input at a boundary, just applied to
  "is this reference still live," not incoming data.
- **A value only re-read at the next event can silently do nothing at all
  if that event never happens before the value reverts.** Reported live as
  "Slow Ball didn't really slow" — `BoosterController.speed` was only ever
  consulted inside `launchBall()`/`handlePaddleHit()`, i.e. the *next* serve
  or paddle bounce, never applied to a ball already in flight. Once Slow
  Ball's duration shortened to a 3-second real-time timer (see the design
  brief's reconciliation record), a ball that was mid-flight toward the
  brick field when caught could easily never return to the paddle within
  that window — the whole effect could pass invisibly. Fixed by rescaling
  every ball currently in flight immediately, on both apply and revert
  (`BoosterController.rescaleBallSpeeds()`), instead of leaving the change
  latent until some future event. Worth checking for on any future
  "instant" effect: does the code path that changes the *state* also touch
  whatever's already in motion, or only whatever happens next?

---

## Linting & formatting

ESLint (flat config, `eslint.config.js`) with `typescript-eslint`'s
**type-checked** rule set (`recommendedTypeChecked`, via `projectService`) —
not the plain `recommended` set — specifically so rules like
`no-floating-promises` and `no-unsafe-*` are active across an async-heavy
codebase (every E2E test is `async`; a dropped `await` is a real, silent
bug class, not a hypothetical). Prettier owns all formatting;
`eslint-config-prettier` disables any ESLint rule that would fight it —
never hand-fix a formatting complaint, run `npm run format`.

Deviations from the rule-set defaults, and why:

- **`@typescript-eslint/no-unused-vars`** — `argsIgnorePattern: "^_"`. This
  codebase already used a leading underscore for intentionally-unused
  callback params (Phaser's fixed collider/event signatures often force
  accepting one you don't need) before ESLint existed here; the config was
  written to match the codebase, not the other way around.
- **`@typescript-eslint/unbound-method`** flagged passing bare method
  references (`this.handlePaddleHit`) straight into
  `physics.add.collider(...)`. Phaser does correctly bind `this` via the
  call's trailing context argument, so this was a false positive from
  ESLint's point of view — but it's still a real footgun if that context
  argument is ever dropped later. Fixed properly (not suppressed): every
  collider/overlap callback is now wrapped in an arrow function
  (`(ball, paddle) => this.handlePaddleHit(ball, paddle)`), which makes the
  `this` binding explicit and needs no context argument at all.
- **`playwright/no-wait-for-timeout`** is off for `tests/e2e/**`. That rule
  assumes a DOM-driven app where a network response or an element appearing
  is always available to wait on instead — this game renders to one opaque
  `<canvas>` with no DOM reflecting game state, and much of what these
  tests wait for is physics simulation time passing (a ball falling, a
  booster timer expiring). There's no equivalent signal to await. Accepted
  as a structural property of testing a canvas game, not a smell — see
  "Playwright practices for a canvas game" above.
- Root-level config files (`eslint.config.js`, `vite.config.ts`,
  `vitest.config.ts`, `playwright.config.ts`) aren't covered by
  `tsconfig.json`'s `include` (`["src", "tests"]`), so they're opted into
  `projectService`'s `allowDefaultProject` rather than erroring as
  "not found by the project service."

Scripts: `npm run lint` / `npm run lint:fix` / `npm run format` /
`npm run format:check`. `npm run test` runs typecheck → lint →
format:check → unit → e2e in that order — a formatting or lint failure
blocks the same way a failing test does.

---

## Pre-commit hooks

Husky (`.husky/pre-commit`) runs on every commit:

```
npx lint-staged
npm run typecheck
```

`lint-staged` (config in `package.json`) runs ESLint `--fix` and Prettier
`--write` scoped to whatever's actually staged, then re-stages the result —
so a commit never lands with a lint/format issue you could have auto-fixed.
Typecheck runs across the whole repo (TypeScript can't easily scope to just
the staged files without missing cross-file errors) but is fast enough
(~1s) not to matter.

**Deliberately not run in the hook: the test suites.** Both `test:unit` and
especially `test:e2e` (spins up a real browser) are too slow for something
that fires on every commit — that's what `npm run test` before pushing and
CI (`.github/workflows/ci.yml`, runs on every push/PR to `main`) are for.
A pre-commit hook that takes 15+ seconds trains people to reach for
`--no-verify`, which defeats the entire point of having one.
