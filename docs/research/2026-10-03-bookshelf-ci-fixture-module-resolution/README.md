# Bookshelf predecessor CI fixture-module resolution — 2026-10-03

## Exact state and scope

One fresh REST read of PR2003 reports OPEN/draft, mergeable true, mergeable_state unstable, head3c0e528d76b6cdebd4654017cfadb2ea906c4e18 and Chair/Rack parent2a4ca454b819d3b17bd3f6020373dbbd332e3dc2. Correct named refs were fetched. Initial guessed parent name failed absentref; it was corrected from REST. The isolated worktree starts at the exact published child. Parent then cancelled optional merge work: **no merge was attempted and no parent-integration conflict/patch is claimed**.

The exact-head required-check read reports verify failure and assets/browser skipped, run37096988854/job111129035445. Retrieved terminal verify log reports1failed/7896passed/8skips across652files. Only browser-network-changed-retry-contract fails. No current browser result or new whole-suite run is inferred from those numbers.

## Actual cause and narrow correction

Both affected browser specs already import their runtime test/expect from network-changed-fixture. The unchanged routing contract scans the exact quoted package name in source text. Both PNG decoder resolvers use that quoted package entry; the Actors spec also imports Page/TestInfo types directly from it. Thus this guard flags two files even though the automatic evidence fixture is active. The fix moves the Actors types to the existing fixture reexports and resolves the same declared package's exported package.json manifest to locate the same bundled PNG decoder. No split string, weakened guard, new dependency, retry, budget, assertion or runtime source change is used.

The opened actual installed package resolves old entry and new manifest into the same package directory. Both resolve playwright-core/lib/utilsBundle to **the exact same absolute file**, identical SHA256a0f08138e7b23a04491b0cc2cedbe77f0a853b2b6232292a92996137fe85ad7c and same PNG export object. Decoding the genuine existing guard atlas260×3104 produces identical full RGBA bytes; original PNG and decoded byte hashes are in decoder-equivalence.json. No native screenshot or actor acceptance rerun is claimed.

## Measured baseline and first checkpoint

The exact failed contract reproduces locally:1RED/6GREEN, original two offender names retained in baseline.txt. After the two scoped import/resolver edits it passes7/7. No guard, fixture, source, model, content, configuration, attributes or archived native evidence file is edited. This is a test-consumer wiring correction; native and hosted fresh CI remain separate. Bounded neighbor/types/docs gates are recorded in the following checkpoint.

## Evidence limits

CI-verify-log.txt is the actual GH CLI text response saved as UTF8 lines by PowerShell, not claimed as raw HTTP byte identity. The first log request was refused by GH CLI because the log contains escape sequences; the successful repeated log download explicitly allowed them. No run was cancelled, restarted or polled. The weakest claim is future hosted CI success: only exact past failure and scoped local guards/decoder equivalence are established here. A future failed check can falsify the release claim; no such release claim is made.

## Terminal bounded controls

The real test-consumer resolver was reverted to the original package entry in both affected specs, while the unchanged routing guard ran:1RED/6controls with the same two names. Both original fixed file buffers were restored in finally with identical SHA256 before/restored; the exact restored contract returns7/7. Mutation ran on this own detached HEAD to exclude temporary source bytes from branch sweeps; no gameplay production or native consumer mutation is claimed.

Final strict application types exit0. Named bounded source neighbors pass42tests/6files: network-change signature, browser partition and selection, actor projection, pending-wall depth and genuine pending-wall fixture. Scoped research-index/documentation-links pass15tests/2files. No wider suite, new browser/server, build or native acceptance run was performed. Raw logs and exact executed inert recipes are retained.

Existing network-changed-fixture already reexports CDPSession as well as Page/TestInfo. Parent's separate new second-touch spec can consume that existing export; this branch does not edit the fixture or that HUD-owned spec. Source/models/configuration/attributes and pre-existing native evidence have no diff from exact base. Root can cherry-pick the source correction plus final evidence; no parent merge commit is needed for already-mergeable PR2003.
