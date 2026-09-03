# Is there a game here? — a working prison, run for forty-eight days

**Date:** 2026-09-03
**Branch:** `playtest/is-there-a-game-here`, cut from `origin/main` at `f7adf652` (v0.0.419)
**Instruments:** `tests/browser/playtest-2026-09-03-is-there-a-game-here.playtest.ts`,
`tests/browser/playtest-2026-09-03-twenty-prisoners-ergonomics.playtest.ts`
**Status:** WORK IN PROGRESS — the runs are in flight; sections below are filled as
they land. Nothing in this file is a decision, and nothing in it is a fix.

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

