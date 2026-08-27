# ADR 0012: Reproducibility of Derived Simulation Identifiers

## Status
Accepted. The `GlobalTopologyId` remedy this ADR's Consequences left as a
follow-up has landed: PR #295 (issue #112) made `nextGlobalId` a local of
`recomputeGlobalTopology` (`src/simulation/rooms/topology.ts:256`, incremented
at `:262`) instead of instance state, so ids are handed out from 1 in canonical
sorted order on every recompute and `GlobalTopologyId` meets the category-2
requirement below. The residue that change recorded rather than removed —
`chunkTopologies` was never evicted, so an id was no longer a function of
*recompute* history but was still a function of chunk *load* history — has
since been closed: `update()` now drops the retained topology of every chunk
the world no longer has loaded, so the component walk sees only what is loaded.
That does **not** settle the world-streaming ruling this ADR reserves below; it
records that the reserved ruling had only one answer compatible with the
category-2 requirement this ADR has already accepted. Retention is not
reproducible from state at *all* — a restored `TopologyManager` cannot know
which chunks a previous session once had loaded — and the state-derived
alternative of walking every chunk the world knows about is not available,
because `SparseWorld.fromSnapshot` gives edge storage only to loaded chunks, so
an unloaded chunk's regions cannot be computed at all. Extended by
[ADR 0015](./0015-actor-identity-allocation.md), which applies the taxonomy
below to actor names and works the category-1 case through in detail.

## Context

[ADR 0020](./0020-deterministic-kernel.md) makes the kernel deterministic and
[ADR 0009](./0009-challenge-verification-strategy.md) turns that into a product
guarantee: a run is reproduced from a seed plus a command stream, and a replay
that disagrees invalidates stored evidence. `docs/DETERMINISM.md` states the
rules that follow — canonical iteration order, named RNG streams, no ambient
clock or locale.

Those rules cover *values computed from state*. They say nothing about a
second category the simulation has quietly grown: **identifiers minted by a
counter while the simulation runs.** There are already several, and they do not
all behave the same way.

| Identifier | Minted by | Snapshotted? | Reproducible from state? |
| --- | --- | --- | --- |
| `EntityId` | `EntityStore` index + generation | yes (whole store) | yes |
| `intel.<n>` | `IntelligenceLedger.sequence` | yes (restored from max suffix) | yes |
| `incident.<type>.<n>` | `IncidentTriggerSystem.sequence` | yes | yes |
| path request ids | five systems mint from a per-system `requestSequence`; `JobSystem` derives its own from state (`` `job.${job.id}.${job.leg}.${tick}` ``, `operations/job-system.ts:139`) | **yes** — `pathRequestId` is persisted on jobs (`save-schema.ts:419`) and on guards (`:468`) | the `JobSystem` form yes; the five `requestSequence` forms no |
| `GlobalTopologyId` | `TopologyManager.nextGlobalId` | no | **no** |

`GlobalTopologyId` is the one that is actually wrong rather than merely
undecided. `TopologyManager.recomputeGlobalTopology` assigns ids from a counter
that is never reset, so the id a room ends up with depends on *how many times
the world's geometry changed since the manager was constructed*, not on the
geometry. Two sessions that reach an identical world by different build orders
disagree. A restored session, whose `TopologyManager` is rebuilt from scratch,
disagrees with the session it was saved from. Nothing breaks today only because
nothing persists the id and nothing reads it — when this ADR was written its
sole consumer was `RoomSystem.validateRoom`, which compared it to `0`, and
#123 item 2 deleted that, so it now has no consumer at all — which is exactly
the kind of latent state that becomes a
determinism defect the moment room ids appear in a save, in a challenge metric,
or in a UI the player can bookmark.

Issue-level work on economy, progression and events will mint more identifiers
(contracts, orders, unlocks, event instances). Deciding this once is cheaper
than deciding it five times inconsistently.

## Decision

Every identifier that can influence simulation state, cross a save boundary, or
appear in challenge evidence must fall into exactly one of two categories, and
must say which in its declaring module:

### 1. Allocated identity
A minted, stable identity for a thing that persists across ticks — an entity, an
incident, an intelligence record. Requirements:

- minted from an explicit counter owned by the subsystem;
- the counter is **part of that subsystem's snapshot**, and `loadSnapshot`
  restores it such that no future id can collide with a restored one;
- the id is never re-derived, only carried.

`EntityStore`, `IntelligenceLedger` and `IncidentTriggerSystem` already satisfy
this; it becomes the stated rule rather than three independent habits.

### 2. Derived value
A label for a *current* property of state, recomputed whenever that state
changes — a topology/region id, a connectivity group, a flow-field key.
Requirements:

- computed as a pure function of the state it describes, with canonical
  iteration order throughout;
- **not** carried in a snapshot, because recomputation must reproduce it;
- not treated as stable across recomputes by any consumer, and never persisted,
  hashed or compared across a save boundary.

`GlobalTopologyId` is category 2 and **now meets it**. The counter resets:
`nextGlobalId` is a function-local of `recomputeGlobalTopology`
(`src/simulation/rooms/topology.ts:256`, incremented at `:262`), so ids are
handed out from 1 in canonical sorted order on every recompute, and the two
things that have to hold together for that are written beside the declaration
at `:249-255`.

