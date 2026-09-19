# Does the game tell the player their cell has no door?

**Date:** 2026-09-05
**Question:** #938 and PR #980 shipped a fix under the heading *"a dead room
says it is dead"*, and #980 added the locale entry
`'hud.rooms.needs-doorway': 'a door — nobody can get in'`. Nobody had played
it. Does that sentence reach the player **in time and in a place they can act
on it**, and does the game confirm the fix once they make it?
**Tree played:** `829d3c11` (**v0.0.484**) in worktree `/workspace/pt-door` on
branch `playtest/does-the-game-say-there-is-no-door`. **Nothing under `src/`
differs from that commit**; this branch adds one `*.playtest.ts` instrument and
this record. The strip's own version line confirms the tree from inside the
running page on every act — `v0.0.484 · 829d3c1` for acts 1, 2 and 3, and
`v0.0.484 · e2dd03e` for acts 4a and 4b, `e2dd03e` being this branch's own
instrument-only checkpoint commit.

**This is the first playtest in this session run with the actor art present, and
that is a load-bearing fact about act 1.** In this worktree
`file public/assets/actors/actor.guard.base.idle.png` answered `ASCII text`
before and `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`
after a single `git lfs checkout`, which reported
`Checking out LFS objects: 100% (62/62), 93 MB | 0 B/s, done.` in **0.965 s**
at load average **3.76**. `0 B/s` is not rounding: the objects were already in
`.git/lfs` and nothing was fetched. Every screenshot below therefore shows the
prisoners and guards as sprites. `docs/AGENT_WORKFLOW.md` §2 already says the
`file` check settles the direction and that a browser run in a pointer tree
loses every actor sprite *and passes anyway*; that is what happened to
`docs/research/2026-09-04-why-they-stack.md`, which says of itself
*"Nothing below screenshots the world"*.

**Reproduction**, one act at a time (nothing in CI collects it —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, and
`playwright.playtest.config.ts` is the config that matches `*.playtest.ts`):

```
LOCKSTATE_BROWSER_TEST_PORT=5191 ./node_modules/.bin/playwright test \
  -c tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-does-the-game-say-there-is-no-door.playtest.ts \
  --grep "act 1"
```

Wall-clock figures below each carry the machine's load average, because several
agents share this container. Every in-game time is a tick off
`simulation/clock-state`; a day is `DAY_LENGTH_TICKS = 2_400`
(`src/simulation/prisoners/regime.ts:12`).

---

## The answer, in one paragraph

**The sentence exists, it is true, it is correct English, it arrives early, and
it survives everything — and a player will still not see it, because it lives
only inside the Rooms tab and nothing anywhere else ever mentions it.** From
the moment the cell is designated on day 2 the Rooms panel reads *"Cell at 12,
12 is missing / a door — nobody can get in"*. I then watched the Overview tab —
the tab a player watches a prison run on — for **240 s of wall clock and eight
in-game days**, from day 3.5 to day 11.56, with four prisoners sealed inside a
doorless cell. Across the status strip, the refusal band, the event band and the alerts
column, exactly three distinct strings appeared in that time; one of them is an
artefact of the instrument, one is *"Contraband found: Tool."*, and the third
is the alerts column carrying that plus *"Cell designated. Day 2"*. Not one
word about a door. The strip said `1 ROOMS` with
no qualifier while the Rooms panel said `NOT READY 1 of 1`. Nothing was ever
pushed at the player: the message waits to be found. Building the door then
clears the row **silently** — no event, no alert, no acknowledgement of any
kind, which `src/ui/hud/messages.ts` says outright is deliberate: *"There is
deliberately **no** 'every room is ready' key."* And the check behind the
sentence is local to one room's own perimeter, so a door that opens onto a
sealed one-tile pocket satisfies it completely: the same prison, equally
unreachable, says nothing at all.

---

## 1. Act 1 — the naive build, watched from the Overview tab

### What was on the screen, before I looked at any code

I pressed **New prison**, opened **Build**, and the panel arrived with **Brick
wall** already selected and the hint *"Click a tile edge to place a wall. Drag
along it to lay a run."* I bought sixty bricks, four beds and a toilet, and drew
four wall runs around a 6×6 square. Nothing during that asked me about a door.
The second row of the build catalogue is **Wooden door** — it is there, in
plain sight, one row below Brick wall — but nothing in the flow of drawing a
rectangle points at it, and a rectangle drawn as four runs never leaves a gap.

I opened **Rooms**, picked **Cell**, dragged the rectangle and pressed Confirm.
It was accepted first time. The panel then said, and I am copying it exactly:

