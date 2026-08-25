# Lockstate static review — 2026-08-25

Snapshot: `74446fb1ba5083cdb24d8ef9380d31e94c2373cc`, tag `v0.0.66`.

This review follows `REVIEW-BRIEF.md`'s own format and tier discipline, and is
ordered by severity. It has one advantage the four external reviews of the same
snapshot did not: **the code was run.** Where a claim below is a measurement, the
measurement is quoted rather than described.

Tiers, as the brief defines them: **VERIFIED** — the cited lines were opened and
read, or the number was measured. **INFERRED** — traced across files with one
link a judgement call, and the link is named. **UNKNOWN** — could not be
established, with what would settle it.

---

## Findings

### 1. A room's concurrent-use ceiling counts every object, so 19 diners fit into 14 seats

**Tier:** VERIFIED (measured) · **Category:** correctness / content
· **Where:** `src/simulation/objects/room-capacity.ts`, `findAvailableForUse`
· **Filed as:** [#326](https://github.com/matmaxalez/lockstate/issues/326)

`deriveRoomCapacity` sums `footprint.width` over **every** recognised object for
`concurrentUseCapacity`; only `residentCapacity` filters on a capability:

```ts
concurrentUseCapacity += definition.footprint.width;
if (definition.capabilities.includes(SLEEP_SURFACE_CAPABILITY)) {
  residentCapacity += definition.footprint.width;
}
```

`findAvailableForUse(roomCatalogId, capability)` then checks two things that do
not match each other: the capability must be present *somewhere* in the room,
and the headcount is compared against the all-objects total. A
capability-specific question is answered against a capability-blind ceiling.

**Measured**, by driving the real `zone` → `resolveInstance` →
`findAvailableForUse`/`claimUse` path. ADR 0028's own worked example is a canteen
with 2 dining tables and 4 benches, which it says seats 14. It does. Add four
toilets and a storage rack to that same canteen and ask what `action.eat-meal`
asks:

**19 diners are admitted into 14 seats.**

The same measurement on an empty 8×8 yard — the smallest the zoning gate permits:

| what is in the 8×8 yard | concurrent users admitted |
| --- | --- |
| nothing | 0 |
| one toilet | 1 |
| **one loading-dock door** | **3** |
| four benches | 8 |

A delivery door grants three prisoners outdoor exercise while 64 tiles of open
ground grant none.

**The only test touching this case describes it backwards.** In
`objects-room-capacity.test.ts`:

```ts
// Two sleep surfaces of width 1 each, and the toilet counts toward neither
expect(residentCapacity).toBe(2);
expect(concurrentUseCapacity).toBe(3);
```

The toilet is exactly the difference between 2 and 3. The comment asserts the
property the numbers falsify, and the test passes, so nothing caught it.

**Proposed fix:** make the ceiling capability-scoped — sum `footprint.width` over
objects carrying the capability being asked for. That preserves every property
ADR 0028 actually defends (nothing authored anywhere, footprint-derived,
event-driven, orientation-blind) and the canteen seats 14 regardless of its
toilets. The yard then falls out as a derivation rather than an exemption: an
action requiring no capability has no object-derived ceiling. This changes a rule
ADR 0028 states verbatim, so it wants an ADR amendment, not a decision inside
implementation code.

**What would change my mind:** a single sentence anywhere arguing the floor-space
position — that a room holds N bodies whatever the furniture. None was found, but
the search was for an argument rather than for its absence, and an absence is the
weaker finding.

---

### 2. `door-wooden` takes a wood plank and places nothing, and the repository knows

**Tier:** VERIFIED · **Category:** unreachable-content
· **Where:** `src/simulation/construction/definition.ts:44-50`, and the comment
above `edgeNumericIdFor` at `:254-282`

`door-wooden` is a buildable with `workRequired: 30` and
`materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }]`, and **no
`placesObjectId`**. The declaration comment says absent means "this buildable
places no object … and what `door-wooden` still means".

This is not my inference. The repository states it, in the comment above
`edgeNumericIdFor`:

> **The placement model now exists and `door-wooden` still does nothing** … So
> `door-wooden` is left exactly as it was found, with no `placesObjectId`, and
> **the defect is still open.**

The reason it was left is sound and worth preserving: a door is `category:
'object'` and deliberately not written as an edge, because an edge is opaque to
`TopologyManager`, so recording a door as one would seal the room it is supposed
to open. `object-catalog.ts` declares no wooden door —
`object.loading-dock-door` is a three-tile delivery door with a
`'delivery-access'` capability, not this one. A door's own state belongs in
`DoorRegistry` (`src/simulation/navigation/door.ts`).

**Concrete failure:** a player buys and completes a `door-wooden` order, paying a
wood plank and 30 work, and nothing in the simulation changes. Rooms stay sealed
or open exactly as if no door had been built, and navigation cannot distinguish a
door tile from a wall.

**Proposed fix:** add an `object.door.wooden` catalogue entry, connect it via
`placesObjectId`, and register a completed order with `DoorRegistry` so topology
and navigation see a passable opening. That is a phase of its own, not a line —
which is why the existing comment declined to smuggle it in.

---

### 3. A refused command routed to the alerts list is invisible by default — at every viewport, not only on a phone

**Tier:** VERIFIED · **Category:** correctness / interface
· **Where:** `src/ui/hud/hud.ts:699-709`, `src/ui/hud/hud.css:1282`

The repository has already measured this, for two other message classes, and
states it:

> - **It is there at every viewport.** `hud.css` drops `.hud__corner` entirely at
>   720px and below, so a message routed to the alerts list does not exist on a
>   phone at all.
> - **It is there without being opened.** The alerts section starts folded
>   (`INITIAL_HUD_SHELL_STATE`) and `createCollapsibleSection` sets `body.hidden`
>   while it is, so a row appended to that list is `offsetParent === null` with a
>   0×0 box on *every* viewport, not only on a phone. Measured in Chromium at
>   1280×800 and at 375×812 … `.hub` innerText did not contain the sentence at
>   either size (#220).

`.hud__unavailable` and `.hud__refusal` were each given their own band outside
`.hud__corner` for exactly this reason. **The fix was per-message-class, not
structural**, so every new refusal path re-opens the same hole. Object removal,
added in #328, routes its worker-side refusal to the alerts list.

**Concrete failure:** a player on a phone presses Remove on an occupied cell's
bed. The worker refuses. Nothing appears. The control looks broken rather than
refused.

**Proposed fix:** the structural version of #220's fix — route worker refusals to
the `.hud__refusal` band that already exists and is already visible at every
viewport, rather than adding a third hand-placed element the next command class
will also have to remember.

**Weakest part of this finding:** I verified the routing and the CSS, and I did
not re-run the 375×812 measurement myself. The quoted measurement is the
repository's own, from #220.

---

### 4. `occupantsOf` returns insertion order, and the code says nothing will remind the next caller

**Tier:** VERIFIED · **Category:** determinism
· **Where:** `src/simulation/prisoners/room-instance-registry.ts:325-335`

Quoted from the method's own comment:

> The order is not stable across a save: live insertion order is [not what a
> restore produces] … A consumer that folds occupant data in [that order] … as
> the shape a text scan cannot see — so the sort is the consumer's
> responsibility and **nothing will remind it.**

`findBestAvailable` is the current caller and it does sort ascending by entity
id, so **the code is correct today**. It is fragile by construction, and the
comment says so more plainly than I would have.

The line that matters most is "the shape a text scan cannot see": the repository's
canonical-iteration gate
(`tests/determinism/canonical-iteration-contract.test.ts`) is a text scan, so
this hazard is outside what that gate can catch by design.

**Concrete failure:** a new system that treats the first returned occupant as a
leader, claimant or tie-break winner behaves one way in a continuous session and
another after save/load, with identical authoritative state.

**Proposed fix:** sort inside `occupantsOf`, or split it into a plainly-named
unsorted internal accessor and a sorted public one, so a new caller has to opt
into the danger rather than stumble into it. The cost of sorting here is a sort
per call on a collection bounded by room capacity.

---

### 5. ADR 0016's production safety boundary is enforced by nothing but prose

**Tier:** VERIFIED · **Category:** security / process
· **Where:** `docs/adr/0016-migration-delivery-mechanism.md:108-111`

Quoted:

> Recorded as a constraint precisely because nothing enforces it mechanically.
> [Repointing the integration is a] two-click change in a dashboard, with no code
> review and no trace in this repository. The only defence is that it is written
> down as forbidden.

Staging migrations apply automatically on merge, by design. Production is
supposed to be a separate Supabase project that the integration never targets.

**Concrete failure:** an operator repoints the integration from staging to
production in the dashboard. Every subsequent merge to `main` applies irreversible
migrations to the production database, and there is no signal anywhere in this
repository that anything changed.

**Why it stays on the list even though it is documented:** the brief asks for
claims in docs to be checked against real enforceability. This one is honest about
being unenforceable, which is better than most, and it is still the largest
single-action irreversible risk in the repository.

**Proposed fix:** an independently reviewable external control — a periodic
captured project-ref audit in deployment operations, so a change of target leaves
a trace someone reads. Not a code change, and worth an owner decision rather than
an agent's.

---

### 6. `protocol/handshake` can be received but is never sent

**Tier:** VERIFIED · **Category:** pipeline / stale-claim
· **Where:** `src/simulation/protocol/types.ts:7,203-206`,
`src/simulation/worker/state-machine.ts:472,502`, `worker-channel.ts:24`

`protocol/handshake` has a schema, a `MainToWorkerMessage` member, a
`transferables` case, a `state-machine` dispatch case at `:472` and a
`handleHandshake` at `:502` that faults with `already-initialized` if the worker
is past handshake and replies `protocol/handshake-accepted`. **No sender exists
under `src/`** — every occurrence outside the protocol and worker directories is
prose in a comment. `worker-channel.ts:24` records that the channel accepts
`simulation/initialize` only while the worker is `uninitialized`, and that is
what the startup path actually sends.

So the receiving half is complete and the sending half does not exist. This is a
live, correctly-labelled gap rather than a defect —
`tests/foundation/message-kind-reachability-contract.test.ts` already records it
and names the decision as still open. It is listed here because the
architecture description in circulation says the protocol "has a startup
handshake", and a reader who takes that as *in use* would be wrong.

**Proposed fix:** either wire it through the real startup path, or state in the
architecture docs that `simulation/initialize` is the first exchanged message and
the handshake is reserved. The reachability gate already fails if the situation
changes without the list being updated, which is the right guard.

---

## Claims from external reviews that do not survive

Four external reviews of this snapshot were adjudicated. Three claims fail, and
they are recorded because a wrong finding costs more to dismiss than a missing one.

**`MAX_ZONE_DIMENSION_TILES` is not duplicated in the renderer.** The claim was
that renderer picking helpers hold their own copy of the zoning limit, so a
change in simulation would leave the renderer previewing areas the kernel cannot
commit. Checked: the constant is defined **once**, at
`src/simulation/rooms/zoning.ts:128`, and imported by
`src/simulation/protocol/commands.ts:6` where it bounds the command schema at
`:77-78`. `src/rendering/build/area-picking.ts:46` *mentions* it in a comment
explaining why the picker does not need its own bound. A comment referencing the
single definition is the opposite of a second copy. **REFUTED on its own
example.**

**ADR 0027 did not reject cell sharing.** Its status line reads: *"Accepted,
2026-08-25 — as the mechanism and the boundary, not as an answer to the three
questions."* A review used "0027 evaluated and rejected cell sharing" as the
reason to caution against its own overcrowding proposal, so the caveat rests on
reading the status backwards. **REFUTED.**

**The deploy did not build a different commit than CI judged.** An audit reported
Deploy run `head_sha 74446fb` against CI `head_sha c195055` as evidence that the
release shipped unverified. The job log for that run shows
`ref: c1950552…`, `git checkout --force c1950552…`, and
`git log -1 --format=%H` → `c1950552…`. It built exactly the commit CI passed. A
`workflow_run` run's `head_sha` metadata is the default-branch head at dispatch,
which after `version.yml`'s bump is always a `chore(release)` commit; the pattern
is identical across all 169 Deploy runs. **REFUTED.** The real hole was that
nothing *asserted* the `ref:` expression, which #327 has now closed with ten
mutations each observed red.

One further correction, to a premise this project itself circulated: **`room.yard`
is not "capacity 0 permanently"**. Finding 1's measurements disprove it. That
false premise had already sent one research effort in the wrong direction before
it was measured.

---

## What I could not assess

Silence here would read as a clean bill of health and would be a false one.

- **The V1→V5 save migration chain was not traced end to end.** I read no
  migration step in this pass. Save/load asymmetry is the brief's second
  priority and it is substantially unexamined here.
- **`supabase/` was not reviewed.** No RLS policy was read. `docs/CLOUD_SAVE.md`
  states that the twelve `20260824` migrations were executed only against plain
  PostgreSQL scratch environments and not applied to hosted staging, and that
  `SupabaseCloudSaveClient` behaviour against a real database is not unit-tested
  — I did not verify either statement.
- **No vacuous-test sweep was run.** The one vacuous test named in Finding 1 was
  found through a capacity measurement, not through a sweep of the suite. 198
  test files were not read.
- **The command pipeline was not audited end to end**, from intent through
  validation to application. Finding 6 covers one message kind.
- **`src/simulation/navigation/` was not read.** Flow-field caching and path
  budget scheduling are plausible determinism surfaces and are untouched here.
- **No content-reachability sweep across `src/content/`.** Finding 2 is one
  buildable, found by following an external reviewer's lead.

## Suspicions I could not confirm

- **`FixedStepClock` throws `RangeError('Clock input must be monotonic.')` at
  `fixed-step-clock.ts:66` when `elapsed < 0`.** The guard is real and I read it.
  Whether any caller can actually deliver a non-monotonic timestamp — a suspended
  and resumed tab, a reused frame timestamp — I did not establish, and the
  external claim that a shell race can do so was asserted without a caller trace.
  What would settle it: read every caller of `pump` and check what clock source
  each passes.
- **`SearchSystem` restore appears to discard in-flight dwell progress** —
  `getSnapshot` persisting neither `state` nor `dwellStartedAtTick` while
  `loadSnapshot` rebuilds every job as `travelling`. Reported by an external
  reviewer with quoted field lists; I did not open the file. What would settle
  it: read `search-system.ts`'s snapshot pair and check whether a test pins the
  bounded extra delay its comments claim.
- **Whether other public accessors share `occupantsOf`'s shape** — returning
  insertion order under comment-level protection only. Finding 4 is one method
  and I did not sweep for siblings.

## My weakest load-bearing claim

**Finding 1's classification, not its measurement.** The numbers are measured and
I stand behind them: 19 into 14, and 3 concurrent users from a loading-dock door
in a yard. What is a judgement is calling the capability-blind ceiling a *defect*
rather than a deliberate floor-space abstraction. The evidence for "defect" is an
absence — nobody wrote the floor-space argument down, in the ADR or at the code —
and an argument from absence is the weakest kind. A single sentence anywhere
defending "a room holds N bodies whatever the furniture" would move this from a
defect report to a design disagreement, and I would say so.
