# Five play-testers, one afternoon: what Lockstate does to a person at v0.0.451

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.451** (`0e614c7`). Every tester cut its
own worktree from that commit. `git diff --stat 0e614c7 HEAD -- src/` is empty
across the whole round: **nothing in the product was changed by anybody**, and
none of `AGENTS.md`'s four owner-reserved surfaces was touched
(`supabase/migrations/`, `wrangler.jsonc`, `public/_headers`,
`.github/workflows/`).

**The brief, in the owner's words:** run several agents that play Lockstate as
ordinary users would and report the bugs, the friction, the things that are
unintuitive or incomprehensible — game testers, playing and reporting.

**What this document is.** The coordinator's consolidated report over five
independent play sessions. Each tester wrote its own dated record and its own
re-runnable instrument; those are the primary sources and are listed in §12.
This document ranks their findings against each other, states which claims the
coordinator re-verified by opening the code, and separates the defects from the
things that only look like defects.

---

## How to read this

Every tester labelled its own claims, and those labels are carried through here:

- **MEASURED** — produced by a play session and quoted from its output.
- **VERIFIED, read** — a source file was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **JUDGEMENT** — what a tester thinks a *player* would do or feel, said as such.

Nothing in this round is **FROM MEMORY**.

On top of that, this document adds one label of its own:

- **✅ RE-VERIFIED** — the coordinator independently opened the cited code and
  confirmed the claim. Roughly thirty citations were re-opened this way,
  concentrated on the load-bearing ones. **Every citation the coordinator opened
  matched the tester's claim; none was withdrawn.**
- **○ TESTER'S CLAIM** — measured and reported by a tester, not independently
  re-checked here. Not doubted, merely not re-run.

`docs/AGENT_WORKFLOW.md` §1 requires a coordinator to verify agents' load-bearing
claims rather than accept them; the two labels exist so a reader can see where
that was and was not done.

---

## The verdict, in one paragraph

**Lockstate at v0.0.451 is a game whose building works, whose panels lie about
its two most important systems, and whose second hour is empty.** Four testers
independently arrived at the same shape of defect from four unrelated
directions: *the code knows something the screen does not say.* The security
panel reports `Covered` at exactly the guard count a comment in the simulation
predicts will make every incident lapse — and it did, seven times out of seven.
The world draws two figures for a population of twenty-eight, and the prisoners
are structurally always the ones hidden. The button that makes a second prison
throws away the first one's unsaved play, silently. A run of presses silently
loses some of them, and says only that the request was refused. Against that:
**the money is handled exemplarily** — every mistake that costs money has a
complete, correct, findable route back that names the figure — **the whole game
is completable with a finger on a tablet**, and **switching prisons is exact,
tick for tick**. The art that exists reads well. What is missing is not polish;
it is the game telling the player the truth about itself.

---

## 1. The ranked findings

Ranked by what they cost a player, across all five sessions rather than within
any one of them. The tester column says which session found it; §§4–8 carry each
session's full account.

### Tier A — the screen states something the code contradicts

**A1. The Security panel says `Covered` at the exact guard count that guarantees
every incident lapses.** `hour-two`. **MEASURED:** 17 residents, 4 guards →
`GUARD COVERAGE / 3 of 3 / Covered / This prison has the guards it asks for.`
and `ON DUTY / 3 held · 1 free`. Over in-game days 10–15 the alerts column
walked *"A fight has broken out… 4× → 7×"* beside *"No incident is still open —
but the last one ran out of time instead of being contained, and everyone caught
in it was hurt. 3× → 7×"*. **7 fights, 7 lapses, 0 contained.**

**✅ RE-VERIFIED,** and this is the sharpest single finding of the round, because
the code says it in words. `src/simulation/security/default-sector.ts:100-112`:

> *"a prison of `n` prisoners needs `ceil(n / 8)` guards posted **plus** a
> reserve for `IncidentResponseSystem` to claim, and a player who hires exactly
> the requirement will watch every incident lapse."*

The requirement is `ceil(occupants / 8)`
(`src/simulation/security/sector-staffing.ts:147,190`,
`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8`), responders are drawn only from
*unposted* guards, and the panel whose job is to tell the player how many guards
to hire tells them the number that leaves no reserve — then calls the result
covered. **Cost: the entire security half of the game does nothing, on the word
of the panel that exists to say otherwise.** Extends
`docs/research/2026-09-04-does-anyone-answer-an-incident.md`, which measured the
endpoints (6 guards → 15/15 resolved, 0 guards → 19/19 lapsed) but never the
middle.

