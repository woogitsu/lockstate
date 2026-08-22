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

### Component Storage
Components are decoupled typed arrays (e.g., `TransformX = Float32Array`). A central `ComponentBitset` manages component presence per entity index. This structure uses almost zero allocations in hot loops and provides perfectly localized data for iteration.

### Query Determinism
Unlike dense-array implementations utilizing swap-and-pop (such as `bitecs`), which change iteration order based on entity deletion history, our queries strictly iterate from index `0` to `maxActiveIndex`. This approach:
- Naturally guarantees strictly ascending ID order, making simulation entirely deterministic regardless of spawning/despawning history.
- Remains highly performant, requiring only lightweight bitmask checks (benchmarked at ~0.6ms to process 5,000 entities).

### Snapshotting
Because the state is just bounded typed arrays, snapshotting requires merely copying the active length of the arrays. There is no complicated pointer chasing or object traversal.

## Consequences
**Positive:**
- Zero dependencies added, adhering to the dependency policy.
- Guaranteed deterministic query iteration.
- Easy and zero-allocation serialization format.
- Stale reference bugs are safely caught by the generation bitmask.

**Negative:**
- Iterating sparse component combinations still requires walking up to `maxActiveIndex`. However, given our 5,000 entity cap, iterating lightweight bitsets scales incredibly well within V8 without causing bottlenecks.
- Custom implementation means maintaining it instead of relying on an established library.