```
NOT READY                                      1 of 1
Cell at 12, 12 is missing
a door — nobody can get in
1 × Bed
1 × Toilet
NEEDS AT LEAST 2 × 3 TILES
MUST BE ENCLOSED
NEEDS 1 × BED
NEEDS 1 × TOILET
ENCLOSURE   Walled in on every si
```

That was **tick 4689, day 2**. So the game does say it, and it says it at the
earliest moment it could.

Then I built the beds and the toilet, admitted four prisoners, hired two guards,
pressed Fast forward twice and went to **Overview**, which is where the Admit
control and the alerts live and where a player watches. I sat there for four
minutes.

**Nothing happened.** The alerts column held *"Cell designated. Day 2"* (Info),
picked up *"Contraband found: Tool. Day 4"* (Warning) at tick 8402, and
otherwise did not change for the rest of the run. The strip counted up: funds
22,870 → 30,070, `1 ROOMS`, `0 INCIDENTS Clear`, `4 PRISONERS`. Money went
**up**, steadily, all the way. Nothing on the screen suggested the prison was
broken. Screenshot: `2026-09-05-does-the-game-say-there-is-no-door/act1-running-end.png`.

The only ambient thing that changed at all when the prisoners arrived is a small
orange bar next to the PRISONERS chip. I read its accessible name off the DOM:
`aria-label="Cell occupancy"`, `role="meter"`, `aria-valuenow="4"`. It is a
**capacity** meter — it reads exactly the same on a cell that works.

At day 12 I finally went looking. The Rooms tab had been carrying the sentence
the whole time. Screenshot:
`2026-09-05-does-the-game-say-there-is-no-door/act1-final-tab-rooms.png`.

### The exact ambient inventory, verbatim

Every distinct sentence the always-visible surface produced in 240 s, with the
tick it first appeared at:

```
tick 8402: refusal: Nothing was removed — there is no object on that tile, and none being built there.
tick 8402: event:   Contraband found: Tool.
tick 8402: alerts:  Cell designated. Day 2 Info Clear this alert Contraband found: Tool. Day 4 Warning Clear this alert Nothing was removed — there is no object on that tile, and none being built there. Warning
```

That is the complete list. The run ended at tick 27749, **day 11.56**. Wall
clock 240 s at load averages between 5.47 and 8.26.

(The `Nothing was removed …` line is an artefact of the instrument: `calibrate`
in `tests/browser/playtest-harness.ts` finds the tile transform by pressing
empty tiles with the Remove tool. It is not a player's message, and it is
excluded from every conclusion below. It does incidentally show that the refusal
band is *sticky* — it was still on screen eight in-game days after the press
that caused it.)

### Then the code

- The sentence is `'hud.rooms.needs-doorway': 'a door — nobody can get in'`
  (`src/content/default-locale-en.ts:2412`), completing the header
  `'hud.rooms.needs-room': '{room} at {x}, {y} is missing'` (`:2367`) under
  `'hud.rooms.needs': 'Not ready'` (`:2361`).
- It is rendered in exactly one place:
  `if (need.kind === 'doorway') return t(HUD_MESSAGE_KEY.roomsNeedsDoorway);`
  — `src/ui/hud/rooms-panel.ts:1471`. There is no second render site; a
  repository-wide grep for `needs-doorway` finds the key definition
  (`src/ui/hud/messages.ts:1157`), the locale entry, that render, one browser
  spec and one unit test.
- `src/ui/hud/messages.ts` states the tab-scoping as a property, not an
  accident: *"This block is pulled fresh off the projection while the Rooms tab
  is showing, so it corrects itself the moment the door order completes."*
  Measured: with the Overview tab open, `.hud-rooms` is not laid out at all.

---

## 2. Act 2 — deliberately doorless, played longer, and hunted for

### What was on the screen

Same build, on purpose, and then I tried to lose the message. I could not, by
any means short of collapsing the panel myself:

| what I did | door sentence still there? |
| --- | --- |
| sitting on the Rooms tab | **yes** |
| Overview tab open | the Rooms panel is **not laid out at all** |
| Overview → Rooms | **yes** |
| Rooms panel collapsed | no — present in the DOM, `[NOT LAID OUT]` |
| re-expanded | **yes** |
| scrolled to the bottom of the panel | **yes** |
| **Save now**, full page reload, **Load** | **yes** |

So as a *string* it is durable. It also survived nine in-game days of running
(day 4.2 → day 10.2), re-read off the panel at every day boundary, unchanged.
Wall clock for the long run 180 s at load averages 4.94–8.51.

### Two things I did not expect

