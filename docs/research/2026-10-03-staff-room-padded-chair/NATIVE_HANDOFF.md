# Opt-in Staff Room native observer handoff

Prepared source-only; no browser/server/build/native run. Root owns lease and genuine production artifact. Config inherits existing dist precondition; own worktree has no dist, so collection/native have not run. No copied or placeholder artifact.

## Exactly the existing three serial cases

Config `tests/browser/staff-room-padded-chair/native.audit.config.ts` selects only `wooden-chair-player-build.spec.ts`:

1. `player creates storage and delivery capacity before Staff Room`
2. `player builds Staff Room at quarterTurns0 and retains both authored chair palettes and anchors after Save/Load`
3. `player builds Staff Room at quarterTurns1 and retains both authored chair palettes and anchors after Save/Load`

Original public Storage5,5 / Delivery12,5 / Staff20,5 route, owners001/002, budgets/actions preserved.60s,expect10s,workers1,retries0,existing genuine production Cloudflare preview config.

After root imports source/export/observer and builds its real artifact:

```powershell
$env:LOCKSTATE_STAFF_CHAIR_NATIVE='1'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='<root leased port>'
node node_modules/@playwright/test/cli.js test --config tests/browser/staff-room-padded-chair/native.audit.config.ts
```

## Required actual evidence

Independent source/descriptor/frame hashes are pinned in `tests/browser/staff-room-padded-chair/art-fixture.ts`. Model source47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109; descriptor LF718fda5f4874146a71622a4db9814950acd845fa79aad85c8f935d56f42814c0; source60/e40 PNG3d0fd0a023174ec0a0fa897f33a57d1e07630a5201ec093f394a65634e399646.256RGBA,64px/tile,pivot128,targetunchanged. Actual terminal200 responses, original loader Blob hash and decoded natural256 dimensions required. No synthetic fetch/replacement image/private texture read.

Public Pause aria-pressed=true and full typed current V8 snapshot before Save/after Load; no currentClock broadcast dependency. Both literal paid object/order owners+orientation checked, whole state equality required. Original FullHD captures and retained-timber checks unchanged. After original three hardware yaw clicks,4additionalright yield world60/q0 orworld?30/q1; lower3?clamp20,raise2?40. New FullHD/canvas/body photos and receipt; whole paused state remains identical after camera changes.

Root must open actual photos and independently calibrate both pads. Existing timber RGB/ROI only proves retained wood; no new threshold/ROI guessed and no old checks disabled. If old retained-wood threshold does not fit measured exposure, record actual photos/counts before a bounded calibrated change.

## Completed source-only proof

Strict TS GREEN; same native delivered-art assertions accept actual local new source/descriptor/PNG and reject actual old wooden-chair bodies. Actual collector sourceSHA assertion corrupted?RED1/one old-body rejection stillGREEN; byte-exact restoration?2GREEN. This is no network/native acceptance. Public kernel plan/V8 proof is the remaining prepared-source step.
