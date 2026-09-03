# ADR 0063: What a refused restore says, and whose fault it is

> **0063 was assigned centrally**, after this draft returned, which is the
> practice `AGENTS.md` records precisely so that two agents drafting at once
> cannot take one number. The arithmetic was re-derived from disk at the
> moment of writing rather than taken on trust: `docs/adr/` held 0062 as its
> highest number, the contract in
> `tests/foundation/adr-numbering-contract.test.ts` is `max(on disk) + 1`, and
> 0059 and 0061 — held by drafts in flight — are both *below* that maximum and
> so move nothing. **This document pre-commits to renumbering without
> argument** if an unmerged branch turns out to hold 0063, and every citation
> of "ADR 0063" added by the same branch moves with it.
>
> One consequence for whoever integrates: the two in-flight drafts each write
> `Next free number: 0063` as well, correctly, because they were computed
> before this file existed. Whichever of the three lands last has to move that
> line; landing this one first makes it 0064, which is what the line below the
> table now says.

## Status

**Proposed, 2026-08-28.** Decided under the owner's standing mandate
(`AGENTS.md`, "The owner's standing mandate": research, decide, record — rather
than ask). The implementation landed on `agent/431-restore-refusal-reasons`
ahead of this document, deliberately and for the reason ADR 0038 gives for the
same order: the defect is live rather than hypothetical, and this document is
what the branch should be judged against.

**Open question 1 is explicitly *not* decided here.** It is a player-visible
promise, which `AGENTS.md`'s fourth exclusion reserves to the owner, and
nothing on the branch adds a locale key.

## Context

Issue #431, broken out of #403.
[ADR 0038](./0038-what-makes-a-save-compatible.md) decided *what makes a save
compatible*; it deferred *what a refusal says* by name, pointing it at "#403
mitigation (a) — where a `TypeError` from our own restore code is the
motivating example for classifying code-fault against data-fault". This is that
decision.

Measured on `main` @ `1f24f90` (v0.0.149), the tree this branch was cut from:
`SimulationWorkerStateMachine.handleInitialize` wrapped `restoreSimulationRuntime`
in one `catch` and reported everything it caught as `snapshot-incompatible`,
and `WorkerSessionHost` turned that into a `SnapshotRestoreRejectedError`
carrying a message string and a `cause`. So a save this build cannot read and a
defect in this build's own restore code arrived at the persistence layer as the
same class with different prose.

That costs twice, and the second cost is the one that compounds. The player is
told their file is unreadable when the fault is ours — the save panel renders an
exhausted window as `save.status.no-readable-generation`, *"No readable save
generation remains for this prison. Every retained copy failed validation."* —
and a support report cannot be told from a bug report.

### What was already fixed, and is therefore not this

The issue as filed is partly stale, and saying which part matters because the
remedy for the stale part is a bound and the remedy here is a diagnosis:

- #403 (d) landed: a refused generation is retired only once a *different* one
  has restored, so a deterministic failure already cost no generation.
- #438/#468 landed the import half of the same rule.
- The class boundary the issue asks for at the demotion decision was already
  there: `src/persistence/session/session-controller.ts` read
  `if (!(error instanceof SnapshotRestoreRejectedError)) throw error;`.

**What was missing is the distinction *within* a refusal**, and that is the
whole subject of this document.

### Two things the briefing for this work assumed, and what is true

Recorded in both directions, because the record of *why* the taxonomy has three
arms and not four is worth more than the taxonomy, and both corrections came
from opening the code rather than from reasoning about it.

- **The briefing named `tests/fixtures/persistence/save-v1-in-progress.json` as
  a live specimen of a save that migrates and checksums cleanly and cannot be
  restored.** It is not one any more. #433's code landed in `6172774`, and
  `tests/integration/session-restore-failure.test.ts` restores
  that fixture and reads both entity ids back out of the running session. The
  specimen that survives is the one that test file built to replace it: a V1
  ledger whose *written prefix* exceeds this build's `DEFAULT_PRISONER_CAPACITY`,
  which is refused by `EntityStore.loadSnapshot` — and that is the canonical
  `unsupported-by-this-build` case below. The GitHub issue is still open while
  its code is done, which is how the stale reading survived.