**The panel contradicts itself, in a reassuring direction.** Two lines under
*"a door — nobody can get in"* the same panel prints the rule list
`MUST BE ENCLOSED`, and under that the readout `ENCLOSURE  Walled in on every
side` — `'hud.rooms.enclosure-sealed'` (`src/content/default-locale-en.ts:2324`),
whose sibling for the failing case is `'Open on at least one side'` (`:2325`).
In every other context in this panel *"Walled in on every side"* is the pass
state: it is what the designation gate wants. A player who reads top to bottom
is told the room needs a door, then told the walls are complete, using the
words the game elsewhere uses to mean "good".

**After a reload the block below it belongs to a different room.** The room-type
catalogue resets its selection to **Staff Room**, so the panel reads:

```
Cell at 12, 12 is missing
a door — nobody can get in
NEEDS AT LEAST 3 × 3 TILES
MUST BE ENCLOSED
NEEDS 1 × DESK
NEEDS 2 × CHAIR
```

Those four lines are the *Staff Room's* rules. Nothing separates them from the
Cell's fault above. Screenshot:
`2026-09-05-does-the-game-say-there-is-no-door/act2-end-rooms-element.png`.

### And the enclosure line is clipped, measured rather than eyeballed

`.hud-rooms__enclosure` has `scrollWidth=268` against `clientWidth=238`, with
`overflow-x: visible` and `text-overflow: clip`, so it runs 30 px past the
panel and is cut mid-word: the screen reads **`ENCLOSURE  Walled in on every
si`**. Measured at 1440×900. **The door sentence itself is not clipped** —
`scrollWidth=238`, `clientWidth=238` — and it is not clipped at 1280×800,
1024×768 or 1920×1080 either. The clipped line is the enclosure readout, and
only that one.

---

## 3. Act 3 — building the door, and asking the game to confirm it

### What was on the screen

Doorless cell, four prisoners, day 5. I opened Build, picked **Wooden door**,
and pressed the south wall of tile (14,17) — an edge that already had a brick
wall on it. It took the order without complaint:

```
PlaceBuildOrder door-wooden x=14 y=18 edge=north
```

The refusal band said nothing; no removal was needed first. The door appears in
the world as a grey door in the south wall. Screenshot:
`2026-09-05-does-the-game-say-there-is-no-door/act3-end-rooms.png`.

**And the entire `NOT READY` block vanished.** Not replaced — gone. The Rooms
panel went from

```
NOT READY                                      1 of 1
Cell at 12, 12 is missing
a door — nobody can get in
```

to nothing at all, leaving only the room-type rules. The needs list read `[]`.

I then watched every ambient channel for a further 90 s (tick 11600 → 18898,
about three in-game days) for any acknowledgement. There was none: the alerts
column, event band and refusal band were byte-identical before and after.
Wall clock 90 s at load averages around 8.

### Then the code

This is deliberate and it is written down. `src/ui/hud/messages.ts`, in the
block that defines these keys:

> There is deliberately **no** "every room is ready" key. A room that is fine
> earns no line at all -- the block is not drawn -- which is what keeps this
> out of the way of a panel whose always-visible budget ADR 0022 measured at
> 7.9px.

The reasoning is about panel budget and it is sound for the *panel*. It is an
argument for not printing a permanent "all rooms fine" line. It is not an
argument against a one-shot acknowledgement in the alerts column, which is a
different surface, already exists, and already carries a room-lifecycle event:
*"Cell designated. Day 2"*.

---

## 4. Act 4a — a door that opens onto nothing, and the game goes quiet

This is the act that decides whether the sentence is a member of a family or a
special case.

I built the cell, built the door, watched the row clear (`needs: []`), and then
laid **three** brick wall segments — the west, east and south edges of the one
tile outside the door — sealing that door into a one-tile pocket. The room now
has a doorway on its perimeter. Nothing in the world can reach it, exactly as
before. It is the same prison, one tile further out.

**The Rooms panel says nothing.** `needs: []`, no `NOT READY` block, no row.
I ran it a further 100 s (tick 10981 → 19049, about 3.4 in-game days): the
ambient channels produced nothing new, funds went up 24,015 → 27,015, and every
prisoner's hygiene stayed at 0–1%. Screenshot:
`2026-09-05-does-the-game-say-there-is-no-door/act4a-pocket-sealed-element.png`.

**That screenshot and act 3's are byte-for-byte the same file**, which
`md5sum *.png | sort | uniq -w32 -D` in that directory reports as one group
holding `act3-end-rooms-element.png` and `act4a-pocket-sealed-element.png`.
A working cell and a cell sealed behind its own door render the Rooms panel
pixel for pixel identically. (The digest itself is deliberately not quoted
here: a bare 32-hex token in prose is read as a commit sha by
`tests/foundation/documentation-commit-citation-contract.test.ts`, and it
failed this record once for exactly that.)

