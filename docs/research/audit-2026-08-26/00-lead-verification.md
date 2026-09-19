# Lead auditor verification notes

## SEC-01 re-verification (fork PR -> production deploy)

Chain, link by link, verified against files:

1. `.github/workflows/ci.yml:6` — CI triggers on bare `pull_request`, so a FORK PR does start a CI
   run that belongs to the base repository. CONFIRMED.
2. `ci.yml:27,155,282` — CI has exactly 3 jobs (`verify`, `assets`, `browser`) and all 3 carry
   `if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository`.
   So on a fork PR every job is skipped. CONFIRMED (3 jobs / 3 guards).
3. `.github/workflows/deploy.yml:33-36` — `workflow_run: workflows:[CI], types:[completed], branches:[main]`.
   The `branches` filter matches the triggering run's HEAD branch, so a fork whose PR head branch is
   literally named `main` satisfies it. CONFIRMED by reading the trigger.
4. `deploy.yml:114` — gate is only `github.event.workflow_run.conclusion == 'success'`. It does NOT
   check `workflow_run.event` (push vs pull_request) nor `workflow_run.head_repository.full_name`.
   CONFIRMED.
5. `deploy.yml:131` — checks out `github.event.workflow_run.head_sha`, i.e. the attacker's commit,
   then builds and `wrangler deploy`s it. CONFIRMED.
6. Target impact: `deploy.yml:17-20` and `docs/DEPLOYMENT.md` state the lockstate.io domain is
   attached by hand to the STAGING Worker, so the `staging` job updates the public site.
   CONFIRMED from the repo's own comments.

### The one link that does not resolve from the repo

Whether step 4 passes depends on what GitHub reports as `workflow_run.conclusion` for a run in
which every job was skipped. GitHub's own behaviour here is inconsistent across reports
('skipped' in most, 'success' in some). If it is 'skipped', the chain breaks and this is NOT
exploitable today. If it is 'success', it is a remote unauthenticated deploy of attacker code to
the Worker serving the public site.

=> Report as HIGH, latent / one-line-away, not "live critical". Two independent reasons it must be
fixed regardless of which value GitHub emits:
  (a) The mitigation is accidental, undocumented, and external to the repo. Adding ONE unguarded
      job to ci.yml (a lint job, a label job, a notify job) flips the run conclusion to 'success'
      and opens the door with no reviewer able to see the connection.
  (b) A GitHub Environment protection rule on `staging` (deployment-branch restriction or required
      reviewer) may also currently block it — but that is repo-settings state, invisible here, and
      equally silent if changed.

### Fix (cheap, unconditional)
`deploy.yml:114` — add both clauses:
    github.event.workflow_run.event == 'push'
    && github.event.workflow_run.head_repository.full_name == github.repository
and add a foundation-test assertion so the gate cannot regress (the repo already has
tests/foundation/ci-configuration-contract.test.ts and deploy-secret-gate-contract.test.ts,
so there is an established place for it).

## PRF-16 re-verification (benchmarks do not exercise production code)
CONFIRMED independently. `benchmarks/` = 7 .mjs files; every import resolves inside `benchmarks/`
or `node:*`. Zero imports from `src/`. So the benchmark suite MODELS production behaviour
(e.g. a region pass as `ceil(cellCount/4)`) instead of running it. Consequence: the navigation
cost class the performance agent measured at ~23.9 ms/tick against the real modules is invisible
to CI, which reports 1.76 ms from the mirror.

## Cross-agent convergence (independent agents, same root cause)

### THEME A — the pipeline is gated in the middle, open at both ends
Three agents reached this independently from different directions:
 - SEC-01 (security): deploy gate checks only `conclusion`, not `event`/`head_repository`.
 - OPS-03 (ci/cd):    fork PR skips all 3 CI jobs, and skipped jobs satisfy required checks.
 - OPS-02 (ci/cd):    `workflow_dispatch target=staging` publishes ANY branch, no verify, no
                      approval, to the Worker serving the public domain.
 - OPS-01 (ci/cd):    the deploy path has no LFS materialisation, so shipping real art depends on
                      incidental self-hosted-runner workspace state.
Same shape every time: same-repo PR CI is genuinely excellent (and all of it blocks); the ENTRY
(fork PR) and EXIT (deploy) are the least-gated parts of the system.

