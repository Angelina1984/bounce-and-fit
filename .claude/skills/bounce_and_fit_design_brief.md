# Bounce & Fit — Game Design Brief & Canon (working draft)

*Consolidated from initial brainstorm notes, August 29, 2026. Source material produced in a VSCode/Claude Code session; cleaned up August 29–30, 2026 with the open questions from the first pass resolved — see §8.*

## 1. Elevator pitch

A polished, easy-to-learn brick-breaker + puzzle hybrid. Players solve levels using a limited number of paddle bounces, with star bricks that drop strategic power-ups when caught. Calm pacing, accessible controls, no predatory monetization.

**Target platforms:** Web, iOS, and Android from one codebase — Phaser (TypeScript) for the game, wrapped with Capacitor for the native iOS/Android builds. iOS 15+ / modern Android, with testing on low-end devices.

## 2. Core Hook

*"Bounce & Fit is a calm, puzzle-driven brick breaker where players solve levels using a limited number of bounces — enhanced by thoughtfully placed star bricks that grant short, strategic power-ups when caught."*

Design hierarchy: **Core Hook** (why it's different) → **Core Loop** (what you do repeatedly) → **Modifiers/power-ups** (how the loop varies moment to moment).

## 3. Locked Game Rules — MVP Canon

### Primary constraint: lives (supersedes the original bounce-budget constraint — see note)
- Each level starts with a fixed number of lives (prototype default: 5).
- Catching the ball with the paddle is free and unlimited — it never costs a life.
- A life is lost only when the ball is actually missed (falls past the paddle and off the bottom of the play field).
- At zero lives: level ends → retry. No mid-fall "plays out" grace period — losing the last life ends the level immediately.

> **Change note (Aug 29, 2026):** the original design bet here was a *bounce budget* — a fixed number of paddle *hits* per level, spent by successfully catching the ball, with the puzzle being to plan those catches carefully (see §8's competitive-positioning rationale, which was built around this being a planning-based, non-reflex constraint). Playtesting the ugly prototype (§6a) surfaced that this didn't feel good: spending a scarce resource on *successful* play read as punishing rather than strategic. Replaced with a conventional lives-on-miss model instead. **This has NOT yet been reconciled with:**
> - §5's star-scoring formula (2★/3★ criteria reference "bounces remaining" / "optimal bounce count" — those need a lives-based or bricks-based analogue).
> - §8's competitive-positioning bet, which explicitly named the bounce-budget's planning-over-reflex framing as the thing no competitor was doing. A lives-on-miss model is much closer to the genre norm §8 was trying to differentiate from — worth revisiting whether the differentiation now needs to come from elsewhere (star bricks/power-ups, calm pacing, accessibility) before locking the MVP scope in §6b.

### Star bricks — always positive
- Visually marked (gold), drop exactly one **booster** when destroyed, slow/readable drop speed.
- Booster activates only if caught by the paddle; missed drops are never punished.
- Placed intentionally, never randomly. **Superseded (see the reconciliation record after §3):** the original "never more than 2 per level" cap was dropped once the whole booster catalog unlocked from level 1 — levels now carry roughly 6 star bricks each.
- **A star brick is unconditionally good.** Anything that could hurt the player — the two hazards below — deliberately lives on a separate brick type instead (see "Hazard bricks"), specifically so this rule never has an exception. See the reconciliation record at the end of this section for why that was worth calling out explicitly.

### Hazard bricks — trigger on destruction, no catch involved
- Visually marked in a warning tint (red / icy blue — see table below), distinct from both normal bricks (gray) and star bricks (gold).
- The hazard's effect applies **the instant the brick is destroyed** — there is no falling item and no paddle-catch step, unlike star bricks. You can't dodge a hazard by simply not catching it; breaking it is the trigger.
- Placed intentionally, same rule as star bricks (never randomly, never more than a couple per level).
- **Freeze Paddle is reserved for the last level only** — see the reconciliation record below. Paddle Cut stays available from level 1 like everything else in the catalog.

### Tough bricks — a structural property, not a booster or hazard

- The top row of every level's brick grid takes 2 hits to destroy instead of 1 — marked with the hit count as a number inside the brick.
- Deliberately independent of the catch mechanic: a tough brick never carries a star or a hazard, so "needs 2 hits" is never entangled with "also drops something" — the extra hit is purely a structural cost of clearing that row, not a booster/hazard interaction to reason about.
- Not a booster in the `BoosterController` sense — no catch, no duration, no decay. It's a property of the brick itself, checked before the normal destroy/star/hazard logic runs.

### Challenge speed ramp — levels 1-4 stay calm, levels 5+ get progressively faster

- The base ball speed is flat (the standard speed) through the first 4 levels — the calm, all-ages, non-reflex zone the accessibility positioning (§7, §8) is built around.
- **Starting at level 5, the ball gets progressively faster, one step per level** (see `ballSpeedForLevel()` in `gameplayMath.ts` and `CHALLENGE_START_LEVEL_INDEX`/`CHALLENGE_SPEED_STEP` in `constants.ts`). The premise: a player who's cleared the first 4 levels has demonstrated enough basic proficiency to count as "good" — from here on, the game can reward and challenge motor skill without compromising the baseline experience everyone else plays through levels 1-4.
- This is a deliberate, narrow carve-out from the "calm, non-reflex" positioning, not a reversal of it — see the reconciliation record below.
- Every other speed-related mechanic (Slow Ball's multiplier, Extra Ball/Double Ball/Triple Ball's spawn-speed clamp) scales off this level-adjusted base speed, not a flat constant, so a spawn on level 6 isn't artificially capped at level 1's speed.

### Power-ups (current prototype catalog — Aug 29, 2026)

> **Superseded note:** the original spec here was 3 power-ups (Wide Paddle, Multi-Ball, Piercing Ball) with Wide Paddle lasting a fixed number of *paddle hits*. Playtesting the lives model (§3 above) drove three changes carried through to every booster below: (1) the catalog expanded to 7 — 5 positive boosters (star bricks) plus 2 hazards (hazard bricks), one introduced per level (§5's prototype level list) instead of all bunched at once; (2) **duration is modeled per-booster, not uniformly** — see the rule right after the table; (3) the two hazards trigger on brick destruction, not on catch — see the reconciliation record below for why.

| Booster/Hazard | Brick type | Effect | Duration | Visual (gray-box tint) |
|---|---|---|---|---|
| **Wide Paddle** | Star (caught) | +40% paddle width | 8 seconds (real time) | Teal |
| **Slow Ball** | Star (caught) | Ball speed ×0.6 | 3 seconds (real time) | Violet |
| **Big Ball** | Star (caught) | Ball size ×1.6 (easier to hit bricks/paddle) | 6 seconds (real time) | Lime |
| **Burning Ball** | Star (caught) | Passes through bricks without bouncing, destroying every brick in its path | 5 seconds (real time) | Orange, plus a matching tint on the ball itself as it burns |
| **Extra Ball** | Star (caught) | Adds 1 more ball in play; all balls share the same lives — losing an extra ball costs nothing, only losing the *last* ball costs a life | Until that ball is individually lost | Blue |
| **Double Ball** | Star (caught) | Adds 2 more balls in play, compounding with whatever's already there (not a jump to a fixed total — see below) | Until each ball is individually lost | Medium blue |
| **Triple Ball** | Star (caught) | Adds 3 more balls in play, same compounding rule as Double Ball | Until each ball is individually lost | Deep blue |
| **Paddle Cut in Half** | Hazard (destroyed) | Paddle width ×0.5 | 3 seconds (real time) | Red |
| **Freeze Paddle** | Hazard (destroyed) | Paddle ignores input entirely | 3 seconds (real time) | Icy blue |
| **Catch & Aim** | Star (caught) | Ball sticks to the paddle on contact instead of bouncing; player repositions, then releases with a tap to fire an aimed shot | 5 seconds (real time) | Magenta |
| **Foresight** | Star (caught) | While a ball is stuck via Catch & Aim, a faint dotted line previews its aimed shot (reflecting off the two side walls) | 6 seconds (real time) | Pale lavender |

**Extra Ball, Double Ball, and Triple Ball are strictly additive/compounding, not a target total.** Catching Double Ball with 1 ball in play reaches 3; catching it again reaches 5; catching Triple Ball on top of that reaches 8. There's a generous upper bound on total balls in play (a sane technical ceiling, not a design target), but no booster ever *reduces* the ball count or resets it to a fixed number — every catch is purely additive on top of whatever's already there.

**Catch & Aim is the mechanic most aligned with the Core Hook (§2):** every bounce becomes a deliberately aimed shot instead of an angle-of-incidence guess, and it removes real-time timing pressure from that shot entirely — a genuine accessibility win for the "calm, puzzle-driven" positioning (§7). Shipped as a temporary hit-based booster, same pattern as the other four, rather than a permanent rule change — worth revisiting whether it should graduate to a core mechanic once it's been played, but that's a decision to make with data, not up front. Foresight is intentionally scoped narrow: it only draws while a ball is actively stuck and being aimed, not as a continuous live trajectory preview during normal flight, which would be a much larger feature for later consideration if wanted.

**Duration rule:** five positive boosters (Wide Paddle, Big Ball, Burning Ball, Catch & Aim, Foresight) wear off after a **count of bricks destroyed**, not a timer — so a booster never quietly expires while the player is still lining up a shot; the clock only runs while they're actually playing. **Slow Ball is the deliberate exception among the positive boosters** and the two **hazards** are the same kind of exception: all three stay real-time, on a short, fixed 3-second timer — see the reconciliation record below for why Slow Ball specifically was moved off the bricks-destroyed model. Extra Ball/Double Ball/Triple Ball need no duration mechanic at all; each spawned ball expires naturally when it's individually lost.

**Interaction rules:**
- Wide Paddle and Paddle Cut in Half both just set paddle width, so they're mutually exclusive — triggering either one immediately cancels and overrides the other.
- Slow Ball, Big Ball, and Burning Ball are independent of each other and of paddle width — any combination can be active at once.
- None of them extend the life count. Catching a booster is never required, and a hazard brick can't be avoided by "not catching" since it triggers on destruction — but destroying it is itself usually unavoidable in clearing the level, so hazards read as a cost of progress, not a trap.
- **Losing a life clears every active booster and hazard back to native**, including a still-running Freeze Paddle or Paddle Cut — a miss is a clean reset, not a stacked penalty.
- **Winning a level ("Next Level") carries the five bricks-destroyed boosters forward** — Wide Paddle, Big Ball, Burning Ball, Catch & Aim, and Foresight keep whatever remaining hit-budget they had, same as lives (§3's "run-wide resource" framing extends to these). Extra Ball's balls carry forward too, as real balls in the new level's serving formation. **Slow Ball and both hazards never carry** — every level always starts at the standard ball speed and native paddle width, even if Slow Ball was still active when the previous level was won (see the reconciliation record below for why speed specifically joined the hazards here); a hazard/Slow Ball's short window is meant to be that specific moment's own cost, not a penalty that follows the player into the next level. "Play Again" after the last level is the one exception on the booster side too: it starts a fresh run, so it resets boosters and extra balls exactly like it resets lives.

**Design insight to hold onto:** power-ups should help the player spend lives more intelligently — not erase the constraint. Hazards exist to raise the stakes of clearing a level, not to punish missing.

### Explicit non-rules (do not implement)
No power-up extends the life count. No random drops (every star/hazard brick's type is a level-design choice, per §5's prototype level list). No countdown timers on anything *except* the two hazards and Slow Ball (deliberate exceptions, not a loophole — see the reconciliation record on Slow Ball's timer conversion). No "frenzy" modes. No punishment for missed star-brick drops.

### Reconciliation record (Aug 29, 2026) — three open questions from the booster expansion, now resolved

1. **Burning Ball is Piercing Ball, renamed — not a new mechanic.** Same core idea (a ball that passes through bricks instead of bouncing) under a new name. Kept capped at a finite count (5 bricks) rather than "destroys everything in its path" uncapped, specifically so it stays a resource the player spends deliberately, per the "helps you spend lives more intelligently, doesn't erase the constraint" rule above — an uncapped version would let one catch clear an entire level with no further planning.
2. **Extra Ball supersedes Multi-Ball as the canonical spec.** Multi-Ball's original spec (jump straight to 3 balls, ends after any ball hits the paddle twice) was never built. Extra Ball is the lighter, incremental version instead: +1 ball per catch, capped at 3 total, persisting until that specific ball is lost rather than on a hit-count. One mechanic, one name — Multi-Ball is retired.
3. **Hazard delivery mechanism: resolved in favor of hazard bricks (destroy-triggered), not catchable drops.** The alternative considered was making Paddle Cut and Freeze Paddle catchable star-brick drops with a distinct warning tint — visually legible, not truly hidden, but still a catch-or-dodge decision layered onto star bricks. Rejected in favor of a separate brick type specifically to keep "a star brick is always good" true with zero exceptions — that rule matters more here than usual given the accessibility-first, all-ages positioning (§7, §8): a player under time pressure misreading a color is a worse failure mode than a hazard being unconditionally tied to a brick they can see coming.

### Reconciliation record (Aug 30, 2026) — progressive teaching dropped in favor of density from level 1

The "one new booster taught per level" progression rule (§5's original framing) is **dropped**. Every level, including level 1, now draws from the whole booster/hazard catalog — roughly 6 star bricks plus both hazards per level, rather than one new mechanic at a time. Decided explicitly to make the prototype feel "fun from the start" rather than thin early on; the accessibility/teaching concern that motivated the original one-at-a-time rule (§5's "first exposure should never be impossible to fail silently") is judged less load-bearing now that every booster is optional to catch and nothing punishes not engaging with one. A direct consequence: level 6 ("Gauntlet") loses its earlier identity as a hazards-only finale, since hazards now appear throughout the run, not just there — its name and shape are unchanged, only the "no star bricks this level" framing goes away. See §5's updated level list.

### Reconciliation record (Aug 30, 2026) — Freeze Paddle held back, Double/Triple Ball added

Two follow-on refinements to the "unlock everything from level 1" decision above, made once it was actually played:

1. **Freeze Paddle moved back to the last level only.** Unlike Paddle Cut (a paddle-width penalty a player can still work around), Freeze Paddle removes input entirely — a harsher, more frustrating hazard for an early level given the accessibility-first, all-ages positioning (§7). Held back as part of level 6's finale instead, the one place it always lived before "unlock everything" (see the reconciliation record above). Paddle Cut stays available everywhere.
2. **Double Ball and Triple Ball added to the catalog, one of each per level.** Extra Ball's original "1 ball added, capped at 3 total" model is superseded for anything ball-count-related: all three ball boosters (Extra Ball, Double Ball, Triple Ball) are now purely additive and compound with each other — catching Double Ball twice reaches 5 balls (1 + 2 + 2), not 2. The old MAX_BALLS=3 cap is gone in favor of a much higher technical ceiling (a sane upper bound, not a design target). This is a deliberate reopening of reconciliation item 2 above (Extra Ball superseding the original jump-to-3 Multi-Ball spec) — the "lighter, incremental" framing that motivated Extra Ball's design no longer describes the catalog once Double/Triple Ball compound freely alongside it.

### Reconciliation record (Aug 30, 2026) — Slow Ball carved out of the carry-over rule

Reported live as a bug: "level 2 feels slower than level 1." Root cause was the carry-over feature itself (see the Aug 29, 2026 reconciliation record above) working exactly as designed — Slow Ball, caught near the end of level 1 with hit-budget still remaining, carried its speed reduction into level 2, same as Wide Paddle/Big Ball/etc. are supposed to. Decided that ball speed specifically is different from the other hit-based boosters' effects (paddle width, ball size, tint): a player shouldn't have to remember "did I catch Slow Ball a while ago" to understand why the *base* feel of a brand new level is off — every level should always play at the standard speed as a reliable baseline. Scoped narrowly to Slow Ball alone, confirmed with the user — Wide Paddle, Big Ball, Burning Ball, Catch & Aim, and Foresight all still carry as before.

### Reconciliation record (Aug 30, 2026) — Slow Ball converted from bricks-destroyed to a short real-time timer

Follow-on decision, made right after the carry-over fix above: Slow Ball's duration model itself changed, not just whether it carries. It moved from "6 bricks destroyed" to a flat 3-second real-time timer, matching Freeze Paddle's model — confirmed with the user. This makes Slow Ball behave like the two hazards duration-wise (a short, fixed window, immune to how much the player happens to destroy afterward) even though it's still a positive, catchable star-brick booster, not a hazard. Paddle Cut's own duration was shortened from 6 to 3 seconds in the same change, so the two short real-time effects (Slow Ball, Paddle Cut) now match each other and Freeze Paddle exactly. The result: Slow Ball no longer appears in `BoosterController`'s hit-based-decay bucket at all (`HitBasedBuff`) — it's now a `scene.time.delayedCall` timer internally, the same pattern as Freeze Paddle/Paddle Cut, which is also *why* it structurally can never carry across a level transition anymore (real-time timers don't survive `scene.restart()` — see coding-hygiene.md's Phaser gotchas), reinforcing the fix from the reconciliation record just above rather than just special-casing it.

### Reconciliation record (Aug 30, 2026) — a narrow, level-gated carve-out from "no reflex challenge"

Raised as an open design question — when should the ball actually get faster to challenge motor-skilled players — and initially flagged against §8's competitive-positioning bet, which frames "planning over reflex" as the reason no other brick-breaker occupies this game's wedge. The user's resolution: **the first 4 levels stay exactly as calm and non-reflex as designed — that's the all-ages baseline every player gets — but a player who clears those 4 has proven enough proficiency to be worth challenging**, so levels 5+ ramp the ball's base speed up, one step per level (see "Challenge speed ramp" above). This isn't a reversal of the competitive-positioning bet; it's a graduated floor-then-ramp structure — the "calm, planning-based, accessible" hook still fully describes the first 4 levels (and stays the default experience for anyone who stops there), while the back half rewards players who want more. Worth revisiting if the level count grows well past 6 (§6b) — the ramp step (`CHALLENGE_SPEED_STEP`) currently has no upper cap, so it should be re-examined before it compounds across many more levels than the current 6.

## 4. Star Brick Placement Patterns

- **Key Unlock** — star brick behind a blocker; power-up helps clear a dense area; teaches cause → effect.
- **Efficiency Reward** — optional star brick, not required to win, helps earn higher stars with fewer bounces.
- **Risk vs. Safety** — star brick near the bottom; safer angle but worse puzzle outcome; player chooses comfort vs. optimal play.

## 5. Level Design Template

**Metadata per level:** ID/name, difficulty tier, bounce budget, primary mechanic showcased, star brick count.

**Grid:** fixed width (e.g. 10 columns). Brick types: normal, star, locked (color/rule-based), bumper/indestructible (sparingly).

**Puzzle intent rule:** every level must complete the sentence *"The player should realize that ___."* If you can't fill that in, the level is unfocused.

**Success/stars:** 1★ clear level, 2★ clear with ≥1 bounce remaining, 3★ clear using ≤ optimal bounce count. Stars never block progression in MVP.

**Teaching rule:** each new mechanic is introduced alone; no level introduces more than one new idea; first exposure should never be "impossible to fail silently."

**MVP progression (8 levels):**
|-------|--------------------------------------------|
| Level | Purpose                                    |
|-------|--------------------------------------------|
| 1     | Controls + bounce concept                  |
| 2     | Angles matter                              | 
| 3     | First star brick (wide paddle)             |
| 4     | Efficiency puzzle                          |
| 5     | Multi-ball intro                           |
| 6     | Locked bricks                              |
| 7     | Piercing ball                              |
| 8     | Boss block (all systems combined, lightly) |
|-------|--------------------------------------------|

Working level names: Warmup, Left Lock, Gentle Chaos, Boss Intro (plus others to be named).

**Prototype level list (current build, Aug 30, 2026)** — 6 levels, 7 rows × 8 columns of bricks each, the top row reserved for tough bricks (see §3). Every level mixes from the full catalog rather than teaching one at a time (see the reconciliation records above) — each carries 6 of the original 7 boosters (rotated per level for variety) plus Double Ball and Triple Ball unconditionally (one of each, every level — these aren't part of the rotation), for 8 star bricks per level. Hazards differ by level: Paddle Cut is available everywhere, Freeze Paddle only on the last level. This is the actual shipped state of the ugly prototype, not the aspirational 8-level table above; the two will need reconciling once the MVP scope (§6b) is locked.

|-------|--------------|-----------------------------------------------|------------------------|
| Level | Name         | Booster mix (6 of the original 7 + Double/Triple Ball) | Hazards |
|-------|--------------|-----------------------------------------------|------------------------|
| 1     | Warmup       | All but Foresight                              | Paddle Cut only        |
| 2     | Left Lock    | All but Catch & Aim                            | Paddle Cut only        |
| 3     | Big Break    | All but Extra Ball                             | Paddle Cut only        |
| 4     | Double Up    | All but Burning Ball                           | Paddle Cut only        |
| 5     | Burn Through | All but Big Ball                               | Paddle Cut only        |
| 6     | Gauntlet     | All but Slow Ball                              | Paddle Cut + Freeze Paddle |
|-------|--------------|-----------------------------------------------|------------------------|

Winning level 6 ("Play Again") starts a fresh run from level 1 with a full life count. Winning any earlier level ("Next Level") carries the current life count forward — lives are a run-wide resource, not a per-level one (see §3).

## 6. Build scope

### 6a. Ugly prototype (build this first)

The smallest slice that tests whether the bounce-budget puzzle mechanic is actually fun — per the `new-app-kickoff` process, this comes *before* any of the MVP polish below, and before touching Capacitor at all.

- Runs in-browser only (Phaser web target; no native wrapping yet).
- Grew from 1–2 gray-box levels to 6 (§5's prototype level list) as the loop proved out and more boosters came online — paddle, ball, bricks, lives counter, level/booster HUD, win/lose, retry, next-level flow.
- Grew from one power-up (Wide Paddle) to the full 7-booster catalog in §3, one introduced per level.
- No art pass, no audio/haptics, no tutorial, no analytics, no save.
- **Exit criterion:** it's fun to replay a level trying to preserve your lives, on gray boxes alone. If it isn't, that's a concept problem no amount of polish fixes — stop and revisit before building further.

### 6b. MVP (after the prototype validates the loop)

- Phaser's built-in **Arcade Physics** (not Matter.js) — it's the lightweight AABB system Phaser's own Breakout example is built on, purpose-fit for paddle/ball/brick collision. Matter.js is Phaser's full rigid-body engine for rotation/complex-polygon scenarios; pulling it in here would add weight and complexity for zero benefit in this genre.
- Responsive paddle control: drag on touch, drag on mouse — one input codepath, both device classes.
- 8 handcrafted levels per §5, the 3 power-ups, the 2 negative brick types.
- Level select, pause, retry, star scoring (stars never block progression, per §5).
- A 30–60s interactive tutorial.
- Feel polish: sound, particles, legible/high-contrast fonts; haptics on native builds only (web has no haptics API).
- Local save only — no backend, no accounts, no cloud sync. `localStorage` on web, Capacitor Preferences on native.
- Basic analytics: session start, level complete, stars earned.
- Ship targets: static web build, Xcode project ready for TestFlight, Android project ready for Play internal testing.

### 6c. Explicitly out of scope for MVP

- Multiplayer, leaderboards, social features, any backend/accounts — this is a local-first game.
- Ads or rewarded video (§7 defers these deliberately).
- More than 8 levels, or power-ups/negative bricks beyond the specs in §3.
- Platform-bespoke UI/UX — one shared design across web/iOS/Android, not native-styled variants per platform.
- ASO, store-listing optimization, crash-reporting vendor integration, investor-demo materials — later-stage concerns per `new-app-kickoff`'s own sequencing, deliberately parked until the MVP is validated.

## 7. Accessibility, safety, monetization

- Colorblind palettes, adjustable text size, tap-vs-drag control toggle, optional haptics.
- No personal data collection in MVP; parental gating for any purchases; COPPA-aware.
- MVP monetization: no ads, optional one-time premium unlock for the full level pack. Later (post-MVP, deferred deliberately): optional rewarded ads for retries or cosmetics, no dark-pattern gating.

## 8. Resolved decisions (Aug 30, 2026)

The open questions from the first pass, closed out before any prototype code gets written:

- **Audience: all ages — kids, adults, and older people — kept co-equal by choice, risk accepted.** (Broadened from the first pass, which only named kids and older adults and implicitly left working-age adults out.) The usual advice is to pick one primary group when a span this wide could force conflicting control/pacing decisions. Decided to keep all three anyway — mitigated by the fact that §7's accessibility features (adjustable text size, tap-vs-drag toggle, colorblind palettes, optional haptics, no timers) are all opt-in accommodations layered on one shared baseline, not hard defaults that would force a single design point. If a specific decision genuinely can't serve all three (e.g. a control gesture only one group can perform), that's the trigger to revisit this, not a general pacing/difficulty call.
- **Competitive scan: done.** Confirmed the genre is saturated (Real Brick Breaker, Brick Breaker Star, Bricks and Balls, Brick Breaker: Journeys, Bricks Breaker: Deluxe Crusher, and more — [App Store search](https://apps.apple.com/us/app/real-brick-breaker-2026-game/id1642007232)), but the "calm, accessible, non-predatory, senior-friendly" positioning is currently owned entirely by *other* casual genres (solitaire, mahjong — [Best Free Brain Games for Seniors 2026](https://seniorbraingames.org/blog/best-free-brain-games-for-seniors-2026)), not brick-breakers. No direct competitor is doing what Bounce & Fit proposes — real wedge, unproven, and the reason it's unclaimed may be that reflex/spatial mechanics are a harder sell to that audience than turn-based games. The bounce-budget mechanic (planning-based, not reflex-based — see §3) is the direct answer to that risk; it's the load-bearing design bet and the first thing the ugly prototype (§6a) needs to validate.
- **Team: solo** (a principal/full-stack software engineer), not the full designer/programmer/artist/audio/QA team implied by the original TODO list. Scope in §6 is sized for one person: no team-dependent deliverables (no separate art or audio contractor pipeline assumed), and the ugly-prototype step exists specifically so scope gets validated cheaply before the fuller MVP build.
- **Platform/tech: Web + iOS + Android, one codebase — Phaser (TypeScript) + Capacitor.** Originally scoped iOS-only; broadened once it was clear the person building this has full-stack/JS-TS depth (see §6b) rather than iOS-specific experience, and that a native-per-platform build (e.g. SpriteKit) wouldn't leverage that. Phaser was chosen over Unity/Godot specifically because it's a JS/TS extension of skills already in hand, not a new engine paradigm — and it's purpose-built for this exact genre (its own docs ship a Breakout example on the Arcade Physics system this brief specifies in §6b).