# ADR 0044: What happens to a service tier nothing calls

## Status

**Accepted, 2026-08-27 — by the owner's standing delegation.** The owner did not
read this document. The standing words it rests on are *"rób tak żeby było dobrze,
działaj autonomicznie, rób research i sam decyduj"*, and the judgement delegated
is the one this ADR exercises: four complete, tested subsystems have no
production caller, and somebody had to decide, per tree, whether that state is a
plan or a leak. **This is an approval of the judgement delegated and not of the
text.** A reader who disagrees with any decision below should treat it as open
rather than as settled by someone who weighed it. This is the same status shape
as ADRs 0034–0041 and for the same reason.

**What the owner has not been asked and should be.** Decisions 1 and 3 below turn
on two product questions this document deliberately does not answer: *does cloud
save ship?* and *does Lockstate collect telemetry at all?* Both are recorded as
open questions with the evidence that makes them cheap to answer. Nothing here
deletes anything, so nothing here forecloses either answer.

**This ADR is numbered 0044 by central assignment** and pre-commits to being
renumbered if that number is taken by an earlier merge, per
`docs/AGENT_WORKFLOW.md` §2. `docs/adr/README.md`'s "Next free number" line is
deliberately not edited here; it belongs to whoever integrates the parallel
drafts, and it has to read `0045` once this lands.

## Context

### The finding, re-measured rather than accepted

Issue #378 reports four complete service trees — 2,816 lines across 25 files —
outside the production import graph. That was re-derived from the graph rather
than from the issue, by walking value imports from the two entry points
`vite.config.ts` declares (`src/main.ts` and, through its `?worker` specifier,
`src/simulation/worker/worker.ts`), using the same `findImports` scanner the
module-boundary tests use.

| tree | modules | lines (`wc -l`) | reached by production | server half |
| --- | --- | --- | --- | --- |
| `src/services/telemetry/` | 8 | 771 | no | **none** |
| `src/services/entitlements/` | 7 | 883 | no | live, in CI |
| `src/services/challenges/` | 5 | 681 | no | live, in CI |
| `src/persistence/cloud/` | 5 | 481 | no | live, in CI |
| | **25** | **2,816** | | |

The line total agrees with #378 exactly. Two of its other numbers do not, and
both differences matter:

- **301 non-test modules under `src/`, of which 46 are unreachable**, not 47 of
  287. The tree has grown since; the unreachable count fell by one because a
  module was wired. Neither number is wrong for its day.
- **"24 test files" is a count of files that *name* these trees, not of files
  that import them.** Six test files import them: one each for telemetry and
  entitlements, two each for challenges and cloud save. The other eighteen read
  the trees as *text* — `rpc-status-vocabulary-contract.test.ts` reads
  `supabase-client.ts` off disk, `fault-code-reachability-contract.test.ts`
  cites `sync-engine.ts` as a negative control — which is a weaker form of
  coverage and a stronger form of coupling, and it is the half that makes
  deletion expensive. Both counts are true of different questions; only the
  second predicts what breaks.

The check that would have falsified the finding comes back clean, as #378 said:
there is no runtime dynamic `import()` anywhere under `src/`. The two
`import('…')` occurrences (`src/simulation/rooms/topology.ts:55` and `:103`) are
inline type queries and are erased. The walk is conservative in the safe
direction besides — it *follows* an `import()` if it finds one — so its
unreachable set can only be an under-count.

### This is the third inventory of the same fact

- **#141** (2026-08-23) measured all four, at 763 / 883 / 552 / 324 lines —
  reproduced exactly at `95acb8c`, the commit on `main` when it was filed — and
  named what was missing in one sentence: *"What is missing is anywhere that
  says which of these is awaiting a consumer and which is speculative."* It was
  closed as completed by a pull request that fixed a `tsconfig.json` entry.
- **#315/#376** (2026-08-24) walked the graph for a different reason and
  reported 47 of 287 modules unreachable in passing.
- **#378** (2026-08-26) measured the four largest clusters again from scratch.

Nothing changed between them, because none of them left behind anything a build
could read. **That is the defect this ADR is for.** The finding is not that the
code is unreachable — three inventories agree it is, and being unreachable is
sometimes correct. The finding is that it is *rediscovered*, which is what an
unrecorded decision looks like from the outside.

