# Playtest: rooms, designation, construction and build orders

**Date:** 2026-09-01
**Branch played:** `docs/playtest-rooms-2026-09-01`, cut from `origin/main` and
merged forward once more during this session, most recently at `27400bcd`
(v0.0.325). The branch adds one instrument under `tests/browser/` and this
record; it changes nothing under `src/`.

**The assignment.** Play the rooms/designation/construction/build-order
surface in a real browser -- dragging a room on the world grid, the Rooms
panel, the removal tool, walls, build-order execution and its ordering, what
happens when a build is impossible, and what the player is told at each step
-- and report what a player would actually see, not what the store holds.

**Instrument:** `tests/browser/playtest-2026-09-01-rooms.playtest.ts`, run one
act at a time with

```
LOCKSTATE_BROWSER_TEST_PORT=<port> ./node_modules/.bin/playwright test \
  -c tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-01-rooms.playtest.ts -g "act N" --reporter=line
```

and once as the whole file. It reads a shared harness, `playtest-harness.ts`,
already used by three other playtests in this repository (`playtest-economy`,
`playtest-into-the-lock`, `playtest-just-in-time`); nothing in it was written
for this pass except the file itself and its own `findFreeTile`/`armingReadout`
helpers.

**Contention.** This session ran on a box with several other agents' browser
suites throughout. One-minute load average ranged from about 11 to 34 across
the pass; a first full-file run stalled for several minutes mid-act-2 and then
lost its dev server entirely once act 2's own 600s test timeout fired, failing
acts 3 and 4 on `net::ERR_CONNECTION_REFUSED` -- an infrastructure casualty of
the contention, not a finding, and every act below was **re-run in isolation,
on its own dev-server port, and is reported from that isolated run**. No
finding in this record rests on a duration, a frame rate or a wall-clock
figure; where a run took an unusual amount of time that is noted as context
only.

## Claim tiers

- **MEASURED** -- this pass ran it in a browser and the output below is
  pasted from that run.
- **VERIFIED, read** -- a file was opened at the line cited and quoted.
- **REASONED** -- follows from a MEASURED or VERIFIED fact stated beside it.

## Summary of results

