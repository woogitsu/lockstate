# Playtest: `main` after fifteen changes — what a 90-day sentence looks like from the chair

**2026-08-30.** Mouse-driven playtest in a real Chromium at 1440x900, driving
the assembled page (`index.html` + `src/main.ts`) through a `Worker` tee that
records every command sent and every reply received. The script is
`tests/browser/playtest-after-today.playtest.ts`, collected by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI runs.

Played on **`origin/main` at `898a16a` (v0.0.252)**, in a worktree taken from it
with `git lfs checkout` run first — 62 objects, 93 MB, confirmed with
`file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104` rather than `ASCII text`, because
`docs/AGENT_WORKFLOW.md` records a browser playtest that ran green with no actor
sprites on screen at all.

The brief was the owner's, in their own words: *"znajdź bugi i błędy grając, bo
ja nie mogłem postawić więzienia itp grając sam"* — find defects **by playing**
— under the standing design directive *"gra ma być łatwa przyjazna do grania, a
nie jakieś ukryte funkcje"*.

## The question

Fifteen changes landed on `main` on 2026-08-30 and nobody had played the result.
Three of them are what this pass is aimed at:

- **[#659](https://github.com/matmaxalez/lockstate/issues/659)** widened a
  sentence from 2–16 to **14–90 in-game days**
  (`src/simulation/prisoners/sentence.ts`, `MIN_SENTENCE_DAYS = 14`,
  `MAX_SENTENCE_DAYS = 90`). A day is `DAY_LENGTH_TICKS` = 2,400 ticks and a
  tick is 50 ms, so at ×1 a sentence went from *4–32 real minutes* to **28 real
  minutes to 3 real hours**.
- **[#660](https://github.com/matmaxalez/lockstate/issues/660)** gave a
  relocated resident a sentence: *"{name} had nowhere to sleep and moved to
  {room}."* (`src/content/default-locale-en.ts:461`).
- **[#635](https://github.com/matmaxalez/lockstate/issues/635)** put *"N with no
  bed"* on the PRISONERS chip.

And [ADR 0079](../adr/0079-a-sentence-long-enough-to-be-a-history.md) makes one
prediction it does not test:

> **Steady-state occupancy rises for a given admission rate**, by roughly the
> ratio of the means — 124,800 against 21,600, a factor of **5.8**. ADR 0050's
> 200,000-tick population harness was **not** re-run […]. That is stated as the
> largest gap rather than filled with an assumption, and it is the finding most
> likely to matter to the economy work in flight.

Two open pull requests, [#653](https://github.com/matmaxalez/lockstate/pull/653)
and [#668](https://github.com/matmaxalez/lockstate/pull/668), cost the economy
against a prison that may be 5.8× too small. This pass was asked to measure it.

## Claim tiers

`docs/research/README.md` labels every claim. Everything below is **VERIFIED**,
meaning one of exactly two first-party things: a number or a sentence pasted
verbatim out of one of the two runs named below, or a `file:line` in this
repository that was opened and read. **SEARCH-SUMMARY and FROM MEMORY do not
occur.** Where something could not be established it is marked **UNKNOWN**
inline, with what would settle it.

Two runs of the same script on the same commit, both pasted:

- **Run A**, 2026-08-30 16:46 UTC.
- **Run B**, later the same evening.

---

*(Sections 1–7 follow; measurements from the two runs are pasted in place.)*

## 2. Nothing on screen says how long a prisoner is staying, and nothing ever did

**VERIFIED, code.** Exactly one read model carries a sentence:
`PrisonerDetailViewModel.sentence` — `lengthTicks`, `endTick`,
`priorIncidentsAtIntake` — at
`src/simulation/presentation/prisoner-projection.ts:214-219`. It travels on the
`hud/prisoner-detail` channel, and that channel is pinned as having **no
reader** by a contract test, in its own words
(`tests/foundation/projection-reachability-contract.test.ts:317-318`):

> No reader in `src/ui/` or `src/rendering/`. Blocked on a selection model that
> does not exist yet […] "there is no selection state, no highlight and no
> inspector."

The roster row that *is* rendered carries no sentence field at all:
`PrisonerRosterRowViewModel` (`prisoner-projection.ts:169-188`) has
`intakeStage`, `classified`, `classificationGroupId`, `riskTier`, `tile`,
`actionPhase`, `currentActionId`, `accommodation`, `gangId`, `lowestNeed` — and
nothing else.

**VERIFIED, Run A.** So the confirmation the brief asked for is a negative, and
here is what the negative looks like from the chair. Twelve prisoners, admitted
by tick 7,142, in-game day 3. The Regime panel's roster block, whole:

```
[act3] roster at admission:
PRISONERS
4 of 12
Ines Xavier
Sleeping
Safety
Low
Malik Pereira
Sleeping
Safety
Minimal
Rosa Kowal
Sleeping
Safety
Low
Omar Rossi
Sleeping
Safety
Minimal
and 8 more
```

A name, what they are doing, their worst need, and a risk tier. Four rows of
twelve, because `PRISONER_ROSTER_ROW_LIMIT` is 4
(`src/ui/hud/regime-panel.ts:156`). **No sentence, no release date, no elapsed
time, no "day 41 of 68".**

The vocabulary sweep over the whole visible HUD at that moment — every word a
player would need to see for a sentence to be on screen at all — is in §6.

**What that costs is a change of kind, not of degree.** Under the old range the
whole thing a player could not see lasted 4 to 32 real minutes. It now lasts
**28 real minutes to 3 real hours** at ×1, which is longer than a session. A
player looking at a full prison has no way to find out whether a bed frees in
ten minutes or in two hours, and the game offers no control that would tell
them: `hud/prisoner-detail` is the answer and nothing asks it.

**The one shipped sentence that mentions a sentence at all arrives when it is
over.** `hud.alert.event.prisoners.discharged` is
*"{count} released — their sentences are served."*
(`src/content/default-locale-en.ts:437`), recorded by
`PrisonerDischargeSystem` at `src/simulation/prisoners/discharge-system.ts:231`
and rendered on the `.hud__event` band. That is the first and only moment the
word appears.

**This is reported, not fixed.** Every route out needs player-facing copy, and
`AGENTS.md` reserves that to the owner: *"Anything that reaches a player as a
promise the code does not keep"* is the fourth exclusion, and a locale key with
no implementation behind it is the defect it names. Where it belongs is not in
doubt — the roster row is the surface, `PrisonerRosterRowViewModel` is the shape
that would have to carry it, and `hud/prisoner-roster` is the channel — but the
words are the owner's.

## 3. 97% of prisoners now get reviewed, and a review reaches the player as nothing at all

**VERIFIED, code.** `SIMULATION_EVENT_TYPES` has **eight** members
(`src/simulation/protocol/types.ts:1385-1394`), and they are the whole of what
can reach the alerts list or the event band, each with a label key and a
severity in `EVENT_PRESENTATION` (`src/ui/simulation-events.ts:127-144`):
`economy.wages-unpaid`,
`incidents.all-clear`, `incidents.assault-opened`,
`incidents.escape-attempt-opened`, `incidents.gang-retaliation-opened`,
`incidents.riot-opened`, `prisoners.discharged`, `prisoners.relocated`. **None
of them is a classification review**, and `ClassificationReviewSystem`
(`src/simulation/prisoners/classification-review-system.ts`) calls nothing on
`SimulationEventLog`: `grep -n "events\.\|SimulationEventLog"` over that file
returns no lines at all.

So the only surface a review can move is the **risk-tier badge on a roster
row**: `standingLabelKey` is `deriveSimulationMessageKey('risk-tier', riskTier)`
once `classified` is true (`src/ui/simulation-prisoner-roster.ts:133-136`), and
the tier words are `Minimal | Low | Medium | High`
(`src/content/simulation-message-keys.ts:225`). A promotion changes one word on
one row — for at most four prisoners, silently, between two 500 ms repaints,
with no history and no notification.

ADR 0079 measures what #659 turned on: a first review goes from **14.00% to
97.27%** of prisoners and a second from **0% to 85.06%**, with mean reviews per
prisoner from 0.14 to 4.20. That is a mechanic that was effectively dead and is
now the ordinary case. **Its entire player-visible footprint is a word that
changes when nobody is looking at it**, and only if that prisoner happens to be
one of the four rows the roster draws.

### What that looked like in play

**VERIFIED, Run A, act 3.** Twelve prisoners were classified at about tick
7,150. `ClassificationReviewSystem` is scheduled at
`intervalTicks: 24,000, phaseTicks: 23,999`, so the first scheduled tick that
falls inside their eligibility window is **47,999**. The roster block either
side of it, pasted, with nothing else changed:

```
[act3] --- t+378s tick 28575 (day 12) {"prisoners":12,"roomOccupants":6,"occupiedPlaces":6,…}
    roster:
    Ines Xavier   Sleeping  Hygiene  Low
    Malik Pereira Sleeping  Hygiene  Minimal
    Rosa Kowal    Sleeping  Hygiene  Low
    Omar Rossi    Sleeping  Hygiene  Minimal
```

```
[act3] --- t+636s tick 49192 (day 21) {"prisoners":11,"roomOccupants":6,"occupiedPlaces":6,…}
    event band: "severity=info 1440x32 at (0,80) :: The prison is under control again — no incident is still open."
    roster:
    Ines Xavier   Using Toilet  Hygiene  High
    Malik Pereira Sleeping      Hygiene  High
    Rosa Kowal    Using Toilet  Hygiene  High
    Omar Rossi    Using Toilet  Hygiene  High
```

**Every visible prisoner went from `Minimal`/`Low` to `High` — tier 0 or 1 to
tier 3 — in one invisible step.** Tier 3 is the only tier
`classificationGroupIdForTier` answers `'high-risk'` for, and ADR 0079 states
that **no admission a player can make can produce one**: *"1 + 0 + a maximum
screening draw clamps at 2, so no admission a player can make produces a
high-risk prisoner."* A review can, and in a neglected prison it did, to the
whole visible population at once. That is consistent with
`docs/research/2026-08-30-what-a-classification-can-reach.md`, which measured
*"every reviewed prisoner in a neglected prison reached high risk while none did
in a well-run one"* — this is the first time it has been seen happen through the
assembled page.

**The player is told nothing.** The event band at that moment is showing an
older incident all-clear; four words changed on a panel that is not the one the
player has open, and no other pixel moved.

**A second, smaller observation about that band, and it is a property rather
than a defect.** `.hud__event` does not auto-dismiss — deliberately
(`src/ui/hud/hud.ts:998-1001`, *"a message that clears itself on a timer is a
race against how fast the player reads. It is replaced by the next event or
emptied when the session ends"*) — so what it holds is the **last**
event, not a current state. At tick 49,192 it was still displaying an all-clear
from an incident that had closed some time before.

### What tier 3 unlocks, which is not only a badge

**VERIFIED, code.** Tier 3 is the gate on an escape attempt:

```ts
export const ESCAPE_ATTEMPT_MINIMUM_RISK_TIER = 3;                       // flashpoint.ts:113
export function canAttemptEscape(flashpoint: PrisonerFlashpoint): boolean {
  return flashpoint.riskTier >= ESCAPE_ATTEMPT_MINIMUM_RISK_TIER && flashpoint.contrabandSeverity > 0;
}                                                                        // flashpoint.ts:281-283
```

and `IncidentTriggerSystem` filters its escape candidates through exactly that
(`trigger-system.ts:343`). An escape is not cosmetic: a lapsed escape-attempt
incident writes `escaped: true` (`response-system.ts:551`) and
`onPrisonerEscaped` calls **the same `releasePrisoner`** a served sentence does
(`src/simulation/runtime/new-session.ts:1118`, *"A prisoner who got out is gone
(ADR 0061 decision 5)"*).

So the chain #659 turned on is: longer sentences → 97% of prisoners reviewed →
in a neglected prison the reviews reach tier 3 → **the risk-tier gate on escape
is open for the whole population**, where ADR 0079 states no admission a player
can make can open it. The second gate, `contrabandSeverity > 0`, still stands
and this pass did not measure whether anybody was carrying anything — see §7.

**Reported, not fixed**, for §2's reason: the missing thing is a sentence
addressed to a player, and that is the owner's.

## 5. What stopped a player, in the order they meet it

### 5.1 The first wall a new player orders still parks, and the word "material" is nowhere on screen

**VERIFIED, Run A, act 1.** The just-in-time materials fix
([#640](https://github.com/matmaxalez/lockstate/issues/640)) is **not on
`main`**, and the confirmation the brief asked for is this. New prison, Build
tab, arm Brick wall, drag one six-tile run, buy nothing, run at ×4 and watch:

```
[act1] queue right after one wall run: "QUEUED\n6 waiting · 0 being built"
[act1] after 23.604s of x4, tick 465: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 44.41s of x4, tick 2138: queue "QUEUED\n6 waiting · 0 being built"
[act1] after 80.5s of x4, tick 5020: queue "QUEUED\n6 waiting · 0 being built"
```

Tick 5,020 is in-game day 3. Nothing has moved and nothing will. What the whole
visible HUD says about why, with nothing unfolded by hand:

```
[act1]   /awaiting materials/i in the visible HUD? false
[act1]   /material/i in the visible HUD? false
[act1]   /brick/i in the visible HUD? true
[act1]   /buy/i in the visible HUD? true
[act1]   /stock/i in the visible HUD? false
[act1]   /purchase/i in the visible HUD? false
```

`/brick/i` and `/buy/i` are true because the Build catalogue lists "Brick wall"
and the panel has a "Buy" control — neither is a sentence about *these* orders.
The reason is one press away and it is a press nobody is told to make:

```
[act1] queue data-collapsed before unfolding: true
[act1] queue data-collapsed after the header press: false
[act1] queue after unfolding: "QUEUED\n6 waiting · 0 being built\nBrick wall · 14, 12 · North\nAwaiting Materials\nCancel\n…"
[act1]   /awaiting materials/i once the queue is unfolded? true
```

This reproduces `docs/research/2026-08-30-the-naive-route.md` rather than
extending it, and it is here because the brief asked for it to be confirmed on
today's `main` rather than assumed. **It is the earliest thing a player meets and
it is still live at `898a16a`.**

### 5.2 The control that looks like "start drawing" is the one that stops it, for a second room

**VERIFIED, Run A, act 2, from the failure rather than from the pass.** After
one room has been designated the Rooms tool **stays armed** — deliberately, so a
second rectangle can be dragged without touching the panel — and the panel
**folds itself** on the way (`drawingFolded`, `src/ui/hud/rooms-panel.ts:439-465`,
*"a panel that covers the thing it operates on is not a panel the player can
draw on"*). So a player coming back to the Rooms tab for a second room sees:

```
[act2] designate south: panel data-collapsed=true catalogue data-collapsed=false
```

A folded panel. Opening it and pressing the control that starts drawing —
`armButton`, which toggles: `armed = !armed`, `rooms-panel.ts:958` — **turns
drawing off**. The drag then draws nothing, no pending rectangle exists, and
Designate is never rendered. Playwright's page snapshot at the moment the run
died shows exactly that state: the panel expanded, `radio "Cell Selected"
[checked]`, no Designate control anywhere, and the arm button reading
**"Draw on map"** — which is `hud.rooms.arm`, the *disarmed* label
(`src/content/default-locale-en.ts:803-804`; the armed one is "Stop drawing").

**The label does tell the truth, and that is the whole of the mitigation**: a
player who opens the panel and reads the button before pressing it is told the
tool is already armed. The panel is folded on arrival, so that reading costs a
press first — and the fold is there for a good measured reason, which is why
this is a report and not a proposed change.

**It cost this pass a run**, which is the honest way to say how discoverable it
is: the script did the obvious thing and lost ten minutes to it.
