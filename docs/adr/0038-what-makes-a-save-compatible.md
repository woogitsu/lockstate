# ADR 0038: What makes a save compatible

> **0038 was assigned centrally**, after this draft returned and alongside 0039
> and 0040, which is the practice `AGENTS.md` records precisely so that two
> agents drafting at once cannot take one number — as two did with 0034 last
> session. The evidence the index prescribes was run as well: the open pull
> requests were enumerated and there is exactly one (#355), carrying no ADR.
> **This document still pre-commits to renumbering without argument** if an
> unmerged branch turns out to hold 0038, and every citation of "ADR 0038" added
> by the same branch moves with it.

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** Asked about this decision the owner answered, in Polish,
that they did not follow it and told the agent to handle it — *"nie czaję? ogarnij
to"* — and, when the work widened, *"rób tak żeby było dobrze, działaj
autonomicznie, rób research i sam decyduj"* ("make it good, act autonomously, do
the research and decide yourself"). **That is a real approval of the judgement
delegated and not of the text.** What was delegated is narrow and worth stating:
the owner approved *that someone decide and act*, not this option over the
alternatives below. The argument in this document is the whole of the warrant,
and **a reader who disagrees with it should treat the decision as open** rather
than as settled by someone who weighed it — the same standing ADRs 0034, 0035,
0036 and 0037 carry, for the same reason.

It answers issue #415's stated
owner decision ("refuse the restore, or seed the missing stream
deterministically") and, in the same rule, settles issue #412's one sentence.

**The implementation landed on `work/415-save-compatibility` ahead of this
approval, deliberately, and this document is what it should be judged against.**
The reason is the same one ADR 0037 gives for its stopgap: the defect is not
hypothetical. `tests/fixtures/persistence/save-v1-fresh-prison.json` is a
shipped fixture that restores clean and then faults the worker irrecoverably on
the player's first Admit (measured below), so leaving it while a decision was
taken was not a neutral choice. What is reversible, and how far, is stated
under *Alternatives considered*: the reversal target is narrow and deliberately
so — the merge in `Kernel.restoreState` becoming a comparison that throws.
Sections 4 and 5 stand either way. Nothing is written to disk that a reversal
would have to migrate back: the repair recomputes on every load, and the one
byte of format this adds (`masterSeed`) is optional in both directions.

## Context

Two issues ask the same question from opposite sides, which is why one document
answers both.

**Every `file:line` below is pinned to `main` @ `54418b6` (v0.0.121), before the
change this document argues for.** They are citations of the defect, so they
describe the tree as it was; `kernel.ts:250` in particular is the line that no
longer exists. The measurements were taken on that tree by running the
repository's own modules.

**#415.** A session bundle that lacks a named RNG stream this build needs
restores **silently**, and dies later. Verified on `main` @ `54418b6`
(v0.0.121) by running the repository's own modules:

- `Kernel.restoreState` did `this._rng = new NamedRngStreams(snapshot.rngStates)`
  — **replace, not merge**. The four streams `createNewSimulationRuntime` derived
  from `masterSeed` a moment earlier (`src/simulation/runtime/new-session.ts:288-293`,
  handed to the kernel at `:294`) were discarded. Nothing compared the two sets.

  **This bullet is now history, and is kept in the past tense rather than
  deleted.** It described `main` at `54418b6` and was true then; `bb7b862`
  (#415), *"Merge a save's RNG streams onto the kernel's own instead of replacing
  them"*, landed **six minutes after** this document did and made
  `Kernel.restoreState` merge — `src/simulation/kernel/kernel.ts:310-321`, which
  builds a `merged` map from the instance's own streams and then the snapshot's,
  so the snapshot wins per name and an unmentioned stream keeps the state
  `masterSeed` gave it. That is decision 2 below, implemented. The anchor this
  bullet carried, `kernel.ts:250`, has drifted onto `Kernel.snapshot()`;
  `restoreState` is at `:305`. **A Context section that reports "what the code
  does today" against a named commit is the one kind of prose that is *supposed*
  to go stale**, so the commit it was verified at is what makes it readable, and
  re-dating it rather than rewriting it is what keeps the Decision below legible
  as a change from something.
- Nothing upstream compares them either. `rngStates: z.array(namedRngStreamStateSchema)`
  (`src/persistence/save-schema.ts:88`) has no minimum and no name set: a save
  carrying three streams, or zero, decodes `ok:true` with a valid checksum.
- `restoredScopeFor` (`src/simulation/runtime/restore-session.ts:240-258`) keys
  off three optional *sections* and knows nothing about streams, so the restore
  reports `save.scope.rng-streams` as **restored** while a stream is missing.
- The failure surfaces at the first draw, from
  `NamedRngStreams.get`, whose one line is a guard throwing
  `RangeError` on an unknown name (`src/simulation/rng/streams.ts:22`) -- inside `Kernel.step()`'s system loop,
  the `for (const system of this._systems)` walk under `// 2. Execute systems due
  at this tick` (`kernel.ts:237-242` as of `83d9616`; this cited `:212-216`,
  which had drifted onto the doc comment above the command drain).
- `SimulationWorkerStateMachine.onTickLoop`'s `catch (e)` calls
  `this.fault('internal-error', …)` with no options, so `fault` takes
  `const recoverable = options.recoverable ?? false;` and then
  `if (!recoverable) this.transition('faulted');`
  (`src/simulation/worker/state-machine.ts:307-309` and `:589-590` as of
  `83d9616`; this bullet cited `:254-255`, `:454` and `:455`, all three of which
  had drifted -- the first onto the delta-cadence fields, the other two into an
  unrelated comment).
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

> **Amended 2026-09-15. Every structural claim in the `#412` paragraph above
> has stopped being true, and the measurement below it is kept rather than
> overwritten because it was real on `54418b6`.** The amendment is written here
> in the form §4 below already uses for the same reason.
>
> - *"`masterSeed` is absent from the save payload — 0 hits in
>   `src/persistence/save-schema.ts`"*. It is a declared optional field there
>   now, in V6 and in the envelope: `masterSeed: uint32Schema.optional()`
>   (`src/persistence/save-schema.ts:1454` and `:1491`), with
>   `readonly masterSeed?: number;` on the envelope input
>   (`src/persistence/save-schema.ts:1824`). That file's own V6 note records the
>   change — *"V5 gained one more optional field after it shipped: `masterSeed`
>   (#412)"*.
> - *"Both production restore paths take the `= 0` default"*. Neither does.
>   `restoreSimulationRuntime` builds the runtime from
>   `createNewSimulationRuntime(bundle.masterSeed ?? masterSeed, { world })`
>   (`src/simulation/runtime/restore-session.ts:375`), preferring the **saved**
>   seed, and `SessionController.createPrison` draws
>   `this.masterSeed ?? this.generateMasterSeed()`
>   (`src/persistence/session/session-controller.ts:460`).
> - *"`src/main.ts:2100` constructs `SessionController` with no `masterSeed` at
>   all"*. It passes a generator: `new SessionController(repository, host, {`
>   with `generateMasterSeed` among its options
>   (`src/main.ts:4431-4434`; the anchor read `:4220-4223`, then
>   `:4381-4384`, re-aimed on 2026-09-21 by
>   `grep -n 'new SessionController(repository, host, {'` after a chrome-row
>   overflow fix added an unrelated function above it and again on 2026-09-22
>   by the same search after ADR 0122's `show-alert-place` case was added to
>   the intent switch above it), that function drawn from
>   `crypto.getRandomValues(drawn);` at `src/main.ts:4346` (the anchor read
>   `:4142`, then `:4303`). This is the same change §4's
>   2026-08-28 amendment records, and this paragraph was not amended with it.
> - *"It is currently **inert**"*. It is not, and the three sentences above are
>   why.
>
> **The anchors rotted as well as the prose, and none was repaired by an
> offset.** `restore-session.ts:321` is a bare `return {`;
> `session-controller.ts:66` is inside a docblock about the revision counter and
> issue #582; `main.ts:2100` is a bare `/**`. They are left in the sentence
> above, which is now explicitly historical, and the live anchors are the ones
> in this note.
>
> **This is what a global anchor pin costs, and it is recorded here because
> this ADR carries the corpus's most emphatic one.** Pull request #1229
> declined to sweep this document on the strength of its header, reasonably:
> *"Every `file:line` below is pinned to `main` @ `54418b6`"* reads as a
> sentence that dates everything under it. It does not — `docs/adr/README.md`,
> *"A global anchor pin in an ADR is advisory"*, carries the seven commits that
> settle it, two of which re-anchored this very file against `83d9616` without
> moving its pin.


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

`Kernel.restoreState` **merges** the snapshot's streams over the streams the
freshly-built runtime already holds, instead of replacing them
(`src/simulation/kernel/kernel.ts:310-321`). A stream the
bundle carries wins; a stream the build registers and the bundle omits keeps the
state `deriveXoshiroState(masterSeed, streamName)` already gave it.

(**This paragraph named `restoreSimulationRuntime`, and the merge is not
there.** `restoreSimulationRuntime`
(`src/simulation/runtime/restore-session.ts:367`) *calls*
`runtime.kernel.restoreState(toKernelSnapshot(bundle.kernel))` at `:372`, and
the merge is inside that — so the outer function is where the restore is
entered, not where the streams are reconciled. This document already attributed
it correctly twice: `## Status` says *"the merge in `Kernel.restoreState`"* and
`## Alternatives considered` says *"it is the merge in `restoreState`"*. Only
this section, the one that decides it, named the wrong function. **A document disagreeing with itself
across its own headings is what `docs/AGENT_WORKFLOW.md` §4 says no diff will
catch** — the two correct mentions and the wrong one were written in the same
commit, so there was never a change for a reviewer to compare. It matters
beyond tidiness because the reversal this decision commits to, described in
`## Alternatives`, is a change *to the merge*: a reader implementing that
reversal from this section alone would open the wrong function and find nothing
to reverse.)

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

> **Amended 2026-08-28 (#479).** "Production has never supplied another value"
> stopped being true the day this line was fixed: `src/main.ts` now passes a
> `generateMasterSeed` drawn from `crypto.getRandomValues` to
> `SessionController`, and `SessionController.createPrison` draws a fresh one
> from it on every call rather than reusing one constant for the controller's
> whole lifetime — so a new prison's seed varies from the last one, including
> two created without a page reload
> (`tests/integration/session-master-seed-variety.test.ts`). **This rule is
> unaffected by that fix and is not being reopened**: an absent `masterSeed`
> still means 0, `SAVE_SCHEMA_VERSION` is still 5, #479 added no field and
> bumped nothing, and `captureSessionSnapshot` already wrote the field
> unconditionally before #479 too (see above) — what #479 changed is only
> *which value* a fresh prison's session reports, never whether the field is
> present. So "every save in existence was written by a session seeded at 0"
> is exact for every save written before #479 landed, and is the last time
> that sentence is true of *every* save: a save written by a build carrying
> #479 records whatever `generateMasterSeed` actually drew.

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

## What the acceptance criteria need, in this repository's terms — and where each landed

- A test that is **red on unfixed `main`**: restore a bundle with a named stream
  removed, then assert the observable outcome — the restored kernel's stream set,
  or a `RestoredScope` that says the stream was re-seeded — not that an exception
  happened somewhere. On the unfixed tree that test's subject restores clean and
  dies between 5 and 600 ticks later depending on the scenario, so the assertion
  must be on state and not on survival.
  → `tests/determinism/save-rng-stream-compatibility.test.ts`, four of whose
  seven cases were red on the unfixed tree, each asserting a stream set or a set
  of state words. The `RestoredScope` arm was **not** built; see open question 1,
  which stays open.
- The expected stream set in the test must be **written out by name**, never read
  from the code under test (`docs/TESTING.md`; #415's own Required Verification).
  The four names are `prisoners.classification`, `contraband.detection`,
  `contraband.intelligence`, `identity.actor-name`.
  → `REGISTERED_STREAMS` in that file, and the derived state *words* for two
  seeds are literals beside it, so a re-seed from anything other than
  `(masterSeed, name)` fails even though the stream would exist.
- A round-trip test for §3: restore a bundle carrying an unregistered stream
  (`world.terrain` is a real one, in `save-v1-in-progress.json`) and assert the
  next capture still carries it.
  → Same file. It is a guard rather than a repair and passed on the unfixed tree
  too: replacing the instance kept an unregistered stream for the same reason it
  lost a registered one. What it denies is the other merge a reader might write,
  where the build's own set is the authority.
- A `masterSeed` test that does **not** pass the seed in and read it back out of
  the same object: write a save at seed X through the real envelope path, decode
  it, and assert the decoded payload reports X.
  → `tests/integration/session-save-master-seed.test.ts`, all four cases red on
  the unfixed tree. It also pins the case the plumbing could plausibly get wrong:
  a session **loaded** from a save at seed X, re-saved by a controller configured
  with a different seed, still reports X.

One acceptance criterion of #415 has no test of its own because the fix removes
its subject: *"a bundle missing a stream the build needs is detected at restore,
not at the first draw."* Under this decision there is nothing to detect — the
absence is honoured, not refused — so what is asserted instead is that the
condition can no longer reach `Kernel.step()` at all: a stream-short save driven
through the **real worker entry module** for 120 ticks posts no `protocol/error`,
where the unfixed tree posted
`{"code":"internal-error","recoverable":false}` after 5.

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
