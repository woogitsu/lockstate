# Yard bench native target observer correction

2026-10-03. Test-consumer correction only, based on exact published root `a7db8b1fe3c2ee7340213b71dad4580a40d6bc10`. No browser/server, gameplay, HUD, rendering, schema, copy, CI setting, retry or budget change.

## Actual hosted failure

The retained PR1899 source1 terminal log reports `yard-bench-player-build.spec.ts:91`: expected `7, 7`, received `2 × 1 tiles at 7, 7`, repeated eleven times during the 10-second expectation and ending in the existing 60-second test timeout. [Original failure excerpt](./raw/hosted-original-failure.txt), [full retained log hash/path](./raw/hosted-log-sha.txt), and [exact old consumer text](./raw/original-spec.ts.txt) are preserved. The full raw hosted file remains in the named TEMP path; this record archives its relevant excerpt rather than claiming a newly executed browser result. Text files are subject to Git line-ending normalization.

The actual catalogue defines `object.bench` with footprint width2,height1. `formatBuildTargetText` uses the existing localized occupied-area template when an object footprint is supplied. Existing `ui-build-object-footprint.test.ts` independently asserts exact English `2 × 1 tiles at 7, 7` for that footprint and preserves ordinary no-footprint `7, 7`. Current Exercise Station already expects its 2×1 readout correctly; the Yard Bench consumer still held the old coordinate-only literal.

## Narrow correction and preserved oracle

Replace exactly one literal with `2 × 1 tiles at 7, 7`. This retains exact origin and adds exact footprint dimensions; it is not a substring/regex relaxation. Original public New/Pause/Room plans/Yard/Build/mouse input is unchanged. Retain the completed order, single physical bench, exact anchor7,7, real worker snapshots, original steel-palette ROI850,340,220,260 and >400 pixel floor before and after real public Save/Load. No selector, click, timeout, retry or threshold changes.

[Formatter and existing readout controls](./raw/formatter-controls.txt): **13 GREEN across2 files**. [Actual no-browser collection](./raw/collection.txt): **1 test/1 file**. Strict application and tools TypeScript exit0. `git diff` confirms the executable change is only the one expected-text literal.

No producer-negative, native GREEN, observed timing improvement, or whole Yard lifecycle acceptance is claimed for this correction. The published hosted failure is a stale fixture observation, not a product defect. Root owns the browser lease and must execute the corrected specific native case separately; its existing budgets and all meaningful gameplay/pixel assertions remain the gate.

Terminal [research index check](./raw/research-index.txt): 5 GREEN. [Explicit strict compiler receipt](./raw/types.txt): both exit0. Scope and native-pending status above remain unchanged.
