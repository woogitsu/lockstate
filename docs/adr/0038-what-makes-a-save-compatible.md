# ADR 0038: What makes a save compatible

> **Placeholder title and placeholder number.** `0038` is unassigned and the
> filename slug is provisional; the owner assigns ADR numbers centrally. **This
> document pre-commits to renumbering without argument** if another branch has
> taken whatever number it is given, and to being retitled — no citation of it
> is load-bearing yet. Two agents took 0034 within an hour last session; that is
> what this paragraph exists to prevent.

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** Asked about this decision the owner answered, in Polish,
that they did not follow it and told the agent to handle it — *"nie czaję? ogarnij
to"* — and, of the accessibility decision alongside it, *"nie możesz sam tego
porobić?"* ("can't you do this yourself?"). **That is a real approval of the
judgement delegated and not of the text.** What was delegated is narrow and is
worth stating: the owner approved *that someone decide and act*, not this option
over the alternatives below. The argument in this document is the whole of the
warrant, and **a reader who disagrees with it should treat the decision as open**
rather than as settled by someone who weighed it — the same standing ADRs 0034,
0035, 0036 and 0037 carry, for the same reason.

**The number was assigned centrally** after this draft returned, per
`AGENTS.md`. The draft pre-committed to renumbering and that commitment stands:
if another branch holds this number, this document moves without argument.