**This paragraph said the opposite until it was corrected, and the old wording
is kept rather than overwritten**, because what it cost is the point. It read:
*"`GlobalTopologyId` is category 2 and does not currently meet it: the counter
must reset per recompute (or the id must be derived from the component's own
canonical key) so that identical geometry yields identical ids."* That was
written in `dc3d7da` and was true then. It stopped being true when `bd49852`
(PR #295, issue #112) made the counter function-local at v0.0.39, and **this
document was updated around it eight hours and seven releases later** in
`98c933d`, which added the Status note and the Consequences note without
touching this sentence — so the **Status** above and the **Consequences** below
have both recorded the fix landing while the *Decision* went on denying it.
A reader who stops at the Decision, as a reader of an ADR is meant to, came
away believing a live determinism defect that had been closed **eighty-two
releases** earlier — v0.0.39 to v0.0.121, counted as `chore(release)` commits
in `bd49852..b710c62`. That is the failure mode `docs/AGENT_WORKFLOW.md` §4 names
last: reading a document's own headings against each other is a different check
from any diff, and no diff was ever going to catch this one.

**What this ADR still reserves is not that counter.** It is the world-streaming
policy: whether an unloaded chunk should be *representable* in a topology at
all, and if so from what persisted geometry. The Consequences below state that
question, and state why dropping an unloaded chunk's retained topology was the
only answer available compatible with the category-2 requirement — that closes
the residue, not the policy.

### Neither category may be left implicit
A counter that is neither snapshotted nor reset is the failure mode this ADR
exists to name. A new subsystem that mints ids states its category in the
module doc, and `tests/determinism/` gains a pin for it.

## Consequences

- `TopologyManager` needs a follow-up change: reset `nextGlobalId` per
  recompute, or key ids off the canonical component seed. That is a behaviour
  change to a public accessor (`getTopologyId`) and belongs in its own issue
  with its own tests, not smuggled into determinism hardening — which is why
  this ADR separated the taxonomy from its application instead of carrying the
  change itself.
  **That follow-up is #112 and has landed.** The first of the two mechanisms
  was taken: the counter is now local to `recomputeGlobalTopology`, which is
  numerically the same thing as keying ids off the canonical component seed
  (ids are handed out in sorted-seed order), and avoids the
  content-addressed form this ADR's own Alternatives section rejects. Two
  things were deliberately *not* settled by that change, because they were this
  ADR's to settle and not an implementation's. **(a)** The category-2 reading
  of `GlobalTopologyId` — the owner's call, and taken: the status above is now
  Accepted. **(b)** `chunkTopologies` was never evicted, so an unloaded
  chunk still contributed nodes and the id remained a function of chunk *load*
  history even though it was no longer a function of *recompute* history.
  **That has since been closed too, and by the only conformant option**, per
  the Status note above: the entry is dropped when the world reports the chunk
  as no longer loaded, which was the sole reading under which the category-2
  requirement accepted in (a) could hold. It was a binding defect and not
  a numbering one — three open chunks in a row have the outer two connected
  only *through* the middle one, so a retained middle answered a different
  connectivity question rather than shifting a label, and content-addressing
  the ids would not have helped because the component being addressed was
  itself wrong. What is still this ADR's to settle, and is deliberately left
  open, is the broader world-streaming policy: whether an unloaded chunk should
  be *representable* in a topology at all, and if so from what persisted
  geometry. Nothing observable changed when the entry was dropped — no caller
  in `src/` unloads a chunk (`SparseWorld.unload`'s only caller in the
  repository is a `sparse-world` unit test asserting the lifecycle flip),
  nothing in `src/` calls `TopologyManager.update`, and nothing reads
  `getTopologyId` — so the fix is a guard against a defect that was latent on
  three independent counts rather than a behaviour change to a live session.
  Guarded by `tests/determinism/iteration-order.test.ts`.
- Path-request ids were placed in category 2 by exception, on the ground that
  they are consumed only within one `NavigationSystem` lifetime, which a
  restore rebuilds empty
  ([ADR 0007](./0007-navigation-work-budgets-and-flow-fields.md)), and the
  exception carried its own escape clause: if routing state ever enters a save,
  they become category 1. **That clause has since fired.** `pathRequestId` is a
  field of the persisted job record (`src/persistence/save-schema.ts:419`) and
  of the persisted guard record (`:468`), both inside the `simulation` section
  of the shipped payload (`:837` for V3, `:867` for V4). What keeps it harmless
  is therefore not the exception but explicit compensation on the restore side:
  `JobRegistry.loadSnapshot` clears `pathRequestId` for a `'travelling'` job
  (`src/simulation/operations/job.ts:110`) and `GuardRoster.loadSnapshot` does
  the same for a `'travelling'` guard
  (`src/simulation/security/guard-roster.ts:198`), so no restored session
  consumes an id minted by a previous one. Whether the taxonomy should now move
  these to category 1, and what that obliges, is left open rather than settled
  here; the acceptance above did not take it either.
- Future gameplay systems get a decision to follow instead of a precedent to
  guess at.

## Alternatives considered

- **Make every id allocated and snapshotted.** Simple to state, but it forces
  derived groupings (topology, regions, flow-field keys) into the save purely
  to preserve numbering that recomputation would reproduce anyway — and it
  makes a save's checksum depend on recompute history.
- **Leave it to each subsystem.** This is the status quo, and it produced one
  identifier that is reproducible from nothing.
- **Use content-addressed ids everywhere** (hash the state a thing describes).
  Attractive for category 2, but it makes ids large and unreadable in logs and
  buys nothing for category 1, where identity must survive the state changing.
