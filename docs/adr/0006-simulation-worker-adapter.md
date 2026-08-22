# ADR 0006: Simulation Worker Adapter Lifecycle

## Status
Accepted

## Context
Lockstate runs its headless, deterministic kernel inside a Dedicated Web Worker to ensure simulation processing does not block the browser's rendering thread. We must orchestrate the worker's lifecycle to ensure a safe initialization sequence, deterministically bounded tick execution, and a recoverable state machine when faults occur.

## Decision
We implemented a rigid state machine (`SimulationWorkerStateMachine`) inside the worker thread.

### State Transitions
1. **uninitialized**: The worker has loaded but is waiting for the `protocol/handshake`. It rejects simulation commands.
2. **ready**: Handshake completes. It awaits the `simulation/initialize` message containing initial game state/RNG seeds.
3. **running / paused**: The simulation clock controls whether the tick loop actively runs. In `running` mode, the worker uses `setInterval(..., 15)` to repeatedly execute a tick batch (up to a safe budget of ticks per wake to prevent stalling the worker completely).
4. **shutting-down**: Triggered by a graceful shutdown request.
5. **faulted**: Reached when an unhandled exception or protocol decode error occurs. The worker emits a `protocol/error` and refuses to process further ticks or commands. The renderer must detect this and surface a restart/reload UI.

### Loop Pacing
Because `requestAnimationFrame` is unavailable in standard Dedicated Web Workers, we use `setInterval(loop, 15)` to wake the worker. During each wake, the `FixedStepClock` calculates how many 50ms ticks are owed based on monotonic time `performance.now()`. The kernel runs up to 5 ticks per wake (budgeting) to avoid long blocking if the worker falls behind.

### Transferables and structured-clone
For phase 4, initial implementations for commands and snapshots use `structured-clone`. Subsequent iterations and optimizations for large snapshots will migrate to explicit `ArrayBuffer` payloads that correctly decouple from the main thread via transfer lists.

## Consequences

**Positive:**
- Enforces strict initialization protocol; main thread cannot send commands before the kernel is ready.
- Safely manages tick catch-up without permanently locking the worker thread.
- Isolates crash blast radius: a faulted worker stops emitting state but does not crash the UI/Phaser thread.

**Negative:**
- `setInterval` has inherently loose precision (can drift up to ~4ms in standard browsers, or more during background throttling). However, because `FixedStepClock` measures against `performance.now()`, the simulation pacing remains objectively accurate over time, even if individual bursts of ticks are unevenly grouped.