### THEME B — a large amount of built-but-unwired capability
Reported independently by three agents, never as the same finding:
 - UXA-03  input remapping: saveInputSettings/remapAndPersistKeyboardBinding/resolveKeyboardLabel
           have zero callers outside src/input/  -> AGENTS.md boundary 10 unmet
 - UXA-07  localization: selectSupportedLocale/loadMessageCatalog/onMissingKey/formatPlural/
           withLocale have no production callers; main.ts:827 hard-codes DEFAULT_LOCALE
 - UXA-08  reducedMotion/uiScale load and persist correctly; nothing reads or sets them
 - ARC-08  TopologyManager (447 LOC) instantiated, exposed on the runtime, never driven
 - ARC-09  nine of fifteen read models have no reader
 - ARC-05  dead handshake: workerBuildId never reaches the main thread
 - PRF-14  the array-buffer transferable transport exists and is used by nothing
 - SEC-13  no auth code exists at all; clearCachedEntitlementProjection has no caller
 - PRF-10  clock backlogMilliseconds is exposed and read by nothing
This is the single most repeated observation in the whole audit. It is not 9 unrelated bugs; it is
one delivery pattern: the simulation/service tier is built ahead of the surface that would use it.

### THEME C — gates that assert bookkeeping rather than behaviour
 - PRF-16 benchmarks never import production code
 - PRF-22 session-component-payload-size asserts a documentation counterfactual, not a payload bound
 - ARC-06/07 the ADR status-queue rule has failed 4 of 7 times; STATUS-QUEUE.md makes five
   mutually inconsistent pending-count statements and its staleness gate expires next release
 - SEC-06 ADR 0021's CSP rationale rests on "no DOM sinks", which no test enforces
 - SEC-05 four comments mention security_invoker; zero assertions check it

## PRD-01 re-verification — CONFIRMED, and it is a closed loop
Verified verbatim at `src/simulation/runtime/new-session.ts:398-478`. The runtime constructs
`jobs`, `electricity`, `water`, `securitySectors`, `securitySchedules: []`, `contraband`,
`intelligence`, `informants`, `searchPolicies: []`, `searchContainerLocations`, `gangs`,
`tunnels`, `incidentSectorIds: []` all EMPTY, under an explicitly stated and five-times-repeated
convention: "no fabricated default content ... until a session/scenario registers them".

I then checked whether any scenario/seeding layer exists. It does not. Every reference in `src/`
to those collections is one of exactly three things:
  1. the empty construction itself (`new-session.ts`)
  2. snapshot/restore plumbing (`session-systems.ts:658-659,693-694` — `length = 0` then
     `push(...systems.security.schedules)`), i.e. RESTORE-ONLY
  3. schema / projection type declarations (`save-schema.ts`, `presentation/*`)
No file under `src/` ever seeds them. Only `tests/` populate them, directly.

=> This is not merely "the seeding layer is missing". It is a CLOSED LOOP: the only production
writer is restore-from-save, and a save can only carry what a session was able to seed — which is
nothing. So in any real player session these registries are empty at t=0 and provably remain empty
forever. `IncidentTriggerSystem` iterating `incidentSectorIds` therefore cannot fire an incident in
any reachable state, and ~4,100 LOC of security/contraband/incidents/operations is unreachable by
construction, not by oversight.

This finding is the ROOT CAUSE beneath Theme B: the unwired surfaces (UXA-03/07/08, ARC-08/09,
PRD-02/06) are downstream symptoms of there being no scenario/seed tier at all. It is also the
highest-leverage fix in the audit: the agent's estimate of ~10 lines of seed data is consistent
with what I read — one sector, one deployment schedule, one watched sector id, one search policy,
utility producers.

## DET-05 re-verification — CONFIRMED, and worse than "one command is skipped"
`src/simulation/kernel/kernel.ts:161`:
    if (nextCommand === undefined || nextCommand.executeAtTick !== this._tick) break;
Strict `!==`. The queue is a SORTED array and this is a head-of-queue test, so a single command whose
`executeAtTick` is in the past does not merely get skipped — it permanently BLOCKS the head, and
therefore every command behind it, for the rest of the session. Silent: no throw, no refusal, no log.
The player's inputs simply stop having any effect. Fix is one character class: `>` / `<=` semantics,
i.e. dispatch while `executeAtTick <= this._tick` (and decide explicitly whether a past-tick command
should execute or be dropped — either is defensible, silently wedging the queue is not).

