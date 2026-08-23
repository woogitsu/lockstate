# ADR 0019: What "owned" means for a tile under overlapping parcels

## Status

**Proposed — pending human approval.** Not accepted.

Two things are bundled in the change this ADR describes, and only one of them
needs a decision.

Removing the renderer's private copy of the ownership rule does not: it is a
straight `AGENTS.md` boundary-1 defect fix, and no reviewer needs to weigh it.
But the two copies did not agree in every case, so unifying them requires
choosing *which* answer survives — and the answer chosen here is not the one
`SparseWorld` gave.

A reviewer is being asked to sign off on one thing: **an owned parcel makes the
tiles inside it owned, and an unowned parcel overlapping the same tiles does
not take that away.**

If that goes the other way, §1 still stands: the rule keeps one implementation,
on the simulation side. `isTileOwnedBy` would then have to take every parcel
with its ownership rather than only the owned bounds, `WorldRenderView` would
have to be given the unowned parcels too, and `docs/WORLD.md`'s ownership
sentence would be rewritten — issue #120 records the replacement wording.

Until this ADR is accepted, `docs/WORLD.md` marks the disjunction as pending
rather than settled.

## Context

`registerParcel` rejects a duplicate id and nothing else. Overlapping bounds
are permitted, and `getParcelAtTile`'s doc comment says so deliberately. So a
tile can sit under more than one parcel, and "is this tile owned?" needs a rule
for that case.

The repository had two, in two places, and they did not always agree.

### The simulation's rule

`SparseWorld.isTileOwned` asked `getParcelAtTile` for the *first* parcel
containing the tile in ascending-id order, and returned true only if **that
one** was owned; otherwise it fell through to chunk ownership. A tile under an
unowned `a-marsh` and an owned `z-estate` was therefore **not owned**, so
`canBuildAt` would have answered `unowned_land` for it.

### The renderer's rule

`WorldRenderView.isTileOwned` returned true if **any** owned parcel contained
the tile. It could not have implemented the other rule even if it wanted to:
`fromSnapshot` filters the snapshot's parcels down to the owned ones while
building the view, so the renderer never learns that a lower-id unowned parcel
covers the tile at all.

### Why the disagreement matters

Not because a player has seen it. Nothing in `src/` registers a parcel and
nothing in `src/` calls `canBuildAt`, so the two answers have never been
compared in a running game — see *Reachability* below.

It matters because one game rule had two implementations, and one of them lived
in the renderer. `AGENTS.md` boundary 1 says rendering is not simulation and
that Phaser must never become the source of truth for game state; a renderer
that decides an ownership question from logic of its own is that, whether or
not it happens to agree. Here it did not agree, which is the demonstration
rather than the harm: `WorldRenderView.isTileOwned` feeds `TileSample.owned` in
`readTile`, and `tile-layer.ts` draws both the unowned shading and the
owned-land outline from it, while `SparseWorld.isTileOwned` is what `canBuildAt`
consults. One question, asked on either side of the same player-facing
decision, answered by two bodies of code that had drifted apart with no test
able to notice.

The drift was narrow, which is part of why nothing noticed. The two agreed on
every tile in an owned chunk, on every tile covered by a single parcel, and on
every overlapping tile whose lowest-id covering parcel was owned. They differed
in exactly one case: a tile whose lowest-id covering parcel was unowned while a
higher-id parcel covering it was owned.

### What is *not* the reason to pick one over the other

The determinism argument in `getParcelAtTile`'s doc comment — pinned by
`tests/determinism/iteration-order.test.ts` — is about **stability across a
snapshot round trip**, not about which answer is meaningful. `snapshot()` and
`fromSnapshot` emit and re-register parcels sorted by id rather than in
insertion order, so a rule that picks *one* parcel needs a canonical sort to
answer the same way before and after a save. That constrains *how* a
first-match rule must be implemented. It says nothing about whether
first-match is the right rule, and it must not be allowed to decide the
question by itself.

### Reachability: this is latent, not live

