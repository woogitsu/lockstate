# Is there a game here? — a working prison, run for forty-eight days

**Date:** 2026-09-03
**Branch:** `playtest/is-there-a-game-here`, cut from `origin/main` at `f7adf652` (v0.0.419)
**Instruments:** `tests/browser/playtest-2026-09-03-is-there-a-game-here.playtest.ts`,
`tests/browser/playtest-2026-09-03-twenty-prisoners-ergonomics.playtest.ts`
**Status:** complete. Three instruments run, all green; the INCIDENTS question
is **settled** (§5) and the branch's own question is answered in §10. Nothing in this file is a decision, and nothing in it is a fix.

> **The one-line answer to the question this branch was cut for.** The INCIDENTS
> chip is **not** a defect: in 20.4 in-game days with no guards it published
> `activeIncidents: 1` at 178 of 1,255 publications and at all 15 publications
> inside the one incident window whose length is known exactly. §5 has the
> sample and the refuting sample. The `DEFECT` label stays withdrawn.
>
> **And the finding that came out of asking:** the Staff panel's only piece of
> advice, *"Hire 2 to cover this population"*, buys coverage and buys **no
> incident response at all** — 13 fights, 0 answered, 24 prisoners injured,
> `respondersDispatched: 0`, beside a readout saying *"This prison has the
> guards it asks for."* Six more hires flipped it to 12 answered of 12, and the
> readout did not change one character. §9.

> `.playtest.ts` is collected only by `tests/browser/playwright.playtest.config.ts`.
> **Nothing in CI runs either instrument.** A playtest is evidence, never a gate.

## 0. What this pass was asked, and what it is not

Every other pass over this repository this week hunted defects. This one was
asked to judge whether the game is worth playing: *what is fun, what is not,
what to change, what to improve, what to remove* — against the owner's standing
design directive of 2026-09-03, in their words, **"gra ma być łatwa przyjazna do
grania, a nie jakieś ukryte funkcje"**: easy and friendly to play, not full of
hidden features.

It is deliberately **not** the first twenty minutes. A companion pass judged
those. This one starts where they stop: build a prison that actually works —
cells with beds, a canteen, a kitchen, a shower room, a laundry, a common room,
a yard, a delivery bay and a store; guards hired; twenty prisoners admitted —
and then **run it for a long time and ask whether there is a game here.**

Every item below is labelled `DEFECT` (the code does not do what it says) or
`DESIGN` (the code does what it says and what it says is not enough). They are
never merged. A measurement is not a diagnosis and a cause is not an impact:
where this note says "and the game never made me care", that is the design claim
sitting on top of the measurement above it, and it is marked as such.

## 1. Method

Two instruments, one long and one wide, both driving the real application in
Chromium at 1440×900 through `tests/browser/playwright.playtest.config.ts`.

**Instrument A — `playtest-2026-09-03-is-there-a-game-here.playtest.ts`.**
Builds a nine-room prison and then presses nothing for twenty minutes while
sampling every twenty seconds. The prison is: a 6×5 cell block with twelve beds
and two toilets, a 6×6 canteen with two dining tables and four benches, a 4×4
kitchen with a stove, a prep counter and a fridge, a 3×3 shower room with two
shower heads, a 3×3 laundry with two washing machines, a 5×5 common room with
three benches, an 8×8 outdoor yard, a 4×4 delivery bay with a loading dock door
and a 3×3 store with two racks. Each walled room gets one door. That is every
room in `src/content/room-catalog.ts` that any entry in `DEFAULT_ACTIONS`
(`src/simulation/prisoners/actions.ts`) actually targets, plus the two logistics
rooms.

**Instrument B — `playtest-2026-09-03-twenty-prisoners-ergonomics.playtest.ts`.**
Builds only the cell block and spends its budget on the interaction surface
instead: an inventory of every visible control on all five tabs with its enabled
state, the press cost of five routine things, whether one prisoner is reachable,
and whether overspending on staff can kill a prison.

### Everything is built through the typed coordinate route, and that is a method note

Both instruments place every order through `.hud-build__coordinates` and
`.hud-rooms__coordinates` — type a tile x, a tile y, pick north or west, press
Place order — rather than by dragging on the map. Issue #878 records why: a drag
that passes under a HUD island is silently truncated, a four-segment run
produced one command, and roughly 84 of the 308 on-screen tiles were reliably
reachable at this viewport. A playtest that dragged would be measuring #878
rather than the game.

**The consequence is that every press count in this note is the count for the
route a player is told is the fallback.** `hud.build.coordinates-hint` reads
*"The keyboard route. Pointing at the map is quicker."* Where a number below is
a press count, it is the typed route's, and the drag route's own count is given
beside it wherever the two differ.

### The clock, and what a look-away costs in wall time

Measured once, over ten wall seconds at ×4, on this container with eleven other
Playwright processes running and a load average of 22: **96.6 simulation ticks
per wall second** (tick 406 → 1372). A day is 2,400 ticks, so ×4 buys about 25
wall seconds per in-game day, and a twenty-minute look-away is roughly 48
in-game days.

**Every wall-clock number in this note was taken under that load and none of
them is a performance claim.** Tick counts and press counts are not affected by
it; press *durations* are, and are marked where they appear.

## 2. The headline: how long you can look away

**`DESIGN`. Thirty-three in-game days, and the game asked for nothing.**

