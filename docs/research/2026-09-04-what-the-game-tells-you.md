# 2026-09-04 — what the game tells you, and how much of it is still true

**Played on `agent/playtest-what-the-game-tells-you`, cut from `origin/main` at
`9429ba64` — v0.0.471.** `origin/main` was re-checked at the start of this
session and was still `9429ba64`; it may not be by the time this is read. The
instrument is
`tests/browser/playtest-2026-09-04-what-the-game-tells-you.playtest.ts`, which
is **not a CI gate**: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `.playtest.ts` is collected only by
`tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.

## The question

Over a whole session — an hour of play, not a moment — what does this game
actually say to the player? And of the sentences standing on screen at any given
time, how many are still true?

## The answer, in one paragraph

**Over 20,127 ticks of continuous play — day 4 to day 13 — the game said
exactly four distinct sentences, and the loudest one was false for the whole
run.** Four: a removal refusal, a fight, a riot, and a return to calm. That is
the entire vocabulary a twelve-prisoner prison heard in nine in-game days. The refusal band held **one** sentence — *"Nothing was removed —
there is no object on that tile, and none being built there."* — in every one of
56 samples spanning day 4 to day 13, and it was about a press on an empty tile
made before the prison had a wall. Meanwhile the worker published
`conditions: ["intake.no-place"]` in every logged sample of the same run: **the
true standing sentence was computed, put on the wire, and dropped at the HUD
boundary** ([#930](https://github.com/matmaxalez/lockstate/issues/930)), while
the false one held the full-width band at the top of the screen in the
strongest alarm colour the HUD has (1440x32px, 3.56% of the viewport — the
figure is `2026-09-04-the-hud-a-player-reads.md`'s, measured at the same
viewport, not mine). Twelve worker events reached the screen as **three rows**: four riots on
days 5, 7, 9 and 11 collapse into one row reading `4× Day 11`, and three of the
four days are unrecoverable from the screen. *"No incident is still open"* stood
in the alerts column in **56 of 56 samples and was false in 10 of them** —
`activeIncidents: 1` at the same tick. And the clearability answer is exact and
unkind: **3 of the 4 rows carry a dismiss control, and the one that does not is
the stale one** — after dismissing everything a player is allowed to dismiss, the
alerts column contains exactly one row, the false refusal from before the prison
existed, and the band above it still shows the same sentence. In the whole of
act 3 the only gesture that cleared it was **New prison**, which throws the
prison away. Against all of that, one thing works and is worth naming: the Buy
row, which does not produce a refusal at all — it marks itself `aria-disabled`
and says *"Not enough money — you need 133,815 more."*, a live figure recomputed
from state. That is the pattern everything above is missing.

## How to read this record

- **MEASURED** — a real run of this tree in a browser, output pasted.
- **VERIFIED, read** — the file was opened at the cited line and quoted.
- **DERIVED** — arithmetic over MEASURED or VERIFIED facts, shown.
- **JUDGEMENT** — what a player would do or feel; said so.
- **UNKNOWN** — not established in this pass.

Two channels are reported and never mixed: **WORDS** (`innerText` off `.hud`,
`dataset` off the rows, layout-aware — a `hidden` or unlaid-out region reads as
the empty string) and **FACTS** (the worker tee's `simulation/status-counts`
`counts` object and `simulation/event` payloads). Every time claim is in
simulation ticks read from `simulation/clock-state`.

## Reproduction

From the worktree root, with this agent's own port:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5325 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-what-the-game-tells-you.playtest.ts -g "act 1"
```

| act | what it plays | result |
| --- | --- | --- |
| `act 1` | a new prison, one Admit press, a cell built round it, and the band watched for 60 s of play | passed (2.5m) |
| `act 2` | twelve prisoners, no guards, 56 samples of every region over ticks 8,697–28,824, then the clearability pass | passed (6.9m) |
| `act 3` | what retires a sentence: a host refusal, an unenclosed rectangle, two identical refusals, an unaffordable purchase, and `New prison` | passed (1.0m) |
| `act 4` | a reload: a refusal on the band, `Save now`, `page.reload()`, and the prison loaded back | passed (56s) |

## 1. The band held one sentence for the whole session, and it was false

