# The ADR approval queue, and where a status contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file; §1 *records* six that moved and the rest is what is still
open, each entry giving the evidence, what settling it commits the project to,
and — where one is outstanding — the exact line that would replace it.
Deciding is the owner's; this file only makes the decision cheap.

Re-anchored at `main` @ `f3ffe6d` (v0.0.45). Every `path:line` below was
re-read from disk at that commit.

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: the gate
checks statuses against documents, never against code. It is a habit, not an
assertion, and this rewrite is that habit being kept — the six entries below
were acted on, so they are recorded as decided rather than left standing as
pending.

---

## 1. What was decided, and when

The six retroactive-approval entries this file was written for are **done**.
The owner was shown the evidence in each and approved all six on
**2026-08-25**; the flips landed in one commit, each as the pair the suite
requires — the `Status` line in the ADR and that ADR's row in
`docs/adr/README.md`.

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
  *"proposed rather than applied"* on account of. Re-verified at `f3ffe6d`:
  PR #295 (issue #112) made `nextGlobalId` a local of `recomputeGlobalTopology`
  (`src/simulation/rooms/topology.ts:213`, incremented at `:219`) rather than
  instance state, so ids are handed out from 1 in canonical sorted order on
  every recompute and `GlobalTopologyId` meets the category-2 requirement the
  ADR sets — pinned by `tests/determinism/iteration-order.test.ts`, which the
  comment at `topology.ts:212` names. The status line therefore records the
  remedy as landed and names the **residue** #295 recorded instead:
  `chunkTopologies` is never evicted (no `delete` on it anywhere in the file),
  so ids are no longer a function of *recompute* history but are still a
  function of chunk *load* history, under "Known limitations" in
  `docs/DETERMINISM.md`. That residue is the part of the category-2 reading
  still open in code, and it is now a limitation under an accepted ADR rather
  than a proposed one. See §6.
- **0015.** The draft replacement kept *"Extends ADR 0012, which is Proposed"*,
  which the same commit falsified. Both were accepted together — which is what
  the old §3 recommended — so the ordering trap it named is **resolved rather
  than triggered**, and the status line says 0012 is Accepted.

**0022 and 0023 were not touched.** They are the two ADRs in the corpus whose
`Proposed` status is fully accurate, and they need a decision rather than a
correction. See §2.

---

## 2. Genuine open decisions — nothing is shipped, so a "no" costs nothing

| ADR | Subject | Implemented? |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Where a player zones a room, and with what gesture | **No** |
| [0023](./0023-room-occupancy-authority.md) | Where a room's occupancy comes from | **No** |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | What a placed object is, and how a room's capacity comes from it | **No** |

**Read 0028 before 0023.** 0023 asks where a room's occupancy comes from and
offers an authored fallback figure; the owner answered that question by choosing
object placement, and 0028 is the design for that answer. So signing 0028 makes
0023's fallback field unnecessary, while signing 0023 as written does *not*
dispose of 0028. More importantly, 0028 corrects 0023's central practical claim:
0023 treats the decision as being about `capacity`, but `findAvailable` gates on
capacity **and** capability, so a capacity-only change is a no-op and produces no
observable behaviour at all.

0028 is verified unimplemented by the same measurement 0023's entry rests on,
plus one more: no `'object.*'` id appears as a literal anywhere under `src/`
outside `src/content/`, so nothing places, builds or reads an object.

These three gate the next feature. 0022 and 0023 re-verified unimplemented at `f3ffe6d`:

- **0022** — `ZoneRoom` is still in the `AWAITING_PRODUCER` allow-list of
  `tests/foundation/unconsumed-command-contract.test.ts:107-108`, and that list
  is a gate: `:213-214` fails the build if a listed command *gains* a producer.
  No member of `HudIntent` (`src/ui/hud/hud.ts:153-211`) is about a room.
- **0023** — `RoomZoningService` still registers every instance with
  `capacity: 0` (`src/simulation/rooms/zoning.ts:259`), and no room definition
  in `src/content/room-catalog.ts` carries a capacity field at all.

One thing is worth knowing before signing 0022, and it is about the evidence
rather than the status. ADR 0022 was written against v0.0.30 and says so;
PR #282's buy surface landed after it, and **four of its structural citations
have drifted as a result** — the ADR anticipated the dependency but not the
drift:

| ADR 0022 says | `main` @ `f3ffe6d` |
| --- | --- |
| `HudIntent` (`src/ui/hud/hud.ts:153-195`) declares **seven** members | **eight**, at `:153-211` — `purchase-materials` (`:186`) is the new one |
| `ZoneRoom` is one of **three** commands in `AWAITING_PRODUCER` (`:106-107`) | **two**, and `ZoneRoom` is at `:107-108` |
| quotes that entry as *"…a build order, the build tool or the undo pair…"* | the entry now reads *"…a build order, **a materials purchase**, the build tool or the undo pair…"* |
| the `onIntent` switch is at `src/main.ts:458-459`, `case 'place-build-order'` at `:511` | `:532` and `:585` |