Run 1 built a prison, admitted twenty prisoners, hired six guards, and then
pressed nothing at all. Every twenty wall seconds it read all nine status-strip
chips, the alerts column, the refusal band and the whole regime roster. It was
stopped by hand at 1,013 wall seconds. In that window:

| | at the start | at the end |
| --- | --- | --- |
| tick | 122,894 | 203,724 |
| day | 52 | 85 |
| PRISONERS | 20 | 12 |
| STAFF | 6 | 6 |
| INCIDENTS | 0 | **0** |
| CONTRABAND | 1 | 5 |
| FUNDS | 15,135 | **98,175** |
| EARNED TODAY | 678 | 1,133 |

**80,830 ticks — 33.7 in-game days — with no input.** Nothing broke, nothing
was ever owed a decision, and the prison got monotonically richer. What
happened in that window was not nothing: the alerts column recorded **26
fights** (`"A fight has broken out between two prisoners. 26× Day 78"`), five
contraband finds, and nine releases. Every fight was followed by `"The prison is
under control again — no incident is still open."` with the same running count.
So the prison had 26 fights and resolved 26 fights without ever needing a
player.

That is the finding this pass was sent to get, and it is the most important one
in this note: **there is no game here yet.** Everything below is either an
elaboration of why, or a defect found on the way.

### The INCIDENTS chip read 0 at all fifty samples while 26 fights fired

`INCIDENTS 0` with the badge `Clear` was on screen at every single sample,
including the ones where the alerts column had just added a fight.

**This was labelled `DEFECT` in an earlier draft of this note and that label
was not earned.** `IncidentLog.openIncidents()` returns the *non-terminal*
incidents, and `INCIDENT_STATES` runs `active → notified → responding →
resolved | lapsed` with the last two terminal — so a chip reading 0 is
**correct** if every one of those 26 fights opened and finished between two
consecutive samples, and run 1's samples were twenty wall seconds apart, which
at ×4 is about **1,930 ticks**. A sample interval three orders of magnitude
longer than the thing being sampled is not evidence of anything. The correction
is kept here rather than overwritten because the mistake is the instructive
part: the measurement was real and the label was a guess.

`playtest-2026-09-03-does-the-incidents-chip-lie.playtest.ts` settles it
instead, by removing both the interval and the responder: an **in-page**
observer polls the chip every 50 ms (about five ticks at ×4, and no Playwright
round trip to be starved by a loaded box), pairs every new fight row with what
the chip read at that instant, and the prison is built with **zero guards** so
nothing can respond to an incident and shorten its life. Its verdict is §5.

### `DESIGN` — the prison empties itself, and nothing refills it

PRISONERS fell 20 → 19 → 15 → 13 → 12 across the window, entirely through
`"1 released — their sentences are served."` (nine of them). **Nothing brings a
prisoner in except the player pressing Admit.** So an unattended prison does not
degrade, it *drains*: the population trends to zero, the population-linked
income trends to zero with it, and the only thing that ever grows is the
treasury.

The consequence for pacing is worth stating plainly. In Prison Architect the
intake is a *pressure* — prisoners keep arriving whether you are ready or not,
and that is the engine of the whole game. Here intake is a button. A prison left
alone becomes emptier and richer, which is the opposite of a management game's
default direction.

### `DESIGN` — money is not a constraint after the build

The treasury grew from 15,135 to 98,175 in 33.7 days: about **+2,464 a day
against a 480-a-day wage bill**, with twelve to twenty prisoners. Nothing else
was ever spent. The whole nine-room prison cost 13,525 to build, so by day 85 a
neglected prison holds seven times its own construction cost and has nothing to
spend it on.

## 3. The repeated decision, and whether it has a trade-off

A management game lives on one decision the player makes over and over. This
one has an inventory of controls rather than a loop, and instrument B counted
it: every visible, pressable control on every tab.

| tab | controls that *do* something | what they are |
| --- | --- | --- |
| OVERVIEW | **1** | `Admit a prisoner` |
| BUILD | 21 catalogue rows + a category select + `Place on map` / `Remove` / `Buy` + a quantity stepper + a buy submit + a coordinate form of six steppers and `Place order` | placement |
| ROOMS | 18 room-type rows + a four-field coordinate form + `Use these tiles` / `Draw on map` / `Remove rooms` | zoning |
| SECURITY | **2** | `Guard` (the only role row) and `Hire Guard · 80` |
| REGIME | **0** | two `Collapse` buttons and nothing else |

Plus, on every tab, three transport buttons, five tab buttons, an interface-scale
button and six prison-file buttons (`New prison`, `Save now`, `Export`,
`Import`, `Load`, `Delete`).

**So the repeated decision is "where do I put the next wall".** Build and Rooms
hold 39 of the 43 controls that touch the prison, and the other four are Admit,
Hire, and the role row you have to select before hiring.

### `DESIGN` — the repeated decision has no trade-off, because everything is affordable

A trade-off needs two things you cannot both have. In run 1 nothing competed:
the treasury paid for every room in the plan on day 1 with 11,475 left over, and
then grew by 2,464 a day for the rest of the run. Material prices never move —
`src/content/procurement-catalog.ts` says so in its own header, and says why:
*"One price per unit, and it never moves… there is nothing to gain by buying
early."* So "what do I build next" has a right answer (all of it, in any order)
rather than a choice.

