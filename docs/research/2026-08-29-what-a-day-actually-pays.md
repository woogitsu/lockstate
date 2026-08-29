# Playtest: what a day actually pays, and what "~150/day" was measuring

**2026-08-29.** Mouse-driven playtest against `origin/main` at `05640b6`
(v0.0.210), Chromium at 1440x900, driving the real assembled page
(`index.html` + `src/main.ts`) through a `Worker` tee that records every
command sent and every reply received. The harness is
`playtest-economy.spec.ts`, on the branch `agent/playtest-mouse-2` and
**deliberately not in this tree** — it is a reproduction, not a gate, for the
reason `2026-08-29-mouse-playtest.md` gives about its own.

It answers [#601](https://github.com/matmaxalez/lockstate/issues/601): the
brief that went to nineteen models says *"a neglected twelve-prisoner prison
earns about 150/day while three guards cost 240/day. The loop closes, and it
closes tightly."* #601 shows the arithmetic cannot hold — the withholding
schedule floors at 60 per resident, so twelve paid places cannot gross under
720 — and offers three readings without choosing between them.

**This record chooses.** Reading 1 is true about the *prison*; reading 3 is
true about the *number*; reading 2 is available but did not happen. And the
prison was not neglected, which is a fourth thing nobody had considered.

## How every claim here was obtained

`docs/research/README.md`'s tiers were written for research into other games.
Nothing here is of that kind, so the mapping is stated once:

- **VERIFIED** covers every claim below unless a line says otherwise, and means
  one of two first-party things: a number pasted verbatim from a run of
  `playtest-economy.spec.ts` against a real Chromium, or a `file:line` in this
  repository that was opened and read.
- **SEARCH-SUMMARY** and **FROM MEMORY** do not occur. No external page was
  consulted and no figure is carried on belief.
- **UNKNOWN** is marked inline, in §5 and §6.

## 0. Calibration, re-derived rather than carried

Tile (0,0)'s top-left is screen **(-304, -574)** at 1440x900, one tile 64
screen px. Measured by bisecting a `RemoveObject` probe on bare ground, the
same method and the same answer as `2026-08-29-mouse-playtest.md` §0 and
`2026-08-29-playtest-ordering-and-the-second-room.md` §3. The brief handed to
this pass carried `(-224, -512)`; that is the same rule
`(viewportW/2 - 1024, viewportH/2 - 1024)` at a 1600x1024 viewport and is not
portable. Re-derived, not trusted.

## 1. The prison that was built, with the mouse

Six wall runs of six segments each around tiles (12,12)-(17,17) — 24
`PlaceBuildOrder` commands, every one from a real mouse drag — then the
rectangle zoned as a Cell, then three beds and a toilet placed by pressing
tiles, then twelve presses of **Admit a prisoner**. Verbatim from the run:

```
wall run north: 6 command(s) -> ["12,12 north","13,12 north","14,12 north","15,12 north","16,12 north","17,12 north"]
wall run south: 6 command(s) -> ["12,18 north","13,18 north","14,18 north","15,18 north","16,18 north","17,18 north"]
wall run west:  6 command(s) -> ["12,12 west","12,13 west","12,14 west","12,15 west","12,16 west","12,17 west"]
wall run east:  6 command(s) -> ["18,12 west","18,13 west","18,14 west","18,15 west","18,16 west","18,17 west"]
at tick 4150: rooms=1 roomCapacity=3 accommodationCapacity=3
3 bed order(s) + 1 toilet placed
```

**It works.** A prison can be built from nothing with the mouse. What it cost
this pass to get there is §4.

## 2. The measurement #601 asked for

Two consecutive day boundaries, pasted from the run. `prisoners` is the roster,
`roomOccupants` is the resident count, and they are printed separately because
that is the whole of #601's complaint:

```
=== DAY BOUNDARY at tick 9599 ===
last sample before:  {"tick":9596,"prisoners":12,"prisonersInIntake":9,"rooms":1,
                      "roomCapacity":3,"accommodationCapacity":3,"roomOccupants":3,
                      "treasuryMinorUnits":23175,"stateIncomeAccruedTodayMinorUnits":898,
                      "dailyWageBillMinorUnits":0,"unpaidWagesMinorUnits":0,"staff":0}
first sample at/after:{"tick":9637,...,"treasuryMinorUnits":24075,
                      "stateIncomeAccruedTodayMinorUnits":14,...}
treasury delta across the boundary = 900 | accrual just before = 898 | roster = 12 | residents = 3

=== DAY BOUNDARY at tick 11999 ===
last sample before:  {"tick":11965,...,"treasuryMinorUnits":24075,
                      "stateIncomeAccruedTodayMinorUnits":887,...}
first sample at/after:{"tick":12005,...,"treasuryMinorUnits":24975,...}
treasury delta across the boundary = 900 | accrual just before = 887 | roster = 12 | residents = 3
```

So, for a twelve-prisoner prison with three beds:

| quantity | value |
| --- | --- |
| roster (`prisoners`, the status strip's PRISONERS) | **12** |
| residents (`roomOccupants`) | **3** |
| in intake, never housed (`prisonersInIntake`) | **9** |
| credited at the day boundary | **900**, twice, exactly |
| per resident | **300** — the full rate, nothing withheld |
| staff, wage bill, unpaid wages | 0, 0, 0 |

## 3. Which reading is true

**Reading 1 — "most of that population was not housed" — is true about the
prison and does not produce 150.** Twelve on the roster, three residents, nine
permanently in intake. #601 called this "the reading with the fewest
assumptions" and "a materially different and worse finding than 'income is
tight'", and the prison it describes is exactly the prison a player builds.
But #601 then placed 150 between `2 x 60 = 120` and `3 x 60 = 180`, and that
step is wrong for a reason nobody had: **the floor never applies.**

**The prison was not neglected.** `stateIncomeForPrisonerDay`
(`src/simulation/economy/income.ts:326`) returns
`300 - 40 x unmetNeeds`, and 900 credited for three residents is `3 x 300`
exactly — `unmetNeeds` was **0** at both boundaries, after the residents had
lived in the cell for the better part of two in-game days. A housed prisoner
sleeps, and their needs stay above `STATE_INCOME_UNMET_NEED_LEVEL` (51,
`income.ts:226`). The nine who are *not* housed have needs that do decay — and
they contribute nothing either way, because they are not residents. **There is
no reachable state in which twelve people on the roster earn 12 x 60.** The
withholding schedule is not tight in this session; it is inert.

**Reading 3 — "150 was a mid-day reading of the prorated accrual" — is true
about the number, and is the only reading that produces 150 in a real
session.** `stateIncomeAccruedByTick` (`income.ts:391`) derives EARNED TODAY as
`grant x ticksServed / DAY_LENGTH_TICKS`. With a 900 grant, the chip passes
through 150 about a sixth of the way into the day. Pasted from the same run's
series — a *twelve*-prisoner prison, on screen, reading 151:

```
t=9922  roster=12 inIntake=9 residents=3 cap=3 accrued=121 funds=24075
t=9963  roster=12 inIntake=9 residents=3 cap=3 accrued=136 funds=24075
t=10004 roster=12 inIntake=9 residents=3 cap=3 accrued=151 funds=24075
t=10045 roster=12 inIntake=9 residents=3 cap=3 accrued=167 funds=24075
```

and the same figure a day earlier:

```
t=7538 roster=12 inIntake=9 residents=3 cap=3 accrued=127 funds=23175
t=7579 roster=12 inIntake=9 residents=3 cap=3 accrued=142 funds=23175
t=7619 roster=12 inIntake=9 residents=3 cap=3 accrued=157 funds=23175
```

**Reading 2 — "a net treasury delta over a window including purchases or
hiring" — is available and did not happen here.** With `staff: 0` there is no
recurring debit at all: `dailyWageBillMinorUnits` and `unpaidWagesMinorUnits`
were 0 at every sample, and the boundary delta is therefore gross income
exactly. It becomes the live reading the moment a guard is hired — §7.

### The sentence that should replace the brief's

The brief's number is not wrong about what was on screen. It is wrong about
what the number *is*: **it is a partial-day accrual, not a day's income, and
the population it belongs to is three, not twelve.** The day that prison
actually earns is **900**. Written the way the brief wrote it: *a prison with
twelve on the roster and three beds earns 900/day, of which every minor unit
is paid for the three people who have somewhere to sleep.*

**No economy sink should be sized against 150.** The figure to size against is
`300 x residents`, and residents is bounded by beds, not by admissions.

## 4. Why "twelve prisoners, three beds" is the prison a player builds

Nothing about that ratio was contrived. It is what the game does when you press
the one control it offers:

- **Admission does not check for a free bed, and says so.** `requestAdmission`
  (`src/simulation/prisoners/prisoner-operations-runtime.ts:701`) refuses only
  `no-accommodation` (no room instance of an accommodation type at all) and
  `population-full`. A zoned cell with three beds accepts a twelfth admission
  as readily as the first. The Intake panel states this, verbatim from
  `src/content/default-locale-en.ts:598`: *"A prison needs a cell before it can
  admit anyone. It does not need a free bed: an arrival with none waits until a
  bed is free."*
- **The warning fires and is accurate.** After twelve presses,
  `.hud-intake__no-place` carried `data-without-place="9"` — *"9 waiting with no
  bed to sleep in"*. Measured.
- **The status strip counts all twelve.** `prisoners` is
  `population.total` (`src/simulation/presentation/status-strip-projection.ts:460`).
  Verbatim from the strip at that moment:
  `12 | PRISONERS | 0 | STAFF | 1 | ROOMS | ... | 23,175 | FUNDS | 234 | EARNED TODAY | DAY | 4 | 26%`.

So the player sees **12 PRISONERS** and **EARNED TODAY 234**, and there is no
number anywhere on screen that says **3**. Which is §5.

## 5. `roomOccupants` crosses the worker boundary and reaches nobody

**VERIFIED, by grep over the whole repository.** `roomOccupants` is computed in
the status-strip projection (`status-strip-projection.ts:406-417`), declared in
the protocol schema (`src/simulation/protocol/types.ts:671`), and published on
every `simulation/status-counts`. Outside `src/simulation/**` there is not one
reader: `src/ui/simulation-counts.ts` translates `prisoners`,
`accommodationCapacity`, `staff`, `rooms`, `activeIncidents`,
`contrabandDiscovered`, `treasuryMinorUnits` and
`stateIncomeAccruedTodayMinorUnits`, and drops `roomOccupants` on the floor.
The only consumers on disk are test fixtures and this playtest's own tee.

**That is the one number that distinguishes "twelve on the roster" from "three
being paid for", and it is the one number a player cannot see.** The whole of
#601 is a confusion between those two figures, made by people reading the
screen.

**What would establish the cause:** nothing further — the grep is the mechanism
and the files are open.
**What would establish the impact: UNKNOWN.** Whether a player would use the
figure if it were there cannot be read from this repository, and nobody plays
the game yet. What *can* be said without a player is that the confusion this
record was commissioned to resolve is exactly the confusion the missing figure
would have prevented, in a brief written by the person who owns the game.

**Handed over, not acted on.** This is `src/ui/**` and this pass is read-only
on `src/`. An agent owns residency capacity and `src/simulation/economy/income.ts`
in this same session; the change contemplated here is neither of those.

## 6. Two things about the strip's own arithmetic, stated as observations

- **The occupancy bar has a capacity of 3 and a value of 12.** `occupancyTone`
  (`src/ui/hud/projection.ts:133`) returns `'danger'` above ratio 1, and the
  segmented bar's `valueText` is `"{value} of {capacity}"`
  (`src/content/default-locale-en.ts:175`), so *"12 of 3"* is authored. It did
  not appear in the strip's `innerText` at any sample — the strip read
  `12 | PRISONERS` throughout. **UNKNOWN whether it is visually present**: this
  pass read `innerText` and did not read the segmented bar's own DOM or its
  computed styles. Cheapest falsification, written down rather than named:
  print `.hud-strip` `outerHTML` for the prisoners chip at a moment when
  `prisoners > capacity`, and read the bar's label node and its
  `getBoundingClientRect`.
- **The accrual chip is honest and unlabelled as partial.** EARNED TODAY is
  `stateIncomeAccruedTodayMinorUnits` and its own doc comment
  (`status-strip-projection.ts:473-491`) says why it must be derived from the
  same walk the boundary credits from rather than from a count. Nothing on
  screen distinguishes "150 so far today" from "150 a day", and the brief read
  it as the second. No cause and no impact are claimed; it is a product
  question.

## 7. The other half of the loop — TO BE FILLED

## 8. Smaller things this pass measured while playing

- **The Rooms panel called a finished 6x6 wall "open" at the instant the
  simulation accepted it.** Pasted, at 1440x900, twelve seconds after the Build
  panel said the queue was empty:

  ```
  Build panel says the queue is empty at page t=3996ms, tick 2497
  designate attempt 1 at t+11529ms: rooms=1 | panel said ["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"]
  ```

  `rooms=1` and *"OPEN ON AT LEAST ONE SIDE"* in the same breath. This is
  `2026-08-29-playtest-ordering-and-the-second-room.md` §7, reproduced
  independently at a different room size and a different viewport, with the
  consequence attached: the panel's note was wrong and the simulation was
  right. Nothing new is claimed about the cause; that record's snapshot-poll
  hypothesis is the one to test.
- **The refusal band latches, still.** The whole time — through 24 wall orders,
  a designation, four object placements and twelve admissions — `.hud__refusal`
  read *"Nothing was removed — there is no object on that tile, and none being
  built there."*, earned by the calibration probe's single press on bare ground
  at tick 0. Same finding as that record's §8; recorded because it survived a
  much longer session than the one that first found it.
- **`simulation/status-counts` stops being published by an idle prison, and
  the tick goes with it.** `statusCountsEqual`
  (`src/simulation/worker/status-counts.ts`) skips a publication whose payload
  equals the last, and `tick` lives in the envelope *beside* `counts` rather
  than inside it — so a session with nothing changing publishes once and then
  never again, however long it runs. The first version of this harness polled
  that tick and reported the simulation frozen at 0 while construction was
  visibly progressing. **Not a defect** — the skip is deliberate and documented
  at `CLOCK_STATE_PUBLISH_INTERVAL_MS`'s neighbour comment — but it is a real
  trap for anything outside the HUD that treats the counts message as a clock,
  and it is written down here so the next harness does not lose ten minutes to
  it.

## 9. What this pass did not reach

- A player. Every impact statement above is withheld for that reason.
- Risk tiers 2-3, contraband and incidents: `0 INCIDENTS Clear` throughout.
- Any viewport other than 1440x900.
- Save/load of *this* prison. `2026-08-29-mouse-playtest.md` §3 covers a
  mouse-built prison across a reload; nothing here re-derives it.
- Whether the segmented bar's "12 of 3" is on screen (§6).

## Weakest claim, and the cheapest thing that would falsify it

**Weakest: that the brief's 150 is the EARNED TODAY chip rather than something
else that also lands near 150.** What is established is that a twelve-prisoner
prison with three beds displays 151 mid-day and credits 900 at the boundary,
and that no other on-screen figure in this session was near 150 at any sample.
What is *not* established is what the owner was looking at.

**The cheapest measurement that would falsify it, written down rather than
named:** ask the owner whether the 150 came from the EARNED TODAY chip, and if
so roughly how far into the day the clock read. If it came from the FUNDS line
instead, reading 2 returns and §7's numbers are the ones that matter.

**Second weakest: that a housed prisoner's needs stay met indefinitely.** Two
boundaries at `3 x 300` establish it for about two in-game days of residency.
It is asserted for no longer than that. Cheapest falsification: run the same
prison for ten in-game days and read whether any boundary credits less than
`300 x residents`.