## DET-01 re-verification — CONFIRMED structurally
`kernel.ts:206` `this._rng = new NamedRngStreams(snapshot.rngStates);` REPLACES the instance on restore.
`new-session.ts:416` `new GuardRoster(DEFAULT_GUARD_CAPACITY, actorIdentity, () => rng.get(ACTOR_IDENTITY_RNG_STREAM))`
closes over the LOCAL `rng` binding, not over `kernel._rng`. So after any restore the guard roster draws
from an orphaned NamedRngStreams that no snapshot observes and no restore rebuilds, while the kernel
draws from the new one. Prisoner and guard names share `identity.actor-name`, so a continuous session and
a save/load session diverge in PERSISTED state. This is a genuine determinism/replay break, not a cosmetic
one, and it compounds with DET-03 (`masterSeed` absent from `savePayloadV5Schema`, both production restores
taking the `= 0` default): the seed is lost AND a live stream is orphaned, from the same restore path.

Pattern worth naming for the report: DET-01 and DET-03 are both "restore rebuilds the object graph but a
closure still points at the pre-restore graph". Any future system that captures a runtime collaborator in a
closure at construction time inherits the same bug. That is an architectural seam, not three bugs.

## TST-06 / ARC-07 re-verification — CONFIRMED IMMINENT (highest urgency, lowest effort)
`tests/foundation/adr-status-queue-anchor-contract.test.ts:89` ANCHOR_STALENESS_BUDGET_RELEASES = 10.
`patchReleasesBetween` (:120-128) = shippedPatch - anchorPatch. STATUS-QUEUE.md:22 anchors v0.0.98;
package.json ships 0.0.108 => 10. Assertion is `toBeLessThanOrEqual(10)` => passes at EXACTLY the limit.
`.github/workflows/version.yml:140-147` bumps the patch on every push to `main`.
=> The next merge ships v0.0.109 => 11 > 10 => `pnpm test` goes RED with zero code change, on a
green PR, in a required CI job. Two agents found this independently from opposite directions.
The test's own failure message forbids the lazy fix ("do not raise ANCHOR_STALENESS_BUDGET_RELEASES
to make this pass, because the number is what the budget is for"), so the intended action is to
re-read §§3-6 against main and move the anchor.

## PER-01 re-verification — CONFIRMED, and it is the worst player-impact finding in the audit
Chain read line by line:
 1. `worker/state-machine.ts:557-561` — `try { restoreSimulationRuntime(...) } catch (error)` is a
    CATCH-ALL and labels every exception `'snapshot-incompatible'`. A bug in our own restore code is
    therefore indistinguishable from a genuinely bad blob.
 2. `session/session-controller.ts:202-209` — on `SnapshotRestoreRejectedError`:
    `await this.repository.demoteGeneration(...)` then `continue` to the next generation.
 3. `local/repository.ts:266` — `demoteGeneration` ends in `tx.deleteGeneration(prisonId, generationId)`.
    It is a real DELETE, not a quarantine.
=> Because the controller LOOPS over generations and the cause is usually deterministic (the same code
path throws on every generation), one load deletes ALL retained generations. The agent reproduced
3 -> 0 in a single load, still unloadable after removing the failure.

### The compound that makes it critical rather than theoretical
PER-08: the repository's OWN V1 in-progress fixture migrates and checksums cleanly, then throws at
`entity-store.ts:252` on restore. Feed that through PER-01 and loading a legitimate old save
irreversibly destroys every save the player has. Related: DET-02 (adding any new named RNG stream
breaks existing bundles) puts a routine future feature addition on the same rails.

Design note for the fix: the intent (drop a bad generation, fall back to an older one) is sound. The
defect is that it cannot tell "this blob is invalid" from "our code threw". Three cheap, independent
mitigations: (a) classify — schema/checksum failure = data fault (demote), unexpected exception =
code fault (fault the session, delete nothing); (b) never delete the LAST remaining generation;
(c) quarantine instead of delete, so a fixed build can recover the save.
