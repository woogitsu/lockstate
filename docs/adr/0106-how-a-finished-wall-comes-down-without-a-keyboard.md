# ADR 0106: How a finished wall comes down without a keyboard

> **The number was assigned from `docs/adr/README.md`'s own "Next free number"
> line, and this document pre-commits to renumbering.** `AGENTS.md`'s rule is
> that a number is not reserved until it appears in that index, and a branch
> nobody has merged is invisible from it — so if another branch turns up
> holding 0106, this file, its row and every citation of it get renumbered
> without argument, exactly as 0031, 0034, 0035, 0037, 0048, 0049, 0074, 0075,
> 0076, 0083, 0096, 0097, 0098, 0099, 0100, 0101, 0102, 0103, 0104 and 0105
> each pre-committed.
>
> **The number was taken from the index's own line rather than re-swept**,
> because `docs/adr/README.md`'s line 264 already records a sweep taken the
> same day this document was written — 2026-09-10, a 269-head remote sweep
> from `origin/main` at `5d5df28a` — that found no head holding a 0106
> document and no head's own next-free line past 0105. This document's own
> presence is what moves it to 0107 once it lands, on that same file's stated
> rule.

## Status

**Accepted by the owner on 2026-09-10 — option 1, the sibling command beside
`RemoveObject`, which is this document's own recommendation taken whole.**
Options 2 and 3 declined; nothing in the option list was modified in the
taking.

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP.** The ruling is the label of a clickable option this session wrote and
> the owner chose — *"Opcja 1 — osobna komenda (rekomendacja)"* — not a
> sentence they typed, and it was given against a summary of the three shapes
> and the two measurements that re-priced option 1 (exactly one producer of
> `CancelBuildOrder` in the whole application; `pickEdgeAtWorld` pure and
> already imported by `WorldScene`), rather than against this document's full
> text.
>
> **The falsifier this document names was put to them before they chose**, and
> it stands unchanged by the acceptance: a tile bordering both a placed object
> and a completed wall produces an ambiguous resolution. If an implementer
> finds it needs an affordance beyond "press the thing", option 1's cost moves
> toward option 2's and **this recommendation needs re-arguing rather than
> continuing**.
>
> **What the acceptance does not authorise: a player-visible sentence.** The
> two this design will need are named as owed rather than authored, and the
> 2026-09-04 release of `AGENTS.md`'s fourth reservation gives us the wording
> and not the promise — a sentence still ships only once the code that makes
> it true exists.
>
> **The `Proposed` record is kept below rather than overwritten.**

**Proposed. Not self-approved.** `docs/AGENT_WORKFLOW.md` §3: *"**Propose an
ADR rather than deciding architecture inside implementation code, and never
self-approve one** outside a recorded delegation from the owner."*

