# DRAFT: FullHD individual-object rotation review preparation

This branch starts from unapproved interaction/copy draft `fa830d556e8e05934dc7dc5cc03609903ac7c8d5`. It is **not for import into root's production release** and no PR is opened. The proposed new copy remains EN `Rotate object`, PL `Obróć obiekt`; KeyR remains camera tilt. Owner approval of optional command orientation does not approve this control/copy/layout.

Dependencies are the real preflight producer `8a8aa7a02b6ba98136bb628a9d403df40b4c1108`, consumer `0133444974a5d14dcf0884c7162f940cd09fbee8`, delivery diagnosis `a25f618efe616a65a6609a8e247970983e3725a9` and session-reset fix `83b2ce08dc240c6776c9822fef6c5f62e2487a95`. Cherry-pick conflict resolution retains both independent research records and combines the existing draft orientation with the preflight consumer. It preserves delivery's `resetPreview()` and public arming policy.

Source audit: the draft rotation callback repaints the catalogue/target and reports the selected facing to the existing arming path. Both actual scene facing refreshes cancel a held outgoing press. The preflight consumer as originally combined still queries q0 and omits orientation from its response ownership; this is the concrete next repair in this draft, not a new claim about the approved q0 production consumer.

Opened CSS: `.hud-build__actions` is a flex row with stretch alignment and `--space-2` gap, no flex wrapping. Arm has `flex:1 1 auto;min-width:0`; Remove/Buy retain `flex:0 0 auto`. Rotate inherits flex defaults and its min-content behavior. `.ui-action` keeps the existing tap-target minimum height; action-row padding remains `0 var(--space-2)`. Real label ink, min-content pressure and wrapping must be measured; source arithmetic alone cannot declare a four-button row fits. No CSS changes are made to force a result.

The existing page-zoom navigation recipe in `docs/adr/drafts/fullhd-page-zoom-navigation-1333.md` distinguishes physical 1920×1080 at browser zoom200 from its 960×540 CSS layout viewport. This new review uses a real 1920×1080 CSS viewport and the supported public **UI scale** control at100/200; neither a smaller viewport, device scale factor nor pinch/CSS scaling will be represented as actual browser page zoom. The unchanged UI-scale sequence is four public +25 steps from100 to200.

Checkpoint state: dependencies prepared; native preparation/source ownership proof in progress. No browser/server/build has run for this branch; no screenshots or native geometry result exist. Root holds the sole lease and is running full verification. This branch will use types/collection only during that lease, then root must build the exact review subject before executing it.

## Oriented preflight source checkpoint

Actual combined-source baseline:1 RED (rotation makes no q1 query,2 requests versus3). The draft now includes facing in the owner/cache and nondefault query, and invalidates the old aim/verdict on facing change. One real decoded-worker test proves q0 allowed versus q1 blocked on the independently authored lower pending claim, discards a delayed genuine q0 reply, makes no additional requests over100 stationary paints, purchases a free q1 desk and retains the whole actual pending V8 snapshot through Save/Load. Real query-facing omission:1 RED; byte-exact restore SHA256999b0e93cfba274c8095e28fcb61b5f9633c92d4f08a538713937f7a3cf57999 then1 GREEN. Strict app/tools types exit0 after narrowing the snapshot envelope correctly. Initial command-kind/Save-envelope fixture errors and the initial type error are preserved separately in evidence. No browser/server/build or new geometry acceptance. Root redirected priority to the independent failing UI inventories; native geometry preparation remains unfinished and separate.

## Prepared public native review (not executed)

The subsequent preparation resumes from pushed draft source `6f562fdbb536112828b917f3503954afe9d98832`. `object-rotation-fullhd.native.ts` now collects exactly two language cases (EN/PL), each at **1920×1080 CSS pixels, public UI scale100 and200**. It retains60s per case, expect10s, workers1, retries0. This work has run no build, browser or server. No screenshot, measured button fit or native acceptance is claimed.

`native-evidence.ts` passively records genuine worker requests/replies and trusted input. It decodes the real correlated preflight reply; it never sends a purchase, stubs a verdict or reads a private renderer. The only snapshot requests use the existing read-only showcase harness. Both purchases originate from real fresh canvas presses through the public Build tool. Independent anchors are `(16,14)` at scale100 and `(16,16)` at scale200, in public numeric Yard `(12,10,8,8)`. A q1 desk must claim its exact vertical two tiles, cost130, and persist actual `objectOrientation:1`. Treasury must become24870 then24740, with one then two actual approved orders. The final public Save/Load must preserve the whole actual snapshot.