- **The briefing proposed a category covering "a version, a shape, a
  checksum".** Shape and checksum never reach a restore: `decodeSaveEnvelope`
  refuses them first under its own six-code taxonomy (`docs/PERSISTENCE.md`,
  "Error taxonomy"), and everything arriving at a restore has already passed
  schema, migration and checksum validation. An arm for them would have been
  **permanently unreachable**, which is worse than a missing arm because it
  reads as covered. That is why the count below is three rather than four.

## Decision

### 1. Three reasons, and the third is not a refusal

A restore attempt that produced no session ended for exactly one of these:

| Reason | What it means | Whose fault | May the generation be retired? |
| --- | --- | --- | --- |
| `unsupported-by-this-build` | The payload is coherent and this build cannot interpret it: a snapshot `schemaVersion` it does not implement, an entity ledger whose written prefix is wider than it allocates, an actor-identity snapshot version it does not know, an RNG algorithm it does not implement. | Neither. The bytes are fine and another build reads them. | Yes, once a different generation has restored — and see open question 2. |
| `damaged-payload` | A declared check found the content inconsistent with itself: a terrain run that overruns its chunk, an RNG stream that is not four words, a `simulation` section with no `entities`, an identity snapshot naming one entity twice, a construction section with no `orders` array. | The save. No build restores it. | Yes, once a different generation has restored. |
| `restore-code-fault` | Nothing declared a refusal and an exception escaped. | **This build.** No verdict has been reached about the save at all. | **No, ever.** |

**Three and not four**, for the reason recorded in Context: shape and checksum
are refused a boundary earlier.

**Three and not two.** Collapsing the first two rows into "the save is bad" is
what makes a save a *newer build wrote* indistinguishable from a corrupt one,
and those two want opposite handling. It is the distinction #432's quarantine
has to make — one row describes bytes worth keeping for the build that can read
them, the other describes bytes worth keeping only as evidence — and it is the
only one of the three that changes what a player could usefully *do*.

**`restore-code-fault` is deliberately not a member of the refusal enum**
(`SNAPSHOT_REFUSAL_REASONS` in
`src/simulation/runtime/restore-refusal.ts`). It is not a refusal: nothing
judged the save, so nothing may be concluded about it.

### 2. The reason is decided at the check that refused it, never at the boundary

Every deliberate rejection on the restore path raises a `SnapshotRefusedError`
carrying its reason, and `restoreFailureReasonOf` is the entire classifier: one
`instanceof`, no message inspection, and **no table of error classes to keep in
step with the throw sites** — a reason exists because a site declared it, and
its absence is itself the third answer.

`SnapshotRefusedError extends RangeError`, and `WorldSnapshotError` and the new
`EntitySnapshotError` extend that, so every `toThrow(RangeError)` and
`toThrow(WorldSnapshotError)` assertion already in the suite keeps holding and
gains a reason underneath it. `tests/unit/run-length-codec-unification.test.ts`'s
*"keeps each plane its own error type rather than a shared generic one"* is the
assertion that would otherwise have had to be weakened in the same change that
altered what it guards, and it is untouched.

That the classification is not inferred is asserted as a falsifiable pair in
`tests/unit/restore-refusal-reasons.test.ts`: the *verbatim message a real
refusal produced*, put on a plain `RangeError`, must classify as
`restore-code-fault`, and a `SnapshotRefusedError` whose message is `'xyzzy'`
must still report its declared reason. No implementation that reads messages
passes both.

### 3. Only a check whose input can come from nowhere but a save declares one

Validators shared with a live session keep throwing what they throw:
`NamedRngStreams`' name-shape and uniqueness rule,
`SecuritySectorRegistry.register`'s duplicate-id refusal, and the
content-definition lookups inside `restoreSessionSystems`' subsystem graph.
Relabelling them would tell a developer who mistyped a stream name **in code**
that a save was bad, which is this issue's own defect pointed the other way.

The consequence is stated rather than hidden, and it runs in one direction
only: such a refusal is blamed on this build, so the walk still tries the next
generation, still retires nothing, and the player is told the load failed
rather than that their saves are unreadable. At worst a genuinely bad
generation is retired later than it could be, and the next load retries it.
This is the boundary of the taxonomy, and open question 3 asks whether it
deserves a gate — boundaries rot silently.

### 4. Two error classes, so the demotion path is closed by the type system

