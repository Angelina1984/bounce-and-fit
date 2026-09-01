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
- Each level starts with a fixed number of lives (prototype default: 5), shown in the HUD as a **row of ball icons** rather than a number — they disappear right-to-left as lives are lost. Icons over a numeral is an accessibility call (§7): it's readable at a glance and doesn't require literacy, which matters for the youngest end of the all-ages audience.
- Catching the ball with the paddle is free and unlimited — it never costs a life.
- A life is lost only when the ball is actually missed (falls past the paddle and off the bottom of the play field).
- At zero lives: level ends → retry. No mid-fall "plays out" grace period — losing the last life ends the level immediately.

> **Change note (Aug 29, 2026):** the original design bet here was a *bounce budget* — a fixed number of paddle *hits* per level, spent by successfully catching the ball, with the puzzle being to plan those catches carefully (see §8's competitive-positioning rationale, which was built around this being a planning-based, non-reflex constraint). Playtesting the ugly prototype (§6a) surfaced that this didn't feel good: spending a scarce resource on *successful* play read as punishing rather than strategic. Replaced with a conventional lives-on-miss model instead. **This has NOT yet been reconciled with:**
> - ~~§5's star-scoring formula (2★/3★ criteria reference "bounces remaining" / "optimal bounce count" — those need a lives-based or bricks-based analogue).~~ **Resolved Aug 30, 2026** — replaced by the combo-based score in §3's "Scoring", which uses lives-remaining as its end-of-level bonus. See the scoring reconciliation record.
> - §8's competitive-positioning bet, which explicitly named the bounce-budget's planning-over-reflex framing as the thing no competitor was doing. A lives-on-miss model is much closer to the genre norm §8 was trying to differentiate from — worth revisiting whether the differentiation now needs to come from elsewhere (star bricks/power-ups, calm pacing, accessibility) before locking the MVP scope in §6b.

### Star bricks — always positive
- Visually marked (gold), drop exactly one **booster** when destroyed, falling at a readable speed on the calm levels and progressively faster on the challenge levels (`powerUpDropSpeedForLevel()`).
- Booster activates only if caught by the paddle; missed drops are never punished.
- Placed intentionally, never randomly. **Superseded (see the reconciliation record after §3):** the original "never more than 2 per level" cap was dropped once the whole booster catalog unlocked from level 1 — levels now carry roughly 6 star bricks each.
- **A star brick is unconditionally good.** Anything that could hurt the player — the two hazards below — deliberately lives on a separate brick type instead (see "Hazard bricks"), specifically so this rule never has an exception. See the reconciliation record at the end of this section for why that was worth calling out explicitly.

### Hazard bricks — trigger on destruction, no catch involved
- Visually marked in a warning tint (red / icy blue — see table below), distinct from both normal bricks (gray) and star bricks (gold).
- The hazard's effect applies **the instant the brick is destroyed** — there is no falling item and no paddle-catch step, unlike star bricks. You can't dodge a hazard by simply not catching it; breaking it is the trigger.
- Placed intentionally, same rule as star bricks (never randomly, never more than a couple per level).
- **Freeze Paddle is reserved for the last level only** — see the reconciliation record below. Paddle Cut stays available from level 1 like everything else in the catalog.

### Tough bricks — a structural property, not a booster or hazard

- Bricks that take 2 or 3 hits to destroy, **scattered through the grid** and hand-placed per level (`LevelDef.toughBricks`), not confined to a reserved row.
- **The shade is the hit counter.** A tough brick is a darker blue than an ordinary one — darker means more hits left — and every hit re-tints it one step lighter, so it visibly wears down until it looks exactly like an ordinary brick, which is also the hit that will destroy it next. There is no number printed on the brick. This keeps the readout instant and language-free (§7's all-ages positioning) and means the player learns the rule by watching one brick change rather than by reading a digit.
- Deliberately independent of the catch mechanic: a tough brick never carries a star or a hazard, so "needs 2 hits" is never entangled with "also drops something" — the extra hits are purely a structural cost, not a booster/hazard interaction to reason about. `validateLevels()` enforces this as a cell collision.
- Not a booster in the `BoosterController` sense — no catch, no duration, no decay. It's a property of the brick itself, checked before the normal destroy/star/hazard logic runs.
- The shade ladder (`BRICK_TINTS_BY_HITS`) is what caps the hit count: supporting a 4-hit brick means adding a fourth shade, which is the right constraint — a hit count with no distinct color to express it would be unreadable.

### Challenge speed ramp — levels 1-4 stay calm, levels 5+ get progressively faster

- The base ball speed is flat (the standard speed) through the first 4 levels — the calm, all-ages, non-reflex zone the accessibility positioning (§7, §8) is built around.
- **Starting at level 5, the ball gets progressively faster, one step per level** (see `ballSpeedForLevel()` in `gameplayMath.ts` and `CHALLENGE_START_LEVEL_INDEX`/`CHALLENGE_SPEED_STEP` in `constants.ts`). The premise: a player who's cleared the first 4 levels has demonstrated enough basic proficiency to count as "good" — from here on, the game can reward and challenge motor skill without compromising the baseline experience everyone else plays through levels 1-4.
- This is a deliberate, narrow carve-out from the "calm, non-reflex" positioning, not a reversal of it — see the reconciliation record below.
- Every other speed-related mechanic (Slow Ball's multiplier, Extra Ball/Double Ball/Triple Ball's spawn-speed clamp) scales off this level-adjusted base speed, not a flat constant, so a spawn on level 6 isn't artificially capped at level 1's speed.

### Scoring

Reported live as "I have no idea how many points I scored" — there was no point score at all, and §5's star formula had been unimplementable since the bounce budget was retired.

| Event | Award |
|---|---|
| Brick destroyed | 10 × its hit cost × the current combo multiplier |
| Tough brick | the hit cost multiplies it — a 3-hit brick is worth 3× a plain one |
| Combo multiplier | rises by 1 per brick destroyed **within a single paddle-to-paddle trip**, capped at ×5 |
| Level cleared | +100 |
| Booster drop caught | +25 |
| Each life still in hand at level end | +50 |

**The combo is the design content here, not decoration.** A flat per-brick score would reward volume — grinding out bricks one at a time — which pulls directly against §2's Core Hook and §8's competitive bet that this game is about planning rather than reflex. Scaling by how many bricks fall to a *single aimed shot* rewards exactly the thing the game claims to be about: a bounce angled to rake along a row is worth several times the same bricks poked out individually. It also gives the boosters a scoring dimension they didn't have — Burning Ball's pierce and the multi-ball boosters become score plays, not just survival aids.

The ×5 cap exists so Burning Ball (which can clear a whole column in one trip) stays a strong reward rather than a runaway one. The per-life bonus is what keeps the lives constraint meaningful to a score-motivated player: clearing without missing is worth materially more than scraping through, which matches §3's "power-ups should help the player spend lives more intelligently — not erase the constraint."

**Catching a booster pays a flat bonus, and does not touch the combo.** A catch is an intercept across the arena and deserves credit, but it is not a paddle *bounce* — letting it extend a multiplier would push players to fish for drops instead of clearing bricks. This does not conflict with "no punishment for missed star-brick drops" (§3's non-rules): a missed drop still costs nothing, you simply don't collect the bonus.

**Every active effect shows a countdown badge in the HUD** — a dot in its own color, its name, and whole seconds remaining. Once every booster became a real-time timer, "which effects are on" stopped being enough information: a player needs to know whether Wide Paddle has seven seconds left or half of one. Capped at four badges, which is all a single centered row fits at this width.

**Score is run-wide, like lives.** It carries forward through "Next Level" and resets to zero on a retry or "Play Again" — a run's score is the score of that run. The *personal best* is the one thing that outlives it (see below).

**The level-clear screen names the level and shows a breakdown that sums to the total** — carried over, earned this level, clear bonus, lives bonus. Because the score is run-wide, a total alone can't tell a player what they just earned versus what they already had; a panel listing only the bonuses next to a much larger total reads as an error rather than a summary.

**Personal best is persisted — the prototype's one exception to "no save state" (Aug 31, 2026).** §6b puts `localStorage` in MVP scope, not here, and that still holds for everything else. This one was asked for directly and earns the exception: the score is run-wide and vanishes when a run ends, so there was no number to beat and nothing to make a second run mean anything. Stored under one namespaced key, read on the title screen (shown only once a best exists — a "Best 0" badge advertises a scoreboard nobody has played for) and on the game-over screen next to the final score. Banked on every level clear rather than only at a run's end, since the score carries forward and a player who clears five levels then loses the sixth should keep what those five were worth. Announced only where a run *ends*: with no stored best every early clear is a record, so celebrating on the win screen would say "new best" almost every time and mean nothing.

**Still deliberately not in:** star ratings (see §5), and the rest of §6b's save scope — level progress, settings, anything else.

**Drop speed: on the challenge ramp, settled Aug 31, 2026.** Drops originally fell at a flat 130 against a ball speed of 420 — under a third of it — chosen so a catch would be undemanding for §7's all-ages positioning. In play that read as floating, so they were briefly set to the ball's speed outright; that overshot, because it turned every star brick into a reflex test from level 1, before the game has asked anyone for reflexes.

Settled by putting the drop on the *same* challenge ramp the ball already uses, from its own much slower base: flat at 170 through levels 1-4, then climbing steeply enough to close most of the gap over the challenge levels (323 on level 5, 476 on level 6), capped at that level's ball speed so a drop is never the fastest thing on screen. §3's "readable drop" promise is kept where it was actually load-bearing — the calm, all-ages levels — and spent where the player has already demonstrated the coordination, which is the same argument §3 makes for the ball's ramp. §3's "no punishment for a missed drop" is unchanged: a missed drop still costs nothing but the +25 you didn't collect.

### Power-ups (current prototype catalog — Aug 29, 2026)

> **Superseded note:** the original spec here was 3 power-ups (Wide Paddle, Multi-Ball, Piercing Ball) with Wide Paddle lasting a fixed number of *paddle hits*. Playtesting the lives model (§3 above) drove three changes carried through to every booster below: (1) the catalog expanded to 7 — 5 positive boosters (star bricks) plus 2 hazards (hazard bricks), one introduced per level (§5's prototype level list) instead of all bunched at once; (2) **duration is modeled per-booster, not uniformly** — see the rule right after the table; (3) the two hazards trigger on brick destruction, not on catch — see the reconciliation record below for why.

| Booster/Hazard | Brick type | Effect | Duration | Visual (gray-box tint) |
|---|---|---|---|---|
| **Wide Paddle** | Star (caught) | +40% paddle width | 8 seconds (real time) | Teal |
| **Slow Ball** | Star (caught) | Ball speed ×0.6 | 3 seconds (real time) | Violet |
| **Fast Ball** | Star (caught) | Ball speed ×1.5 — clears faster and feeds the combo, at the cost of reaction time | 5 seconds (real time) | Hot red, deliberately far from Slow Ball's violet |
| **Big Ball** | Star (caught) | Ball size ×1.6 (easier to hit bricks/paddle) | 6 seconds (real time) | Lime |
| **Burning Ball** | Star (caught) | Passes through bricks without bouncing, destroying every brick in its path | 5 seconds (real time) | Orange, plus a matching tint on the ball itself as it burns |
| **Extra Ball** | Star (caught) | Adds 1 more ball in play; all balls share the same lives — losing an extra ball costs nothing, only losing the *last* ball costs a life | Until that ball is individually lost | Blue |
| **Double Ball** | Star (caught) | Adds 2 more balls in play, compounding with whatever's already there (not a jump to a fixed total — see below) | Until each ball is individually lost | Medium blue |
| **Triple Ball** | Star (caught) | Adds 3 more balls in play, same compounding rule as Double Ball | Until each ball is individually lost | Deep blue |
| **Extra Life** | Star (caught) | +1 life, capped at MAX_LIVES. **Every 5th level only** — see below | Permanent (a run-wide resource, not a timed effect) | Warm gold, plus a **★ drawn on the brick face** |
| **Mystery** | Star (caught) | Resolves at catch time to a random booster from the catalog — never a hazard, never another Mystery, never an Extra Life | Whatever the resolved booster's is | Vivid purple, plus a **? drawn on the brick face** |
| **Paddle Cut in Half** | Hazard (destroyed) | Paddle width ×0.5 | 3 seconds (real time) | Red |
| **Freeze Paddle** | Hazard (destroyed) | Paddle ignores input entirely | 3 seconds (real time) | Icy blue |
| **Catch & Aim** | Star (caught) | Ball sticks to the paddle on contact instead of bouncing; player repositions, then releases with a tap to fire an aimed shot | 5 seconds (real time) | Magenta |
| **Foresight** | Star (caught) | While a ball rests on the paddle being aimed — the serve, or a ball held by Catch & Aim — a faint dotted line previews its shot (reflecting off the two side walls) | 6 seconds (real time) | Pale lavender |

**Extra Ball, Double Ball, and Triple Ball are strictly additive/compounding, not a target total.** Catching Double Ball with 1 ball in play reaches 3; catching it again reaches 5; catching Triple Ball on top of that reaches 8. There's a generous upper bound on total balls in play (a sane technical ceiling, not a design target), but no booster ever *reduces* the ball count or resets it to a fixed number — every catch is purely additive on top of whatever's already there.

**Catch & Aim is the mechanic most aligned with the Core Hook (§2):** every bounce becomes a deliberately aimed shot instead of an angle-of-incidence guess, and it removes real-time timing pressure from that shot entirely — a genuine accessibility win for the "calm, puzzle-driven" positioning (§7). Shipped as a temporary hit-based booster, same pattern as the other four, rather than a permanent rule change — worth revisiting whether it should graduate to a core mechanic once it's been played, but that's a decision to make with data, not up front. Foresight is intentionally scoped narrow: it draws only while a ball is at rest *being aimed*, not as a continuous live trajectory preview during normal flight, which would be a much larger feature for later consideration if wanted. Originally that meant Catch & Aim only — see the reconciliation record below for why the serve was added.

**Duration rule:** every timed booster and hazard runs on a short, fixed **real-time timer** (`scene.time.delayedCall`) — Wide Paddle/Paddle Cut 8s/3s, Big Ball 6s, Burning Ball 5s, Catch & Aim 5s, Foresight 6s, Slow Ball/Freeze Paddle 3s — see the reconciliation record below for why the bricks-destroyed model was dropped entirely, not just for Slow Ball. Extra Ball/Double Ball/Triple Ball need no duration mechanic at all; each spawned ball expires naturally when it's individually lost.

**Interaction rules:**
- Wide Paddle and Paddle Cut in Half both just set paddle width, so they're mutually exclusive — triggering either one immediately cancels and overrides the other.
- Slow Ball, Big Ball, and Burning Ball are independent of each other and of paddle width — any combination can be active at once.
- None of them extend the life count. Catching a booster is never required, and a hazard brick can't be avoided by "not catching" since it triggers on destruction — but destroying it is itself usually unavoidable in clearing the level, so hazards read as a cost of progress, not a trap.
- **Losing a life clears every active booster and hazard back to native**, including a still-running Freeze Paddle or Paddle Cut — a miss is a clean reset, not a stacked penalty.
- **Winning a level ("Next Level") carries nothing forward except lives and score.** Every level starts at native paddle width, standard ball speed/size/tint, no stuck ball, no aim guide, and **exactly one ball** — regardless of what was still active or in play when the previous level was won. Lives and score cross the boundary because they are run-wide resources by design (§3); nothing a player earned *inside* a level does. "Play Again" after the last level resets those two as well. See the reconciliation record below for why timed carry-over was removed, and the Aug 31 record for why Extra Ball's balls stopped being the exception.

**Design insight to hold onto:** power-ups should help the player spend lives more intelligently — not erase the constraint. Hazards exist to raise the stakes of clearing a level, not to punish missing.

### Explicit non-rules (do not implement)
No power-up extends the life count. No random drops (every star/hazard brick's type is a level-design choice, per §5's prototype level list). No bricks-destroyed decay on anything — every timed effect is a short, fixed real-time timer (see the reconciliation record on the full conversion). No "frenzy" modes. No punishment for missed star-brick drops.

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

### Reconciliation record (Aug 30, 2026) — all remaining boosters converted to real-time timers, carry-over removed entirely

Follow-on from the Slow Ball timer conversion above, generalized to the whole catalog. Two live bugs exposed why the bricks-destroyed model didn't just need a Slow-Ball-shaped carve-out but needed retiring outright: (1) a report that "slow ball didn't really slow" turned out to be a case where a booster's flag/multiplier was set correctly but never actually applied to a ball already in flight — a risk that applies structurally to any effect that's supposed to act on something already in motion, not just Slow Ball; (2) a full-game freeze reproduced from catching Extra Ball, root-caused to a stale `primaryBall` reference surviving past the ball's destruction in `PrototypeScene.update()`'s partial-fall branch (fixed directly, unrelated to timers but found during this pass). Rather than keep patching the bricks-destroyed model one exception at a time, Wide Paddle, Big Ball, Burning Ball, Catch & Aim, and Foresight were all moved to the same flat `scene.time.delayedCall` pattern already used by Slow Ball, Paddle Cut, and Freeze Paddle — confirmed with the user ("let's make all boosters on a timer instead of number of hits"). Durations kept close to each effect's old bricks-destroyed budget translated to seconds (Wide Paddle 8s, Big Ball 6s, Burning Ball 5s, Catch & Aim 5s, Foresight 6s). Direct consequence: the cross-level carry-over mechanism (`BoosterController.getCarrySnapshot`/`applySnapshot`, `PrototypeSceneData.boosterSnapshot`) is now dead code with nothing left to carry — every timed effect is real-time and, like Slow Ball already was, structurally can't survive `scene.restart()` — so it was deleted outright rather than left as unused machinery. §3 and §5's tables/prose above are updated to match; no booster or hazard carries across a level transition anymore, only Extra Ball's already-spawned balls do. *(Superseded Aug 31, 2026 — those stopped carrying too. See the record below.)*

### Reconciliation record (Aug 30, 2026) — Foresight extended to the serve

Reported live as "when I collect foresight I don't see anything," and the report was correct: Foresight drew only for a ball stuck via Catch & Aim, and nothing else in the game sticks a ball. Catching Foresight on its own therefore drew nothing at all, ever. Worse, the two boosters run on 6s and 5s timers, so a player had to catch both within seconds of each other for the preview to render even once — in practice it read as a broken power-up rather than a narrow one.

The original "tied to an active aim" scoping was right in principle; it just missed that **the serve is also an aiming moment**, and the more common one. Foresight now draws for any ball at rest awaiting launch — the serve, or a ball held by Catch & Aim. What it still deliberately does *not* do is preview a ball already in flight: that would turn the bounce-planning puzzle (§2's Core Hook) into a solved-for-you readout, which is the larger feature the original scoping note was guarding against. The narrow scope holds; only the definition of "being aimed" widened. Catch & Aim keeps its own distinct value — it's the only way to aim a *return*, mid-rally, rather than the opening shot.

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

**Success/score:** a numeric run score — see "Scoring" in §3. The original 1★/2★/3★ formula here was written against the bounce budget and became unimplementable when that was replaced by lives (see the Aug 29 change note in §3); it is **superseded** by the score, not merely restated. Stars may return later as thresholds *derived from* the score, which is a decision to make with real play data rather than up front; if they do, they still never block progression.

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

Winning level 6 ("Play Again") starts a fresh run from level 1 with a full life count. Winning any earlier level ("Next Level") carries the current life count and score forward — those are run-wide resources, not per-level ones (see §3). Nothing else crosses: every level opens with one ball and no effects running.

## 6. Build scope

### 6a. Ugly prototype (build this first)

The smallest slice that tests whether the bounce-budget puzzle mechanic is actually fun — per the `new-app-kickoff` process, this comes *before* any of the MVP polish below, and before touching Capacitor at all.

- Runs in-browser only (Phaser web target; no native wrapping yet).
- Grew from 1–2 gray-box levels to 6 (§5's prototype level list) as the loop proved out and more boosters came online — paddle, ball, bricks, lives counter, level/booster HUD, win/lose, retry, next-level flow.
- Grew from one power-up (Wide Paddle) to the full 7-booster catalog in §3, one introduced per level.
- No audio/haptics, no tutorial, no analytics, no save. The "no art pass" rule held through the whole gameplay build and is now being lifted in stages — see the Candy UI reconciliation record below.
- **Exit criterion:** it's fun to replay a level trying to preserve your lives, on gray boxes alone. If it isn't, that's a concept problem no amount of polish fixes — stop and revisit before building further.

### Candy UI (Aug 30, 2026) — the prototype-to-polish transition, in two passes

The gray-box exit criterion above is judged met, so the art pass begins. Visual direction: **deep violet ground + warm gold accents**, glossy rounded pill buttons with gold borders, bold white text with a dark outline and drop shadow, pill-shaped HUD badges — the "candy" look of the casual-puzzle reference screenshots, chosen to match §7's calm, all-ages, accessibility-first positioning rather than the darker arcade convention the gray-box palette had drifted toward.

Sequenced deliberately as **chrome first, gameplay sprites second**, even though the agreed scope is "everything, including bricks/paddle/ball":

1. **Pass 1 (done) — HUD and title chrome.** `src/ui/theme.ts` is the single source for the palette's components (`outlinedTextStyle`, `paintPillBackground`, `paintGlossyButtonBackground`, plus `PillBadge`/`GlossyButton` classes). Applied to `TitleScene` and `Hud`. Chrome is pure text and rectangles, decoupled from Arcade Physics, so restyling it carries no risk of breaking collision behavior or booster readability — the palette gets proven somewhere cheap first.
2. **Pass 2 (done) — bricks, paddle, ball, power-up drops.** All were the same 1x1 pixel texture stretched into hard-edged rectangles. Now rounded and beveled via textures generated at runtime (`src/ui/textures.ts`), baking the same outline → platform → face → gloss layering the buttons use, so a brick and a button read as the same material at different scales. Drawn in grayscale so the existing `setTint()` calls still carry every booster/hazard color — the state-legibility scheme was preserved exactly rather than re-derived, which is what made this pass safe to do second.
3. **Pass 3 (done) — juice.** Brick-break particle burst, paddle squash on contact, power-up catch pop, camera shake on a lost life (reserved for that alone so it stays meaningful). See `src/ui/juice.ts`.

4. **Pass 4 (done, Aug 31, 2026) — the material itself.** Passes 1–3 got the layer *order* right (outline → platform → face → gloss) but every face was a flat fill, and the rim was a 2px line stroked 3px *inside* the fill — leaving a band of face color outside the gold, which is what made the edges read as misprinted. Reported directly as "buttons, shading and lines look ugly, cheap and not polished" against reference screenshots. Rebuilt on two rules: every face is a real vertical gradient (`fillVerticalGradient`), and every rim is a *filled frame* on the shape's own edge with the face inset on top of it (`paintCandyFrame`), never a stroked line. Panel violet and the page ground were both re-saturated — the old panel tone sat one shade off the background, so every badge sank into what it was on.

   **Primary actions are green now, not gold.** Gold is the chrome accent — rims, HUD readouts, the arena rail — so a gold button was the same material as the frame around it and stopped reading as the thing to press. This extends §7's "deep violet + warm gold" direction with one action color rather than replacing it; the reference screenshots put every primary CTA in green inside a gold rim for the same reason.

   **Still flat:** the bricks, paddle and ball still use pass 2's runtime textures, which bake the *old* flat-face treatment. Against the rebuilt chrome they now read as the least finished thing on screen — that's the next art item, not a regression.

**Still open, and the right next question for this phase:** §7's accessibility positioning means color alone must never be the only signal for a booster's or hazard's identity. The tint-only scheme survived the restyle untouched, so that concern is unchanged, not resolved — a shape or icon cue per booster is still worth doing before the MVP locks.

### Reconciliation record (Aug 31, 2026) — extra balls stop carrying too

The last thing that crossed a level boundary was Extra Ball's already-spawned balls: `endLevel()` snapshotted how many were in play at the win and `create()` rebuilt them in the next level's serving formation. Asked to remove it — "let's not carry over to next level extra balls, it resets to single ball, same with other boosters."

Boosters and hazards already didn't carry (they became real-time timers in the Aug 30 record, and real-time timers don't survive `scene.restart()`), so this was the one remaining exception, and it existed on the reasoning that "a ball in play isn't a timed effect". The reasoning was true and the rule was still wrong: **a level that opens with three balls is a level whose opening was decided by the previous one.** How a level begins should be a property of the level, not a residue of how the last one happened to end — otherwise the same level is a different level depending on what you caught thirty seconds earlier, which makes it impossible to tune and impossible to compare.

The boundary is now a clean line with exactly two things crossing it, both deliberate and both run-wide: **lives and score**. Everything earned inside a level stays inside it.

### Extra Life and Mystery, and the first symbols on brick faces (Aug 31, 2026)

**Extra Life** is the only booster that touches a *run-wide* resource rather than the ball or the paddle. Capped at `MAX_LIVES`: the HUD draws exactly that many icons, so a sixth life would be invisible, and an invisible reward reads as a broken booster. Catching one at full lives still pays the catch bonus, so it is never a punishment — just not a life.

**Extra Life appears on every 5th level only — 5, 10, 15, 20 — and nowhere else** (`EXTRA_LIFE_LEVEL_INTERVAL`, `levelGrantsExtraLife()`). A life back on every level makes the lives constraint decorative, and §3 is explicit that boosters "help the player spend lives more intelligently, not erase the constraint": a refill available every level erases it. Spacing them out makes reaching one a milestone, and the interval lands the first at exactly the level where the challenge ramp starts biting (`CHALLENGE_START_LEVEL_INDEX` is level 5 too) — the first level that asks for more is also the first that pays for it. With six levels built, that means level 5 carries the only one.

The rule is enforced by `validateLevels()` in both directions rather than left to convention: a stray Extra Life on level 2 quietly erases the constraint, and a *missing* one on level 10 quietly makes a run harder than designed. Neither is visible by reading the level data. **Mystery's outcome table excludes Extra Life for the same reason** — a "?" on level 2 that could roll one is a back door around the rule, rare but enough to make the rule untrue, and a scarcity rule that leaks is not a scarcity rule. That is a one-line change if Mystery should be a jackpot instead.

**Mystery** resolves at *catch* time, not at spawn, so what falls is genuinely unknown until it lands. Its table is boosters only — never a hazard, never another Mystery. §3's "a star brick is always good" has zero exceptions, and Mystery sits on a star brick: a "?" that could freeze the paddle would break the single guarantee the whole star/hazard split exists to protect. The resolved booster goes through `apply()` normally, so the HUD badge names what it became — the badge *is* the reveal.

**These two are the first bricks to carry a symbol on their face** (`POWER_UP_GLYPHS`), and that is a first step toward the per-booster icon cue §7 has wanted since the tint-only scheme survived the art pass. They earn one ahead of the others because the gold "this is a star brick" tint says nothing about a payload that is either a life or unknown — and for Mystery the "?" is not a cue, it is the feature. **The rest of the catalog still leans on the falling chip's tint alone**; that concern is unchanged, not resolved.

**"Tap to retry" was renamed "Start Over"** in the same pass, reported after losing the last life on level 6. Lives are run-wide, so running out ends the *run* — the button always restarts from level 1, and "retry" read as another go at the level just lost. The message says "Game over" rather than "Out of lives" for the same reason.

### Pacing: 14 star bricks per level (Aug 31, 2026)

Reported as "the game is taking too long and is boring", with the fix proposed in the same breath: more boosters per level, multi-balls and fire in particular. Star bricks went from 8 per level to 12 — and then to 14 once Extra Life and Mystery landed (`validateLevels`'s `maxStarBricks` raised to match). The four added for pacing are deliberately the *pace* set rather than four more of everything — a second Double Ball, an Extra Ball, a Burning Ball, and the new Fast Ball. Three of those put more balls on the field, one pierces a whole column, one speeds the ball up. Duplicates within a level are intentional and allowed: a level with two Burning Balls is more fire, which is the point.

**What this does not change is the brick count**, and that is the other half of the same complaint. A level is still a 7×8 grid — up to 56 bricks, plus the extra hits the tough bricks carry — and if a level still drags after the booster density lands, the grid is the lever, not more boosters. It is a bigger change than it sounds: every level's star, hazard and tough bricks are addressed by row/column, so shrinking the grid means re-laying out all six levels by hand rather than editing one constant.

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