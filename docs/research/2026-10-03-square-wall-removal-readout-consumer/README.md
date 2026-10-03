# Whole-square wall to removal readout consumer

2026-10-03. Own isolated worktree based on exact published root `a7db8b1fe3c2ee7340213b71dad4580a40d6bc10`. AGENTS/workflow read. Executable scope: `tests/browser/ui-build-where-readout.spec.ts` only; no production, copy, schema, workflow, retry, time budget, worker count, renderer or browser/server change.

## Actual terminal failure

The retained PR1899 source1 hosted log reports the public removal-readout case failing at line132. Old expected edge format `/^-?\d+,-?\d+,(?:north|west),\d+$/u`; actual attribute `0,1`, observed13 times during the unchanged10s expectation. [Actual raw failure](./raw/hosted-original-failure.txt), [retained full log hash/path](./raw/hosted-log-sha.txt), [original executed consumer text](./raw/original-spec.ts.txt). These are original hosted observations, not a new native execution. Git may normalize archived text line endings.

The default `wall-brick` now uses square construction. `BuildTool.targetSquares` publishes x,y with squareRun=true and no edge; `build-panel.ts:setTarget` writes `x,y` for every edge-absent target. The visible readout still explicitly says whole squares. This is the intended whole-square rule, not a lost wall edge or a product regression.

## Preserved and strengthened player oracle

At both hit-tested bare-world points, expect the actual tile-shaped attribute and visible whole-square readout. Preserve arming, Stop placing, visible readout, two distinct wall targets, actual Remove control, two distinct removal targets and final exact player text. Compare the two independently picked coordinates **exactly** at each point. The prior one-step tolerance belonged to the retired default edge-picking fixture; it is now removed. No arbitrary edge allowance or generic nonempty assertion replaces the origin check.

The original historical #550 description remains in the spec, followed by an explicit dated current-contract amendment. Existing legacy edge tool/readout controls remain unchanged; this assembled-application fixture now follows the actual default square wall.

## Bounded verification and limits

[Existing real tool/readout controls](./raw/tool-readout-controls.txt): **27 GREEN across2 files** (including edge/whole-square modes, withdrawal, removal feedback and exact formatted coordinates). [Actual no-browser collection](./raw/collection.txt): **1 test/1 file**. [Strict application/tools compiler receipt](./raw/types.txt): both exit0.

No browser/server launched, native GREEN, producer-negative or timing improvement claimed. This is a consumer repair supported by actual original hosted failure and current source, not a product-source fix. Root retains the sole browser lease and must run the corrected specific public pointer case before native acceptance. Existing w1/r0/60s/expect10 and all pointer/visibility/origin/removal checks remain intact; the coordinate oracle is stricter.

Terminal [own research-index check](./raw/research-index.txt): 5 GREEN. Production/workflow/runner/config diff against exact a7db source is empty; native acceptance remains pending.
