# ADR 0004: Deterministic Kernel and Scheduler

## Status
Accepted

## Context
Lockstate requires a fully deterministic headless simulation foundation that runs identically across clients, isolating all game logic from presentation concerns like framerate or DOM interactions. The architecture must guarantee strict multi-rate system scheduling, ordered command application, and reproduceable state snapshots without relying on ambient JavaScript nondeterminism (e.g., `Math.random()` or wall-clock `Date.now()`).

## Decision
We chose to implement a bespoke `Kernel` class that operates completely independent of the rendering loop. 

### Fixed Step Pacing
The kernel executes precisely 20 ticks per second (50ms step). Systems evaluate their schedule using integer tick intervals and phases (e.g., `tick % interval === phase`), rather than floating-point time deltas. This enforces strict determinism regardless of CPU power or rendering frame rates.

### System Ordering
To prevent registration-order instability, every registered system must define an explicit integer `order` and a stable string `id`. Systems are deterministically sorted primarily by `order` and secondarily by `id`.

### Ordered Command Queue
Commands are submitted with an explicit `executeAtTick` and a contiguous sequence number. The kernel tracks the expected sequence and safely rejects duplicates, gaps, and commands scheduled in the past. At the start of a tick, all due commands are dispatched in strict sequence order before any systems run.

### Named RNG Streams
Instead of a single global RNG which couples unrelated systems (e.g., UI animations perturbing pathfinding), subsystems claim named `Xoshiro128**` RNG streams. RNG state is strictly versioned and serialized, enabling fast deterministic snapshot restoration.

## Consequences

**Positive:**
- Complete deterministic guarantee across simulation states.
- 100% decoupling from Phaser render ticks, enforcing strict separation of concerns.
- Easy to test and benchmark headless logic. Multi-rate schedules have proven extremely fast (~1.6ms to process 5,000 active systems).

**Negative:**
- Requires careful handling of continuous inputs. Developers must adapt to building systems around 50ms intervals instead of continuous frame loops.
- Snapshot payloads will include the state of all RNG streams, which adds a minimal overhead but remains lightweight compared to typical save data sizes.