**A2. Twenty-eight people, two tiles, two figures on screen.** `can-i-see-my-prison`.
**MEASURED:** with 22 prisoners and 6 guards alive, the worker put 6 prisoners on
tile (12,12) and 16 prisoners plus all 6 guards on (16,16); the canvas drew
**exactly two figures**, one orange and one blue, while the rail announced *"A
riot has broken out — 22 prisoners have stopped taking orders"* and the event log
carried 14 messages the world marked in no way at all.

**✅ RE-VERIFIED.** Co-located actors get the *identical* depth — `depthForAnchor`
is `row × DEPTH_ROW_STRIDE + layerBias` (`src/rendering/depth.ts:14-31`, applied
at `src/rendering/phaser/actor-layer.ts:146`), and prisoners and guards are both
the `actor` layer, so they share a bias. Phaser's sort is stable and
`src/rendering/feed/actors-from-snapshot.ts:149-172` builds prisoners *then*
guards, by a documented determinism rule. So on a shared tile the guard always
wins and **the prisoners are always the ones hidden** — not sometimes.
Corroborated by a natural experiment inside the session: tile (12,12) held the
same six prisoners throughout, drew an orange prisoner while no guard shared it,
and drew a blue guard in the very next sample after one did.

**A2b. The unanswered question underneath A2, and it is not a rendering
question.** Why does the simulation stack twenty-two prisoners on one tile? The
tester declined to guess and flagged it as outside its surface, which was the
right call. What is known: the same reading showed `16 with no bed` on the rail.
**A prisoner with nowhere to go appearing to stand at the point of arrival is a
hypothesis, not a finding**, and nothing in this round establishes it. It is the
first thing the next session should measure, because it is what makes the
drawing unreadable.

**A3. Asking for a second prison silently destroys the first one's unsaved
play.** `many-prisons`. **MEASURED:** prison A at tick **211** with **1,600**
spent came back at tick **0** with **25,000**. **0 dialogs** of any kind — DOM
*and* native `confirm` both counted, because Playwright auto-dismisses an
unlistened one.

**✅ RE-VERIFIED.** `SessionController.createPrison` calls
`await this.host.startNew(masterSeed)` and then `this.adoptSession(prisonId)`
(`src/persistence/session/session-controller.ts:166-167`) and **never captures
the outgoing session first**; `adoptSession` disposes the autosave. The loss is
bounded by the 30-second autosave interval only if a command had been accepted,
and is unbounded otherwise, because the autosave is command-driven rather than
play-driven. `docs/research/2026-09-04-does-a-prison-come-back.md` found the same
property on **Load**; *New prison* is a third button with it, and the
worst-placed one — **the only gesture the game has for keeping a second prison is
the one that discards progress in the first.**

**A4. A run of presses silently loses some of them.** `hour-two`. **MEASURED:**
25 *Admit* presses into a 17-bed cell produced 17 prisoners, with the page console
carrying *"The simulation has not reported its command sequence yet; try again in
a moment."* **seven times**; 8 *Hire Guard* presses with 43,040 in the treasury
produced 3 guards. The controls are exonerated — 20 presses spaced 400 ms apart
gave `commands 19->20 | staff=20`, and separate runs got 30-of-30 and 23-of-23.

**✅ RE-VERIFIED, and the mechanism is worse than the symptom.**
`DEFAULT_LEAD_TICKS = 20` carries the comment *"1 second at the kernel's 20 Hz"*
(`src/ui/simulation-commands.ts:77`) — but the worker converts `elapsed × speed`
into steps, so **at 4× that margin is 250 ms of real time, not one second**. One
main-thread stall past it makes the next command `past-tick`; the worker rejects
it; and `:327` then does `if (status === 'rejected') this.sequenceSynced = false`,
so **every later press throws** at `:251` until the next snapshot restates the
baseline. **Cost, MEASURED:** seven in-game days run with 17 residents instead of
24 — about 30% of income — and, in another act, three guards instead of eight,
which is what produced A1. The *rate* is not a claim about a player's machine
(five testers shared one box); the 250 ms margin is code.

### Tier B — something is destroyed, or cannot be undone, and nothing says so

**B1. Three of the game's five ways back say nothing at all when they work, and
two of them destroy a purchase while saying nothing.** `the-misplay`.
**MEASURED:** removing a mis-zoned room moved no number and put no sentence on
screen; removing a standing bed destroyed the **65** it cost
(`worker 25000 -> 24935 (-65)` on placement, `24935 -> 24935` on removal) and put
no sentence on screen; dismissing an unwanted guard kept the 80 already paid and
put no sentence on screen. The sentence band was `hidden`, not occupied by
something else.

