# The ADR approval queue, and where a status contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file; §1 *records* the nine that have moved and the rest is what is
still open, each entry giving the evidence, what settling it commits the project
to, and — where one is outstanding — the exact line that would replace it.
Deciding is the owner's; this file only makes the decision cheap.

Re-anchored at `main` @ `d5c50f8` (v0.0.56). Every `path:line` below was
re-read from disk at that commit, and the newer entries cite symbols rather
than line numbers where a citation would otherwise drift on the next edit
(the precedent is #309).

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: the gate
checks statuses against documents, never against code. It is a habit, not an
assertion, and this revision is that habit being kept twice in one day: the
three entries this file carried as open decisions were acted on, so they are
recorded as decided rather than left standing as pending.

---

## 1. What was decided, and when

### The six retroactive approvals, 2026-08-25

The entries this file was originally written for are **done**. The owner was
shown the evidence in each and approved all six on **2026-08-25**; the flips
landed in one commit, each as the pair the suite requires — the `Status` line in
the ADR and that ADR's row in `docs/adr/README.md`.

| ADR | Was | Is |
| --- | --- | --- |
| [0012](./0012-derived-identifier-reproducibility.md) | Proposed | **Accepted** |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Proposed — pending human approval | **Accepted for §§1-4; §§5-6 remain Proposed** |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Proposed | **Accepted** |
| [0015](./0015-actor-identity-allocation.md) | Proposed | **Accepted** |
| [0016](./0016-migration-delivery-mechanism.md) | Proposed — pending human approval | **Accepted**, retroactively |
| [0021](./0021-http-response-security-headers.md) | Proposed — pending human approval | **Accepted** |

Two of the six status lines say more than the one-line replacements this file
carried, and in both cases because a bare replacement would have left a true
status next to a stale sentence:

- **0012.** The draft replacement was the minimum edit — *"Accepted. Extended
  by"*, the old first line with one word changed. What landed states the fact
  the old entry 7 got wrong and `b653b93` corrected, because the ADR's own
  Consequences still open by calling the remedy a *"follow-up"* the ADR is
  *"proposed rather than applied"* on account of. Re-verified: PR #295 (issue
  #112) made `nextGlobalId` a local of `recomputeGlobalTopology`
  (`src/simulation/rooms/topology.ts`) rather than instance state, so ids are
  handed out from 1 in canonical sorted order on every recompute and
  `GlobalTopologyId` meets the category-2 requirement the ADR sets — pinned by
  `tests/determinism/iteration-order.test.ts`, which the comment above
  `recomputeGlobalTopology` names. The status line therefore records the remedy
  as landed and names the **residue** #295 recorded instead: `chunkTopologies`
  is never evicted (no `delete` on it anywhere in the file, re-verified at
  `d5c50f8`), so ids are no longer a function of *recompute* history but are
  still a function of chunk *load* history, under "Known limitations" in
  `docs/DETERMINISM.md`. That residue is the part of the category-2 reading
  still open in code, and it is now a limitation under an accepted ADR rather
  than a proposed one. See §5.
- **0015.** The draft replacement kept *"Extends ADR 0012, which is Proposed"*,
  which the same commit falsified. Both were accepted together — which is what
  that revision's §3 recommended — so the ordering trap it named is **resolved
  rather than triggered**, and the status line says 0012 is Accepted.

### The three room decisions, 2026-08-25

The three entries this file carried as *genuine open decisions* — the ones
nothing was shipped against, or shipped against only in part — were put to the
owner with their evidence and their consequences, and the owner **decided all
three**. Same day, same mechanic, one commit, three pairs of lines.

| ADR | Was | Is |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Proposed — pending human approval; amended 2026-08-25 (the owner chose the Rooms tab) | **Accepted, 2026-08-25 — as amended** (Decision §1 superseded by that amendment) |
| [0023](./0023-room-occupancy-authority.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as amended**; *not* superseded by 0028 |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |

**0022 — what was signed is the amendment, not the Decision.** The *decision
recorded in the ADR* — a room type as a row in the Build catalogue — is
unimplemented and always will be; the owner exercised the reversal that ADR
itself names and chose **alternative B, the Rooms tab**, which shipped in #312.
The original *Decision* through *Consequences* text is left verbatim, because an
ADR is a historical record of a decision and not a description of the current
build. What changed beyond the keyword is the rest of the `## Status` section,
which said *"nothing in `src/` implements it yet"* and framed the Decision as the
thing a reviewer was being asked to sign — both false the moment #312 landed and
the approval was given, and both inside the one section a status flip may edit.

One thing was deliberately **not** edited and is recorded here rather than left
to be found: §*Status of this amendment*, at the foot of that file, still opens
*"**Proposed.** Setting an ADR to Accepted is the owner's, and this amendment
does not do it."* That sentence is a true statement about what the amendment did;
the keyword in front of it is not true any more. It was left verbatim because the
amendment is the historical record the approval is *of*, and the file's
authoritative `## Status` section now points at it and says so — the same shape
of forward pointer ADR 0017 used when it was accepted, rather than a rewrite of
the passage. `parseStatus` in the numbering gate reads the first non-blank line
under the `## Status` **section heading** only, so the `###` subsection cannot be
mistaken for the document's status; the pairing assertion is green either way.

**0023 — accepted rather than superseded, deliberately, and corrected in the
same commit.** 0028 answers the question 0023 asks, by building the authority
0023 §1 names, so the tidy bookkeeping would have been to mark 0023 superseded.
The owner kept it accepted instead, on the schedule rather than the design:
object placement is the largest item in the backlog, 0028's own phase order says
how many phases pass before a prisoner can sleep, and if that build proves too
large 0023's authored *nominal* fallback is what would keep a zoned cell usable
in the meantime. Superseding 0023 would have retired the fallback along with the
question.

**But keeping it accepted meant it could not be left stating something false,
and it was.** 0023 states both halves of the gate correctly in
§*The mechanism the decision has to fit* and then frames the whole decision as
being about **`capacity`**: §1 step 2 falls back to "the room definition's
authored nominal figure" and says nothing about capabilities, and §2 splits "the
authored figure and the resolved figure" as two numbers. A capacity-only fallback
is a **no-op**. Re-verified at `d5c50f8`, by reading each site and then by
constructing the case:

- `RoomInstanceRegistry.findAvailable` rejects on two independent counts —
  `occupancyOf(instanceId) >= instance.capacity`, and, when a capability is
  asked for, `!instance.objectCapabilities.includes(requiredObjectCapability)`
  (`src/simulation/prisoners/room-instance-registry.ts`, `public findAvailable`).
- `findBestAvailable` (same file) repeats **both** checks before it rates
  anything — and it, not `findAvailable`, is the lookup on the intake path since
  #79's cell-sharing rating landed
  (`src/simulation/prisoners/intake-system.ts`, the `accommodation-assignment`
  stage). 0023 §*The mechanism* names only `findAvailable`; the correction
  applies to both.
- `DEFAULT_ACCOMMODATION_POLICY` asks for `'sleep-surface'` for both room ids it
  targets, and `RoomZoningService` registers every zoned instance with
  `objectCapabilities: []` (`src/simulation/rooms/zoning.ts`, `const instance:
  RoomInstance` in `zone`).
- Constructed and run: a `room.cell` instance registered with `capacity: 2` and
  `objectCapabilities: []` is returned by **neither** lookup for that policy's
  target, while `findAvailable('room.cell')` with no capability argument returns
  it and `assign` accepts an occupant into it. So the capability half is what
  refuses, the capacity half is already satisfied, and a nominal figure of 2 on
  `room.cell` would leave every arrival accruing `accommodationBacklogTicks`
  exactly as `capacity: 0` does today.

0023 therefore carries a dated amendment recording that correction and the
fallback's real relationship to 0028: if the fallback is ever built it must
resolve a **capability set** as well as a number, or it changes nothing
observable. The original *Decision* is not rewritten — the ordering, the
two-field split, §3's "assignment lives on the object" and the six failure modes
all stand. ADR 0028 §*Context* records the same correction independently and
traces it to the room-occupancy research memo's §6
(`docs/research/2026-08-25-room-occupancy.md`, which is on `main` now and was not
when 0028 was written).

**0028 — the status line and nothing else.** Its design and its phase order are
untouched: accepting it is what unblocks phase 1, which is being started
separately, and editing the phases in the commit that approves them would be the
approval deciding something the owner did not.

**Nothing moved with these three.** Accepting an ADR can oblige deleting an
implementation note that exists only so an Accepted ADR is not amended on a
Proposed one's authority — §4's 0024 entry is exactly that case. Grepped for
notes of that shape naming 0022, 0023 or 0028: **there are none.** The corpus
holds four such notes and every one of them belongs to something else — two in
`docs/adr/0006-simulation-worker-adapter.md` (states 1-2's handshake gap, and the
decode-error clause that is ADR 0024's), one in
`docs/adr/0003-simulation-worker-protocol.md` (the same handshake gap at decision
4), and one forward reference in `docs/adr/0024-protocol-fault-recoverability.md`
naming the 0006 note it would delete. The 0006 decode-error note stays exactly as
it is, and stays owed to 0024.

---

## 2. Still outstanding: ADR 0013 §§5-6

0013 is **Accepted for §§1-4 only**, and that is not a formality. Two of its
six decisions are enforced in the database and two are explicitly absent:

| ADR section | state | evidence |
| --- | --- | --- |
| §1 five free slots, enforced by the database | **shipped, accepted** | `base_save_slot_capacity()` `:45`, `account_save_slot_capacity(uuid)` `:91` |
| §2 a trigger, with an RPC as the front door | **shipped, accepted** | `enforce_prison_slot_capacity()` `:150`, trigger `:186` |
| §3 over-capacity degrades read-only | **shipped, accepted** | the exception's `hint` at `:178` |
| §4 4 MiB per-save payload bound | **shipped, accepted** | `max_save_payload_bytes()` `:71-73` — `as $$ select 4194304 $$;` |
| §5 256 MiB total per account | **absent, still Proposed** | no total-bytes function, trigger or column anywhere in `supabase/migrations/` |
| §6 20 revisions retained per prison | **absent, still Proposed** | no retention or pruning logic anywhere in `supabase/migrations/` |

Paths in that table are relative to
`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`. Both
absences were re-verified by grepping the whole `supabase/migrations/` tree at
`d5c50f8` for a total-bytes, retention or pruning mechanism; there is none, and
no migration has been added to that directory since the previous re-anchor.

**§5 — 256 MiB per account.** Undecided and unimplemented. The ADR's own §5
records that it depends on the revision-depth decision below and on the
JSONB-versus-Storage question, so it cannot be settled ahead of §6.

**§6 — 20 revisions per prison.** Undecided and unimplemented, and the number
*is* the decision. The arithmetic that originally justified it is wrong: 20
revisions at `DEFAULT_AUTOSAVE_INTERVAL_MS`
(`src/persistence/session/session-controller.ts:9`, `30_000`) is **ten
minutes**, not *"roughly a day of ordinary autosaving"* — and §6 computes 2,880
rows a day from that same constant five lines earlier, so a day of ordinary
autosaving is 2,880 revisions, 144× the proposed number. The ADR already
records this and withdraws the justification (`0013-…md:212-218`) while
deliberately leaving the figure at 20, because moving it is the owner's call
(issue #274, Q2). So what is open is not the discovery but the policy: keep 20
and accept that "restore an earlier generation" means the last ten minutes of
autosaving, or keep "roughly a day" as the requirement and raise the number.
**Settle that before accepting §6.**

Accepting §§1-4 deliberately did **not** approve 256 MiB or 20 revisions.

---

## 3. The live risk to watch: ADR 0016 §2 is binding and nothing enforces it

This is the one thing the 2026-08-25 flips *added* to the risk surface, and it
belongs at the top of any future audit. The three room decisions added nothing
here — none of them touches deployment, SQL or a live hosted mechanism.

Accepting 0016 makes §2 (`0016-…md:96-111`) a **binding constraint**:
production is a separate Supabase project with a distinct project ref, and the
Supabase GitHub integration is never reconfigured to point at it. The ADR says
plainly why that is fragile (`:108`):

> Recorded as a constraint precisely because nothing enforces it mechanically.

The mechanism it constrains is live and irreversible. Migrations reach the
hosted Supabase staging project *"automatically, on every merge to `main`"*
with gating *"none"* (`docs/DEPLOYMENT.md:145`), rollback is not automated, and
the trigger is the merge rather than the diff — PR #87 touched no file under
`supabase/migrations/` and nine migrations were applied anyway. The half of the
decision that *is* in this repository stays verified at `d5c50f8`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` with no
`push:`, requires a typed `confirm_project_ref`, and its apply job is
environment-gated.

So the constraint is now approved architecture whose only defence is a sentence
in a document. Repointing the integration is a two-click change in a dashboard;
it would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 4. What is still Proposed — and it is not nothing

**The premise this revision was written to confirm does not hold, so it is
recorded as found rather than as hoped.** The three flips above were expected to
empty the approval queue. They did not: **four ADRs are still `Proposed` on
`main`** at `d5c50f8`, verified by reading each document's own status line and
its index row rather than by trusting the table.

| ADR | Status line | In this file before? |
| --- | --- | --- |
| [0024](./0024-protocol-fault-recoverability.md) | `Proposed — pending human approval.` | **Yes** — the entry below |
| [0025](./0025-guard-hiring-surface.md) | `Proposed — pending human approval.` | No |
| [0026](./0026-entity-id-lifetime.md) | `Proposed — pending human approval.` | No |
| [0027](./0027-cell-sharing-assessment.md) | `Proposed — pending human approval.` | No |

So there is still an approval queue, and the corollary matters more than the
count: **the next `Proposed` ADR to appear is not a signal on its own**, because
it will be one of five rather than the only one. That is the state the three
flips above were meant to end and did not, and it is worth saying plainly that
0025, 0026 and 0027 have never had an entry here at all. Each arrived with the
change that wrote it — 0025 alongside the hiring surface it designs (#302), 0026
and 0027 as a pair in #299 — rather than being drafted against `main` and left
for review, which is why this file, written for the retroactive-approval problem,
never picked them up. Working them up to the standard of the entries above is a
job of its own and is deliberately not done here; each document's own `## Status`
section states what a reviewer is being asked to sign, and 0026 and 0027 state
their own preconditions. What is asserted here is only the count and the four
status lines.

### ADR 0024 — Proposed, and reversible in one line

It sits in neither group in §1: unlike 0022 and 0023 its decision was live on
`main` the moment its own change merged, and unlike the six flipped for drift
that is not drift — the ADR and the code were written together, which is the case
`docs/adr/README.md` covers with "not binding, whether or not code already
implements it".

**Declared** (`docs/adr/0024-protocol-fault-recoverability.md:5`):

```
**Proposed — pending human approval.** Not accepted.
```

**What is live.** `src/simulation/worker/worker.ts` faults a decode failure with
`{ recoverable: true }`, and `src/ui/simulation-alerts.ts` paints an uncorrelated
`protocol/error` as an alert row.

**What makes it the cheapest entry ever to appear in this file.** Reversing it is
one argument at one call site. No save format, no SQL, no live database
mechanism, no persisted field. The reversal target is named in the ADR, and so
are the tests that would go with it. A "no" here costs a revert, not a migration.

**What a "yes" commits to.** That a message the worker rejected before dispatch
does not end the player's session, and that the fault reaches the player rather
than only the console. It settles issue #187 finding 1 and nothing wider.

**The two lines**, in `docs/adr/0024-protocol-fault-recoverability.md:5`:

```
**Accepted.**
```

and in `docs/adr/README.md`:

```
| [0024](./0024-protocol-fault-recoverability.md) | Which protocol faults end a session, and who is told | Accepted |
```

**One thing moves with it, and only with it.** Accepting 0024 deletes the
implementation note in `docs/adr/0006-simulation-worker-adapter.md` ("a protocol
decode error no longer reaches state 5") and narrows ADR 0006 state 5's clause to
an unhandled exception. That note exists precisely so an Accepted ADR is not
amended on a Proposed one's authority, and it is **still** the only thing in the
corpus that has to move when a status does — §1 records that the three room
flips dragged no note of that shape with them.

---

## 5. What is *not* in this queue, and why

Six things below describe mechanisms `main` does not exercise, or documents that
disagree with each other. **None is a status defect** — either the decision was
accepted and the code has not caught up, which is a code or wiring gap, or two
documents state different numbers, which is a docs-truth job. They are recorded
here only so that reading this file does not leave the impression that the
corpus was audited in one direction. The last three are new as of the room
flips.

- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'`
  is a member of `WorkerState` (`src/simulation/worker/state-machine.ts`) and no
  `transition()` call anywhere targets it — the four in the file go to
  `'faulted'`, `'paused'`, `'paused'`/`'running'` and `'shutting-down'`. Nothing
  in `src/` sends a `protocol/handshake` at all; every occurrence is the
  receiver, the kind list or the schema. So ADR 0006's state 2 describes a state
  the machine cannot occupy, and ADR 0003 decision 4's version negotiation runs
  for nobody. Version compatibility does still fail closed, but by a different
  route — the decoder's `protocolVersion: z.literal(...)` in
  `src/simulation/protocol/types.ts`. This is issue #118 item 1 and issue #274's
  A2, and the fix is in the code.
- **ADR 0010 — the telemetry layer is inert.** Nothing outside
  `src/services/telemetry/` imports it, re-verified at `d5c50f8`, so consent is
  never asked for and `record()` is never called. The prohibition half of the ADR
  holds; the sentence *"telemetry is fed from the main thread's orchestration
  layer"* does not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are
  unmet.** `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts`) exist; no replay runner implements
  the port, no endpoint exists, and nothing outside `src/services/` imports the
  layer. **This status is the most accurate in the corpus** — it says "gated",
  and the gates are genuinely shut. It is listed as a model, not a defect.
- **ADR 0012 — `chunkTopologies` is never evicted.** Accepting 0012 turned the
  residue #295 recorded from a limitation under a proposed ADR into one under an
  accepted one. `GlobalTopologyId` now meets category 2 with respect to recompute
  history, but a chunk that has been loaded still contributes nodes after unload,
  so an id remains a function of chunk *load* history (`docs/DETERMINISM.md`,
  "Known limitations"). Whether a retained topology is dropped on unload is a
  code question the ADR's Consequences hand to a follow-up, not a status
  question, which is why it is here and not in §2.
- **ADR 0023 and ADR 0028 are Accepted and unimplemented, and that is the
  schedule rather than a defect.** New as of this commit, and the same move §1's
  0012 bullet makes: the measurement that used to prove these two *unsigned* now
  measures a gap between an accepted decision and the code. Re-verified at
  `d5c50f8` — `RoomZoningService` registers every instance with `capacity: 0` and
  `objectCapabilities: []`, no room definition in `src/content/room-catalog.ts`
  carries a capacity field at all, and no `'object.*'` id appears as a literal
  anywhere under `src/` outside `src/content/`, so nothing places, builds or
  reads an object. 0028 is the design for closing exactly that, phase 1 is
  started, and 0028's own §*What this costs* is the honest schedule. Nothing here
  is a decision.
- **ADR 0022's pre-correction 900×600 budget disagrees with
  `src/ui/hud/build-panel.ts`, and the disagreement outlived the flip.** The
  ADR's own table says `12.2` and that file's comment on `buyToggle` says `11.8`.
  Both were measured on the same tree by different probes and neither was
  re-derived when the other was written. Nothing turns on which is right — the
  Rooms tab's advantage is ~24× either way, and the corrected figure, `7.81`, is
  the one measured to 0.05px — which is exactly why it has survived unnoticed.
  0022's amendment records it rather than resolving it, and accepting 0022 did
  not resolve it either: it is a docs-truth task, it is now a disagreement
  *inside an accepted ADR*, and it belongs in a change of its own rather than in
  a feature branch. `docs/adr/0025-guard-hiring-surface.md` quotes a third figure
  from the same family (3.9px at 900×600, inherited rather than re-measured),
  which is worth knowing before anyone tries to reconcile two numbers and finds
  three.
- **ADR 0022 was written against v0.0.30 and its structural citations have
  drifted**, which accepting it does not fix and does not make worse. Re-read at
  `d5c50f8`: the ADR says `HudIntent` declares **seven** members and none of them
  is a room — it now declares **thirteen**, three of which are (`zone-room`,
  `unzone-room`, `arm-room-tool`), which is the ADR's central premise being
  answered rather than contradicted. `ZoneRoom` is **no longer in
  `AWAITING_PRODUCER` at all**: #312 gave it a producer, and
  `tests/foundation/unconsumed-command-contract.test.ts` fails in both directions,
  so the entry came out in the same change — which also means the entry text the
  ADR quotes (*"…a build order, the build tool or the undo pair…"*) no longer
  exists to be compared with, and `CancelBuildOrder` is the one member left on
  that list. The `onIntent` switch in `src/main.ts` and its
  `case 'place-build-order'` have both moved too. **None of it touches the
  decision** — the load-bearing facts held, and the amendment is the operative
  part of the file anyway — but a reader following a `file:line` out of that ADR
  should expect to land near rather than on.

Also not in this queue: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:19-32`) while `docs/DEPLOYMENT.md` records that
`lockstate.io` is in fact served by `lockstate-staging` and that Worker
`lockstate` has never been deployed. That is a live operational trap, but it is
a missing warning in the ADR body rather than a wrong status, and the
deployment document already carries it.

---

## 6. Stale status references the flips left behind

Flipping a status does not update every document that *reports* that status.
Each approval was scoped to the status lines and their index rows, so the
references below were deliberately left alone and are recorded here so the next
reader knows they are known rather than missed. None is a decision; each is a
text correction.

**Cannot be edited at all:**

- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql:58` —
  *"PROPOSED, PENDING HUMAN APPROVAL (ADR 0013)"*, sitting above the 4 MiB
  function that is now Accepted as §4. `:19` and `:25` carry the same framing.
  Applied migrations are immutable, so this can only be corrected by a **new**
  migration superseding the function, or left as a historical artefact.
  Leaving it is the recommendation — it is a comment, not behaviour.

**Left by the six retroactive approvals, and each still false:**

- `docs/DEPLOYMENT.md:163` — says ADR 0016 *"is **Proposed, not accepted**"*.
- `docs/adr/0016-migration-delivery-mechanism.md:173` — quotes that
  `DEPLOYMENT.md` sentence verbatim, so the two have to move together.
- `docs/adr/0012-derived-identifier-reproducibility.md:108` — Consequences
  clause (a), *"The status above stays Proposed"*, which the status line
  above it now contradicts directly. `:57` (`## Decision (proposed)`) and
  `:101` (*"which is why this ADR is proposed rather than applied"*) are
  drafting-era phrasing in the same document. This is the most visible of
  the entries here, because the contradiction is inside one file.
- `docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:150` — the Status
  table row and the §4 heading both still mark 4 MiB `PROPOSED`, and `:19-20`
  says a reviewer is being asked to sign off on *three* numbers, now two.
- `docs/adr/0015-actor-identity-allocation.md:145-146` — *"leaves the taxonomy it
  argues in still Proposed"*, now describing a case that cannot arise.
- `README.md:59` — ADR-0014's *"`Status` is `Proposed` … the decision has not
  been approved"*. `:77` warns a reader that several ADRs are `Proposed`, which
  **remains true** — of 0024, 0025, 0026 and 0027 (§4) — and no longer of 0022
  or 0023.
- `docs/CLOUD_SAVE.md:1184` (*"the ADR is `Proposed`, not…"*) and `:1200` (the
  4 MiB row, *"Proposed, pending approval"*), plus
  `docs/TRUSTED_SERVICES.md:577` (*"the 4 MiB per-save figure is proposed, not
  accepted"*). Deliberately **not** listed: `CLOUD_SAVE.md:1201-1202` and
  `:1250` and `:1239`, which call the 20-revision, 256 MiB and §§5-7 items
  proposed and unimplemented — those stay true, and a bulk find-and-replace
  over these files would break them.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
- `src/simulation/rooms/zoning.ts` — ADR 0012 *"is still `Proposed`"*, in the
  instance-id section of the module header. The surrounding reasoning is
  unaffected: a room-instance id needs neither category answer.

**Left by the three room flips, and each now false:**

- `src/simulation/economy/income.ts` — *"ADR 0023 open, ADR 0028 proposed"*, in
  the module header's account of why the income line is still invisible. Both
  halves of that parenthesis are now wrong; **everything else in that paragraph
  is still exactly right**, including the measurement it rests on, which is why
  this is a two-word correction and not a rewrite.
- `docs/adr/0027-cell-sharing-assessment.md:62` — *"(**ADR 0028**, itself
  Proposed)"*. 0027 is itself Proposed, so this is not the
  Accepted-amended-on-a-Proposed-ADR's-authority case §4 describes; it is a
  parenthetical that has gone stale, inside a document that is still awaiting
  its own decision. Correcting it belongs with whoever next touches 0027.
- `docs/research/2026-08-25-economy-rate.md:443` and `:630` — call ADR 0023
  *"Proposed, not accepted"* and *"(Proposed …)"*. These are **dated research
  records** and the repository treats them as records: they were true on
  2026-08-25 when the memo was written, the memo says what it was measuring and
  when, and editing a research record to match a later decision would make it
  stop being one. Recorded as known, and the recommendation is to leave both.

ADR 0017 is the precedent for how to clear the editable ones. When it was
accepted its body was rewritten to say what it had said *while* it was
`Proposed` (`0017-…md:13`, `:167`) rather than leaving present-tense drafting
language in place — and 0022's new `## Status` section uses the narrower half of
the same move, pointing forward at the amendment it was accepted *as* instead of
rewriting the passage that records it.

---

## How to act on a future entry, mechanically

Each flip is **two lines, in one commit**, and the suite enforces the pairing:

1. the `Status` line in the ADR itself, and
2. that ADR's row in the `docs/adr/README.md` table.

`tests/foundation/adr-numbering-contract.test.ts` (*"reports each ADR with the
status that ADR itself holds"*) fails if you move one and not the other, so a
half-done flip cannot merge. The parser reads the **first keyword** of each
side — `Accepted`, `Proposed`, `Superseded`, `Deprecated` — and requires the
two to agree, which is why 0013's split status opens with `Accepted` on both
sides and qualifies only afterwards, and why 0022's and 0023's new statuses open
with `Accepted` before saying "as amended".

Two things that are *not* mechanical, and both were needed by the three flips
above. **A status section is not only a keyword**: 0022's said "nothing in `src/`
implements it yet", which had to move with the keyword or the file would have
contradicted itself in the first paragraph. And **an ADR kept alive rather than
superseded must be true**: 0023 was accepted precisely so its fallback stays
available, which is exactly why the false framing around that fallback could not
be left standing. Neither is something the gate can check.
