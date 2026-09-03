# Re-verifying five backlog-closure claims against the code, not against the audit that made them

**Date:** 2026-09-02. **Tree:** worktree `docs/revalidate-five-audit-claims`, cut from
`origin/main` at `846af73a` (v0.0.384). Every command below was run in that worktree today;
every quote was read from the file cited at the line cited, today, not carried over from
either audit this note checks against.

**Why this exists.** An external audit recommended closing #274, #280, #657, #540 and #662.
Three of its other, unrelated claims were checked separately and found false (`patrolMetrics`
#557 and `intelligenceConfidenceBonus` #573 both still have `src/` hits; `ChunkCatalogLoader`
is declared `export interface ChunkCatalogLoader extends MessageCatalogLoader`, not a class
implementing it — confirmed again in §5 below). So this note treats the audit's claims about
these five issues as hypotheses to check, not findings to relay, and does the same to a second,
independent document it turned up along the way (`docs/research/2026-09-02-the-open-issue-backlog.md`,
dated the same day) — that document disagrees with the audit on #540 and disagrees with an
earlier comment on #280, and neither disagreement was taken on faith either; both are re-derived
below from commands run in this pass.

**Method note, followed throughout:** an issue's own later comments were not read as proof of
its current state — they can be as stale as the issue. Where a comment or a companion document
made a claim (the 2026-08-29 "DISCHARGED" comment on #280, the 2026-09-02 backlog-triage
document's claims about #540 and #662), the claim was re-run against today's tree rather than
quoted as settled.

---

## Verdicts, at a glance

| # | Verdict | One sentence |
| --- | --- | --- |
| **#274** | **KEEP OPEN** | Mostly discharged, but one 2-line code fix (A17) and three owner-only decisions (Q2, Q4, Q9) are still genuinely unresolved, five and more days after they were named. |
| **#280** | **CLOSE** | All 17 named findings are resolved, structurally unclosable-by-design, or (F13) a trivial one-line doc pointer that does not warrant keeping a 26-finding audit open. Re-ran the suite myself: 321/321 assertions, 11/11 suites, green. |
| **#657** | **CLOSE — superseded** | ADR 0087 decision 2 answers #657's exact question, the owner's ruling on it is recorded and signed on #767, #767 is closed as completed, and the mechanism it describes exists and is wired into the running kernel. |
| **#540** | **RETITLE** | Not a duplicate of #788 — it owns a real, distinct, still-completely-unaddressed decision (should an *admission* ever carry priors). But its own conclusion, "so solitary is unreachable," is now measurably false: tier 3 is reachable through `ClassificationReviewSystem`, independent of admission. |
| **#662** | **RETITLE** | The issue's own proof (`grep` finding no implementation) is now literally false — `createChunkCatalogLoader` is a real, tested implementation. The title's substance survives: nothing wires it into `src/main.ts`, so a second locale still cannot reach the browser. |

---

## #274 — "[ADR] Audit of the whole ADR corpus" — KEEP OPEN

**What it asked for:** a read-only audit of the ADR corpus, delivered as the issue itself
(20 findings, A1–A20, plus C1–C4 from a prior audit). Its own summary names two code fixes
and several items needing an owner decision. The question the brief asked: does that
outstanding work still exist, independently checked, today?

A 2026-08-29 comment on the issue reported three of the LIVE findings as "claim FIXED,
decision open" and one code fix (A17) as still unmade. That comment is five days stale, so
every one of its load-bearing claims was re-run today rather than trusted.

**A17 — `DEFAULT_TILE_CHUNK_SIZE` — still not shipped.**
```
$ grep -rn "DEFAULT_TILE_CHUNK_SIZE" src/
(no output)
$ grep -n "new SparseWorld(32)" src/simulation/runtime/new-session.ts
421:    world = new SparseWorld(32);
$ grep -n "Production Default Chunk Size" docs/adr/0004-chunk-and-tile-storage-strategy.md
14:1. **Production Default Chunk Size**: Set the production default chunk size to `32×32` logical tiles (`1024` tiles per chunk layer).
```
One magic number, one call site, no exported constant — exactly the state the audit
described. This is a two-line, unblocked, non-controversial fix, and it has not been made.

**Q4 / A2 — nothing in `src/` sends `protocol/handshake`, still.**
```
$ grep -rn "kind: 'protocol/handshake'" src/ tests/
src/simulation/worker/state-machine.ts:901:  private handleHandshake(msg: Extract<MainToWorkerMessage, { kind: 'protocol/handshake' }>): void {
tests/determinism/command-queue-admission.test.ts:167:    kind: 'protocol/handshake',
tests/determinism/command-submission-monotonicity.test.ts:154:    kind: 'protocol/handshake',
tests/contract/simulation-worker-entry.test.ts:103:      kind: 'protocol/handshake',
tests/contract/simulation-worker-protocol.test.ts:59:        kind: 'protocol/handshake',
tests/contract/worker-integration.test.ts:51:    kind: 'protocol/handshake',
tests/unit/worker-state-machine.test.ts:32:    kind: 'protocol/handshake',
tests/unit/worker-render-delta.test.ts:427:        kind: 'protocol/handshake',
```
Every real construction site is in `tests/`; the one `src/` hit is the receiver's type
annotation. `docs/adr/0003-simulation-worker-protocol.md:551` states the decision is still
open: *"Decision 4 is left standing rather than rewritten, because the repair is the owner's
choice and not an editor's (issue #274, Q4; issue #118 item 1): either send the handshake …
or delete `protocol/handshake`, `protocol/handshake-accepted` and `'ready'` …"*

**Q2 — revision-retention depth, still open.**
`docs/adr/0013-free-tier-cloud-save-capacity.md:226-227`: *"The number itself is left at 20,
because moving it is the owner's decision and not an editor's** (issue #274, Q2)."* Unchanged.

**Q9 — which Worker is production, still open, and it is deploy configuration.**
`docs/adr/0002-cloudflare-static-assets.md:42`: *"Which of the two Workers is meant to be
production is an open decision for the owner (issue #274, Q9)."* This one is not merely
unresolved — `AGENTS.md`'s exclusion 3 (deploy configuration) puts it outside any agent's
authority to decide or implement, so it is correctly parked here rather than fixed.

**Verdict: KEEP OPEN.** This is not "reduce the scope and close" — A17 alone is real,
unshipped, unblocked work, and Q2/Q4/Q9 are unresolved owner decisions the issue exists
specifically to hold. A separate same-day triage of the whole backlog
(`docs/research/2026-09-02-the-open-issue-backlog.md:95`) independently classifies #274 as
**"C, partly fixed,"** for the same reason: two of its findings were re-verified as
discharged and roughly 28 others were not re-walked at all — which is a reason to narrow the
issue's remaining scope to A17+Q2+Q4+Q9, not a reason to close it.

---

## #280 — "Audit of the SQL tier" — CLOSE

**What it asked for:** an audit of `supabase/`, delivered as the issue (F1–F17), with PR #277
closing what did not need an owner decision and four items (F13–F15, plus #194's open half)
left for one. `supabase/migrations/` was read, never touched, per the brief.

Independently re-ran the SQL suite in this worktree, today, rather than trusting the
2026-08-29 "DISCHARGED" comment on the issue:

```
$ node scripts/verify-supabase-sql.mjs
  ✓ 001_rls_and_save_version_rpc.test.sql: 54/54 passed
  ✓ 002_entitlement_ledger_and_challenges.test.sql: 104/104 passed
  ✓ 003_data_api_grants.test.sql: 35/35 passed
  ✓ 004_free_tier_capacity.test.sql: 33/33 passed
  ✓ 005_function_security_declarations.test.sql: 8/8 passed
  ✓ 006_client_writable_column_bounds.test.sql: 23/23 passed
  ✓ 007_column_bound_coverage.test.sql: 11/11 passed
  ✓ 008_scalar_column_constraint_coverage.test.sql: 12/12 passed
  ✓ 009_rls_policy_surface.test.sql: 25/25 passed
  ✓ 010_constraint_inventory.test.sql: 10/10 passed
  ✓ 011_trigger_inventory.test.sql: 6/6 passed
All pgTAP suites passed (321 assertions).
```

The four owner-decision items are all decided and the decisions are on disk:

```
$ ls supabase/migrations/ | grep -E "20260826120000|20260826130000"
20260826120000_revoke_ambient_table_privileges.sql
20260826130000_server_stamp_updated_at.sql
```
- **F14** (ambient `REFERENCES`/`TRIGGER`): `20260826120000_revoke_ambient_table_privileges.sql`
  revokes both, and suite 003's role sweeps (`c.relkind in ('r','v','m','p','f','S')`) cover
  sequences too, deciding F15 the same way. Both were applied in the run above.
- **#194's open half** (three client-writable `updated_at` columns): server-stamped by
  `20260826130000_server_stamp_updated_at.sql`, applied above with its triggers created.
- **F1, F2, F4, F5, F6**: closed by #277's suites 009 and 010, both present above (25 and 10
  assertions, both green).
- **F3**: unclosable by design (the SELECT policy is narrower than the UPDATE policy it
  shadows, so no probe can separate the two) and documented as such — not a gap, a recorded
  limit.
- **F7–F12, F16, F17**: doc corrections and a pinned dead-clause comment, all landed with #277.

**F13 — the one thing still true.**
```
$ grep -n "CLOUD_SAVE\|supabase\|TRUSTED_SERVICES" docs/SECURITY.md
(no output)
```
`docs/SECURITY.md` still makes no claim about the SQL tier and still carries no pointer to
`docs/CLOUD_SAVE.md`, `docs/TRUSTED_SERVICES.md`, ADR 0008 or ADR 0013. This is a one-line
documentation edit, needs no decision, and does not touch `supabase/migrations/`.

**Verdict: CLOSE**, with F13 handled as its own one-line docs fix rather than a reason to
keep a 26-finding, already-executed audit open.

**A disagreement worth recording rather than resolving.** The same-day backlog triage
(`docs/research/2026-09-02-the-open-issue-backlog.md:96`) classifies #280 as **"B, still
open,"** reasoning that *"its owner-gated half stands, because `supabase/migrations/` is
exclusion 2 and the two RPC defects it neighbours (#340, #343) are still there."* Checked
that reasoning directly: #340 and #343 are real, open, independently filed security findings
(an existence oracle in `create_save_version()` and an unhandled fourth outcome in
`create_prison()`) — but **neither appears anywhere in #280's own issue body**, and neither
is one of #280's F1–F17 findings. They are a different pair of issues from a later pass
(filed 2026-08-26, two days after #280's audit ran) that happen to share the SQL tier. Using
them to keep #280 open conflates "this specific 26-finding audit is done" with "the SQL tier
has no more open issues," which is a different and much larger claim. #340 and #343 should
stay open on their own merits; that is not evidence about #280.

---

## #657 — "Is a refusal an event caused by a press, or a condition of the world?" — CLOSE, superseded

**The chain, verified rather than assumed:**

1. **Does ADR 0087 answer #657's exact question?** Yes. `docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md`
   opens its Context with #657's own question quoted verbatim, and Decision 2
   (`:512`, *"the condition kind is carried as a recomputed set on `simulation/status-counts`,
   and never enters `RefusalLog`"*) is the direct answer.

2. **Is the decision Accepted or Proposed?** The document's overall `Status` line reads
   *"Proposed, 2026-09-01. Not self-approved"* for decisions 1, 3 and 4 — but decision 2,
   the one that answers #657, carries its own amendment: *"Decision 2 is amended, and the
   amendment is signed: the owner ruled on it on 2026-09-01, on issue #767."* This note does
   not change or restate the ADR's status word (per this task's constraints); it reports what
   the document itself already says about decision 2 specifically.

3. **What did the owner actually rule, in their own words** (quoted in the ADR's Amendment
   section): *"A persistent indicator as in option 4 — a closed union recomputed from live
   state, visible without opening anything, not scrolling away, nothing in the save — plus a
   one-off notice at the moment of crossing, so a player who was looking elsewhere gets a
   nudge. The accepted cost is more noise on the events band."* — i.e. **both**: a condition
   and an event, not the either/or #657 posed.

4. **Is #767 really closed?** Checked against the GitHub API directly, not against a comment:
   `state: "closed"`, `state_reason: "completed"`, closed 2026-09-02 by the repository owner.

5. **Is the mechanism actually built, not only described?**
   ```
   $ grep -n "PrisonCondition\b" src/simulation/protocol/types.ts | head -1
   675:export type PrisonCondition = (typeof PRISON_CONDITIONS)[number];
   $ grep -n "computeStandingPrisonConditions" src/simulation/presentation/status-strip-projection.ts | head -1
   253:export function computeStandingPrisonConditions(input: {
   $ grep -n "InsolvencyRungSystem" src/simulation/runtime/new-session.ts
   36:import { InsolvencyRungSystem, … } from '../economy';
   199:  readonly insolvencyRungs: InsolvencyRungSystem;
   946:  const insolvencyRungs = new InsolvencyRungSystem(treasury, events, prisoners.roomInstances);
   $ ./node_modules/.bin/vitest run tests/integration/economy-payroll-loop.test.ts
    Test Files  1 passed (1)
         Tests  10 passed (10)
   ```
   `InsolvencyRungSystem` is registered in the real session build, not only in a test fixture,
   and the integration test that drives a real command-built prison past both insolvency
   rungs passes.

**Verdict: CLOSE — superseded.** The question #657 asked has a recorded, signed answer and a
running implementation. Recommend the issue be closed with a note pointing at ADR 0087's
Amendment section and at #767, rather than left open as if the question were still live.

---

## #540 — "No admission a player can make has ever produced a high-risk prisoner" — RETITLE, not a duplicate of #788

**The audit's claim:** #540 is a duplicate, superseded by #788 (open). **Checked directly,
and the claim does not hold as stated** — but neither does #540's own title, for a different
reason, so a plain "keep open" would also be wrong.

**#540's root citation is still exactly true.**
```
$ sed -n '917,918p' src/main.ts
 * still cannot produce a tier-3 prisoner, because `priorIncidents` is 0 and
const ADMISSION_REQUEST = { priorIncidents: 0 } as const;
```
No admission the HUD can make has ever set `priorIncidents` above 0. Unchanged since #540
was filed.

**But #540's stated *conclusion* — "so solitary is unreachable" — is now measurably false.**
```
$ ./node_modules/.bin/vitest run tests/integration/risk-tier-neglect-reachability.test.ts
 ✓ a neglected, unguarded prison reaches High risk from disciplinary findings alone,
   with priorIncidents pinned at 0 throughout
 ✓ a well-run, staffed prison produces no incidents and settles every tier at Minimal,
   over the same window
      Tests  2 passed (2)
```
Run myself, today, not taken from a report. Tier 3 ("High") is reached at tick 47,999
through `ClassificationReviewSystem` folding disciplinary findings — a mechanism entirely
independent of admission-time `priorIncidents`, which stays 0 throughout the fixture. #540's
own body actually anticipated this exact gap and left it as the next thing to check:
*"whether a classification review actually fires often enough to reach tier 3 in ordinary
play becomes the next thing to measure — nobody has seen it happen."* It has now been
measured, and the answer is yes.

**Is #540 therefore the same defect as #788, and superseded by it?** No.
- **#788** is about whether the high-risk *chip* (#703 ruling 4) and tier ladder are
  reachable *at all* in ordinary play, and about a distinct bug where `Medium` is skipped
  entirely on the way to `High`. Both have already moved: the owner ruled on #788
  (quoted in `src/simulation/prisoners/classification.ts:225-230`: *"The pacing is right …
  But the skip is wrong: a player should see Medium as a warning rather than get High with
  no notice"*), ADR 0090 records the mechanism, and it is implemented and wired:
  ```
  $ grep -n "ClassificationEarlyWarningSystem" src/simulation/prisoners/prisoner-operations-runtime.ts
  11:import { ClassificationEarlyWarningSystem } from './classification-early-warning-system';
  284:  public readonly classificationEarlyWarningSystem: ClassificationEarlyWarningSystem;
  368:    this.classificationEarlyWarningSystem = new ClassificationEarlyWarningSystem(...);
  448:    kernel.registerSystem(this.classificationEarlyWarningSystem);
  ```
- **#540's actual remaining content** — quoted from its own body: *"Whether an admission
  should ever carry priors, and if so how they are chosen, is balance and therefore the
  owner's,"* with three named options (drawn like the sentence; left at 0 deliberately, as a
  stated design; or player-chosen at intake) — is **not addressed anywhere in #788, ADR 0090,
  or ADR 0090's implementation.** ADR 0090's own Context section confirms this explicitly:
  *"entirely independent of `priorIncidents` (which is hard-coded to `0` at `src/main.ts:918`
  and never moves — confirmed again in this pass, untouched)."* Closing #540 as a duplicate
  of #788 would discard the one decision neither #788 nor ADR 0090 takes.

**Verdict: RETITLE**, not CLOSE and not plain KEEP OPEN. The title's evidence sentence
("no admission... has ever produced a high-risk prisoner") is still true; its conclusion
("so solitary is unreachable") is now false and should not stand as written. Proposed title,
keeping the live decision and dropping the falsified conclusion:

> **"Whether an admission should ever carry prior incidents is undecided — `priorIncidents`
> is still hard-coded to 0 at intake (tier 3 is reachable, but only through later
> disciplinary review, never through the front door)"**

A second, independent same-day pass (`docs/research/2026-09-02-the-open-issue-backlog.md:426-435`)
reaches a related but distinct recommendation — "fold #540 into #788" — on the grounds that
both cite `src/main.ts:918`. That pass's own measurement (the same test run above) is sound,
but the merge recommendation was not re-derived here: #540's decision is about *admission*
design and #788/ADR 0090's is about *review-pacing* design, and folding them risks losing
the admission question inside an issue an owner ruling has already mostly closed out. This
note's retitle proposal keeps them separate on that basis, named here so the disagreement is
visible rather than silently picked.

---

## #662 — "`MessageCatalogLoader` is an interface with no implementation" — RETITLE

**Checked #662's own proof, today, exactly as the issue states it:**
```
$ grep -rn "MessageCatalogLoader" src/ | grep -v "catalog.ts"
src/services/localization/chunk-catalog-loader.ts:1:import { type LoadedCatalogResult, type MessageCatalogLoader, loadMessageCatalog } from './catalog';
src/services/localization/chunk-catalog-loader.ts:11: * `MessageCatalogLoader` port that has existed without an implementation
src/services/localization/chunk-catalog-loader.ts:41:export interface ChunkCatalogLoader extends MessageCatalogLoader {
src/services/localization/chunk-catalog-loader.ts:61:export function createChunkCatalogLoader(
src/services/localization/chunk-catalog-loader.ts:63:): ChunkCatalogLoader {
src/services/localization/chunk-catalog-loader.ts:127:  loader: ChunkCatalogLoader,
```
**The issue's own literal proof no longer holds** — there is now a non-empty result, and at
`:41` it is exactly the shape this backlog-verification brief flagged as a live risk:
`export interface ChunkCatalogLoader extends MessageCatalogLoader` is an interface extending
an interface, not a class implementing one. But that is not the whole file. `:61-90`
(`createChunkCatalogLoader`) is a factory function that **returns a real runtime object**
satisfying the port — `locales`, `has(locale)` and an async `load(locale)` that resolves a
registered `import()` thunk and unwraps its module namespace — and it is genuinely tested:
```
$ ./node_modules/.bin/vitest run tests/unit/localization-chunk-delivery.test.ts tests/unit/localization-second-locale-delivery.test.ts
 Test Files  2 passed (2)
      Tests  17 passed (17)
```
Those 17 tests drive real `import()`s of real fixture files through the loader and assert
all three states #662's own "Prove it" section demands: the catalogue loads and text
changes; it fails to load and the UI stays English with a reported failure; a bad version or
a schema violation is refused rather than partially applied. So **an implementation exists**,
in the sense this codebase actually builds implementations (a factory returning an object
that satisfies an interface, not a `class … implements`) — the audit's own contrasting claim
about `ChunkCatalogLoader implementing MessageCatalogLoader` was about the *type
declaration*, and on that narrow point it is right; it just does not follow that no
implementation exists at the value level, and the issue's title is not narrowly about the
type declaration.

**But the file says outright that this does not ship anything yet:**
```
$ sed -n '5,8p' src/services/localization/chunk-catalog-loader.ts
 * PROTOTYPE (#662). Nothing in `src/main.ts` uses this yet -- see
 * `docs/research/2026-08-30-how-a-second-catalogue-reaches-a-running-page.md`
 * §7 for what remains before it is the shipping path.
```
Confirmed independently — no call site:
```
$ grep -rn "createChunkCatalogLoader\|ChunkCatalogLoader" src/main.ts
(no output)
```
So the title's *substance* — a second locale cannot reach the browser — is still true, for
a different reason than the title states: not because the port has no implementation, but
because the implementation that exists is wired to nothing. `docs/CONTENT.md`'s own
description is the more precise true statement today: *"nothing yet fetches a catalog.
`MessageCatalogLoader` is an interface, and the trusted-services layer performs no I/O at
all"* — which is deliberate design (the composition root owns I/O, the port owns
validation), not an absence of an implementation.

**Is there already a separate "wiring" issue that makes #662 redundant?** Checked #663
("Let the player choose a language"), the other half of the Polish umbrella #662 itself
names. #663 is scoped to the picker control, where the language preference is persisted, and
browser-language negotiation — it explicitly treats there being "a route for [a catalogue] to
arrive by" as a dependency, not as its own content, and never mentions
`createChunkCatalogLoader` or wiring it into `main.ts`. So #663 does not cover #662's
remaining gap, and #662 is not redundant.

**Verdict: RETITLE.** Proposed title:

> **"`MessageCatalogLoader` has a tested implementation (`createChunkCatalogLoader`) that
> nothing wires into `src/main.ts` — a second locale still cannot reach the browser"**

---

## What in the brief itself turned out wrong

- Nothing in the brief's own claims (about #557, #573, or `ChunkCatalogLoader`'s declared
  shape) was found wrong here — all three were re-confirmed in the course of this pass
  (§#662 above re-confirms the interface-extends-interface shape directly).
- The audit's claim that **#540 is superseded by #788** is the one claim in this task's own
  scope that is wrong, and it is wrong in the direction the brief warned about: #540 carries
  a real, distinct, completely unaddressed decision (admission-time priors) that closing it
  as a duplicate would have lost.
- A claim this note itself almost inherited and did not: the 2026-08-29 comment on #280
  ("DISCHARGED, safe to close") turned out to still be correct five days later, but only
  because it was re-run rather than quoted — its own suite-count and F13 claims are exactly
  what an independent re-run confirmed.
- A same-day companion document's classification of #280 as "still open" was checked and
  found to rest on two different issues (#340, #343) that #280's own text never names —
  recorded above as a disagreement rather than silently adopted or silently overridden.

**Weakest claim in this note, named:** the #274 verdict rests on re-running four specific
greps and two quoted ADR sentences, not on re-walking all ~28 findings the 2026-08-29 comment
did not re-check either. If any of those 28 have since drifted back to false in the other
direction (a document corrected once and then re-broken, which `docs/AGENT_WORKFLOW.md` §4
names as a real failure mode here), this note would not have caught it. What would change my
mind: re-running the original grep for each of A1, A3–A5, A7–A8, A10–A16, A18–A20 against
today's tree, which was out of scope for a five-issue verification pass.

---

## Commands run in this pass, for reproduction

```
git worktree add -b docs/revalidate-five-audit-claims /workspace/wt-revalidate origin/main
ln -sfn /workspace/lockstate/node_modules /workspace/wt-revalidate/node_modules
git lfs checkout   # in the worktree
node scripts/verify-supabase-sql.mjs
./node_modules/.bin/vitest run tests/integration/risk-tier-neglect-reachability.test.ts
./node_modules/.bin/vitest run tests/integration/economy-payroll-loop.test.ts
./node_modules/.bin/vitest run tests/unit/localization-chunk-delivery.test.ts tests/unit/localization-second-locale-delivery.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
./node_modules/.bin/vitest run tests/foundation/
```

All green: pgTAP 321/321 (11 suites); the three targeted vitest files 29/29 combined;
`tsc -b` exits 0 with no output; `tests/foundation/` 470/470 across 51 files.
