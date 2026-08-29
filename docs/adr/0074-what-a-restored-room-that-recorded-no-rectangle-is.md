# ADR 0074: What a restored room that recorded no rectangle is

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0074, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048 and 0049 each pre-committed.
>
> **The arithmetic, written out rather than asserted**, because the practice
> ADR 0071's preamble records is that the assigner performs the sweep and the
> drafting agent recomputes it. Performed on 2026-08-29 from
> `agent/559-v4-room-bounds`, over **every** remote head and not only `main`:
>
> - `origin/main` and every `origin/agent/*` and `origin/wip/*` head max at
>   **0073** (the contraband-search ADR, #552).
> - **0072 is held and unwritten** for the events-persistence decision on
>   `agent/507-event-channel`, which the owner has ruled on. It is a hold, not
>   a gap, and it is why `max + 1` off disk is not the answer here.
> - Nothing on any remote head is above 0073.
>
> So the lowest number that collides with nothing merged *and* nothing held is
> **0074**, which is also the `Next free number` line's own value. The two agree
> this time; they did not for 0071, and the reason to write the sweep out is
> that whether they agree is a fact about branches a worktree cannot see.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It answers [issue #559](https://github.com/matmaxalez/lockstate/issues/559),
and it **amends [ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md)
decision 2**, which is the sentence *"An instance recording no rectangle keeps
the unbounded answer."* That sentence is not withdrawn — it is still what the
code does for an instance that genuinely has no rectangle. What is withdrawn is
its *example*: a V4 save was named as the case, and a V4 save turns out to carry
the rectangle after all, in a different section of the same payload.

`AGENTS.md`'s architectural boundary 7 — *every persistent format must have a
version and migration strategy before release* — is why this is a decision
rather than a fix. What a stored payload means when a field is absent is the
format's promise, and moving it inside implementation code is how a save format
acquires undocumented behaviour.

## Context

### The defect, measured rather than reasoned

A save-schema V4 room-instance row is `{ instanceId, roomCatalogId, anchorTile,
capacity, objectCapabilities }` — an anchor and no extent
(`roomInstanceSchemaV4`, frozen). `migrateSaveEnvelopeV4ToV5` deliberately
fabricates no `width`/`height`, on the reasoning that `1x1` asserts a room the
player did not zone and `64x64` one that overlaps its neighbours.

Until #554 that cost nothing a player could see: every consumer of a room's
bounds answered *zero* without them, and zero was also the answer for a room
with no objects in it. #554 changed one consumer. ADR 0071 gave
`RoomInstanceRegistry.concurrentUseCapacityFor`'s first case — an action naming
no object capability, which in the shipped content is exactly the yard's
recreation — the answer `max(1, floor(width × height / 16))`, and left
`Number.POSITIVE_INFINITY` standing where there is no rectangle.

Measured on a save a **shipped V4 build actually wrote**
(`tests/fixtures/persistence/save-v4-yard.json`, captured by checking out
`94adf1c`/v0.0.61 in a detached worktree and running that build's own `ZoneRoom`
→ `captureSessionSnapshot` → `createSaveEnvelope` path), driven through
`decodeSaveEnvelope` → the migration chain → `restoreSimulationRuntime`:

```
DECODE  {"ok":true,"migrated":true,"version":5}
ROWS    [{"instanceId":"room.yard:4:4","roomCatalogId":"room.yard",
          "anchorTile":{"x":4,"y":4}}]
restored 8x8 yard, open-ground ceiling   Infinity
same 8x8 yard zoned by this build        4
```

So a player who saved before #554 and loads after it keeps the unbounded yard
#554 exists to remove, and nothing says so. That is a player-visible wrong
number produced by the save path.

### The V4 population is real, and a comment in the tree said it was not

`save-migrations.ts` claimed *"the hard case is unreachable in practice for a
player's save: while `ZoneRoom` had no producer no save could contain a room
instance at all, and the producer arrived in the same release train as this
migration."* Checked:

```
84e1c61  2026-08-25 16:59  Rooms tab that can zone a room (#312)   -> v0.0.49
   ...   twelve tagged releases, v0.0.49 .. v0.0.61
6cededc  2026-08-25 20:08  Object placement phase 1 (#320)         -> V5
```

`SAVE_SCHEMA_VERSION` is 4 throughout that window and `room.yard` is in the
catalogue throughout it, so for three hours and twelve releases a build could
write exactly the save this ADR is about. The comment is corrected with the
change. **How many players hold one is still unknown and is not a question this
repository can answer** — it is the issue's own weakest claim and it stays open.
What the measurement removes is the argument that the state is unreachable.

### The rectangle was never lost, only unread

`RoomZoningService.zone` writes **two** things and always has: the room
instance, and the room type's `numericId` into the world's zoning plane over
every tile of the rectangle. That plane is persisted — `save-schema.ts`'s
`zoning: terrainRleSchema.optional()` inside the world section — and has been
since before room instances existed. The V4 fixture's world section carries
`"zoning": [[0,132],[9,8],[0,24],[9,8], …]`, and scanning the restored world
finds `64` tiles of `room.yard`'s numericId at `x 4..11, y 4..11`: exactly the
8×8 the player drew.

What the payload does not carry is the arithmetic linking those tiles to the
row. That is what this decision supplies.

### The prior art this is decided against

[ADR 0030](https://github.com/matmaxalez/lockstate/issues/361) decision 3 grants
a migration permission to write a section its version did not change, on three
conditions, the third being *"the alternative must be a loss the player cannot
reverse in game."* [#391](https://github.com/matmaxalez/lockstate/pull/391)
established that the premise fails whenever the *running simulation* can reach
the same facts from the same payload — there, a held incident-response claim —
and [ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md)
is the counter-proposal that was taken: derive at runtime, recompute on every
load, leave the file exactly as found.

This is the same shape with a different subject, and it is the reason the option
list below is ordered the way it is rather than starting from a version bump.

## Options considered

1. **Recompute the bounds inside `migrateSaveEnvelopeV4ToV5` and write them into
   the payload.** Rejected, and *measurably* insufficient rather than merely
   against precedent. A boundless row is **not confined to V4**: restore the V4
   fixture on `main`, run it, capture it, and the envelope that comes out
   declares `saveSchemaVersion: 5`, decodes with `migrated: false`, and still
   carries `{"instanceId":"room.yard:4:4","roomCatalogId":"room.yard",
   "anchorTile":{"x":4,"y":4}}`. A repair inside the migration is offered such a
   save exactly once, at the version boundary, and never again — so every save
   already written by a build between the V5 bump and this change would keep the
   defect for ever. It also writes a conclusion into a file irreversibly on its
   first load, which is the half of ADR 0030 decision 3 that #391 refuted.
2. **A new save version (V6) carrying a required rectangle.** Rejected. The
   shape does not change: `width`/`height` are already declared at V5 and every
   save this build writes carries them. A bump would buy a *schema* guarantee
   that the payload is already able to express, at the cost of a fifth migration
   step and a frozen V5 schema, and it would still need this same recovery to
   fill the field in — a migration cannot invent what it does not read, and what
   it would read is the zoning plane, which is option 1 wearing a version
   number. `docs/PERSISTENCE.md`'s own condition for a bump — a required field
   added or removed, a shape changed — is not met.
3. **Mark a legacy instance explicitly and answer a conservative finite
   capacity** (issue #559's option 2). Rejected: it is a guess where an exact
   answer is available, and the guess is player-visible. Every value it could
   choose is wrong for some prison, and the one it would be least wrong for is
   the one the plane already states.
4. **Require re-zoning** (issue #559's option 3). Rejected: it takes a room away
   from a player who did nothing wrong, and it needs copy — a new player-facing
   promise, which is the owner's under `AGENTS.md`, not an implementation
   choice.
5. **Accept the asymmetry and pin it** (issue #559's option 4). Rejected as the
   whole answer and **kept as part of it**: see decision 3.
6. **Recover the rectangle from the zoning plane at restore.** Taken.

## Decision

1. **A room instance restored without a rectangle recovers one from the zoning
   plane the same payload carries.** `restoreSessionSystems` calls
   `recoverRoomBoundsFromZoningPlane`
   (`src/simulation/rooms/bounds-recovery.ts`) before it registers the rows, and
   registers the recovered extent alongside the anchor the row already carries.
   Nothing is authored and no default is chosen: the answer is the tiles
   `RoomZoningService.zone` painted when the player designated the room.

2. **No save format moves. `SAVE_SCHEMA_VERSION` stays 5, no migration is
   added, and no file is written.** The recovery is recomputed on every load, so
   a save is never repaired on disk and a recovery later found wrong is not
   baked into anybody's prison. This is ADR 0033's shape and not ADR 0030's, for
   the reason #391 gave: the running simulation already holds the facts.

3. **An instance the plane cannot support keeps its absent bounds and ADR 0071's
   unbounded ceiling, and that residue is pinned by a test.** The whole
   rectangle is verified painted and unclaimed before it is returned, so a save
   whose plane shows no rectangle under a row — a hand-edited one, or paint
   cleared out from under it — recovers nothing. Inventing a rectangle the plane
   does not show is the one thing ADR 0071 decision 2 refused, and it is still
   refused. What changed is that the plane usually *does* show one.

4. **The recovery is exact for any plane `zone` wrote, not a heuristic**, and
   the argument is the decision's load-bearing part rather than a note. The
   plane alone cannot say which instance a painted tile belongs to — that is the
   gap `zoning.ts` states in its own header and the reason `roomInstanceContaining`
   resolves through rectangles. The anchors close it, given three facts about
   how `zone` writes: an instance's region is an axis-aligned rectangle anchored
   at its **top-left** (`roomInstanceIdFor` is `id:x:y` of that corner); two
   instances never overlap (`zone` refuses `overlaps-existing-room`); and every
   tile of the rectangle carries the room type's `numericId`.

   Anchors are walked in ascending `y`, then `x`, then instance id. For each,
   the extent is measured east along the anchor row and south down the anchor
   column, stopping at a tile that is not painted with this type, is already
   claimed by an earlier instance, or **is another instance's anchor**. The two
   stops are exhaustive. Over-reach is impossible: the first tile past the true
   right edge belongs to some other instance `C`, and either `C` anchors on an
   earlier row — so it was processed first and the tile is claimed — or `C`
   anchors on this row, and then `C`'s anchor lies strictly between this anchor
   and that tile (an anchor further left would have to cover this instance's own
   anchor, an overlap `zone` refuses), so the run stops at it. Under-reach is
   impossible because every tile inside the true rectangle is painted, is
   claimed by nobody else, and is no other instance's anchor. The same argument
   transposed gives the height.

5. **A row that records its own rectangle is the authority on it and is never
   re-measured.** Its tiles are claimed before anything is recovered, so a
   mixed payload — one row upgraded from V4 beside one this build wrote — cannot
   let the boundless row grow into the recorded one.

6. **No player-facing string is added or changed, deliberately.** There is
   nothing to tell the player: a restored yard now behaves exactly as one zoned
   in this build, which is the state they already believed they had. Copy
   describing a repair would be a promise about a save's history that nothing in
   the tree can substantiate, and a locale key with no implementation behind it
   is the exclusion `AGENTS.md` names.

## Consequences

**What an old payload gets, precisely.** A V4 save whose zoning plane still
shows its rooms restores with those rooms' rectangles, and therefore with the
capacity, the object attribution and the removal behaviour a currently-zoned
room has. The measured case: an 8×8 yard goes from an `Infinity` ceiling to
**4**, the fifth prisoner is refused, and `findAvailableForUse('room.yard')`
answers `undefined` once four are in — which is the balance #554 measured
(96 common-room ticks against 1,248) reaching a restored prison for the first
time.

**The blast radius is wider than capacity, and that is stated rather than
discovered.** Giving a restored instance a rectangle also makes
`roomInstanceContaining` resolve its tiles to it, so:

- an object the player places in a restored room is now attributed to it (a V4
  payload contains no placed objects at all, so nothing changes for the save as
  written — only for what the player does next);
- `unzone` removes that room as an instance rather than flood-filling its
  same-type region, which is #337's fix reaching restored rooms;
- the Rooms projection counts its objects against `minQuantity` instead of
  falling back to the capability list.

Every one of those moves a restored room *toward* the behaviour of a zoned one.
None is a new mechanism.

**A saved game written after this change carries the recovered rectangle**,
because the ordinary capture path writes what the runtime holds. That makes the
recovery land once and stay landed, and it is the one respect in which this is
not perfectly reversible: after the player saves, the rectangle is in the file.
It is not a rewrite *by the load* — nothing is written unless the player saves,
which is the same act that persists every other recomputed value — but a reader
looking for the pure form of ADR 0033's guarantee should know the difference.

**One existing assertion moved, and it is a strengthening.**
`tests/migrations/save-v4-to-v5.test.ts` asserted that a migrated row's `width`
`toBeUndefined()` after restore; it now asserts `2x3`, the rectangle that
fixture's own V4 session was told to zone. The assertion above it, over the
migration's own output, is untouched: **the migration still invents nothing.**
Both directions are marked in the file rather than overwritten.

**ADR 0071's figures are untouched.** `TILES_PER_OPEN_GROUND_PLACE` stays 16 and
`concurrentUseCapacityFor` is not edited. This changes which instances arrive at
that rule with bounds, never what the rule says.

## What would change our mind

**The weakest claim is that a plane painted by something other than
`RoomZoningService.zone` cannot mislead the recovery.** The exactness argument
in decision 4 is a proof about planes `zone` wrote, and it is sound for those.
It is *not* a proof about a plane that acquired paint some other way — a save
written before zoning registered instances at all can hold paint no instance
owns, which `zoning.ts` already records, and a hand-edited save can hold
anything. The whole-rectangle check is the guard against the shapes that would
mislead, and it refuses rather than guesses; what it cannot detect is stray
paint of the *same type* that happens to extend a real room's anchor row into a
larger true rectangle.

What would change our mind is a real payload in which that occurs. If one turns
up, the answer is not to weaken the recovery but to narrow its domain — recover
only where the room's own catalogue minimum and maximum bracket the result, or
only for a room type with a single instance in the payload — and to report the
rows it declined rather than silently taking a bounding box.

**The second weakest is that the V4 population is non-empty.** Twelve releases
could write such a save; whether anyone did is unreadable from this repository,
and `docs/AGENT_WORKFLOW.md` §3 says that makes it a question rather than a
finding. If the answer is "nobody", this change is still right — a
current-version save can carry a boundless row, which is measured above — but
its urgency is different, and the migration comment corrected here would have
been harmless rather than false-and-load-bearing.

## Out of scope

Whether `room.yard` should require an object (issue #529's surface); the value
of `TILES_PER_OPEN_GROUND_PLACE`, which ADR 0017 decision 5 makes data and ADR
0071 leaves open to re-measurement; and storing an instance id per tile in the
zoning plane, which issue #337 proposed and `docs/PERSISTENCE.md` records as
correctly refused — this decision is the second demonstration that the plane and
the anchors together already answer what an id per tile would answer, at no cost
to the format.