| act | subject | result |
| --- | --- | --- |
| 1 | the two map controls (#689, #735) and the tab hand-back | clean -- no defect found |
| 2 | build-order execution order (ADR 0082) | clean, **after fixing the instrument's own geometry** -- ADR 0082 holds live |
| 3 | what the panel says when a designation cannot work | **one real, reproducible defect** -- a stale refusal can describe a success as a failure -- found **after fixing the instrument's own coordinates** |
| 4 | what a finished object gives back (ADR 0076) | clean, **after fixing the instrument's own missing room** -- ADR 0076's second amendment holds live, for both a bed and a wall |

Three of the four acts needed a correction to the instrument itself before
they measured what they were written to measure, and each correction is
recorded below with the wrong reading it produced first, because a
reproduction that hides its own false starts teaches the next reader nothing
about why the fix was necessary. All three are committed on this branch.

---

## Correction to the brief, before anything else: ADR 0082 does not describe today's behaviour

The brief this playtest was given says *"Build orders execute in an order
that is random relative to placement (ADR 0082). Can a player tell? Does it
surprise them?"* -- describing ADR 0082 as the standing rule. Read in full,
ADR 0082 is the opposite: its **Context** section measures and names the old,
random-relative-to-placement behaviour as the defect (*"So build orders are
carried out in an order that is a uniformly random permutation of the order
the player placed them in, and nothing in the code or the interface says
so"*, `docs/adr/0082-what-order-build-orders-are-carried-out-in.md:88-91`),
and its **Decision** section, accepted 2026-08-31 and *"implemented in
[#722]"*, is decision 1: *"Build orders are carried out in the order they were
placed"* (`docs/adr/0082-...:241`). VERIFIED in code: `ConstructionSystem`
sorts by `(placementSequence ?? -1, id)` rather than by id alone (comments at
`src/simulation/construction/system.ts:836`, `:969`, `:984-989`), and the
Build panel's own queue projection documents the same history -- *"Until
2026-08-31 this paragraph read 'Ascending id'... What has changed is that for
orders a current session places, the list is the player's own gesture order"*
(`src/simulation/presentation/construction-projection.ts:234-266`).

So act 2 below is not "can a player tell execution is random" -- they can't,
any more -- it is "does the fix actually hold, live, on the assembled page."
It does; see below.

## Act 1: the two map controls, and whether the screen ever disagrees with the tool

**MEASURED, clean.** Every probe in `armingReadout`'s vocabulary was tried:
arming from a standing start, pressing arm again to stand down, arming to
remove, pressing "Draw on map" while removal is on (#735), pressing the
removal control twice to stand it down (#689), leaving the Rooms tab while
armed and dragging from the Build tab, and picking a different room type
while removal is armed. In every case `data-armed`/`data-removing` matched
the button's own label and matched whether a drag on bare world produced a
pending rectangle or nothing. Leaving the tab while armed and dragging from
the Build tab correctly handed the pointer back -- returning to the Rooms tab
showed the tool disarmed, with no stray rectangle from the Build-tab drag.

One thing that looks like a defect on first read and is not: the arm and
remove buttons go `onScreen=false` the instant a rectangle becomes pending,
because `confirmButton`/`cancelButton` replace them in the same actions row
while a rectangle is held (**VERIFIED, read**,
`src/ui/hud/rooms-panel.ts:1591-1594`: `armButton.element.hidden = confirming;
removeButton.element.hidden = confirming;`). That is the panel's designed
chrome swap, not the tool disagreeing with the screen, and `toggleRemovalMode`
/`pressArm` (`src/ui/hud/tool-arming.ts`) held up under every combination this
act tried. **No defect found on this sub-surface.**

## Act 2: is the build queue in the order I drew it? (ADR 0082)

**First reading, wrong, and why:** a 6-segment wall drag on a tile the
instrument's own `findFreeTile` reported as reachable submitted **zero**
`PlaceBuildOrder` commands:

```
[act2] drawing one run of 6 segments from tile (5,10) eastward
[act2] one west-to-east drag submitted 0 PlaceBuildOrder(s), in this order: []
```

Diagnosed with a throwaway script (`page.evaluate(() =>
document.elementFromPoint(x, y))`, deleted after use): the drag's own start
point, `(48, 66)`, resolved to `SPAN.ui-eyebrow.ui-stat__label` -- a label on
the status strip, not the canvas. `findFreeTile` checked nine points half a
tile in from each side of the requested block (tile *centres*), which is
correct for a room-designation drag (moves between tile centres,
`centreOf`) and wrong for a wall-edge drag (moves along the tile *grid
line*, one half-tile further out); tile `(5,10)`'s row was clear at its
centre (y=98..162) but its own top edge, the line the wall run is drawn
along, sits at y=66, under the strip. **This was the instrument's own
geometry bug, not a product defect** -- the previous agent's note that the
geometry was "not reliable" was right, and this is the specific way it was
wrong. Fixed by checking the block's true outer boundary instead of the
shrunk tile-centre rectangle (`tests/browser/playtest-2026-09-01-rooms.playtest.ts`,
`findFreeTile`, committed `9378bad4`).

**MEASURED, after the fix, clean:**

```
[act2] drawing one run of 6 segments from tile (5,11) eastward
[act2] one west-to-east drag submitted 6 PlaceBuildOrder(s), in this order: ["5,11","6,11","7,11","8,11","9,11","10,11"]
[act2] the head of the queue, in the order it changed: ["Brick wall · 5, 11 · North","Brick wall · 6, 11 · North","Brick wall · 7, 11 · North","Brick wall · 8, 11 · North","Brick wall · 9, 11 · North","Brick wall · 10, 11 · North"]
```

The crew reaches the six segments in exactly the order the mouse drew them,
watched live rather than inferred from the queue's own listing. **ADR 0082
holds: build orders execute in placement order, and the Build panel's "in the
order the crew will reach them" is true.**

## Act 3: what the panel says when a designation cannot work

**First reading, wrong, and why:** scenarios c/d/e (an 8x8 yard, a second
overlapping yard, a cell over the yard's corner) were placed at x=40/42.
VERIFIED, read: a fresh prison materialises exactly one 32x32 chunk at (0,0)
and nothing beyond it (`src/simulation/runtime/new-session.ts:402-413`,
`world = new SparseWorld(32); world.load(initialChunk); world.setOwned(initialChunk, true);`
with `initialChunk = { x: 0, y: 0 }`), and `RoomZoningService.zone` refuses a
tile whose chunk is not materialised as `out-of-bounds` before it even asks
about ownership or overlap (`src/simulation/rooms/zoning.ts:515`). So all
three scenarios came back *"part of that area is outside the map"* instead of
exercising overlap and corner-overlap. **Instrument bug, not a product
defect** -- fixed by moving c/d/e into x:0..31, y:0..31 (committed `60b1b205`).

**MEASURED, after the fix:**

- **a) an unenclosed 4x4 `room.cell`** -- refused correctly: *"The room was
  not zoned — this room type must be enclosed, and the area you drew is open
  on at least one side."* The pre-confirm note already said *"Open on at
  least one side"* and the Confirm control was **not** disabled (by design --
  see `src/ui/hud/rooms-panel.ts:1262-1289`'s comment on why a possibly-stale
  enclosure reading warns but never blocks); the simulation's own refusal is
  what actually stops it.
- **b) a 1x1 `room.cell`**, under the authored 2x3 minimum -- Confirm was
  **disabled** before any command was sent, note read *"Too small — this room
  needs at least 2 × 3 tiles."* Clean, and a better outcome than a) or e)
  because the player never even reaches a refusal.
- **c) an 8x8 `room.yard`** on open ground -- succeeded. Room count 0 -> 1,
  and the Rooms panel's own enclosure readout correctly reported *"Open on at
  least one side"* for the new room, because `room.yard` requires only
  `outdoors`, not `enclosed` (**VERIFIED, read**,
  `src/content/room-catalog.ts:138-141`).
- **d) a second 8x8 `room.yard`** over the first -- refused
  `overlaps-existing-room`, room count stayed at 1. Correct.
- **e) a 2x3 `room.cell`** drawn entirely inside the standing yard's corner --
  refused `overlaps-existing-room`, **not** `not-enclosed`, matching
  `zoning.ts`'s own ordering: the per-tile overlap check runs in the same loop
  as bounds/ownership, before the enclosure check that follows it
  (`src/simulation/rooms/zoning.ts:505-519` vs `:561-575`, whose own comment
  gives the reason -- *"the player is told the thing they can act on"*).

