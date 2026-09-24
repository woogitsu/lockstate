# Mid-walk restore: decision proposal for #1373

Status: research proposal, **not an ADR or approval**. Based on `main` at `430906af` (v0.0.757). The central ADR pass must assign a number, index the decision and resolve ADR 0059 open question 3 before implementation claims this as policy.

## Observed problem

Issue #1373 measured one 12-prisoner fixture at 65 save ticks: all 41 snapshots with a traveller diverged from uninterrupted play at days 3 and 6; all 24 without a traveller matched at both checkpoints. The issue explicitly has not isolated the reset with a persisted-walk variant, so this is strong evidence, not proof that it is the sole cause.

`PrisonerOperationsRuntime.getSnapshot()` omits `LocomotionStore` and navigation work. On load it clears all walks and headings, turns every `travelling` prisoner `idle`, and clears the action target and path-request ID. This avoids a stranded traveller whose request belonged to a discarded `NavigationSystem`, but changes the simulation at the restore tick. A later action selection cannot in general reproduce the same use of a shared room or the same timing. The current save contract therefore cannot promise exact continuation for a mid-walk save.

## Alternatives

| Contract | Benefit | Cost and limit |
| --- | --- | --- |
| Exact resume at the **completed tick boundary** (recommended) | Save/load/continue has the same authoritative state and subsequent results as uninterrupted play; a player keeps the walk and intended action. | Requires serializing active routes, sub-tile progress, heading, pending and resolved navigation work, and the deterministic scheduler state that affects future results. Also requires auditing other transient actors/jobs. |
| Explicit replay from the last stable checkpoint | Could keep the persisted shape smaller if all commands, seeds, order and external inputs since that checkpoint were logged and replayed. | This repository does not presently have that complete replay log. Reconstruction may be expensive, and replaying under a changed build or content revision could produce another prison. It still needs a versioned log/checkpoint contract and must not silently substitute a new plan. |
| Preserve current reset and label it as a resume approximation | Small implementation. | The 41/41 measured divergence is permanent in the fixture; it violates the player expectation that saving preserves the prison and is unsuitable as the long-term contract. It can remain the **explicit legacy-load fallback** where old bytes lack the needed state. |

This is about state at a completed kernel tick, not pausing inside a partially executed system callback. A request for literal mid-tick capture would need a much larger transaction boundary and should be rejected by the capture API; the worker should finish the current tick before emitting a save.

## Proposed state contract

1. Capture and restore every authoritative value that can change future outcomes. For each active walk: stable actor identity, route waypoints in origin-first order, index of the next waypoint, integer sub-tile progress, and current heading. Preserve last heading for a standing actor as well. Validate cardinal steps, index/progress bounds, identity liveness, and agreement between the route's current tile and the saved position. Restoring an invalid route must refuse or explicitly invoke the legacy fallback; it must never walk through walls or silently truncate a route.
2. Preserve `travelling` phase, selected action and target. A route already handed to `LocomotionStore` is no longer a pending navigation request. For an actor still waiting for a route, restore its request identity, origin, destination, context, priority and enqueue tick. Also preserve resolved results not yet consumed. The queue orders by priority plus age and then ID, so re-enqueuing at restore tick would change service order; the queue's ordering state and the navigation work budget must remain deterministic. Cache contents can remain derived only after a test proves that rebuilding them does not alter scheduling, chosen route or budget accounting.
3. Restore navigation state **before** systems may tick, then restore locomotion and action references atomically. Do not invoke `beginWalk` to rebuild progress: it resets heading and progress. Re-check each next edge at crossing through the existing traversal rule; do not trust that a route remains passable after later world edits.
4. Audit guard walks, incident responders, jobs and searches separately. They have related restore resets and can affect shared outcomes. A prisoner-only fix can close the demonstrated case but cannot claim a general exact-session guarantee until every authoritative transient path is covered or explicitly scoped out.

## Format and compatibility proposal

Add a versioned locomotion/navigation subrecord to the session snapshot and the strict save schema. The current envelope version is 6 and the worker session snapshot version is 3; implementation must reconcile both boundaries and use the existing migration chain. Prefer a new save schema version if the new record is **required for exact resume**. Merely adding an optional field without a version bump permits old and new snapshots to decode alike while offering different guarantees, which hides the central distinction. An old save remains readable through an explicit migration/fallback that retains its historical idle-and-replan semantics; it must not invent a route it never contained. New captures always write the new record, including an empty collection when nobody walks. A new build can describe legacy restore as best effort in player-facing copy only after owner approval of that wording under `AGENTS.md` reservation 4.

Cross-build compatibility must cover route representation and simulation/content version changes: reject an unsupported future schema, migrate known older shapes, and keep the prior generation available if a decode or restore fails. No migration should silently reinterpret a saved route under a different movement scale or tile geometry.

## Verification and acceptance

* Add a failing-before-fix determinism test using real capture, envelope encode/decode and restore at multiple tick boundaries: during pending path work, while walking mid-leg, at a waypoint, just before arrival, and with two actors contending for the last room seat. Compare the immediately restored authoritative snapshot and snapshots after every following tick (or a digest of each), across multiple days; compare player-visible position/action/heading as well.
* Use the #1373 fixture as a regression: 41/41 traveller saves should match the uninterrupted run at both measured checkpoints after the fix. Keep the 24/24 non-traveller control. Add guard/job fixtures before claiming whole-session exactness.
* Exercise old v6 saves with and without `simulation.prisoners`, malformed route records, unsupported future versions, and the last-retained-generation recovery path. Assert legacy fallback is explicit and never loses the only restorable generation.
* Preserve the navigation budget and canonical ordering tests. Benchmark capture size and restore cost with many concurrent walkers; do not relax the per-tick work budget to make a save pass.
* Mutation check: restore the old traveller reset temporarily and watch the new mid-walk test fail, then restore the fix and watch it pass. Browser QA should show a prisoner continuing the same walk without a visible jump or changed task after reload.

## Decision needed

The central ADR pass should decide the exact-resume contract, version/fallback rules and scope across actor systems, then assign/index the ADR number. This note recommends exact tick-boundary resume on player-experience and deterministic-integrity grounds. It does not approve a player-facing promise or edit the persistence implementation while #594 has overlapping work.
