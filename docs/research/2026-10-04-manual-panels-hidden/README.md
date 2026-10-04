# Full HD manual inspector fold leaks Save content through display:contents

## Verified reproduction and source cause

Root's retained actual public UI200 FullHD capture shows the inspector restore handle at the right edge but Save/preferences content still painted beneath it in the narrow88px rail after public `Hide the panels` while Build is active. Screenshot is archived at `docs/research/2026-10-03-modern-v10-native-integration/native/integrated21d-fit-public-collapse/004-actual-open-camera-whole-q1-mirrored-preview.png`; it was opened and inspected on2026-10-04. The existing completed native journey did not assert descendant hiding; this is visual defect evidence, not a claimed failing DOM assertion.

At exact7eb14eecfcf5003dfa349d00ac3d4a06b262c464, hud.ts registers inspector content=[aside,side]. LayoutShell sets each content node.hidden=true on manual collapse. hud.css has explicit `.hud__aside[hidden], .hud__side[hidden] {display:none}`. However the FullHD activeBuild rule `.hud__rail:has(.hud-build:not([hidden])) .hud__aside {display:contents}` still matches hidden aside. Its specificity0,4,0 wins over0,2,0. The actual aside descendants therefore participate in rail layout/painting despite the hidden attribute. Side retains its display:none; this is specifically the aside flattening arm.

That rule originates in d4ead7efe44 (2026-09-29), before the modern paint skin. Do not attribute this to a new shader/theme or invent automatic-collapse policy.

## Minimal correction and meaningful regression preparation

Constrain only the existing FullHD display:contents arm to `.hud__aside:not([hidden])`. Preserve open-state ordering, every allocation/floor, all copy, the restore handle, top nine readouts and manual fold semantics. No automatic collapse/main/save policy.

Extend the existing native inspector-collapse consumer with active public Build at FullHD UI100/UI200. Assert actual display:none and no laid-out descendant content, hidden Build/Save controls, reachable restore handle, unchanged top nine readings and whole paused V10 worker/command state. Then publicly restore and assert original allocations/control accessibility. Native execution and real source-disconnection negative remain pending root's exclusive browser/build lease; original budgets/retries stay unchanged.

## Fresh deduplication

Two successful current GitHub searches covered hidden/fold/collapse/panels and exact display:contents/Hide the panels/hud__aside. Full bodies of #1159 and #1312 were read. #1159 records existing manual collapse/restore semantics (completed identity stage), and #1312 is historical visible aside overflow at smaller viewports, not this active-Build hidden flattening conflict. #985 concerns alert-driven Rooms overflow. No exact duplicate was found. This issue changes no owner-reserved automatic fold or layout allocation rule.

## Published issue and exact preparation boundary

Fresh nonduplicate issue: https://github.com/woogitsu/lockstate/issues/2029 . Original screenshot is root-owned immutable visual evidence linked above, not a new image taken by this agent. Source cause was opened at hud.css1378 and traced by git blame to d4ead7efe44. Original source has specificity0,4,0 on the active-Build aside flattening rule, versus0,2,0 on its explicit hidden guard. A hidden Build ancestor does not change the descendant's own hidden attribute, so :has(.hud-build:not([hidden])) continues to match the collapsed rail. Side has no competing display override and already hides correctly.

The source correction is exactly one selector suffix `:not([hidden])`, with no declaration, open-state geometry, material, token, content, allocation or main-thread callback change. The prior generic FullHD collapse test is left intact; it does not activate Build and therefore misses this condition. Two prepared real public Build cases cover UI100/UI200 and assert actual getComputedStyle display:none, zero laid-out descendants, Save/Build hidden, the real restore handle's44/88px floor and center hit, all nine top readings and complete paused V10 snapshot/command equality through public collapse and restoration. These tests use the existing real read-only worker observer and do not inject a model/save/verdict.

No new browser matcher/config, collection, build, server or native execution was used here. Default existing60s/expect10s/w1/r0 gate budgets are unchanged. Application TypeScript first scoped run exits0. **Actual before-fix DOM RED, producer-disconnection RED and restored native GREEN are pending root execution.** Do not reinterpret the retained screenshot or a pure geometry test as those results.

## Root execution recipe and meaningful negative

Use the existing artifact consumer/config and run only the active-Build manual-fold cases in hud-side-rail-collapse-fullhd.spec.ts on the frozen compiled subject, with the existing worker/retry/budget settings. Original source7eb14 on that subject should reach the display:none oracle with actual hidden=true but display:contents; retain its original DOM JSON and screenshot even if subsequent assertions do not execute. Rebuild the corrected exact subject under root's sole build/browser lease and run the same cases. For real producer-negative proof, detach the corrected source checkpoint, remove only the new :not([hidden]) suffix from the aside contents rule, compile that actual subject and execute the same case. Finally restore exact source bytes/branch, rebuild and obtain terminal restored native result; no hidden retry or threshold change. Root owns this execution, not this preparation agent.

Weakest claim: the prepared complete activeBuild UI200 route reaches its final whole-state/restore assertions under the native60s budget. Source typing cannot establish this. A real run failing before the DOM oracle must be retained as a fixture/environment failure rather than called proof of this product fix.

## Terminal source-preparation checks

Both application/tools TypeScript exit0. Existing hud-layout, research-index and browser-network-changed-retry-contract suites obtained52GREEN/3suites2.55s. No new CSS-mirror unit assertion was substituted for the real native DOM oracle. These are bounded existing geometry/record/network-preservation checks, not appearance acceptance. The inert executed source-preservation receipt verifies that the complete canonical stylesheet differs from immutable7eb14 by exactly the one named selector suffix; every other stylesheet byte/declaration remains identical after checkout line-ending normalization. It separately hashes the actual original screenshot bytes, retaining the absolute original path and immutable root archive reference. Source-only checks cannot establish native display behavior or fit latency.

The first coherent source/test preparation is8eeb629e6f729afe046a9fc00eb95f25f95187dc. Actual original/new native DOM and source-negative/restoration outputs remain pending. No browser/server/build/collection/shared-config or production callback mutation was performed by this agent. The exact branch is codex/manual-panels-hidden-fix-20261004, isolated tree C:/Users/matma/Documents/Rozwój gier/ls-manual-panels-hidden-20261004. Root's other material/native preparation remains independent.
