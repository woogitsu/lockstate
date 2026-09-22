# ADR 0108: What "nobody can get in" should mean, and what knowing it costs

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0108, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083 and 0096 each pre-committed.
>
> **THIS DOCUMENT WAS DRAFTED AS 0107 AND THE PRE-COMMITMENT ABOVE WAS CALLED
> IN WITHIN THE HOUR. BOTH DIRECTIONS ARE MARKED RATHER THAN THE FIRST BEING
> OVERWRITTEN** (`docs/AGENT_WORKFLOW.md` §4), because the sequence is the
> whole argument for why the rule is worded the way it is.
>
> **What the first sweep found, and it was correct when it was taken.** On
> 2026-09-11, disk maxed at **0106**, so `max + 1` off disk was 0107; the
> index's own bolded **Next free number** line read **0107**; and a sweep of
> every fetched ref agreed, over **289 heads**, with nothing at 0107 or above
> anywhere. **All three answers agreed**, which the entries below the index's
> next-free line record as the uncommon case.
>
> **What made it wrong was another agent working in parallel, not staleness.**
> `agent/853-stale-cancel` pushed a **0107** document — on what a stale
> build-order cancellation is refused for — while this one was being written,
> and moved the index's next-free line to 0108 on its own branch. Its filename
> is deliberately not written out here: that branch is unmerged, so a path
> citation to it would be a dangling one on this branch and
> `tests/foundation/documentation-links-contract.test.ts` says so, which is the
> same "a document is invisible from the index until it merges" fact this
> paragraph is about, arriving through a different gate. Re-checked here rather
> than taken on report: `git ls-tree --name-only` over that branch names the
> file, and a re-run of the sweep below over **298 heads** now finds **two**
> documents at 0107 — that one and this one — and **nothing at 0108 on any
> ref**. So this document takes **0108** and the index's next-free line moves
> to **0109**.
>
> **That is `docs/AGENT_WORKFLOW.md` §2's recorded failure happening again and
> being caught**: *"Two agents took `0034` within an hour, each having
> correctly enumerated the open pull requests first — the number is not
> reserved until it is in `docs/adr/README.md`."* Both sweeps here were
> correct about the moment they were taken. A sweep is a photograph, and the
> only thing that makes it safe is the pre-commitment above.
>
> **The sweep method here is not the one the previous entries used, and the
> difference is stated rather than glossed.** Those read `git ls-tree` over
> each head's *tip*. This reads
> `git log --all --diff-filter=A --name-only -- 'docs/adr/[0-9][0-9][0-9][0-9]-*.md'`
> over every fetched ref's *history*, which is a superset: it also catches a
> number that was added on some branch and later renamed or removed, and so
> cannot miss a hold that a tip-only read would. **0095 is still held and still
> not on disk**, on the head the entries below the index's next-free line name;
> neither sweep re-derived its holder and neither changes anything about it.
>
> **One defect in `docs/adr/README.md` is deliberately NOT repaired here, and a
> reader of this branch needs to know why.** ADR 0106's row is missing its
> closing `|`, which makes the numbering contract's row regex swallow whatever
> follows it — invisible while 0106 was the last row on disk, and the reason
> the first run of that gate on this branch reported *"no row in
> docs/adr/README.md links to it"* about this document's own row, which does
> end in a pipe. `agent/853-stale-cancel` found and fixed it, and the fix is
> on that branch. Repairing the same line on two branches is how a trivial
> one-character change becomes a merge to reason about, so this branch leaves
> it alone and records the dependency instead.

## Status

**Accepted in full by the owner, 2026-09-11 — AND AMENDED THE SAME DAY BY THE
PROBE THIS DOCUMENT ASKED FOR AND DID NOT RUN.** Put the whole document to
them, they chose the option labelled:

> **Przyjmij w całości i wdrażaj**

("Accept it in full and implement it.")

> **THE PROVENANCE IS THE WEAKER KIND, exactly as the ruling this document was
> written against is** — the label of a clickable option a session wrote and
> the owner selected, not a sentence they typed. The same disclosure
> [ADR 0096](./0096-what-a-way-back-is-and-what-guarantees-one.md),
> [ADR 0104](./0104-what-undo-takes-back.md),
> [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md) and
> [ADR 0106](./0106-how-a-finished-wall-comes-down-without-a-keyboard.md) each
> make of their own rulings.

**AND WITHIN THE HOUR OF THAT ACCEPTANCE, DECISION 1 WAS FALSIFIED BY THE
PROBE THIS DOCUMENT NAMED AND DECLINED TO RUN.** The implementing agent ran
weakest claim 1's falsifier *before* writing any production code, and it did
what this document predicted it would: a walled **unzoned** shed in the corner
of the loaded area seeds the exterior with its own interior and then vouches,
through its own door, for a room nothing can reach. Wrong in the reassuring
direction. Shown that, the owner chose:

> **Popraw na R4 i wdrażaj dalej**

("Amend to R4 and carry on implementing.") Same weaker provenance. **Decision 1
below is therefore superseded by the amendment printed beneath it**, which is
kept beside the original rather than replacing it, per
`docs/AGENT_WORKFLOW.md` §4 — the original is what was accepted, and a reader
needs to see what the probe cost.

**The sequence is the argument for the rule that produced it.** This document
named a falsifier, said *"I did not run it, and I expect it to fail"*, and was
accepted in full anyway. Had the implementation been written first and measured
after, the defect would have shipped — into the one readout #1006 exists to
make honest, in the one direction #1006 is about.

---

**Proposed, 2026-09-11. Not self-approved.** *(The record below this line is
kept as it stood when the document was proposed.)*

**The direction this document designs against is the owner's, ruled on
2026-09-10, and is not re-argued here.** Asked whether `roomPerimeterAccess`
should answer about reachability instead of edge adjacency, they chose the
option labelled:

> **Niech odpowiada o osiągalności**

