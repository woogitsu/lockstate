# Oldest release dependencies and the approved CI split

2026-10-03 bounded fresh REST plus named-ref fetch/ancestry audit. Read-only production/workflows; own isolated research checkpoint. No browser/server, rerun/cancellation/merge or foreign-branch edit. Raw API receipts are retained alongside this record; states can change after this bounded observation.

## Current exact subjects

| PR | Exact head | Actual base | State and exact-head checks |
| --- | --- | --- | --- |
| [1899](https://github.com/woogitsu/lockstate/pull/1899) |3eeeddc2d276714fee6a7c8420270b78d2e49b3c|main; API base snapshot32c28ff27d2f30957ba207a65a722a57a08f5778, fetched live main6d25ebd896c76fb09c2d387185eb1bd8b2a48b8d|Open draft. Mergeability unknown/null in single read. Run37039088544 verify/assets success, browser cancelled at2026-10-02T18:56:59Z. No all-green gate.|
| [1972](https://github.com/woogitsu/lockstate/pull/1972) |41998ff60f013c099a2337dcd64172aa0ab12c34|codex/integrate-full-room-plans-20261001 at3eeeddc2d276714fee6a7c8420270b78d2e49b3c|Open draft, mergeabletrue/stateunstable. Run37045042335 verify/assets success, browser cancelled at2026-10-02T19:46:25Z. No all-green gate.|

[1898](https://github.com/woogitsu/lockstate/pull/1898) is genuinely merged at48da4ac330b43b8e2a8612d8dff160f2d380f05d; fresh fetch confirms that merge is in current main. It is not still an owner/dependency blocker. Exact1899 is an ancestor of1972. Both public PR bodies still retain earlier scope/acceptance evidence; later approved Save/Load or gameplay decisions are not being re-declared pending here.

[2012](https://github.com/woogitsu/lockstate/pull/2012) is already merged, exact4ce977d097ec4f67590a7112d7c19261f205b38e via b01e26fcff4189988b40741679a1b793c25f0c18. The active approved split45e3215edd76606dbe690e60eadc1702cc5e4cd5 plus9bd35eda54/4ce977 is in fetched main6d25; neither frozen1899 nor1972 contains it. Do not ask for the same owner approval again.

## Main gate, precisely identified

The actual CI workflow latest main run [37112225597](https://github.com/woogitsu/lockstate/actions/runs/37112225597) tests merge subjectb01e26fcff4189988b40741679a1b793c25f0c18. In the one bounded jobs read, verify/assets/browser-artifact are success; browser-source(1)/(2) are in_progress and aggregate has not passed. Current main6d25 is the subsequent v0.0.839 release commit. The separately successful Push on main37112250138 at6d25 is another workflow, NOT serial CI. No terminal-green/merge claim is made from it. Raw all-workflow lookup remains preserved to make the disambiguation explicit.

## Minimum authorized split backport: preserve candidate-specific gates

The owner already approved two balanced whole-file source jobs, a separate once-only artifact job and the same-SHA failclosed browser aggregate. The actual activation record records the selected option and producer proof: docs/design/2026-10-02-browser-ci-sharding/README.md at4ce977, original45e321→9bd35→4ce977. No speedup, healthy887-case completion, or83artifact execution is inferred from --list or old partial runs.

**Do not replace1899's whole workflow with the main-based activation YAML.** Actual diff removes the candidate's existing14line `Hydrate Blender sources and angled frames for verification` step, including `assets/source/blender/*.blend,public/assets/environment/oblique/*.png`. That step has separate prior owner approval and is required by candidate art-source tests. Activation's main subject did not contain it. Keep candidate verify/assets/event/concurrency/permission semantics, all existing LFS hydration, wrapper, retries/timeouts, source/assertion coverage and artifact routing.

Minimum active surface for an owner-performed backport:

1. Graft only approved browser aggregate/source matrix/artifact job mechanics into the candidate workflow; preserve its verify/assets and hydration. No budget/protection/runner/config changes.
2. Add exact tests/browser/partition-source-files.ts, historical scheduling-only file-weight-evidence.json, and the two foundation contracts browser-ci-sharding-contract.test.ts/ci-configuration-contract.test.ts.
3. Preserve immutable main `activation/ci-before-activation.yml` and approval evidence. Add a separate exact frozen candidate pre-backport workflow baseline, and aim the unchanged parsed-semantics comparisons at that actual subject for this adaptation; do not overwrite historical bytes or weaken equality/aggregate checks. The contract reads this baseline, weights and evidence/source-all/source-balanced-1/source-balanced-2/artifact-all JSON, so these are required proof dependencies, not optional missing files.
4. Recollect the actual repaired candidate through the unchanged real wrapper --list for source/all + both whole-file bins + artifact once. Prove complete metadata union, no duplicates/file splitting/source-artifact overlap and no static allowlist. Do not reuse main's766/2 or old proposal887/83 as the new subject's count. Preserve one worker/fullyParallelfalse/60s/zero retries; no browser launch is implied by collection.
5. Re-run actual partition omission and all four aggregate result/SHA producer negatives, exact restoration and type/foundation guards, then publish a newly identified candidate and exact-head hosted CI. This is a plan, not a backport applied here.

The existing root-owned local repair ref codex/integrate-first-ci-repair-20261002 at873093cae87312d2fb76f9c540f61374bbef2c8d descends from frozen1899 and ends with actual five-route square-wall keyboard acceptance. Its remote/current release readiness was not verified in this audit; do not claim it as the public1899 head. Root can review/publish that already prepared repair plus the minimal split adaptation on the intended oldest candidate. This audit does not broaden a CI repair into new downstream gameplay/model changes.

## Concrete delivery order

Finish the active main serial CI first. In a root-owned isolated candidate, combine the reviewed first-candidate failure repairs and approved split adaptation while preserving the explicit Blender verification gate; publish it onto the intended1899 subject after owner review. Require actual complete exact-subject verify/assets/both source jobs/once artifact/aggregate green, clean mergeability and draft readiness. A local native subset is useful evidence but does not discharge cancelled entire-suite checks. Merge1899 only after that gate and serial main green.

Then refresh1972 against the accepted parent/main, preserve its already approved refund/manual/pending-object/View dependencies and current scope, retarget to main after1899 lands, and re-establish exact-head checks/mergeability plus the new serial main gate before merging it. Do not reinterpret1972 mergeabletrue as ready while its browser result is cancelled. Further stacked model/gameplay candidates follow these dependencies with their own exact subjects.

Limitations: mergeability for1899 is unknown in the one REST response; no polling was used. CI may progress after these archived snapshots. No repository protection settings were changed or inferred, no remote root/foreign branch was mutated, and no workflow/production backport or browser acceptance was performed. Sibling coordination tool returned agent-thread-limit; exact published activation/current sources and owner record were read directly instead.