The one place the game does state a real cost is the Staff panel: `Hire Guard ·
80` with *"Costs 80 now and 80 a day in wages."* That is a genuine ongoing
commitment — and it buys nothing observable, which §4 measures.

### `DESIGN` — the Regime tab is read-only, and that is where the loop should live

The Regime panel shows two timetables running at once — in one sample,
`General Population 43% THROUGH / Allows Work, Education, Free Association`
above `High Risk 35% THROUGH / Allows Sleep, Meal, Hygiene` — and **offers no
control to change either**. The blocks, their order, their lengths and which
population gets which are all fixed content.

This is the single largest missed loop in the build. Every action a prisoner can
take is gated by a regime block (`src/simulation/prisoners/actions.ts` targets
rooms; `regime.ts` decides which category is allowed when), so the timetable is
already the lever that decides whether the shower room you paid for is ever
used. Prison Architect's regime editor is the whole reason its rooms matter.
Here the game computes the consequence of a timetable the player cannot touch.

**What it would take is not new simulation.** The blocks exist, the categories
exist, and the panel already renders them. What is missing is the ability to
reorder or re-length them and a command to carry the change.

## 4. Where the tension is

Nowhere yet. Taken one candidate at a time, against run 1's samples.

### Money — `DESIGN`, no tension
Measured in §2: monotonic growth to seven times the prison's build cost. The one
mechanism that could bite is payroll, and 480 a day against 2,464 a day of
income never came close. There is an overdraft floor
(`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS = -2,500`,
`src/simulation/economy/treasury.ts:295`) and nothing in an ordinary run walks
towards it.

### Safety — `DESIGN`, and this is the sharpest one
Six guards were hired and **never assigned to anything**. The Staff panel said
so, in these words, both before and after the six hires:

```
GUARD COVERAGE
0 of 0
Covered
This prison has the guards it asks for.
...
ON DUTY
0 held · 6 free
Nobody is assigned right now.
```

Meanwhile the strip's COVERAGE chip read **exactly the PRISONERS count at every
sample** — 20/20, 19/19, 15/15, 13/13, 12/12 — with the badge `Covered`. The
chip's value is `counts.prisonersCovered`
(`src/ui/hud/projection.ts:844`), and `projection.ts:373` states the rule it
follows: *"a prison with nobody in a sector has all the coverage it needs."*

So: **a prison with no sectors is fully covered by definition, and safety is
free.** `safety` never once appeared as any prisoner's leading need in fifty
roster samples. The pressure the earlier `2026-08-26-failure-modes.md` record
found — an unhoused arrival's safety decaying to zero and a riot at tick 15,600
— is not reachable in a prison that has a cell, because a cell is all it takes
to be "covered".

That also makes the six guards' 480 a day the purest possible bad deal: paying
for something the game already gives you.

### Needs — `DESIGN`, and the player cannot see them
Across fifty samples the roster's need column named exactly three needs:
**Hygiene**, **Hunger** and **Bladder**. `Sleep`, `Safety` and `Recreation` were
never named once. The roster shows **four rows**, one need each, for a
population of twelve to twenty — so at twenty prisoners a player can read the
leading need of 20% of their prison and nothing about the other 80%, and there
is no per-prisoner detail panel to open.

### Incidents — `DESIGN`, they happen and they do not matter
26 fights in 33.7 days is roughly **one fight every 31 in-game hours**, which is
frequent enough to be the game's pulse. Each one self-resolved, cost nothing
observable, moved no chip, and produced two alert rows. A threat that resolves
itself is set dressing.

### Contraband — `DESIGN`, a counter with no consequence
CONTRABAND went 1 → 5 and the chip carried the name of the last item found
(`Tool`, then `Currency`, then `Drugs`). Nothing was ever asked of the player
about any of it — no search to order, no cell to shake down, no control anywhere
on the Security tab.

### Overcrowding — the one real demand the game made, and it is inert
Twenty admissions into twelve beds left **eight prisoners at `Cell Assignment`
for the rest of the run**. The game says so clearly and in three places at once:
the PRISONERS chip grows a `8 with no bed` badge, the Intake panel reads
`8 waiting with no bed to sleep in` and `IN INTAKE 8 of 20`, and its hint
explains the rule. **That is the only thing in 33.7 days that pointed at a job
for the player** — and it is a standing notice rather than a pressure: nothing
about those eight got worse, no alert escalated, and the eight were still there
33 days later.


## 5. The INCIDENTS chip: **NOT a defect.** The label is withdrawn for good

**Instrument:** `tests/browser/playtest-2026-09-03-does-the-incidents-chip-lie.playtest.ts`
**Run:** 2026-09-03, tree `e128023` (v0.0.422 + this branch), 11.8 wall minutes,
green. Full log committed beside this note at
[`2026-09-03-is-there-a-game-here/chip-run.log`](./2026-09-03-is-there-a-game-here/chip-run.log).
**Sample:** a prison with **zero guards**, twelve prisoners, six beds, one
zoned cell — so nothing can answer an incident and every one of them runs the
full length of its deadline.

### What was measured

| | |
| --- | --- |
| ticks watched | 5,507 → 54,571 (**49,064 ticks, 20.4 in-game days**) |
| `simulation/status-counts` publications observed | **1,255** |
| every distinct `activeIncidents` value ever published | **`[0, 1]`** |
| publications that published `activeIncidents > 0` | **178 of 1,255 (14.2%)** |
| incidents opened | **12** (1 assault, 10 riots, 1 escape attempt) |
| incidents `resolved` | **0** |
| incidents `lapsed` | **12** |

