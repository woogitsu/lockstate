# ADR 0030: What a restored session owes an incident response that was interrupted by a save

## Status

**Proposed — pending human approval.** Not accepted.

The implementing change is on the same branch as this document, which is the
shape §2 of [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) warns about: an ADR that
lands alongside its code is `Proposed` on `main` from the moment it merges and
can sit there unnoticed. Its rule is followed here — the queue entry is in the
same commit — and the branch's pull request says explicitly that merging it is
gated on approving this document, because two of the three decisions below
cannot be unmade for a save they have already rewritten.

### The number

**0030**, which `docs/adr/README.md` stated as next free, and the check that
statement cannot make was made: the open pull requests on this repository at the
time of writing are **#355** (`fix/340-343-close-prison-id-oracles`) and **#356**
(the ADR-0029 acceptance branch, which changes that ADR's status and adds no
document), so no unmerged branch is holding 0030. The index's next-free is moved
to **0031** in this commit, because
`tests/foundation/adr-numbering-contract.test.ts` derives it from the highest
number on disk.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every figure below was measured
by executing this tree at `87516a8` (v0.0.84) through the real save path
(`captureSessionSnapshot` → `createSaveEnvelope` → JSON round trip →
`decodeSaveEnvelope` → `restoreSimulationRuntime`), not read off the code. There
is no external tier: nothing here is a game-design question.

---

## Context

### The defect, measured before it was fixed

`IncidentResponseSystem` claims two things when it dispatches a response
(`src/simulation/incidents/response-system.ts`): it moves each responder into
the `'on-search'` deployment phase, and for an incident at or above
`lockdownSeverityThreshold` it drives the incident's sector into `'lockdown'`,
which cascades onto every door that sector governs. `releaseResponse` gives both
back when the response closes, and it reads a private per-incident record to
know what to give back.

Until save-schema V6 that record was not in the payload — `getSnapshot` emitted
metrics only — while **both claims were**: a guard's `deploymentPhase` including
`'on-search'`, and `sectorControlStates` including `'lockdown'`. So a restore did
not undo the claim. It made it permanent.

Measured — a severity-8 riot, six guards hired, four required responders, saved
one tick after dispatch, then the same session continued and the restored one
stepped beside it:

| | incident | sector control | door | guard phases | unassigned |
|---|---|---|---|---|---|
| at save (tick 1) | `notified` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | 2 |
| continuous, +3000 | `resolved` | **`normal`** | **`open`** | 6×`unassigned` | **6** |
| restored, +3000 | `lapsed` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | 2 |
| restored, **+53000** | `lapsed` | `lockdown` | `locked` | 4×`on-search`, 2×`unassigned` | **2** |

The continuous run releases everything on **tick 71**. The restored one never
does, and there is no recovery path: `GuardRoster.unassign`'s callers in `src/`
are all unreachable for an `'on-search'` guard, and no dismiss command exists. So
the prison is permanently four guards smaller and one sector darker, with the
hiring charge already spent. Issue #352 has the full account.

### Why this is a decision rather than a bug fix

Persisting the record is mechanical, and if that were all of it this would be a
bug fix inside a contract `docs/PERSISTENCE.md` already states — the same
category `#106` was placed in, which that document records as needing no ADR.

Two things put it outside that category, and `AGENTS.md`'s requirement that *a
persistence-format trade-off be recorded rather than decided in implementation
code* is what makes them this document's business rather than a code review's:

1. **A save already written cannot have the record reconstructed**, so the
   V5 → V6 migration has to decide what happens to the resources that save is
   holding. Whatever it decides is applied silently and irreversibly to a
   player's stored prison the first time they load it.
2. **The honest form of that decision rewrites sections the version did not
   change** — `security.guards.records` and `security.sectorControlStates`.
   Every migration before this one reshapes the field its version changed and
   nothing else, and that restraint is a stated property of the chain, not an
   accident.

Issue #352 declined to choose and said so: the alternative it describes
"decides semantics ... that belong in the record, not in an implementation."
This is that record.

## Decision

### 1. The response record is authoritative state and is persisted (save-schema V6)

`simulation.incidents.response` gains a required `responses` array — one row per
incident with responders committed to it, carrying `guardIds`,
`arrivedGuardIds`, an optional `containmentStartedAtTick` and `lockdownApplied`.

`SearchSystem` is the precedent and the control that proves the shape: it sets
the same `'on-search'` phase and holds the same kind of in-flight path ids, and
it does **not** leak, because its active jobs are in the payload — a restored
job re-travels, completes and releases its guards. The difference between the two
systems was only ever whether the record that owns the release survives the
save.

**Required, not optional.** The optional-field pattern in `docs/PERSISTENCE.md`
requires that absence mean what the older build already did, unambiguously.
Here absence *was* ambiguous and the ambiguity was the defect: a payload with a
`'notified'` incident, four `'on-search'` guards and a `'lockdown'` sector does
not say whether they belong together, and the reader guessed "no response
exists". An optional field would preserve that guess for every future save.