`SnapshotRestoreRejectedError` gains the declared `reason`; a code fault is a
separate `SnapshotRestoreFaultError`. `SessionController.loadPrison` decides
demotion by `instanceof SnapshotRestoreRejectedError`, so #431's *"a code fault
must not enter the demotion path at all"* is held by the type system rather
than by a second conditional a later edit can drop, or by a reviewer noticing.

A field on one class would have been simpler and is rejected for exactly that:
the property that matters would then be one careless edit from gone.

### 5. A code fault continues the walk and retires nothing

`loadPrison` keeps two sets. `attempted` is the skip set and is what makes the
walk terminate; `refused` is the subset a declared verdict was reached about,
and it is the only thing the retirement loop reads. A code fault joins the
first and never the second.

The walk continues because our defect may be specific to what one generation
happens to contain, and abandoning the load would cost the player a recovery
they can have. If the walk runs out having hit at least one code fault, the
first is **thrown** rather than `no-valid-generation` being returned: the two
say different things to the player and only one of them would be true.

### 6. The reason crosses the worker boundary in `protocol/error`'s `details`

`protocolFaultSchema` has declared `details: jsonValueSchema.optional()` since
[ADR 0003](./0003-simulation-worker-protocol.md)'s envelope contract and
nothing emitted one. Using it needs **no new fault code, no protocol version
bump and no save-schema change** — the last matters because
[ADR 0038](./0038-what-makes-a-save-compatible.md) governs it and nothing here
touches the persisted bundle. The main thread narrows the received value
against the closed set rather than casting it.

A `snapshot-incompatible` fault that declares **no** reason is treated as our
defect rather than as a refusal. All three producers declare one, so a fault
without one is a producer that forgot, and guessing a verdict about a player's
save on its behalf is the move this document deletes.

### 7. A restore-code fault is `internal-error`, and it is recoverable

**The code**, because the HUD's alert list renders one sentence per fault code
and `hud.alert.fault.snapshot-incompatible` reads *"The save could not be
loaded — this build does not understand its format."*, which is a claim about
the player's file. `hud.alert.fault.internal-error` already exists in
`src/content/default-locale-en.ts` and is true. No key is added.

This does not contradict [ADR 0038](./0038-what-makes-a-save-compatible.md) §5,
*"whatever is refused is refused at restore, and is never an
`internal-error`"*: what §5 forbids is a **save-compatibility condition**
arriving as an internal error, and a defect in our own restore code is not one.

**Recoverable** is the one place this document reads
[ADR 0024](./0024-protocol-fault-recoverability.md) more narrowly than its
prose, so the argument is written out rather than the conclusion — the next
reader meets §1's words before these.

ADR 0024 §1 contrasts a refused envelope with the other `fault()` call sites:
*"`internal-error` after a caught exception **may** have left a system part-way
through its work; `already-initialized` refuses a request that would have
replaced authoritative state. Those are real faults."* The operative word is
*may*, and the test §1 actually applies is the sentence before it — whether the
failure reached simulation state, which is why a decode failure is recoverable
("by construction, a message that reached no simulation state").

Apply that test here and it answers no, provably. `restoreSimulationRuntime` is
a factory: it holds no reference to the state machine, it constructs an
entirely new runtime, and `this._runtime` and `this._kernel` are assigned only
from its return value. A throw inside it leaves the worker exactly
`uninitialized` — the same fact `rejectedSnapshotFault` passes
`recoverable: true` for one branch up, in the same method.

**And the consequence is what makes this a decision rather than a
technicality.** A `faulted` worker answers the recovery walk's next attempt
`already-initialized`, so a non-recoverable pairing would silently cost the
player the recovery decision 5 exists to give them. Measured while building
this: with the fault raised non-recoverable, a prison whose newest generation
provoked a code fault failed to load at all rather than falling back to the
older generation that restores fine.

## Alternatives considered

### Two reasons: bad save, our bug

The minimum #431 asks for, and it satisfies every acceptance criterion.
Rejected: it leaves a save a newer build wrote indistinguishable from a corrupt
one — which is the question #432 must answer to decide what to quarantine, and
the only one whose answer changes what a player could do.

### A `reason` field on one error class, with `restore-code-fault` as an arm

Simpler, one class, one import. Rejected for decision 4's reason: the demotion
decision would become a conditional on a field rather than a check on a class.

### A thirteenth protocol fault code for a code fault