### Then the code, and it says the same thing plainly

`roomPerimeterAccess` in `src/simulation/rooms/enclosure.ts:288` walks the
room's own four boundaries and returns `'doorway'` on the **first** door it
finds — `src/simulation/rooms/enclosure.ts:303`, `:307`, `:310`, `:314` — and
`'no-way-in'` only if it finds none (`:317`). There is no reachability step
anywhere in it. So the verdict the sentence renders is *"this rectangle's
perimeter holds at least one door"*, and the sentence the player reads is
*"nobody can get in"*.

**Which means the sentence is true in exactly one direction.** When it is shown,
it is right: no door on the perimeter really does mean nobody can get in. When
it is *absent*, that says nothing at all about whether anybody can get in. A
player who fixes the fault the panel names and sees the panel go quiet has been
told they are done, and in act 4a they are not.

---

## 5. Act 4b — it is not the Cell's sentence, and a removed room keeps its alert

Two cheaper checks on the same family.

**It generalises across room types.** A 5×5 box sealed on every side and zoned
as a **Storage Room** produced:

```
NOT READY                                      1 of 1
Storage Room at 13, 14 is missing
a door — nobody can get in
2 × Storage Rack
```

So the doorway line is the game's, not the Cell's, and it sorts *above* the
object lines — which matches the comment at `src/ui/simulation-room-needs.ts:272`,
*"The doorway goes first, before this room's object lines"*.

**A room designated and then taken straight back leaves a false alert
standing.** I removed the room immediately. `rooms` went to 0, the strip read
`0 ROOMS`, the `NOT READY` block disappeared — and the alerts column still
read **"Storage Room designated. Day 2"**, Info, undismissed. There is a
lifecycle alert for designation and none for removal, so the column now asserts
a room that does not exist. Screenshot:
`2026-09-05-does-the-game-say-there-is-no-door/act4b-room-taken-back-element.png`.

**And one thing the panel does *right*, which is the shape the door case is
missing.** My first attempt at this act tried to zone the 5×5 box as a **Yard**.
The panel refused it *before* Confirm, live under the drag, with Confirm
disabled and this note beside it:

```
AREA
5 × 5 tiles at 13, 14
TOO SMALL — THIS ROOM NEEDS AT LEAST 8 × 8 TILES.
NEEDS AT LEAST 8 × 8 TILES
MUST BE OUTDOORS
NO OBJECTS NEEDED
```

That is a pre-commitment refusal on a control the player is already looking at.
The doorway fault gets none of that: the rectangle is accepted, Confirm is
enabled, and the complaint arrives afterwards in a block below the fold of the
player's attention.

---

## 6. What the world view shows: nothing, and that is a finding of its own

This is the part only a run with the art can produce.

