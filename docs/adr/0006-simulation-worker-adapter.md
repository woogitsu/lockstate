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

## Amendment, 2026-08-24: one worker per session, decided on the main thread

The state machine above is unchanged by this amendment. What it records is
where the *session* boundary sits, which the original decision left implicit
and which `src/main.ts` had answered by accident: it constructed one `Worker`
per page load.

That is not compatible with the rule in state 2. `simulation/initialize` is
accepted only while the worker is `uninitialized`, and answered with
`already-initialized` at any later point, because a worker holds one
authoritative simulation and quietly replacing it mid-flight is worse than
refusing. With one worker per page, the first `createPrison` or `loadPrison`
consumed it, and **every later load in that tab failed** — the save panel
offers Load per prison, so a player with two prisons hit it on the second one
(issue #149).

**The session boundary is therefore the worker itself.** `src/main.ts` claims a
worker that has hosted no session for each new session and disposes of the
previous one, so loading a prison means the same thing as reloading the page.
The rule is stated as *claiming consumes*: a worker that has been sent
`simulation/initialize` is never sent another, whatever became of that
initialize. It is deliberately total, because the main thread cannot tell a
worker that refused a snapshot (still `uninitialized`, still usable) from one
that faulted while restoring, and reusing the second reproduces #149 through
`handleMessage`'s catch.

Two alternatives were considered in #149 and rejected:

- **A `simulation/shutdown` before each load**, returning the worker to
  `uninitialized`. The cheap version of the same idea, and not what the machine
  above does: `shutting-down` is terminal here, with no edge back. A shutdown is
  still sent — as part of *disposing* the outgoing worker, which is what makes
  the main thread's readers see `simulation/stopped` before the worker's thread
  ends — but the boundary is the new `Worker`, not the state transition.
- **Making `initialize` idempotent-with-replacement**, accepting a new snapshot
  from `paused`/`running` and swapping the runtime. Most convenient for the
  caller and the most dangerous: it makes the worker's authoritative state
  replaceable by a message, which is what this state machine exists to prevent.

### Consequences

**Positive:** a session cannot inherit anything — a tick, a queued command, a
half-applied snapshot, a `faulted` state — from the session before it, because
it does not inherit the thread. The refusal in state 2 keeps its full strength
rather than being relaxed to make loading work.

**Negative:** a worker start per load, paid while the player waits, and it is
measurable rather than free. Measured in Chromium against the production build
of this repository (`dist/assets/worker-*.js`, 231 kB at `9b6965a`), constructing the worker
and getting its first protocol reply back — `new Worker` plus module evaluation
plus one round trip — took **152–200 ms over eight consecutive runs, median
~172 ms**, on the container this was developed on. That is the whole of what
this decision adds to a load; every other step of the load path is unchanged.
Against the Vite dev server the same measurement is 377–1389 ms, because the
worker's module graph is served unbundled and re-fetched per worker; that is a
development cost only and is not what a player pays. It also means the recovery
walk in `SessionController.loadPrison` starts one worker per demoted
generation, bounded by the three the repository retains.

**Negative:** the outgoing worker is terminated before its replacement is
constructed, so a `Worker` constructor that fails on a later session leaves the
page with no simulation at all. That is a real loss — the session that was
running is gone with it — and it is the honest state to be in: the alternative,
keeping a worker that can never host another session, is a page that looks
alive and can start nothing. It is reported rather than thrown: the save panel
names the action that failed and the HUD raises the same
`simulation-unavailable` band a browser that cannot start a worker at boot gets
(issue #82, whose failure path had to become re-entrant for this).