**✅ RE-VERIFIED, and the mechanism is one grep.**
`grep -n "events\.record" src/simulation/runtime/session-commands.ts` returns
**exactly one line** — `:515`, the delivery cancellation. `UnzoneRoom`,
`RemoveObject`, `DismissStaff`, `HireStaff`, `AdmitPrisoner`, `PlaceObject`,
`ZoneRoom`, `PurchaseMaterials` and `ReleaseGuardAssignment` are **silent on
success by construction**. With `src/simulation/construction/handler.ts:156,174,178`
the complete set of player-command successes this game will speak about is
**four**: cancel an order, cancel a delivery, undo, redo.

**The sharpest edge, and it survives the fix already in flight:** a *pending*
object order is taken back through `cancelOrder`
(`src/simulation/objects/object-placement-service.ts:608`) — the channel #927 and
PR #932 are about — but a *standing* object is removed via
`placedObjects.remove` (`:586`) and **never reaches `cancelOrder` at all**. So
the destroyed-65 case is on neither channel and **will still be silent after that
work lands.**

**B2. An admitted prisoner has no route back of any kind.** `the-misplay`.
**MEASURED:** 141 controls swept across all five tabs, **zero** naming a release,
discharge, transfer or expulsion; and no removal command for a prisoner exists in
the protocol. ○ TESTER'S CLAIM on the sweep; the tester itself named the protocol
grep as the strong half and the vocabulary sweep as corroboration.

**B3. A finished wall can only be taken down with `KeyZ`, so on a touch device it
is permanent** — **known, #928, and now reproduced with a finger.** `touch-only`.
**MEASURED:** the Build tab's `Remove`, tapped exactly on the wall edge, submits
`RemoveObject` and answers *"Nothing was removed — there is no object on that
tile."* **✅ RE-VERIFIED:** `ObjectPlacementService.remove` looks only at placed
objects and pending object orders; **no wall edge appears in it**. Of the controls
whose words suggest undoing, two are visible and seven are not.

