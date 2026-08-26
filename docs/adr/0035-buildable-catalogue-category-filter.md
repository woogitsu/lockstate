# ADR 0035: Choosing what to build out of twenty-one rows — filtering the catalogue by the categories content already authors

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation, and the distinction
matters.** The owner did not read this document. Asked which of the outstanding
decisions they wanted to take, they answered *"choose yourself"*. So this is a
real approval — but of the *judgement delegated*, not of the text. Anyone who
disagrees with a decision below should treat it as open rather than as settled by
an owner who weighed it.

The delegation here was narrower than it looks. Asked which resolution to take
for #390 the owner answered *"I don't know"*; the approach below was chosen on the
research, and *"choose yourself"* covered it. **What they were told was the
headline figure — one visible row of twenty-one — and that figure is not what this
change fixes.** It fixes the 880px of undifferentiated scroll behind it, cutting
it to 264px, and leaves the visible row count identical to the pixel. §1 is that
correction and it is the claim to read: approving this approves that trade, **not**
a claim that the one-row figure moved.

The sentence this replaced is still true and still the best thing about the
change: nothing here is settled, and
the change that carries it can be reverted by deleting one control: the panel's
arrival state is byte-identical with the filter set to "Everything", which is
where it starts.

This document arrived on the same branch as the change that implements it, which
is the shape [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 warns about: such a
document reaches `main` awaiting approval from the moment it merges and can sit
there unnoticed. That file's rule is that the queue entry lands in the same
commit, and **this author cannot follow it** — `docs/adr/STATUS-QUEUE.md` was
outside this change's remit. So the debt is recorded here instead, and the entry
that owes writing is quoted verbatim in the pull request body, which is the
precedent [0032](./0032-incident-consequences-and-classification-review.md) and
[0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md) set. It
is a worse record than the one the rule asks for, and naming it as worse is the
point.

**§2 reads "empty" on `main` and owes two entries, not one.** #393 emptied it for
the third time by accepting 0031, 0032, 0033 and 0007's amendment; #394 then
landed [0034](./0034-releasing-a-claimed-guard.md), which owes an entry of its
own and quotes it in its own pull request for the same reason this one does. So a
reader of that file today sees an empty queue and two outstanding decisions, and
the two pull-request bodies are the only record. That is the failure §2 names at
its own foot — "two of those four never appeared here at all" — recurring while
the sentence recording it is still the newest thing in the file.

### The number

**0035, and it started as 0034. The collision this document pre-committed to
actually happened.**

The enumeration was run rather than assumed, exactly as
[0029](./0029-concurrent-room-use-claims.md)'s author ran it and
[0031](./0031-build-queue-cancellation-surface.md)'s author could not.
[`README.md`](./README.md) stated 0034 as next free, and that statement is a
claim about *merged* history — the condition under which 0024 through 0027
collided and under which 0031 took 0030 correctly and still had to renumber. So
`mcp__github__list_pull_requests` was called, and it came back with two:

| pull request | ADR files it touches | held a number? |
| --- | --- | --- |
| #393 | 0007, 0033, `README.md`, `STATUS-QUEUE.md` | no — it accepts existing documents and adds none |
| #355 | none | no |

Neither held a number, so 0034 was free, and this document took it and
pre-committed exactly as 0032 did: *if an unmerged branch turns up holding 0034,
this document is the one that renumbers.*

**A branch turned up holding 0034 in the same hour.** #394 — the answer to 0033's
open questions 1 and 3 — allocated
[`0034-releasing-a-claimed-guard.md`](./0034-releasing-a-claimed-guard.md), and it
opened and merged first. So this document renumbered to 0035, exactly as it said
it would, and the pre-commitment is why that cost a `git mv` rather than an
argument about who was first.

**This is the third collision in a week, and the third is a different failure
from the first.** 0024 through 0027 collided because the enumeration was not run.
0031 collided because its author *could not* run it — `gh` was not installed on
that machine — and said so. This one collided with the enumeration run, correct,
and **insufficient**: #394's branch had not opened its pull request when this
author enumerated, and opened it minutes later. Two authors read the same stated
next-free, ran the same check, both got the right answer from it, and still
collided.

So the generalisable claim, which is the only part of this section worth carrying
forward: **an enumeration of open pull requests is a claim about one instant, and
a number is not held until something is pushed.** No cheaper check exists —
enumerating more often narrows the window and does not close it — and the thing
that has actually prevented an argument in all three collisions is the
pre-commitment rather than the check. So this document repeats it at its new
number: **if an unmerged branch turns up holding 0035, this document is the one
that renumbers.**

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every figure below was measured
in Chromium on the assembled page (`/index.html` with the real `src/main.ts`) at
`a44280d` (v0.0.105), or read off disk at that commit, and **re-measured
unchanged at `e44bcb9`** after #393 and #394 landed. Not one figure moved,
including across #394's new Staff-panel Security-tab section — which is expected
rather than lucky: `mountHud` lays out exactly one of the Build and Staff panels,
keyed on the active tab, so a block added to the Staff panel spends none of the
budget this document is about. Every viewport measurement is reproduced by
`tests/browser/app-shell.spec.ts`'s "the catalogue can be filtered to one
category, and the filter costs the panel nothing (#390)".

---

## Context

### The figure that was derived, re-measured

ADR 0031 was accepted with its open question 4 promoted to a blocking condition
(#390), on the strength of a number its own Status flagged as arithmetic rather
than measurement: at 900x600 with a queue, a 44px list box over twenty-one 44px
rows is **one row of twenty-one visible**.

The first thing this change did was re-measure it, because a wrong premise here
would have changed the priority of the whole issue. It is exactly right. On the
assembled page, one prison saved, Build tab, catalogue list box against list
content, at the five viewports the browser suite visits:

| viewport | arrival: box / content | rows fully on screen | queued: box / content | rows fully on screen |
| --- | --- | --- | --- | --- |
| 1280x720 | 110 / 924 | 2 of 21 | 65 / 924 | **1 of 21** |
| 1440x900 | 245 / 924 | 5 of 21 | 200 / 924 | 4 of 21 |
| 1024x768 | 146 / 924 | 3 of 21 | 101 / 924 | 2 of 21 |
| 900x600 | 88 / 924 | 2 of 21 | 44 / 924 | **1 of 21** |
| 375x812 | 155 / 924 | 3 of 21 | 110 / 924 | 2 of 21 |

924px is twenty-one rows of exactly 44px, so the derivation had no slack in it
anywhere. It is also *two* viewports at one row rather than one — 1280x720 shows
one whole row and part of a second — which the derived figure did not say.

### The number that actually hurts, and it is not that one

Stating "one of twenty-one" as the problem misdescribes it, and the
misdescription is what makes the wrong fix look right. Two separate harms hide
in that sentence:

1. **How many rows are on screen at once.** Set by the rail's height, the save
   panel's floor and ADR 0031 decision 3's 45px donation. It is 1 to 5 rows
   depending on viewport and queue.
2. **How far a player scrolls, through undifferentiated rows, to reach the one
   they want.** 836px at 900x600 on arrival; **880px with a queue**, in a 44px
   window, with no order a player can predict beyond `(category rank, id)`.

Harm 1 cannot be fixed by anything short of reopening ADR 0031 decision 3 or 4,
and both are decided: the alternatives it measured are each too small to pay
instead (the placement readout at 20px, the arm hint already clamped, the map
block's gutters already at `--space-1`), a higher catalogue floor makes the panel
overflow its box and puts "Enter coordinates" below the fold, which is issue
#174 for a fourth time, and moving the queue out reverses a trade this
repository has just accepted. **There are no pixels.**

Harm 2 is a different question with a different answer, and it is the one
choosing what to build actually costs. It is also the one that gets worse with
every content row: ADR 0028 phase 4 added seventeen, and nothing stops a later
pass adding more.

### The seam that already exists

`src/content/object-catalog.ts` has authored seven categories since the object
catalogue shipped — `furniture`, `sanitation`, `food-service`, `security`,
`storage`, `utility`, `medical` — and **nothing has ever read one for layout, or
named one on screen.** The category decided which rooms could require an object
and nothing else. So the taxonomy is content that already exists, needs no
authoring, and needs no new mechanism to divide the catalogue by.

**It does not cover the catalogue, and that is checked rather than hoped.** Two
of the twenty-one buildables place no object: `wall-brick`, which is opaque edge
geometry, and `door-wooden`, which registers a door on a tile *edge* rather than
an object addressed by an anchor tile. Neither has an `ObjectCategory` and
neither can be given one without authoring an object nothing places.
`tests/foundation/buildable-category-contract.test.ts` holds the whole
partition, measured off the real registries:

| group | rows |
| --- | --- |
| furniture | 6 |
| utility | 4 |
| food-service | 3 |
| *(no object category)* | **2** — `wall-brick`, `door-wooden` |
| sanitation | 2 |
| medical | 2 |
| security | **1** |
| storage | **1** |

Eight groups, largest six, two singletons, and one of the eight is the taxonomy
failing to reach two rows — one of which is the most-used buildable in the game.

---

## Decision

### 1. Filter, not group: one category at a time, never headers in the list

Inline category headers were the obvious reading of #390's option 2 and they are
**arithmetically worse than doing nothing**. The list holds 924px of rows in a
44px box; eight headers add their own height to that 924px and take none away,
so a grouped list is a longer list behind the same window. Every row stays
reachable only by the same scroll, now with eight more things in it.

A filter removes rows. Measured, same states as the table above, filtered to the
largest group (six rows, plus the selected row — see decision 5 — so seven rows
of 308px):

| viewport | scroll to the last row, unfiltered | filtered | reduction |
| --- | --- | --- | --- |
| 1280x720, arrival | 814px | 198px | 76% |
| 1280x720, queued | 859px | 243px | 72% |
| 1440x900, arrival | 679px | 63px | 91% |
| 1440x900, queued | 724px | 108px | 85% |
| 1024x768, arrival | 778px | 162px | 79% |
| 1024x768, queued | 823px | 207px | 75% |
| 900x600, arrival | 836px | 220px | 74% |
| **900x600, queued** | **880px** | **264px** | **70%** |
| 375x812, arrival | 769px | 153px | 80% |
| 375x812, queued | 814px | 198px | 76% |

And a group at the other end of the distribution disappears from the scroll
entirely: filtered to `storage` (one row, plus the selection, 88px) the list
stops scrolling at all at four of the five viewports — box 88 over content 88 —
and needs 44px of scroll only at 900x600 with a queue.

**What this decision explicitly does not do, stated here so nobody claims it
later: it does not put more rows on screen.** The list box is unchanged to the
pixel in every state — 44px at 900x600 with a queue before and after. A filter
buys reach, not height. The browser test asserts both halves, because a change
that claimed otherwise would be claiming the panel grew, and it did not.

### 2. The two buildables the taxonomy does not reach get a group, not an omission

`wall-brick` and `door-wooden` are collected into one group the composition root
mints, labelled **"Walls and doors"**.

**A group and not an omission**, because the alternative was leaving the wall —
the buildable a player reaches for first and most — behind the unfiltered
twenty-one-row list, which is the exact state this whole change exists to make
navigable.

**Named for its members rather than for a taxonomy.** "Structure" or "Building"
would imply the object catalogue authors such a category, and it does not; a name
that describes the two rows is honest where a name that implies a vocabulary is
not.

**And it is a group with two members today, beside two groups with one.** The
question "is a category with one row worse than no category" is answered no, and
on evidence rather than taste: selecting `security` and getting one row is a true
statement about the content, it is the state those groups will grow out of, and
`buildCategoryOptions` derives the option list from the rows themselves — so a
group with nothing in it never appears at all and a group that arrives with a
future content row appears with nothing edited in the interface.

The same derivation draws **no filter at all** when there is nothing to divide:
an empty catalogue, or one whose rows are all in one group, would give a control
every option of which shows the same list. The real catalogue has eight groups
and only ever gains them, so that is not a state the application reaches —
`tests/browser/ui-harness.ts`'s two-row fixture is, and every height that
harness pins is therefore measured on a panel with no filter in it, which is the
other half of the evidence that this control costs nothing.

### 3. The control lives in the catalogue's header row, so it costs nothing — and this stands *beside* ADR 0031 decision 3 rather than amending it

**This is the decision that made the filter buildable rather than merely
desirable, and it is a measurement rather than a preference.**

ADR 0031 decision 3 owns the panel's arrival-height budget and it has no slack:
7.8px between the last section and the fold at 900x600 on arrival, and with a
queue the catalogue list is down to a single 44px row. A control with a tap
target of its own — anywhere in the panel's body, inside the catalogue section or
outside it — costs 44px, and there are 7.8px. Placing it inside the catalogue
body would take the list's last row; placing it outside would push "Enter
coordinates" below the fold.

So the filter shares the catalogue section's **header** row, which is already
`--tap-target` tall and already summed into every floor `hud.css` derives for
this panel. `createCollapsibleSection` grows a `headerAction` slot for it, and
the slot is a sibling of the header button rather than a child: the header is a
`<button>`, and an interactive control nested in a button is not reachable as
itself.

The cost is therefore zero, and "zero" is asserted rather than argued. Measured
at all five viewports, in both the arrival state and with six queued, unfiltered
and filtered: the catalogue header row is 44px, the panel's own overflow is 0, no
box in the shrink chain is shorter than its own content, the last laid-out
section is inside the panel's fold, and the catalogue list's box is identical to
what it was before this control existed.

**Which is why this document stands beside ADR 0031 rather than amending it.**
An amendment would be a claim that decision 3's budget changed, and it did not:
that decision's 45px donation, its `[data-queued]` one-row floor and its
"arrival height unchanged" bullet are all still true, to the pixel, with this
filter in the panel. What this document does is answer decision 3's *open
question 4* — "is the catalogue the right donor?" — with **yes, and the donation
is survivable now**, rather than by moving the donation somewhere else. If a
future change needs the arrival-height budget itself, that is the amendment, and
it is not this.

### 4. "Everything" is the arrival state, and the filter is opt-in

The panel arrives with every row on screen, in the order it already had. Three
reasons, and the third is the binding one:

- ADR 0031 decision 3's first bullet is a claim about the arrival state, and a
  filter that defaulted to a category would have made this document's own
  measurements incomparable with that one's;
- a default category hides the wall from a player who has not discovered the
  control;
- and it is what keeps the `neverLaidOut` gate in `app-shell.spec.ts`'s #88
  sweep honest. Filtered rows are `hidden`, and a hidden row is a control that
  gate names — correctly. Because "Everything" is both the arrival state and the
  state that sweep visits, the sweep needed **no** setup change, unlike #392's
  control which the sweep could not reach until its setup was extended. The
  filtered state is measured in a test of its own, where hiding rows is the
  subject rather than a side effect.

### 5. The selected row is never hidden, and a filter change scrolls it into view

Filtering is a view operation and **must not change what the next press
places.** The two alternatives were each worse than the rule:

- moving the selection into the active group changes the armed tool as a side
  effect of looking around;
- hiding the selected row leaves the arm button pointed at a buildable whose
  "Selected" badge is nowhere on screen — a control that does not say what it
  will do.

So a row is on screen when its group is active **or** it is the selected one.
The cost is one row from another group appearing among the active ones, and it
is self-explaining: it is the only row wearing the badge. The worst case is the
largest group plus one, which is where decision 1's "seven rows" comes from.

**Kept on screen is not the same as visible, and at the viewport this document is
about they come apart.** With a queue at 900x600 the list is a 44px box: a
selected row anywhere below the first is laid out, hit-tests to itself, and
cannot be seen — which is #220's exact shape. So a filter change scrolls the
list until the selected row is inside it. It scrolls **the list and nothing
else**, by arithmetic on `scrollTop` rather than `scrollIntoView`, because the
panel is itself a scroll container and the browser helper walks every scroll
ancestor — which would move "Enter coordinates" out from under the fold whose
7.8px this panel is measured against.

It fires on a filter change and nowhere else: not at mount, because the arrival
state is measured with nothing scrolled, and not on selection, because a player
who taps a row is already looking at it.

### 6. The active category is view state, and is not persisted

Not on any intent, not in any snapshot, not in `save-schema.ts`, and no schema
version moves. What a player is currently looking at is not a fact about their
prison, and a restored session that came back filtered to `medical` would be a
save file making a claim about attention.

The honest cost: the filter resets to "Everything" on reload, and a player who
works in one category pays one tap per session. Whether that should survive a
reload is a real question — see the open questions — and the answer, if it is
yes, is local per-device preference rather than a member of the save envelope.

### 7. The category is content, its group id is a simulation fact, and neither reaches the HUD as text

Three layers, and the split follows the one `buildableLabelKey` already made:

| what | where | why |
| --- | --- | --- |
| the seven category *names* | `OBJECT_CATEGORY_NAME_KEYS`, `src/content/object-catalog.ts` | a category name is content, beside the schema that declares it — the same side of the boundary `object.bed.name` is on |
| which category a buildable is in | `buildableObjectCategory`, `src/simulation/construction/definition.ts` | the same `placesObjectId` join `validateBuildableObjectReferences` already performs; a second copy at the composition root would be a second place for two vocabularies to drift |
| the "Walls and doors" label, and the group for the two rows with no category | `src/main.ts` | their ids name no content entry, exactly as `BUILDABLE_LABEL_KEY` records for their labels |

`OBJECT_CATEGORY_NAME_KEYS` is a `Record<ObjectCategory, LocalizationKey>` and
not a lookup function, and the type is the whole enforcement: an eighth authored
category fails `pnpm typecheck` rather than resolving to a key nobody wrote. A
convention computed at the call site — `object.category.${category}.name` —
type-checks against any string and would have shipped exactly that.

**Ten locale keys and not seven**, which is worth stating because "seven
categories, seven keys" is the natural expectation: seven category names in the
content namespace, plus the filter's accessible name, the option that filters
nothing, and the group for the two rows the taxonomy does not reach. The last
three are the panel's own vocabulary and name no content.

The HUD is told a `categoryId` it compares and never renders, and a
`categoryLabelKey` it renders and never interprets. It is not told that
`ObjectCategory` exists — it could not be, since two rows have none — which is
`AGENTS.md` boundary 1 and ADR 0011 holding at the same seam they always do.

### 8. A `<select>`, which is the one control in this interface that is not a choice group

`src/ui/primitives/choice-group.ts` argues against a `<select>` in terms, and it
is right about the case it was written for: four one-word options, all visible,
no tap hiding a choice. This control has one option per group the content
carries — nine today — and has to fit inside a 44px row beside an eyebrow in a
264px rail. A row of nine chips wraps to three lines there, which is precisely
the height decision 3 exists not to spend.

So: one native control, one 44px tap target, keyboard- and touch-reachable, at
118x44 as measured. It shows its own current value as its visible text, which is
what makes an `aria-label` legitimate here rather than a tooltip-only label. It
is deliberately **not** promoted to a primitive: one control that needs the other
trade is not yet a pattern.

### 9. The unfiltered list is regrouped so a group's rows are contiguous

`buildCatalogue`'s existing `(category rank, id)` sort is followed by a **stable
regroup**: groups in the order their first member already had, members keeping
their order inside a group.

A stable regroup and not a third sort key, and the difference is load-bearing: a
`(group, rank, id)` comparator puts `door-wooden` before `wall-brick` on
`door` < `wall`, which silently changes what the panel arrives armed to place and
which row several browser assertions press by position. The regroup leaves
`wall-brick` first.

Why regroup at all, when the filter hides rows rather than reordering them: the
unfiltered list is the arrival state and stays twenty-one rows long, so this is
what makes those rows read in the same sequence as the filter's own options —
one order in the panel instead of two — and it is the only improvement available
to a list that has to stay complete.

---

## Alternatives considered

- **Inline category headers, keeping every row.** Rejected on arithmetic, in
  decision 1: eight headers make a 924px list longer, in the same 44px box.
- **Give the catalogue a floor that stops it being the donor** (#390 option 1,
  and the cheaper of the two the issue named). Rejected because the pixels do
  not exist: the panel's body floor sums the blocks, so a higher catalogue floor
  raises that sum, the panel overflows its box, and the last section leaves the
  fold — issue #174, three times shipped and measured a fourth time here at
  195/60/159/200/135px of body shortfall in the state that presses hardest.
  "Own its overflow" is what the list already does; the question was never
  whether it scrolls but how far.
- **A different donor** (#390 option 3). ADR 0031 measured all three and each is
  too small. Re-opening it needs something that ADR did not consider, and nothing
  here is.
- **Move the queue out of the Build panel** (#390 option 4). Reverses ADR 0031
  decision 3's trade rather than paying it, and that ADR's argument — the queue
  must be where the player aims — does not weaken with row count.
- **Filter by material instead of by category.** Two priced materials, so two
  groups of roughly ten: it halves the haystack where the category filter cuts it
  to a sixth, and "show me the brick things" is not a question a player building
  a canteen asks. It also encodes a placeholder — every quantity and price in the
  registry is reserved to #29 — into a navigation surface.
- **A search field.** Strictly better at reach for a player who knows the name of
  the thing they want, strictly worse for one who does not, which is the player
  a catalogue is for. It also needs a text input, which is a tap target the
  header row can hold only by giving up the eyebrow, and it puts a keyboard in
  the way of a touch interaction. Worth revisiting when the registry is large
  enough that a category holds twenty rows.
- **Persisting the active category in the save envelope.** Rejected in decision
  6: it is attention, not state.
- **Accepting the price and closing #390 as "measured, not worth fixing".** A
  real option, and it is what the derived figure being *wrong* would have
  justified. It is not: the figure was right to the pixel, and 880px of
  undifferentiated scroll in a 44px window is not a way to perform the game's
  primary verb.

---

## Consequences

- **The visible-row count is unchanged, at every viewport, in both states.** This
  document does not close the half of #390 that reads "shows one buildable of
  twenty-one" literally, and says so rather than implying otherwise. What it
  closes is the reachability of the other twenty.
- **#379 is not answered, and the measurement says so rather than the argument.**
  That issue asks which box yields when an opened fold makes the blocks exceed
  the rail. The body's shortfall with the numeric fallback expanded is
  195/60/159/200/135px at the five viewports **before** this change and
  195/60/159/200/135px after — and it is identical with the filter set to a
  one-row group, which is the state that shortens the catalogue's content most.
  The reason is structural: in every opened state the catalogue is already
  pressed onto its floor, and a floor does not care what its content height is.
  So #379 stays open, and the two issues do not share an answer. Anything that
  answers it is a change to where the body's floor comes from, which is
  ADR 0031 decision 3's territory and would be the amendment this document
  deliberately is not.
- **A content row now has a layout review attached**, which is the durable half
  of this change. `tests/foundation/buildable-category-contract.test.ts` holds
  every buildable and its group as a written-out table, so a twenty-second row
  fails a test that names it rather than silently making one group larger. The
  browser test bounds the largest filtered group at seven rows.
- **`createCollapsibleSection` has a `headerAction` slot**, and any section that
  passes one has its header button wrapped in `.ui-section__header-row`. A
  selector written as `.ui-section > .ui-section__header` stops matching for
  such a section; only the Build panel's catalogue passes one today, and
  `hud.css`'s one such selector is updated.
- **`tests/browser/ui-harness.ts`'s two Build fixtures gain a group each**, both
  the structural one, so the harness measures a panel with the filter present and
  costing what it costs without the measurement also depending on how the content
  catalogue divides. Every height that harness pins is unchanged.
- **No save-schema change and no projection change.** The catalogue is content
  supplied once at mount, the filter is view state, and nothing crosses the
  worker boundary that did not cross it before.

## Open questions

1. **Should the active category survive a reload?** Decision 6 says it is not
   save state and that is settled; whether it is *local device* state is not. The
   cost of leaving it is one tap per session, and the cost of adding it is a
   second thing `localStorage` holds about a session that IndexedDB holds the
   rest of.
2. **Should the filter remember a group per armed tool, or per session?** A
   player laying out a canteen alternates between `furniture` and `food-service`
   and pays a tap each way. A most-recently-used ordering of the options would
   halve that and would make the option list's order depend on history, which
   `docs/DETERMINISM.md` argues against for a list a player reads.
3. **Is "Walls and doors" the right group, or are they two groups of one?** They
   are together because they are the two rows with no authored category, which is
   a fact about the *taxonomy* rather than about walls and doors. If the object
   catalogue ever authors a structural category, this group should become it.
4. **Does the singleton case want a different treatment?** `security` and
   `storage` hold one row each, so selecting them replaces a scroll with a
   near-empty list. Nothing about that is wrong today, and it is the state those
   groups grow out of; if a group stays at one row through a content pass, the
   question is whether the *category* is right rather than whether the filter is.
5. **Does the catalogue want the filter at all once a room's requirements can
   drive it?** The most useful filter is probably not a category but "what the
   room I am standing in still needs", which `RoomCapacityResolver` already
   computes and the Rooms panel already renders. That is a different surface with
   a different owner, and it would sit beside this one rather than replace it.