With the sprites drawn, the doorless cell at day 12 shows **four prisoners and
a guard piled into a single tile in the room's north-west corner**, motionless,
and a second guard standing alone. That is a vivid picture of a dead room — and
**it is not one**. `docs/research/2026-09-04-why-they-stack.md` already
established why, from the worker rather than from pixels: a prisoner's position
is written *"on arrival to the room instance's `anchorTile` — the north-west
corner of the rectangle the player dragged"*, with no per-bed position anywhere
in the simulation (issue #944).

I have the before-and-after pair for it. `act3-before-door.png` (no door) and
`act3-end-rooms.png` (door built, four in-game days later, panel silent) show
**the same four prisoners in the same corner tile in the same pose**. So:

- the world view gives the player **no** signal, because a working cell and a
  dead one are drawn identically;
- the pile is *not* evidence of the missing door and must not be read as such;
- and this is, as far as this record's author can tell, the first screenshot in
  this repository of #944's stacking, which that note could not take.

---

## 7. What this adds up to

The string that #980 shipped is not the defect. It is well written, it is early,
it is durable, it is truthful when shown, and it generalises across room types.
Four separate things stand between it and the player:

1. **It is only in the Rooms tab.** A player watching a prison run is on
   Overview. Nothing there — strip, bands, alerts — ever mentions it, for
   eight in-game days, measured.
2. **Nothing is pushed.** The alerts column is the game's one push channel, it
   already carries *"Cell designated"*, and it carries nothing when that same
   cell turns out to be unusable.
3. **The fix is unacknowledged.** The row disappears; nothing says "that
   worked". A player who builds a door and looks at the Overview tab sees
   exactly what they saw before.
4. **Silence is not safety.** The check is per-room-perimeter, so a door onto a
   sealed pocket clears it. An absent row means "this room's own wall has a door
   in it", and a player will read it as "this room is fine".

Three smaller things found on the way, none of them about doors:

5. `.hud-rooms__enclosure` overflows its panel by 30 px and is cut mid-word.
6. After a reload the room-type rule block resets to Staff Room and sits
   immediately under a Cell's fault, with nothing separating them.
7. The alerts column keeps *"<Room> designated. Day N"* after that room has been
   removed. There is no removal counterpart.

### What I would propose, and deliberately have not written

**Nothing under `src/` is touched on this branch.** These are for the owner:

- **A.** Give the alerts column a room-readiness alert with the same lifecycle
  as the designation alert it sits next to: raised when a designated room's
  needs are non-empty for the first time, cleared when they empty. That is one
  push, on the surface the player already watches, and it makes both the fault
  and the fix visible. It does not add a permanent line to the Rooms panel, so
  the 7.9 px budget argument in `src/ui/hud/messages.ts` is untouched.
- **B.** Mark the strip's `ROOMS` chip when any room is not ready. It already
  reads `1 ROOMS` beside `NOT READY 1 of 1`; the number is the same number and
  the chip is always on screen. Cheapest of the three by a distance.
- **C.** Refuse the doorway fault *before* Confirm, the way the size rule is
  already refused — the panel's `.hud-rooms__note` channel with Confirm
  disabled. This one is a **design decision, not a defect fix**, because a room
  cannot have a door before it is a room, so the refusal would have to be a
  warning rather than a block. It is listed because the size refusal shows the
  shape exists and works.
- **D.** Separately from all of the above: whether `roomPerimeterAccess` should
  answer reachability rather than perimeter-adjacency is an **architecture
  question**, not a wording one, and it belongs in an ADR. The narrow reading
  is deliberate and cheap; the broad one is a pathfinding query per room per
  projection. I am not proposing which.

---

## 8. My weakest claim, and what would change my mind

**Weakest: that a player would not notice.** I measured what the game *showed*,
which is a fact; "a player would miss it" is an inference from it. The Rooms tab
is one click away and the panel is not hiding. What would change my mind is a
real person building a prison and finding it inside a minute. What would
*strengthen* my reading is that two agents who can read this codebase played it
in this session, never built a door, and both attributed the result to something
else — that is in the brief I was given, and I did not re-verify it.

**Second weakest: act 4a's silence is a defect.** I measured the silence and I
opened the function that produces it, so the observation and the cause are both
solid. Whether it *matters* depends on how often a player builds a door into a
pocket, which I have not established and cannot from here. Stated the way §3 of
`docs/AGENT_WORKFLOW.md` asks: I measured it, I know why, and I do not know what
it costs.

**Not a claim of mine at all:** the 11,000-against-13,000 and
`routeFailures` 11,558-against-0 figures in the brief. They belong to the
record named `2026-09-05-where-the-yard-incentive-breaks` — **named rather than
cited as a path, because it is not on `origin/main` and
`tests/foundation/documentation-links-contract.test.ts` rightly fails a rooted
path that is not on disk.** I did not reproduce those figures, and they appear
here only as the reason this question was worth playing.

## 9. What I did not check, and why

- **Any viewport narrower than 1024 px, and touch.** The playtest config is
  1440×900; I re-measured clipping at 1280×800, 1024×768 and 1920×1080 only.
  `tests/browser/playtest-2026-09-04-touch-only.playtest.ts` owns that surface.
- **Whether a screen reader announces the needs block.** I read `aria-label`,
  `role` and `title` off the status strip only, and found the occupancy meter
  that way. I did not audit the Rooms panel for announcement.
- **More than one room at once.** Every act had exactly one designated room, so
  `'{unfinished} of {total}'` was only ever `1 of 1` and I do not know how the
  block behaves, or how tall it gets, at five not-ready rooms.
- **The sealed **Yard** case the brief asked for.** A Yard requires
  `{ type: 'outdoors' }` and 8×8 minimum (`src/content/room-catalog.ts:138`),
  so "a yard walled off from the cell" is not constructible the way I tried it,
  and I substituted a sealed Storage Room to answer the same question — is the
  sentence the room type's or the game's. The specifically *recreational*
  version of the fault is untested here.
- **A door that is placed but never finished.** Every act waited for the build
  queue to empty. What the panel says while a door order is in progress is
  unmeasured.
- **Anything about `main`'s CI.** This branch adds no `*.spec.ts` and touches
  no `src/`, so no gate's behaviour changes; I ran no gate suite and claim
  nothing about one.