Nothing in `src/` registers a parcel. The only `registerParcel` call site in
production code is inside `SparseWorld.fromSnapshot`, re-registering what a
save already contained; `createNewSimulationRuntime` creates a world with one
owned chunk and no parcels, and there is no content or scenario module that
defines any. `canBuildAt` has no caller in `src/` either. Every other call site
of both is a test.

So no player can reach the divergence today. Overlapping parcels exist only in
tests. Before this change there was one such file,
`tests/determinism/iteration-order.test.ts`, where all four parcels share
identical bounds and the only one it ever owns is the lowest-id one — exactly
the case where the two rules agree, which is why it never exposed the split.
This change adds two more overlapping-parcel worlds, in
`tests/unit/sparse-world.test.ts` and `tests/unit/rendering-world-view.test.ts`,
and those do build the case where the two rules differed.

That is why this is a defect to fix rather than an incident, and it is also
why the choice can be made cleanly: no save, no scenario and no player
expectation depends on the current answer.

## Decision

### 1. One rule, in the simulation, called by both sides

`isTileOwnedBy` (`src/simulation/world/tile-ownership.ts`) is the only
definition of tile ownership. `SparseWorld.isTileOwned` and
`WorldRenderView.isTileOwned` both call it.

It lives on the simulation side because `AGENTS.md` boundary 1 says rendering
is not simulation. A renderer that answers an ownership question from its own
logic is a second source of truth for game state whether or not it currently
agrees, so the fix is not "make the renderer's copy more faithful" — it is
"the renderer has no copy".

The alternative shape — leaving both implementations and testing them against
each other — was rejected: a test can catch a drift that already happened, and
this one did not, because no test built the world that exposes it.

### 2. The rule is: any owned parcel, or an owned chunk

> A tile is owned when at least one owned parcel contains it, or when the chunk
> holding it is owned outright.

Parcels do not veto each other. An unowned parcel overlapping an owned one is
irrelevant to the answer.

This changes `SparseWorld.isTileOwned` for overlapping parcels, and that is
what needs approval. Three things argue for it over the first-match rule:

