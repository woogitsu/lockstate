# ADR 0111: How a room instance's rectangle reaches the render side

> **The number is provisional and this document pre-commits to renumbering**, on
> the same terms as [ADR 0110](./0110-what-security-sector-a-room-is-in.md),
> whose preamble carries the sweep: 321 remote heads read on 2026-09-12 from
> `origin/main` at `8b3c0907` (v0.0.589), highest four-digit prefix 0109,
> nothing at 0110 or above on any head, 0095 still held.
>
> **Read [ADR 0110](./0110-what-security-sector-a-room-is-in.md) §1 first.**
> These two were commissioned as one question and are filed as two; that section
> is the argument, and this document is the half of the split that is *not*
> about sectors.

## Status

**Accepted by the owner on 2026-09-19, in one ruling: decision 1's recommended
transport.** Put to them as four options — this document's own Options A to D —
they chose the one labelled:

> Rozszerzyć world w migawce geometrii (rekomendacja ADR-a)

("Extend `world` in the geometry snapshot (the ADR's recommendation).") That is
**Option A**, and it is the option Decision 1 below recommends. The `Proposed`
block is kept below rather than replaced, on the pattern
[ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md)'s Status
block sets and for the reason it gives: `docs/AGENT_WORKFLOW.md` §4's rule is to
mark both directions, and what the question looked like before it was answered
is what a later reader needs in order to judge the answer.

**The provenance is the weaker kind, and is disclosed here rather than inferred
from the entry in `AGENTS.md`.** The ruling is the *label of a clickable option
the integrating session wrote and the owner chose*, not a sentence they typed —
the same disclosure the 2026-09-08, 2026-09-09 and 2026-09-10 entries in
`AGENTS.md` make about themselves, and the same one the scope ruling below
already makes about the filing of this document. It is the second ruling of that
kind this document carries and the first that reaches anything below the Status
block.

**What the acceptance covers, exactly: all three decisions, and nothing drawn
with them.** Decision 1 (the rectangle rides the geometry pull), decision 2 (the
condition ordinal stays on the delta channel, which is a restatement of ADR
0097's decision 2 rather than a new decision) and decision 3 (publishing a
rectangle licenses no mark). **Decision 3 is part of what was accepted and not a
caveat on it**: what is drawn with `width` and `height`, and what it claims to a
player, stay ADR 0097's and ADR 0101's. Options B, C and D are rejected on the
costs this document prices for them; Option B's separate, smaller case — two
numbers on the HUD row for a *"show me this room"* affordance — is untouched by
this ruling, exactly as that option says.

**No player-facing string is accepted here, because none is authored here.** The
paragraph below saying so is unchanged by the acceptance, and reservation 4 of
`AGENTS.md` still governs whatever ADR 0097 eventually puts on screen.

---

**Proposed, 2026-09-12. Not self-approved.** *(The state of this document before
the ruling above.)*

**The scope ruling is the owner's and covers only the filing**, in the clickable
option they chose on 2026-09-12 — *"Dwa ADR-y: 0110 i 0111 (rekomendacja)"*
("Two ADRs: 0110 and 0111 (recommendation)") — with the weaker provenance
disclosed in ADR 0110's Status block and not repeated here. **Nothing below is
accepted.**

**What is already the owner's decision, and what this document may therefore
assume.** ADR 0097 was **accepted on 2026-09-05 together with Option A** — a
per-room-instance condition overlay riding the delta channel. So *whether* to
mark room condition on the map is settled. This document is about the one thing
Option A's costing assumed and did not have.

**No player-facing string is authored here.** Nothing in this document reaches a
player; a mark that does is ADR 0097's to define, and ADR 0097 §9 already lists
what it owes.

## Claim tiers used below