**The chip reaches 1, it names the kind, and it is on screen for a seventh of
the run.** Each of those 178 publications carried `activeIncidentType` as well
as the count — `"assault"` for the first burst, `"riot"` for the rest — so the
badge read *Assault* and *Riot* rather than the generic *Active*.

The tight measurement is the assault, because it is the one incident whose open
window is known exactly. It opened at tick **6,900**. `responseDeadlineTicks` is
600 and no responder could ever be claimed, so it was open until 7,501:

```
assault opened at tick 6900: 15 publication(s) in [6900,7501]
   -> activeIncidents [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
```

**Fifteen publications inside the window, fifteen of them reading 1**, the first
at tick 6,902 — two ticks after the incident opened. There is no lag and there
is no gap.

### The refuting sample, and it refuted nothing

37 pulls of `hud/incidents` were taken beside the chip, reading the same
`IncidentLog` the chip's projection reads. The direction of every disagreement
that could have convicted the chip — **ground truth open while the chip says
zero** — was checked at each one. Four pulls found `stillOpen=1`, and the chip
had published `1` at all four:

```
tick 13316: IncidentLog stillOpen=1 [active=1,...] | chip published 1
tick 28067: IncidentLog stillOpen=1 [active=1,...] | chip published 1
tick 37352: IncidentLog stillOpen=1 [active=1,...] | chip published 1
tick 51902: IncidentLog stillOpen=1 [active=1,...] | chip published 1
```

Three further pulls read `stillOpen=1` beside a last-published `0` — at ticks
22,771, 46,727 and 48,062 — and **that is this instrument's own artifact, not a
lag in the game.** The loop fetches the counts series, writes a log line that
awaits a `currentTick` round trip, and only then pulls; so the `chip published`
column is stale by however long those two awaits took. The assault window above
is the clean measurement and it has no such ordering, which is why the verdict
rests on it.

### So what was the earlier measurement?

Exactly what §2's own correction said it was: a sampling artifact. Run 1 read
the chip every twenty wall seconds, which at ×4 is ~1,930 ticks; an incident is
open for ~610. Fourteen per cent of publications carrying a `1` is a coin that
comes up tails six times out of seven, and run 1 flipped it fifty times at
intervals three times longer than the thing it was measuring.

**The `DEFECT` label was withdrawn on this branch before it was relayed, and
this run is why it should stay withdrawn.** Recorded at length rather than
deleted, because the instructive part is that the *measurement* was real both
times and only the label was wrong.

### What the brief for this probe got wrong, corrected

The probe was briefed on the argument that removing every guard removes the only
thing that can move an incident to a terminal state. It does not.
`LEGAL_TRANSITIONS` (`src/simulation/incidents/incident.ts:24`) gives `active`
the edge `active → lapsed`, so an unanswered incident still terminates itself.
What zero guards actually buys is a **known dwell time** — 601 ticks, from
`responseDeadlineTicks: 600` (`response-system.ts:27`) and `isPastDeadline`
(`:601`) — and that is what made the sample decisive.

## 6. What the same run found on the way, none of it about the chip

Every item here was read off the same log. Each is labelled `DEFECT` (the code
does the wrong thing), `HIDDEN` (it does the right thing and a player cannot
find it — a defect under the owner's directive of 2026-09-03) or `TASTE` (it
works, it is discoverable, it is not fun).

### 6.1 `HIDDEN` — twelve unanswered incidents, and the prison said it was under control every time

All twelve incidents `lapsed`: nobody responded, and `lapse`
(`src/simulation/incidents/response-system.ts:604`) injures **every**
participant and damages property in proportion to severity. The worst of them,
verbatim from the ground-truth pull:

```
incident.riot.10  type=riot  state=lapsed  severity=10  participantCount=10
  outcome={ injuredCount: 10, propertyDamage: 10, escaped: false }
  requiredResponders=5
```

Ten prisoners in a riot, ten of them injured, maximum property damage, nobody
sent. What the alerts column said about it, verbatim:

```
A riot has broken out — 10 prisoners have stopped taking orders.  Day 20  Critical
The prison is under control again — no incident is still open.   11×  Day 22  Info
```