**MEASURED, act 2.** 56 samples, ticks 8,697 → 28,824 (day 4 → day 13). The
census of distinct sentences per region:

```
  band       ticks   8697.. 28824 (20127 ticks over 56 samples) :: Nothing was removed — there is no object on that tile, and none being built there.
  event-band ticks   8697.. 28824 (20127 ticks over 46 samples) :: No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt.
  event-band ticks  10148.. 10515 (367 ticks over 2 samples) :: A fight has broken out between two prisoners.
  event-band ticks  11627.. 26268 (14641 ticks over 8 samples) :: A riot has broken out — 12 prisoners have stopped taking orders.
```

and, printed by the same run:

```
  distinct sentences the refusal band showed across the whole run: 1
  distinct sentences the event band showed across the whole run: 3
```

**MEASURED.** The same sentence was already on the band before the room was
zoned — `buildAndPopulate`'s own log line, at the first designation attempt,
which happens after the wall queue empties at tick 3,069 and before the beds
finish at tick 5,629:

```
[census] designate attempt 1 at t+12429ms: rooms=1 | panel said ["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"] | band "Nothing was removed — there is no object on that tile, and none being built there."
```

**DERIVED.** The sentence therefore stood from before tick 5,629 to at least
tick 29,628 (the post-dismissal sample) — **≥ 24,000 ticks and ≥ 9 in-game day
boundaries**, through a successful zoning, 24 wall segments, 8 beds, a toilet,
12 admissions, 2 fights, 4 riots and 6 returns to calm.