- **MEASURED** — produced by a run of a committed instrument, or quoted from a
  merged research record that says how it was produced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`, and
  where the claim rests on the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form.
- **REASONED** — derived from code that was opened, without a run behind it.

---

## Context

### 1. The hole, in one sentence, and who found it

ADR 0097's Option A was accepted and has never been built. Its §8 costing
assumed the renderer could be handed a per-room-instance mark because the
painter *"already draws a boundary of exactly this kind"* for owned land. The
amendment merged as [#1146](https://github.com/woogitsu/lockstate/pull/1146)
established that this proof does not carry: the owned-land outline is drawn from
a **per-tile boolean**, the same shape `room-labels.ts` uses for a room's
**type**, and neither can tell two adjacent instances apart.

`The renderer has no room-instance identity.`
(verbatim in `src/rendering/world/room-labels.ts`)

That amendment pinned its own consequence as a passing assertion rather than a
comment: `tests/unit/rendering-room-labels.test.ts:106-122`, *"gives two
adjacent rooms of the SAME type one name, and it is true of every tile under
it"*, which was re-run for this document — `Test Files 1 passed (1)`,
`Tests 14 passed (14)` — and which asserts two adjacent `zoning: 1` rectangles
produce **one** placement with `tileCount: 12`.

So Option A needs a transport that does not exist, and the amendment deliberately
declined to invent one in wiring code. **This document is that transport
decision and nothing wider.**

### 2. What crosses the boundary today, exhaustively

VERIFIED, read. Two channels reach the renderer, with different freshness, and
the whole cost question turns on which one a rectangle rides.

- **Actors** arrive unsolicited on `simulation/delta`, at a 100 ms ceiling, as a
  transferred array buffer. Its decode is **flat in population**: 0.0049 ms at
  500 prisoners against 0.0051 ms at 5,000 (`docs/RENDERING.md:264,289-293`),
  because the array-buffer transport skips the JSON walk entirely.
- **Geometry** — `world` and `structures`, everything the tile layer draws —
  arrives only in reply to `simulation/request-snapshot`, carrying a whole
  `SessionSnapshotBundle`. Its decode is **not** flat: 10.40 ms → 44.53 ms
  across the same two tiers. Measured against the renderer's own decode of the
  same bundle, that boundary pass is **97% of the main-thread poll**, and the
  `isJsonValue` walk is what dominates it — 9.79 ms of the 10.40 at the smaller
  tier (`docs/RENDERING.md:262-272,299`).

`RenderFrame` is the single seam between them and the painter, and it carries
four fields — `revision`, `world`, `structures`, `actors`
(`src/rendering/feed/render-feed.ts:91-118`) — with a docblock that says why the
seam is one:

> **Six since this decision was implemented on 2026-09-19**, and the count is
> corrected here rather than overwritten (`docs/AGENT_WORKFLOW.md` §4): `rooms`
> is decision 1's payload and `roomConditions` is decision 2's. The sentence
> below is unchanged and is what both of them ride through.

`A feed is a one-way valve: it turns snapshots the simulation published into immutable view data.`
(verbatim in `src/rendering/feed/render-feed.ts`)

### 3. The geometry pull is not 30 seconds stale for this, and that corrects ADR 0097's own list

**This is the finding that decides the recommendation, so it is evidenced in
full.**

ADR 0097 §5 says of `SimulationSnapshotFeed`: *"`dirty` is set at exactly five
places in that file, and they are worth listing because the list is what decides
the cost of every option below"*, and lists `:243`, `:279`, `:304`, `:311` and
`:361`. **VERIFIED, read: it is six places, and not one of those five line
numbers is still right.** The current set, each opened:

| line | what sets it |
| --- | --- |
| `:308` | `simulation/ready` |
| `:345` | the clock *transition* into running |
| `:370` | an unsolicited `clock-state` reaching the awaited command tick |
| `:377` | a `command-result` with status `queued` |
| `:428` | a request presumed lost |
| `:560` | **ADR 0099's world-revision marker moving, read off a delta** |

**The sixth is the one ADR 0097's list does not have, and it is the one that
matters here.** Its own comment states the cost of getting it wrong:

`The unconditional form of this line -- marking dirty on every delta rather than on a marker that moved -- is a snapshot request at 10 Hz and is worse than the defect.`
(verbatim in `src/rendering/feed/simulation-snapshot-feed.ts`)

And the marker moves on exactly the write that creates or destroys a room
rectangle. `SparseWorld.setZoning` (`:558-562`) calls `markContentChanged`,
which calls `markDrawnWorldChanged()` at `src/simulation/world/sparse-world.ts:908`,
under a comment naming the reason:

`ADR 0099 decision 3's first bullet, met at the one place all four of them already converge.`
(verbatim in `src/simulation/world/sparse-world.ts`)

**So room-instance rectangles are not subject to ADR 0097 §5's 30-second
staleness bound.** They change when zoning changes, zoning moves the marker, the
marker sets `dirty`, and the pull fires. `DEFAULT_POLL_INTERVAL_SECONDS = 30`
(`src/rendering/feed/simulation-snapshot-feed.ts:131`) is a consistency net
underneath that, not the refresh rate.

**ADR 0097's decision 2 survives this intact and must not be read as weakened.**
Its argument is about a *condition* cue — occupancy, reachability, requirement
satisfaction — and none of those is a drawn-world write, so none moves the
marker. Geometry is prompt; condition is not. **That is precisely why they are
two payloads on two channels and not one**, which is decision 2 below.

### 4. What the main thread already has, and what it does not

