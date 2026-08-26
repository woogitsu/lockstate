# ADR 0039: A keyboard route to room zoning

> **Draft. The number is a placeholder.** ADR numbers are assigned centrally
> (`AGENTS.md`, *How this work is carried out*: *"ADR numbers are assigned
> centrally, after drafts return. A number is not reserved until it appears in
> `docs/adr/README.md`"*). **This document pre-commits to renumbering:** if any
> number is assigned to it that another branch also holds, *this* is the document
> that moves, exactly as 0035 renumbered from 0034 and as 0036 pre-committed to
> doing. The title is a placeholder too; the decision below is not.

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** Asked about this decision the owner answered, in Polish,
that they did not follow it and told the agent to handle it — *"nie czaję? ogarnij
to"* — and, of the accessibility decision alongside it, *"nie możesz sam tego
porobić?"* ("can't you do this yourself?"). **That is a real approval of the
judgement delegated and not of the text.** What was delegated is narrow and is
worth stating: the owner approved *that someone decide and act*, not this option
over the alternatives below. The argument in this document is the whole of the
warrant, and **a reader who disagrees with it should treat the decision as open**
rather than as settled by someone who weighed it — the same standing ADRs 0034,
0035, 0036 and 0037 carry, for the same reason.

**The number was assigned centrally** after this draft returned, per
`AGENTS.md`. The draft pre-committed to renumbering and that commitment stands:
if another branch holds this number, this document moves without argument.

This document was written by a
read-only agent against `54418b6` (v0.0.121) and every figure in it was produced
by executing that tree in Chromium; the runs are in the findings document that
accompanies it.

It answers **ADR 0022**'s amendment, *Open questions this amendment does not
answer*, item 1 (`docs/adr/0022-room-zoning-surface.md:672-712`):

> **The Rooms panel has no keyboard or numeric route, and the Build panel does.**
> … The Rooms panel shipped without an equivalent, so a rectangle can only be
> expressed by dragging. **Still open.** … What is *not* answered is the part this
> item leads with: there is still no keyboard or numeric route to a rectangle. …
> So a numeric route needs somewhere to live that costs no always-visible height,
> and finding one is a design decision that is still not made here.

It is issue **#411**, and it makes the decision that item deferred.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every measurement below was taken
on the assembled application page (`index.html` + `src/main.ts`) served by
`tests/browser/vite.config.ts`, in Chromium from `/opt/pw-browsers`, against
`54418b6` (v0.0.121). No figure is quoted from another document without being re-measured
here, and where a re-measurement disagrees with a document the disagreement is
stated rather than smoothed over (see §*Context*, *The figure ADR 0022 got wrong*).

Two product judgements are the owner's and are named as such: that **900×600 and
1280×720 remain supported viewports** (decision 2 rests entirely on this), and
that **a numeric route is the right shape of keyboard affordance for a rectangle**
rather than a keyboard cursor on the world (alternative D).

---

## The decision, in one sentence

**The keyboard route to zoning is four number fields in a folded "Enter
coordinates" disclosure placed inside the Rooms panel's existing catalogue
section, which set the same `pending` rectangle a pointer drag sets — so the
existing confirm control, refusals, minimum-size warning and `ZoneRoom`/`UnzoneRoom`
paths are reached unchanged, and no new gesture, command, action id or panel
section is introduced.**

---

## Context

### What the code does today

**Zoning has exactly one producer, and it is a pointer.**

- `src/ui/hud/rooms-panel.ts:1-16` — the panel's import block imports
  `action-button`, `collapsible-section`, `dom`, `list-row` and `panel`. It does
  not import `../primitives/number-field`. `src/ui/hud/build-panel.ts:9` does.
- `src/ui/hud/rooms-panel.ts:149` — `setPendingArea(area: RoomsPanelArea | undefined): void;`
  is the only way a rectangle becomes pending.
- `src/ui/hud/hud.ts:1304-1305` — its only caller is the world gesture:
  `options.worldRooms?.attachGestures((gesture) => { roomsPanel.setPendingArea(gesture.area); …`
- `src/ui/room-tool.ts:129-139` — `RoomTool.place(rect)` is the only producer of
  that gesture, called from `src/rendering/scene/world-scene.ts:449` (`commitArea`),
  which is reached only from `this.input.on('pointerup'|'pointerdown'|…)`
  (`:354, 363, 376, 445-449`).
- `src/input/actions.ts:1-13` — `ACTION_IDS` has eleven members and none of them
  names an area, a rectangle or a tile cursor, so no keyboard action could reach
  the room tool even if the canvas took focus.
- **Measured:** the world canvas answers `{ tabIndex: -1, hasTabindexAttr: false,
  role: null, ariaLabel: null }`. It cannot receive keyboard focus at all.
- **Measured:** the Rooms panel contains **zero** `<input>` elements. Its focusable
  controls are the panel toggle, the "ROOM TYPE" section header, eighteen room
  rows, and the four action buttons.

**And a prison with no room refuses every admission, permanently.**

- `src/main.ts:1959-1961` —
  `if (viewModel.counts.rooms === 0) { throw new Error('This prison has no room to hold a prisoner…'); }`
- `src/simulation/runtime/session-commands.ts:203-206` → `requestAdmission`
- `src/simulation/prisoners/prisoner-operations-runtime.ts:254` —
  `if (!this.intakeSystem.hasAccommodationTarget()) return { kind: 'refused', reason: 'no-accommodation' };`
- `src/simulation/prisoners/intake-system.ts:235-240` — false unless every
  classification group resolves an existing target.
- `src/simulation/rooms/zoning.ts:456` — `this.roomInstances.register(registered);`
  is the only mint of a room instance in a live session; the only other caller of
  `register` (`src/simulation/runtime/session-systems.ts:631`) replays a save.
- `src/simulation/runtime/new-session.ts:340-343` — *"No default room is zoned
  here … so a fresh prison still has no rooms until a `ZoneRoom` command arrives."*

**Demonstrated, keyboard-only, on the real page.** Tab reaches "New prison" (7
presses), the Rooms tab (10), the "Cell" row (22), "Draw on map" (14), Play (9),
the Overview tab (11) and "Admit a prisoner" (19) — a sensible order, every
control visible and focusable. Twenty-one keys on the armed room tool
(`Enter, Space, ArrowRight ×2, ArrowDown ×2, Enter, KeyD ×2, KeyS ×2, Enter,
NumpadEnter, KeyE, KeyR, KeyQ, Shift+Enter, Control+Enter, Equal, Minus, Escape`)
leave the confirm control hidden, its label at `"Designate 0 × 0"` and the area
readout at `"Nothing selected"`. The room count stays `0 ROOMS` through the clock,
and five keyboard presses of Admit leave `0 PRISONERS`. The same page driven with
the pointer reaches `Designate 5 × 5`, `1 ROOMS`, then `1 PRISONERS` at
`1 at Cell Assignment`. **The game is unfinishable without a pointer, and that is
a run rather than a reading.**

### Why this is not a general accessibility gap

Of the seventeen `HudIntent` kinds declared in `src/ui/hud/hud.ts:271-539`,
fifteen have a keyboard producer and two do not: `zone-room` (`:507`) and
`unzone-room` (`:522`). Both are unreachable for the same reason and both are
fixed by the same thing — a second producer of `pending`.

The rule was already written down and applied everywhere else.
`src/ui/hud/hud.ts:300-305`:

> …the Build panel's numeric fields, which is what gives object placement a
> keyboard route **on the day it ships rather than later** — `AGENTS.md` boundary
> 10 is not satisfied by "it works with a mouse", and ADR 0022's amendment records
> the Rooms panel shipping without one as an open question.

`src/ui/hud/build-panel.ts:35-40`:

> The numeric fields are still here, deliberately… Deleting them would have been
> the easy half of this change and the wrong half.

`git log -S "createNumberField" -- src/ui/hud/build-panel.ts` gives
`1d91000 2026-08-23 (#74)` — the Build tool got its numeric route the day it
shipped. `git log -- src/ui/hud/rooms-panel.ts` gives `84e1c61 2026-08-25 (#312)`,
`75e01cf (#317)`, `3389f29 (#336)`. **The Rooms panel is the one surface that
skipped a rule written two days before it shipped.**

### The tab-bar constraint, re-measured rather than cited

`docs/adr/0022-room-zoning-surface.md:365-371` and `:639-641`, carried into
`src/ui/hud/hud-state.ts:18-21` and `src/content/default-locale-en.ts:170`:
a sixth tab is foreclosed at 375×812. Re-measured at `54418b6` (v0.0.121) by injecting one:

| tabs | `.hud-tabs__inner` x | right | width |
| --- | --- | --- | --- |
| 5 (shipped) | **1.8** | **373.2** | 371.4 |
| 6, six-character label | **−32.6** | **407.6** | 440.3 |
| 6, nine-character label | −42.3 | 417.3 | 459.5 |

The five-tab figure reproduces to the decimal; a sixth fails
`tests/browser/ui-shell.spec.ts:745-746` (`tabs.x >= 0`, `tabs.right <= 375`).
**The route must fit an existing surface. This is live, not historical.**

### The figure ADR 0022 got wrong, and it is the one this decision turns on

`docs/adr/0022-room-zoning-surface.md:698-704` rejects a numeric fallback on
*"the Rooms panel's always-visible budget at 900×600 is 7.9px, the distance from
the status block's bottom edge to the panel's own fold, and a collapsed section
of its own is 45px"*.

That distance is a **gap**, not a budget: it does not count what
`.hud-rooms__list` can donate before hitting its 44px floor
(`--hud-rooms-catalogue-floor`, `hud.css:1621, 1633, 1647`). Measured by the
method the ADR itself uses — growing a fixed-height block inside
`.ui-panel__body` until the panel's last block crosses the fold or the body
overflows — **in the worst state a player reaches, one zoned unfinished room so
`.hud-rooms__needs` has a box** (`rooms-panel.ts:609-618`):

| Viewport | panel | list | needs | fold gap | largest extra always-visible block |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 555.1 | 211.8 | 52.5 | 17.00 | 175px |
| 1280×800 | 480.1 | 136.8 | 52.5 | 17.00 | 100px |
| **1280×720** | 420.1 | 76.8 | 52.5 | 17.00 | **40px** |
| 1024×768 | 456.1 | 112.8 | 52.5 | 17.00 | 76px |
| **900×600** | 338.1 | **44.0** | 40.5 | **7.77** | **2px** |
| 375×812 | 451.1 | 107.8 | 52.5 | 17.00 | 71px |

The panel heights reproduce `rooms-panel.ts:170-172`'s own figures
(480.1 / 451.1 / 338.1), so this measures what the ADR measured. The 7.77px fold
gap at 900×600 **is** the ADR's 7.9px — the ADR's number is right and answers a
different question. A collapsed `.ui-section` header measures **44.0px** live.

**So: 2px at 900×600 and 40px at 1280×720 against a 44px header.** ADR 0022's
conclusion holds and its margin was 37px where it is really 2px. With no room
zoned the same probe gives 42px at 900×600 — still short. Both states refuse a
peer section, and the tighter one is the one a player is in *after* their first
room, which is when they most need the route.

---

## Decision

### 1. The route produces a `pending` rectangle, and nothing else

Four `NumberField`s — tile X, tile Y, width, height — whose `onChange` writes the
panel's `pending` rectangle through the same assignment `setPendingArea`
(`rooms-panel.ts:820`) makes. That is the whole of the mechanism.

Everything downstream is already written and is not touched:

- `paintActions` (`rooms-panel.ts:674-680`) swaps the one 44px row to
  "Designate W × H" / "Discard" off `pending !== undefined`, so the confirm step
  appears for a typed rectangle exactly as it does for a dragged one.
- `pendingIsTooSmall` (`:485-490`) and `paintNote` (`:492-514`) apply the authored
  minimum-size warning unchanged.
- `confirmButton.onActivate` (`:427-444`) dispatches `options.onDesignate` or
  `options.onRemove`, which `hud.ts:1277` and its designate sibling turn into
  `zone-room` / `unzone-room` intents — **the same command, the same refusals, one
  path**, which is what #411's second acceptance criterion asks for.
- **Removal gets a keyboard route in the same stroke**, because the confirm row is
  driven by `pending` and not by which producer set it. `unzone-room` is the second
  of the two unreachable intents and it needs no separate work.

No new intent, no new command, no wire vocabulary, no new refusal reason, no
change to `src/rendering/**`, no new `ActionId` and no new key binding.

**Clamps.** Width and height take `min: 1, max: 64`, mirroring
`MAX_ZONE_DIMENSION_TILES` (`src/simulation/rooms/zoning.ts:132`) and
`MAX_ZONE_SIDE_TILES` (`src/rendering/build/area-picking.ts:59`) — the same clamp
the drag already applies, so the two routes can express the same set of rectangles
and no typed rectangle is refused `invalid-area` for a reason a dragged one cannot
be. X and Y take **no** clamp, exactly as the Build panel's do
(`build-panel.ts:1400-1421` pass no `min`/`max`), so a tile outside the owned
world produces the existing `out-of-bounds` / `unowned-land` refusal on the
control that was pressed rather than a silent clamp to somewhere the player did
not ask for.

### 2. It lives inside the catalogue section's scrolling body, because that is the only place that costs nothing

`.hud-rooms__catalogue > .ui-section__body` is `overflow-y: auto` with a 44px
floor (`hud.css:1616-1634, 1643-1648`). ADR 0022 §*Decision 1* already established
the principle for the Build catalogue — *"a longer list is absorbed by the list
rather than by the panel"* — and measured it there. Measured here, on the Rooms
panel, in the worst state, by injecting a fixed-height block after the room list
and reading the panel box, the fold gap, the body overflow and the rail overflow:

| Viewport | tallest block inside the catalogue body with the panel **unmoved** |
| --- | --- |
| 1440×900 | 412px |
| 1280×800 | 337px |
| 1280×720 | 277px |
| 1024×768 | 313px |
| **900×600** | **195px** |
| 375×812 | 308px |

A 132px block was verified byte-for-byte unchanged at all six viewports
(panel height, fold gap, body overflow and rail overflow all identical); a
269.8px block — the Build panel's whole open section, edge chooser included —
breaks 900×600 with 75px of body overflow. **The binding budget is 195px.**

The form costs, from live measurement of the Build panel's own primitives: one
`NumberField` row renders **63.2px**, and an eyebrow hint line 13.2px. Two rows
of two fields plus a hint is **≈139.6px**, and the disclosure's own 44px header
sits inside the same scroller. **≈184px against 195px at the binding viewport.**
It fits at every viewport, and the margin is 11px at the tightest — thin, and
stated as thin.

**Folded on arrival**, for the reason `build-panel.ts:1444-1446` gives:
*"it is the fallback route, and an open panel of number fields would read as the
way you are meant to build."*

**The label question, and it is real.** The section it goes in is titled
"ROOM TYPE" (`hud.rooms.catalogue`), and putting a coordinate form under a header
that names something else is the ADR 0011 objection ADR 0022 used against reusing
an existing tab (`:659-663`). The answer is one locale key: the catalogue
section's eyebrow moves to a key that names the whole block — what the room is and
where it goes — and the coordinate disclosure carries its own key beneath it.
One key changed, one key added, both in `src/content/default-locale-en.ts`, no
literal text under `src/ui/hud/**`.

### 3. What is refused, and by measurement rather than by preference

- **A peer section in the panel body** — the obvious mirror of the Build panel.
  Refused: 44px header against **2px** at 900×600 and **40px** at 1280×720
  (§*Context*). Two of five viewports.
- **A third button in `.hud-rooms__actions`** as the entry point. Refused:
  measured on the 238px row, a third button overflows by **55px** with an
  eleven-character label and by **7px** with a four-character one, at 1440×900,
  1280×800, 1280×720, 1024×768 and 900×600 alike; it fits only at 375×812, where
  the panel is full width. This reproduces ADR 0022's 37.9px finding for
  `.hud-build__actions` on the Rooms row with today's labels.
- **A sixth HUD tab.** Refused: x = −32.6, right = 407.6 at 375×812 (§*Context*).

### 4. The world canvas is left alone

No `tabindex`, no `role`, no `aria-label`, no accessibility-tree work on the
canvas. #411 puts that out of scope explicitly (*"The canvas/world view's
accessibility-tree representation (separate issue)"*), and this decision needs
none of it: the route never touches the world.

---

## Options considered, with their real costs

**A — a folded coordinate disclosure inside the Rooms catalogue section (recommended).**
Cost: four `NumberField`s, one nested `CollapsibleSection`, one new locale key and
one changed one, one new `RoomsPanel` method or an extension of `setPendingArea`,
and the tests in §*How this is tested*. Zero always-visible height at all six
viewports (measured). No new concept anywhere. Fixes `unzone-room` for free.
Risk: 11px of vertical margin at 900×600, and a form that sits inside a scrolling
list, which is a slightly odd home for it.

**B — a peer collapsed section in the panel body, mirroring the Build panel exactly.**
Cost: the smallest possible diff and the most familiar shape — and it does not
fit. 44px against 2px (900×600) and 40px (1280×720). Buying the space means
lowering `--hud-rooms-catalogue-floor` below one row or relaxing `.hud__aside`'s
floor, which `hud.css:719-722` already measured as taking the save panel to a
41.1px box over 240px of content. **Refused on measurement, not on taste.**

**C — a third control in the actions row.**
Cost: +55px / +7px of horizontal overflow at four viewports, clipped with no
scrollbar (`.ui-panel` is `overflow: hidden`, `primitives.css:294,301`).
**Refused on measurement.**

**D — a keyboard cursor on the world: arrow keys move a tile cursor, Enter sets
the corners.**
Cost, honestly: the canvas is `tabIndex: -1` with no `role` and no `aria-label`,
so this needs the accessibility-tree work #411 puts out of scope; two or more new
`ACTION_ID`s with `ActionDefinition`s, `descriptionKey`s and default bindings;
a new input context so the cursor keys do not fight the camera (`camera.up` etc.
are bound to the same arrows and to WASD, `docs/INPUT.md`); remapping entries per
`AGENTS.md` boundary 10; and `src/rendering/scene/world-scene.ts` gains a
persistent cursor with a preview. It is the *nicer* interaction for a sighted
keyboard player and it gives a screen-reader player **nothing at all** — there is
no accessibility-tree representation of the world for a cursor to move through.
It is a feature; #411 is a missing input route.

**E — a general player-facing sector-drawing gesture, serving keyboard, touch and
lockdown at once.**
This is the alternative #411 names, and it should be evaluated on the record
rather than dismissed. `docs/HANDOVER-2026-08-26.md:70-78` calls the missing
lockdown perimeter *"the strongest argument for giving the player a
sector-drawing gesture"*, and it is right about that.

**It is the right answer to a different question, and it does not answer this
one.** A sector-drawing gesture is a *gesture* — a pointer drag on a canvas that
cannot take keyboard focus. Built the way the room gesture was built, it ships
with exactly this defect again, and moves a keyboard-only player from "cannot
zone a room" to "cannot zone a room and cannot draw a sector". Nothing about
generalising a drag supplies a keyboard route; a keyboard route has to be built,
and once it is built it is the thing in option A.

Its price, from ADR 0036's own accounting rather than from an estimate.
`docs/adr/0036-a-derived-default-security-sector.md:335-339` (decision 7):

> A player-facing sector would need all four — the gesture, the versioned command,
> the worker-side validation and a refusal reason from an exhaustive `Record` —
> and that is a large part of why #396's option 2 is a feature rather than a
> registration.

Plus locale keys (ADR 0011), plus an answer to ADR 0036 open question 5 (`:494-500`):
*"When a player can draw a sector, what happens to this one?"* — which implies
decisions about the reserved `security-sector.prison` id, about
`SecuritySectorRegistry` needing an un-register, and about what an incident open
in the old sector does. ADR 0036's Status (`:17-21`) already declined it once for
being *"a large feature that first needs a decision about what a sector means to a
player"*.

**Where E is genuinely right, said plainly rather than smuggled in:** when the
sector surface is built, it must not invent a second rectangle form. Option A puts
the rectangle behind the panel's own `pending` state and behind
`createNumberField`; a sector surface should reuse both, and should carry its
keyboard route on the day it ships — the rule `src/ui/hud/hud.ts:300-305` already
states and the rule the Rooms panel broke. That is a note for whoever writes #396
option 2. It is not a reason to leave the game unfinishable in the meantime.

---

## How this is tested, in a form that cannot pass vacuously

The suite is why this shipped green: **no browser spec in this repository has
ever pressed `Tab`.** `grep -rc "Tab" tests/browser/*.spec.ts` returns 90
matches across four files and every one is `activeTab` or `clickTab`;
`page.keyboard.press` appears five times, all in
`tests/browser/world-scene-input.spec.ts:253, 336, 396, 446`, and none presses
`Tab`. A guard that does not move focus with the keyboard cannot catch this class
at all.

**1. The end-to-end guard: `tests/browser/app-shell.spec.ts`, keyboard only.**
One spec that drives `New prison → Rooms tab → room type → coordinates → confirm
→ Play → Overview → Admit` with `page.keyboard` and nothing else, and asserts the
*result*, never the presence of a control:

- `[data-metric="rooms"]` is `0` immediately before the confirm and `1` after the
  clock runs — the room exists in the worker, not merely in the DOM.
- `[data-metric="prisoners"]` moves `0 → 1` after Admit, and
  `.hud-intake__pipeline` reads the arrival at Cell Assignment.
- Every focus move is a real `Tab`, and the spec records the number of presses to
  each control so a regression in tab order is visible rather than silent.

**2. Three anti-vacuity devices, because the first assertion is only as good as
the pointer never having helped.**

- **A trusted-pointer tripwire.** The spec installs a document-level listener that
  fails the test if any `pointerdown`/`mousedown` with `isTrusted === true`
  reaches the page. A stray `.click()` added later by someone tidying the spec
  makes it fail loudly instead of passing for the wrong reason.
- **A pre-state assertion.** `rooms` is asserted `0` and `prisoners` is asserted
  `0` before the keyboard sequence begins, so a suite ordering that leaked a
  zoned prison from a previous test cannot let this one pass.
- **Mutation proof, per `AGENTS.md`** (*"A test proves nothing until the
  production code has been mutated and that test watched going red. Report both
  outputs."*). Two mutations, both recorded in the PR: (a) delete the
  `onChange → pending` wiring in `rooms-panel.ts` and watch the spec go red; (b)
  restore it and instead make the confirm dispatch a different area, and watch it
  go red on the room count rather than on a control's existence. **Run the spec
  against unfixed `main` first and keep that failure output**, as #411 requires.

**3. `tests/unit/` — one path, not two.** A headless test asserting that the
numeric route and a simulated gesture produce **the same** `RoomsPanelDesignateIntent`
for the same four numbers, and that both go through `setPendingArea`, so the
"no parallel path" criterion is a compiled assertion rather than a promise. Plus
the clamp: width/height outside `[1, 64]` are clamped by the field, X/Y are not
clamped, and a rectangle below the selected room's authored minimum leaves the
confirm control **disabled** with the too-small note showing — the existing
behaviour, now reached from the keyboard.

**4. What must not be asserted.** That the fields exist; that the section is in
the DOM; that a control has an `aria-label`. #411 says it outright — *"Do not
assert merely that a control exists; assert the command was issued and the room
exists afterwards"* — and every one of those would have passed on the day the
Rooms panel shipped without a keyboard route.

**5. Localization.** `tests/foundation/localization-key-completeness.test.ts`
already covers new `*Key:` fields by name, so the added key is gated without the
gate being widened (ADR 0011; #411's fourth criterion).

---

## Consequences

- **`AGENTS.md` boundary 10 becomes true of the Rooms panel**, which it is not
  today, and `docs/INPUT.md`'s room-designation bullet gains its keyboard half.
- **`unzone-room` gains a keyboard route as a side effect**, because the confirm
  row is driven by `pending` and not by its producer. The second of the two
  unreachable intents closes without separate work.
- **No persisted shape moves.** `SAVE_SCHEMA_VERSION` is untouched, no migration
  exists, and no command, wire vocabulary or refusal reason is added. Rejecting
  this ADR takes out a panel section and two locale keys and alters no player's
  save.
- **Determinism is unaffected.** The route produces the same `ZoneRoom` the drag
  produces; nothing draws RNG and nothing reads a clock.
- **The Rooms panel's vertical budget is spent down to 11px at 900×600.** The next
  block anyone wants inside the catalogue section has that much to work with, and
  the next one outside it has 2px. Both figures are recorded here so the next
  change is a visible decision.
- **The browser suite learns to press `Tab`** for the first time, which is a
  capability the other four HUD surfaces will want and do not have.
- **ADR 0022's amendment, open question 1 closes.** Its "7.9px" is left standing
  as written, with this document recording that it measured the fold gap and that
  the quantity the decision needed is 2px.
- **If this ADR is rejected**, ADR 0022 open question 1 re-opens and the game stays
  unfinishable without a pointer. That is the status quo, stated so that "do
  nothing" is priced.

---

## Open questions

1. **Are 900×600 and 1280×720 supported viewports?** This decision rests entirely
   on their being so; drop them and alternative B becomes available and is
   simpler. Nothing in `docs/` states the support matrix — it exists only as
   `CATALOGUE_VIEWPORTS` in `tests/browser/ui-shell.spec.ts:941-947` and as ADR
   0022's five-row tables. **This is the owner's to answer, and it is the one
   answer that would change the decision rather than refine it.**
2. **Does `uiScale` break the 11px margin?** `docs/INPUT.md` names `uiScale` as a
   validated accessibility setting. I measured at one scale only. A player at
   1.25 may put the ≈184px form past the 195px cap at 900×600, and the honest
   answer may be that the form's hint line is dropped at small viewports the way
   `.hud-build__note` already clamps below 700px of height (`hud.css`).
3. **Should the coordinate fields seed from the last confirmed rectangle?** A
   player zoning six cells in a row types twenty-four numbers. Seeding X from the
   last rectangle's right edge would halve that and would also be the panel
   deciding something the player did not say. Not decided here.
4. **Does the keyboard route belong on a primitive rather than in this panel?**
   Option E's note argues a future sector surface should reuse this form. Whether
   that means `createRectangleField` in `src/ui/primitives/` on the day the second
   caller exists, or a copy, is a decision for the second caller and not for this
   one — but it is worth *not* burying the form in `rooms-panel.ts` internals in a
   way that makes extraction painful.
5. **Should #337 replace the removal half of this?** With an instance id per tile,
   removal could name an instance instead of a rectangle, and a per-row "Remove"
   in a room-instance list would be a better keyboard route than typing the
   rectangle again — the shape `cancel-build-order` already has. Neither blocks
   the other; this note exists so that whoever lands #337 knows there is a route
   here to reconsider rather than to duplicate.

## What would change my mind

- **A support-matrix answer dropping 900×600 and 1280×720.** Then B, and B is
  smaller and more conventional. This is the strongest counter and it is one
  sentence from the owner.
- **A measurement showing the form does not fit inside the catalogue body** at a
  viewport, locale or `uiScale` I did not test. The margin is 11px at the binding
  viewport and I varied neither locale nor scale.
- **Evidence that a keyboard-only player is not the target and a screen-reader
  player is.** If the requirement is really the screen reader, option A is
  necessary but not sufficient — the world would still be an opaque canvas, and
  the honest next step is the accessibility-tree issue #411 defers, not this one.
- **A committed plan for #396 option 2 landing first.** If a player-facing sector
  gesture is being built now, its rectangle surface and this one should be
  designed together, and I would want this decision to become a section of that
  one rather than to precede it. Absent such a plan, waiting means shipping a
  release in which the game cannot be completed without a mouse.