**None of this touches the decision.** The load-bearing facts still hold:
`RoomZoningService.zone` is complete (`src/simulation/rooms/zoning.ts:203`), it
validates every tile before writing any (`:225-241`), it paints the zoning
plane (`:243-251`), the six refusal reasons are at `:140`,
`session-commands.ts:46` routes the command, all 18 room definitions carry a
`nameKey` (`src/content/room-catalog.ts:66-159`), `buildCatalogue()` is at
`src/main.ts:332`, and **no member of `HudIntent` is about a room** — which is
the fact the whole ADR rests on. The count moved; the conclusion did not.

---

## 3. Still outstanding: ADR 0013 §§5-6

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
`f3ffe6d`.

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

## 4. The live risk to watch: ADR 0016 §2 is now binding and nothing enforces it

This is the one thing the 2026-08-25 flips *added* to the risk surface, and it
belongs at the top of any future audit.

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
decision that *is* in this repository stays verified:
`.github/workflows/migrate-database.yml:33` is `workflow_dispatch:` with no
`push:`, `:40-41` requires a typed `confirm_project_ref`, and `:64` is
environment-gated.

So the constraint is now approved architecture whose only defence is a sentence
in a document. Repointing the integration is a two-click change in a dashboard;
it would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 5. Stale status references the 2026-08-25 flips left behind

Flipping a status does not update every document that *reports* that status.
The approval was scoped to the six status lines and their six index rows, so the
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

**Editable, and each now false:**

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
  been approved"*. `:77` still warns a reader that several ADRs are `Proposed`,
  which remains true of 0022 and 0023.
- `docs/CLOUD_SAVE.md:1184` (*"the ADR is `Proposed`, not…"*) and `:1200` (the
  4 MiB row, *"Proposed, pending approval"*), plus
  `docs/TRUSTED_SERVICES.md:577` (*"the 4 MiB per-save figure is proposed, not
  accepted"*). Deliberately **not** listed: `CLOUD_SAVE.md:1201-1202` and
  `:1250` and `:1239`, which call the 20-revision, 256 MiB and §§5-7 items
  proposed and unimplemented — those stay true, and a bulk find-and-replace
  over these files would break them.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
- `src/simulation/rooms/zoning.ts:77` — ADR 0012 *"is still `Proposed`"*. The
  surrounding reasoning is unaffected: a room-instance id needs neither
  category answer.

ADR 0017 is the precedent for how to clear these. When it was accepted its body
was rewritten to say what it had said *while* it was `Proposed`
(`0017-…md:13`, `:167`) rather than leaving present-tense drafting language in
place.

---

## 6. What is *not* in this queue, and why

Four Accepted ADRs describe mechanisms `main` does not exercise. **None of
them is a status defect** — the decision was accepted and the code has not
caught up, which is a code or wiring gap, not a wrong status. They are recorded
here only so that reading this file does not leave the impression that the
corpus was audited in one direction. The first three are unchanged; the fourth
is new, and is here because accepting 0012 moved it into this category.

- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'`
  is a member of `WorkerState` (`src/simulation/worker/state-machine.ts:27`)
  and no `transition()` call anywhere targets it — the four in the file go to
  `'faulted'` (`:400`), `'paused'` (`:508`), `'paused'`/`'running'` (`:543`)
  and `'shutting-down'` (`:652`). Nothing in `src/` sends a
  `protocol/handshake` at all; every occurrence is the receiver, the kind list
  or the schema. So ADR 0006's state 2 describes a state the machine cannot
  occupy, and ADR 0003 decision 4's version negotiation runs for nobody.
  Version compatibility does still fail closed, but by a different route — the
  decoder's `protocolVersion: z.literal(...)` at
  `src/simulation/protocol/types.ts:154`. This is issue #118 item 1 and issue
  #274's A2, and the fix is in the code.
- **ADR 0010 — the telemetry layer is inert.** Nothing outside
  `src/services/telemetry/` imports it, so consent is never asked for and
  `record()` is never called. The prohibition half of the ADR holds; the
  sentence *"telemetry is fed from the main thread's orchestration layer"* does
  not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are
  unmet.** `verifyChallengeSubmission` (`src/services/challenges/verification.ts:130`)
  and `isPubliclyRankable` (`:270`) exist; no replay runner implements the
  port, no endpoint exists, and nothing outside `src/services/` imports the
  layer. **This status is the most accurate in the corpus** — it says "gated",
  and the gates are genuinely shut. It is listed as a model, not a defect.
- **ADR 0012 — `chunkTopologies` is never evicted.** New as of this commit,
  because accepting 0012 turns the residue #295 recorded from a limitation
  under a proposed ADR into one under an accepted one. `GlobalTopologyId` now
  meets category 2 with respect to recompute history, but a chunk that has been
  loaded still contributes nodes after unload, so an id remains a function of
  chunk *load* history (`docs/DETERMINISM.md`, "Known limitations"). Whether a
  retained topology is dropped on unload is a code question the ADR's
  Consequences hand to a follow-up, not a status question, which is why it is
  here and not in §3.

Also not in this queue: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:19-32`) while `docs/DEPLOYMENT.md` records that
`lockstate.io` is in fact served by `lockstate-staging` and that Worker
`lockstate` has never been deployed. That is a live operational trap, but it is
a missing warning in the ADR body rather than a wrong status, and the
deployment document already carries it.

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
sides and qualifies only afterwards.
