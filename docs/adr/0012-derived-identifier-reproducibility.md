# ADR 0012: Reproducibility of Derived Simulation Identifiers

## Status
Proposed. Extended by
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
| path request ids | per-system `requestSequence` | no | no — but consumed only by a `NavigationSystem` that a restore rebuilds empty |
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

## Decision (proposed)

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

`GlobalTopologyId` is category 2 and does not currently meet it: the counter
must reset per recompute (or the id must be derived from the component's own
canonical key) so that identical geometry yields identical ids.

### Neither category may be left implicit
A counter that is neither snapshotted nor reset is the failure mode this ADR
exists to name. A new subsystem that mints ids states its category in the
module doc, and `tests/determinism/` gains a pin for it.

## Consequences

- `TopologyManager` needs a follow-up change: reset `nextGlobalId` per
  recompute, or key ids off the canonical component seed. That is a behaviour
  change to a public accessor (`getTopologyId`) and belongs in its own issue
  with its own tests, not smuggled into determinism hardening — which is why
  this ADR is proposed rather than applied.
- Path-request ids stay category 2 by exception: they are consumed only within
  one `NavigationSystem` lifetime, which a restore rebuilds empty
  ([ADR 0007](./0007-navigation-work-budgets-and-flow-fields.md)). If routing
  state ever enters a save, they become category 1.
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
