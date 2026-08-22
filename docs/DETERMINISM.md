# Determinism in Lockstate

Lockstate strictly relies on fully deterministic logic within its simulation core. The game state must be capable of being perfectly recreated on any hardware given identical initial state and an identical command log.

## Kernel Pacing and Time
- The `Kernel` operates on a strict **50ms tick interval** (20 Hz).
- Systems and state mutations rely solely on integer `tick` increments, never on floating-point time deltas or elapsed milliseconds.
- Functions like `Date.now()`, `performance.now()`, or other ambient environment timers must NEVER be used in the simulation logic.

## Command Ordering
- All external input is enqueued as a discrete `QueuedCommand` with a designated `executeAtTick` and a strict, contiguous `sequence` number.
- Commands are explicitly ordered and validated by the Kernel.
- Gaps and duplicates in the sequence are aggressively rejected by the Kernel to prevent desynchronization.

## RNG Ownership
- The simulation forbids the use of `Math.random()`.
- Instead, Lockstate uses isolated, named RNG streams powered by `Xoshiro128**` algorithms, which are explicitly seeded and fully serializable.
- Systems must claim specific named RNG streams (e.g., `ai-pathfinding`, `loot-drops`) to ensure that generating a random number in one system does not perturb the sequence of random numbers in an unrelated system.

## Snapshots and Overload
- By removing non-determinism, a full snapshot becomes a simple data dump of the RNG state, active systems, and kernel tick/sequence index.
- Heavy simulation lag must be handled by the worker queue preserving backlog, executing up to a tick budget without altering the 50ms semantic interval.
