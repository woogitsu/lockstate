# The ADR approval queue, and where a status contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** Every entry below records what the ADR
declares, the evidence that the declaration and the code disagree, the exact
line that would replace it, and what merging that line would commit the project
to. Deciding is the owner's; this file only makes the decision cheap.

Established at `main` @ `d2596ad` (v0.0.37); **entry 7 re-verified and
corrected at `b653b93` (v0.0.40)** after #295 discharged ADR 0012's outstanding
remedy; **queue A gained ADR 0028 at `f3ffe6d` (v0.0.45)**. Every `path:line`
was read from disk at the commit its entry names.

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change an
entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how entry 7 came to be false for two
releases. Nothing mechanical can catch that — the gate checks statuses against
documents, never against code — so it is a habit, not an assertion.

---

## How to act on an entry, mechanically

Each flip is **two lines, in one commit**, and the suite enforces the pairing:

1. the `Status` line in the ADR itself, and
2. that ADR's row in the `docs/adr/README.md` table.

`tests/foundation/adr-numbering-contract.test.ts` (*"reports each ADR with the
status that ADR itself holds"*) fails if you move one and not the other, so a
half-done flip cannot merge. Both lines are given verbatim in every entry below.

---

## 1. What is actually waiting on you

Nine ADRs are `Proposed`. They are **not one queue** — they are two, and
conflating them is what makes the queue look longer and more urgent than it is.

**Queue A — genuine open decisions. Nothing is shipped; a "no" costs nothing.**

| ADR | Subject | Implemented? |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Where a player zones a room, and with what gesture | **No** |
| [0023](./0023-room-occupancy-authority.md) | Where a room's occupancy comes from | **No** |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | What a placed object is, and how a room's capacity comes from it | **No** |

These three are the only ADRs in the corpus whose `Proposed` status is fully
accurate, and they are the ones that gate the next feature. 0022 and 0023 were
verified unimplemented at `d2596ad`; **0028 was added at `f3ffe6d` (v0.0.45)**
and is verified unimplemented by the same measurement 0023's entry rests on plus
one more: no `'object.*'` id appears as a literal anywhere under `src/` outside
`src/content/`, so nothing places, builds or reads an object.

**0028 is the decision 0023 becomes if you take it.** 0023 asks where a room's
occupancy comes from and offers a fallback figure; the owner answered that
question by choosing object placement, and 0028 is the design for that answer.
Signing 0028 therefore makes 0023's authored-fallback field unnecessary, and
signing 0023 as written does *not* dispose of 0028 — the two overlap and a
reviewer should read 0028 first, because it corrects 0023's central practical
claim (0023 treats the decision as being about `capacity`; `findAvailable` gates
on capacity **and** capability, so a capacity-only change is a no-op).

Both verified unimplemented at `d2596ad`:

- **0022** — `ZoneRoom` is still in the `AWAITING_PRODUCER` allow-list of
  `tests/foundation/unconsumed-command-contract.test.ts:107-108`, and that list
  is a gate: `:212-213` fails the build if a listed command *gains* a producer.
  No member of `HudIntent` (`src/ui/hud/hud.ts:153-211`) is about a room.
- **0023** — `RoomZoningService` still registers every instance with
  `capacity: 0` (`src/simulation/rooms/zoning.ts:259`), and no room definition
  in `src/content/room-catalog.ts` carries a capacity field at all.

**Nothing in this file asks you to change 0022's, 0023's or 0028's status.**
They need a decision, not a correction, and every entry below is about a
different ADR.

One thing is worth knowing before signing 0022, though, because it is about the
evidence rather than the status. ADR 0022 was written against v0.0.30 and says
so; PR #282's buy surface landed after it, and **four of its structural
citations have drifted as a result** — the ADR anticipated the dependency but
not the drift:

| ADR 0022 says | `main` @ `d2596ad` |
| --- | --- |
| `HudIntent` (`src/ui/hud/hud.ts:153-195`) declares **seven** members | **eight**, at `:153-211` — `purchase-materials` (`:186`) is the new one |
| `ZoneRoom` is one of **three** commands in `AWAITING_PRODUCER` (`:106-107`) | **two**, and `ZoneRoom` is at `:107-108` |
| quotes that entry as *"…a build order, the build tool or the undo pair…"* | the entry now reads *"…a build order, **a materials purchase**, the build tool or the undo pair…"* |
| the `onIntent` switch is at `src/main.ts:458-459`, `case 'place-build-order'` at `:511` | `:532` and `:585` |

**None of this touches the decision.** The load-bearing facts still hold, re-read
at `d2596ad`: `RoomZoningService.zone` is complete (`src/simulation/rooms/zoning.ts:203`),
it validates every tile before writing any (`:225-241`), it paints the zoning
plane (`:243-251`), the six refusal reasons are at `:140`, `session-commands.ts:46`
routes the command, all 18 room definitions carry a `nameKey`
(`src/content/room-catalog.ts:66-159`), `buildCatalogue()` is at
`src/main.ts:332`, and **no member of `HudIntent` is about a room** — which is
the fact the whole ADR rests on. The count moved; the conclusion did not.
Reading `:153-195` and finding eight members where the ADR says seven is the
kind of thing that makes a reviewer distrust a document that is in fact right,
which is the only reason it is recorded here.

**Queue B — retroactive approval. The decision has already shipped.**

| ADR | Subject | Implemented? | Reversible? |
| --- | --- | --- | --- |
| [0016](./0016-migration-delivery-mechanism.md) | Which mechanism applies migrations | Mechanism live | **No** — rollback is not automated |
| [0015](./0015-actor-identity-allocation.md) | Actor identity is allocated | Fully, incl. save format | No — a name is in every V3/V4 save |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Art storage and asset delivery | Fully | Yes |
| [0021](./0021-http-response-security-headers.md) | HTTP response security headers | Fully | Yes |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Free-tier cloud-save capacity | **Partial** — §§1-4 yes, §§5-6 no | §§1-4 are in SQL |
| [0012](./0012-derived-identifier-reproducibility.md) | Reproducibility of derived identifiers | **Yes** — taxonomy in use, remedy landed in #295 | Taxonomy is cited from `src/` |

The rest of this file is Queue B, ordered by what a wrong answer costs.

---

## 2. ADR 0016 — the mechanism is running, and it is the only one that can destroy data

**Declared** (`docs/adr/0016-migration-delivery-mechanism.md:5`):

```
**Proposed — pending human approval.** Not accepted.
```

**Why that contradicts `main`.** The ADR's own decision §1 (`:87-89`) is written
in the present indicative, not as a proposal:

> The Supabase GitHub integration is connected to `matmaxalez/lockstate` with
> **Deploy to production** enabled, pointed at the `lockstate` project.
> Merging to `main` applies migrations to it without further approval.

`docs/DEPLOYMENT.md` carries the same mechanism as a live table row —
migrations to Supabase staging run *"automatically, on every merge to `main`"*
with gating *"none"* — and records the window on 2026-08-23 in which nine
migrations went from unapplied to applied around a merge.

The half of the decision that is *in* this repository is verified: §3's
workflow is dispatch-only and typed-ref gated —
`.github/workflows/migrate-database.yml:33` (`workflow_dispatch:`, and no
`push:`), `:40-41` (`confirm_project_ref`), `:64` (`environment:`). What is
**not** verified from this repository, and cannot be, is the dashboard toggle
in §1; the ADR says so itself at `:108`:

> Recorded as a constraint precisely because nothing enforces it mechanically.

So `main` simultaneously asserts that an ungated, merge-triggered, irreversible
database mechanism is running and that nobody has approved it. §2's constraint —
never point the integration at production — is currently enforced by that
sentence and nothing else.

**Exact replacement line** (`0016-migration-delivery-mechanism.md:5`):

```
**Accepted.** The §1 mechanism was already live when this was written; this accepts it retroactively.
```

**Matching README row:**

```
| [0016](./0016-migration-delivery-mechanism.md) | Which mechanism applies migrations, and to which project | Accepted |
```

**What merging that commits you to.** That merges to `main` may apply
migrations to a hosted Supabase project with no approval step, and that §2 —
production is a separate project the integration is never pointed at — becomes
a binding constraint on a future you have not built yet, still unenforced by
anything mechanical. If that is not acceptable, the other answer is **Rejected**
plus disconnecting the integration in the Supabase dashboard; leaving the ADR
`Proposed` is the one answer that changes nothing while the mechanism keeps
running.

---

## 3. ADR 0015 — approval is retroactive; an actor's name is already in the save format

**Declared** (`docs/adr/0015-actor-identity-allocation.md:4-5`):

```
Proposed. Extends [ADR 0012](./0012-derived-identifier-reproducibility.md),
which is itself Proposed — see **What this asks a human to accept**.
```

**Why that contradicts `main`.** Every part of the decision is wired, and the
identity is persisted:

| what | where |
| --- | --- |
| the named RNG stream is registered | `src/simulation/runtime/new-session.ts:204` |
| the registry is constructed | `:213` |
| prisoners are given it | `:215` |
| guards mint through it | `:270` |
| it is exposed on the session | `:391` |
| it is a field of the save schema | `src/persistence/save-schema.ts:715` (`actorIdentitySnapshotSchema`), `:838` (V3), `:868` (V4) |

The V3 and V4 payloads both carry `identity`, so the envelope checksum covers an
actor's name. That is not a decision a later "no" can withdraw without a
migration.

**Exact replacement line** (`0015-actor-identity-allocation.md:4`):

```
Accepted. Extends [ADR 0012](./0012-derived-identifier-reproducibility.md), which is Proposed — see **What this asks a human to accept**.
```

**Matching README row:**

```
| [0015](./0015-actor-identity-allocation.md) | Actor Identity Is Allocated, Not Derived | Accepted |
```

**What merging that commits you to.** Names are allocated and carried, never
re-derived from an entity id, and the `identity` section stays in the save
format. Note the ordering trap the current line already names: 0015 extends
0012, so accepting 0015 while 0012 stays `Proposed` accepts the taxonomy
implicitly. Entry 7 below is the same decision one level down; taking them in
one commit is cheaper than taking them apart.

---

## 4. ADR 0014 — fully implemented, and the ADR does not say so

**Declared** (`docs/adr/0014-art-storage-and-runtime-asset-delivery.md:3`):

```
- Status: Proposed
```

**Why that contradicts `main`.** Every mechanism the ADR decides is in place:

- LFS tracking — `.gitattributes:1-4`, four patterns covering `*.png` under
  three trees and `*.blend` under `assets/source/`.
- Runtime asset headers — `public/_headers`.
- The CI split the ADR argues for — `.github/workflows/ci.yml:155` (`assets:`),
  `:159` (`needs: verify`), `:184` (`provision-git-lfs.sh`), `:206`
  (`git lfs pull --include="public/assets/actors"`), and the `browser` job
  pulling the same subset at `:328`.

**Exact replacement line** (`0014-art-storage-and-runtime-asset-delivery.md:3`):

```
- Status: Accepted
```

**Matching README row:**

```
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Art storage, generated-versus-source policy and runtime asset delivery | Accepted |
```

**What merging that commits you to.** The generated-versus-source split and the
pointer-only `verify` checkout become binding. The ADR's one genuinely open
question — whether `public/game-content/source-art/` should be published at all
— is a *content* question inside the ADR and is not settled by accepting the
storage policy; if you want it kept open, say so in the same commit rather than
leaving the whole ADR `Proposed` to hold one paragraph.

---

## 5. ADR 0021 — the headers are live in `public/_headers`

**Declared** (`docs/adr/0021-http-response-security-headers.md:3`):

```
- Status: Proposed — pending human approval
```

**Why that contradicts `main`.** All ten decided headers are shipped, verbatim,
at `public/_headers:1-10` — `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, the full `Content-Security-Policy`,
`Strict-Transport-Security`, and the three cross-origin isolation headers. The
file's own comment block beginning at `:12` cites this ADR as the record of why each
directive has the shape it has, which is a citation of a `Proposed` document as
settled architecture.

**Exact replacement line** (`0021-http-response-security-headers.md:3`):

```
- Status: Accepted
```

**Matching README row:**

```
| [0021](./0021-http-response-security-headers.md) | HTTP response security headers for the static-asset deployment | Accepted |
```

**What merging that commits you to.** The CSP as written, including the two
allowances the ADR records as non-optional and measured (`img-src blob:` and
`img-src data:`, both required by Phaser's loader and texture boot). Tightening
either later is a renderer-breaking change, which the ADR already documents.

---

## 6. ADR 0013 — half shipped, and the shipped half is the half already in SQL

This is the entry to read slowly. **0013 cannot be flipped with one word**,
because two of its six decisions are enforced in the database and two are
explicitly absent — and the ADR's own section headings say which is which.

**Declared** (`docs/adr/0013-free-tier-cloud-save-capacity.md:5`):

```
**Proposed — pending human approval.** Not accepted.
```

**What is implemented** — `supabase/migrations/20260823100000_bound_free_tier_capacity.sql`:

| ADR section | state | evidence |
| --- | --- | --- |
| §1 five free slots, enforced by the database | **shipped** | `base_save_slot_capacity()` `:45`, `account_save_slot_capacity(uuid)` `:91` |
| §2 a trigger, with an RPC as the front door | **shipped** | `enforce_prison_slot_capacity()` `:150`, trigger `:186` |
| §3 over-capacity degrades read-only | **shipped** | the exception's `hint` at `:178` — *"Existing prisons stay listable, pullable and playable; only creating another slot is blocked."* |
| §4 4 MiB per-save payload bound | **shipped** | `max_save_payload_bytes()` `:71-73` — `as $$ select 4194304 $$;` |
| §5 256 MiB total per account | **absent** | no total-bytes function, trigger or column anywhere in `supabase/migrations/` |
| §6 20 revisions retained per prison | **absent** | no retention or pruning logic anywhere in `supabase/migrations/` |

The ADR is honest about this in its own headings — §5 and §6 both read
**"Not implemented."** — which is why the defect here is *not* that the document
lies. It is that a single-word status cannot describe a decision that is 4/6
enforced in a hosted database, so the one word it does carry (`Proposed`)
understates §§1-4 and the migration comment at `:58` propagates it:
*"PROPOSED, PENDING HUMAN APPROVAL (ADR 0013)"* — in the file that enforces it.

**Exact replacement line** (`0013-free-tier-cloud-save-capacity.md:5`):

```
**Accepted for §§1-4, which are enforced in SQL. §§5-6 remain Proposed and unimplemented.**
```

**Matching README row:**

```
| [0013](./0013-free-tier-cloud-save-capacity.md) | Free-tier cloud-save capacity and where it is enforced | Accepted — §§5-6 still proposed |
```

> **Check before merging this one.** The status parser in
> `tests/foundation/adr-numbering-contract.test.ts` reads the first keyword of
> the status and requires the index row to start with the same keyword. Both
> lines above start with `Accepted`, so they agree and the suite stays green.
> A replacement starting with any other word must change both lines the same way.

**What merging that commits you to.** Five slots and a 4 MiB per-save bound as
settled policy — they are already live in SQL, so this is retroactive — while
leaving the two numbers that are genuinely undecided undecided. **Do not let
this entry approve 256 MiB or 20 revisions by accident**; those are §5 and §6,
neither exists, and §6's justification is separately wrong on `main`: the ADR
argues 20 revisions is *"roughly a day of ordinary autosaving"* at
`DEFAULT_AUTOSAVE_INTERVAL_MS` (`src/persistence/session/session-controller.ts:9`,
`30_000`), which is ten minutes, not a day — and the ADR computes 2,880/day from
that same constant five lines earlier. Settle the number before accepting §6,
not after.

---

## 7. ADR 0012 — the taxonomy is cited from `src/`, and its remedy has now landed

> **Re-verified at `main` @ `b653b93` (v0.0.40).** This entry said the remedy was
> outstanding, and #295 discharged it after this file was written. Corrected
> below, including the replacement line, which changed as a result.

**Declared** (`docs/adr/0012-derived-identifier-reproducibility.md:4`):

```
Proposed. Extended by
```

**Why that contradicts `main`.** The *taxonomy* is in use as settled
architecture: `src/simulation/identity/actor-identity.ts:8` carries the heading
*"## Category: allocated identity, not a derived value (ADR 0012 / ADR 0015)"*
and `:16` says the category is declared *"explicitly because ADR 0012 forbids
leaving the category implicit"*. A `Proposed` ADR is being obeyed as a rule.

**The remedy is no longer outstanding.** `nextGlobalId` is now a local of
`recomputeGlobalTopology` (`src/simulation/rooms/topology.ts:213`, incremented
at `:219`) rather than instance state, so ids are handed out from 1 in canonical
sorted order on every recompute and `GlobalTopologyId` meets the category-2
requirement the ADR sets. #295 landed that and recorded it in the ADR's own
Consequences, which now say the follow-up *"has landed"*.

That change deliberately left two things for this ADR: the status, and whether
`chunkTopologies` should be evicted on unload — ids are no longer a function of
recompute history but are still a function of chunk *load* history, recorded
under "Known limitations" in `docs/DETERMINISM.md`. So the remaining question is
narrower than it was, and it is entirely a question about the status.

Three things that were wrong here are **no longer wrong** and need no action:
the path-request-id row of the identifier table records that the ids are
persisted (`save-schema.ts:419`, `:468`), the Consequences record that the
exception's escape clause has fired and that `JobRegistry.loadSnapshot`
(`src/simulation/operations/job.ts:110`) and `GuardRoster.loadSnapshot`
(`src/simulation/security/guard-roster.ts:198`) compensate on restore, and the
`GlobalTopologyId` remedy above. All verified at `b653b93`.

**Exact replacement line** (`0012-derived-identifier-reproducibility.md:4`):

```
Accepted. Extended by
```

**Matching README row:**

```
| [0012](./0012-derived-identifier-reproducibility.md) | Reproducibility of Derived Simulation Identifiers | Accepted |
```

**What merging that commits you to.** Every new id-minting subsystem must
declare its category in its module doc and gain a pin under
`tests/determinism/` — a rule the repository is following in one place and
enforcing in none. It also settles the category-2 reading of `GlobalTopologyId`,
which #295 explicitly declined to settle for you, and makes the open
`chunkTopologies` eviction question a ruling under an accepted ADR rather than a
limitation under a proposed one. This is now the **cheapest** entry in Queue B:
the code already complies, and nothing about accepting it obliges a change.

---

## 8. What is *not* in this queue, and why

Three Accepted ADRs describe mechanisms `main` does not exercise. **None of them
is a status defect** — the decision was accepted and the code has not caught up,
which is a code or wiring gap, not a wrong status. They are recorded here only
so that reading this file does not leave the impression that the corpus was
audited in one direction.

- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'` is
  a member of `WorkerState` (`src/simulation/worker/state-machine.ts:27`) and no
  `transition()` call anywhere targets it — the four in the file go to
  `'faulted'` (`:400`), `'paused'` (`:508`), `'paused'`/`'running'` (`:543`) and
  `'shutting-down'` (`:652`). Nothing in `src/` sends a `protocol/handshake` at
  all; every occurrence is the receiver, the kind list or the schema. So ADR
  0006's state 2 describes a state the machine cannot occupy, and ADR 0003
  decision 4's version negotiation runs for nobody. Version compatibility does
  still fail closed, but by a different route — the decoder's
  `protocolVersion: z.literal(...)` at `src/simulation/protocol/types.ts:154`.
  This is issue #118 item 1 and issue #274's A2, and the fix is in the code.
- **ADR 0010 — the telemetry layer is inert.** Nothing outside
  `src/services/telemetry/` imports it, so consent is never asked for and
  `record()` is never called. The prohibition half of the ADR holds; the
  sentence *"telemetry is fed from the main thread's orchestration layer"* does
  not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are
  unmet.** `verifyChallengeSubmission` (`src/services/challenges/verification.ts:130`)
  and `isPubliclyRankable` (`:270`) exist; no replay runner implements the port,
  no endpoint exists, and nothing outside `src/services/` imports the layer.
  **This status is the most accurate in the corpus** — it says "gated", and the
  gates are genuinely shut. It is listed as a model, not a defect.

Also not in this queue: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:19-32`) while `docs/DEPLOYMENT.md` records that
`lockstate.io` is in fact served by `lockstate-staging` and that Worker
`lockstate` has never been deployed. That is a live operational trap, but it is
a missing warning in the ADR body rather than a wrong status, and the
deployment document already carries it.