("Let it answer about reachability.")

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP.** That is the label of a clickable option a session wrote and the owner
> chose — not a sentence they typed — and it was given against a summary
> naming the measured damage from [#1001](https://github.com/woogitsu/lockstate/issues/1001)
> rather than against any design. `CLAUDE.md` flags exactly this shape about
> three releases of reservation 3, and
> [ADR 0096](./0096-what-a-way-back-is-and-what-guarantees-one.md),
> [ADR 0104](./0104-what-undo-takes-back.md),
> [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md) and
> [ADR 0106](./0106-how-a-finished-wall-comes-down-without-a-keyboard.md) each
> disclose the same of their own rulings.
>
> **What the ruling settles, and what it leaves open.** It settles the
> *question the function answers*. It settles nothing about the anchor, the
> mechanism, the vocabulary, the cost or the consumers — which is why
> [#1006](https://github.com/woogitsu/lockstate/issues/1006) says in its own
> words *"To zmienia, co znaczy «zamknięty pokój» w całej symulacji, dotyka
> nawigacji i kosztu na tik … **Nie rozstrzygać tego w kodzie
> implementacji**"* and why the artefact it asks for is this document rather
> than a patch. Everything below the Context section is a proposal.

**This document authors no player-visible string.** Two candidate sentences are
written down in decision 6 and neither ships until the code makes it true;
`AGENTS.md`'s fourth reservation gives us the wording and not the promise.

---

## Context

### What the code does today, opened rather than quoted from the issue

`roomPerimeterAccess` (`src/simulation/rooms/enclosure.ts:288`) asks
`roomPerimeterEnclosure` whether every perimeter edge holds geometry, and then
walks the four sides of the rectangle asking the door registry whether any edge
carries a door:

```ts
for (let x = left; x <= right; x += 1) {
  if (doors.getByEdge(tile(x, top), 'top') !== undefined) return 'doorway';
}
// …three more scans, then…
return 'no-way-in';
```

**There is no reachability step of any kind.** The first door found in the
perimeter returns `'doorway'`; none anywhere returns `'no-way-in'`. Nothing
asks whether anything can get *to* the far side of that door. The issue's
account is accurate, and its `file:line` still resolves.

**The module already knows this and says so**, which is the part worth
knowing before designing anything. `enclosure.ts:130-138`, the docblock on the
type itself:

> **What `'doorway'` does not promise.** It says the boundary is crossable,
> not that anybody can get *to* it: the door may open onto a corridor that is
> itself sealed. That is a region question — `buildNavigationGraph`'s — and
> this module answers about one rectangle's own frontier … `'no-way-in'` is
> certain, `'doorway'` is necessary rather than sufficient, and no sentence
> built on this may claim more.

So the defect is not that nobody noticed. It is that the asymmetry was written
down as a property and then a player-facing readout was built on the half of
it that is not certain. **The docblock even names the mechanism this document
proposes to use** — the region question is `buildNavigationGraph`'s — so what
follows is applying a hand-off this module already wrote, not inventing one.

### The three states, and why two of them are one state to a player

Reproduced from #1006's first comment because it is the clearest statement of
the defect anywhere in the thread:

| state of the cell | `roomPerimeterAccess` returns | what the panel says |
| --- | --- | --- |
| no door at all | `'no-way-in'` | *"a door — nobody can get in"* ✅ |
| door walled up from outside | `'doorway'` | **silence** ❌ |
| door clear | `'doorway'` | silence ✅ |

Rows two and three are indistinguishable to a player, and row two is where
somebody lands who **fixed exactly what the game told them to fix**.
[#938](https://github.com/woogitsu/lockstate/issues/938) dealt with row one.
Row two was untouched and nobody had named it before #1006.

**The repository documented half of this and shipped it anyway**, which is the
argument that a docblock is not a remedy. `src/content/default-locale-en.ts`,
in the docblock of the zoning-confirmation sentence:

> **Not that anybody can get in.** `ZoneRoomAccepted.enclosure` may read
> `'sealed'` for a room with no doorway at all, which is #938: the Rooms
> panel's *"Walled in on every side"* renders identically for a reachable room
> and a sealed box, and a prisoner in a doorless shower room measured hygiene
> 0 of 255 with 162 route failures. So no clause here implies the room will be
> *used*.

That text has existed since #938, it stopped the *confirmation sentence* from
over-promising, and the panel's `ENCLOSURE  Walled in on every side` line went
on saying the reassuring thing — so the defect reached a player again in a new
shape. A comment that constrains one sentence does not constrain the readout
beside it.

### What being wrong about this costs, measured

From #1001, same seed, one edge of difference:

| | income/day | yard ticks | `recreation` | `routeFailures` |
| --- | --- | --- | --- | --- |
| no way through | 11,000 | 0 | 0‰ for 50 of 50 | **11,558** |
| a way through | 13,000 | — | — | **0** |

A walled-off room is not cosmetic, and the silence is not a small
mis-statement: the panel is quiet in exactly the state that costs the player
2,000 a day and every yard tick.

**And no other surface covers for it.** #1006's screenshots show four
prisoners and a guard stacked motionless in one tile, **identically before and
after the door was built** — a working cell and a dead one draw the same. So
the world view gives the player no signal at all, and the Rooms panel is not
one surface among several that could carry this fact; it is the only one that
currently could.

### What already exists, and it is most of the answer

**`buildNavigationGraph` (`src/simulation/navigation/region-graph.ts`) already
computes the reachability partition.** It flood-fills every loaded tile into
maximal regions joined by open edges, treats every registered door as a region
boundary, and records a `Portal` for each — *"regardless of its current lock
state"*, because permission is checked at traversal time. It publishes
`tileToRegion`, `regionTiles`, `portals` and `regionPortals`.

**And it is already rebuilt on exactly the right trigger.**
`NavigationSystem.update` runs every tick (`intervalTicks: 1`) and calls
`ensureGraph()`, which rebuilds when `isNavigationGraphStale` reports either
the door registry's `structuralRevision` or the loaded chunks'
`geometrySignature` has moved. Both edge setters in `SparseWorld`
(`setTopEdge`, `setLeftEdge`) call `markGeometryChanged`, so **every wall and
every door the player places already invalidates this graph**, and the
invalidation is load-bearing for routing today. That matters for the brief's
question about proving an invalidation complete: the proposal below adds no
cache and therefore no second invalidation to prove. It inherits navigation's,
and if that were incomplete, routes would already be wrong.

**`TopologyManager` is not the tool, and it is dead.** Two independent reasons,
both checked here rather than taken from the docblock that asserts the second:

1. **It cannot express a door.** `topology.ts` flood-fills across `edge === 0`
   only and records no portals, so a door is an impassable boundary to it. It
   can never answer "reachable *through* a door", which is the whole question.
2. **Nothing runs it.** `topology.update` is called from
   `tests/unit/construction-geometry.test.ts` and
   `tests/unit/construction-doors.test.ts` and from nowhere in `src/`. It is
   constructed at `src/simulation/runtime/new-session.ts:440` and exposed at
   `:1606`, and it appears in no `registerSystem` block — so no tick
   recomputes it and `getTopologyId` answers `0` for every tile in a running
   session. `enclosure.ts:51-54` says this already and it is true.

### Where the value is load-bearing, enumerated

`roomPerimeterAccess` has **one** production caller:
`projectAccess` in `src/simulation/presentation/room-projection.ts:678`, which
`projectRoomList` and `projectRoomDetail` call. Its result becomes
`RoomListRowViewModel.access`, crosses the worker boundary, and is then read
in these places:

| # | reader | what it does with the value |
| --- | --- | --- |
| 1 | `src/ui/simulation-room-needs.ts:146` (`shortfallOf`) | `missingCapability + (access === 'no-way-in' ? 1 : 0)` — the panel's readiness count, feeding the sort key, the unfinished predicate and the header's `totalNeeds` |
| 2 | `src/ui/simulation-room-needs.ts:354` | turns `'no-way-in'` into a `kind: 'doorway'` need entry |
| 3 | `src/ui/hud/rooms-panel.ts:1631` | draws `hud.rooms.needs-doorway`, *"a door — nobody can get in"* |
| 4 | `src/simulation/rooms/room-needs-cleared-notice.ts:171` | the **same expression as #1**, restated worker-side, deciding when to announce `hud.alert.event.rooms.needs-cleared` |
| 5 | `tests/foundation/room-shortfall-parity-contract.test.ts` | pins #1 and #4 to each other **as literal source text** |

**#5 is the one a reader is most likely to miss, and it is a hard constraint
on any change here.** The predicate is written twice because `AGENTS.md`
boundary 3 forbids the HUD module being imported into the worker, and that
test holds a string constant:

```ts
const EXPRESSION = "row.requirementSummary.missingCapability + (row.access === 'no-way-in' ? 1 : 0)";
```

It reads both files off disk and fails if either spelling drifts by a
character. So any change to the readiness rule moves **three** things in one
commit — the panel, the worker system, and that constant — or the gate goes
red. Its own docblock says why the drift matters rather than being untidy: the
alert would tell a player a room *"is no longer short anything the Rooms panel
checks for"* while the panel is still checking for something, which is a false
sentence reaching a player.

A sixth place is not a consumer but becomes false: `tests/unit/simulation-message-keys.test.ts`
carries an exemption for `RoomPerimeterAccess` whose reason text names
*"`gap`, `doorway`, `no-way-in`"* and *"its three values"*. That is prose in a
test, keyed on the declaration name rather than on the members, so a fourth
value probably does not turn it red — **it just makes it untrue**, and it is
the document that justifies not giving these values labels.

**Two functions that are not affected, checked so the blast radius is not
overstated.** `RoomZoningService.zone` refuses `not-enclosed` from
`roomPerimeterEnclosure` (`src/simulation/rooms/zoning.ts:611`), and the
pending-rectangle preview in `src/ui/room-tool.ts:158` calls the same
function. Neither reads `roomPerimeterAccess`, so **nothing about what the game
refuses to zone changes**, and the live "TOO SMALL"-style feedback under a drag
is untouched.

---

## Decision 1 — reachability is measured from the exterior, and the exterior is defined rather than assumed

**The question has to be answered before anything can be implemented**, in
#1006's own terms: *"a door that opens onto a sealed courtyard is not the same
as one that opens onto the world."*

### What was ruled out, and why

- **A spawn point.** There is none. Prisoners and staff materialise at an
  `originTile` carried on the command
  (`src/simulation/runtime/session-commands.ts:700` →
  `PrisonerOperationsRuntime.admitPrisoner`, `guard-roster.ts:89`), which the
  *player* picks per admission and which nothing retains. Inventing a spawn
  anchor means new persisted state, which means the save format, which is a
  versioned contract — a cost out of all proportion to the question.
- **The world's own edge.** `SparseWorld.getTopEdge` answers `0` for a chunk
  that does not exist, so unmaterialised space is open ground and there is no
  edge. `enclosure.ts:44-50` already reaches this conclusion: *"a region that
  reaches the edge of the materialised world is indistinguishable from one
  bounded by walls there, so 'is this region closed' needs a rule about the
  world's frontier that nobody has written."* This decision writes that rule,
  bounded to the loaded area, and it is the part that needs measuring.
- **Any tile an actor currently occupies.** It is free and it is wrong, and it
  fails on #1006's own screenshot: the four prisoners and the guard are stacked
  *inside* the dead cell, so an actor-seeded walk calls that cell reachable —
  the one room the panel most needs to name. It is also undefined for a prison
  with no population and would make a building fact depend on who is standing
  where.
- **The largest region.** A popularity contest, not a definition; a large
  sealed yard would win it.

### What is chosen

**The exterior: the regions touching the boundary ring of the loaded chunk
area, minus any tile that lies inside a zoned room's own rectangle.**

The second clause is not decoration — it is the repair for a failure this
document measured rather than reasoned about. See "The anchor probe" below: a
sealed room whose interior sits on the ring seeds the exterior *with its own
interior* and so calls itself reachable. Excluding room rectangles from the
seed set fixes the measured case, and the room bounds needed to do it are
`roomBoundsOf`'s, which `projectRoomList` already has for every instance.

**Why this anchor and not a better one.** It needs no new persisted state, it
does not depend on population, it cannot be defeated by an actor trapped in
the room being asked about, and it is stable under actor movement — which
matters more than it first looks: an actor moving is *itself* a proof of
reachability, so movement can never change the answer. Only geometry, doors and
the loaded set can, and all three already invalidate the graph.

**The honest limit, stated here and not only in the weakest-claim section.**
The loaded chunk set is fixed for a session — `setLoadedChunks` is called once,
at `new-session.ts:442`, and never again — and a default session loads exactly
**one** 32×32 chunk. So the ring is 124 of 1024 tiles in a new prison, and the
exterior is a rule about a small square rather than about the world.

### AMENDMENT, 2026-09-11 — the rule above is defeated, and R4 is what ships

Everything above this heading is what the owner accepted and is kept for that
reason. It is **not what the code does.** `tests/research/0108-exterior-anchor-falsifier.research.ts`
built seven prisons and scored four candidate seed rules on each, every rule
followed by the same portal walk and the same `tileToRegion` lookup per room so
that the seed set is the only variable:

| rule | seeds |
| --- | --- |
| **R1** | the rule above: ring tiles not inside a zoned room's rectangle |
| **R2** | ring tiles with an **open crossing out of the loaded area** — the edge between the tile and its missing neighbour holds no geometry, or holds a registered door |
| **R3** | R2's crossing test *and* R1's room exclusion together |
| **R4** | R2, falling back to R1 only when R2 finds nothing at all |

| scenario | R1 | R2 | R3 | **R4** |
| --- | --- | --- | --- | --- |
| S1 anchor: sealed zoned rooms, one interior and one on the ring | ok | ok | ok | **ok** |
| **S2 falsifier: walled UNZONED shed in the corner** | **WRONG** | ok | ok | **ok** |
| S3 shed leaning on the loaded-area edge for two of its walls | WRONG | WRONG | WRONG | **WRONG** |
| S4 control: sealed room, door onto open yard | ok | ok | ok | **ok** |
| S5 perimeter wall two tiles in, one gate | ok | ok | ok | **ok** |
| **S6 loaded area walled flush at its own boundary** | ok | **WRONG** | **WRONG** | **ok** |
| S7 flush wall AND a shed in the corner | WRONG | ok | ok | **WRONG** |

**S2 is the falsifier this document named.** A 3×3 shed walled on all four
sides in the corner is not a zoned room, so R1 does not exclude its interior
from the ring; its tiles seed the exterior — seed set `1, 2, 3` against the
correct `2` — and the walk then vouches through the shed's own door for a zoned
room nothing can reach.

**S6 is the one this document did not consider, and it is why R2 alone is not
the answer.** If the player walls the loaded area flush along its own boundary,
no tile has an opening out of it, the seed set is **empty**, and every room in
the prison reads unreachable at once. R4 is the smallest rule surviving both:
prefer the regions that escape the loaded area, and fall back to this
document's own ring-minus-room-rectangles rule only when nothing escapes — so
**both clauses of decision 1 survive where they are load-bearing**, and the
anchor probe's repair is still doing its work in the branch where it bites.

**S3 and S7 defeat every rule in the table, and neither is a seed-rule problem
— they are open question 5's territory.** Both turn on the same fact: the
loaded area's frontier is **open ground to the edge layers and a wall to the
region graph.** `enclosure.ts:44-50` already records it — *"a region that
reaches the edge of the materialised world is indistinguishable from one
bounded by walls there, so 'is this region closed' needs a rule about the
world's frontier that nobody has written"* — and this is that rule being
written, bounded to the loaded area, running into the same wall. **Any rule
that answers S6 by relaxing the loaded-area boundary relaxes it for a corner
shed's own walls too**, which is precisely what S7 is; the two cannot be
separated by a choice of seed. They are recorded here as measured limits rather
than repaired, and both fail *towards* `'doorway'` — so neither can make the
panel accuse a room that is in fact reachable.

`tests/unit/rooms-reachability.test.ts` is the gate: S2 and S6 are assertions
there, because a research instrument that prints a table would let the repaired
rule regress in silence.

---

## Decision 2 — the mechanism is a portal walk over the graph navigation already builds, with no new cache

Given the graph, the answer is:

1. Seed the walk with the exterior regions of decision 1.
2. Walk `regionPortals` transitively, collecting reached region ids into a
   `Set`. Every door is a portal whatever its lock state, matching what
   `buildNavigationGraph` already does and what `traversal.ts` already rules.
3. A room is reachable when `tileToRegion` maps one of its interior tiles into
   that set.

**No cache, and that is a decision rather than an omission.** The brief asks,
reasonably, that a cached answer come with a proof that its invalidation is
complete. The measurement below removes the need: the whole walk plus a lookup
for every room costs **0.13–0.18 ms at 775 rooms and 0.90–1.08 ms at 3,150**,
against the **0.97–1.04 ms and 4.09–4.55 ms** the *existing* edge scan already
spends on the same rooms. The new answer is roughly **four times cheaper than
the one it replaces.** Nothing that cheap needs a cache, and not having one
means there is no second invalidation to get wrong.

**The wiring is small and was checked at both call sites.**
`src/simulation/worker/projection-catalog.ts:336` and `:353` already pass
`perimeter: { edges: runtime.world, doors: runtime.navigation.doors }` — so
`runtime.navigation` is in scope and `getGraph()` is one call away.
`RoomNeedsClearedNoticeSystem` is constructed at `new-session.ts:1065-1071`
and is already handed `navigation.doors` at `:1069`, so it can be handed
`navigation` instead. Its `order = 140` sits immediately before `navigation`'s
150, and its own docblock explains that placement as reading state already
settled for the tick — **that ordering needs re-reading if this lands**, since
it would then read a graph whose refresh happens at 150. Open question 3.

---

## Decision 3 — `'no-way-in'` keeps its meaning and a fourth value carries the new state

The vocabulary has to carry the distinction or the panel cannot say which
state the player is in. Proposed:

| value | meaning | change |
| --- | --- | --- |
| `'gap'` | a perimeter edge holds nothing | unchanged |
| `'no-way-in'` | perimeter closed, **no door anywhere on it** | unchanged |
| `'doorway'` | a door on the perimeter **and the room is reachable** | narrowed |
| `'unreachable'` | a door on the perimeter, **and nothing can reach it** | **new** |

**`'no-way-in'` deliberately does not absorb the new case.** They are different
things to a player and they have different repairs: row one wants a door, row
two wants the wall *outside* the door taken down. Collapsing them would make
the panel say "build a door" to somebody who has one — the same class of
false sentence this issue is about, pointed the other way.

**`'doorway'` is the value that changes meaning**, and it is the change that
makes the silence honest: today it means "a boundary is crossable", and it
would mean "somebody can get in".

**Consequently the names `roomPerimeterAccess` and `RoomPerimeterAccess`
become false**, since the answer is no longer a property of the perimeter.
Proposed: `roomAccess` / `RoomAccess`. This is a rename across the enumerated
consumers and their tests, and it is listed as a cost rather than waved at.

**What the readiness predicate becomes, in all three places at once:**

```ts
row.requirementSummary.missingCapability + (row.access === 'no-way-in' || row.access === 'unreachable' ? 1 : 0)
```

Panel (`simulation-room-needs.ts`), worker
(`room-needs-cleared-notice.ts`), and the `EXPRESSION` constant in
`room-shortfall-parity-contract.test.ts`. **Both copies move together or the
alert starts lying**, and that test is what says so.

---

## Decision 4 — determinism

The answer must be a function of the world and not of a walk order, and three
things make it so:

1. **The result is a `Set` of region ids, and set membership has no order.**
   Which portal is expanded first cannot change which regions end up in it.
2. **The seeds are canonical.** The ring is walked in a fixed coordinate order
   and the seed ids are sorted before the walk, so the seed *sequence* is a
   function of the loaded area rather than of map insertion order.
3. **The region ids it reads are already pinned.** `buildNavigationGraph`'s
   `nextRegionId` is function-local and its portal sort is code-unit ordering
   with an explicit comment forbidding `localeCompare`, because *"a
   locale-dependent sort here is a locale-dependent route"*. `TopologyManager`
   carries the same rule and `tests/determinism/iteration-order.test.ts` pins
   both. This proposal introduces no new identifier and no new ordering.

**What it does add is a new dependency edge**: a *rendered readout* would
become a function of the navigation graph. Under ADR 0012 the region id is a
category-2 derived value that may not be persisted or compared across a save
boundary — and nothing here persists one. The `Set` is built and discarded
inside one projection call.

---

## Decision 5 — what happens to every consumer

| consumer | effect |
| --- | --- |
| `projectAccess` (`room-projection.ts:678`) | gains the graph as an input; the only place the new answer is computed |
| panel `shortfallOf` | counts `'unreachable'` as a shortfall — **a room walled up from outside starts appearing in the needs list**, which is the point |
| `roomNeedsFromProjections` (`:354`) | must emit a need entry for `'unreachable'` too, or the count and the list disagree |
| `rooms-panel.ts:1631` | needs a second sentence; today it maps one value to one key |
| `RoomNeedsClearedNoticeSystem` | same predicate change; its alert stops firing for act-4a rooms, which today it fires for |
| `room-shortfall-parity-contract` | its `EXPRESSION` constant moves with the other two |
| `message-keys` exemption | its reason text stops being true about the value count |
| `RoomZoningService.zone`, `room-tool.ts` | **unaffected** — both read `roomPerimeterEnclosure` |

> **AMENDMENT, 2026-09-11 — the row for `roomNeedsFromProjections` was the one
> that nearly shipped broken, and only a mutation caught it.** This table says
> that consumer *"must emit a need entry for `'unreachable'` too, or the count
> and the list disagree"*, and the implementation did. **Deleting that clause
> from the implementation left all 19 tests in
> `tests/unit/ui-simulation-room-needs.test.ts` GREEN** — the room still counted
> towards `totalNeeds` through `shortfallOf`, and no need line named it, so the
> panel header would have reported the prison one thing short of something the
> list could not name. A comment in this document was the only thing holding it.
>
> It was found by **performing** the mutation rather than reasoning about it,
> which is `AGENTS.md`'s rule — *"a test proves nothing until the production
> code has been mutated and that test watched going red"* — and it is the same
> vacuity class the repository caught the week before, when an assertion passed
> because the phrase it searched for appeared twice in one file. The case that
> now holds it is #1006's own screenshot at the smallest world that can carry
> it: a furnished cell, a real door on its south boundary, and the one tile that
> door opens onto boxed in on its other three sides.


**The alert sentence shipped by #1122 is the one to retire, and only as a
consequence of acceptance.** It reads:

> `'hud.alert.event.rooms.needs-cleared': '{room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in.'`

Its second clause exists *because* of act 4a. Under this design the checklist
would include getting in, so the clause becomes something the game no longer
needs to say. **Nothing changes it before the code lands**: until then it is
the only thing standing between a player and the false reading, and #1006's
own comment says so.

> **AMENDMENT, 2026-09-11 — THE CLAUSE STAYS, AND THE PARAGRAPH ABOVE IS WRONG
> ABOUT ITS OWN PREMISE.** "Under this design the checklist would include
> getting in" is not true of the implementation, and the counterexample is one
> of this document's own four values.
>
> `shortfallOf` counts `'no-way-in'` and `'unreachable'`. It does not count
> **`'gap'`**, and decision 3 deliberately leaves `'gap'` unchanged — it is
> decided by `roomPerimeterEnclosure` *before* any region question is asked, so
> it says a boundary can be crossed and says nothing whatever about what is
> beyond it. `room.yard` is `{ type: 'outdoors' }` in the room catalogue, so
> `RoomZoningService.zone` accepts **any** perimeter for one. A yard zoned
> inside a sealed structure therefore reads `'gap'`, counts **zero** towards
> the shortfall, and is a room nobody can get into. A second, narrower
> escape: `access` is absent for an instance carrying no rectangle, and absent
> counts zero too.
>
> So `shortfallOf(row) === 0` still means "the panel's checklist is clear" and
> still does not mean "a prisoner can reach this room". **Retiring the clause
> would have made the sentence false in exactly the shape #1006 is about**, one
> value further along. It stays, verbatim, and
> `tests/unit/rooms-reachability.test.ts` pins the counterexample so the next
> reader of this paragraph does not have to take it on trust.
>
> Making `'gap'` reachability-aware would close it. That is a change to decision
> 3, which the owner accepted as written, and it is not taken here.

---

## Decision 6 — the two sentences this needs, written down and not shipped

`AGENTS.md`'s fourth reservation was partly released on 2026-09-04 — the
choice of words is ours, the requirement that the sentence be *true* is not —
so these are candidates recorded here, to ship only beside the code that makes
them true.

For a room in the new `'unreachable'` state, replacing silence:

> **"a way through — the door is walled off"**

And if the confirmation alert is re-worded once the checklist covers access,
the second clause simply goes:

> **"{room} is no longer short anything the Rooms panel checks for."**

Neither is written into `src/content/default-locale-en.ts` by this document.

> **AMENDMENT, 2026-09-11 — what actually shipped, and only one of the two.**
> The first candidate was **not** used. *"a way through — the door is walled
> off"* asserts a particular geometry — that the door itself is walled — and
> `'unreachable'` is a weaker and wider fact than that: the space beyond the
> door cannot reach the exterior, which the door's own tile being bricked up is
> only one way to achieve. The sentence that shipped is
>
> > **`'hud.rooms.needs-unreachable': 'a way in — nothing outside can reach its door'`**
>
> (`src/content/default-locale-en.ts`), whose locale docblock proves each clause
> against the code: *"a way in"* rather than *"a door"*, because `roomAccess`
> reaches `'unreachable'` only **after** `roomPerimeterHoldsDoor` has found one;
> and *"nothing outside can reach its door"* because a perimeter door is a
> `Portal` joining the room's region to the region beyond it and `walkPortals`
> is transitive, so an exterior region able to reach the far side of that door
> would have entered the room's own region in the same walk.
>
> **The second candidate was not used either**, and the amendment under decision
> 5 says why: the checklist does not cover access, so the clause it would have
> retired is still doing its job.

---

## The measurements

All on this branch at `f70efe73`, node v24.19.0 (v8 13.6.233.17-node.51),
linux/x64, 4× Intel Xeon @ 2.10GHz, 15.7 GiB RAM, on the shared container with
other agents working. Method is `tests/perf/measure.ts`'s — warmup iterations
discarded, then the **minimum** of the measured samples, for the reason
`docs/BENCHMARKING.md` gives: preemption is one-sided, so on a shared box the
minimum is the closest available estimate of uncontended cost and its error
runs one way.

The harness builds a cell block of 3×3-interior rooms sharing walls across
`n²` chunks of 32×32, one door per room on its north edge, and walls the
corridor tile outside every seventh room's door — the act-4a state. Column A
is today's `roomPerimeterAccess` over every room; B is one
`buildNavigationGraph`; C is the proposed exterior walk plus one lookup per
room; D is the alternative the issue fears, one tile flood fill per room.

| chunks | side | rooms | regions | portals | A edge ms | B graph ms | **C walk ms** | D naive ms | unreachable | A≠C |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 32 | 42 | 49 | 42 | 0.10 | 2.51 | **0.02** | 7.26 | 6 | 6 |
| 4 | 64 | 180 | 207 | 180 | 0.24 | 11.9 | **0.06** | 88.7 | 26 | 26 |
| 16 | 128 | 775 | 887 | 775 | 1.04 | 51.8 | **0.13** | 1,583 | 111 | 111 |
| 64 | 256 | 3,150 | 3,601 | 3,150 | 4.41 | 264 | **0.90** | 40,595 | 450 | 450 |

Three runs of the same table agreed to within the spread
`docs/BENCHMARKING.md` describes (A at 775 rooms: 1.10 / 1.04 / 0.97; B: 52.8 /
50.6 / 51.8; C: 0.16 / 0.16 / 0.13).

**What the columns say.**

- **The proposed answer is cheaper than the one it replaces**, by about 4× at
  every size measured. The edge scan is `4 × (width + height)` reads *per
  room*; the walk is one pass over the region graph plus an O(1) lookup per
  room.
- **The naive alternative is not merely slower, it is a different order.**
  1,583 ms against 0.13 ms at 775 rooms — **12,000×** — and 40,595 ms against
  0.90 ms at 3,150 rooms, **45,000×**. If reachability had to mean a flood
  fill per room per tick, the honest answer to this ADR would be no. It does
  not, because the partition is already computed.
- **`A ≠ C` equals the unreachable count in every row.** Every room the walk
  calls unreachable, today's function calls `'doorway'`. That is the defect,
  reproduced at 42, 180, 775 and 3,150 rooms.

### AMENDMENT, 2026-09-11 — re-measured against what shipped, and the headline claim does not survive intact

The table above was measured on this document's branch against the rule this
document published. The rule that shipped is R4, which adds a per-ring-tile
crossing test to the seed selection, so the claim had to be re-taken.
`tests/perf/room-access-reachability.perf.ts` is that measurement, on the same
method — warmup discarded, minimum of samples — on a 4× Xeon @ 2.80GHz
container. Two prisons at each size, because the first run found a variable
neither table has a column for:

| doors walled | rooms | A edge ms | B graph ms | **C walk ms** | **D shipped ms** | unreachable |
| --- | --- | --- | --- | --- | --- | --- |
| 1 in 7 | 80 | 0.28 | 5.01 | **0.29** | **0.46** | 30 |
| 1 in 7 | 336 | 1.03 | 17.6 | **1.21** | **1.79** | 228 |
| 1 in 7 | 1,344 | 3.92 | 86.6 | **3.02** | **7.33** | 1,122 |
| 1 in 7 | 5,440 | 16.4 | 358 | **13.9** | **33.7** | 4,990 |
| none | 80 | 0.20 | 3.32 | **0.16** | **0.37** | 0 |
| none | 336 | 0.91 | 14.6 | **0.53** | **1.49** | 0 |
| none | 1,344 | 3.80 | 75.0 | **1.89** | **6.15** | 0 |
| none | 5,440 | 16.5 | 370 | **6.84** | **27.8** | 0 |

**Three corrections, and the second is the one that matters to a reader of this
document.**

1. **C is cheaper than A in every row, by 1.2× to 2.4× — not by about 4×.** The
   *direction* this document argues from holds everywhere and is not in doubt.
   The factor does not: 0.17 µs per room at 775 does not reproduce, and the
   healthy rows here run 1.3–2.0 µs.
2. **This document publishes no column D, and column D is what the projection
   actually spends.** `roomAccess` asks **both** questions — the perimeter walk
   that was column A, then the region lookup — so the marginal cost C is not the
   new total. **The Rooms projection is DEARER after this change, by about 2×**:
   27.8 ms against 16.5 at 5,440 rooms, 6.15 against 3.80 at 1,344, and 1.49
   against 0.91 at the room counts this repository actually claims. The sentence
   *"roughly four times cheaper than the one it replaces"* is true of a marginal
   cost and false of the readout, and it is easy to read as the second.
3. **The variable is how many rooms are unreachable.** `reaches` exits on the
   first room tile in a reached region, so a room somebody can get into costs
   one lookup and a room nobody can get into costs `width × height` of them. The
   paired rows isolate it: C doubles at 5,440 rooms when 92% of them are dead.
   This document's own fixture had 14% unreachable, which is part of why its
   column C is so much lower than anything measurable here.

**THE SHORT-CIRCUIT WAS TRIED BEFORE THIS WAS PUT TO ANYONE, AND IT NARROWS THE
REGRESSION WITHOUT INVERTING IT.** `roomAccess` paid for both questions on every
room; it now skips the door read for any room the exterior walk already reached,
which is sound because a **sealed** rectangle that is reachable necessarily has a
registered door on its perimeter — the flood fill crosses an edge only when the
edge value is `0` *and* no door is registered, so nothing can have got in except
through a portal on a perimeter edge, and a portal is a door.

| rooms | A edge ms | D before | D after | after / A |
| --- | --- | --- | --- | --- |
| 1,344 | 3.90 | 6.15 | **5.16** | **1.32×** |
| 5,440 | 18.2 | 27.8 | **21.6** | **1.19×** |

About 20%, and the conclusion stands: **still dearer than what runs today.** It
helps less than the shape of the argument suggests for two measured reasons.
The **enclosure walk is still charged to every room**, because `'gap'` is a fact
about the boundary that no region answer can supply. And the reachable fraction
— the population the skip pays on — is 100% in the control rows but **16.5% at
1,344 rooms and 8.3% at 5,440** in the act-4a rows, because of the contagion
recorded above: walling one door in seven strands 83–92% of the block.

**What it cost, recorded because it is not free.** Making the region answer
load-bearing *before* the door answer means the two can no longer be stubbed
independently — a fixture that faked a doorless sealed room as reachable was
describing a world that cannot exist, and the old ordering was the only thing
hiding it. Two fixtures became real rather than relaxed.

**What the decision does not turn on**, stated so the correction is not read as
a reversal: at the room counts in evidence the absolute figures are around a
millisecond and a half, the alternative this document rules out is still four
to five orders of magnitude worse, and no cache is needed for either number.
Weakest claim 2 — *"every number here is from a synthetic cell block"* — still
stands, and now stands twice.

**And the fixture refuted its own first assertion, which is a fact about the
game rather than about the code.** It expected the unreachable count to equal
the number of doors walled up and got **30 against 12** at one chunk: boxing in
the tile outside a door puts two walls into the shared corridor row, and where
two sealed doors fall in the same row the segment between them is bounded on
all four sides, stranding every room whose door opens into it. **The act-4a
state is contagious** — a player who walls one doorway can kill a row of cells —
which raises what #1001 measured rather than lowering it.

**One number is not a cost of this proposal and must not be read as one.**
Column B is large — 264 ms at 256×256 — and it is **already paid today**:
`NavigationSystem.update` calls `ensureGraph()` every tick, and every wall edit
bumps `geometryRevision`, so the rebuild already happens on the tick after any
geometry change. This proposal reads that graph and does not cause it to be
built. **That said, 264 ms is more than a 20 Hz tick's 50 ms budget**, so a
sufficiently large prison already has a graph-rebuild problem on the tick it is
edited, independent of anything here. That is a measurement and not a
diagnosis: it is stated, it is not this document's to fix, and it is filed as
open question 4.

### The anchor probe, which falsified the first version of decision 1

Two rooms in one 32×32 chunk, identical in shape, both with a door, both with
that door walled up from outside. One sits in the middle; the other's interior
occupies the corner of the loaded area, so its tiles lie on the boundary ring.

| room | today | region | ring seed only | ring minus room rects | interior touches ring |
| --- | --- | --- | --- | --- | --- |
| interior room | `doorway` | 4 | `false` | `false` | no |
| frontier room | `doorway` | 1 | **`true`** | `false` | yes |

With the plain ring rule the frontier room **seeds the exterior with its own
interior** and is then reported reachable — wrong, and wrong in the reassuring
direction, which is the direction this whole issue is about. The seed count
drops 2 → 1 once room rectangles are excluded, and both rooms then read
correctly.

**This is why decision 1 carries its second clause**, and it is recorded as a
refutation rather than presented as foresight: the first version of this design
had the plain ring rule and the probe was written to try to break it.

---

## The weakest claims, and what would falsify each

> **AMENDMENT, 2026-09-11.** Claims 1, 4 and 5 were discharged by the
> implementation and the falsifier; the resolutions are marked inline below.
> Claims 2 and 3 stand, and claim 2 now stands about two measurements rather
> than one.

1. **The strongest one: the exterior rule is proved against room rectangles
   only.** The probe shows a *zoned room* on the frontier defeating the plain
   ring rule and the exclusion repairing it. It shows nothing about a sealed
   structure on the frontier that is **not** a zoned room — a corridor boxed in
   by walls, an unzoned shed — whose tiles would still seed the exterior and
   could then vouch for everything behind their own door. **What would falsify
   it:** the same probe with a walled, unzoned rectangle in the corner instead
   of a room. I did not run it, and I expect it to fail; if it does, the seed
   rule needs a better definition of "outside" than "on the ring and not in a
   room", and decision 1 is the part of this document to re-argue.

2. **Every number here is from a synthetic cell block, not a played prison.**
   The fixture gives each room exactly one door and lays them on a lattice, so
   `portals ≈ rooms` and the region graph is unusually sparse. A real prison
   with multiple doors per room and long shared corridors has a denser portal
   graph, and column C grows with portals. **What would falsify it:** the same
   measurement over a world loaded from a real save. The margin is four orders
   of magnitude against the naive alternative and about 4× against today's
   scan, so C would have to be wrong by a great deal to change the decision —
   but "cheaper than today" is the claim that is only 4× safe.

3. **"Rooms number in the hundreds" is inherited, not measured.** Both
   `protocol/types.ts:1905` and `room-needs-cleared-notice.ts:92` assert it and
   I did not verify it against a played prison; I measured 42 to 3,150 to
   bracket it. **What would falsify it:** a room count off a real save above
   3,150, which would put column C past a millisecond and make the
   no-cache decision worth revisiting.

4. **The claim that no new invalidation is needed rests on
   `isNavigationGraphStale` being complete.** I argued it is, from the fact
   that routing already depends on it, and I did not test it. **What would
   falsify it:** a geometry mutation route that changes an edge without going
   through `SparseWorld.setTopEdge`/`setLeftEdge`. I grepped and found none;
   an absence is the shape of claim `docs/AGENT_WORKFLOW.md` §4 says rots
   first.

   > **STILL UNTESTED, AND NARROWER THAN IT LOOKS, 2026-09-11.** The
   > implementation added no cache, so there is still exactly one invalidation.
   > It is not this change's to prove: if `isNavigationGraphStale` were
   > incomplete, every route in the game would already be wrong, and the Rooms
   > panel would be the least of it.

5. **The cost of the rename is asserted rather than counted.** I did not
   attempt `roomPerimeterAccess` → `roomAccess` to see how many files move.

   > **COUNTED, 2026-09-11: eight production files and five test files**, and
   > the type checker enumerated every one of them the moment
   > `RoomProjectionOptions.perimeter` gained its third required member. The
   > rename went further than this document proposed: `roomPerimeterAccess` did
   > not become `roomAccess` in place but **split**, because its two halves
   > answer different questions. `roomPerimeterHoldsDoor` stays in
   > `enclosure.ts` with the perimeter walks it belongs to, and `RoomAccess` /
   > `roomAccess` live in a new `src/simulation/rooms/reachability.ts`. The
   > names `roomPerimeterEnclosure` and `roomPerimeterHoldsDoor` are then still
   > **true**, which the flat rename would not have left them.

---

## What the owner must approve

1. **Decision 1's anchor**, which is the one real design choice here and the
   one with a measured hole in it (weakest claim 1).
2. **Decision 3's fourth value and the rename.** A wider enum is a
   worker-boundary vocabulary change.
3. **The two candidate sentences in decision 6**, under the 2026-09-04 release
   — the wording is ours, the promise is not.

## Open questions

1. Does `'unreachable'` deserve its own need entry and its own sentence, or
   should the panel show the existing doorway sentence re-worded? Decision 3
   assumes the former.
2. Should the *detail* view name the tile the door opens onto, so the player
   knows which wall to take down? The graph knows it; no surface asks.
3. `RoomNeedsClearedNoticeSystem.order = 140` runs before `navigation`'s 150.
   Reading the graph there means reading the one built on the *previous* tick.
   For a once-a-day system that is almost certainly fine and it should be said
   out loud rather than assumed.

   > **CLOSED, 2026-09-11: it does not arise.** `NavigationSystem.getGraph()`
   > calls `ensureGraph()`, which **rebuilds a stale graph on the spot** rather
   > than handing back whatever the last `update()` left. So a system ordered at
   > 140 reading through that method gets a graph current for its own tick, and
   > the system is handed the navigation system rather than a graph value
   > precisely so that it does. Checked in `navigation-system.ts` rather than
   > assumed, which is how the question turned out to have no content.
4. `buildNavigationGraph` at 264 ms for a 256×256 loaded area, on a tick
   budget of 50 ms, with a full rebuild triggered by any wall edit. Not this
   document's to fix; filed here because this document measured it.
5. `setLoadedChunks` is called once per session and never again
   (`new-session.ts:442`). If chunk streaming ever lands, the exterior rule in
   decision 1 changes meaning under it.