**What produced it.** `calibrate()` arms `Remove` and presses empty tiles to
measure the screen-to-tile transform. A player does the same thing by accident:
the record `2026-09-04-the-hud-a-player-reads.md` — on
`origin/agent/playtest-the-hud-a-player-reads`, not merged at this cut — notes
Remove arrives armed, and `docs/research/2026-09-04-the-misplay.md` measured one missed
Remove press surviving an entire session. **This is issue
[#894](https://github.com/matmaxalez/lockstate/issues/894) and
[#780](https://github.com/matmaxalez/lockstate/issues/780), and this record
extends the horizon**: #894's reproduction is a refusal from tick 0 still on
screen on day 9; the previous round measured 14,237 ticks of it; this is ≥24,000
ticks in one continuous window with the state at every sample recorded beside
it.

**VERIFIED, read.** The behaviour is exactly what the code says it should be.
`src/ui/hud/hud.ts:1094-1098`:

> It does **not** auto-dismiss. A message that clears itself on a timer is a
> race against how fast the player reads, and there is no press to acknowledge
> it — so a host refusal stays until the same action later succeeds, and a
> simulation refusal until another replaces it or the session ends, which are
> the first moments each sentence stops being true.

**That last clause is the defect, and it is a claim about the world rather than
about the code.** "The first moments each sentence stops being true" is false for
`remove-object.nothing-to-remove`: the sentence is about one tile, and it stops
being relevant the instant the player does something else, not the instant
another refusal happens to arrive. `docs/adr/0091-what-clears-the-refusal-band.md`
decision 2 already priced this and recommended option **D** — *"any subsequent
decided outcome of a player command — success or refusal, any route — retires
whatever the band is currently showing"* — and it is **Proposed, not decided**.
This record is the measurement that option A ("do nothing further") costs a
session's worth of band.

## 2. The truth audit: 10 samples in 56 had a false sentence standing

**MEASURED, act 2.** The instrument evaluates each standing sentence against the
worker's own counts at the *same* sample:

```
=== TRUTH AUDIT: a standing sentence against the fact at that tick ===
  "no incident is still open" standing in 56 sample(s); FALSE in 10
  first false one: {"tick":10148,"day":"5","open":1,"text":"No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. Day 4 Warning Clear this alert"}
  "... right now" standing in 0 sample(s); FALSE in 0
```

**DERIVED.** 10/56 = **17.9%** of samples had the alerts column asserting *"No
incident is still open"* while `counts.activeIncidents` was 1.

**MEASURED, the same run, the final screen.** Three regions, three different
implied states, on one screen at one tick:

```
[final] tick=28824 day=13
  BAND    : "Nothing was removed — there is no object on that tile, and none being built there."
  EVENT   : "No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt."
  ALERTS  : 4 row(s)
      [x] event-1 :: A fight has broken out between two prisoners. 2× Day 5 Warning Clear this alert
      [x] event-2 :: No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. 6× Day 12 Warning Clear this alert
      [x] event-5 :: A riot has broken out — 12 prisoners have stopped taking orders. 4× Day 11 Critical Clear this alert
      [ ] refusal-13 :: Nothing was removed — there is no object on that tile, and none being built there. Warning
  strip: "... 0 INCIDENTS Clear ... "
```

The strip's incidents chip says `0 INCIDENTS Clear`. Two rows below it, in
`Critical`, the column says *"A riot has broken out — 12 prisoners have stopped
taking orders."* Both are painted from the same worker payload.

**Why the "right now" family scored zero, and what it does not prove.** The two
sentences that carry the literal words *right now* —
`hud.alert.event.economy.deliveries-refused` (*"Deliveries refused — the treasury
cannot cover a purchase right now."*) and
`hud.alert.event.economy.construction-refused` — never fired in this run: the
prison ran a surplus throughout (`treasuryMinorUnits` 23,450 → 45,050, wage bill
0 because it hired nobody). **UNKNOWN**, therefore, whether they go false in
play — but the mechanism is not in doubt. **VERIFIED, read**,
`src/ui/simulation-events.ts:519-531`: *"no row is ever removed for being wrong"*,
and the four exits from the list are the cap, `simulation/stopped`, a dismissal
and `simulation/ready`. A sentence whose subject is *"right now"* in a list
nothing corrects is false by construction from the tick after it is written.
Its true counterpart is `treasury.deliveries-refused` /
`treasury.construction-refused` in `counts.conditions`, and see §4.

## 3. Twelve events reached the screen as three rows, and the dates went with them

**MEASURED, act 2:**

```
=== SILENCE GAP: worker events vs rows on screen ===
  12 event(s) published, by type:
       6x incidents.all-clear-after-lapse
       2x incidents.assault-opened
       4x incidents.riot-opened
  first event tick 7700, last 26460
  rows standing at the end: 4
```

Four riots. The row that stands for all four reads:

```
      [x] event-5 :: A riot has broken out — 12 prisoners have stopped taking orders. 4× Day 11 Critical Clear this alert
```

**MEASURED**, from the census, the row's own history: `Day 5` → `2× Day 7` →
`3× Day 9` → `4× Day 11`. **Days 5, 7 and 9 are not recoverable from the
screen.**

**VERIFIED, read.** `src/ui/hud/alert-row-label.ts:50-51` composes the row from
`occurrences.lastAt` only:

```ts
    const at = occurrences.lastAt;
    if (at !== undefined) fragments.push(t(HUD_MESSAGE_KEY.alertsTime, { day: at.day, progress: at.progressPercent }));
```

and `withFurtherOccurrence` (`src/ui/simulation-events.ts:783-805`) updates
`count`, `lastAt` and `lastSequence` and nothing else. `firstSequence` is kept on
the model and rendered nowhere.

**One thing I expected to be a defect and is not, checked and cleared.**
`withFurtherOccurrence` spreads `...row`, so `labelParameters` — and therefore
the `{count}` in *"12 prisoners have stopped taking orders"* — is **never
updated** by a repeat. That looked like a frozen figure asserted about three
later riots. It is safe, and by construction rather than by luck:
`simulationEventIdentity` (`src/simulation/protocol/event-identity.ts:49-51`)
drops only `sequence` and `tick` and keys on everything else, so a riot with a
different participant count is a *different statement* and gets its own row. The
`4×` is therefore four riots that each had exactly 12 participants. **VERIFIED,
read**, both files.

**What the game never said anything about at all.** In the same run the strip
carried `4 with no bed` and `0 STAFF / Unguarded` from day 4 to day 13, and
`counts.conditions` was `["intake.no-place"]` in every logged sample — and the
alerts channel emitted **nothing** for any of it. The events census above is the
whole of what the prison reported in 20,127 ticks: incidents, and only
incidents.

## 4. The true sentence was computed, sent, and dropped at the HUD boundary

**MEASURED, act 1**, two samples 918 ticks apart around the moment the player
puts beds in:

```
counts at 1b (tick 3140): ... "conditions":["intake.no-place"]
counts at 1c (tick 4058): ... "conditions":[]
```

**MEASURED, act 2**, every logged sample of the long run:

```
      facts: activeIncidents=0 conditions=["intake.no-place"] unpaidWages=0 treasury=23450
      facts: activeIncidents=0 conditions=["intake.no-place"] unpaidWages=0 treasury=28250
      facts: activeIncidents=0 conditions=["intake.no-place"] unpaidWages=0 treasury=33050
      facts: activeIncidents=0 conditions=["intake.no-place"] unpaidWages=0 treasury=37850
      facts: activeIncidents=1 conditions=["intake.no-place"] unpaidWages=0 treasury=40250
```

So the mechanism works: the condition holds while four prisoners have nowhere to
sleep, and it clears the moment beds exist. **VERIFIED, read**,
`src/simulation/presentation/status-strip-projection.ts:253-283` —
`computeStandingPrisonConditions` walks the four `PRISON_CONDITIONS` members and
tests each predicate every publication:

```ts
        case 'intake.no-place':
          return input.waitingWithoutPlace > 0;
```

**VERIFIED, read.** Nothing under `src/ui/` reads that field.
`grep -rn "conditions" src/ui/ src/main.ts` returns five hits and **all five are
comments**; `src/ui/simulation-counts.ts` and `src/ui/hud/view-model.ts` do not
mention `conditions` at all, so the field crosses the wire and is dropped at the
translator. This is issue
[#930](https://github.com/matmaxalez/lockstate/issues/930), confirmed live at
v0.0.471 (`9429ba64`) and now with the cost attached: **for ≥24,000 ticks the game held the
true standing statement in memory and painted a false one in its place.**

## 5. What a player can clear: three of four rows, and not the one that is wrong

**MEASURED, act 2:**

```
=== CLEARABILITY ===
  3 of 4 row(s) carry a control.
  no control: ["refusal-13: Nothing was removed — there is no object on that tile, and none being built there. Warning"]
[after dismissing everything a player can] tick=29628 day=13
  BAND    : "Nothing was removed — there is no object on that tile, and none being built there."
  EVENT   : "No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt."
  ALERTS  : 1 row(s)
      [ ] refusal-13 :: Nothing was removed — there is no object on that tile, and none being built there. Warning
```

**A player who clears every row they are allowed to clear is left holding
exactly the false one.** This is `docs/HUD_PROJECTIONS.md` gap 34 — *"there is no
**player** gesture that dismisses a refusal — no 'close' button, no
main-to-worker message for it"* — measured at the end of a real session rather
than read off the document. **VERIFIED, read**,
`src/ui/hud/hud.ts:2092`: `const dismissible = alert.occurrences !== undefined;`
— and only `hudEventAlertsFromWorkerMessage`'s rows carry `occurrences`, so the
refusal row and the twelve `protocol/error` rows can never have a control.

**What does clear it, measured.** In act 3 the band was carried through: a
drawn-but-unenclosed rectangle, a second removal refusal, an unaffordable
purchase attempt — and cleared by exactly one gesture:

```
=== 3c-ii: the session ending is the other thing that clears it ===
  band before New prison: "Nothing was removed — there is no object on that tile, and none being built there."
[3c-ii-after-New-prison] tick=-1 day=1
  BAND    : ""
  ALERTS  : 1 row(s)
      [ ] empty :: No active alerts
```

**JUDGEMENT.** "Throw the prison away" is not a dismissal gesture.

## 5b. Reloading the page is the second clearing gesture, and nothing says so

**MEASURED, act 4.** A prison with a removal refusal standing, saved, the page
reloaded, and the same prison loaded back:

```
[4a-before-the-reload] tick=-1 day=1
  BAND    : "Nothing was removed — there is no object on that tile, and none being built there."
  ALERTS  : 1 row(s)
      [ ] refusal-13 :: Nothing was removed — there is no object on that tile, and none being built there. Warning

  save panel: "PRISONS | New prison | Save now | Export | Import | New Prison (3 gen) | Load | Delete | Saved (generation gen-mtnm3dg0-3)."

[4b-after-loading-the-prison-back] tick=-1 day=1
  BAND    : ""
  ALERTS  : 1 row(s)
      [ ] empty :: No active alerts
  counts: {... "treasuryMinorUnits":24600 ...}
```

The prison came back — the treasury is 24,600, which is the opening 25,000 less
the 400 the ten bricks cost — and **the sentence did not**. So a player has two
ways to clear the band after all: throw the prison away, or reload the browser.
**JUDGEMENT:** the second is not a gesture anyone would find, and neither is
documented; `docs/HUD_PROJECTIONS.md` gap 34 says *"there is no **player**
gesture that dismisses a refusal"*, which is true of anything inside the game
and misses that F5 is one.

**What this does NOT establish.** Whether ADR 0084 decision 4's promise — that a
dismissed *event* row stays dismissed and a restored session republishes its
rows — survives the same reload. This run produced **no events at all**
(`events: []`), because the queue-row cancel control I reached for was not where
I looked: the rows are `.hud-build__queue-row` inside `.hud-build__queue-list`
(`src/ui/hud/build-panel.ts:2128`, `:2195`), and my selector was
`.hud-build__queue .ui-icon-button`, which found none. **The `cancel controls in
the queue: 0` line in the log is a selector miss and not a finding**, and it is
recorded here so nobody reads it as one.

## 6. The same event, twice, saying the identical thing — and one event with two sentences

**MEASURED, act 3.** Two presses of `Remove` on empty tiles, the second on a
different tile from the first:

```
  the press produced: [{"type":"RemoveObject","x":16,"y":14}]
[3c-i-removal-refused] ... 
      [ ] refusal-14 :: Nothing was removed — there is no object on that tile, and none being built there. Warning
```

The row id went `refusal-13` → `refusal-14`. **The rendered text is
byte-identical.** A player pressing again and being refused again sees no change
at all: no flash, no count, no *"again"*. **VERIFIED, read** — this is by
construction: `src/ui/simulation-alerts.ts:328` keys the row
`refusal-${refusal.sequence}`, so it is genuinely a new row, and
`src/ui/simulation-alerts.ts:184`'s `REFUSAL_ROW_PREFIX` filter deletes the old
one; only `hudEventAlertsFromWorkerMessage`'s rows collapse into a run with a
`N×`. So refusals get a new row and no count; events get one row and a count.
**The one channel where repeating matters — "did my second press do anything?"
— is the one with no counter.**

**And the mirror case: one situation, two different sentences.** Pressing
`Admit` on a prison with nothing zoned is refused by the *host*
(`src/main.ts:2910-2923`, `if (viewModel.counts.rooms === 0)` →
`HostRefusalError('no-room-to-hold-anybody')`), and the band says:

```
[3a] tick=-1 day=1
  BAND    : "Nobody was admitted — this prison has no room to hold anybody."
  ALERTS  : 1 row(s)
      [ ] empty :: No active alerts
```

**Two surfaces, one moment, and they contradict each other**: the band is
showing a refusal in red and the log beside it says *"No active alerts"*
(`hud.alerts.empty`, `src/content/default-locale-en.ts:429`). **VERIFIED,
read** — a host refusal never crosses `sender.submit`, so it never becomes a
`RefusalLog` record and never becomes a row; `hudAlertsFromWorkerMessage` builds
refusal rows only from `message.payload.refusal`
(`src/ui/simulation-alerts.ts:316-332`). Every refusal decided on this thread —
fourteen `hud.refusal.*` keys, `src/ui/hud/projection.ts:1116-1165` — is
invisible to the log by construction. The alerts column is documented as *"the
log"* (`src/ui/simulation-alerts.ts:403-409`) and it is a log of half the
refusals.

## 7. The one thing that already does it right

**MEASURED, act 3.** Set the Buy quantity to 4,000 bricks against a treasury of
25,000 minor units:

```
  Buy submit: disabled=null aria-disabled="true"
  Buy row reads: "QUANTITY | − | + | Buy 4000 × Brick · 160,000 | Not enough money — you need 133,815 more. | Arrives while the clock runs, into the stock a build draws from."
  the control disabled itself, so this refusal has no sentence to give
```

No refusal is produced, none is needed, and the sentence that appears is
**present-tense, specific, recomputed from live state and placed where the hand
already is** — `hud.build.buy-shortfall`, *"Not enough money — you need {amount}
more."* (`src/content/default-locale-en.ts:1441`), with
`hud.security.hire-shortfall` (`:1686`) the same shape on the Staff panel. This
is the model for every proposal in §8. `docs/research/2026-09-04-the-misplay.md`
measured the same control and derived the figure; this record adds only that the
*absence* of a refusal is the feature.

**One mechanic for the next agent, paid for here.** `.hud-build__buy-submit`
marks itself with **`aria-disabled`, not `disabled`**. `getAttribute('disabled')`
returns `null` on a control Playwright will never click, and a naive
`.click()` waits out the whole test budget: the first version of act 3 spent
600 s doing exactly that. The same trap sits on `.hud-rooms__confirm`.

## 8. Proposals

Every string below is followed by the code that would render it and by why it
would be true. `AGENTS.md` reservation 4's release of 2026-09-04 gives us the
wording and keeps the requirement that the sentence be true of the code — so
each carries the predicate that makes it so. **I am read-only on `src/`; none of
this is implemented.**

### P1 — The band states a standing condition when one holds, and a refusal only when none does. *(the big one)*

**The measurement:** §1 and §4 together — for ≥24,000 ticks the band held a
false sentence about one tile while `counts.conditions` held
`["intake.no-place"]`, unread.

**The change:** carry `conditions` into `HudViewModel.counts` (one field through
`src/ui/simulation-counts.ts`, which today drops it), and give
`applySimulationRefusal`'s band a precedence rule: **while any
`PrisonCondition` holds, the band states the highest-ranked one; when none holds,
it falls back to the most recent refusal exactly as today.** A refusal then stops
being the thing on screen the moment the prison has a real, current problem, and
the band becomes a "right now" surface without needing ADR 0091 decision 2's new
band-only state.

**The four sentences, and what makes each true.**
`computeStandingPrisonConditions`
(`src/simulation/presentation/status-strip-projection.ts:253-283`) recomputes all
four every publication; each predicate is quoted from that function.

| condition | predicate, verbatim | proposed sentence |
| --- | --- | --- |
| `intake.no-place` | `input.waitingWithoutPlace > 0` | *"{count} waiting with nowhere to sleep — build beds or they stay in intake."* |
| `construction.unfunded` | `input.buildQueueUnfunded` | *"The build queue has stopped — there is no money for its materials."* |
| `treasury.construction-refused` | `treasuryMinorUnits <= rungFloorMinorUnits('construction', …)` | *"Construction is refused — the treasury is at its floor."* |
| `treasury.deliveries-refused` | `treasuryMinorUnits <= rungFloorMinorUnits('deliveries', …)` | *"Deliveries are refused — the treasury is at its floor."* |

Each is true exactly while its predicate holds and disappears when it stops
holding, because the array is rebuilt from the predicates on every publication —
which is the property `statusCountsEqual`'s `key === 'conditions'` branch
(`src/simulation/worker/status-counts.ts:135-143`) exists to publish. `{count}`
comes from `waitingWithoutPlace`, already on the wire as
`prisonersInIntake`/`no-place` (`hud.intake.no-place` renders `{count} waiting with no bed to sleep in` from it
today (`src/content/default-locale-en.ts:1592`), so the figure has a precedent, a
producer and a house style).

**What it costs:** a refusal about a genuinely current press would be outranked
by a standing condition. **JUDGEMENT:** that is the right trade — a condition is
about the prison and a refusal is about one press, and the player who just made
the press knows what they pressed. It also does not need ADR 0091 decision 2 to
be answered first; it is orthogonal, and it makes decision 2 cheaper by removing
the case where a stale refusal is the only thing the band could show.

### P2 — A refusal row that can be dismissed, and a band that clears with it. *(cheap, and it closes gap 34's remaining half)*

**The measurement:** §5 — a player who clears everything they can is left
holding exactly the false row, and the only clearing gesture in the game is
`New prison`.

**The change:** give the refusal row the same `×` control the event rows have,
and make dismissing it clear the band when the band is showing that refusal.
`src/ui/hud/hud.ts:2092` gates the control on `alert.occurrences !== undefined`;
the gate is the whole of what stops it. Unlike ADR 0084's event dismissal this
needs **no worker message and no save mark**: `RefusalLog.last` is republished
on the counts cadence, so a purely local "the player has read refusal ordinal N"
is enough — `applySimulationRefusal` already compares
`notice.sequence === simulationRefusalSequence` (`hud.ts:1438`) and would simply
also check the dismissed ordinal. That is the difference from gap 34's own
account of why it was not done: gap 34 says the refusal *"is a level,
republished unchanged … so retiring one means suppressing a value the worker
keeps re-asserting"*, and suppressing it **by ordinal** on the main thread is
exactly what #777's fix already showed is safe to do with that ordinal.

**No new string.** `HUD_MESSAGE_KEY.alertsDismiss` already names the control and
`hudAlertDismissLabel` already resolves it once per paint
(`src/ui/hud/alert-row-label.ts:70-74`).

### P3 — Say "again" when the same press is refused twice. *(cheap)*

**The measurement:** §6 — `refusal-13` → `refusal-14`, byte-identical text.

**The change:** `RefusalLog` already keeps a historical tally
(`src/simulation/refusals/refusal-log.ts:164-169`, *"a historical tally of how
many times"*, explicitly **not** affected by `supersede`). Put that run count on
the refusal payload and render it through the fragment the event rows already
use — `HUD_MESSAGE_KEY.alertsOccurrences`, rendered by
`alert-row-label.ts:49` when `count > 1`. **No new string**: the same `N×`
fragment, on a row that today cannot show one. A player pressing Remove on empty
tile after empty tile would see `3×` rather than the same sentence three times.

### P4 — The all-clear rows say when, not what is. *(wording only)*

**The measurement:** §2 — *"No incident is still open"* standing in 56 of 56
samples, false in 10.

**The change:** the two all-clear keys are the only rows in the catalogue whose
main clause is a **present-tense claim about the prison's current state** rather
than about a thing that happened. Every other row survives standing for ever
because *"A fight has broken out"* stays true of the past.
`hud.alert.event.incidents.all-clear` (`default-locale-en.ts:1150`) and
`…all-clear-after-lapse` (`:1201`) do not. Reword them so the subject is the
transition:

- `hud.alert.event.incidents.all-clear`: *"The last incident closed — the prison
  was back under control."*
- `hud.alert.event.incidents.all-clear-after-lapse`: *"The last incident ran out
  of time instead of being contained, and everyone caught in it was hurt."*

**Why each would be true, forever, in a list nothing corrects.**
`reportAllClearIfCalm` emits only when `IncidentLog.openIncidentCount` is zero
(`src/simulation/incidents/response-system.ts`, and the existing key's own
docblock at `default-locale-en.ts:1167-1169` pins that guard), so *"the last
incident closed"* is a fact about the tick it was written and stays true. The
lapse clauses are unchanged — the existing docblock already pins each of them to
`lapse`'s own behaviour (`injuredEntityIds: [...incident.participantIds]` with no
condition, `isPastDeadline` for the deadline clause), and dropping only the
leading *"No incident is still open — but"* removes the one clause that goes
false. **This is the smallest possible change with the largest truth effect:
delete a present-tense clause from two strings.** The band still says the right
thing at the moment it is painted, because the band is the moment.

### P5 — Keep the first date on a collapsed row. *(cheap, wording included)*

**The measurement:** §3 — four riots on days 5, 7, 9, 11 render as `4× Day 11`.

**The change:** `HudAlertOccurrencesViewModel` already carries `firstSequence`,
and `alertTime` already turns a tick into a day. Carry a `firstAt` beside
`lastAt` (`withFurtherOccurrence`, `src/ui/simulation-events.ts:783-805`, keeps
`...occurrences` so the field survives repeats for free) and render, when
`count > 1` and the two days differ, *"Day {first}–{last}"* in place of
`HUD_MESSAGE_KEY.alertsTime`'s single day. **True by construction**: both ends
come from `projectClockPosition`, the one piece of clock arithmetic in the
codebase, which is the reason `alertTime` uses it at all
(`simulation-events.ts:819-824`).

### P6 — Two sentences that should be one, and the log that should hold both

**The measurement:** §6 — the band showed a host refusal while the column said
*"No active alerts"*.

**The change:** two parts, both small. (a) Route host refusals into
`HudViewModel.alerts` as a third row family — `src/ui/simulation-alerts.ts`
already partitions by id prefix (`REFUSAL_ROW_PREFIX`, `FAULT_ROW_PREFIX`) and
`reportError` in `hud.ts:1370` already has the resolved `messageKey` in hand, so
the row is one `replaceOrAppend` call and **no new string at all**. (b) Where a
host sentence and a simulation sentence describe the same failure, make them the
same words — the owner's ruling 23 of 2026-08-31, *"Te same słowa co host"*,
already did this for `hire.insufficient-funds` and `purchase.insufficient-funds`
(`src/ui/simulation-alerts.ts:299-309`). The pair it has not reached:
`hud.refusal.cancel-material-purchase` (*"Nothing was refunded — the request was
refused and the delivery is still on its way."*, `:2148`) and
`hud.alert.refusal.cancel-purchase.not-pending` (*"Nothing was refunded — that
delivery is not on its way any more."*, `:578`). **These two assert opposite
facts about the same delivery.** The host one is reachable only when there is no
session at all (`src/ui/hud/messages.ts:1278-1283` says so in terms), so *"the
delivery is still on its way"* is a claim about a delivery that cannot exist —
**UNKNOWN whether a player can reach it**, and I did not reach it in this pass;
it is named as the sharpest instance of the class rather than as a measured
defect.

## What I did not reach

- **Insolvency.** The prison ran a surplus for the whole session (23,450 →
  45,050, wage bill 0), so `economy.wages-unpaid`,
  `economy.deliveries-refused` and `economy.construction-refused` never fired
  and the *"right now"* family scored 0 of 0 in the audit. §2's claim about them
  is VERIFIED from the code, not MEASURED in play. Playing a prison into the
  overdraft floor and re-running the same audit is the obvious next act.
- **The cap.** `MAX_EVENT_ALERT_ROWS` is 8 (`src/ui/simulation-events.ts:488`)
  and this session produced 12 events collapsing to 3 rows, so the cap was never
  approached and **I did not measure what a full column does or which rows
  `SEVERITY_EVICTION_ORDER` drops in play**. The collapsing rule makes the cap
  much harder to reach than the row count suggests.
- **Whether an *event* row survives a reload.** Act 4 established that the
  refusal and its row do not (§5b), and produced no event rows to test the other
  half with, for the selector reason §5b records. ADR 0084 decision 4 says they
  should; nobody has played it.
- **The panel notes.** The census covers the two bands, the alerts column and the
  strip. The Build, Rooms, Staff and Regime panels each carry sentences I sampled
  only incidentally.
- **`git log -S` dating** of when `hud.ts:1094-1098`'s *"the first moments each
  sentence stops being true"* became false. §3 of `docs/AGENT_WORKFLOW.md` asks
  for it and I did not do it.

## My weakest claim

**That the false all-clear row is read by a player as a claim about now.** The
row carries `Day 4` or `Day 12` beside the sentence, so a careful reader has the
information that it is historical; my audit counts it false on the sentence
alone. Ten of fifty-six is a real measurement of the *sentence*, not of the
reading. **What would change my mind:** a player — or an eye-tracking-shaped
substitute, a screenshot shown to someone cold — reading that column and
correctly saying "that all-clear is about Day 4, not now". What keeps me on it is
the band: **the event band showed the same sentence with no day beside it at all
in 46 of 56 samples**, and there the historical reading is not available even in
principle.

**Second weakest:** the §1 claim that the band's sentence stood for ≥24,000
ticks. The 20,127 ticks between the first and last *sample* are directly
measured; the extension back to before tick 5,629 rests on one `buildAndPopulate`
log line that prints the band beside a designation attempt whose tick I did not
print. If that line is wrong the figure falls back to 20,127 ticks, which changes
nothing about the finding.