**The path requests stay excluded.** They name slots in a `NavigationSystem`
queue a restored session never received. A restored response re-issues them on
its first scheduled update, which is the "restart the leg, keep the job"
convention `SearchSystem`, `JobBoard` and `GuardRoster` already follow. The cost
is measured, not asserted: **one `IncidentResponseSystem` interval — 10 ticks —
for a response saved while its responders were travelling, and zero for one saved
after they arrived**, because `containmentStartedAtTick` is carried and a
responder already on the post tile issues no request. With that, the
"bounded delay, not lost progress" claim `docs/PERSISTENCE.md` makes about every
subsystem holding a request id becomes true of this one for the first time.

### 2. A legacy V5 save's claims are released rather than left held

For a V5 save the migration attributes what the payload records but does not
attribute, and releases what it has already stranded:

- **The response is still open** (`'notified'`/`'responding'`): the responders
  are attributed to it, `lockdownApplied` is set from the sector's recorded
  control state, and the *runtime* releases them the normal way when the
  incident closes. Where several incidents have responders committed, all the
  responders go to the lowest-id one and the others get an empty list — a V5
  save cannot distinguish them.
- **The response was already stranded** by an earlier restore (the incident is
  terminal): no record can be reconstructed for a closed incident, so the
  guard rows are rewritten to exactly what `GuardRoster.unassign` produces and
  the sector's control state to `'normal'`. The doors need no edit —
  `navigation.doors` records each governed door at its *baseline* state and
  `SecuritySectorRegistry.loadSnapshot` re-cascades the control state onto it.

**This is the decision the owner is being asked to approve, and the alternative
was real.** Leaving V5's behaviour alone is the other honest option, and it is
not the neutral one: it is choosing the outcome the player can never undo. What
a player notices under each:

| | This decision | Leave V5 alone |
|---|---|---|
| Open response in the save | Resumes; contained or lapses on its own deadline, one interval late | Lapses with its guards and lockdown held forever |
| Already-stranded save | Lockdown lifts and the guards report for duty on load; the incident stays `'lapsed'` in the log | Nothing changes, ever |
| Worst case | Two concurrent responded-to incidents may swap which one is contained | — |
| Reversible by the player? | Yes — it is a normal prison again | **No** |

Ending an emergency response early, or resolving the wrong one of two, is a play
outcome the save does not determine anyway. A prison that is silently four guards
smaller forever is a corrupt save.

### 3. A migration may write a section the version did not change, when the value is derived and the alternative is unrecoverable

The general permission, stated narrowly so it is not read as a licence:

- Every value written must be **derived from the same payload by a stated fact
  about `src/`**, not inferred from plausibility.
- The fact must be **tested, not cited**, in the step's own test file.
- The alternative must be a loss the player **cannot** reverse in game.

The two facts this instance rests on, both re-measured in
`tests/migrations/save-v5-to-v6.test.ts` rather than quoted:

- **An `'on-search'` guard that no active search job names is a responder.**
  Exactly two things in `src/` have ever set that phase
  (`grep -rn "setDeploymentPhase(" src/`), and one of them is `SearchSystem`,
  whose jobs are in the payload. The test builds a session holding both kinds of
  `'on-search'` guard at once and shows the step separating them, so a third
  producer of the phase fails the test instead of silently widening the rule.
- **A sector in `'lockdown'` with no open incident in it is residue.**
  `IncidentResponseSystem` is the only writer of `'lockdown'` in `src/`
  (`grep -rn "setControlState" src/`), and it holds one only while an incident in
  that sector is open. `'restricted'` is never touched, and a lockdown an open
  incident still justifies is left alone — both pinned.

## Consequences

- `SAVE_SCHEMA_VERSION` is 6. Every V1–V5 save still loads, through the same
  chain, and `tests/fixtures/persistence/` is unchanged.
- `docs/PERSISTENCE.md` gains a V6 section and its navigation-caches bullet
  becomes true for all five subsystems it names. `docs/DETERMINISM.md` records
  the 10-tick restore delay in the same list as
  `JobSystem.performingSince`'s 5.
- The restored-response delay is now a pinned number. If it grows, something has
  started costing more than a re-request; if it shrinks, that is an improvement
  someone must write down.
- `supabase/migrations/` is untouched. A save-schema version is a client-side
  payload shape and nothing about it reaches the database.
- **If this ADR is rejected**, decisions 1 and 3 come out with it: the fix would
  have to become the cross-system restore compensation issue #352 describes as
  its second option (`src/simulation/incidents/`, `src/simulation/security/` and
  `restore-session.ts`), which decides the same semantics in three
  implementations instead of one record, and which #352 argued against.

## Open questions

1. **Should a restored response that lapses be visible to the player?** The
   incident log records the lapse and its outcome, and nothing surfaces "this
   response was interrupted by a save". Out of scope here; it is a projection
   question, not a format one.
2. **Should a dismiss/fire command exist regardless?** The absence of one is
   what made this defect terminal rather than merely slow, and it will make the
   next resource-claiming system's equivalent bug terminal too. That is a
   gameplay surface decision, not this document's.
3. **Multi-incident attribution could be exact if `arrivedGuardIds` were
   derivable per sector**, which it nearly is (an arrived responder stands on
   its incident's post tile). Not done, because it would make the migration
   depend on tile geometry to resolve an ambiguity that costs one incident
   outcome once.