Filed against [issue #928](https://github.com/woogitsu/lockstate/issues/928),
whose §5 states this in terms: *"None of them is one of `AGENTS.md`'s four
exclusions, so under the standing mandate this is ours to decide after
research rather than to ask about — but it is a design decision that should be
recorded."* The issue's own author filed rather than chose it "because the
playtest that found it deliberately did not touch `src/`." This document is
that research and that choice; the acceptance line below is left for the
owner because `docs/AGENT_WORKFLOW.md` §3 forbids an implementing agent from
giving it to itself, not because the decision was genuinely open after the
research.

**No production code is written by this document.** Per the issue's own hard
boundary: an ADR is owed if the recommendation lands on giving `Remove` a
demolition surface or on a separate list, because either extends [ADR
0028](./0028-object-placement-and-derived-room-capacity.md) phase 3's surface
rather than implementing inside it. It does.

**No player-visible sentence is authored, edited or added by this document.**
Two sentences a full implementation would need — a wall-removal success
notice and a refusal for a press that lands on nothing — are ours to word
under `AGENTS.md`'s 2026-09-04 release of reservation 4, but their *truth*
still has to be established against code that does not exist yet, so they are
named as owed rather than written here.

## Claim tiers used below

- **VERIFIED** — read out of the code on disk at `10cf59dc` (v0.0.568), the
  commit this worktree is based on, with every citation opened.
- **ASSERTED** — believed and not established, marked every time.

## Context

### 1. What happens today, re-verified rather than taken from the issue

Every line number below has moved since the issue and its comment were filed
(#932 and eight same-day merges moved them, exactly as the brief warned), so
each was re-found by its text on this tree rather than trusted from either.

- **The queue withholds the row.** `PENDING_BUILD_ORDER_STATES` is a tuple of
  five states, `'completed'` deliberately excluded
  (`src/simulation/presentation/construction-projection.ts:87-93`). The
  docblock immediately above it, `:75-86`, is the hand-off this issue is
  about, quoted in full because both halves matter equally:

  > `'completed'` is the one that is worth arguing: a completed order is still
  > cancellable (`ConstructionSystem.cancelOrder` accepts it, and reverses the
  > geometry it wrote), and it is nonetheless not queued -- the wall is
  > standing. A queue that listed standing walls would be a demolition list
  > wearing a queue's label, and taking a finished wall down is the Remove
  > gesture's job (ADR 0028 phase 3) rather than this one's.

- **`Remove` does not claim the job the docblock hands it, and says so.** The
  control's own locale string, `hud.build.remove-hint`
  (`src/content/default-locale-en.ts:2429`; the anchor read `:2424`, then `:1739`, which was
  a *mention* of the key inside another string's docblock rather than the
  declaration, and was re-aimed onto the declaration itself on 2026-09-19 after
  #1292 grew this file, then `:2318` -- the same declaration, before the two
  alert keys above it in the file grew plural forms on 2026-09-21 and pushed it
  down -- then `:2362`, before #1356's three Undo/Redo keys and their docblock
  were added above it on 2026-09-22, then `:2393`, before #935's reworded
  zone refusal and its docblock were added above it on 2026-09-23), read in
  full when this was written:

  > Press any tile of an object to take it away. One still being built is
  > cancelled and refunds its money — but nothing comes back once the crew has
  > started it. A finished one is not refunded.

  > **AND IT NO LONGER READS THAT WAY, WHICH IS FOUND HERE RATHER THAN FIXED
  > HERE.** Opened at `src/content/default-locale-en.ts:2362` (now `:2429`) on 2026-09-19
  > while re-aiming the anchor above, the string begins *"Press any tile of an
  > object, **or a finished wall**, to take it away"* — the rest is word for
  > word what is quoted. So the sentence under the quotation, *"Every clause is
  > about an object"*, is false of the shipped string and was true of the one
  > this bullet read. **Which of the two this ADR's decision wants is this
  > document's own question and is not answered by a passing branch**; it is
  > recorded because a quotation nobody re-reads is exactly the failure this
  > repository keeps finding. The string is unchanged on this branch and on
  > `main` alike — #1292 did not author it and does not touch it.

  Every clause is about an *object*. `src/main.ts`'s arm-object-tool branch
  says the same thing in code rather than copy, at the removing arm
  (`:2377-2393`): *"There is no wall removal behind this and the control does
  not claim one … Taking a wall down is `Undo` for a finished one, and — since
  the Build panel's queue block — a press on its row for one that is still
  queued."*
- **The resolver a `Remove` press reaches is tile-and-object-shaped by
  construction, not by oversight.** `ObjectPlacementService.remove` (class at
  `src/simulation/objects/object-placement-service.ts:455`, method at `:646`)
  tries exactly two things at the pressed tile, in order: a placed object
  (`this.placedObjects.objectAt(tile)`, `:649`) and a still-building object
  order (`this.orderBuildingObjectAt(tile)`, `:716`, which matches only orders
  whose buildable `placesObjectId !== undefined`). Neither branch can ever
  match a wall: a wall's buildable has no `placesObjectId`, and a completed
  wall leaves no row in `placedObjects` at all — its only record is the edge
  value `ConstructionSystem` wrote and the `'completed'` order that wrote it.
  Falling through both arms returns `{ kind: 'refused', reason:
  'nothing-to-remove' }` (`RemoveObjectRefusalReason`, `:207`), which
  `src/simulation/runtime/session-commands.ts:793` turns into the sentence
  the issue quotes.

### 2. The positive control, re-opened from the issue's own comment

The comment on the issue (2026-09-04) recorded the other arm of the same
standing run: disarm `Remove`, press `Z` once. `ConstructionSystem.cancelOrder`
(`src/simulation/construction/system.ts:941-990`) is unconditional on state
beyond `isCancellable`, and for a `'completed'` order it sets `hadGeometry =
true` (`:949`) and calls `this.revertConstruction(order)` (`:951`), which
rewrites the edge the order wrote — falling to whatever *other* completed
order still claims it, or to zero
(`revertConstruction`, `:1827-1854`; `otherCompletedClaimants`, `:1866-1874`;
`remainingEdgeValue`, `:1883-1890`; `writeEdge`, `:1892-1895`). So the
simulation-side reversal for a completed wall is not a gap this document
proposes filling — **it already exists, is already correct, and is already
exercised** by every `Undo` press on a finished wall and by the queue's own
per-row cancel control for an order that has not yet completed.

The comment's own re-drag control also matters here: a standing wall's
`duplicateClaim` (`system.ts:608-621`) refuses a second order on the same
definition, location and edge while a `'completed'` one still claims it
(`:614`, the `isObjectBuildable` exemption does not apply to a wall). So a
route that does not call `cancelOrder` — one that merely hid the wall, say —
would leave `duplicateClaim` refusing a re-drag over nothing standing, which
is the cheap falsifier any implementation of this document owes.

### 3. There is exactly one producer of `CancelBuildOrder`, re-swept

```
$ grep -rn "CancelBuildOrder" src/ --include='*.ts' | grep -v "^src/simulation/"
src/ui/hud/build-panel.ts:167, :1189(*), :2103        … comments
src/ui/hud/view-model.ts:734, :768                     … comments
src/ui/hud/projection.ts, messages.ts, hud.ts          … comments and refusal keys
src/ui/simulation-*.ts (4 files)                       … comments
src/content/default-locale-en.ts                        … comments
src/main.ts:2495                                        … comment
src/main.ts:2498: requireSimulation(commands).submit({ type: 'CancelBuildOrder', orderId: intent.orderId });
```

Same finding the comment already closed, re-run on this tree: **one
producer**, `src/main.ts:2498`, under `case 'cancel-build-order':` at `:2497`,
fed by the queue row's intent. `CancelBuildOrder`'s own decode
(`src/simulation/protocol/commands.ts`) carries only `orderId` on the wire —
no location, no edge — and its handler
(`src/simulation/construction/handler.ts:133-160`) reads the order by that id,
tries `cancelOrder`, and swallows a `not found` or `not cancellable` silently
by design (`:148-151`, "cancellation is intentionally idempotent at the
command boundary"). **A completed wall's order id reaches no surface a player
can press**: the queue withholds the row (§1), and nothing else in `src/`
names it. This is the reachability gap, restated precisely: the reversal
mechanism has no id-carrying pointer route to a finished wall, only a
keyboard one that reaches the whole undo stack rather than one wall.

### 4. Why `RemoveObject` cannot be widened cheaply, and why that reframes the cost rather than removing it

`RemoveObject`'s own routing comment
(`src/simulation/runtime/session-commands.ts:71-74`) states its scope
narrowly: *"the same service's other half: a placement and a removal are one
gesture with a mode … routed side by side (ADR 0028 phase 3)."*
`ObjectPlacementService` owns a *registry of placed objects*; it does not own
edges, and does not import anything that does beyond the one `cancelOrder`
port it already calls for an in-flight object order (`object-placement-
service.ts:725`). Teaching it to also recognise a completed wall edge would
mean either reaching into `ConstructionSystem`'s edge model from a service
whose whole contract is about objects, or duplicating that model — both
weaken a boundary the routing comment states on purpose. **This confirms half
of the issue comment's §2 and narrows the other half.** The half that holds:
`RemoveObject`/`ObjectPlacementService` is the wrong home for wall geometry.
The half this document narrows: the comment characterised the cost as
*"teaching a tile-object lookup about edge values"*, which is the cost of
widening `ObjectPlacementService.remove` specifically. A **sibling** command
that reaches `ConstructionSystem` directly pays a different and smaller bill,
priced in §5.

### 5. The geometry a sibling command would need already exists and is already imported where it is needed

A wall lives on a tile *edge*, not a tile, and picking one from a raw pointer
position is already solved: `src/rendering/build/edge-picking.ts` exports
`pickEdgeAtWorld` as *"pure geometry: no Phaser, no DOM, no simulation"*
(`:1-20`), and `src/rendering/scene/world-scene.ts` already imports and calls
it for the build tool's own wall-drawing press (`:23-24` import, `:1021` call,
`:1339` a second call for the hover readout). The object tool's press path,
by contrast, rounds straight to a tile (`world-scene.ts:1189`,
`this.objectTool?.place({ tileX, tileY })`) because an object occupies a
whole tile and has never needed an edge.

**So the one piece of machinery a wall-aware `Remove` gesture needs — turning
a screen press into a candidate edge — is not new geometry to write.** It is
already in the file that would need it, already proven correct by the build
tool's own placement gesture, and reused rather than authored. What is new is
wiring: `WorldScene` would need to compute `pickEdgeAtWorld` on a
removal-armed press (today it does not, because the object tool's arbitration
never asks for it — `:938`, `:952`, `:974-976`), pass the resolved edge down
past the tile lookup, and a new protocol command carrying `{ x, y, edge }`
(mirroring `RemoveObject`'s `{ x, y }`, `commands.ts:431-434`) would need its
own resolver on `ConstructionSystem` — "the completed order, if any, claiming
this edge" is a public-facing cousin of the already-private
`otherCompletedClaimants` (`system.ts:1866`) rather than a new algorithm.
Cancelling it is `cancelOrder`, unchanged (§2).

**What stays out of scope, deliberately.** An in-flight wall order already
has a pointer route — the queue's per-row cancel, since
`PENDING_BUILD_ORDER_STATES` includes every state before `'completed'`
(§1) — so a `Remove` press landing on a not-yet-finished wall's edge is not
this gap and this document does not propose extending the gesture to it. That
keeps the new surface to exactly the hole boundary 10 describes: a
**completed** wall.

## The three shapes, priced against the above

### Option 1 — a demolition gesture: a sibling command beside `RemoveObject`

**What it costs**, now that §5 has re-priced it: a new protocol command and
its schema entry; a resolver on `ConstructionSystem` exposing which completed
order (if any) claims a given tile edge; a session-command branch that calls
`cancelOrder` on it or records a refusal; `WorldScene` computing
`pickEdgeAtWorld` on a removal press and trying the object lookup first,
falling to the edge lookup only when the tile holds no object and no
in-flight object order; two player-visible sentences (a success and a
refusal), authored and proven true against the code that ships with them,
per reservation 4; and the reachability gate §6 below describes. It does
**not** touch `revertConstruction`, `writeEdge`, `otherCompletedClaimants`, or
`cancelOrder` itself — every one of those already does the right thing for a
completed order, proven by §2's positive control.

**What it buys.** It makes the projection docblock's own hand-off true rather
than aspirational: taking a finished wall down really does become "the Remove
gesture's job." It keeps one mental model for "undo something I built with my
finger": press the thing, whether it is a bed or a wall. And it is symmetric
with the control's own existing precedent — `ObjectTool.setArmed` already
arms "on the mode alone" with "no footprint … what goes is whatever the
player pressed on" (`build-panel.ts:1276-1282`) — a wall press needs no new
UI affordance, only a new thing that gesture can land on.

**Open questions this document leaves to whoever implements it**, because
they are mechanical rather than architectural:

1. The command's exact name and schema shape (this document has been calling
   it `RemoveWall` as a working name, parallel to `RemoveObject`; nothing
   depends on that name).
2. Which order to cancel when more than one completed order claims the same
   edge (`otherCompletedClaimants` shows this is a real, already-handled
   case for the *value* an edge carries; the new resolver needs a rule for
   *which id* a Remove press cancels — the natural candidate is the
   highest-id / most-recently-completed claimant, but that is an
   implementation choice with no product stake in it).
3. Whether the new resolver lives on `ConstructionSystem` directly or behind
   a narrow port, mirroring how `ObjectPlacementService` holds `orders:
   ConstructionSystem`-shaped access rather than the system itself.

### Option 2 — a separate list of standing walls

The docblock's objection is narrowly about a *queue* listing standing walls,
not about the game having a demolition surface at all (issue §5), so this
avoids that specific label problem. **It does not avoid the deeper one.** A
list is only useful if pressing a row does something locatable — a wall has
no name a player recognises the way a "guard" or a "purchase" does, so a row
would have to carry a location, and pressing it would still need to resolve
to "the wall standing there" the same way option 1's sibling command does.
Either the list duplicates option 1's tile/edge resolution behind a second
UI surface for no product gain, or it offers a location-blind list (an id, a
tally) that a player cannot connect to what they are looking at on the map —
which is worse for the touch player boundary 10 exists for, not better: a
second panel to open, read and match against the world, instead of pressing
the wall in front of them. It is also the surface the docblock's own
sentence argues against by naming `Remove` as the right owner, so taking
option 2 would mean rejecting that document's stated reasoning rather than
completing it. **Not recommended.**

### Option 3 — let the queue keep completed rows for a bounded window

This is the cheapest of the three and the brief is explicit that it is
available only if it earns "a real answer to the docblock's objection …
rather than a bypass." It does not.

The objection is about *identity*: "a queue that listed standing walls would
be a demolition list wearing a queue's label." A bounded window does not
change what the row lists or what pressing it does — for as long as the
window is open, the queue **is** exactly what the docblock says it must not
be: a demolition list, wearing a queue's label, for every wall inside the
window. Boundedness changes only how long that is true, not whether it is.
Two arguments were tried against this and both fail:

- *"It is temporary, so it does not really count as a demolition list."* The
  docblock's complaint is not about permanence, it is about what the row
  *is* while it is there — a control that cancels a finished thing rather
  than a thing still being built. A temporary demolition list is still a
  demolition list for its duration.
- *"A bounded window is better than nothing."* It reintroduces the exact
  failure this issue is about, only delayed: a touch player who does not act
  within the window loses the pointer route again, and a wall built and
  forgotten about is once more permanent except by `KeyZ`. That is not a
  smaller version of the bug; it is the same bug with a grace period, and it
  is worse than option 1 for the same implementation reason §5 gives — the
  per-row control already calls `CancelBuildOrder` unchanged, so option 3
  buys no engineering saving over option 1's sibling command, only a
  narrower and time-limited fix.

Per the brief's own framing, an option whose objection cannot be answered
without a bypass is not available. **Ruled out.**

## Decision (recommended, not accepted)

**Recommend option 1**: a sibling command beside `RemoveObject`, reached by
teaching the `Remove` gesture's world press to also try `pickEdgeAtWorld`
(already written, already imported by `WorldScene` for the build tool) when
no object claims the pressed tile, and to cancel the completed order that
edge resolves to through the existing, already-correct `cancelOrder` /
`revertConstruction` path. Option 2 is not recommended because it either
duplicates option 1's resolution behind a worse surface for a touch player or
offers a location-blind list that boundary 10 is not satisfied by; option 3
is ruled out because its cheapness is bought by reinstating, on a delay, the
exact defect this issue reports, and the docblock's objection to it survives
unanswered.

## The test gap (issue §6), stated rather than written

`docs/AGENT_WORKFLOW.md` §3 and the issue's own §6 agree: no test in this
repository gates the *reachability* of a finished wall's removal today, and
none should be written for a route that does not exist. What the gate should
assert, once option 1 lands:

> Every construction that `ConstructionSystem.cancelOrder` accepts in its
> `'completed'` state — which today means every wall and every door,
> anything whose buildable writes an edge — has a pointer route to reversing
> it that never presses a key. Concretely: build a wall to completion,
> arm `Remove`, press the wall (not a queue row, not `KeyZ`), and assert the
> edge value the wall wrote is gone and the treasury reflects
> `destroysSpendOnCancel`'s existing no-refund rule for a completed order
> (`system.ts:958-981`) — the same figure `Undo` already produces for the
> same wall today.

`tests/browser/ui-shell.spec.ts`'s *"the removal control carries the armed
tint while the mode is on (#689)"* (`:2264`) and
`tests/browser/app-shell.spec.ts`'s *"every control can actually be pressed …
(#88)"* (`:3183`) are the two existing gates nearest this hole; neither asks
whether a completed wall is one of the things `Remove` can reach, which is
exactly the gap. **Whoever implements option 1 owes deleting the new route
and watching this assertion go red**, per `docs/AGENT_WORKFLOW.md` §3's rule
that a test proves nothing until mutated code has been watched failing it.

## Weakest claim

**That a sibling command is cheaper than widening `RemoveObject`, and cheaper
still than option 2, is argued from reading every path involved rather than
from having built two of the three and measured them.** `pickEdgeAtWorld`
being already imported by `WorldScene` is VERIFIED and is the strongest single
fact behind the recommendation, but the wiring above it — arbitrating between
an object hit and an edge hit on the same press, and deciding which of
several completed claimants on one edge a press means — is priced by reading,
not by writing the code and counting the lines it took. **What would change
this document's mind**: an implementer finding that a tile bordering both a
placed object and a completed wall (a bed against the cell's own wall,
pressed near the shared boundary) produces an ambiguous or surprising
resolution that needs UI affordance beyond "press the thing" to resolve —
that would move option 1's cost toward option 2's and this recommendation
would need re-arguing rather than merely re-priced.