VERIFIED, read, and this was the highest-value question asked of this
investigation because a cheap answer would have changed the option space.

`RoomListRowViewModel` (`src/simulation/presentation/room-projection.ts:345-353`)
carries `instanceId`, `roomCatalogId`, an optional `roomNameKey`, an optional
`category` and **`anchorTile`** — one point, the north-west corner — alongside
occupancy and requirement data. `HudRoomNeedViewModel.tile`
(`src/ui/hud/view-model.ts:1297-1305`) and `HudRoomAtCapacityViewModel.tile`
(`:1335-1343`) carry the same single point.

**`width` and `height` appear nowhere on any of them.** The rectangle is built
worker-side by `roomBoundsOf` and consumed internally to produce the
`access` field, and is never itself published.

**So identity is already on the main thread and geometry is not.** The gap is
two numbers, not a concept — but it is two numbers on the wrong side of the
`RenderFeed` seam, which is what §5 is about.

**And on the simulation side those two numbers are themselves optional**, which
any transport has to handle rather than assume away. `RoomInstance.width` and
`RoomInstance.height` are declared `?`, and the field's own comment says why:
*"Absent for an instance restored from a save written before bounds were
recorded."* (`src/simulation/prisoners/room-instance-registry.ts:79-82`). So a
V4 save restores instances that have an anchor and **no rectangle at all**, and
`room-projection.ts` already branches on exactly that before projecting a room's
contents. A rectangle channel therefore publishes **rows for the instances that
have one**, and a renderer reading it must treat a missing instance as "no mark
available" rather than as "no room" — the same degrade-to-absence discipline
ADR 0110 decision 2 adopts for its own map, and for the same reason: an absent
answer is recoverable and a guessed one is not.

### 5. The wire tolerates this for free, which is the surprising half

VERIFIED, read, and confirmed by direct execution against the pinned `zod@4.4.3`.

Two layers, with opposite tolerances, and conflating them is how a costing goes
wrong:

- **Breaking on add:** the protocol envelope and every message-kind payload
  schema in `src/simulation/protocol/types.ts` are `.strict()`, and so is
  `statusCountsSchema` (`src/simulation/protocol/types.ts:710`). An unlisted
  field fails closed as `invalid-payload` —
  `tests/contract/simulation-worker-protocol.test.ts:639-645` pins exactly that
  with an `x: 100`, and zod's own message for it at this version is
  `Unrecognized key: "x"`.
- **Free on add:** everything riding `versionedPayloadSchema`'s generic
  `data: jsonValueSchema` — which is the 13 non-status-strip HUD projections
  **and the whole `SessionSnapshotBundle` geometry pull**.
  `SessionSnapshotBundle` is a plain TypeScript interface
  (`src/simulation/runtime/restore-session.ts:22`), not a zod object; the wire
  check on `simulation/snapshot`'s `data` is the same generic structural pass,
  and `WorldRenderView.fromSnapshot` reads the fields it wants and ignores the
  rest.

**So neither realistic option forces a version bump or a schema edit.** Not
`HUD_VIEW_MODEL_SCHEMA_VERSION` (`src/simulation/presentation/view-model.ts:25`),
not `SIMULATION_PROTOCOL_VERSION`, and — as ADR 0097's Option A already
priced — not `SAVE_SCHEMA_VERSION`, because nothing here is persisted. **The
entire cost of either option is application code.**

### 6. The channel that looks right and is dead

VERIFIED, read, and recorded because the next person to design this will find it
by name and assume it.

`world/render-snapshot` is a registered projection with its own schema id and
its own version (`src/simulation/presentation/world-projection.ts:6-7`), and its
catalog entry explains the independence:

`Its own version, not the HUD's: this projection predates the read-model layer and versions independently of it.`
(verbatim in `src/simulation/worker/projection-catalog.ts`)

**Nothing consumes it.** `src/ui` and `src/rendering` were swept for
`world/render-snapshot` and `projectWorldForRendering`: **zero** matches in
either tree; the only files naming them at all are the codec, the projection
itself, the protocol types and the catalog. The world data the painter actually
draws comes through `simulation/request-snapshot`, not through the projection
catalog.

**It is not proposed here**, and §7 Option D says why that is a decision rather
than an oversight.

### 7. What is not known, said rather than estimated

**How many room instances a real prison has.** The largest committed fixture —
`tests/perf/fixtures/prison-fixture.ts`'s x-large tier, 1,024 loaded chunks,
1,024×1,024 tiles, 3,000 prisoners — paints zoning **directly onto the world
plane** and never issues a `ZoneRoom`, so it registers **zero** `RoomInstance`s
despite looking room-shaped. Every fixture that zones real rooms is a small
per-test one.