- **It is the rule already written down.** `docs/WORLD.md` ("Parcels and land
  ownership") says ownership "returns true if the tile falls within any owned
  parcel or directly owned chunk". The renderer implemented that sentence; the
  simulation did not. It is the only prose statement of the rule in the
  repository: [ADR-0004](./0004-chunk-size-selection.md) §2.3 says `isTileOwned`
  queries "parcel ownership or direct chunk ownership without assuming 1:1
  chunk alignment", which is about parcels not being chunk-aligned and says
  nothing about overlap. And that sentence is itself the subject of issue #120,
  which observes that the documentation had silently taken the renderer's side.
  So this says the disjunction is the *documented* rule — not that it has been
  ratified.
- **The first-match rule was not coherent as a rule.** It did not treat the
  lowest-id parcel as authoritative — when that parcel was unowned it did not
  answer "unowned", it *ignored parcels entirely* and fell through to chunk
  ownership. So an unowned parcel could mask an owned parcel but not an owned
  chunk. There is no ownership semantics under which that is the intended
  answer; it is what reusing a "which parcel is here" lookup as an ownership
  test happens to compute.
- **It is what a player would expect.** Land you bought is yours. Under
  first-match, a tile inside a parcel you paid for can be unbuildable because
  some *other*, unbought rectangle with an alphabetically earlier id overlaps
  it — an id ordering the player cannot see and did not choose.

### 3. `getParcelAtTile` keeps its rule, and keeps its sort

`getParcelAtTile` still answers "which parcel is here" as the first match in
ascending-id order, and still needs the canonical sort for the round-trip
reason above. It remains the right primitive for pricing, selection and any UI
that must name a single parcel. It is no longer the ownership test.

Ownership needs no sort at all now, which is a strictly stronger determinism
property than the old rule had: disjunction over a set gives the same answer
in any iteration order, so the answer cannot depend on registration order,
insertion order, or a snapshot round trip even in principle.

### 4. Overlapping bounds stay legal

Rejecting overlaps in `registerParcel` would make the question disappear, and
it is rejected for three reasons: it would make `fromSnapshot` refuse
previously-valid saves (boundary 7 — a persistence break with no migration),
it would delete a capability `getParcelAtTile` documents as deliberate, and it
would invalidate `tests/determinism/iteration-order.test.ts`, whose whole
subject is overlapping parcels. Composite and overlapping ownership regions
are also plausible future content (a leasehold inside an estate, a right of
way), and nothing yet says they should be impossible.

## Alternatives considered

- **Make the renderer follow "first parcel by id".** Rejected. It preserves
  current simulation behaviour, which is the one virtue it has, but it keeps a
  second implementation of a game rule inside the renderer, against boundary
  1; it requires shipping *all* parcels to the view rather than the owned ones,
  and makes `readTile`'s per-tile lookup scan every parcel in the world rather
  than only the owned ones; and it makes the incoherent rule of §2 permanent
  and load-bearing.
- **Keep both implementations, add a cross-checking test.** Rejected as the
  fix, per §1. The regression test in
  `tests/unit/rendering-world-view.test.ts` is worth having and has been
  added, but as a guard on one shared rule, not as a substitute for having one.
- **Reject overlapping bounds in `registerParcel`.** Rejected per §4.
- **Leave it alone because it is unreachable.** Rejected. Unreachable today is
  what makes it *cheap* to fix, not unimportant: the first content module that
  defines parcels inherits whichever answer is in the code, and there is no
  reason for that to be the accidental one.

## Consequences

- `SparseWorld.isTileOwned` returns `true` for tiles it previously reported as
  unowned, in exactly one situation: the tile is covered by an owned parcel
  *and* by a lower-id unowned parcel. `canBuildAt` therefore permits building
  there. No existing save, scenario or content path constructs that situation.
- Saves are unaffected. Ownership is derived, not stored — snapshots carry
  `parcels` and `ownedParcels` and nothing about tiles — so no format change
  and no migration is involved, and an old save restores to the new answer.
- `WorldRenderView` continues to receive only owned parcels in its projection.
  That is now correct by construction rather than by coincidence: unowned
  parcels genuinely cannot affect the answer.
- `docs/WORLD.md` becomes accurate about the simulation rather than only about
  the renderer, and states the overlap case explicitly instead of leaving it to
  be inferred. It also marks the half of the rule this ADR proposes as pending
  rather than settled, so a rejection does not make the document false.
- The doc comment on `WorldRenderView.isTileOwned`, which PR #90 rewrote to
  *state* the divergence, is replaced: it now says where the rule lives.
- `WorldRenderView.isTileOwned` no longer brands its coordinates with
  `tileCoordinate`, so it no longer throws `RangeError` for a fractional or
  unsafe-integer coordinate. It only ever threw while the view held at least
  one owned parcel, so that was never a guarantee a caller could rely on, and
  `readTile` answers every other field for such an input silently. The branded,
  validating entry point for tile ownership is `SparseWorld.isTileOwned`, which
  takes a `TilePosition`; the reason is recorded on the renderer method.
- No performance claim in this change is measured, and none is made. The
  benchmark harness (`benchmarks/scenarios/`) has no scenario that exercises
  `SparseWorld`, `WorldRenderView` or `readTile` — the two `world.chunk-size-*`
  scenarios are standalone models that do not import the simulation — so the
  signatures chosen here (loose coordinates rather than a `TilePosition`, a
  pre-resolved `chunkIsOwned` rather than a callback, a chunk key passed in by
  `readTile`) are recorded as allocation-avoiding shape choices and nothing
  more. A benchmark scenario for the render view's tile loop would be the way
  to say more than that, and it is not part of this change.
- `SparseWorld.isTileOwned` collects the owned parcels in canonical
  (ascending-id) order, even though a disjunction cannot depend on the order it
  is walked in. `docs/DETERMINISM.md` ("Canonical iteration order") states the
  rule for anything feeding simulation state with no exception, and this ADR
  does not add one.
- Nothing prevents a future change from reintroducing a private ownership rule
  in the renderer except the test that compares the two sides tile for tile.
  That test is the enforcement mechanism, and it should be treated as one.