And it is not static while it is unrecorded. Between #141 and #378 the four trees
**grew by 294 lines**: `src/services/challenges/` from 552 to 681 with a file
added, `src/persistence/cloud/` from 324 to 481, telemetry by 8, entitlements by
none. Hardening kept landing on code no code path reaches. #378 puts the
consequence correctly and it is adopted here: that *should be a choice, made
knowing that the client has no constructor, rather than a default*.

### The asymmetry that splits the four into two situations

The question this ADR turns on is not "is it reachable" — all four answer the
same — but **is anything of it running at all**, and there the four split cleanly.

**Three of them have a live server half.** `supabase/` holds 23 migrations and 11
pgTAP suites — **321** assertions at the time of writing, which `pnpm verify:sql`
prints on its last line — executed on every CI run through `pnpm verify:sql`
after `scripts/provision-postgres.sh`.

> **This document said 287 and was overtaken within the hour it landed**, by the
> pass that closed nine CHECK constraints and ADR 0008 T6's unasserted index.
> Kept as a correction rather than silently updated, because it is the cheapest
> possible demonstration of the rule the corpus keeps re-learning: **a count in
> prose rots, and it rots fastest when the thing it counts is under active
> work.** The argument here does not turn on the number — it turns on *there
> being a live server half at all* — which is exactly why the number should have
> been written with the command that derives it in the first place. It now is.

 Cloud save's tables and its
`create_prison`/`create_save_version` RPCs are in it; so are `entitlements`,
`entitlement_events` and `record_entitlement_event`; so are the challenge tables
and `submit_challenge_evidence`. `scripts/verify-supabase-stack.mjs` drives all
three over real HTTP through GoTrue and PostgREST, 48 checks. For these three,
"unreachable" describes the client half of a tier whose other half runs in CI
several times a day.

**Telemetry has no server half at all.** Nothing under `supabase/` mentions it.
`src/services/telemetry/sink.ts` says outright that no transport ships because
"an ingestion endpoint is a deployment decision", and no such decision exists.
It is the one tree that is dead on both sides.

There is a second asymmetry worth naming, because it is the sharpest single fact
here. **`scripts/verify-supabase-stack.mjs` is a second implementation of the
cloud-save client.** 699 lines of raw `fetch` against the same RPCs, and it is
the implementation that actually executes the contract end to end.
`SupabaseCloudSaveClient` is not merely unreachable from production — it is
unreachable from the only end-to-end verification of its own contract.

### What the running build does contain, read out of the artefact

The graph walk is inference; `dist/` is evidence, and #315 is the standing lesson
that the two can disagree. So the bundle was read. `pnpm build` at this commit
emits `dist/assets/index-*.js` (1,694 kB) and `dist/assets/worker-*.js`, and in
the client chunk:

```
$ grep -c "create_save_version\|create_prison\|supabase" dist/assets/index-*.js
0
$ grep -o "telemetry.consent.title\|Help improve Lockstate\|5 extra prison slots" dist/assets/index-*.js
5 extra prison slots
Help improve Lockstate
telemetry.consent.title
```

**Zero occurrences of the cloud RPCs or of Supabase at all, and the trusted
tier's user-facing strings present.** A player downloads the consent prompt for a
telemetry system that cannot send, and the name of a paid save slot that cannot
be bought, and none of the code for either. That asymmetry is the clearest single
statement of what this ADR is about: the product's vocabulary shipped and its
capability did not.

The three facts behind it:

- **No Supabase client.** Nothing in `src/` calls `createClient`.
  `@supabase/supabase-js` appears in exactly two modules and both import it
  `import type`, so the SDK contributes no code to the bundle.
  `tests/foundation/documentation-claims-contract.test.ts` has held this since
  2026-08-24 (*"cannot reach Supabase from the running app"*), and
  `docs/ARCHITECTURE.md:85` states it in prose.
- **Two Supabase secrets, required to deploy.**
  `scripts/check-deploy-secrets.sh` refuses a deployment without
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, deliberately and with
  a comment saying they are "required ahead of the client that will read them".
- **Ten strings for features that are not there.**
  `src/services/localization/default-catalog.ts` ships
  `product.save-slots.plus-5.name`, `entitlements.unverified-offline`, three
  `challenge.result.*` and four `telemetry.consent.*` keys, and
  `defaultMessageCatalogEn` *is* in the production graph — #229 put it there.
  The trusted tier's vocabulary ships; its code does not.

