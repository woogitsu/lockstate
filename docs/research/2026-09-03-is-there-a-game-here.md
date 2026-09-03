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
