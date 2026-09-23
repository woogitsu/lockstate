# ADR 0005: Entity Storage Model

## Status
Accepted

## Context
Lockstate targets thousands of active actors in a deterministic simulation. Allocation-heavy object-oriented representations (e.g., class-per-entity) lead to poor memory locality, expensive serialization (snapshots), and garbage collection pressure in hot loops. The simulation spec in `docs/ARCHITECTURE.md` required evaluating a data-oriented entity storage model (Structure of Arrays / ECS), with `bitecs` suggested for review.

We require a storage contract that guarantees:
- Strict deterministic simulation (query iteration order).
- Fast and compact snapshotting.
- Fast queries and iterations on hot paths.
- No external dependencies if avoidable under our strict dependency policy.

## Decision
We chose a **custom hand-rolled Structure-of-Arrays (SoA) ECS** over adopting `bitecs`.

### Entity ID Lifecycle
Entities are represented by a 32-bit stable numeric ID, combining a 20-bit index and a 12-bit generation count. When an entity is destroyed, its index is placed in a free list and its generation is incremented. This ensures `O(1)` ID recycling and perfect stale-reference detection.

The store keeps **two** records of liveness, and both are authoritative for different questions: `generations[index]` distinguishes an id from an earlier occupant of the same slot, and `alive[index]` says whether the slot is occupied at all. Neither implies the other, because `destroy` bumps the generation of a slot it is freeing — so an id rebuilt by `getIdByIndex` for a freed index carries the *current* generation while naming a dead slot. `isAlive(id)` therefore requires both to agree, and `destroy` checks slot occupancy before the generation so such an id cannot free the same index twice (which would let two later `spawn` calls return one EntityId). `getIdByIndex` itself stays a pure reconstruction with an "index is alive" precondition, documented on the method: it sits in the hot `0..maxActiveIndex` walk below, and its callers gate on `isIndexAlive` already.

### Component Storage
Components are decoupled typed arrays (e.g., `TransformX = Float32Array`). A central `ComponentBitset` manages component presence per entity index. This structure uses almost zero allocations in hot loops and provides perfectly localized data for iteration.

### Query Determinism
Unlike dense-array implementations utilizing swap-and-pop (such as `bitecs`), which change iteration order based on entity deletion history, our queries strictly iterate from index `0` to `maxActiveIndex`. This approach:
- Guarantees ascending **index** order regardless of spawning/despawning history — a total order derived from state, stable across runs and across a snapshot restore, which is what determinism actually needs. This is deliberately narrower than the "strictly ascending ID order" this bullet used to claim, and `src/simulation/entity/query.ts:16-36` states the narrower guarantee and the arithmetic behind it: an id packs the generation into its high 12 bits and the index into its low 20, so id order is `(generation, index)` lexicographic and coincides with index order only while every live slot shares a generation. Today it always does, because nothing in `src/` calls `EntityStore.destroy` and no index is ever recycled; the first release path (#31) is what separates the two orders. Callers that need ids in numeric order sort them.
- Remains highly performant, requiring only lightweight bitmask checks (benchmarked at ~0.6ms to process 5,000 entities).

### Snapshotting
Because the state is just bounded typed arrays, snapshotting requires merely copying the active length of the arrays. There is no complicated pointer chasing or object traversal.

## Consequences
**Positive:**
- Zero dependencies added, adhering to the dependency policy.
- Guaranteed deterministic query iteration.
- Easy and zero-allocation serialization format.
- Stale reference bugs are safely caught by the generation bitmask, and ids naming a freed slot by the `alive` record alongside it.

**Negative:**
- Iterating sparse component combinations still requires walking up to `maxActiveIndex`. However, at the capacities the runtime actually allocates — 5,000 for the prisoner store (`DEFAULT_PRISONER_CAPACITY`, `src/simulation/runtime/new-session.ts:245`) and 500 for the guard roster's own separate store (`DEFAULT_GUARD_CAPACITY`, `:246`) — iterating lightweight bitsets scales incredibly well within V8 without causing bottlenecks. `EntityStore` itself imposes no 5,000 cap: its ceiling is `INDEX_MASK`, 1,048,575 (`src/simulation/entity/entity-store.ts:13`, enforced at `:83`), so the figure above is a per-store default and not a property of this model.

  **The two capacity anchors are now named as well as numbered, because this is the third time they have been re-measured and the numbers are what keep failing.** They read `:139`/`:141` when `16aa2e2` introduced them, and `:156`/`:158` after `e5d54ed` re-anchored them, and **both pairs were correct on the day they were written** — verified by reading `new-session.ts` at each of those commits. Neither was a citation nobody opened; `new-session.ts` is simply a file that grows above the constants, by 17 lines and then 88. The two constants have stable exported names and no near-duplicates, so `grep -n DEFAULT_PRISONER_CAPACITY` re-derives both in one command whatever the line numbers become, which is the only part of this citation that has ever survived a release. (The `entity-store.ts` anchors beside them, `:13` and `:83`, have not moved at all and were re-checked in the same pass.)

  **`16aa2e2` is worth naming, because this is not one citation's bad luck.** That commit is titled *"Correct twelve ADRs that state something about the codebase that is false"*, and at least six of the anchors it wrote or rewrote have since rotted — this pair, and four more in [ADR 0012](./0012-derived-identifier-reproducibility.md) and [ADR 0013](./0013-free-tier-cloud-save-capacity.md), each corrected in the same sweep as this one. **Every one of them was exact when it was written.** A pass whose whole purpose was removing false statements about the code left behind a fresh crop of them within days, without being careless: it cited by line, into files that were about to grow.

  **The corpus contains the controlled experiment for what to do instead, and its result is not the obvious one.** [ADR 0038](./0038-what-makes-a-save-compatible.md) states the tree it was read on — *"Verified on `main` @ `54418b6` (v0.0.121)"* — and pins its anchors to it. Re-checking three of them at that commit, they are exact: `state-machine.ts:117-119` is `rejectedSnapshotFault`, `kernel.ts:250` is `this._rng = new NamedRngStreams(snapshot.rngStates)`, `save-schema.ts:88` is `rngStates:`. Re-checking the same three sixty-nine commits later, **two of them have already drifted** — `kernel.ts:250` is now inside `snapshot()`, and `state-machine.ts:117` is a comment about the actor feed. So naming the commit does **not** stop a citation rotting, and claiming it does would be this file making the same kind of over-confident statement it is correcting.

  What naming the commit does is make the rot **diagnosable**. A reader who follows `kernel.ts:250` today lands on unrelated code, sees that ADR 0038 says which tree it was measured on, opens that tree, and learns in one command that the citation was right and the code moved. A reader who follows `new-session.ts:156` has no such recourse: a stale anchor and a fabricated one are indistinguishable from the outside, which is why this file's own history had to be recovered from `git log -S` before the paragraph above could be written. **Name the commit, and prefer a symbol to a line where the code offers one** — those are different fixes for different halves of the problem, and this bullet now does both.
- Custom implementation means maintaining it instead of relying on an established library.