So the payload size of a rectangle set is **arithmetic, not measurement**, and
this document declines to dress it otherwise: one instance is an id plus four
numbers (`src/simulation/prisoners/room-instance-registry.ts:75-84`), and the
count is unknown. What *is* measured is the walk it would join —
10–45 ms per full-bundle decode, dominated by `isJsonValue` (§2) — so the honest
statement is that a rectangle set is a **marginal addition to an already
expensive walk whose size nobody has measured at realistic scale**.

**There is also no renderer frame budget to check it against, and a costing that
cites one is citing the wrong number.** No "20 Hz / 50 ms" renderer budget
exists: that figure is the simulation kernel's tick. `docs/RENDERING.md`'s
contract is a per-operation cost table (chunk paint 73.25 µs, `buildRowIndex`
74.83 µs, `mergeFloorRects` worst case 141.42 µs, `docs/RENDERING.md:86-97`),
and `TileLayer.update` is called from Phaser's own per-rendered-frame callback —
display refresh rate, not 20 Hz — staying cheap only because of its early-out on
an unchanged revision (`src/rendering/phaser/tile-layer.ts:139-147`).
`tests/perf/` does not help: MEASURED by running it here, `pnpm test:perf` is
**4 files, 36 tests, 108.30 s**, every one of them persistence, localization or
reachability, and **none** importing anything from `src/rendering/`. (The wall
clock tracks the machine, not the code — a run on a container shared with four
agents gave 141 s for the same 36. `AGENTS.md`'s 2026-09-09 entry records this
harness at **35** tests, which was right when written; the count is the kind of
sentence `docs/AGENT_WORKFLOW.md` §4 says rots first, and it has.)

---

## Decision

### 1. The rectangle rides the geometry pull, not the HUD projection

**Recommended.** `RenderFeed` is the painter's only seam (§2), and it is a
deliberate one-way valve enforcing `AGENTS.md` boundary 1 in code rather than by
convention. Feeding the painter from a cache populated by a *pulled, paged HUD
projection* would give it a second input with different freshness, different
paging and no revision discipline — which buys two numbers at the price of the
architecture's clearest seam.

The geometry pull is also **cadence-matched for free** (§3): room rectangles
change exactly when zoning changes, and zoning already moves the marker that
fires the pull. No new trigger has to be invented, and none should be.

### 2. The condition ordinal stays on the delta channel, unchanged

**Recommended, and it is a restatement rather than a new decision.** ADR 0097
decision 2 requires it, §3 shows the reason survives this document's correction
to that ADR's list, and the two payloads have genuinely different freshness
needs: geometry changes on a player gesture, condition changes because the
simulation ticked.

**So Option A is two payloads on two channels**, and any proposal to collapse
them into one is proposing that a condition cue inherit the geometry cadence —
which is ADR 0097 §5's rejected case wearing a different hat.

### 3. Publishing the rectangle does not, by itself, license drawing anything

**Recommended, and it is the half that keeps this bounded.** This decision adds
`width` and `height` to a payload. What is drawn with them, whether a mark at a
room's boundary is legible, and what it claims to a player are ADR 0097's and
ADR 0101's, not this document's. A transport that quietly arrives with an art
decision attached is how the two ADRs' scopes merge by accident.

---

## Options, with their real costs

### Option A — extend the geometry snapshot's world section

**What it is.** Room-instance rows — id, anchor, width, height — added to the
`SessionSnapshotBundle` the geometry pull already carries, read by
`WorldRenderView` (or a sibling view) and surfaced on `RenderFrame`.

**Cost.** No wire change and no version bump (§5). One new field on a view the
painter already receives, its `fromSnapshot` reader, and its tests. Bytes on a
JSON walk already being paid, of unknown magnitude (§7).

**What it buys.** Option A of ADR 0097 becomes buildable, on the seam the
renderer already has, at the cadence it already has.

**What it does not solve.** The condition ordinal, which is decision 2's
separate payload.

### Option B — extend `RoomListRowViewModel` with `width`/`height`

**What it is.** Two fields on the HUD projection that already carries
`anchorTile`, with the painter reading a main-thread cache the HUD fills.

**Cost.** Smaller in the projection — the fields are two lines — and larger
everywhere else: a second input to the painter, paging semantics the painter
must not care about, and the `RenderFeed` seam no longer being the whole story.

**Worth having anyway, for a different reason.** Two numbers on that row make a
HUD *"show me this room"* affordance exact rather than anchor-only. That is a
real, small improvement with a real consumer, and it is **not** this decision.