**B4. Un-zoning a room leaves every object inside it standing on bare ground,
reachable by no panel, and the game never mentions it.** `the-misplay`.
**MEASURED** in four presses, and proved rather than inferred: before the removal
the tile was blocked by an *object* (*"something is already standing there"*);
after it, by the *absence of a room* (*"it has to stand in a room you have
zoned"*). ○ TESTER'S CLAIM. Whether an orphaned object still counts toward
capacity, needs or a room's requirements was **not** measured.

### Tier C — the player is not led, or is led wrong

**C1. All three clock buttons carry their only words in a hover tooltip.**
`touch-only`. **MEASURED:** `title: "Pause" / "Play at normal speed" / "Fast
forward"`, each with `paintedText: ""`. On a tablet there is nothing to hover, so
a player sees three unlabelled glyphs.

**✅ RE-VERIFIED, and the repository already forbids this one file over.**
`createIconButton` puts the label in a `title` attribute and a visually-clipped
screen-reader span and nowhere else (`src/ui/primitives/icon-button.ts:34`).
`src/ui/primitives/action-button.ts:8-10`, the sibling primitive, states the rule
being broken: *"Touch has no hover, so a tooltip is not a label, and a shortcut
letter printed on a control is meaningless on a device with no keyboard —
`docs/INPUT.md`."* **Six controls on the arrival screen are affected**, the
alerts `Dismiss` among them. The stopped clock is already this project's one
measured dead end (`docs/research/2026-09-04-the-first-ten-minutes.md` §1), and a
tablet player cannot even read the label on the control that fixes it.

**C2. The sentence that teaches the world tool is written for a mouse and a
keyboard.** `touch-only`. **✅ RE-VERIFIED,** quoted verbatim from
`src/content/default-locale-en.ts:1216`:

> *"Click a tile edge to place a wall. Drag along it to lay a run. Two fingers,
> **the middle button** or **the arrow keys** still move the camera."*

One of the three named camera routes exists on a tablet — the arrows, `Equal` and
`Minus` are all `device: 'keyboard'` (`src/input/bindings.ts:11-35`). And
`hud.rooms.arm-hint` (`:1933`) names **no** camera route at all: *"Drag a
rectangle across the tiles this room should cover."* — on the tab where a 6×6
canteen has to be drawn.

**C3. Once anything is bought, the Build catalogue is a two-row window on
twenty-one rows, and at tablet landscape `Cell` is not among them.**
`touch-only`. **MEASURED:** `{"box":"238x88","clientHeight":88,"scrollHeight":924,"rowsInList":21,"rowsWhollyInsideTheBox":2}`
— tappable rows `["wall-brick","door-wooden"]`; the Rooms catalogue gives 3 of 18,
`Cell` excluded. Portrait gives 4 of 21 and 8 of 18. **✅ RE-VERIFIED:** the 88px
is not incidental — `--hud-build-catalogue-floor` is `calc(2 * var(--tap-target))`
and `--tap-target` is `calc(44px * var(--ui-scale))`
(`src/ui/tokens.css:415,390`). `Cell` is the row the game's own refusal chain
points a newcomer at. **The catalogues do scroll by finger** — the tester
refuted its own first hypothesis here — so this is geometry and discoverability,
not a wall.

**C4. Six prisons, six identical rows, and nothing on the page can name one.**
`many-prisons`. **MEASURED:** three prisons in measurably different states (funds
24,600 / 23,800 / 22,800) gave **1 distinct row label of 3**, all reading
`New Prison (1 gen)`; `inputsInPanel: 0`, and the words *rename* and *name* match
nowhere on the page. **✅ RE-VERIFIED:** the name is the literal `'New Prison'`
at `src/ui/save-panel.ts:726`, while storage *does* accept a `displayName`
(`:679` reads `prison.displayName ?? prison.prisonId`). The row's one varying
field, the generation count, is **stale**: `reportBackgroundSave` sets the status
line and never calls `refresh()` (`:613-615`), so a row read `(1 gen)` beside a
status reading `generation gen-…-4`.

**C5. Delete asks nothing, then names nothing.** `many-prisons`. **MEASURED:** 0
dialogs, status *"Prison deleted."*, and the survivors read exactly what the
deleted row read — so a player who deletes the wrong prison **cannot find out
that they did**. **✅ RE-VERIFIED:** the handler is four statements
(`src/ui/save-panel.ts:774-781`) and the repository deletes every generation and
then the slot in one transaction with no soft delete
(`src/persistence/local/repository.ts:308-317`). The missing dialog is #582's
LS-03 *from reading*; the un-auditability afterwards is new.

**C6. A bed is two tiles tall, nothing says so, and a plausible 24-bed layout
builds 12.** `hour-two`. **MEASURED:** `24 bed order(s) placed, 0 tile(s)
skipped` → `roomCapacity=12`, with *"The object was not placed — something is
already standing there."* standing in the alerts column for eleven in-game days
**with no `Clear this alert` control**. **✅ RE-VERIFIED:**
`src/content/object-catalog.ts:97` — `footprint: { width: 1, height: 2 }`.

**C7. On three of five tabs the save panel's Export, Import, Load and Delete are
outside its own box.** `touch-only`. **MEASURED:** `scrollHeight 240,
clientHeight 87`, with `Export` and `Import` landing on the canvas and `Load` and
`Delete` on a panel body. ○ TESTER'S CLAIM. The panel takes its height from the
rail and has *"no `max-height` of its own on purpose"* (`src/styles.css:56,70`).

**C8. A tap where a hidden catalogue row's coordinates sit lands on a live
control, silently.** `touch-only`. **MEASURED**, with the tester's own instrument
failure as the evidence: a tap aimed at `bed-wooden` was received by
`button.ui-action hud-build__remove`. Per-tab census at landscape: 22 unreachable
controls on Build, 20 on Rooms, 4 on Security, **0 on Overview and Regime**. The
tester named this its **weakest claim** — a player looks at the screen and those
rows are not painted there, so they may never aim at row seven. If a follow-up
finds every *painted* row reachable, this collapses into C3.

**C9. Discarding a rectangle the panel refused folds the whole Rooms panel
away** — with the tool still armed, taking the eighteen room types and the
requirement text the player needs off the screen. `the-misplay`. ○ TESTER'S
CLAIM, traced to `folded()` doing what it is written to do
(`src/ui/hud/rooms-panel.ts:521-522`, applied `:1771`): `Discard` clears
`pending` and leaves `armed` true, which is precisely a drawing pass.

**C10. A refusal outlives its subject for the whole session** — **known, #780,
now confirmed live and extended.** `the-misplay`. A refusal from a calibration
press survived **six successful cancellations, a hire, an admission and the
removal of its own subject**, and was still on screen at the end of every act.

**C11. The impatient double-press: four are absorbed, two are not.**
`the-misplay`. **MEASURED:** a repeated wall drag, object tile, `Admit` and
`Designate` are each refused with a named reason and cost nothing — but a second
`Buy` press **buys again** (−400 for 10 bricks) and a second `Hire` press
**hires again** (−160, `staff 0 -> 2`), both with **no confirm and no word**.

**C12. The delivery confirmation renders its own figure differently from the row
that priced it.** `the-misplay`. **MEASURED:** the row says `60 × Brick · 2,400
back`; the band says *"The delivery was cancelled — 2400 back."* **✅ RE-VERIFIED,
and the docblock asserts the opposite in terms:**
`src/ui/simulation-events.ts:869-876` — *"the same units — minor units,
unconverted — so the two render alike … A player who reads the row before
pressing reads the same figure in the confirmation afterwards"* — above `:877`,
which returns the raw integer, while the row passes
`localizer.formatNumber(...)` (`src/ui/hud/build-panel.ts:1938`). The figure is
the same; the rendering is not.

**C13. Nothing walks, for either population.** `can-i-see-my-prison`.
**MEASURED** on the render channel: **400 consecutive keyframes** over ticks
23758→27291, every velocity zero, every position an exact integer tile, and the
furthest any actor ever got from where the window found it is `0.00` or `5.66`
(= √(4²+4²)) **and nothing in between**. Six actors changed tile; none was ever
seen between tiles, so the eight-frame walk cycle that exists in both atlases can
never be selected. **Known for guards (#740); the new part is prisoners**, whom
neither #740 nor ADR 0088 covers. The tester correctly noted this does **not**
contradict ADR 0088, whose own status section warns that a guard hired into an
early-game prison has no distance to cross.

**C14. Three building states draw nothing or nearly nothing.**
`can-i-see-my-prison`. A queued wall is a 0.35-alpha brown slab on brown dirt; a
queued **bed inside a cell is invisible** — **✅ RE-VERIFIED**, `PLANNED_OBJECT_TINT`
is `CATEGORY_FALLBACK.object.topFill` = `0x7f8ba0`, a blue-grey
(`src/rendering/world/appearance.ts:225,160-176`), and the `housing` zoning tint
is `0x4f7fd0`, blue (`:85`), two independently chosen colours that collide; and
**the room rectangle the player has just dragged is cleared on mouse-up** —
**✅ RE-VERIFIED**, `this.areaOverlay?.clear()` at
`src/rendering/scene/world-scene.ts:998`, two lines before `RoomTool.place`. The
one state where a player must confirm a *place* is drawn nowhere; the panel names
a size, not a place.

### Tier D — the shape of the game

**D1. Hour two is empty, and the numbers say so three different ways.**
`hour-two`.

- **The economy is a constant.** `+4,780` at **seven consecutive day boundaries**,
  identical to the minor unit (17 residents × 300 − 320); `+6,060` at four
  consecutive boundaries in another act, **riots included**. 3,600 gross at 12
  residents is the same figure `docs/research/2026-08-29-what-a-day-actually-pays.md`
  measured at v0.0.210. **Day 16's ledger line is day 10's.**
- **Incident volume does not scale with the prison**, because volume is capped
  per sector and there is exactly **one** sector — the whole prison. So 30
  residents generate the same event volume as 1. The alerts column was
  **byte-identical at four readings spanning the last three in-game days**, every
  row stamped `Day 14`.
- **Growth adds almost nothing to the screen.** Going from 1 to 24 residents adds
  **one sentence of guidance, one backlog block and four roster rows**; the Build
  and Rooms tabs gain nothing but changed numbers.

**D2. #503 inverted: the people get worse in plain view and the money no longer
notices.** `hour-two`. **MEASURED:** a day-13 roster reading `Carla Rossi Medium
Idle Hunger 0%` and `Lars Tamm Medium Association Hygiene 4%` **while the day paid
the full 300 per resident**. The 40-per-unmet-need withholding is not in force, so
#503's erosion is gone and its silence is not. Its second half is now unreachable
inside ~24 in-game days: sentences are drawn at 14–90 days and nobody left in any
act. The 40% figure is **REASONED from constants, not measured**.

**D3. Construction is not the wait; the clock is — and the tester corrected
itself here.** `hour-two`. **MEASURED:** a 24-segment perimeter drawn paused cost
0 ticks, then ran at `1419 ticks for 24 wall segments = 59.1 ticks each`, against
60 predicted by the construction definition. One in-game day is 30 real seconds
at top speed (`SIMULATION_SPEEDS = [1,2,4]`, 50 ms/tick — **✅ RE-VERIFIED** at
`src/simulation/clock/fixed-step-clock.ts:17`), **so hour two is over in five
minutes.** The tester's first reading — that building cost nine in-game days —
was wrong, and its record says so.

---

## 2. What this game does well, with the numbers

`docs/AGENT_WORKFLOW.md` §5 asks for empty categories backed by the numbers that
establish them. Four of the five sessions produced one, and they are not
consolation prizes — three of them refute a premise the coordinator's own brief
had assumed.

**The money is handled exemplarily.** `the-misplay` made every money mistake it
could and every one had a complete, correct, findable route back **that names the
figure**: six walls drawn on the wrong line returned **480 of 480**, one order at
a time, each press answered *"The order was cancelled — the money it cost is
refunded."*; sixty bricks bought instead of six returned **2,400 of 2,400**. A
room drawn a tile short is **refused before the press**, with the reason. #772 is
closed in behaviour and the number it prints is right. (Caveat the tester
flagged itself: those runs were **paused by choice**, so every figure is the
paused best case; `docs/research/2026-09-03-what-cancel-actually-gives-back.md`
measured what a running clock does to the same presses.)

**The whole game is completable with a finger, at both tablet orientations.**
`touch-only` reached `prisoners=1 roomOccupants=1`, `staff=1`, `rooms=1` and money
earned, at 1024×768 *and* 768×1024, with **no `page.mouse` and no `page.keyboard`
anywhere in its instrument**. The gesture layer is exonerated with numbers:
one-finger pan exact (+4 of +4, +7 of +6.375); horizontal pans ending over the HUD
rail not stolen; two fingers pan while a tool is armed and submit **0** build
commands; both ends of `ZOOM_BOUNDS` reachable by pinch; the minimap takes a tap;
and **across all five tabs at both viewports, 0 visible controls below the 44px
tap target**. There is even an undocumented gift: a second finger mid-run
abandons it — the touch analogue of `Escape` — while the on-screen sentence calls
two fingers *the camera*.

**Switching prisons is exact.** `many-prisons`: kernel tick **13,622 in, 13,622
out**, funds 23,015, 1 room, 4 prisoners with the same names and identical need
percentages, 2 guards, day 6 at 67%, **and the same tab**. The only two
differences were both already explained elsewhere, and in one of them the restore
is the *more* accurate reading.

**The art that exists reads.** `can-i-see-my-prison`, from screenshots it
actually opened: a wall is unmistakable at 1× and good at 8×, a zoned floor is
real linoleum under a category wash, the owned plot outlines in blue with the land
beyond shaded down when you stand back, and at true in-game size (64×96 on a 64px
tile) **an orange prisoner and a capped blue guard are told apart instantly**.
Facing does not survive that size, but a standing actor being a still image is by
contract (`docs/ART_PIPELINE.md`: idle is one frame at 1 fps).

**It holds structurally over a long session.** `hour-two`: `hudNodes` 1,063 →
1,088 over **17 in-game days**; no fold state drifted; the alerts list peaked at 4
rows against a cap of 8. Nothing leaks and nothing grows without bound. The
problem with hour two is that it is empty, not that it breaks.

---

## 3. Not defects — recorded so they are not mistaken for findings

Three things look like defects and are not. Each tester made this call itself,
which is the discipline `AGENTS.md` asks for.

**Five free save slots.** The README's product targets promise *"multiple prisons
per account; five free save slots is the current product direction"*. The build
makes six prisons and the words *slot*, *limit* and *five* appear nowhere on
screen. This is **a direction not yet started, not a broken promise**:
`BASE_SAVE_SLOTS` bounds a cloud capacity nothing local reads
(`src/services/entitlements/products.ts:16-24` says so itself), and ADR 0043
records that there is no client identity layer for it to attach to.

**Object art.** All twenty catalogued objects are on the colour fallback —
`SPRITE_BY_OBJECT_ID` is literally `{}` (**✅ RE-VERIFIED**,
`src/rendering/world/environment-art.ts:186`) — so a bed, a chair, a desk, a
stove and a toilet are one slate-blue block differing only in footprint, and six
beds read as one grey platform. The file documents this and gives the cost of
fixing it. **Pre-alpha placeholder art is not a bug.** The same applies by half
to the zoning tint being keyed by *category*: 11 tints over 18 room types, so
cell/holding-cell, kitchen/canteen, shower/laundry, yard/common-room, the three
logistics rooms and solitary/security-office are each one colour on the world.
That half is a keying choice rather than missing art.

**A dismissal not refunding the day already paid.** **✅ RE-VERIFIED** as
deliberate and argued at length: `src/simulation/staff/dismissal.ts:113-130` —
*"A refund would make hire-then-dismiss a way to get money back for a day already
worked … Both of those are balance, and balance is the owner's."* **So the 80 is
not a defect.** What B1 measures is that nothing on screen says the 80 is gone.

---

## 4. Two things about this repository, found on the way

**#902 is closed and the problem stands.** `touch-only` went looking for the fix
that closed it and found it had been **reverted before merge** —
`13c50289 revert(hud): withdraw the edge fade; #902 is not this file's to
decide`. **✅ RE-VERIFIED:** `grep -c background-attachment src/ui/hud/hud.css`
returns `0` at v0.0.451. A closed issue whose fix is not in the tree is worth
knowing about independently of the catalogue geometry in C3.

**`tests/foundation/documentation-commit-citation-contract.test.ts` is red on
clean `main` in this container.** **✅ RE-VERIFIED** by the coordinator on an
unmodified checkout: `2 failed | 6 passed`. The cause is that this container's
clone is **shallow** (grafted at `f00c7d1`), so every commit hash cited in the
documentation falls outside the graft boundary. **Not caused by any tester, and
not a regression** — but it means that gate did not validate the citations in the
five records this round produced, and `git log -S` dating (which
`docs/AGENT_WORKFLOW.md` §3 asks for) is **UNKNOWN by construction here**. Two
testers reported this honestly rather than guessing a date.

---

## 5. What was not reached

Stated because `docs/AGENT_WORKFLOW.md` §5 requires it, and because a partial
pass reported honestly is worth more than a complete-sounding one.

- **Why the simulation stacks every prisoner on one tile** (A2b). The most
  important open question in this round.
- **A second room of any kind.** Every prison in the `hour-two` session had one
  cell, which is exactly why hunger, hygiene and recreation were unservable — so
  *"build a canteen and there might be something to do"* is still open, not
  refuted.
- **A wall drawn through a standing object, or across a zoned room boundary.** The
  brief asked for it; only wall-on-wall was measured.
- **A cell built facing the wrong way.** No buildable in this tree has a
  player-chosen orientation beyond the wall's tile edge, so the mistake could not
  be made.
- **Whether an orphaned object still counts** toward capacity, needs or a room's
  requirements (B4).
- **Two tabs of one profile racing each other** (#582's remaining half), export/
  import as a back-door second copy, and deleting the *active* prison.
- **A real touch device** — no physical contact area, no overlay scrollbar, no iOS
  gesture arbitration, no soft keyboard resizing the viewport. Also `isMobile:
  true`, long-press, double-tap, three fingers, screen readers, and any interface
  scale but 100%.
- **An incident's appearance at the exact tick it fires.** Six incidents produced
  nothing on the canvas, but none was paired against a canvas diff at its own
  tick.
- **The withholding rate restored** (D2's 40% is reasoned), a discharge, the
  incident log, and any viewport but 1440×900 outside the `touch-only` session.

---

## 6. The weakest claims, named by the testers themselves

Each session was required to name its own weakest claim and say what would
overturn it. Reproduced here because that is what makes the rest trustworthy.

| session | its weakest claim | what would overturn it |
| --- | --- | --- |
| `hour-two` | that a player *sees* the refusal when a press is dropped (A4) — the render path was read, not the screen | one capture of `.hud__refusal` at the instant of a dropped press. **If the band turns out empty, the finding is worse, not better** |
| `can-i-see-my-prison` | *"the move is a teleport"* (C13) — an argument from absence over one window in one prison shape | one keyframe anywhere with a non-zero velocity or a sub-tile position |
| `touch-only` | that hidden catalogue rows trap a *person* rather than only a tester (C8) | a run that scrolls until a row is painted and then taps it, finding every painted row reachable |
| `the-misplay` | that all three silences (B1) are silences a player would *notice*, rather than correct | a player-facing argument that a disappearing room and a disappearing roster row are their own confirmation. **The one it would defend under pressure is the standing object: 65 destroyed, no sentence, no figure anywhere** |
| `many-prisons` | that the list-ordering defect costs a player anything | names on the rows, or a measurement that the autosave bumps `updatedAt` often enough in ordinary play |

---

## 7. Instrument failures, reported rather than hidden

Eight were recorded across the round; they are in the individual records. Three
are worth repeating because each cost a reading and each would cost the next
reader the same:

- **A queue readout answering `"not laid out"` was taken for an empty queue**,
  producing two byte-identical screenshots that could not distinguish *"a built
  wall looks like a planned one"* from *"the wall was never built"*.
- **An actor tee read a guessed envelope path** (`payload.payload.body` instead of
  `payload.delta.data`), threw nothing, and made a nine-actor prison report *"the
  worker has published no actor keyframe at all"*.
- **A cancelled queue row is dead but still reads `Cancel`**, marked only by
  `aria-disabled`, half opacity and a `not-allowed` cursor — so a `hasText:
  'Cancel'` locator resolves to it and waits out its timeout. **On a touch device
  there is no cursor and 0.5 opacity is the only signal**, which is a finding
  nobody chased.

Every world press in every final instrument is guarded by `elementFromPoint`,
because a press on a HUD-covered point submits nothing at all and has cost this
repository three withdrawn findings.

---

## 8. Method, and what it cost

Five testers, each in **its own git worktree** cut from `0e614c7`, on its own
branch, on its own Playwright port, with its own scratchpad subdirectory —
`docs/AGENT_WORKFLOW.md` §2's rules, all of which exist because a past session
paid for them. Surfaces were kept disjoint: touch, the visual world, the second
hour, mistake-recovery, and multiple prisons.

**Git LFS was provisioned before anybody played** (`scripts/provision-git-lfs.sh`
then `git lfs pull`, 93 MB), and every tester re-checked it inside its own
worktree, because `git worktree add` does not run the smudge filter: a worktree
without it draws a world with **no actor sprites at all** and **passes anyway**,
since the simulation lives in the worker. The session-start hook's report that
LFS *"looks present"* is true of the checkout it inspected and false of every
worktree made from it. The `can-i-see-my-prison` session, whose entire question is
what gets drawn, would have been worthless without this and would not have said
so.

**One session was lost to an API session limit**, not to anything in the game:
`the-misplay` stopped mid-commit. Its record was already pushed and its instrument
work was recovered from its worktree, typechecked (`tsc -b`, exit 0) and committed
by the coordinator; the commit says so. Nothing was reconstructed from memory.

The round produced **8,229 lines** across five records and five instruments, and
**changed nothing under `src/`**.

---

## 9. Reproducing any of it

Each instrument is `tests/browser/playtest-2026-09-04-<slug>.playtest.ts`,
structured as numbered acts so one finding can be re-run without re-running the
round. **Nothing here is collected by CI** — `tests/browser/playwright.config.ts`
is `testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`. A playtest is evidence, never a gate.

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-<slug>.playtest.ts -g "act 1"
```

Use a distinct port per concurrent run: the config sets
`reuseExistingServer: false`, deliberately, so a run cannot silently measure
another checkout's `src/`.

---

## 10. The five records

| session | question it played | record |
| --- | --- | --- |
| `touch-only` | a tablet player with no keyboard and no mouse, end to end | [2026-09-04 touch only](./2026-09-04-touch-only.md) |
| `can-i-see-my-prison` | looking at the world rather than the panels, can a player tell what is going on? | [2026-09-04 can I see my prison](./2026-09-04-can-i-see-my-prison.md) |
| `hour-two` | the game *after* the first prisoner — several in-game days, 20–30 residents | [2026-09-04 hour two](./2026-09-04-hour-two.md) |
| `the-misplay` | every first-half-hour mistake made on purpose, and the route out of each | [2026-09-04 the misplay](./2026-09-04-the-misplay.md) |
| `many-prisons` | a player who already has one prison wants a second | [2026-09-04 many prisons](./2026-09-04-many-prisons.md) |

A sixth session was cancelled by the owner mid-flight and is not in the table: a
keyboard-only pass, on the grounds that nobody plays this game that way. That was
the right call and the brief was the coordinator's mistake. Its salvage — the tab
order is complete and trap-free with a visible focus ring on every stop, 17 stops
on arrival, and #903's keyboard half confirmed exactly — is recorded here rather
than in a document of its own, and one code-read observation from it is worth
keeping: **no player-visible string names the undo/redo keys**, which are physical
`KeyZ`/`KeyY` (`src/input/bindings.ts:64-65`) — **the keys labelled `W` and `Y` on
AZERTY**, a consequence that file's own comment states and no screen does.

---

## 11. What the coordinator recommends, in one list

Not decisions — `AGENTS.md` reserves the player-visible promise and the balance
behind several of these. This is the order the evidence supports.

1. **A1 first.** It is a sentence asserting a state the code predicts is false,
   in the panel a player consults to fix exactly that state, and the prediction is
   already written in a comment. Nothing else in this round is both this cheap to
   establish and this total in effect.
2. **A2b before A2.** Fixing the draw order makes twenty-two prisoners on one tile
   *visible* rather than *correct*. Find out why they are there first.
3. **A4, because it silently corrupts every other measurement** anyone takes of
   this game, including future playtests.
4. **A3, because it is unrecoverable and one press away** — and because the same
   property was already found on Load and fixed on neither.
5. **B1's standing-object case specifically**, since it is the one that survives
   the fix already in flight.
6. **C1 and C2 together**: they are the same defect — the interface tells a touch
   player things only a mouse-and-keyboard player can use — and the repository's
   own primitive already states the rule being broken.
7. **D1 is not a bug list, it is the roadmap question**, and it is the one thing
   here the owner cannot delegate: hour two is structurally sound and has nothing
   in it, and one sector is why.