**A contained incident produces those same two rows.** `reportAllClearIfCalm`
(`response-system.ts:268`) runs on *both* terminal transitions and is suppressed
only when an escape was announced, so nothing in the game distinguishes "your
guards put it down" from "it burned out on its own and everyone in it was
hurt". The two outcomes are materially different in the code — the `resolved`
branch (`:834`) writes `injuredEntityIds: []` and `propertyDamage:
floor(severity/2)`, against `lapse`'s every-participant and `min(10,
severity)`, plus `LAPSED_INCIDENT_SURCHARGE_POINTS`
(`src/simulation/prisoners/disciplinary-record.ts`) on each participant's
record — and identical in what the player is told.

**This is the class of the defect #683 fixed the instance of.** That issue was
"a successful escape and a contained attempt produced the same two rows", and
the owner's ruling of 2026-08-30 authored `hud.alert.event.incidents.escape-succeeded`
for it. It fired correctly in this run and it is the one place the distinction
reaches the player:

```
Carla Duarte broke out — no guard reached them in time.  Day 21  Critical
```

The assault, the riot and the gang retaliation have no such sentence.
`docs/AGENT_WORKFLOW.md` §3: fix the class, not the instance.

**What a fix must convey** — the wording is the owner's alone: that the
incident *ended without a response*, and that this cost more than a contained
one would have. Nothing here proposes a sentence.

**The refuting sample.** If any of the twelve had actually been contained, the
all-clear would have been telling the truth and there would be no finding. The
ground-truth pull answers it outright: `countsByState` ends
`resolved=0, lapsed=12`, and `responseMetrics.incidentsResolved` is `0`. There
was nothing to be under control about.

### 6.2 `HIDDEN` — the read model that would answer "what did that cost me" is built, paged and pulled by nothing

Everything quoted in 6.1 came out of `hud/incidents`. That projection is
complete: `active` rows, a paged `resolved` list, `summary` with
`totalInjured` / `totalPropertyDamage` / `escapes`, `countsByState`,
`countsByType`, `triggerMetrics`, `responseMetrics` — and per row a
`severityBar` and a `propertyDamageBar`, which are `BoundedValue`s, i.e. *bar
view models somebody built for a bar*. `hud/incident-detail` adds the
participant list and the full state timeline.

`grep -rn 'hud/incidents\|hud/incident-detail' src/` finds them declared in
`src/simulation/protocol/types.ts:344`, projected in
`src/simulation/worker/projection-catalog.ts:417` and `:435`, and referenced
from **no file under `src/ui/` and not from `src/main.ts`.** Same for
`hud/prisoner-detail` (`types.ts:338`).

`src/main.ts:1391` already says what this costs, in the repository's own words:

> #450 spent ~4,200 lines making a prison capable of going wrong — an incident
> writes a disciplinary record, `ClassificationReviewSystem` rewrites the
> prisoner's tier and group from it, and `ActionSystem` puts them on a
> different timetable — and the whole of what reached the player from that
> chain was `activeIncidents`, one integer on one stat tile.

This run is that sentence measured. It is also the sharpest instance of the
owner's directive — *"nie jakieś ukryte funkcje"* — in the build.

**Where the chain does reach the player, and credit where it is due.** The
strip's HIGH RISK chip went **0 → 9** across the run while PRISONERS fell 12 →
9: every surviving prisoner was reclassified to high risk off the disciplinary
records those twelve lapsed incidents wrote. So the loop runs and its *output*
is on screen. What is missing is any way to connect the nine to the twelve.

### 6.3 `TASTE` — the riot is a metronome, and you could set a watch by it

Every riot in the run, by the tick it opened:

```
8300  13100  17900  22700  27500  32300  37100  41900  46700  51500
```

The gaps: **4800, 4800, 4800, 4800, 4800, 4800, 4800, 4800, 4800.** Nine
intervals, no variance, and 4,800 is exactly
`DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`
(`src/simulation/incidents/trigger-system.ts:84`).

The trigger is saturated: conditions are hot continuously, so a riot opens on
the first tick it is permitted to, forever. The quiet period is not a floor on
the rate here, it *is* the rate. Nothing is wrong — `sampleSectorRisk` and the
sustained-hot window are doing what they were written to do — but the effect is
that the prison's headline threat arrives on a fixed timetable a player could
learn, and that no action of theirs visibly moved it.

That the assault fired **once** in 20.4 days against its own 2,400-tick quiet
period is the other half of the same reading: `IncidentTriggerSystem` prefers
the riot when the sector is hot (`:309` skips a sector that already has one
open), so the per-prisoner trigger the flashpoint model was built for barely
gets a turn.

### 6.4 The Rooms panel's stale enclosure verdict still reproduces

**Confirmed, not new.** Recorded in
[`2026-08-31-playing-the-nine-changes.md`](./2026-08-31-playing-the-nine-changes.md)
§3a and [`2026-08-29-playtest-ordering-and-the-second-room.md`](./2026-08-29-playtest-ordering-and-the-second-room.md)
§7. Reproduced verbatim on today's tree, from this run's log:

```
designate attempt 1 at t+7620ms: rooms=1
  | panel said ["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"]
