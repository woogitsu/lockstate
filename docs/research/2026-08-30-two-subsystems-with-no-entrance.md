# Two subsystems with no entrance: the utility networks and the parcel economy

**Date:** 2026-08-30
**Tree:** `898a16a` (`chore(release): v0.0.252`), worktree on branch
`agent/648-649-settle`
**Questions put to this record:**
[#648](https://github.com/matmaxalez/lockstate/issues/648) — both
`UtilityNetwork`s have no caller in `src/` in any commit on any branch, yet
both are snapshotted and restored.
[#649](https://github.com/matmaxalez/lockstate/issues/649) — the parcel
land-purchase economy is uncalled except `registerParcel` from `fromSnapshot`,
so the only thing that puts a parcel in the world is restoring a save that
already had one.

Each issue asks the same question, in the shape
[#642](https://github.com/matmaxalez/lockstate/issues/642) set: **is a producer
missing, or was the feature abandoned?** — and each warns, correctly, that #642
looked abandoned and was not.

**Both answers: the half that is missing was never written. Neither feature was
ever abandoned, and no commit on any ref has ever removed a producer, a
consumer or a command for either one.**

- **#648 — utilities.** The missing half is a **producer**, and there is a
  second absence #648 does not claim and this record adds: **the consumer is
  missing too.** `evaluate()` has no caller either, so a populated network
  would still change nothing. Utilities are a *substrate shipped ahead of its
  systems*, exactly as its own commit message says, and the roadmap still
  carries the phase they belong to.
- **#649 — parcels.** The missing half is a **command**. The consumer half is
  fully live — `isTileOwned` is consulted on every build, zone and object
  placement, and the renderer outlines owned land — and the producer half is
  one line of world generation. What has never existed on any ref is a
  `PurchaseParcel` command, and **two Accepted ADRs already name it by that
  name as the thing that is absent.**

**No file under `src/` was modified.** Building either producer, deleting
either subsystem, and setting any price are all the owner's under `AGENTS.md`.

---

## 0. Tiers, and how to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line and the line is quoted,
  or the command was run in this worktree and its output pasted.
- **DERIVED** — a conclusion drawn from VERIFIED facts, stated so the step can
  be checked separately from the facts.
- **UNKNOWN** — could not be established.

Every `file:line` below was opened on `898a16a`. Per `docs/AGENT_WORKFLOW.md`
§4, code is cited by `file:line` because grep checks it, and prose is quoted
because a line number into a document under edit is the least durable citation
here.

**Both issues cite `cd2c7c5` and one of their citations has moved.**
`utility-network.ts:40/:47/:57/:101` and `sparse-world.ts:521/:550/:621/:630`
are all exact on `898a16a`. The sweep's `new-session.ts:657-658` is now
`:690-691`. Nothing else moved.

---

## 1. #648: what #25 shipped, and what it said it was not shipping

### 1.1 The absence, re-measured rather than carried — VERIFIED

```
$ grep -rn "addNode" src/
src/simulation/operations/utility-network.ts:23: * `addNode`/`connect`/`setFailed` bump a revision counter checked by
src/simulation/operations/utility-network.ts:40:  public addNode(node: UtilityNodeDefinition): void {

$ grep -rn "\.connect(" src/
(no output)

$ grep -rn "setFailed" src/
src/simulation/operations/utility-network.ts:23: * `addNode`/`connect`/`setFailed` bump a revision counter checked by
src/simulation/operations/utility-network.ts:57:  public setFailed(nodeId: string, failed: boolean): void {
```

Across every ref in the repository (`git for-each-ref | wc -l` → **630**):

```
$ git log --oneline --all -S '.addNode(' -- src/
(no output)

$ git log --oneline --all -S 'addNode' -- src/
2da9cb3 Implement jobs, transactional inventory and utility capacity substrate (#25)
```

`2da9cb3` is the commit that *declares* the method. Widened off `src/` to the
whole tree, `.addNode(` names five commits and **every one of them is a test or
a document**: `2da9cb3` (#25's own unit tests), `b477b73` and `e9b70e4` (#375's
save round-trip), and `5b6bd06`/`c277864` (the #642 sweep record itself).

`git log --all --diff-filter=D -- src/simulation/operations/utility-network.ts`
returns nothing: the file has never been deleted on any branch.

### 1.2 The second absence, which #648 does not claim — VERIFIED

`evaluate()` (`src/simulation/operations/utility-network.ts:101`) has no caller
in `src/` either, and the whole module is referenced from exactly four places:

```
$ grep -rn "UtilityNetwork" src/
src/persistence/save-schema.ts:568          — the snapshot schema
src/simulation/runtime/session-systems.ts:21, :206, :218-219, :470, :586-587, :819-820
src/simulation/runtime/new-session.ts:44, :236-237, :690-691
src/simulation/operations/utility-network.ts:28  — the declaration
```

Construction, snapshot, restore. Nothing ticks either network and nothing reads
an answer out of one. **This is the sharpest difference from #642**, and it
cuts against the parallel the issue draws: `gang-retaliation`'s consumer
(`tryOpenRetaliation`, `trigger-system.ts:510`) runs in every session and finds
an empty registry, so building a gang producer would light it up. Here, a
producer alone would light up nothing — the answer `evaluate()` computes has
nowhere to go.

`docs/HUD_PROJECTIONS.md` already records the surface half of this, in its
numbered list of what the room projection cannot say:

> 17. **No room utility/power state.** `UtilityNetwork` nodes are ids with no
>     association to a room instance.

### 1.3 The introducing commit says it is a substrate, not a feature — VERIFIED

`2da9cb3`, 2026-08-23, closing
[#25](https://github.com/matmaxalez/lockstate/issues/25). Its message:

> Adds src/simulation/operations/: […] and a capacity-graph UtilityNetwork
> (electricity/water) with deterministic ascending-id allocation and
> revision-cached evaluation.

> createNewSimulationRuntime now wires ContainerRegistry/JobBoard/JobWorkerPool/
> JobSystem and **empty electricity/water UtilityNetworks, with no fabricated
> default content**.

> Verification: […] pnpm build (clean, bundle size unchanged since **this code
> is not wired into main.ts** -- no session UI exists yet, matching
> #19/#22/#24's precedent).

Emphasis added. Both halves of #648's finding are stated by the commit that
creates the thing: the networks are empty on purpose, and the code is
deliberately not wired to anything a player touches. The convention is the same
one #642 turned on, and the code still carries it beside the construction —
`src/simulation/runtime/new-session.ts:688-691`:

```ts
  // Empty until a session/scenario places real generators/consumers --
  // same "no fabricated default content" convention as `containers`/`jobs`.
  const electricity = new UtilityNetwork('electricity');
  const water = new UtilityNetwork('water');
```

`docs/OPERATIONS.md` repeats it in prose — *"No stock, no non-construction
containers, no registered job workers and no utility nodes exist until an
actual session/scenario creates them"* — and states the surface gap in its
out-of-scope clause: *"Nothing surfaces containers, jobs or the utility
networks."*

### 1.4 The word in #25's title is "foundation", and the roadmap phase is open — VERIFIED

#25 is titled *"[Operations] Implement jobs, logistics, inventories and utility
capacity **foundation**"*; `2da9cb3` calls it a *substrate*; `docs/OPERATIONS.md`
§"Utility networks" opens *"a capacity-bounded graph, explicitly **not** a
detailed electrical/hydraulic simulation (out of scope, per the issue)"*.

#25's acceptance criterion for this part is about *evaluation*, not population:
*"Electricity/water consumers respond to capacity/connectivity/failure state"*,
checked against `tests/unit/operations-utility-network.test.ts` — **12 tests**,
counted, matching #648's figure.

`docs/ROADMAP.md` Phase 7 ("Prison operations foundation") lists, as its last
bullet:

```
- utilities
```

That line was written in `f326407` (*"docs: add long-term execution roadmap"*,
2026-08-22 16:15 CEST), before any of the code. It has never been struck
through and no later document supersedes it.

### 1.5 The player-facing half that already ships, and does nothing — VERIFIED

Utilities are not invisible to a player. They are half-visible:

- `src/content/object-catalog.ts:116` —
  `object.utility-panel`, category `utility`, capability `['utility-control']`.
- `src/content/room-catalog.ts:185-189` — `room.utility-room` requires
  `{ type: 'object', objectId: 'object.utility-panel', minQuantity: 1 }`.
- `src/content/default-locale-en.ts:43`, `:64`, `:102` — *"Utility Room"*,
  *"Utility Panel"*, *"Utility"*.
- `src/content/default-locale-en.ts:1007` —
  `'save.scope.operations': 'jobs, containers and utility networks'`, which is
  what the save panel tells a player their file contains. It is true: the file
  does contain two empty networks.

So a player can build a Utility Panel, zone a Utility Room, see it reported
complete, and change nothing. `src/simulation/construction/definition.ts:588-598`
already argues that position for this exact capability group and four others,
and this record does not reopen it — it is quoted in the #642 sweep §3.3 and
stands.

**What is genuinely absent as content**, and is the reason the missing half is
larger than one call: `ObjectDefinition`
(`src/content/object-catalog.ts:60-94`) has `schemaVersion`, `id`, `numericId`,
`nameKey`, `category`, `footprint` and `capabilities` — and **no capacity or
demand figure**. Nor is there any producer-shaped object among the 20 in the
catalogue: no generator, no pump, no boiler. `UtilityNodeDefinition` needs a
`capacityOrDemand` number that nothing in `src/content/` currently authors.

### 1.6 No test asserts the emptiness — VERIFIED, and this is the other break from #642

#642's answer rested partly on a green test asserting the empty registry on
purpose. That test is `tests/unit/new-session-runtime.test.ts:123`, and it
covers **five** registries:

```ts
test('new-session runtime starts with no fabricated incident, gang or contraband content', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.incidents.all()).toEqual([]);
  expect(runtime.gangs.all()).toEqual([]);
  expect(runtime.tunnels.all()).toEqual([]);
  expect(runtime.contraband.all()).toEqual([]);
  expect(runtime.intelligence.all()).toEqual([]);
});
```

**Neither utility network is in it**, and no other test asserts that a new
session's networks are empty. The one test that does mention them does the
opposite — it fills them, because their emptiness had made the restore path
untestable. `tests/integration/session-save-round-trip.test.ts:363-382`:

> `runtime.electricity`/`runtime.water` are captured into every save and
> restored on every load, and **nothing anywhere populated them** -- no
> production path and no fixture -- so both were always empty on both sides of
> the boundary. Measured at v0.0.98: deleting the two `loadSnapshot` calls from
> `restoreSimulationRuntime` left **217 files / 2,463 tests green**.

That is #375's fourth shape, and `docs/TESTING.md` carries the same finding.
**The absence #648 reports has therefore already been measured once, from a
different direction, and cost a real guard.**

### 1.7 Settling #648 — DERIVED

The two candidate shapes #648 puts:

- **Abandoned.** Refuted. No producer or consumer for either network has ever
  existed on any of 630 refs (§1.1); the file has never been deleted; the
  commit that created it says the emptiness is deliberate (§1.3); and the
  roadmap phase it belongs to is still listed (§1.4). There is nothing to have
  been abandoned — nothing was ever built.
- **A producer is missing.** Confirmed, with an amendment: **a producer *and* a
  consumer are missing** (§1.2), and the content a producer would read does not
  exist either (§1.5).

**The missing half is a producer, not a command.** No new player gesture is
needed to reach it: `PlaceObject` already exists and already places
`object.utility-panel`. What is missing is the bridge — something that turns a
placed object into `addNode`/`connect`, and something that reads `evaluate()`
back out — plus the demand figures the catalogue does not author.

**Where the design decision would sit, without taking it:** the repository has
settled a structurally identical case once already, and the precedent is worth
naming rather than re-deriving. [ADR 0036](../adr/0036-a-derived-default-security-sector.md),
issue [#396](https://github.com/matmaxalez/lockstate/issues/396):

> nothing in `src/` registered a security sector in a new session.
> `securitySectors.register` had one call site, inside the restore path,
> reading a save payload — so deployment, patrol, incident response and
> contraband search were all inert in every session a player could start […]
> The alternatives were a player-facing sector-drawing gesture (a large feature
> that first needs a decision about what a sector *means* to a player) or
> declaring the tier unshipped […] The first option was chosen because it makes
> an entire tier reachable without inventing a gesture nobody asked for.

`src/simulation/runtime/new-session.ts:703` records the same lesson against
this very convention, in the code:

> "no fabricated default content" is right about *content* and was silently
> also deciding *reachability*.

**That is the sentence #648 is a third instance of.** ADR 0036 took the derived
route for sectors; the sweep's item 1 (gangs) is waiting on #39; utilities have
neither an ADR nor an open issue naming their producer, which is what #648 now
is.

---

## 2. #649: the roadmap wrote the parcel economy down before the code existed

### 2.1 The absence, re-measured — VERIFIED

```
$ grep -rn "setParcelOwned" src/
src/simulation/world/sparse-world.ts:550:  public setParcelOwned(id: string, owned: boolean): void {

$ grep -rn "canPurchaseParcel" src/
src/simulation/world/sparse-world.ts:537   — a doc comment naming it
src/simulation/world/sparse-world.ts:621:  public canPurchaseParcel(

$ grep -rn "getParcelPrice" src/
src/simulation/world/sparse-world.ts:537   — the same doc comment
src/simulation/world/sparse-world.ts:630:  public getParcelPrice(

$ grep -rn "registerParcel" src/ | grep -v "^src/simulation/world/sparse-world.ts:5[26]\|tile-ownership\|world-view"
src/simulation/world/sparse-world.ts:521:  public registerParcel(parcel: ParcelDefinition): void {
src/simulation/world/sparse-world.ts:763:        world.registerParcel({
```

`:763` is inside `SparseWorld.fromSnapshot`. #649's claim reproduces exactly.
So does the closed loop: nothing outside a restore creates a parcel, and
nothing at all owns one.

### 2.2 What a new session's land actually is — VERIFIED

`src/simulation/runtime/new-session.ts:374-376`:

```ts
    world = new SparseWorld(32);
    world.load(initialChunk);
    world.setOwned(initialChunk, true);
```

```
$ grep -rn "setOwned" src/
src/simulation/runtime/new-session.ts:376:    world.setOwned(initialChunk, true);
src/simulation/world/sparse-world.ts:336:  public setOwned(position: ChunkPosition, owned: boolean): void {
```

One 32×32 chunk, owned at session creation, and **no line in `src/` can ever
add another**. `src/simulation/prisoners/discharge-system.ts:77` states it as an
aside for a different reason: *"`world.setOwned` has one call site at session
creation"*.

### 2.3 The consumer half is fully live — VERIFIED, and this is the difference from #648

Ownership is not dead code. It is read on three player gestures and drawn on
screen:

- `src/simulation/world/buildability.ts:26` —
  `if (requiresOwnedLand && !world.isTileOwned(tile)) return { buildable: false, reason: 'unowned_land' };`
- three call sites set `requiresOwnedLand: true` —
  `src/simulation/construction/system.ts:93` (build orders),
  `src/simulation/rooms/zoning.ts:384` (room zoning),
  `src/simulation/objects/object-placement-service.ts:94` (object placement).
- `src/rendering/phaser/tile-layer.ts:364-367` outlines the boundary of owned
  land, through the same shared rule
  (`src/simulation/world/tile-ownership.ts`, ADR 0019).
- and the player is told about it in three shipped strings —
  `src/content/default-locale-en.ts:270`, `:314`, `:359`:
  *"The build order failed — you do not own that land."*,
  *"The object was not placed — you do not own all of that land."*,
  *"The room was not zoned — you do not own all of that land."*

**So the game already says "you do not own that land" to a player who has no
way to own more.** That is stated as an observation, not as a defect: it is a
refusal, which is true, and not a promise the code does not keep. What it does
establish is that the *ownership* concept is shipped and player-visible, and
only its acquisition is not.

### 2.4 The introducing commit is bare, so the intent is in the roadmap instead — VERIFIED

```
$ git log --oneline --all -S 'setParcelOwned' -- src/
a71c955 feat: add data-driven terrain and parcel land ownership

$ git log -1 --format='%an %ad %n%B' a71c955
matmaxalez  Sat Aug 22 21:00:27 2026 +0200
feat: add data-driven terrain and parcel land ownership
```

**#642's method does not reach here, and it has to be said plainly.** That
commit is the owner's own, its message is one line, it closes no issue, and it
predates this repository's issue-driven workflow — the first 30 commits carry
no issue references at all. There is no introducing commit message to read and
no issue body behind it.

The intent is recorded somewhere else, and it is more specific than a commit
message would have been. `docs/ROADMAP.md` Phase 2, *"World/chunk model and land
ownership"*:

```
- sparse chunk coordinates
- chunk lifecycle and serialization
- terrain layers
- purchased parcel model
- world expansion pricing hooks
- culling/streaming benchmarks
```

`a71c955` delivers those two lines and no more of them:

| roadmap line | what `a71c955` added |
| --- | --- |
| *purchased parcel model* | `ParcelDefinition` with `basePrice`, `registerParcel`, `setParcelOwned`, `isParcelOwned` |
| *world expansion pricing hooks* | `ParcelPricingHook`, `ParcelPurchaseEligibilityHook`, `defaultParcelPricingHook`, `defaultParcelEligibilityHook`, `canPurchaseParcel`, `getParcelPrice` |

The ordering is checkable and was checked:

```
$ git log -1 --format='%h %ad %s' f326407
f326407 Sat Aug 22 16:15:16 2026 +0200 docs: add long-term execution roadmap
$ git merge-base --is-ancestor f326407 a71c955 && echo "ancestor"
ancestor
```

**The plan was written four hours and forty-five minutes before the code, and
the code is exactly the plan.** That is #649's equivalent of #642's
commit-message evidence, and it is stronger in one respect: a roadmap line is a
statement of what the project intends to have, where a commit message is a
statement about one change.

### 2.5 Nothing was ever removed, and the missing thing has a name — VERIFIED

```
$ git log --oneline --all -S "'PurchaseParcel'"
(no output)

$ git log --all --diff-filter=D --oneline -- src/simulation/world/parcel.ts
(no output)
```

No `PurchaseParcel` command literal has ever existed on any ref; `parcel.ts`
has never been deleted. The command union today is 14 members
(`grep -n "z.literal(" src/simulation/protocol/commands.ts`) and none of them
buys anything but materials and staff.

**Three ADRs name the gap, and two name the missing command by that exact
name.** They are quoted rather than cited by line, because they are prose:

[ADR 0019](../adr/0019-tile-ownership-under-overlapping-parcels.md) (Accepted),
§"Reachability: this is latent, not live":

> Nothing in `src/` registers a parcel. The only `registerParcel` call site in
> production code is inside `SparseWorld.fromSnapshot`, re-registering what a
> save already contained; `createNewSimulationRuntime` creates a world with one
> owned chunk and no parcels, and there is no content or scenario module that
> defines any.

and, in its rejected-alternatives list:

> **Leave it alone because it is unreachable.** Rejected. Unreachable today is
> what makes it *cheap* to fix, not unimportant: **the first content module that
> defines parcels inherits whichever answer is in the code**, and there is no
> reason for that to be the accidental one.

[ADR 0045](../adr/0045-must-a-zoned-room-be-enclosed.md) (Accepted):

> no land purchase exists — `canPurchaseParcel` has no caller and there is no
> `PurchaseParcel` command — so a session owned one chunk and only its last row
> and column were ever affected. **The option this document weighed, that the
> player buys the adjoining parcel, named a route the player cannot take**

[ADR 0047](../adr/0047-raising-a-building-on-open-ground.md):

> **Nothing in `src/` can buy land.** […] and no command in
> `src/simulation/protocol/commands.ts` names a purchase […] That is worth
> stating, because it means decision 6 is a modest fix today and a load-bearing
> one **the moment land purchase or a second chunk exists**.

> **D. Make the player buy the adjoining parcel.** Also rejected by the owner,
> and independently impossible: no command in `src/` can buy land.

> **Land purchase.** It does not exist and this document does not add it.

**On that "rejected by the owner":** it is a rejection of land purchase as the
*fix for room enclosure at the edge of owned land*, in a document about
buildings, and ADR 0045's slice 0 fixed that a different way. It is not a
ruling that land purchase should not exist, and it should not be read as one —
but it is the one place the owner has been shown the idea, so it is quoted in
full rather than summarised.

ADR 0047 also anticipates the producer in passing, recommending a frontier ring
of materialised unowned chunks and adding: *"it is the shape land purchase will
want anyway."*

### 2.6 Settling #649 — DERIVED

- **Abandoned.** Refuted. Nothing was removed on any ref (§2.5); the roadmap
  line that asked for it was written first and still stands (§2.4); and three
  ADRs across 2026-08-24 to 2026-08-29 each re-state the absence as a known,
  latent gap rather than as leftovers — ADR 0019 explicitly plans for *"the
  first content module that defines parcels"*.
- **A producer is missing.** True but not the whole answer, and not the
  interesting half.

**The missing half is a command.** `PurchaseParcel`, and a handler that asks
`canPurchaseParcel`, prices with `getParcelPrice`, spends from `Treasury` and
calls `setParcelOwned`. The pattern it would follow already ships twice:
`PurchaseMaterials` (`commands.ts:152`, handled through
`src/simulation/economy/procurement.ts:166`) and `HireStaff`
(`commands.ts:304`, `src/simulation/staff/hiring.ts:199`) — both are
"a gesture that spends money and changes world state".

**A producer is missing too, and it is small.** Something must call
`registerParcel` outside `fromSnapshot` so there is anything to buy. Both
routes ADR 0036 weighed are open here: author parcels as content, or derive
them from the world (a parcel per chunk-sized rectangle around the owned chunk
is the obvious derivation, and ADR 0047's frontier ring is the same object).

Two further things a purchase gesture would have to reach, recorded because
they are not obvious from the parcel API and would otherwise be discovered
late — and stated as costs, not as a design:

1. `SparseWorld.load(chunk)` and `navigation.setLoadedChunks(...)`
   (`new-session.ts:381`) both take the chunk list at session creation. Owning
   new ground is not the same as materialising and routing over it.
2. `defaultParcelEligibilityHook` (`src/simulation/world/parcel.ts:142-165`)
   gates on adjacency to an already-owned **parcel**, with an explicit
   *"if nothing is owned yet, anything is eligible"* branch. A session that owns
   a *chunk* and no parcels therefore hits that first branch, and the adjacency
   rule the hook exists for never engages until a second purchase. That is a
   real interaction between the two ownership kinds and nothing has ever
   exercised it.

---

## 3. What #649 means for #641 — DERIVED, with VERIFIED inputs

#649 asks for this explicitly and it is the part with the shortest distance to
a decision. **No number below is proposed; #641's own comments carry the
measurements and ADR 0017 decision 5 puts every value with
[#29](https://github.com/matmaxalez/lockstate/issues/29).**

**The economy has three money sinks and no fourth.** VERIFIED:

```
$ grep -rn "\.spend(" src/
src/simulation/economy/procurement.ts:166   — buying materials
src/simulation/economy/payroll.ts:234       — daily wages
src/simulation/staff/hiring.ts:199          — hiring
```

Two of the three (materials, hiring) are one-off purchases of things a prison
needs anyway; the third is recurring. A land purchase would be the fourth
`Treasury.spend` caller in the game.

**#641's costing concluded that the problem is not the level of money.** Its
own summary, quoted from the issue: *"The measurements support none of the
three as stated, for the same reason: **the level of money is not the
problem.**"* — with a minimum viable prison at 890 against an opening balance of
25,000 (`TREASURY_STARTING_BALANCE_MINOR_UNITS`,
`src/simulation/economy/treasury.ts:79`), *"25,000 buys 28 of them"*, and a
measured working prison at *"2,105 of 25,000 — 8.4% of the treasury"*. The
waste-multiplier pass then measured session minima of *"22,430 to 23,015"*.

**DERIVED, and this is the whole of what this record contributes to #641:** an
economy whose diagnosis is *"there is too much money relative to anything to
spend it on, and the only failure is a liquidity cliff reached by pathological
walling"* is an economy short of a **sink**, and #649 is a sink that is already
modelled, already priced-by-hook, already snapshotted, and already consumed by
three gestures and the renderer. It differs from every lever #641 has weighed
in one respect that matters: **it converts money into playable area**, so
spending scales with ambition instead of with time or with headcount. The
recurring cost the game has (wages) is the only one that grows, and it grows
with staff rather than with what the player is building.

Two concrete inputs #641 does not currently have, both VERIFIED:

- **The playable world is 1,024 tiles and cannot grow.** One 32×32 chunk (§2.2).
  The waste-multiplier playtest measured the camera's reachable tile window at
  the default zoom as `{"left":5,"right":22,"top":10,"bottom":21}` — 18×12 —
  and *"306 wall segments in 22 drags […] with the camera never moving"*. **The
  312-wall hard lock and the entire owned world are the same order of
  magnitude**, which is a fact about the map's size as much as about prices.
- **The price is already a field with nobody to set it.**
  `ParcelDefinition.basePrice` (`src/simulation/world/parcel.ts:14`) and
  `defaultParcelPricingHook` returning it (`:167-177`) exist; no parcel is
  authored anywhere in `src/content/`, so no land price has ever been chosen.
  Choosing it is #29's and the owner's.

**What this record does *not* claim:** that land purchase would fix the
liquidity cliff. It would not — a sink makes a treasury emptier, and ADR 0075
decision 1's development grant is what #641 and #653 both recommend for the
cliff. The claim is narrower and is the one #649 asks for: *before anyone
invents a new sink, the repository already has one built to the waterline.*

---

## 4. Side by side

| | **#648 — utility networks** | **#649 — parcel economy** |
| --- | --- | --- |
| Introducing commit | `2da9cb3` (2026-08-23, closes #25) | `a71c955` (2026-08-22, closes nothing) |
| Its message settles it? | **Yes** — *"empty […] with no fabricated default content"*, *"not wired into main.ts"* | **No** — one bare line. The roadmap settles it instead |
| Plan recorded where | `docs/ROADMAP.md` Phase 7 *"utilities"*; `docs/OPERATIONS.md` | `docs/ROADMAP.md` Phase 2 *"purchased parcel model"*, *"world expansion pricing hooks"* |
| Named in an ADR? | No ADR names the producer. `docs/HUD_PROJECTIONS.md` item 17 names the surface gap | **Three** — ADR 0019 (Accepted), 0045 (Accepted), 0047; two name `PurchaseParcel` |
| Ever removed on any ref? | No | No |
| Emptiness asserted by a test? | **No** — and the one test touching them fills them (#375) | **No** |
| Consumer today | **None.** `evaluate()` uncalled | **Live.** 3 gestures + the renderer, via `isTileOwned` |
| Content today | `object.utility-panel`, `room.utility-room` — buildable, gates nothing. **No producer object, no demand figure in `ObjectDefinition`** | No parcel authored anywhere. `basePrice` exists with no value ever chosen |
| Player-visible strings | *"Utility Room"*, *"Utility Panel"*, *"jobs, containers and utility networks"* | three *"you do not own that land"* refusals |
| **Missing half** | **A producer** — and a consumer. No new gesture needed; `PlaceObject` already places the panel | **A command** — `PurchaseParcel`. Plus a one-line producer |
| Save-format cost of deleting | **Larger.** `electricity`/`water` are **required** fields of `operationsSectionSchema` (`save-schema.ts:605-606`, `.strict()`), so every existing save breaks without a migration | **Smaller.** `parcels`/`ownedParcels` are `.optional()` on `worldSnapshotSchema` (`save-schema.ts:145-146`) |
| Distance to playable | Far — needs content, a bridge and a consumer | **Near** — one command, one handler, one seeding call, one price |

---

## 5. What this record does not propose

Nothing, deliberately, and for the same reason the #642 record proposed
nothing. Every route out of either issue is the owner's or needs an ADR this
record may not self-approve:

- **Building either producer** is new simulation behaviour. For #648 it also
  needs a decision about what a utility *is* to a player before any code —
  which of the 20 catalogue objects draw power, what a generator is, and
  whether an unpowered object stops working. For #649 it needs a price, which
  is ADR 0017 decision 5's and #29's.
- **Deleting either** removes live-looking content and changes the save format,
  which #648 and #649 both already say is a decision in its own right. The
  table above prices that decision differently for the two.
- **A `PurchaseParcel` command** would add player-facing strings, and copy is
  the owner's under `AGENTS.md`.

**One thing is handed over rather than proposed**, because it is the instrument
both issues ask for and neither of them is: the #642 sweep's own weakest claim
names a **registry-population reachability contract** as the durable fix, and
this record's §1.1 and §2.1 are two more hand-run greps where that gate would
have answered. Four such contracts exist
(`tests/foundation/message-kind-reachability-contract.test.ts`,
`projection-reachability-contract.test.ts`,
`fault-code-reachability-contract.test.ts`,
`content-validation-reachability-contract.test.ts`) and none covers registry
population. That is a test, not a decision, and it is nobody's issue yet.

---

## 6. What could not be established — UNKNOWN

- **Whether a utility producer or a land-purchase gesture was ever designed and
  discarded in conversation.** Absence from git is absence from git.
  `a71c955` in particular is the owner's own commit with a one-line message
  from before the issue workflow, so whatever was intended for parcels beyond
  the roadmap line was not written down anywhere this repository can read.
  `docs/AGENT_WORKFLOW.md` §3 says to say so rather than infer it.
- **What either subsystem costs.** Both are dead weight in the snapshot format
  and the typechecked surface; neither has been measured, and no claim is made
  here that either is a defect. §4's save-format column is a statement about
  schema shape, not a measured migration cost.
- **Whether the owner's rejection of ADR 0047's option D extends to land
  purchase as a feature.** §2.5 quotes it in full and declines to read it
  either way. This is a question for the owner and is the kind
  `docs/AGENT_WORKFLOW.md` §3 says to ask rather than measure.

---

## 7. My weakest claim

**The weakest claim in this record is §3 — that a land-purchase sink is what
#641's economy is short of.** Everything under §1 and §2 is settled from
commits, greps and quoted documents, and any of those would refute it if it
were wrong. §3 is different in kind: it is an argument about what would make the
game better, built on somebody else's measurements, and its own author has
already flagged those measurements' limits — #641's costing says *"the economy
is not short of money **for a player who wastes none**"*, and the waste pass
puts the real multiplier at 2.2×–2.8× with the honest caveat that *"2.2×–2.8× is
the spread of my scripts across ten sessions, not the spread of players"*.

Stated at its strongest, my claim is only this: **the model exists, and it is
nearer to shipping than anything invented from scratch.** Whether expansion is
the *right* sink for this game is a design judgement I have not earned and am
not making.

**Three things would change my mind:**

1. **A measured session in which money is scarce.** §3 rests on the treasury
   being over-supplied. If the ×5.8 occupancy change from #593's longer
   sentences (flagged on #641 and explicitly *not* re-measured against ADR
   0050's population harness) makes accommodation capital the binding
   constraint, then the game already has a sink that scales with ambition —
   beds — and land purchase is a second one competing with it.
2. **The owner reading ADR 0047's option D as a rejection of land purchase
   itself.** §2.5 declines to read it that way. If it was meant that way, §2.6's
   "a command is missing" is still true as a fact and worthless as a direction.
3. **A parcel producer reached indirectly.** §2.1 and §1.1 are name-based greps
   and inherit the #642 sweep's weakest claim exactly: content reached through a
   computed key or an object spread is invisible to them. I checked the two
   plausible indirect paths — `SparseWorld.fromSnapshot` (`sparse-world.ts:763`)
   and `UtilityNetwork.loadSnapshot` (`session-systems.ts:819-820`) — and both
   are the restore path. I did not trace every object spread in `src/`.

On §1 and §2 I would need (3) to be wrong to be wrong, and I think (3) is
unlikely: for #649 the code, the roadmap, three ADRs and a `tile-ownership.ts`
docblock all say the same thing independently, and for #648 the commit message,
the `new-session.ts` comment, `docs/OPERATIONS.md`, `docs/HUD_PROJECTIONS.md`
and a green-after-deletion mutation measured at v0.0.98 all do.