Rejected. `internal-error` already means it, already carries a player-facing
sentence, and is already in the emission set
`tests/foundation/fault-code-reachability-contract.test.ts` pins. A new code
would need a new sentence, which is a new player-facing promise for a
distinction the player cannot act on.

### Declaring a reason at every throw the restore path can reach

The literal reading of #431's *"every deliberate rejection inside
`src/simulation/runtime/restore-session.ts` and the modules it calls"*.
Rejected as written and kept as decision 3's narrower rule, because the modules
it calls include validators a live session shares.

### Ending the load on a code fault

The literal reading of #431's *"faults the session"*. Rejected: it costs the
player a recovery they can have, and the acceptance criterion it serves —
"leaves every retained generation untouched" — is satisfied more strongly by
decision 4, which makes the retirement path structurally unreachable rather
than merely untaken.

### Carrying the verdict in the persisted bundle

Out of scope by #431's own words and rejected on ADR 0038's grounds: a verdict
is a fact about a load, not about a save, and two builds would disagree about
it. Nothing here changes `SAVE_SCHEMA_VERSION`.

## Consequences

**Positive**

- A refusal says whose fault it is, at the point it is decided, and the
  demotion decision reads a declared value rather than a bound.
- A defect of ours can no longer reach the code that deletes saves — not
  "does not today", but cannot, because it is not that class.
- The player stops being told every retained copy failed validation when
  nothing validated anything.
- #432 can now ask a question it could not: *which* verdict was reached, and is
  this a save worth quarantining.
- `ConstructionSystem.restore` gains the structural guard ADR 0038 deferred, so
  the `TypeError` that motivated the whole classification is itself classified.

**Negative**

- An undeclared refusal (decision 3) is blamed on this build, so #103's
  rollback stops covering the module that threw it until someone declares it.
  The direction is safe and the set is written down, but it will grow quietly
  if new restore code throws bare errors.
- One more thing to get right at a throw site. A site that declares the *wrong*
  reason is worse than one that declares none, because it is believed.
- The walk now attempts every generation a code fault touches rather than
  stopping, which costs a worker start per generation on a path that already
  costs one per refusal.

## Open questions

1. **Should the player be told *which* save-side reason applied? This one is
   the owner's, and plainly so.** Today both `unsupported-by-this-build` and
   `damaged-payload` end an exhausted load at
   `save.status.no-readable-generation` — *"Every retained copy failed
   validation."* — which is accurate for the second and misleading for the
   first, where the honest sentence is closer to "this save was written by a
   version of Lockstate this build cannot read; update the game." That is a new
   player-visible promise, which `AGENTS.md`'s fourth exclusion reserves to the
   owner. It is also a promise with a **precondition**: it is only keepable once
   #432 stops deleting the save the player is being told to come back for.
   Nothing on this branch adds a locale key. The gate that surfaced this rather
   than letting it pass unnoticed is
   `tests/unit/simulation-message-keys.test.ts`, which refuses a new enum
   unless it is labelled or exempted with a written reason.
2. **Should `unsupported-by-this-build` be retirable at all?** Decision 1 keeps
   today's behaviour, because changing it is #432's subject. But that reason's
   whole meaning is "another build reads this", and deleting it is the one
   deletion quarantine exists to prevent. If #432 lands, this reason is its
   first customer; if it does not, this row deletes saves it has just declared
   readable.
3. **Does the undeclared set deserve a gate?** A contract test could enumerate
   `throw` statements reachable from `restoreSimulationRuntime` and require
   each to be declared or listed with a reason — the shape
   `tests/foundation/fault-code-reachability-contract.test.ts` uses for fault
   codes and `tests/unit/simulation-message-keys.test.ts` uses for enums. It
   would turn decision 3's residual from prose into a checked state. Not built
   here: it is a gate over a reachability analysis and deserves its own scope.
4. **May a worker be reused after a code fault, now that both outcomes are
   recoverable?** `WorkerPerSessionHost` takes a fresh worker per attempt
   precisely because the main thread could not tell a worker that refused a
   snapshot from one that faulted while restoring — its own comment says so,
   citing #149. It now can, from `details`. Whether that permits reuse is
   [ADR 0006](./0006-simulation-worker-adapter.md) and
   [ADR 0024](./0024-protocol-fault-recoverability.md) territory, not this
   document's.