```

The panel's live verdict (`hud.rooms.enclosure-open`, *"Open on at least one
side"*) was on screen for an enclosed rectangle, and the designation the player
would have been discouraged from making succeeded on the first press. No new
diagnosis is offered here and none of the earlier passes' cause is re-derived.

### 6.5 Withdrawn: §4's claim that a populated prison always reads *Covered*

§4 above says a prison with no sectors is fully covered by definition and that
safety is therefore free, on a Staff panel reading *"GUARD COVERAGE 0 of 0 /
Covered"*. **On this tree, with twelve prisoners and no guards, the panel reads
the opposite** — verbatim:

```
GUARD COVERAGE | 0 of 2 | Unguarded
Nobody is on duty. Hire 2 to cover this population.
No guard is posted here, so nobody in this sector is kept safe.
```

and the strip's COVERAGE chip read `0` with the badge `Unguarded` at the start
of the run and at the end of it. `requiredGuardCountFor`
(`src/simulation/security/deployment-system.ts:100`) scales the requirement
with occupancy, `Math.ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD)`
over a floor of 1, so twelve prisoners ask for two and the readout says so.

Marked as a withdrawal rather than edited away, per
`docs/AGENT_WORKFLOW.md` §4. What produced §4's reading is not established
here, and this note does not guess: the two runs built different prisons, and
"I measured the opposite, I do not know why the earlier reading differed" is
the whole of the claim.

**The question §4 was reaching for survives the correction and is sharper than
it was**, and it is what `playtest-2026-09-03-what-a-guard-buys.playtest.ts`
was written to settle: the panel asks for two, `DeploymentSystem` posts both of
them, and `IncidentResponseSystem.claimableResponders`
(`src/simulation/incidents/response-system.ts:453`) draws responders from
`claimableGuardIds` — which is `unassignedGuardIds()` filtered by post
eligibility (`src/simulation/security/post-eligibility.ts:103`). **A guard on a
post is not in that list.** Meanwhile this run's own ground truth prices the
response: `requiredResponders` was **2** for the assault, **4** for the escape
attempt and **5** for the riot. So a twelve-prisoner prison that wants its
riots answered needs the two the panel asks for *plus five more*, and nothing
in the game says so. That is a prediction until the staged run reports.

## 7. Nine numbers, and nothing to press

**Instrument:** `tests/browser/playtest-2026-09-03-can-a-player-drill-in.playtest.ts`
**Run:** 2026-09-03, tree `c5e24a6` (v0.0.425), 1.4 wall minutes, green.
Log at [`2026-09-03-is-there-a-game-here/drill-run.log`](./2026-09-03-is-there-a-game-here/drill-run.log).

`HIGH RISK` went 0 → 9 on its own in §5's run. `INCIDENTS` went 0 → 1 and back
eleven times. `PRISONERS` fell 12 → 9. So the question is what a player can do
with a number that moved. Every chip was pressed:

```
the strip carries 9 chip(s): ["prisoners","high-risk","staff","coverage",
                              "rooms","incidents","contraband","funds","earned-today"]
chip "prisoners"    <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "high-risk"    <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "staff"        <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "coverage"     <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "rooms"        <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "incidents"    <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "contraband"   <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "funds"        <div> cursor=auto -> NOTHING CHANGED commands 0->0
chip "earned-today" <div> cursor=auto -> NOTHING CHANGED commands 0->0
every [data-metric] chip's tag: DIV,DIV,DIV,DIV,DIV,DIV,DIV,DIV,DIV
```

### `HIDDEN` — the strip is nine read-only divs, and one of them is documented as pressable

**Nine `div`s, `cursor: auto` on every one.** `createStatChip`
(`src/ui/primitives/stat-chip.ts:60`) builds the root as `element('div', {
className: 'ui-stat', ... })` and wires no listener, and
`src/ui/hud/status-strip.ts` contains no `click` at all.

`src/ui/hud/projection.ts:792` says of the HIGH RISK chip, in its own comment:

> The Regime tab's own icon: this chip is the count of the prison that tab's
> restricted timetable applies to, **and pressing it is what a player reading
> the chip would go on to do.**

That sentence is right about the player and the affordance does not exist. It
is the cleanest statement in the repository of what §5's §6.2 measures: a
number is published, a reader is expected to want more, and there is nowhere to
go. With no incident surface anywhere (§6.2), no prisoner detail panel and no
pressable chip, the strip is a dashboard on a machine with no dials.

### The honest limit of this instrument, stated because it matters

The `NOTHING CHANGED` column is **not** evidence on its own, and the run says
so itself. The control — a Rooms catalogue row, which is a real
`button[role=radio]` with `cursor: pointer` and certainly does something —
*also* reported `NOTHING CHANGED`:

```
CONTROL: a Rooms catalogue row <button[role=radio]> cursor=pointer -> NOTHING CHANGED
```

Selecting a radio row changes the radio's own state and the arm label, and the
snapshot this probe takes (active tab, panel collapse states, open dialogs, the
refusal band, the HUD's text length) is blind to both. **So the control failed
to validate the column, and the column is discarded.** What stands is the part
the control *did* discriminate: the chips are `div`s with `cursor: auto`, the
control is a `button` with `cursor: pointer`, and no listener exists on the
former. A successor sharpening this should snapshot `aria-checked`,
`data-selected` and the arm label rather than the text length.

### The Regime panel, verbatim, on a new prison

```
REGIME | Collapse | TODAY'S BLOCKS
General Population | 0% THROUGH | Allows Sleep
High Risk | 0% THROUGH | Allows Sleep, Meal, Hygiene
PRISONERS | 0 of 0 | No prisoners yet. Build a cell with a bed to take somebody in.
```

Two timetables side by side, one control on the panel (`Collapse`), and zero
roster rows to press. This confirms §3's inventory by pressing rather than by
counting, and it is where §5's measurement lands: those twelve lapsed incidents
moved nine of nine prisoners onto the **High Risk** line above — *Allows Sleep,
Meal, Hygiene* — and the player can neither see that it happened nor change
either timetable. **The one causal loop the simulation runs end to end
terminates in a control that does not exist.** That is the single most useful
sentence this pass can offer about whether there is a game here.

## 8. `HIDDEN` — the one loop that already works is the one nothing tells you about

Read off §5's zero-guard run, which hired nobody and therefore had **no wage
bill at all**, so every movement in the treasury is income:

| | day 3 | day 23 |
| --- | --- | --- |
| FUNDS | 23,880 | 47,800 |
| EARNED TODAY | 385 | 808 |
| PRISONERS | 12 | 9 |

**+23,920 over twenty in-game days: about 1,196 a day.** Now the code's own
prices. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` is **300**
(`src/simulation/economy/income.ts:115`), and the grant per prisoner is