The interaction includes actual Rotate click/focus, Enter→q2, Space→q3, unchanged object q after KeyR, and Enter→q0. It then holds a genuine canvas primary press, rotates q0→q1 while still held, observes the real q1 worker verdict, releases that original press with zero purchase/whole-snapshot change, and requires a fresh press to buy exactly one q1 object. No rearm or fabricated command bypass is used for that fresh-press control.

### Geometry and pixels to measure

One DOM read records every visible action box, label bounds, ink rectangles, scroll fit, hit test, computed flex/position/padding, viewport and UI scale. The original four-button count, width≥44, exact existing tap-height/row-height, label/panel containment and hit assertions remain. The native test also checks viewport/ink containment, real tap-height44/88, and all20 existing template-card assertions in one DOM read. Geometry is saved and screenshotted **before** its assertions. `expect.soft` retains a failed test while permitting later scale evidence; it neither skips nor converts failure into acceptance.

The FullHD enlarged rule in `src/ui/hud/hud.css` positions Arm absolutely at the top of Build. Thus a sum of four widths plus three gaps would double-count Arm at scale200. The probe instead reports normal-flow width `sum(flow button widths)+(flow count−1)×computed gap`, separates absolute positioning, and checks actual box/hit geometry for every button. Base gap/padding are8px at100 and16px at200; minimum tap height is44/88px. None of these token calculations establish actual text width, fit or available row width. Existing `overflow-wrap:break-word` is retained; no new wrapping/layout rule has been adopted.

Two disjoint secondary tile interiors come from the measured public minimap/canvas transform: horizontal-only `(17,anchorY)` and vertical-only `(16,anchorY+1)`, each spanning0.26–0.74 of its tile. The probe checks their positive size, viewport bounds and canvas hit before capturing actual q0/q1 PNGs. Both must show an actual RGB change; counts/regions are saved. This is a pending orientation observation, **not** a calibrated pixel floor or completed consumer-negative acceptance. When native evidence exists, an actual omission of oriented ghost consumption must fail the relevant observation before restoration can establish causal visual acceptance. No screenshot or pixel values are invented here.

Expected output names, under the actual Playwright case directory in `native-results/`, include `en-ui100-selected-q0-fullhd.png`, `en-ui200-selected-q0-fullhd.png`, corresponding PL files, `*-armed-q1-fullhd.png`, `*-actual-q1-original-primary-held.png`, all geometry JSON, paired secondary PNGs/counts, and the exact worker/input/whole-state receipt. These are **future paths**, not existing deliverables.

### Collection and execution recipe

While another agent owns the build/browser lease, source-only collection uses `playwright.collection.config.ts --list`. That config throws unless `--list` is present; direct evaluation without it was observed to refuse. It has no server and cannot be used for acceptance. Source collection does not claim the artifact config can execute without a real production build.

Only after the sole lease is explicitly assigned: build this exact **unapproved review branch**, record its SHA and actual emitted client/worker hashes, then run from this worktree:

```powershell
$env:LOCKSTATE_OBJECT_ROTATION_DRAFT_NATIVE='1'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='5365'
pnpm --config.verify-deps-before-run=false exec playwright test --config docs/research/2026-10-03-object-rotation-review-native-prep/playwright.native.config.ts
```

The runnable config inherits the existing production-artifact gate, requires real dist input and uses its real production preview server with `reuseExistingServer:false`. It does not substitute a source server. Device scale factor1 is declared only as that setting; visualViewport scale, DPR and actual CSS viewport are reported. This is **not a browser page-zoom200 acceptance**. Preserve original failures/screenshots, stop after the bounded review/control run, and explicitly release the sole lease.

Actual preparation receipts: app types0, tools types0, source-only collection2 cases/1 file, collection execution guard0 (expected refusal), and51 focused tests GREEN/11 files. The initial empty-array inference type failure is retained in `evidence/native-types-array-red.raw.txt`; the corrected types receipts are separate. This chunk changes no runtime source, CSS, locale, input binding, schema, workflow or test budget. The earlier real query-orientation production omission/restore proof remains the source proof; native visual mutation/restore remains pending.

### Owner review boundary

The eventual choice is whether to add this single-object quarter-turn control and the exact new copy EN `Rotate object` / PL `Obróć obiekt` in the existing action area. Existing Build, Remove, Buy, coordinates, camera controls, scale labels and room-card copy are retained. KeyR remains camera tilt; native button click/Enter/Space activates this proposed control. Approved orientation fields do not approve new copy, interaction or layout. A clickable owner choice will be prepared only after actual geometry/screenshots establish what fits; this preparation is not a release proposal with fabricated fit evidence. If the original geometry assertions fail, keep that RED and prepare a measured separate layout proposal instead of loosening them.