**One correction to #378, and it is the kind this repository asks for.** #378
says *"Nothing states it as a fact about the product… A reader of
`docs/CLOUD_SAVE.md` would not learn it."* That was false on the day it was
written. `5e1018d` (2026-08-23, three days earlier) added to
`docs/CLOUD_SAVE.md`: *"Nothing presents these choices or calls `push`/`pull`…
no module in `src/ui/` imports `src/persistence/cloud/`."* What is true is
narrower and still worth fixing: the sentence is in a subsection about conflict
resolution, and the section whose whole job is to say what has and has not been
executed — *"What has and has not been executed"* — does not carry it. #378's
stated reason for not fixing it immediately (#280's SQL work in flight) has
since expired; `20260826120000` and `20260826130000` are both in the tree.

## Decision

### 1. Keep all four. None is deleted, and none is wired, in this pass.

Each is kept on stated terms, and the terms are the decision — a "keep" whose
reason names no condition can never be discharged, which is how these four
survived three inventories.

| tree | what it is waiting on | what would make it dead |
| --- | --- | --- |
| `src/persistence/cloud/` | A signed-in account. As of 2026-08-27 the *reducer* for that exists (`src/ui/account/account-session.ts`, #34 phase 1) and says outright it "does not talk to Supabase"; the effectful caller — actually calling `signInAnonymously`/`linkIdentity` — still does not exist in `src/` at all. Server half live in CI. | The owner deciding cloud save is out of scope — which deletes `supabase/` and every pgTAP assertion with it (321 at the time of writing), not 481 lines. |
| `src/services/challenges/` | ADR 0009's gate list, which its own Status refuses to discharge: `Accepted — implementation gated`. Server half live in CI. | A decision that there will be no public ranking, superseding ADR 0009. |
| `src/services/entitlements/` | A payment provider, which #36's own Out of scope requires a commercial and legal review to choose; and, for the free-tier half, cloud save, since the slots counted are cloud slots. Server half live in CI. | A decision that there will be no paid tier. |
| ~~`src/services/telemetry/`~~ **— discharged 2026-08-27** | It was waiting on an ingestion endpoint nobody had chosen and a consent surface no module in `src/ui/` provided. Open question 2 below went to the owner and came back *yes*, so both were built: [ADR 0046](./0046-shipping-the-telemetry-pipeline.md). The tree has left `tests/foundation/trusted-tier-reachability-contract.test.ts`'s `PARKED_TREES` for its `WIRED_TREES`, and the "deliberately empty" I/O allow-list named below now holds exactly one entry. | n/a — it is wired. What would make it dead is unchanged in kind: a decision that Lockstate collects no telemetry. |

**Why keep, for the three with a live server half.** Deleting the client half of
a tier whose server half runs in CI does not reduce the amount of unexercised
design in the repository; it moves the whole of it to the side that is harder to
change and cannot be typechecked. The migrations are applied, the policies are
verified, and #36's own remainder section already says these are *"a layer nobody
has connected"* rather than a layer that was abandoned. Reversing that costs
2,045 lines and buys an inconsistency.

**Why keep telemetry, which is the one where deletion is arguable.** *(Kept as
written, and now history: the leash was short and it was pulled in on
2026-08-27. Read it for why keeping it was right, not for the tree's state.)* It is the
implementation of an **Accepted** ADR (0010) and of `docs/TELEMETRY.md`'s
retention commitments. Deleting it leaves an Accepted decision describing code
that does not exist, which is precisely the document-disagrees-with-code defect
this repository names as its most common. So it is kept — **on the shortest leash
of the four**, and this ADR records why the leash is short: it is the only tree
dead on both sides, the only one that cannot be switched on where it lives
(`tests/unit/services-layer-boundaries.test.ts` refuses every egress API under
`src/services/` against a deliberately empty allow-list, so wiring the first send
means moving the sink or amending that gate), and the one already causing a live
inconsistency, because its consent strings ship and its code does not.

### 2. Make "parked" a checked state rather than a discovery.

`tests/foundation/trusted-tier-reachability-contract.test.ts` walks the
production graph and rules on every unreachable module under `src/services/` and
`src/persistence/`. It is the `AWAITING_PRODUCER` shape this repository already
trusts, failing in both directions:

- an unreachable module that no entry accounts for is a new orphan and fails —
  the direction that would have caught all four on the commit that orphaned them;
- a parked tree that *gains* a production consumer fails, naming this ADR and the
  documents that must move with it — the direction without which the list is a
  note that rots. `src/services/localization/` was in this same set and left it
  when #229 wired it, and nothing anywhere recorded that one of the four had gone.

It pins each tree's **module count** rather than its line count: a line count
fails on a reflowed comment, while a file added to code nothing calls is exactly
the event a reviewer should see. That event has already happened once
(`rejection-codes.ts`, added to a tree #141 had already reported as having no
consumer).

The walk itself moved to `tests/helpers/production-reachability.ts` and is now
shared with `tests/foundation/content-validation-reachability-contract.test.ts`,
whose fixtures still pin it in both directions. A second copy of a scanning rule
is #188, and this walk sits directly on the scanner that defect was found in.

### 3. Say it in `docs/CLOUD_SAVE.md`'s own inventory, where a reader looks.

The one-sentence fix #378 asks for, added to *"What has and has not been
executed"* rather than left in the conflict-resolution subsection. That section's
purpose is to state what has been executed, and "no code path in the shipped
build reaches this" is the strongest such statement available about the tier.

### 4. Do not generalise the walk to all of `src/` in this change.

#378's central proposal is to generalise the reachability walk from
"import-time throws under `src/content/`" to "any module", with an allow-list.
That is the right end state and the walk is already general — it takes its entry
points as an argument. It is scoped here to `src/services/**` and
`src/persistence/**` for one reason: the remaining unreachable modules live under
`src/simulation/`, `src/rendering/`, `src/ui/` and `src/content/`, and each needs
a reason written by somebody who knows why that particular barrel has no
importer. Eleven allow-list entries all reading "a barrel nobody imports" is the
list nobody reads that `tests/helpers/simulation-enum-source.ts` argues against,
and it would be written by an agent that does not own those trees. The remaining
46 − 32 = 14 unreachable modules are enumerated in the open questions below so
the follow-up starts from a list rather than a re-measurement.

## Consequences

- The four trees stay. Nothing is deleted, so nothing is lost if a decision goes
  the other way; the deletion, if one is accepted, is a separate reviewable
  commit and this document is the argument it has to answer.
- A fifth orphan under either scanned tree now fails CI on the commit that
  creates it, with a message naming the two lists and this ADR.
- Wiring any of the four now fails CI too, deliberately, with a message naming
  the documents to correct. Two gates fail together in the cloud-save case: this
  one and `documentation-claims-contract.test.ts`'s Supabase assertion. That is
  the intended cost of a milestone, and it is small — one list entry and two
  paragraphs.
- Work landing on a parked tree is still allowed and still invisible unless it
  adds or removes a file. A line-count pin would have caught more and failed on
  reflows; that trade is made deliberately and is the weakest part of this
  decision.

## Open questions

1. **Does cloud save ship?** This is the owner's and nothing in the repository
   can answer it. What makes it cheap to answer now: the server half is verified,
   the client half is written, `#338`'s non-UUID prison id is fixed, and the two
   deploy secrets are already required. What is missing is an account UX (#34)
   and the decision itself.
2. **Does Lockstate collect telemetry? — ANSWERED 2026-08-27: yes.** It was the
   owner's and the owner ruled. The pipeline was finished rather than deleted:
   the `sink.record` bypass closed, a consent surface built, a host pump wired,
   and a configuration-driven transport added that ships nothing while its
   configuration is absent — which it is in every build here.
   [ADR 0046](./0046-shipping-the-telemetry-pipeline.md) is the record, and it
   carries the questions the answer created rather than settled: where the
   endpoint terminates, whether ADR 0008 §3 gains an unauthenticated-ingest
   exception, and the data-protection obligations nothing in this repository
   documents.
3. **The ten trusted-tier strings ship and their code does not.** Nothing renders
   them, so nothing is visibly wrong; but `localization-key-completeness` proves
   them complete, which is a gate proving a property of text no surface can
   reach. Not resolved here because `src/services/localization/` and
   `src/content/` are reachable and out of this change's scope.
4. **The other fourteen unreachable modules**, for whoever widens the walk:
   `src/content/index.ts`; `src/rendering/assets/index.ts`;
   `src/rendering/build/index.ts`; `src/ui/primitives/index.ts`;
   `src/simulation/{clock,determinism,entity,protocol,rng,world,worker}/index.ts`;
   `src/simulation/entity/prototype.ts`; `src/simulation/protocol/transferables.ts`;
   `src/simulation/rooms/definition.ts` (already recorded in `docs/CONTENT.md`
   and asserted by the content gate). Eleven of the fourteen are barrels.

   > **Correction, 2026-08-29 (#378 re-measurement).** `src/simulation/protocol/transferables.ts`
   > is no longer in this list — `src/simulation/worker/state-machine.ts` now
   > imports `collectProtocolTransferables` from it directly (`a3b9b1c`), so the
   > walk reaches it by value. Thirteen remain, not fourteen. Kept as a
   > correction rather than silently fixed, per this repository's own rule that
   > a count in prose rots fastest while the thing it counts is under active
   > work — which thirteen more unrelated commits landing under `src/simulation/`
   > in the same two days confirms.
   >
   > The same re-measurement found a *new* unreachable, non-barrel tree that did
   > not exist when this list was written: `src/ui/account/` (4 modules,
   > `fee6115`, #34 phase 1). It is not added here as a fifteenth entry, because
   > it is not a barrel someone has to explain — it is the same shape as the four
   > trees this ADR already decided about, and it is now tracked the same way:
   > `tests/foundation/trusted-tier-reachability-contract.test.ts` added it to
   > `SCANNED_ROOTS` and `PARKED_TREES` directly (2026-08-29), rather than
   > waiting for this open question's wider widening. See that file's own "One
   > more tree" comment for the reasoning and `docs/CLOUD_SAVE.md`'s "What has
   > and has not been executed" for the one line of this document's own prose it
   > has since made imprecise.
   >
   > **Correction, 2026-09-24 (#1168).** The local-save half now has a
   > production consumer: `src/ui/account/manage-saves-panel.ts` renders
   > `projectSaveList` in Zarządzaj. The reachability gate records
   > `src/ui/account/` as wired and keeps its unused account-preferences and
   > cloud-slot modules individually accounted for. `src/persistence/cloud/`
   > remains parked: no Supabase client, identity flow or sync was connected.
5. **The rule that `src/simulation/**` must not import `src/persistence/**`** is true today —
   measured, zero such imports — and **no test holds it.** The services-layer
   gate holds the simulation-must-not-import-services direction and this one has
   no gate at all. Out of scope here because nothing in this change goes near it,
   and recorded because it was assumed to exist.

## What would change my mind

**Updated 2026-08-27.** The owner's answer to open question 2 settled this
section in the direction it did not anticipate: telemetry was neither deleted
nor left parked. The paragraph stands as written, because its reasoning was
sound and its conclusion — keep it — held.

The weakest claim in this document is that **keeping telemetry is right**. It is
the only tree with no server half, no scheduled consumer, no chosen endpoint, and
a structural obstacle to being switched on where it lives; the argument for
keeping it is an argument about ADR 0010's status rather than about the code. If
the owner answers open question 2 with "no telemetry", the correct action is to
supersede ADR 0010 and delete the tree, and this ADR should be amended rather
than defended.

The second-weakest is the module-count pin in decision 2, which is calibrated to
catch a file appearing rather than work landing. If a parked tree gains another
294 lines without gaining a file, this gate will not have said so.

## References

- Issues [#378](https://github.com/matmaxalez/lockstate/issues/378) (the finding
  this answers), [#141](https://github.com/matmaxalez/lockstate/issues/141) (the
  same finding, first), [#315](https://github.com/matmaxalez/lockstate/issues/315)
  / [#376](https://github.com/matmaxalez/lockstate/issues/376) (the walk this
  reuses), [#36](https://github.com/matmaxalez/lockstate/issues/36) (the trusted
  tier's own remainder section), [#20](https://github.com/matmaxalez/lockstate/issues/20)
  and [#34](https://github.com/matmaxalez/lockstate/issues/34) (cloud save and
  the account UX it waits on).
- [ADR 0008](./0008-trusted-service-boundary.md) — the trust boundary all four
  trees are built against.
- [ADR 0009](./0009-challenge-verification-strategy.md) — the gate list
  `src/services/challenges/` is parked behind, by its own Status.
- [ADR 0010](./0010-telemetry-and-diagnostics-privacy.md) — the decision
  `src/services/telemetry/` implements.
- [ADR 0013](./0013-free-tier-cloud-save-capacity.md) — the capacity model the
  cloud client and the entitlement projection share.
- [CLOUD_SAVE.md](../CLOUD_SAVE.md), [TRUSTED_SERVICES.md](../TRUSTED_SERVICES.md),
  [TELEMETRY.md](../TELEMETRY.md) — the three tier documents this ADR's decision 1
  binds.
