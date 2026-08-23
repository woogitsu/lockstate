# ADR 0015: Actor Identity Is Allocated, Not Derived

## Status
Proposed. Extends [ADR 0012](./0012-derived-identifier-reproducibility.md),
which is itself Proposed — see **What this asks a human to accept**.

## Context

`docs/HUD_PROJECTIONS.md` opens its gap list with the same sentence twice:
a prisoner is an entity id, a classification, a risk tier and a
`priorIncidentsAtIntake` integer, and a `GuardRoster` entry is an entity id
and a `staffRoleId`. **A roster row has nothing to label itself with.** No
name, no portrait, no age, no offence. Every other HUD gap is about
enriching a row; this one is about a row being identifiable at all.

Adding a name looks like a content task and is not. It is
[ADR 0012](./0012-derived-identifier-reproducibility.md)'s question,
concretely: is a name a **stable identity** the simulation allocates and
carries, or a **value derived** from state and recomputed on read? ADR 0012
requires every identifier that can influence state, cross a save boundary
or appear in challenge evidence to fall into exactly one category and to
say which in its declaring module. It explicitly forbids leaving the
category implicit — "a counter that is neither snapshotted nor reset is the
failure mode this ADR exists to name."

Both routes satisfy determinism, which is why the choice needs an argument
rather than an intuition:

- **Derived.** `name = f(entityId)` drawn from a named RNG stream at read
  time. Nothing stored, nothing in the save envelope, the same prison
  always yielding the same names.
- **Allocated.** The name is minted once from a named RNG stream at intake
  and then carried as state, snapshotted like any other state.

"Stored costs a save-schema bump" is no longer an argument against
allocation. Issue #70 is adding save schema V3 regardless: the envelope
today carries only `kernel`/`world`/`construction`/`entities` while the
runtime builds roughly thirty subsystems, and prisoners, staff, security,
contraband and incidents are not persisted at all. The two routes are
therefore weighed on their merits.

### The decisive fact: an `EntityId` is a storage slot, not a person

`EntityStore` (ADR 0005) packs an id as a 20-bit index plus a 12-bit
generation. `destroy()` pushes the index onto a `freeIndices` stack and
does `generations[index] = (generations[index] + 1) & 0xFFF`; `spawn()`
pops that stack first. Three consequences follow, and all three are fatal
to a derived name:

1. **The id is a function of allocation policy, not of the actor.** Which
   index an arrival lands on depends on the destroy order of everyone
   before them. Any future change — reserving index ranges per population,
   compacting indices on load, pooling entities for actors temporarily off
   the map — silently renames the entire prison, in every existing save, on
   a build that changed nothing about naming.
2. **Ids repeat.** The generation wraps at 4,096. After 4,096
   destroy/spawn cycles at one index the id is identical to the one the
   *first* occupant of that slot carried, so a derived name would hand the
   4,097th occupant the first occupant's name. Prisons churn population;
   this is a long session, not a hypothetical.
   `tests/unit/actor-identity.test.ts` pins the wrap rather than asserting
   it in prose.
3. **Ids are not unique across populations.** Prisoners live in
   `PrisonerOperationsRuntime`'s `EntityStore` and staff in `GuardRoster`'s
   own, separate one. Both hand out id `0`. A name derived from the id
   alone gives a prisoner and a guard the same name, and there is no
   ambient "which store did this come from" to disambiguate — the caller
   has to supply it, which means the key was never the id in the first
   place.

Put in ADR 0012's own vocabulary: a derived value is "a label for a
*current* property of state, recomputed whenever that state changes … not
treated as stable across recomputes by any consumer." A player treats a
name as maximally stable. They learn it, they search for it, they say "Kowal
started the riot". The one thing a name may never do is change because
storage was reorganised.

Deriving also makes player renaming structurally impossible: a value
recomputed on every read cannot be overridden.

## Decision

**A prisoner's or staff member's name is an allocated identity — ADR 0012
category 1.**

- **Keyed by `(actorKind, entityId)`**, never by entity id alone, because
  the two populations' ids collide.
- **Minted once** from a dedicated named RNG stream, `identity.actor-name`,
  at the intake pipeline's `reception` stage, inside `EntityQuery`'s
  canonical ascending-entity-id walk. The same seed and command stream
  therefore mint the same names in the same order — the ADR 0009 guarantee
  is met by making the *minting* reproducible, not by making the name
  recomputable.
- **Idempotent.** Minting for an actor that already has a name returns it
  without drawing, so a replayed or re-entrant call cannot shift the stream
  and change the *next* actor's name.
- **Carried, never re-derived**, and **released when the actor is
  destroyed** — mandatory, because the index is recycled.
- **Part of the session snapshot**, and restored such that no future mint
  can collide with a restored one. The registry owns `getSnapshot()` /
  `loadSnapshot()`; the envelope field is #70's to add (see below).
- **Renameable**, with no RNG involvement. `ActorIdentityRegistry.rename`
  exists today with no command wired to it, so the decision is not quietly
  reversible.

