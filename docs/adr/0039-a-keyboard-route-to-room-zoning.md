# ADR 0039: A keyboard route to room zoning

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** Asked about the accessibility work the owner answered, in
Polish, *"gra jest daleka od ukończenia, nie możesz sam tego porobić?"* ("the
game is far from finished — can't you just do this yourself?"), and later
*"rób tak żeby było dobrze, działaj autonomicznie, rób research i sam decyduj"*.
**That is a real approval of the judgement delegated and not of the text** — the
same standing ADRs 0034 through 0038 carry. The owner asked for issue #411 to be
built rather than proposed, against a design
draft an earlier read-only agent had produced. So the decision to give zoning a
keyboard route at all is the owner's; **where that route lives, and the two
places it does not, are this document's** — and they differ from the draft on
the one measurement the draft's own placement rested on. A reader who disagrees
with the placement should treat that half as open.

**The number was assigned centrally, and this document was renumbered once
already.** It was drafted as 0038 — the index stated 0038 free and the one open
pull request (#355) carried no ADR — but four agents were working in parallel
from unpushed worktrees, a number is not held until something is pushed, and
0038 had in fact been taken for *"What makes a save compatible"* in the same
hour. **That is the collision this repository has now had twice**, and it is why
`AGENTS.md` assigns numbers centrally after drafts return rather than letting
each author enumerate. This document renumbered to 0039 without argument, and
still would again.

It closes **ADR 0022**'s amendment, *Open questions this amendment does not
answer*, item 1: *"The Rooms panel has no keyboard or numeric route, and the
Build panel does … So a numeric route needs somewhere to live that costs no
always-visible height, and finding one is a design decision that is still not
made here."*

## The decision, in one sentence

**The keyboard route to zoning is a folded "Enter coordinates" form — tile X,
tile Y, width, height, and one control that produces the rectangle — placed
inside `.hud-rooms__list`, the catalogue's scroll region, which sets the same
pending rectangle a pointer drag sets; so the confirm control, the minimum-size
warning, the refusals and the `ZoneRoom`/`UnzoneRoom` paths are reached
unchanged, and no gesture, command, action id, refusal reason or panel block is
added.**

## Context

### What was wrong

Zoning had exactly one producer and it was a pointer. `RoomTool.place` is called
from `WorldScene`'s `commitArea`, which is reached from `this.input.on('pointer…')`
and from nothing else; the world canvas answers `tabIndex: -1` with no `role`
and no `aria-label`, so it cannot take keyboard focus at all; and `ACTION_IDS`
names no area, rectangle or tile cursor. The Rooms panel imported no
number-field primitive and contained zero `<input>` elements.

That was not a lost convenience. A prison with no room refuses every admission —
`src/main.ts` guards on `counts.rooms === 0`, and behind it
`IntakeSystem.hasAccommodationTarget()` is false until a room instance exists,
which only `RoomZoningService.zone` mints in a live session. **So the game could
not be finished without a pointer**, for the rest of the session, every session.

**Sixteen of the eighteen `HudIntent` kinds had a keyboard producer.** The two
that did not were `zone-room` and `unzone-room`, and both for one reason: each
needs a rectangle, and the only producer of one was a drag.

Both halves of that sentence are now stated with the boundary that lets the next
reader re-derive them, because the first half was **wrong on the day this
document landed** and the second half had never been established at all.

#### The count, and the four numbers that were live at once

This paragraph read *"Fifteen of the seventeen `HudIntent` kinds had a keyboard
producer"* until it was corrected. The union declares **eighteen** members and
declared eighteen at `9a43f3e`, the commit that landed this document:
`src/ui/hud/hud.ts:322-668` (re-anchored 2026-09-06), opening at `export type HudIntent =` and closing at
its last member, before the comment that introduces `HudUnavailableNotice` (`:670`) —
`select-tab`, `set-clock`, `toggle-panel`, `place-build-order`, `place-object`,
`remove-object`, `purchase-materials`, `admit-prisoner`, `hire-staff`,
`arm-build-tool`, `undo`, `redo`, `cancel-build-order`,
`cancel-material-purchase`, `release-guard`, `zone-room`, `unzone-room`,
`arm-room-tool`. They are written out rather than summed on purpose; the
boundary and the list are what a hand count skips.

**Re-anchored 2026-09-06, and stale a second time, in the same direction as
before: the union is 21 members today, not eighteen, and was already 21 at
this window's own start (`c57f5fa8`) — this is not this window's drift.**
`select-prisoner`, `dismiss-staff` and `dismiss-alert` are the three this
paragraph's list does not name, each grep-counted directly in the current
span (`readonly kind:` occurs 21 times in `hud.ts:322-668`, confirmed against
`c57f5fa8` too so the number is not this pass's arithmetic on a diff). Per
this corpus's own rule (`docs/AGENT_WORKFLOW.md` §4, "a correction is no more
durable than the claim it corrected"), the count above is marked rather than
silently bumped to twenty-one, because a paragraph that keeps drifting past
its own correction is the pattern worth recording, not just the number.

**Four figures for this one union were in the repository simultaneously when
that sentence was written, and three of them were prose.**
[ADR 0022](./0022-room-zoning-surface.md) `:82` says *"seven"*.
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md)'s entry — whose entire subject is ADR
0022's drifted hand count — said *"fifteen"*, was corrected to *"sixteen"* in
`518e58c`, and was corrected again to *"eighteen"* in `ab33903`, **twelve
minutes after this document landed**. And this document said *"seventeen"*. So
this was not a stale figure copied from a neighbour: it is a **fourth** wrong
one, reached independently, in the one document whose whole subject is those
intents — and it was produced in the same hour that the entry warning about
exactly this defect was itself being corrected for the second time. That is the
argument for `docs/AGENT_WORKFLOW.md` §4's first rule, met three times over in
one union: a sentence stating a tally rots first, and a correction is no more
durable than the claim it corrected.

#### The two that had none, which had been asserted rather than shown

Measured at `cf723b3` — the parent of `2073e9a`, the change this document
decided, so this is the state *"What was wrong"* describes. A kind counts as
having a keyboard producer when a player with no pointer can reach it: a
natively focusable control, or a key binding.

- **Fourteen reach a real `<button>`.** Every HUD control here is one:
  `createActionButton` builds `element('button', …)`
  (`src/ui/primitives/action-button.ts:37`), `createTabButton` likewise
  (`tab-button.ts:44`), and a collapsible section's header is a `<button>` too
  (`collapsible-section.ts:69`). That covers `select-tab`, `set-clock`,
  `toggle-panel`, `arm-build-tool`, `arm-room-tool`, `hire-staff`,
  `release-guard`, `admit-prisoner`, `purchase-materials`,
  `cancel-material-purchase` and `cancel-build-order`; a catalogue row with an
  `onActivate` is a `<button>` too (`list-row.ts:40`), so choosing *what* to
  place is reachable as well. `place-build-order`, `place-object` and
  `remove-object` add the Build panel's numeric fields, which are real
  `<input type="number">` (`number-field.ts:46,50`) feeding the submit button —
  the precedent this document's decision follows, and the one quoted below.
- **Two are keys and nothing else.** `undo` and `redo` are `edit.undo` and
  `edit.redo` (`src/input/actions.ts:11-12`), dispatched from the `keydown`
  listener at `src/rendering/scene/world-scene.ts:335` and handled at `:585`
  and `:588`. They have no on-screen control at all, which is its own gap and
  is not this document's.
- **`zone-room` and `unzone-room` had none, and the reason is sharper than "no
  control".** Their control *was* keyboard-reachable — the confirm button is a
  `createActionButton` like the rest. What had no keyboard producer was the
  **rectangle it confirms**. At `cf723b3` the panel's `pending` had exactly one
  writer that set it to anything other than `undefined`, `setPendingArea`
  (`src/ui/hud/rooms-panel.ts:820`, verified still correct **at `cf723b3`**,
  the commit this paragraph is dated to — `setPendingArea` has since moved to
  `rooms-panel.ts:1997` and its call site to `hud.ts:1917`, but this sentence
  is explicitly historical and was never a claim about current `main`); its
  only caller anywhere in `src/` at that commit was
  `src/ui/hud/hud.ts:1305`, fed from `worldRooms.attachGestures`, i.e.
  `WorldScene.commitArea`, which is reached only from `finishPointer` on
  `'pointerup'` (`src/rendering/scene/world-scene.ts:449`). So the player could
  focus and press the confirm button all day and it would dispatch nothing.

That is what makes this a keyboard *route* rather than a keyboard *control*, and
it is why the decision below adds no control to the actions row: the row already
had one that worked. **It is also why this sentence is written in the past
tense and should stay there** — the form this document decides is the missing
producer, so once it shipped the tally became eighteen of eighteen.

The rule had been written down two days before the Rooms panel shipped, in
`src/ui/hud/hud.ts`: the Build panel's numeric fields are *"what gives object
placement a keyboard route on the day it ships rather than later — `AGENTS.md`
boundary 10 is not satisfied by 'it works with a mouse'"*. This panel is the one
surface that skipped it.

### The constraint: the Rooms panel has no always-visible height

ADR 0022 rejected a numeric fallback on a measurement, and its conclusion holds.
Re-measured on the assembled page in the tightest state a player reaches — one
prison, one zoned unfinished room so `.hud-rooms__needs` has a box, the panel
open — by growing a fixed-height block in each candidate host until the panel's
height, its fold gap, or any of `.hud-rooms > .ui-panel__body`,
`.hud-rooms__catalogue` and the catalogue's `.ui-section__body` moves:

| Host | 1280×720 | 900×600 |
| --- | --- | --- |
| the panel body, beside the map block | **32px** | **0px** |
| the catalogue section's `.ui-section__body` | **41px** | **4px** |
| `.hud-rooms__list` | ≥400px (the probe's own cap) | ≥400px |

A collapsed `.ui-section` header is 44px. **So a peer section is refused, and so
is a section inside the catalogue body** — at both viewports, by 3px and 40px in
the second case. A third button in `.hud-rooms__actions` was already refused on
horizontal overflow, and a sixth HUD tab at 375×812.

**This corrects the design draft this work was given**, on the number its
placement rested on. The draft measured 195px available inside the catalogue
section body at 900×600 and concluded a ≈184px form fitted with 11px to spare.
Its probe checked the panel's height, the fold gap, `.ui-panel__body`'s overflow
and the rail's — but never `.hud-rooms__catalogue`'s own box, which is exactly
where the cost lands, because that body is **not** the scroll region. The list
inside it is, and at both tight viewports the list is already on its one-row
floor. Measured with that box read: 4px, not 195px. The draft's placement did
not fit, and neither did anything else outside the scroller.

## Decision

### 1. The form lives inside the list, which is the one box that can pay

`.hud-rooms__list` is `overflow-y: auto` with a one-row floor and eighteen room
types in it, so it scrolls at every viewport by design — ADR 0022's own
principle for the Build catalogue, *"a longer list is absorbed by the list rather
than by the panel"*, applied to the box that actually does the absorbing. The
form is the last child of that scroller, below the rows, with `flex: 0 0 auto`
so a squeeze cannot paint its fields over the rows above it.

Measured with the real form rather than a stand-in, folded and open, at 1440×900,
1280×800, 1280×720, 1024×768, 900×600 and 375×812: the folded form is **45px**
and the open form is **252.56px**, and at every one of the twelve states the
panel's height, its fold gap, the last block's bottom edge, the panel's
`scrollTop` and the list's own height are **identical to the figures before this
change** — 555.11 / 480.11 / 420.11 / 456.11 / 338.11 / 451.11 — with no box
shorter than its own content and no rail overflow. Opening the form adds 208px to
the list's scroll height and nothing to the panel's.

**Folded on arrival**, for the reason `build-panel.ts` gives its own: it is the
fallback route, and an open form of number fields would read as the way you are
meant to zone.

**The section it sits in is relabelled.** `hud.rooms.catalogue` read "Room type",
which would have named half of its own contents; it now reads "Room type and
area". Measured at all six viewports including 375×812, the eyebrow stays on one
line and the header stays 44px.

### 2. The form produces a rectangle; it does not designate one

Four `NumberField`s and one `ActionButton`. The button is the typed route's
*release* — it calls the same `adoptPendingArea` a finished drag calls — and the
existing confirm control still has to be pressed. The fields themselves set
nothing.

That last point was arrived at by being wrong first. Fields that wrote the
pending rectangle on every `change` worked for one designation and then went
dead: `NumberField` reports on `change`, a field re-entered with the value it
already holds fires nothing, and after a confirm clears the pending rectangle
the same four numbers could never be said again. The keyboard removal spec
found it. A press also keeps a half-typed rectangle from becoming pending
between two fields, which would make the arm and remove controls vanish and come
back mid-edit.

**Amended 2026-08-29 (#548).** The premise in that paragraph — "`NumberField`
reports on `change`" — stopped being the whole truth on that date, and the
sentence is marked rather than rewritten because the decision it supports did
not move. The field now reports on `input` as well: `change` fires when a field
is *left*, the click on a button beside it is what leaves it, and the Build
panel's Buy control was therefore reading a stale quantity at the instant it was
pressed. The consequence for this ADR is that the going-dead failure above could
no longer happen by that route — a re-typed identical rectangle does now reach
its fields. **The decision stands, on the other argument in the same paragraph,
which `input` strengthens rather than weakens:** `input` fires on every
keystroke, so fields that wrote the pending rectangle themselves would now write
one *per keystroke*, designating `1`, `15` and `152` on the way to a width the
player had not finished saying. The button is still the release.

Everything downstream is untouched: `paintActions` swaps the one 44px row to
"Designate W × H" / "Discard" off `pending !== undefined`, `pendingIsTooSmall`
disables the confirm with the authored minimum's warning, and
`confirmButton.onActivate` dispatches the same `onDesignate`/`onRemove` the drag
reaches. **No new intent, command, wire vocabulary, refusal reason, `ActionId` or
key binding, and no change under `src/rendering/`.**

**Removal came free, and it was verified rather than assumed.** The confirm row
is driven by whether a rectangle is pending and never by who set it, so
`unzone-room` — the second of the two unreachable intents — gained its keyboard
route with no separate work. `tests/browser/app-shell.spec.ts` drives it: room
count 0 → 1 → 0, keyboard only.

### 3. Width and height are bounded; tile X and tile Y are not

`MAX_ROOM_SIDE_TILES` bounds the two sides at 64, mirroring the simulation's
`MAX_ZONE_DIMENSION_TILES` and the renderer's `MAX_ZONE_SIDE_TILES`, so the two
producers of a rectangle reach exactly the same set of rectangles and no typed
rectangle earns an `invalid-area` a dragged one cannot. `AGENTS.md` boundary 1
forbids the HUD importing the simulation, so it is a third declaration of one
number and `tests/unit/ui-hud-rooms-panel.test.ts` imports all three and holds
them together.

Tile X and tile Y take **no** bound, exactly as the Build panel's coordinates
take none. The panel does not know where the owned world is, and clamping a
coordinate to a number the panel guessed would move a designation somewhere the
player did not ask for and call it success. Out of bounds already has a refusal,
reported on the control that was pressed, and the refusal is the honest answer.

### 4. An open form ends the drawing pass

Arming folds the panel to its header so the player can see the world to drag
(ADR 0022's amendment). That fold was a dead end for the typed route: pressing
"Remove rooms" arms the tool, so a keyboard player reaching for a removal
watched the only route they have fold itself away. `drawing()` now also requires
the coordinate form to be collapsed. The fold exists to uncover the world for a
*drag*; a player typing is not dragging.

### 5. The world canvas is left alone

No `tabindex`, no `role`, no `aria-label`, no accessibility-tree work. #411 puts
that out of scope explicitly, and this route never touches the world.

## Alternatives, with the measurement that refused each

- **A peer collapsed section in the panel body**, mirroring the Build panel
  exactly — the smallest and most familiar diff. 44px against 32px at 1280×720
  and 0px at 900×600. Buying the space means lowering the catalogue floor below
  one row or relaxing the rail's, which `hud.css` already measured as taking the
  save panel to a 41.1px box over 240px of content.
- **A collapsed section inside the catalogue section's body** — the design draft's
  choice. 44px against 41px at 1280×720 and 4px at 900×600. It is refused by 3px
  at a viewport where nothing looks wrong until the panel is inspected, which is
  the most dangerous kind of near-miss and the reason this document states the
  method as well as the number.
- **A third control in the actions row.** Refused on horizontal overflow at every
  desktop viewport.
- **A keyboard cursor on the world**: arrow keys move a tile cursor, Enter sets
  the corners. Needs the accessibility-tree work #411 defers, two or more new
  `ACTION_ID`s with bindings and remapping entries, an input context so the
  cursor does not fight the camera, and a persistent cursor in the world scene.
  It is the nicer interaction for a sighted keyboard player and gives a
  screen-reader player nothing at all, because there is no accessibility-tree
  representation of the world for a cursor to move through. It is a feature;
  #411 is a missing input route.
- **A general player-facing sector-drawing gesture** (the alternative #411 names,
  and `docs/HANDOVER-2026-08-26.md`'s "strongest argument"). It is the right
  answer to a different question. A gesture is a pointer drag on a canvas that
  cannot take keyboard focus, so built the way the room gesture was built it
  ships with this defect again. ADR 0036 priced it: the gesture, the versioned
  command, the worker-side validation, a refusal reason from an exhaustive
  `Record`, locale keys, and an answer to its own open question 5. When it is
  built it should reuse this form rather than invent a second rectangle surface,
  and carry its keyboard route on the day it ships.

## How this is guarded

The suite is why the defect shipped green: **no browser spec in this repository
had ever pressed `Tab`.** Every `Tab` in `tests/browser/*.spec.ts` was
`activeTab` or `clickTab`, and the five `keyboard.press` calls were arrows and
letters in the world scene. A guard that never moves focus with the keyboard
cannot catch this class at all.

- **`tests/browser/app-shell.spec.ts`** gained two keyboard-only specs — the
  whole loop (new prison → Rooms → room type → coordinates → confirm → Play →
  Overview → Admit) and removal — driven with `page.keyboard` and nothing else.
  They assert the **result and never a control**: `[data-metric="rooms"]` moving
  0 → 1 with a real worker behind it, `[data-metric="prisoners"]` moving 0 → 1
  after it, and 1 → 0 for the removal. Both counts are asserted `0` first, so a
  prison leaked by an earlier test cannot let either pass, and a document-level
  tripwire fails the test if any `pointerdown`/`mousedown` with
  `isTrusted === true` reaches the page — then makes one deliberately at the end,
  so a listener that never attached cannot read as silence.
- **`tests/browser/ui-shell.spec.ts`** pins that a typed rectangle and a dragged
  one produce the *same* command, against each other and against a literal;
  the clamp on the sides and its absence on the tile; and that a rectangle under
  the authored minimum leaves the confirm disabled and dispatches nothing when
  pressed.
- **`tests/unit/ui-hud-rooms-panel.test.ts`** holds the three declarations of the
  64-tile bound together.
- Both specs were run against the unfixed tree first and kept red, and the
  headline spec was re-run under two mutations: with the form's control gutted
  (red on the area readout) and with `hud.ts`'s designate dispatch removed (red
  on the room count, which is the assertion that matters).

## Consequences

- **`AGENTS.md` boundary 10 becomes true of the Rooms panel.** `docs/INPUT.md`'s
  room-designation entry gains its keyboard half.
- **`unzone-room` gains a keyboard route** with no separate work, and both of the
  two unreachable intents close.
- **No persisted shape moves.** `SAVE_SCHEMA_VERSION` is untouched, there is no
  migration, and nothing is added to the wire. Determinism is unaffected: the
  route produces the same `ZoneRoom` the drag produces, draws no RNG and reads no
  clock.
- **The panel's always-visible budget is unchanged**, which is the point: 0px at
  900×600 and 32px at 1280×720, exactly as before this change. The next block
  anyone wants in this panel has what it had. Anything that must be *always*
  visible still does not fit, and the answer is the list.
- **The browser suite can press `Tab`**, which is a capability the other four HUD
  surfaces will want and do not have.
- **ADR 0022's amendment, open question 1 closes.** Its "7.9px" stands as
  written; it measured the fold gap, and the quantity the decision needed was the
  per-host cap above.

## Open questions

1. **Does `uiScale` change any of this?** `docs/INPUT.md` names `uiScale` as a
   validated accessibility setting and every figure here was taken at one scale.
   The exposure is smaller than it would have been for the draft's placement —
   the form is inside a scroller, so a taller form scrolls rather than overflows
   — but the *folded* 45px is inside that scroller too, and the row heights it
   competes with all scale together.
2. **Should the fields seed from the last confirmed rectangle?** A player zoning
   six cells in a row types the same four numbers six times. Seeding X from the
   last rectangle's right edge would halve that and would also be the panel
   deciding something the player did not say. Not decided here.
3. **Should this form become a primitive?** If a sector-drawing surface is ever
   built it should reuse this rather than invent a second rectangle form.
   Whether that means a `createRectangleField` in `src/ui/primitives/` on the day
   the second caller exists, or a copy, is that caller's decision — but the form
   is deliberately assembled from primitives rather than buried in this panel's
   internals.
4. **Should #337 replace the removal half?** With an instance id per tile a
   removal could name an instance rather than a rectangle, and a per-row
   "Remove" in a list of room instances would be a better keyboard route than
   typing the rectangle again — the shape `cancel-build-order` already has.
   Neither blocks the other.
5. **Is a collapsed `.ui-section` 44px or 45px? This document says both, and so
   does the corpus around it.** `### The constraint` above states *"A collapsed
   `.ui-section` header is 44px"* and prices the refusals against 44; open
   question 1 above, ADR 0031's decision 3 (*"A collapsed `.ui-section` is
   45px"*), ADR 0022's amendment (*"a 45px collapsed section"*) and
   `src/ui/hud/build-panel.ts:380` (*"a collapsed section of its own is 45px"*)
   all say 45. **This is recorded open rather than settled, and deliberately so
   — nothing here picks a side.**

   What the stylesheet suggests, which is a hypothesis and not the measurement:
   the two figures may not name the same box. `.ui-section__header` carries
   `min-height: var(--tap-target)` (`src/ui/primitives/primitives.css:368`) and
   `--tap-target` is `44px` (`src/ui/tokens.css:150`), while `.ui-section`
   itself carries `border-top: var(--hairline)` (`primitives.css:360`) with
   `--hairline: 1px` (`tokens.css:121`) — so a collapsed *header* would be 44px
   and a collapsed *section* 45px, which is exactly how the two phrasings
   divide. ADR 0031's own decision 3 says a queue costs *"a 1px border and a
   44px header"*, which is that reading written out. Against it:
   `.ui-section:first-child` zeroes the border (`primitives.css:361`), so the
   first section in a body would be 44px either way, and `min-height` is a floor
   rather than a height, so neither number is forced by the CSS alone.

   **What would settle it:** one `offsetHeight` read on a collapsed
   `.ui-section` and on its `.ui-section__header`, in a first-child position and
   in a later one, through `tests/browser/ui-harness.html` — the same harness
   every other figure in this document was taken through. That could not be run
   for this entry: the browser suite does not start in the container this was
   written in, for want of Git LFS content, which is the same reason
   `verify:assets` does not run there.

   **What does not turn on it:** the refusals in `### The constraint` and in
   `## Alternatives`. Both budgets a peer section is measured against (32px and
   41px at 1280×720, 0px and 4px at 900×600) are below 44, so the section is
   refused at 44 and refused by one more pixel at 45. A reader re-deriving those
   refusals gets the same answer under either figure; a reader re-using the
   figure for a *new* budget should measure it first.