Four of the five scenarios are exactly as designed. The fifth is the finding
below.

### The finding: a successful designation can be reported, moments later, as the failure of an earlier one

**MEASURED, reproduced identically on two separate isolated runs.** In the
same session as scenario a) above: draw an unenclosed 4x4 `room.cell` at
(20,20) -> refused, band reads the `not-enclosed` sentence quoted above. Then,
still the same session, draw an unrelated 8x8 `room.yard` at (2,2) -- a room
type that does not require enclosure at all -- and it **succeeds** (room
count 0 -> 1, the panel's own enclosure readout correctly shows *"Open on at
least one side"* for the real, newly-standing yard). 1200ms later, the
refusal band is read again and still shows **the first room's message,
verbatim**:

```
[act3] confirm submitted: [{"type":"ZoneRoom","roomId":"room.yard","x":2,"y":2,"width":8,"height":8}]
[act3] refusal band says: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
[act3] rooms counted now: 1
[act3] enclosure readout: "ENCLOSURE\nOpen on at least one side"
```

Both clauses of the displayed sentence are false of the state on screen at
the moment it is read: a room *was* just zoned, and the room type just zoned
does not require enclosure. Nothing else on screen was measured to contradict
it in this pass -- act 3's own harness never reads the event band, only the
refusal band, the enclosure readout and the room count, and a source search
for anything a successful `ZoneRoom` might publish to the event log turned up
no such site in `src/` (grepped for `ZoneRoom`/zoning beside `event`, `hud__event`
or `success`; nothing matched). That is evidence the event band says nothing
about a designation succeeding, not proof of it -- the event band itself was
not read live at the moment of c)'s success, and that is named under *What
this pass did not reach* rather than claimed here. Either way, the refusal
band's text is what a player reads, and it is wrong.

**Cause, VERIFIED, read.** A successful `ZoneRoom` calls
`refusals.supersede(zoneKey)`, where `zoneKey = zoneSupersessionKey(roomId, x,
y, width, height)` is derived from **the exact rectangle and room type that
just succeeded**, not from whatever the standing refusal happens to be about
(`src/simulation/runtime/session-commands.ts:137-166`). The comment at
`:157-163` states the scoping is deliberate: *"a room zoned elsewhere leaves
a standing refusal about this rectangle alone, because its key would not
match."* `src/ui/hud/hud.ts` carries the same rule on the HUD side and says
so too -- `clearRefusal` (`:1211-1223`): *"A later success may not clear
it... What clears a simulation refusal is another one, or the session
ending"*; `applySimulationRefusal` (`:1225-1259`) implements exactly that.

So the mechanism is intentional, reasoned about (issue #492 is cited by name
in the comment), and understood by whoever wrote it -- the trade-off being
solved for is *"a room zoned elsewhere should not clear a standing refusal
about a spot the player has not fixed yet."* But its player-facing
consequence was, as far as this playtest can find, not weighed: a player who
fails once and then succeeds once, in that order -- which is the *ordinary*
shape of designating rooms, not an edge case -- is told the opposite of what
just happened, with no timestamp, no "this may be stale" cue, and no
corroborating success message anywhere else on screen to contradict it.