### Option C — a new message kind for room geometry

**What it is.** A dedicated channel, versioned on its own.

**Cost.** The one thing §5 shows is genuinely expensive: a new envelope member
is `.strict()` and therefore a protocol change. **Not recommended** — issue #104
is exactly the shape this repeats, and `projection-catalog.ts`'s docblock records
the lesson that the protocol should grow with the boundary rather than with the
read model.

### Option D — revive `world/render-snapshot`

**What it is.** Use the projection that already means "the world, for drawing"
(§6), and add room rectangles to it.

**Cost.** Unknown, and that is the objection. It has no reader, and nothing in
the repository records why. **Not recommended without first establishing that**,
because adopting an orphan is how a second world channel is acquired by
accident. Worth an issue on its own terms: a registered, versioned, tested
projection nothing consumes is either a gap or a deletion.

---

## Consequences if this stands

- **ADR 0097's Option A becomes implementable** without a further architecture
  decision, which is the whole purpose.
- **ADR 0097 §5's list is corrected** by §3 here. Per `docs/AGENT_WORKFLOW.md`
  §4 both directions are marked rather than overwritten: that ADR gets a pointer
  to this section, and its own text stays.
- **Nothing persisted moves**, so `AGENTS.md` reservation 2 is untouched and so
  is `SAVE_SCHEMA_VERSION`.
- **`world/render-snapshot` stays orphaned** and gets an issue rather than a use.

## Open questions

1. **Does the rectangle set belong on `WorldRenderView` or beside it?** The view
   is per-tile by construction; rooms are not. A sibling field on `RenderFrame`
   may be the cleaner shape, and this document does not settle it because it is
   an implementation choice the ADR does not need to make.
2. **What is the real instance count at scale?** §7 says nobody knows. A fixture
   that zones rooms at scale would answer it and does not exist.
3. **Does `revision` need to bump when only rectangles change?** `TileLayer`
   repaints on revision, and a rectangle change that repaints every tile is a
   cost with no pixel behind it.

## The weakest claim in this document, named

**That riding the geometry pull is prompt enough.** §3 proves the marker moves on
a zoning write and that the pull follows — but "follows" is via the next delta,
so the true latency is bounded by the delta ceiling plus one round trip, and
**that figure has not been measured end to end.** Nobody has timed zoning-gesture
to repainted-rectangle. If it turns out to be visibly laggy on a gesture the
player just made, Option A's cadence argument weakens and the condition channel
starts to look like the right home for both payloads after all.

Second weakest: §7's "no fixture registers room instances at scale" rests on
reading one fixture generator and a grep, not an exhaustive sweep of every
committed save fixture.

## What would falsify each, and what has not been run

| claim | falsifier | run? |
| --- | --- | --- |
| The renderer cannot tell two adjacent same-type rooms apart | run the pinned room-labels assertion | **Run** — `14 passed (14)`, one placement for two rectangles |
| `dirty` is set at six places, not five | open every `this.dirty = true` in the file | **Run** (§3) — six, none at ADR 0097's cited lines |
| Zoning moves ADR 0099's marker | follow `setZoning` to `markDrawnWorldChanged` | **Run** (§3) — `:558` → `markContentChanged` → `:908` |
| The snapshot payload tolerates an added field | check `SessionSnapshotBundle` for a strict schema | **Run** (§5) — a plain interface, no zod |
| The envelope does not | decode a message with an extra key | **Run** (§5) — `invalid-payload`, `Unrecognized key: "x"` |
| `world/render-snapshot` has no reader | sweep `src/ui` and `src/rendering` | **Run** (§6) — zero matches |
| `tests/perf/` does not cover the render path | run it and read what it reports | **Run** (§7) — 36 tests, all persistence-shaped |
| **Riding the pull is prompt enough for a gesture** | **time a zoning gesture to its repaint in a browser** | **NOT RUN — this is the weakest claim above, and the instrument does not exist** |

**The unrun row is the one that should decide whether this is accepted now or
after a measurement**, and it is named here rather than discovered later because
that is the habit ADR 0108 paid for.

## What would change my mind

- **A measured gesture-to-repaint latency that reads as laggy.** Then decision 1
  is wrong and both payloads belong on the delta channel.
- **A reader turning up for `world/render-snapshot`.** Option D stops being an
  orphan adoption.
- **A real instance count large enough to matter** against the 10–45 ms walk.
  Then the JSON pull is the wrong carrier for it regardless of cadence, and the
  array-buffer route the actors already use becomes the question.
- **ADR 0097 being revisited.** This document exists to serve its Option A; if
  that option is withdrawn, the transport has no consumer and should not be
  built.