```
Math.max(0, 300 - 40 * unmetNeeds)      // income.ts:411
```

with `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at **40** (`:347`). So
a prison of nine to twelve prisoners serving every need would take **2,700 to
3,600 a day**, and this one took 1,196.

**Roughly two thirds of the grant was being withheld, every day, for twenty
days, and nothing anywhere said so.** That is the finding: six needs at 40 each
means a fully served prisoner is worth **five times** a wholly neglected one
(300 against the floor of 60), which is a genuinely steep incentive attached to
the exact activity the player already spends 39 of the 43 controls on — build
the rooms that serve the needs. It is the one closed loop in the build where the
player's ordinary action has a large, immediate, economic payoff.

And it is invisible. The `earned-today` chip carries `tone: undefined, badge:
undefined, description: undefined` (`src/ui/hud/projection.ts:1053-1055`), so
it is a bare number. Nothing in `src/content/default-locale-en.ts` contains the
word *withheld* or *unmet* in any player-facing string, and no field on the
status-counts payload carries the withheld amount, so the number is not even
available to a panel that wanted it.

**What a fix must convey** — the wording and the presentation are the owner's:
that today's income is short of what the population could earn, and that the
shortfall is unserved needs. Nothing here proposes a sentence, a chip or a
panel.

**The refuting sample.** If the arithmetic were being read wrongly, the run
would have earned near the full grant and the gap would be my error rather than
the game's. `earned-today` at day 23 was **808** against nine prisoners: 90 a
prisoner where 300 is the ceiling, which is the same shortfall the
twenty-day average shows, taken from a different chip on a different day.

**The weakest claim here, named** (`docs/research/README.md`'s rule): the
per-prisoner figures above are divisions of a whole-prison total by a headcount
that fell 12 → 9 during the window, so "about 4 to 5 needs unmet per prisoner"
is an inference and is not measured. What *is* measured is the gap between
1,196 and 2,700, and the gap is the finding. A successor wanting the
per-prisoner truth should read `hud/prisoner-roster`, which publishes the
leading need per prisoner, rather than dividing.

## 9. The best finding in this pass: the game's only staffing advice buys coverage and buys no response

**Instrument:** `tests/browser/playtest-2026-09-03-what-a-guard-buys.playtest.ts`
**Run:** 2026-09-03, tree `c5e24a6` (v0.0.425), 15.4 wall minutes, green.
Log at [`2026-09-03-is-there-a-game-here/guard-run.log`](./2026-09-03-is-there-a-game-here/guard-run.log).
**Shape:** one prison, one session, two phases. Six beds, twelve prisoners, one
cell. Phase A hires **exactly the two the Staff panel asks for**. Phase B hires
six more and changes nothing else.

### The two phases, side by side

| | **phase A** — 2 hired | **phase B** — 8 hired |
| --- | --- | --- |
| ticks watched | 11,911 → 39,584 (11.5 days) | 41,537 → 69,743 (11.8 days) |
| Staff panel headline | `2 of 2 · Covered` | `2 of 2 · Covered` |
| the sentence under it | *"This prison has the guards it asks for."* | *"This prison has the guards it asks for."* |
| `ON DUTY` | **`2 held · 0 free`** | **`2 held · 6 free`** |
| COVERAGE chip | `12 · Covered` | `11 · Covered` |
| incidents in the phase | 13 | 12 |
| **`incidentsResolved`** | **0** | **12** |
| `incidentsLapsed` | 12 | 1 |
| **`respondersDispatched`** | **0** | **28** |
| `routeFailures` | 0 | 0 |
| `totalInjured` (cumulative) | 24 | 26 |
| CONTRABAND chip | **0** | **6** |
| payroll | 160 a day | 640 a day |

### `HIDDEN` — what the numbers say

**In phase A the prison answered nothing.** Thirteen fights, twelve of them run
to the end of their deadline, twenty-four prisoners injured, and
`respondersDispatched: 0` — not one guard was ever sent to one incident. And
throughout it the game's staffing readout said `2 of 2 · Covered · This prison
has the guards it asks for.`

**In phase B, with six more hires and nothing else changed, it answered almost
everything.** Twelve incidents, twelve resolved, one lapsed,
`respondersDispatched: 28`, and only two further injuries.

**And the readout is character-for-character the same in both.** `2 of 2 ·
Covered · This prison has the guards it asks for` is what the player is shown
in the state where every incident is contained *and* in the state where none of
them is. The one difference visible anywhere is a single line further down the
same panel — `2 held · 0 free` against `2 held · 6 free` — and nothing in the
game says what a free guard is for. The only copy near it is
`hud.security.held-hint`, *"A released guard stays hired and goes back to the
pool."*

The mechanism, and it is not a bug in any of its parts:

- `DeploymentSystem.assignUnassignedGuards` posts guards up to the sector
  requirement, and `requiredGuardCountFor`
  (`src/simulation/security/deployment-system.ts:100`) scales that requirement
  with occupancy. Twelve prisoners ask for two.
- `IncidentResponseSystem.claimableResponders`
  (`src/simulation/incidents/response-system.ts:453`) needs
  `requiredResponderCount(severity)` guards and draws them from
  `claimableGuardIds`, which is **`unassignedGuardIds()`** filtered by post
  eligibility (`src/simulation/security/post-eligibility.ts:103`).

A guard on a post is not unassigned. So the number the panel asks for is
exactly the number that leaves the responder pool empty, and each system is
right about its own half.

**Phase B's hire is also the first thing that switched contraband on.** The
CONTRABAND chip read `0` for the whole of phase A and for the whole of §5's
zero-guard run, and reached `6` in phase B — *"Contraband found: Phone. 4×"*,
*"Currency"*, *"Drugs"*. `SearchSystem` draws from the same free-guard pool, so
one undocumented threshold gates two entire subsystems.

**What a fix must convey** — the wording, the presentation and whether to
change the *numbers* instead of the words are all the owner's: that the guards
a prison "asks for" are the ones who stand posts, that answering an incident
needs guards who are not standing one, and roughly how many. This run prices
it: `requiredResponders` in the ground truth was **2** for an assault
(severity 3), **4** for an escape attempt (severity 7) and **5** for a riot
(severity 10). Nothing here proposes a sentence.

### The refuting sample, and it is the important part

The phases are consecutive in time, so **the obvious alternative explanation is
that the flip is age, not the hire.** Three separate readings kill it:

1. **`respondersDispatched` went 0 → 28 across the hire, and
   `claimableResponders` is its only producer.** Phase A ran 27,673 ticks and
   thirteen incidents without dispatching a single guard. A time effect does not
   produce a counter that stays at exactly zero for eleven and a half in-game
   days and then moves twenty-eight times in the next eleven.
2. **`routeFailures: 0` in both phases**, so this is not guards failing to walk
   somewhere in one phase and succeeding in the other.
3. **The trigger conditions did not change.** Phase A's assaults opened at
   ticks 9000, 12550, 14950, 17350, 19750, 22150, 24550, 26950, 29350, 31750,
   34150, 36550, 38950 — eleven consecutive gaps of exactly **2,400**, which is
   `DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT`. Phase B kept producing them at
   the same rate (`incidentsTriggered` 13 → 25 over a comparable window). The
   prison was equally hot on both sides; only the answer changed.

### And §6.1's finding, now with both arms of the comparison

Phase B's alerts column, verbatim, after twenty-five fights of which **twelve
were contained by guards and thirteen were not**:

```
A fight has broken out between two prisoners.        25×  Day 29  Warning
The prison is under control again — no incident is still open.  25×  Day 29  Info
```

Two rows and two counts, both reading 25. Phase A's column, after thirteen
fights of which **zero** were contained:

```
A fight has broken out between two prisoners.        13×  Day 17  Warning
The prison is under control again — no incident is still open.  13×  Day 17  Info
```

The same two sentences with different numbers. This is §6.1 measured from both
sides in one prison: **nothing the player is shown distinguishes a prison whose
guards contain every fight from one whose guards contain none of them.**

### `TASTE` — and here the money finally does something

Phase B's payroll is **640 a day** against income the same run measured at
roughly 725 a day (FUNDS 39,160 → 47,680 over 11.75 days). That is the first
state in either run where the wage bill is the same order as the income, and it
arrives exactly when the player buys the thing that makes the security half
function. So the trade-off §3 went looking for and did not find *does* exist —
it is "pay 88% of your income to make incidents matter" — and it is unreachable
because nothing tells the player the purchase exists.

## 10. So: is there a game here?

**There is a simulation here and about a third of a game, and the missing part
is the player's hands rather than the model.**

The model works. Across §5 and §9 this pass watched, in a running browser: a
per-prisoner flashpoint score open assaults; unanswered incidents injure
everyone in them, damage property, and write disciplinary points with a
surcharge for lapsing; those records reclassify prisoners (`HIGH RISK` 0 → 9 in
§5) onto a restricted timetable; a state grant that pays five times more for a
prisoner whose needs are served than for one whose are not; a responder pipeline
that dispatches twenty-eight guards and contains twelve of thirteen incidents
the moment the pool has anybody in it; and a contraband system that switches on
with it. None of that is stubbed.

What is missing is every place a player would reach in:

- **the loop closes on a control that does not exist.** Incidents →
  disciplinary record → risk tier → *the High Risk timetable*, and the Regime
  panel has one button on it and it says `Collapse` (§7).
- **the one purchase that makes the security half work is unnamed**, and the
  one readout that could name it says the same thing whether you have made it
  or not (§9).
- **the one economic loop that already rewards ordinary play is unmeasured
  on screen** (§8).
- **nothing that happens can be inspected.** No incident surface on any tab,
  no prisoner detail, and nine strip chips that are `div`s (§6.2, §7).

That ordering is also the recommendation, and none of these is new
architecture: three of the four are a projection that already exists finding a
panel, and the fourth is a command for a timetable the panel already draws.

**The weakest claim in this note, named.** Every measurement here comes from one
prison shape — a single 6×6 cell block, six beds, twelve prisoners, one sector,
`×4`. A prison with a canteen, a yard and a shower room serves more needs, earns
more, and may produce a different incident mix entirely; §5's riot metronome and
§9's assault metronome are both single-sector readings. What would change my
mind about §10 is a run of the nine-room prison of §1 with eight or more guards
hired: if the incident rate there is need-driven rather than quiet-period-driven,
the "metronome" reading is an artifact of an under-built prison and the game has
more tension in it than this note found.