## Actual frozen native result: layout RED, oriented interaction observed

The sole build/browser lease was granted for this separate draft and has now been **returned**. Runtime subject was detached/frozen `6edb4f21001d79c8e7adb69a87d746509f048c04`; actual production Cloudflare build exit0. Own port5371, reuse false,1920×1080 CSS viewport, public UI100/200, workers1/retries0/60s/expect10 were retained. The original two cases both completed and were RED on the unchanged geometry/card assertions. They were neither skipped nor timed out. Preserve that result: **this draft does not have native layout acceptance**.

Both languages reached the final real worker/input receipt after q1 queries, exact two-tile130 quotes, original held release with no purchase/whole-state change, fresh actual q1 purchases at `(16,14)` and `(16,16)`, treasury24870 then24740, two approved `objectOrientation:1` orders, and whole actual public Save/Load equality. Trusted input records and exact actual commands/snapshots are retained. This proves those observations within a failing layout case; it does not turn the overall case GREEN.

| Actual original observation | EN | PL |
| --- | --- | --- |
| UI100 Buy width, required≥44 |39.109375px|40.546875px|
| UI100 action row |313×44px|313×44px|
| UI200 normal-flow action row width/height |629×88px|629×88px|
| UI200 selected/armed q0 row bottom |814px|814px|
| UI200 Build panel bottom |803.15625px|806.34375px|
| UI200 q0 lower actions beyond panel |10.84375px|7.65625px|
| UI200 armed q1 pinned Arm top/panel top |381/389px|381/389px|
| UI200 last four cards top/bottom |1059/1240px|1059/1275px|

At100 the action labels fit and hit testing succeeds; Buy still violates the original44px width assertion. At200 the labels/hits also succeed, but panel containment fails in q0 and the pinned Arm is8px above the panel in the q1 capture. The last four cards are Storage/Delivery/Garbage/Utility (their PL counterparts are preserved); their labels/accessibility match and text fits, but their centres lie below the1080px viewport. No floor, assertion, card or control was removed to hide this.

**Attribution limit:** this is an actual draft measurement, not an executed three-action baseline. The original `fa830` UI draft changed no `hud.css` or template-card producer; its q0 selected footprint already existed before that draft. Buy remains `flex:0 0 auto` with its existing word/padding and no44px minimum width. The FullHD absolute Arm/panel scrolling rule and four-column template CSS also predate the new Rotate button. These source facts make those existing rules concrete repair candidates; they do not justify blaming every200% stack failure on the new rotation control or claiming a baseline screenshot that was never taken. A corrected review candidate must retain all original checks and distinguish local Build changes from a broader reserved panel/card allocation choice.

### Genuine visual omission and exact restoration

One bounded EN negative changed only the actual World ghost consumer: `paintObjectPreview()` painted the retained rectangle as2×1 while leaving the actual q1 worker/query/command producer untouched. Its build exit0 and real q1 allowed vertical verdict was reached. Both independent secondary30×30 interiors changed **0/0** RGB pixels; the dedicated orientation observation became RED. In the original EN/PL100/200 cases the actual values were900/900 each. Restore returned World source byte-exact SHA256 `5a5258d14bee3de06185696c56fd6cfcdbb20001a11786328b432c475a8518eb`; all six original emitted index/client/worker/CSS/catalog files were byte-exact after rebuild. The two bounded restored cases again recorded900/900 at both scales/languages and completed the q1 purchases/whole Save/Load controls. They remained **2 RED on geometry/cards**. Visual-consumption restoration must not be reported as overall native GREEN.

`native-observed-receipt.json` contains exact original/negative/restored compiled hashes, real measurements, RGB counts, commands, whole snapshots and file hashes. `native/original/` retains original JSON, actual screenshots and paired pixel crops; `native/negative/` retains the real omission; `native/restored/` retains restoration controls. Full traces remain in the named scratch directory with SHA256 references, not in Git. `collect-native-evidence.mjs` copies only those actual outputs and preserves raw logs. No runtime, CSS or binding change remains from the omission.

Actual visible review screenshots:

- [EN100](./native/original/en-ui100-armed-q1-fullhd.png), [EN200](./native/original/en-ui200-armed-q1-fullhd.png).
- [PL100](./native/original/pl-ui100-armed-q1-fullhd.png), [PL200](./native/original/pl-ui200-armed-q1-fullhd.png).

The next step is a separate unapproved corrected candidate, not owner approval of this RED layout. No further build/browser run is authorized until a new sole lease is granted.