It answers issue #415's stated
owner decision ("refuse the restore, or seed the missing stream
deterministically") and, in the same rule, settles issue #412's one sentence.

## Context

Two issues ask the same question from opposite sides, which is why one document
answers both.

**#415.** A session bundle that lacks a named RNG stream this build needs
restores **silently**, and dies later. Verified on `main` @ `54418b6`
(v0.0.121) by running the repository's own modules:

- `Kernel.restoreState` (`src/simulation/kernel/kernel.ts:250`) does
  `this._rng = new NamedRngStreams(snapshot.rngStates)` — **replace, not merge**.
  The four streams `createNewSimulationRuntime` derived from `masterSeed` a
  moment earlier (`src/simulation/runtime/new-session.ts:270-275`, installed at
  `:276`) are discarded. Nothing compares the two sets.
- Nothing upstream compares them either. `rngStates: z.array(namedRngStreamStateSchema)`
  (`src/persistence/save-schema.ts:88`) has no minimum and no name set: a save
  carrying three streams, or zero, decodes `ok:true` with a valid checksum.
- `restoredScopeFor` (`src/simulation/runtime/restore-session.ts:240-258`) keys
  off three optional *sections* and knows nothing about streams, so the restore
  reports `save.scope.rng-streams` as **restored** while a stream is missing.
- The failure surfaces at the first draw, from
  `NamedRngStreams.get` (`src/simulation/rng/streams.ts:22`), inside
  `Kernel.step()`'s system loop (`kernel.ts:212-216`).
- `onTickLoop`'s catch (`src/simulation/worker/state-machine.ts:254-255`) calls
  `fault('internal-error', …)` with no options, so `fault` takes
  `recoverable = false` (`:454`) and `transition('faulted')` (`:455`).
  Measured, through the real `SimulationWorkerStateMachine`:

  ```
  final worker state: faulted
  fault payload: {"code":"internal-error","message":"Unknown RNG stream: prisoners.classification","recoverable":false}
  fault replyTo present: false
  ```

Three consequences make this worse than "throws at the next tick":

1. **The lag is unbounded and state-dependent, not one tick.** Measured on the
   standard determinism scenario: a save captured at tick 0 with
   `identity.actor-name` removed survives **5** ticks; with
   `prisoners.classification` removed, **10**; with `contraband.detection`,
   **20**. The *same* bundle captured at tick 40 — by which point every draw in
   the scenario has already happened — survives **600 ticks with no throw at
   all**, for every one of the four streams. A broken save is therefore
   indistinguishable from a healthy one for as long as the player avoids the
   subsystem, and the fault lands arbitrarily far from the load that caused it.
2. **The fault is uncorrelated** (`replyTo` absent, measured), and
   `WorkerSessionHost.handleMessage` opens with
   `if (replyTo === undefined) return;` (`src/persistence/session/worker-session-host.ts:64-66`).
   The persistence layer never learns the session died. The only reader is the
   HUD alerts list, which ADR 0024's own Consequences record as folded by default
   and absent below 720 px.
3. **The tick is torn.** `Kernel.step()` advances `this._tick++` at
   `kernel.ts:219`, *after* the system loop, so systems ordered ahead of the
   thrower have mutated state for a tick the kernel does not consider to have
   happened. `handleRequestSnapshot` (`state-machine.ts:783-790`) has no
   `faulted` guard — unlike `handleSubmitCommand` at `:640` — and measurably
   still answers a capture request after the fault, at that torn tick.

**This is not a future hazard. It is live against this repository's own
fixtures.** `tests/fixtures/persistence/save-v1-fresh-prison.json:13` carries
`"rngStates": []`; `save-v1-in-progress.json:13` carries exactly one stream named
`world.terrain`, which no build registers. No migration step repairs this —
every step in `src/persistence/save-migrations.ts` copies `kernel` through
verbatim. Measured end to end:

```
--- save-v1-fresh-prison.json
  decode ok, migrated = true | streams carried: []
  restore ok. streams the restored kernel holds: []
  ticks survived: 600 -> no throw in 600 ticks
restored streams: []
20 quiet ticks: fine, tick = 20
after admitting one prisoner, ticks survived: 5 -> RangeError: Unknown RNG stream: identity.actor-name
```

A shipped fixture restores clean, plays clean, and detonates on the player's
first Admit.

**#412.** `masterSeed` is absent from the save payload — 0 hits in
`src/persistence/save-schema.ts`. Both production restore paths take the `= 0`
default (`restore-session.ts:321`; `session-controller.ts:66`; `src/main.ts:2100`
constructs `SessionController` with no `masterSeed` at all). It is currently
**inert**, and that is measured rather than repeated from #412's comment:

```
immediately after restore  true-seed hash: 1c32327552082344
immediately after restore  seed-zero hash: 1c32327552082344
after 400 further ticks    true-seed hash: 9b080ea7c2edf7ca
after 400 further ticks    seed-zero hash: 9b080ea7c2edf7ca
equal: true
```

with a control showing the hash is genuinely seed-sensitive where a seed still
matters (`new-session seed 10: f0b81b8c50f1d4a9` vs `seed 0: 7eb581098131504f`).
The seed is **superseded, not lost**: its only use is deriving the four initial
stream states, and `restoreState` overwrites all four.

The two issues meet at one point. **The moment a restore has to *seed* a stream
the save does not carry, the seed stops being superseded** — it becomes the only
input the missing stream has. #415's second option is unavailable without #412's
answer, and #412's absence is unobservable until #415 is fixed that way.

## Decision

### 1. The compatibility rule

> **A save is compatible with a build when the build can interpret every section
> the save carries, and every section the build needs and the save omits has
> exactly one meaning. Absence is a fact about the save's age and is honoured
> with the value the writing build would have held; a *value* the build cannot
> interpret is a fact about the blob and is refused.**

This is not a new rule. It is `docs/PERSISTENCE.md`'s "Adding an optional field
without a version bump" (`:69-92`) stated as a property of the whole payload
rather than of one field, and its three conditions are unchanged: the thing is
optional, absent means what the older build already did, and a bump is required
instead when absence is ambiguous or an existing field changed meaning.

### 2. A missing named RNG stream is an absence, and is seeded from `(masterSeed, streamName)`

`restoreSimulationRuntime` **merges** the snapshot's streams over the streams the
freshly-built runtime already holds, instead of replacing them. A stream the
bundle carries wins; a stream the build registers and the bundle omits keeps the
state `deriveXoshiroState(masterSeed, streamName)` already gave it.

Absence is unambiguous here as a matter of code, not of convention:
`NamedRngStreams.snapshot()` (`rng/streams.ts:26-30`) emits **every** stream the
instance holds, and the class has no removal method — so a stream missing from a
bundle can only mean the writing build never registered it.

**The expected set needs no new declaration, and this is the reason to prefer
this fix over any other.** It is already in the caller's hand:
`restore-session.ts:323` constructs the runtime, so at `:326` the kernel holds
exactly the streams this build registers, already correctly derived. The fix is
to stop discarding them. No registry of stream names, no second list to keep in
step with `new-session.ts`, no new concept. It is the third instance of the
pattern this repository has hit twice already — `ObjectPlacementService` refusing
an unknown id rather than letting `submitOrder` throw out of a dispatch, and
`ContainerMaterialsProvider.release` already being the deposit the carry seam
needed.

For every save that exists today this merge is a **no-op**: production has never
supplied a non-zero seed, so `deriveXoshiroState(0, name)` is exactly the state
such a session held, and every save written since `4652a07` carries all four
streams anyway.

### 3. A stream the build does not register is kept, not dropped

The mirror direction. A bundle carrying `world.terrain` — which the repository's
own V1 fixture does — restores with that stream intact and simply never drawn.
It costs four 32-bit words, it survives a capture (`snapshot()` emits it), and it
means **a save never loses a stream by being loaded**, so a player who rolls back
to an older build still has their session. Dropping it would make a load lossy
in a way no error reports.

### 4. An absent `masterSeed` is defined to mean 0

The sentence #412 asks for, and it is a statement of fact rather than a
convention: production has never supplied another value
(`src/main.ts:2100` → `session-controller.ts:66` `?? 0`), so every save in
existence was written by a session seeded at 0.

`masterSeed` is therefore added as an **optional field on the existing V5
payload**, the pattern `entities` / `simulation` / `identity` already use
(`save-schema.ts:1042-1051`). `SAVE_SCHEMA_VERSION` stays 5 and no migration step
is added, because there is nothing to migrate — absence already means the right
thing. Production restores pass the stored value where it is present.

**One cost, stated rather than glossed.** `savePayloadV5Schema` is `.strict()`,
so an *older* build reading a save that carries the new key refuses it.
Measured:

```
V5 envelope + undeclared payload.masterSeed: ok:false code=invalid-shape
  msg=Version 5 payload failed validation: payload: Unrecognized key: "masterSeed"
```

A V6 bump would give that same older build `unsupported-version` instead. The
difference is the *label on a refusal*, not whether the save loads — both builds
refuse it either way. That is not worth a version bump, a migration step and a
fifth entry in the migration chain, and ADR 0036 is the precedent for declining
a bump on those grounds. It is worth recording, because "no bump is needed" is
true and "no bump costs nothing" is not.

### 5. Whatever is refused is refused at restore, and is never an `internal-error`

A save-compatibility condition is decided at the boundary that reads the save,
reported as a **declared verdict**, and delivered as
`snapshot-incompatible` with `recoverable: true` — the shape
`rejectedSnapshotFault` (`state-machine.ts:117-119`) already uses, one module
over, for the reason ADR 0024 §1 gives: refusing a snapshot installs nothing,
so the worker is not spent.

It may never become an `internal-error` out of `Kernel.step()`. ADR 0024 §1 is
explicit that `internal-error` "may have left a system part-way through its
work" and that those are *real* faults; the torn tick above is that sentence
coming true. This ADR does **not** propose making `internal-error` recoverable.
It proposes that a save-compatibility condition stop being one.

Concretely, this makes ADR 0024's own taxonomy land where it was always aimed:
a refused *request* is recoverable, an unhandled exception is not, and "this
save was written by a build that did not have `x`" is a refused request.

## Alternatives considered

### Refuse any restore whose stream set does not match

The coherent alternative, and it is what #415 calls "honest about the
divergence". Rejected, for two reasons and one measurement.

It is honest about a divergence that does not exist. Seeding from
`deriveXoshiroState(masterSeed, name)` gives every client loading the same
bundle the same state — that is the whole of what `rng/seed.ts:21-31` is for —
and it gives that stream exactly the state a *new* session would have given it.
Nothing is invented, and nothing is silently different between two players.

It also refuses saves for a difference that has never mattered.
`contraband.intelligence` is registered, snapshotted and **drawn by nothing**:
`rng.get` has four call sites in `src/` (`new-session.ts:478`,
`contraband/search-system.ts:338`, `prisoners/intake-system.ts:293`, `:300`) and
none names it. Under this alternative, deleting that dead stream — a pure
cleanup — would make every save in existence unloadable.

And the measurement: this alternative makes the repository's own
`save-v1-fresh-prison.json` permanently unloadable, where the decision above
loads it and repairs it. That is a real player-facing regression traded for a
strictness nothing needs.

The reversal target is narrow, deliberately: it is the merge in `restoreState`
becoming a comparison that throws. Sections 4 and 5 stand either way.

### Bump to V6 and carry `masterSeed` as a required field

Rejected. It buys a better *label* on a refusal an older build makes anyway
(§4), and costs a migration step whose only content would be `masterSeed: 0` —
which is fabricating a value the save does not record, in a codebase whose
migration chain deliberately declines to fabricate absent sections
(`restore-session.ts:189-196`). Per `docs/HANDOVER-2026-08-26.md` the V6
contention is gone, so the number is available; availability is not a reason.

### Validate the stream set in the save schema

Rejected, in line with `save-schema.ts:94-97`: the schema does structural
validation and leaves semantic checks to the module that owns the meaning, which
is why `SparseWorld.fromSnapshot`'s checks are not duplicated there. Which
streams a build needs is a property of `new-session.ts`, not of the payload
shape, and pinning it in Zod would put a copy of that list in a second place —
the exact thing §2 avoids.

### Fix the same shape in `ConstructionSystem.restore` under this ADR

Deferred, not rejected, and named so it is not lost.
`construction/system.ts:759-772` has the same replace-without-checking shape and
produces a **`TypeError`** on a plausible corruption (measured:
`orders` replaced by junk → `Cannot read properties of undefined (reading 'map')`).
That is a missing structural guard, not a compatibility rule, and its right home
is #403 mitigation (a) — where a `TypeError` from our own restore code is the
motivating example for classifying code-fault against data-fault. Fixing it here
would decide half of #403 inside a #415 change.

## Consequences

**Positive**

- Adding a named RNG stream stops being a save-format change. That is the point:
  named streams are the sanctioned way to add a system that needs randomness
  (`docs/DETERMINISM.md`, "RNG Ownership"), and today doing so bricks every
  existing save at an unpredictable later tick.
- The repository's own V1 fixtures become loadable rather than being latent
  faults, and `save-v1-fresh-prison.json` stops being a time bomb.
- `masterSeed` becomes recoverable, which is what ADR 0009's `seed-mismatch`
  check (`services/challenges/verification.ts:179-181`) rests on and what a
  player-facing "new prison from seed" would need.
- One rule now covers sections, fields and streams, so the next thing a save
  omits has an answer before it is asked.

**Negative**

- A restored session that seeds a new stream at tick T is **not** equal to any
  continuous run: a continuous run under the newer build would have been drawing
  from that stream since tick 0. The property this ADR claims is the weaker one
  — same bundle, same state, every client, every load — and `docs/DETERMINISM.md`
  must say so beside the `JobSystem.performingSince` and incident-response
  entries, which are the same kind of recorded, bounded divergence.
- `.strict()` means an older build refuses a save carrying `masterSeed`, labelled
  `invalid-shape` rather than `unsupported-version` (§4). Downgrade after playing
  one session on a newer build is not supported, and was not before either.
- A merge cannot notice a stream that is missing *and* should have been there —
  because after this change there is no such category. If a save is ever
  corrupted by losing a stream it genuinely had, that corruption is now silently
  repaired to the session-creation state instead of being reported. This is a
  real loss of a signal, and it is accepted because the schema's checksum
  (`persistence/checksum.ts`) is what detects a corrupted payload, and a payload
  that passes the checksum did not lose a stream in transit.

## What the acceptance criteria need, in this repository's terms

- A test that is **red on unfixed `main`**: restore a bundle with a named stream
  removed, then assert the observable outcome — the restored kernel's stream set,
  or a `RestoredScope` that says the stream was re-seeded — not that an exception
  happened somewhere. Today that test's subject restores clean and dies between
  5 and 600 ticks later depending on the scenario, so the assertion must be on
  state and not on survival.
- The expected stream set in the test must be **written out by name**, never read
  from the code under test (`docs/TESTING.md`; #415's own Required Verification).
  The four names are `prisoners.classification`, `contraband.detection`,
  `contraband.intelligence`, `identity.actor-name`.
- A round-trip test for §3: restore a bundle carrying an unregistered stream
  (`world.terrain` is a real one, in `save-v1-in-progress.json`) and assert the
  next capture still carries it.
- A `masterSeed` test that does **not** pass the seed in and read it back out of
  the same object: write a save at seed X through the real envelope path, decode
  it, and assert the decoded payload reports X.

## Open questions

1. **Should a restore that re-seeded a stream say so in `RestoredScope`?**
   `restored` / `notCarriedByThisSaveVersion` (`restore-session.ts:137-151`) has
   no third arm, and "re-seeded" is neither. A third arm is a player-facing
   change and a localization key; a silent repair is what §2 does today. I lean
   to reporting it, and it is not decided here.
2. **Does an unregistered stream carried forward for ever need a retirement
   path?** §3 keeps it deliberately. Nothing removes it, so a stream deleted from
   a build travels in that build's saves indefinitely. Sixteen bytes says leave
   it; a future save-size budget may disagree.
3. **Does `contraband.intelligence` still deserve to exist?** It is registered,
   snapshotted and drawn by nothing. Under this ADR removing it is finally
   *possible* without bricking saves — which makes the question worth asking, and
   it is a separate decision.
4. **Should `handleRequestSnapshot` refuse to answer from `faulted`?** The torn
   tick is capturable today (measured). Guarding it is a one-line change in the
   worker, but "what a faulted worker may still answer" is ADR 0024's territory,
   not this document's.
