# Actual physical furniture render and incoming-order recheck

Subject: immutable published `2023be9e1a7aaf1307c99a8f5d2e7dd9df2ee338`, 2026-10-03. Isolated branch `codex/template-lifecycle-next-audit-20261003`. Read-only production audit; no browser/server, source edits, schema, copy, workflow, new Issue or production mutation.

## Fresh issue and source inspection

Fresh complete GitHub bodies of [#1980](https://github.com/woogitsu/lockstate/issues/1980) and [#1976](https://github.com/woogitsu/lockstate/issues/1976) were read. Both remain open; neither open status establishes an unfixed current-source defect. They describe the earlier removed/rebuilt render duplication and ordinary build-order footprint admission bypass, respectively. No duplicate report was opened.

Opened actual `src/rendering/world/structures.ts`: when supplied, the physical registry (including an empty one) suppresses completed object-order geometry. Each physical object draws once, with its explicit matching source order, or its physical identity when no valid order identity exists. Undefined registry retains order-only compatibility. Root contains the fix at `88eec29838ced9a7acdeeebc2cd973d5feab26bb`, plus the legal unmirrored rotated replacement fixture correction. No registry ownership is inferred or written by this rendering query.

Opened actual `src/simulation/construction/system.ts`: incoming object orders consult live `objectFootprintClaims` over their complete oriented footprint before approval. Its reader in ObjectPlacementService includes standing and in-flight physical footprints. Existing failure precedence, square claims and full-footprint admission remain present.

## Actual bounded executions

1. Existing `tests/integration/room-template-rebuilt-render-identity.test.ts`: **16 GREEN**, 4.49 seconds total, 756 ms tests. This observation is retained as a transcribed tool result, not as a byte-exact original stdout file. The suite includes genuine packed session construction/removal/rebuild, production snapshot-feed request/reply and encoded V8 Load, plus separately identified low-level adapter compatibility/invalid-owner controls. It is not sixteen independent native player journeys.

   Genuine cases cover normal and legal unmirrored90-degree old Bed rebuilt in normal orientation under the exact new source owner; removal at the rotated far square; absent Bed after encoded Load; and real pending replacement ghost. Tests preserve the completed historical old order while expecting zero or one physical render structure. No fabricated gameplay snapshot replaces those command cycles. Legacy adapter controls are distinct from the genuine session cases.

2. Existing `tests/integration/build-order-object-collision-boundary.test.ts`, filter `free incoming anchor|genuinely free desk`: **5 GREEN**, **19 excluded by the explicit test-name filter**, 2.41 seconds total, 121 ms tests. The raw child output and exact exit0 receipt are in `raw/`. The outer PowerShell command later returned1 because an unrelated filename search matched nothing; the actual Vitest child status is recorded separately as0.

   Four cases use genuine Yard/Bed purchases with free incoming Desk anchor8,10 and colliding far square9,10, pending or completed, after real V8 capture/encode/decode/restore. Both PlaceObject and PlaceBuildOrder refuse approval and retain the treasury balance. The fifth genuinely completes a free low-level Desk beside saved completed Cell furniture. These controls exercise the observed #1976 boundary rather than repeating all four source orientations or the full20-plan matrix.

## Conclusion and limitations

No current-source defect reproduced on either inspected boundary. Existing fixes are present and their bounded consumers pass. No new regression test, policy or production fix is warranted here. No new producer-negative was performed: these are current-source rechecks of already mutation-proven prior fixes, not a new mutation proof. Native pixels, full hosted CI and deployment were not run or claimed. Open issue closure remains a release/coordinator action.