**The mechanism does heal itself, but only on the next refusal, never on a
plain success.** Scenarios d) and e) above, run right after c), each
correctly display *their own* fresh refusal, overwriting the stale one --
confirmed in the same log:

```
[act3] --- d. a second room over the first one: room.yard over 8x8 at (4,4) ---
[act3] refusal band says: "The room was not zoned — it overlaps a room that is already there."
```

So the window in which a player can see this lie is exactly "between a
success and whatever they try next" -- which, for the specific case of
drawing one room, succeeding, and moving the camera to admire it or check the
Rooms panel before doing anything else, can be the entire rest of the
session.

**This recurs beyond `ZoneRoom`.** Act 4 (below) independently hit the same
class of staleness for `RemoveObject`: `calibrate()` (`tests/browser/playtest-harness.ts:226-272`)
deliberately arms the Remove tool and presses empty tiles to bisect the
screen-to-tile transform, which genuinely refuses `nothing-to-remove`
(`src/simulation/objects/object-placement-service.ts:207`,
`RemoveObjectRefusalReason`) as part of its own working -- and that refusal
then sat in the band, unchanged, through a real room being zoned, a real wall
perimeter being built, and a real bed being placed, none of which cleared it,
because none of their success keys matched the stale `RemoveObject` key --
confirmed by the same shape of code, one command handler over: a successful
`RemoveObject` calls `refusals.supersede(removeKey)` where `removeKey =
removeObjectSupersessionKey(x, y)` is the tile just removed
(`src/simulation/runtime/session-commands.ts:571-604`, whose own comment
names the same issue by number: *"Issue #492: the tile. A removal elsewhere
must not silence a standing `nothing-to-remove` about this one."*). This is
the same `supersede`-is-keyed-to-the-exact-subject design, on a different
command family, so it is reported as the same finding rather than a second
one.

**This is a proposal, not a one-line fix.** It touches an explicitly-reasoned
design point (#492's exact-match scoping exists to solve a real problem in
the other direction) rather than an oversight, so a fix belongs to a decision
about what the band should do on a success it wasn't told to expect --
options include clearing on *any* success regardless of key, giving the band
its own visible age/staleness (a fade, a tick-stamp, an icon), or replacing a
stale simulation refusal with a neutral "cleared" state once any other
command succeeds. Recorded here with reproduction and cause; not fixed on
this branch.

## Act 4: what a finished object gives back when it is taken away (ADR 0076)

**Which rule is in force, VERIFIED, read.** ADR 0076 carries two signed
amendments. The first (ruling 20, 2026-08-31) makes cancelling an
**in-progress** order return nothing at all, in either currency. The second
(2026-09-01, *"this reverses decision B, which the same owner accepted on
2026-08-29 knowing its cost"*) makes a **completed** order -- the case this
act plays -- return nothing too, for both `RemoveObject` and `Undo`, and
explicitly for both an object buildable (a bed) and an edge buildable (a
wall): *"Taking a finished object away returns nothing. Not its materials,
not its money"* (`docs/adr/0076-...`, Amendment of 2026-09-01). Decision B's
older, generous rule -- materials come back in full -- is superseded and does
not apply to a completed order today.

**First reading, wrong, and why.** The bed half of this act pressed a bed
straight onto bare, unzoned ground and never checked the refusal band at that
placement. Funds read flat before and after the later Remove press (`24935 ->
24935 -> 24935`), and the act's own printed conclusion read that flat line as
ADR 0076 holding. **It wasn't measuring ADR 0076 at all.** VERIFIED, read:
`PlaceObject` refuses `outside-room` for any tile `roomInstanceContaining`
cannot resolve to a room instance
(`src/simulation/objects/object-placement-service.ts:476`) -- a bed is an
object buildable and belongs to a room by construction (ADR 0028). No room
had been zoned, so the bed was very likely refused outright, and the later
Remove press's own answer was the tell the first version of this act never
printed:

```
[act4] the Remove tool submitted: [{"type":"RemoveObject","x":9,"y":11}]
[act4] funds after the bed is taken away: 24935
[act4] refusal band: "Nothing was removed — there is no object on that tile, and none being built there."
```

*"There is no object on that tile"* is `nothing-to-remove`, not ADR 0076's
"returns nothing" -- there was nothing there to return anything from. Fixed
(committed `cbfbb7ea`) by enclosing a real 4x4 `room.cell` inside the found
5x5 block first -- four wall drags, then a zone-with-retry loop matching the
shared harness's own `buildAndPopulate` pattern -- before arming and placing
the bed, and by logging the refusal band immediately after the placement
press so a future `outside-room` refusal would be visible rather than
silently swallowed two steps later into a flat funds line.

**MEASURED, after the fix, clean, for a real bed inside a real room:**

```
[act4] zone attempt 1: rooms=1, band="Nothing was removed — there is no object on that tile, and none being built there."
[act4] placing a bed at tile (10,12) submitted: [{"type":"PlaceObject","orderId":"...","definitionId":"bed-wooden","x":10,"y":12}]
[act4] funds right after the order: 23655
[act4] funds once the bed is standing: 23655
[act4] the Remove tool submitted: [{"type":"RemoveObject","x":10,"y":12}]
[act4] funds after the bed is taken away: 23655
[act4] ADR 0076's signed amendment of 2026-09-01 says a finished object returns nothing: funds went 23655 -> 23655, delta 0.
```

The zoning succeeded on the very first attempt (rooms=1 immediately), the bed
was placed inside it and stood, and its removal returned neither money nor
(implicitly, since none was spent again) materials. The refusal band shown
beside the zoning attempt and the placement is the *same* stale
`nothing-to-remove` message `calibrate()`'s own internal probe left standing
minutes earlier -- see the cross-reference under act 3's finding above; it is
the identical mechanism, not a new one, and is not double-counted as a second
finding here.

**MEASURED, the wall half, clean and unaffected by the bed's instrument bug**
(a wall is an edge buildable and has no `outside-room` restriction, so this
half was already testing the right thing):

```
[act4] funds once the wall is standing: 23495
[act4] the Remove tool on a standing wall submitted: [{"type":"RemoveObject","x":12,"y":14}]
[act4] funds after the wall is taken away: 23495, delta 0
```

**ADR 0076's second amendment holds, live, for both routes it names: a
finished object -- bed or wall -- returns nothing when taken away.**

One thing named rather than measured: `hud.build.remove-hint`
(`src/content/default-locale-en.ts:766`) still reads *"One still being built
is cancelled and its materials come back; a finished one is not refunded"* --
the first clause has been false since ruling 20 (an in-progress order returns
money only while the crew has not started, and nothing once it has) and this
is not a new finding: ADR 0076's own text already reports it to the owner
under `AGENTS.md`'s fourth exclusion (*"the string is reported to the owner
with the branch"*). Restated here only because this act is the one that would
have shown it running, for completeness.

## What this pass did not reach

This surface is larger than four acts. Not played: touch/pointer input (the
brief named desktop first), the numeric coordinate route's own edge cases
beyond act 3's five scenarios (a negative coordinate, a rectangle at
`MAX_ZONE_DIMENSION_TILES`), `Undo`/`Redo` on a build order versus a zoning
command in the same session, and a build order queue long enough to exceed
`BUILD_QUEUE_ROW_LIMIT` (3) -- ADR 0082's own Context section already reports
that a queue past three rows is "a destructive control aimed by a hidden
number" for the *Cancel* buttons specifically; this pass did not re-measure
that against the placement-ordered queue. Also not read: the event band
(`.hud__event`) at the moment scenario c) succeeds -- act 3's harness never
polls it, so whether a successful designation says anything there at all is
argued from a source grep (see the refusal-band finding above) rather than
measured live.

## What would change my mind

The refusal-band finding's weakest claim is that it is common in ordinary
play rather than a corner this playtest manufactured by design. The sequence
that reproduces it -- fail a designation, then succeed at an unrelated one,
without an intervening refusal of any kind -- is not exotic (a player
comparing two room types by trying both, or fixing one mistake by starting a
different room elsewhere, would hit it unprompted), but this pass did not
measure how often it happens across a longer, less scripted session. A
playtest that logged the refusal band continuously through an hour of
ordinary building and counted how many designations it silently mis-described
would be the cheapest thing that could sharpen or refute "the ordinary
shape."

## Other findings' status

- **ADR 0082 (build order execution order):** confirmed correct and current;
  the brief's description of it was stale and is corrected above.
- **ADR 0076 (a finished object returns nothing):** confirmed correct and
  current, for both signed amendments, for both an object buildable and an
  edge buildable.
- **`tool-arming.ts`'s `toggleRemovalMode`/`pressArm` (#689, #735):** no
  defect found under any combination this pass tried.
- **The refusal band can describe a success as a failure:** one real,
  reproducible, player-visible defect, reported as a proposal above rather
  than fixed, because the fix is a decision about an explicitly-reasoned
  design point and not an oversight to patch.
