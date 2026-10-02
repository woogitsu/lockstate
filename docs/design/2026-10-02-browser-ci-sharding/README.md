# Browser CI duration proposal — owner review draft

Started: 2026-10-02; final offline receipt: 2026-10-03 (Europe/Warsaw).
Subject: `eeec3e844f`, Laundry integration. No workflow,
repository setting, browser test, timeout or retry policy is changed by this
proposal. Activation remains an owner decision under AGENTS.md reservation 3.

## Decision offered

Approve [balanced whole-file source jobs](ci-balanced.draft.yml), with two
independent `ubuntu-latest` runners, one browser worker on each, one separate
artifact job, and the existing `browser` check as their fail-closed aggregate.
The [simpler native-shard variant](ci-native.draft.yml) is a concrete alternative.
Both preserve `fullyParallel:false`, original assertions, case/expect/startup
budgets, retries zero, and the wrapper's narrowly evidenced network-change retry.
The three executable browser jobs retain the existing 90-minute job ceiling.

## Verified observations, not a speed forecast

The Actions API and complete logs were read for:

| Actual run | Source result / elapsed step | Whole browser job | Artifact |
| --- | --- | --- | --- |
| [main 37032274976](https://github.com/woogitsu/lockstate/actions/runs/37032274976/job/110924601837), `48da4ac330b43b8e2a8612d8dff160f2d380f05d` | 766 passed, 84m36s | 86m42s | historical two cases passed |
| [candidate 37039088544](https://github.com/woogitsu/lockstate/actions/runs/37039088544/job/110949744645), `3eeeddc2d276714fee6a7c8420270b78d2e49b3c` | declared 887; 330 passes and 38 failures observed before cancellation, source step 87m05s | cancelled after about 90m47s | skipped |

The candidate's unfinished 519 cases have no result. Sharding does not correct
its 38 test failures. The main step leaves only 5m24s beneath a 90-minute ceiling,
before accounting for setup, build, and artifact acceptance in the same job.

Actual offline collection through the unchanged suite wrapper found **887 source
tests in 169 files and 83 artifact tests in 32 files**. `--list` did not launch
a browser or server. Artifact collection used this worktree's real production
build. These are collected cases, not passing browser executions.

| Option | Collected source sets | Planning-weight totals | Current tradeoff |
| --- | --- | --- | --- |
| Preferred, whole-file cost balance | 325 cases /79 files; 562 /90 | 4,285.545s; 4,285.759s | Extra collector/partition prototype; keeps each file together |
| Native `--shard=1/2`, `2/2` | 446 /105; 441 /64 | 7,132.545s; 1,438.759s | Simpler, but measured main file cost is about 61m36s versus 22m29s |
| Current sequential job | 887 /169, then artifact83 | no current full healthy duration measurement | One setup; source failure/cap can prevent artifact execution |

Planning totals are **not predicted durations**. 107 file weights use completed
main timings; 19 use fully observed, passing files in the partial candidate;
43 have no complete measured cost and get a neutral scheduling weight of
30 seconds per collected case. That fallback changes no timeout. The actual
83-case artifact duration is **unmeasured**; the old two-case artifact's 17-second
step is not a forecast for this suite.

Critical path after assets is inferred as `max(source1, source2, artifact)` plus
aggregate scheduling; queue time, setup, wrapper retry, and unmeasured files can
dominate. Three hosted setups replace one, increasing runner provisioning and
download cost; aggregate browser test work is unchanged. No elapsed-time saving
or 2× speedup is claimed before an approved exact-subject hosted run.

## Exact reviewable mechanics

- `generate-drafts.mjs` reads current CI and writes only these draft YAML files.
  Verify/assets, event triggers, concurrency, action pins, toolchain provisioning,
  LFS hydration/decode gates, and fork guard retain their parsed semantics.
- The balanced draft collects the complete source suite once on each source
  runner, then deterministically assigns whole files using committed historical
  weights; newly added files receive the same explicit fallback. The checked
  snapshot lists are [set 1](source-files-1.txt) and [set 2](source-files-2.txt).
  A future commit is recollected, so these snapshot lists are not a static allowlist.
- Anchored positional file filters pass through the real existing wrapper on
  both its initial execution and conditional `--last-failed` execution. Shipped
  Playwright 1.56.1 `--test-list` requires title paths: the first file-only prototype
  returned zero collected cases, despite exit 0, and was rejected before publishing
  this draft. No new Playwright config or parallel test mode is introduced.
- Artifact acceptance runs once through the unchanged artifact config/wrapper,
  independently after assets, building its own client. Source failure cannot
  suppress it. Each runner has its own checkout, server port, and `.last-run.json`.
- Each runner checks `git rev-parse HEAD == GITHUB_SHA`. The final `browser`
  aggregate requires both source matrix and artifact results to be `success` and
  both tested subject outputs to match `github.sha`; failed, skipped, cancelled,
  missing or mismatched results must refuse. Existing PR checkout semantics are
  retained: the subject is GitHub's PR merge SHA, not a newly invented head checkout.
- Evidence uses distinct source-shard/artifact names with run ID and attempt,
  retaining `always()`, seven days, traces/results, and suite output. Artifact
  execution no longer clears source results because it runs in another checkout.

## Required activation work and pending proof

The production workflow is untouched. Activation needs the owner's explicit
release, scoped updates to `ci-configuration-contract.test.ts` for the new job
shape/aggregate, and existing suite partition, retry, runner, and selection gates.
Assertions must continue proving full coverage and the same budgets, not be
removed to accommodate the draft. Main branch protection returned API404, so
this proposal does not claim that GitHub currently requires `browser`; any
protection/settings decision is separate and was not performed.

The offline audit is complete: **9/9 green**, then a draft partition-producer
omission gives **1 red /8 green**, followed by byte-exact restoration and fresh
real-wrapper collection giving **9/9 green**. The omitted `app-shell.spec.ts`
removes 65 collected source cases (822 remain); the exact-union audit refuses.
No production workflow was mutated. Prototype producer restoration SHA256:
`ede140cf75ae90dc2d7628710a3901fc35180ccd66d11ea71893dab9e489c279`.
The final checked reports preserve 887 source and 83 artifact cases, no duplicate
IDs, no shared source/artifact files, whole-file ownership, and the physical
201-spec inventory. The native-shard variant has the same union. Case metadata,
serial configuration, provisioning, original output guards, and suite commands
are compared directly. Each draft's actual aggregate shell accepts complete
matching success and refuses 12 failed/cancelled/skipped/missing-result or
mismatched/missing-subject combinations. No GitHub protection change is tested.

[Final receipt](evidence/receipt.json), [baseline](evidence/audit-baseline.log),
[producer omission](evidence/audit-source-omission-red.log), and
[exact-restored audit](evidence/audit-restored.log) retain the obtained results.
[Issue #1983](https://github.com/woogitsu/lockstate/issues/1983) records the verified
capacity boundary separately from specific assertion failures and old host-pool
issues. Fresh searches and read issue IDs are recorded in the receipt.

Reproduce offline from this base with its installed dependencies:

```sh
pnpm build
node docs/design/2026-10-02-browser-ci-sharding/generate-drafts.mjs
node docs/design/2026-10-02-browser-ci-sharding/collect-proposal.mjs
node --test docs/design/2026-10-02-browser-ci-sharding/audit-proposal.test.mjs
```

Collection uses `CI=true`, so `.only` guards remain active. JSON list reports
mark unexecuted cases as skipped; this records collection, not skipped runtime
tests. No hosted execution, native browser acceptance, workflow activation, main
delivery, or deployment is established. No new CI run was started or cancelled.

Weakest claim: historical cost weights will remain useful on the current suite.
A complete hosted run with current per-file timings could reverse the preferred
split or reveal that artifact83 is the actual critical path.

The primary references describe [whole-file sharding without fullyParallel](https://playwright.dev/docs/test-sharding)
and [collection/CLI selection](https://playwright.dev/docs/test-cli). Installed
1.56.1 behavior was checked directly, rather than assumed from current docs.