### The name is not localizable content

ADR 0011 defines three namespaces — stable id, message key, translated text
— and forbids simulation code from producing the third. A proper name is
none of them. It is never authored into a content catalog, never
translated, and identical in every locale: state that happens to be a
string, like a room instance id. It carries no `nameKey` and belongs in
`src/simulation/identity/`, not `src/content/`.

This is compatible with, and does not weaken, the localization-boundary
test, which fails any projected string that *equals a translation* in the
default `en` catalog. A name never does, and the name pool is asserted
disjoint from that catalog so it stays true as either side grows.

The projections expose `givenName` and `familyName` separately rather than
one composed string, because which order they read in is a presentation
choice the simulation should not bake in.

### The name pool is a placeholder, and says so

`PLACEHOLDER_ACTOR_NAME_POOL` (32 given × 32 family names) exists to unblock
the HUD. It is injected into the registry rather than hard-wired, so
replacing it is a call-site change. Because names are stored, replacing the
pool renames nobody who already exists — only future arrivals — which is
another property the derived route could not offer.

## What this asks a human to accept

Three things, and they are deliberately separated because only the first is
blocking:

1. **ADR 0012 itself.** This ADR applies 0012's taxonomy and is only as
   settled as 0012 is. Accepting 0015 without 0012 leaves the taxonomy it
   argues in still Proposed.
2. **That a name entering the save envelope is wanted.** The engineering
   argument above says a name cannot be a function of an entity id. It does
   not by itself say the game should have names at all, or that identity
   should persist rather than being cosmetic per-session decoration.
   Persisting it is the recommendation and the implementation, but it is a
   product commitment: it makes an actor's name a migration concern
   forever.
3. **Whether players may rename actors.** Storage makes it possible;
   nothing here decides that it should ship. If the answer is no, `rename`
   stays an internal scenario-authoring API and no command is added.

The pool's contents are explicitly *not* on this list. They are a
placeholder to be replaced by authored content, and replacing them requires
no decision recorded here.

## Consequences

- **Persistence (#70).** The registry snapshot is a flat, JSON-safe,
  canonically ordered array — `{ version, poolId, entries: [{ kind,
  entityId, givenName, familyName }] }` sorted by declared kind then
  ascending entity id. It belongs in the V3 payload as its own
  session-level field (`identity`), **not** nested under prisoners or
  staff, because it spans both `EntityStore`s. Restoring it is
  `registry.loadSnapshot(payload.identity)`; absent, a V2 save restores to
  an empty registry and every roster row simply projects no name, which is
  the same state a session that never registered the RNG stream is in. This
  ADR deliberately does not create the V3 bump.
- **Session wiring.** `src/simulation/runtime/new-session.ts` must register
  the `identity.actor-name` stream alongside the existing three, construct
  the registry, pass it to `PrisonerOperationsRuntime`, and mint for each
  `GuardRoster.hire`. Until it does, identity is inert: `IntakeSystem`
  draws nothing when no registry is supplied, which matters because
  `NamedRngStreams.get` throws for an unregistered stream.
- **A destroy path must release.** Nothing destroys a prisoner or a guard
  today. Whichever change first does must call `release`, or reuse
  `reconcile` as a safety net; a retained entry eventually misnames a
  recycled slot.
- **The stream is claimed.** `identity.actor-name` is drawn from by this
  module and nothing else. `tests/unit/actor-identity.test.ts` runs the same
  seeded session with and without naming and requires the classification
  outcomes to be identical, so contamination is a test failure rather than
  a review question.
- **`GlobalTopologyId` is untouched.** ADR 0012's own follow-up remains
  open; this ADR neither fixes nor depends on it.

## Alternatives considered

- **Derive the name from the entity id.** Rejected above: the id is a slot
  handle that changes allocation policy, wraps every 4,096 recycles, and
  collides across the two entity stores, and deriving forecloses renaming.
- **Allocate a separate stable `personId` counter and derive the name from
  *that*.** This fixes the slot-handle problem — a monotonic per-session
  counter, snapshotted like `IncidentTriggerSystem.sequence`, is a fine
  category-1 identity. But the name is then still a pure function of
  `(seed, personId, pool)`, so reordering or editing the pool renames every
  existing actor in every existing save, and renaming remains impossible.
  It saves two short strings per actor in the envelope and costs the two
  properties the decision was made for.
- **Content-address the name** (hash the intake record). Same objection as
  ADR 0012 raised for category 2 generally, plus a new one: two prisoners
  with identical intake input would be forced to share a name.
- **Put names in the content catalog with `nameKey`s.** Wrong namespace: it
  implies names are translated, and it would make the localization-boundary
  test's premise false rather than merely untested.
- **No names; label rows by entity id.** Honest, and what the HUD does
  today. Rejected because "Prisoner #4108" is an id leaking into the
  interface, and because it makes the id — the least stable thing in the
  system — the thing a player memorises.
