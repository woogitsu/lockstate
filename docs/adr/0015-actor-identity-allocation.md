# ADR 0015: Actor Identity Is Allocated, Not Derived

## Status
Accepted. Extends [ADR 0012](./0012-derived-identifier-reproducibility.md),
which is Accepted as of the same commit, so the taxonomy this ADR applies is
settled rather than pending — see **What this asks a human to accept**.

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
allocation. Issue #70 was adding save schema V3 regardless -- and it has
since shipped (`docs/PERSISTENCE.md`). When this ADR was written the envelope
carried only `kernel`/`world`/`construction`/`entities` while the runtime built
roughly thirty subsystems, and prisoners, staff, security, contraband and
incidents were not persisted at all. Neither half is true on `main` any more:
`sessionSystemsSchemaFor` (`src/persistence/save-schema.ts:784-794`) persists
`prisoners`, `operations`, `navigation`, `security`, `contraband`, `incidents`
and `economy` as the `simulation` section of both the V3 and the V4 payload.
The two routes are therefore weighed on their merits.

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
2. **Ids used to repeat.** The generation wrapped at 4,096: after 4,096
   destroy/spawn cycles at one index the id was identical to the one the
   *first* occupant of that slot carried, so a derived name would have handed
   the 4,097th occupant the first occupant's name. Prisons churn population;
   that was a long session, not a hypothetical.
   `tests/unit/actor-identity.test.ts` pins the *arithmetic* rather than
   asserting it in prose, and its consequences — worse than a repeated name —
   are stated in [ADR 0026](./0026-entity-id-lifetime.md): at the wrap
   `isAlive` reported a stale handle as live and `destroy` through one killed
   the entity now in the slot.
   **Correction, 2026-08-29 (#169): this is no longer true, and the argument
   does not need it to be.** ADR 0026 question 1 is answered — `EntityStore`
   now retires a slot that dies at its last generation instead of recycling
   it, so an id genuinely cannot repeat any more, at any recycle count. Point
   1 above (allocation policy) already carries this decision on its own, and
   the very next test in `actor-identity.test.ts` — a prisoner and a staff
   member sharing numeric id 0 across two different stores — is a case
   retirement does nothing to prevent, so "a name cannot be derived from an
   entity id" is unweakened. What changed is only that this specific
   supporting fact is now the thing ADR 0026 fixed rather than the thing it
   left open; `tests/unit/actor-identity.test.ts`'s pin was re-baselined to
   match, in the same commit.
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
  `loadSnapshot()`; the envelope field was #70's to add, and #70 has added it —
  `identity` is a field of both the V3 and the V4 payload
  (`src/persistence/save-schema.ts:838`, `:868`), with the snapshot shape at
  `:715`.
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

Three things, and they are deliberately separated because only the first was
blocking — and that one is now discharged:

1. **ADR 0012 itself.** This ADR applies 0012's taxonomy and is only as
   settled as 0012 is. **Both were accepted in the same commit**, so the
   taxonomy this ADR argues in is settled and the case this item guarded
   against — 0015 accepted while 0012 was not — cannot arise.
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
  ADR deliberately did not create the V3 bump. #70 has since made it, in the
  shape described above: `identity: actorIdentitySnapshotSchema.optional()` at
  `src/persistence/save-schema.ts:838` for V3 and `:868` for V4.
- **Session wiring — done.** `src/simulation/runtime/new-session.ts` had to
  register the `identity.actor-name` stream alongside the existing three,
  construct the registry, pass it to `PrisonerOperationsRuntime`, and mint for
  each `GuardRoster.hire`. All four have since landed: `:187` registers the
  stream, `:196` constructs the registry, `:198` passes it to
  `PrisonerOperationsRuntime`, and `:248` constructs `GuardRoster` with the
  registry and a draw on that stream. Identity is therefore no longer inert.
  The reason it would otherwise have been still stands as written:
  `IntakeSystem` draws nothing when no registry is supplied, which matters
  because `NamedRngStreams.get` throws for an unregistered stream.
- **A destroy path must release.** Nothing destroys a prisoner or a guard
  today. Whichever change first does must call `release`, or reuse
  `reconcile` as a safety net; a retained entry eventually misnames a
  recycled slot.
  **Superseded 2026-09-15 in its second sentence and met in its third:** both
  destroy paths exist now and both call `release`. The bullet is left as
  written because it is the requirement that was placed on them, and the
  amendment of 2026-08-27 below carries the measurement under *"Nothing
  destroys a prisoner or a guard today"*.
- **The stream is claimed.** `identity.actor-name` is drawn from by this
  module and nothing else. `tests/unit/actor-identity.test.ts` runs the same
  seeded session with and without naming and requires the classification
  outcomes to be identical, so contamination is a test failure rather than
  a review question.
- **`GlobalTopologyId` is untouched.** ADR 0012's own follow-up remains
  open; this ADR neither fixes nor depends on it.

## Alternatives considered

- **Derive the name from the entity id.** Rejected above: the id is a slot
  handle that changes with allocation policy and collides across the two
  entity stores, and deriving forecloses renaming. (It also used to wrap
  every 4,096 recycles; #169 closed that specific recurrence, and the
  rejection does not depend on it — see the 2026-08-29 correction above.)
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

## Amendment, 2026-08-27: eight of this document's `file:line` citations point at unrelated code, the function one of them names no longer exists, and `identity` is in three payload versions rather than two

*This amends **the Context paragraph on the save envelope and the first two
Consequences bullets**. No decision moves and no substantive claim in this ADR is
withdrawn — everything the decision rests on re-verifies exactly, and that is
recorded below rather than assumed. What has gone wrong is that this document
cites production code by line number, and the code moved. The form is ADR 0029's
amendment and ADR 0034 §9's: the old wording is quoted rather than overwritten.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every line cited below, old and new, was opened on that tree.*

> **Corrected 2026-09-15. The pin is kept word for word and is advisory: the
> "new" column of the table below has itself gone stale, which is the sharpest
> demonstration in this corpus of what `docs/adr/README.md`'s *"A global anchor
> pin in an ADR is advisory, and does not date what is below it"* — added by
> pull request #1231, not on `main` as this is written — is about.** A section
> whose entire subject is re-anchoring, written to fix eight drifted anchors,
> drifted on all eight of its own replacements inside three weeks. The
> corrections are set beside the table rather than written into it, so that the
> record of what this document said at `792bf94` survives.
>
> **One of the replacements is worse than stale and is the reason the "no
> offsets" rule exists.** `new-session.ts:496` is cited in the table as
> `new GuardRoster(...)`. Today `src/simulation/runtime/new-session.ts:496` is
> `const actorIdentity = new ActorIdentityRegistry();` — a different line of
> this ADR's own wiring, which reads correct to anyone checking the file name
> and the neighbourhood rather than the sentence.
>
> **Two claims in "What was re-verified and is intact" are not anchor problems
> and have gone flatly false.** Both are corrected at their own bullets below,
> and both are about things this ADR calls open that have since closed.
>
> `(v0.0.121)` is checked and kept: `package.json` reads `0.0.121` at `792bf94`.
> It is not the tag — `v0.0.121` is `54418b6`, fifty commits earlier.

### The citations, and what is at each of them now

`docs/AGENT_WORKFLOW.md` §4 rates a `file:line` into code as the *durable* kind
of citation, because grep can check it. That is only true if somebody runs the
grep. Nobody had, and every one of these was wrong:

| This ADR says | What is there at `792bf94` | Where it actually is |
| --- | --- | --- |
| `save-schema.ts:784-794` — `sessionSystemsSchemaFor` | the middle of the `gangs` sub-schema | `sessionSystemsShapeFor`, `:922-934` |
| `save-schema.ts:838` — V3 `identity` field | a comment about `poolId` tolerance | `:982` |
| `save-schema.ts:868` — V4 `identity` field | `const MAX_PENDING_DELIVERIES = 4_096;` | `:1012` |
| `save-schema.ts:715` — the identity snapshot shape | the contraband search queue | `actorIdentitySnapshotSchema`, `:841` |
| `new-session.ts:187` — registers the stream | a doc comment on `guardRelease` | `:292` |
| `new-session.ts:196` — constructs the registry | a doc comment on staffing requirements | `:301` |
| `new-session.ts:198` — passes it to `PrisonerOperationsRuntime` | the same comment block | `:325` |
| `new-session.ts:248` — constructs `GuardRoster` | `const DEFAULT_GUARD_CAPACITY = 500;` | `:496` |

**Re-swept 2026-09-15, by opening each line rather than by applying an offset.**
Every entry in the right-hand column above is now history. Where each subject is
on `main`:

| subject | the table's column | 2026-09-15 |
| --- | --- | --- |
| `sessionSystemsShapeFor` | `:922-934` | `src/persistence/save-schema.ts:1227` |
| V3 `identity` field | `:982` | `src/persistence/save-schema.ts:1361` |
| V4 `identity` field | `:1012` | `src/persistence/save-schema.ts:1391` |
| `actorIdentitySnapshotSchema` | `:841` | `src/persistence/save-schema.ts:1034` |
| registers the stream | `:292` | `src/simulation/runtime/new-session.ts:487` |
| constructs the registry | `:301` | `src/simulation/runtime/new-session.ts:496` |
| passes it to `PrisonerOperationsRuntime` | `:325` | `src/simulation/runtime/new-session.ts:596` |
| constructs `GuardRoster` | `:496` | `src/simulation/runtime/new-session.ts:1029` |

The seven-key list is still exactly the seven keys, at
`src/persistence/save-schema.ts:1232-1238`.

Two of those are worse than an offset. **`sessionSystemsSchemaFor` does not
exist**: `grep -rn "sessionSystemsSchemaFor" src/ tests/` is empty. It was
renamed to `sessionSystemsShapeFor` in `6cededc`, *"Object placement phase 1"*
(#320), on 2026-08-25 at v0.0.61 — so this ADR names a symbol no grep can find,
which is the one failure mode a code citation is supposed to be immune to.

### And there are three payload versions now, not two

The Context says:

> `sessionSystemsSchemaFor` (`src/persistence/save-schema.ts:784-794`) persists
> `prisoners`, `operations`, `navigation`, `security`, `contraband`, `incidents`
> and `economy` as the `simulation` section of both the V3 and the V4 payload.

and the Decision and Consequences each repeat the pairing — *"`identity` is a
field of both the V3 and the V4 payload"*, *"`identity:
actorIdentitySnapshotSchema.optional()` at … for V3 and … for V4"*.

The **seven-key list is still exactly right** (`save-schema.ts:927-933`). The
pairing is not. `identity: actorIdentitySnapshotSchema.optional()` occurs three
times — `savePayloadV3Schema` (`:982`), `savePayloadV4Schema` (`:1012`) and
`savePayloadV5Schema` (`:1077`) — because `6cededc` added V5 in the same commit
that did the rename. **An enumeration of versions in prose beside a schema file
that adds them is `docs/AGENT_WORKFLOW.md` §4's rotting shape**, and "both the V3
and the V4" rots harder than a tally would, because it reads as exhaustive while
naming no total.

**What these passages should say:** *`identity` is a session-level field of every
payload version that has one — V3 onward — and `sessionSystemsShapeFor` builds
the `simulation` section they share.* Named by symbol rather than by line, and
by "every version" rather than by a list, because both of those survive the next
schema bump and neither of the current forms did.

> **2026-09-15: the prescription above survived the next schema bump. This
> section's own heading did not, and it is left standing because that is the
> whole point of it.** The heading says *"`identity` is in three payload
> versions rather than two"*. It is in **four**: `savePayloadV6Schema` carries
> `identity: actorIdentitySnapshotSchema.optional()` at
> `src/persistence/save-schema.ts:1497`, beside V3's `src/persistence/save-schema.ts:1361`, V4's `:1391` and
> V5's `src/persistence/save-schema.ts:1460`. A section written to condemn *"both the V3 and the V4"* as a
> rotting enumeration replaced it with a different tally in its own title, and
> that tally rotted in nineteen days — which is `docs/AGENT_WORKFLOW.md` §4's
> *"a correction is no more durable than the claim it corrected"* arriving on
> the shortest possible schedule. **Neither the heading nor the paragraph above
> is rewritten**: the durable sentence is already written out above, in the
> paragraph beginning *"What these passages should say"*, and it needed no
> edit.

### What was re-verified and is intact

Every claim the decision rests on holds, and each was re-run rather than
inherited:

- **The wiring is all there**, at the corrected lines:
  `src/simulation/runtime/new-session.ts:292` registers `ACTOR_IDENTITY_RNG_STREAM`
  as one of four streams derived from `masterSeed`, `:301` is `new
  ActorIdentityRegistry()`, `:325` constructs `PrisonerOperationsRuntime` with it,
  and `:496` is `new GuardRoster(DEFAULT_GUARD_CAPACITY, actorIdentity, () =>
  kernel.rng.get(ACTOR_IDENTITY_RNG_STREAM))`.
- **"`ActorIdentityRegistry.rename` exists today with no command wired to it"** —
  still true. Every `.rename(` call site in the repository is in
  `tests/unit/actor-identity.test.ts`. So the third thing this ADR asks a human
  to accept is still genuinely open rather than quietly settled by shipping.
- **"Nothing destroys a prisoner or a guard today"** — still true. Every
  `.destroy(` in `src/` is a Phaser display object under `src/rendering/`.

  > **False as of 2026-09-15, in both halves, and this is the finding of this
  > pass.** `.destroy(` in `src/` no longer lives only under `src/rendering/`:
  > it is also `src/ui/hud/`'s four display-object teardowns and, decisively,
  > **two entity destructions in `src/simulation/`** —
  > `entityStore.destroy(entityId);` in `releasePrisoner`
  > (`src/simulation/prisoners/release.ts:216`) and
  > `this.entityStore.destroy(entityId);` in `GuardRoster.forget`
  > (`src/simulation/security/guard-roster.ts:147`). Both populations this ADR
  > names are destroyed in an ordinary session now.
  >
  > **The obligation the Consequences bullet states is met on both paths, and
  > that was checked rather than assumed.** `releasePrisoner` calls
  > `surfaces.identity?.release('prisoner', entityId);`
  > (`src/simulation/prisoners/release.ts:210`) before the destroy on `:216`.
  > `GuardRoster.forget` itself does not release — it is reached through
  > `dismissStaff` (`src/simulation/staff/dismissal.ts:297`), whose own step 6
  > is *"**The name is given back.**"* and which releases the staff identity
  > first. So no retained entry is waiting to misname a recycled slot, and the
  > *"or reuse `reconcile` as a safety net"* half was not needed.
  >
  > **One thing is left standing that this document cannot fix, and is recorded
  > rather than repaired here.** `src/simulation/identity/actor-identity.ts`
  > still says of `ActorIdentityLifecycle` that *"`GuardRoster` still takes the
  > minter alone, which is honest: no path in `src/` dismisses a guard, so
  > nothing there has a release to call yet"*, while
  > `src/simulation/security/guard-roster.ts` says twelve lines above its own
  > destroy that *"**That destroy path now exists** (issue #533)"*. Two files in
  > one directory contradicting each other about the same fact — the shape
  > `docs/AGENT_WORKFLOW.md` §4 says no diff finds. Naming it is all this ADR
  > can do; the edit is `src/`'s.
- **"`identity.actor-name` is drawn from by this module and nothing else"** —
  still true. The two `kernel.rng.get(ACTOR_IDENTITY_RNG_STREAM)` sites are
  `new-session.ts:496` and `src/simulation/prisoners/intake-system.ts:293`, and
  both hand the stream to the registry rather than drawing from it themselves
  (`:293` is `this.identity.assign('prisoner', entityId,
  context.rng.get(this.identityRngStreamName))`).

  > **Re-verified 2026-09-15: the claim holds and both anchors have moved.**
  > There are still exactly two draw sites and both still hand the stream
  > straight to the registry. They are `src/simulation/runtime/new-session.ts:1029`
  > (the `GuardRoster` construction) and
  > `src/simulation/prisoners/intake-system.ts:517`, which is still
  > `this.identity.assign('prisoner', entityId, context.rng.get(this.identityRngStreamName));` (verbatim in `src/simulation/prisoners/intake-system.ts`).
- **"`PLACEHOLDER_ACTOR_NAME_POOL` (32 given × 32 family names)"** — counted:
  32 and 32.
- **The disjointness assertion exists**, at
  `tests/unit/actor-identity.test.ts:278`, against `defaultLocaleEnCatalog`.
  **Re-aimed 2026-09-15 to `tests/unit/actor-identity.test.ts:290`**, the case
  titled *"shares no entry with the default locale catalog, so a name can never
  read as a translation (ADR 0011)"*; it is unchanged in substance, and `:278`
  now falls on the `describe('actor name pool', ...)` that opens the block
  containing it.
- **"No names; label rows by entity id … what the HUD does today"** — still true,
  and it is the one worth a reader's attention. `grep -rn "givenName" src/ui/` is
  **empty**. Four projections carry the name —
  `src/simulation/presentation/prisoner-projection.ts:119` and `:141`,
  `staff-projection.ts:81`, `guard-release-projection.ts:124` — and nothing in
  the browser UI reads any of them. So a name is minted from a seeded stream,
  carried in state, written to the save and projected across the worker boundary,
  and no player has ever seen one. The gap this ADR opens with — *"a roster row
  has nothing to label itself with"* — is still open, one consumer short.

  > **False as of 2026-09-15, and it is the closing of this ADR's opening
  > sentence.** `grep -rn "givenName" src/ui/` is not empty. The consumer
  > exists: `src/ui/hud/roster-panel.ts:623` renders a roster row as
  > `t(HUD_MESSAGE_KEY.regimeRosterName, { given: name.givenName, family: name.familyName })`
  > — a message key with the two parts passed separately, which is the shape
  > §"The name is not localizable content" asks for (*"The projections expose
  > `givenName` and `familyName` separately rather than one composed string"*),
  > reaching the player through the localizer rather than as a composed string
  > from the simulation. `src/ui/simulation-events.ts:1498-1502`,
  > `src/ui/simulation-prisoner-detail.ts:128` and
  > `src/ui/simulation-prisoner-roster.ts:204` carry it the rest of the way.
  >
  > **The projection anchors moved and their shape changed with them**, so they
  > are re-stated by subject rather than re-numbered: the three projections
  > compose the field through `toActorNameViewModel` —
  > `src/simulation/presentation/prisoner-projection.ts:331`,
  > `src/simulation/presentation/staff-projection.ts:196` and
  > `src/simulation/presentation/guard-release-projection.ts:199` — and the
  > view-model type they build is
  > `src/simulation/presentation/view-model.ts:235`. The old *"Four
  > projections"* is left above as history; a count of projections is exactly
  > the sentence `docs/AGENT_WORKFLOW.md` §4 says to avoid, and it is not
  > replaced with another one.
  >
  > **What this does to the document.** The Alternatives bullet *"No names;
  > label rows by entity id. — Honest, and what the HUD does today"* is now a
  > description of a tree that no longer exists, and it is kept there as the
  > record of a rejected option rather than corrected in place. Nothing in the
  > Decision moves: names are still allocated, still keyed by
  > `(actorKind, entityId)`, still snapshotted. What has gone is the last
  > sentence of this bullet — a player has seen one.
