# Minimap text child identity

2026-10-03. Isolated branch `codex/oblique-steady-projection-audit-20261003`.

## Actual defect and boundary

Oblique repaint already skips unchanged world/pose/actors. Its minimap physical pixels are also cached. This record concerns only HUD `updateMinimap`: assigning identical `textContent` on every publication replaces the real span's text child. The viewport must still update independently of cached pixels.

The actual compiled production subject was `3d454c2872fb6b777cd9afc2cc13c286bf8346ef`, copied byte-for-byte from this agent's own frozen #2018 build into its new isolated worktree. No source/game-state/worker/render-feed injection was used. The real public New/Pause, camera-right and Save/Load controls ran at 1920×1080, default installed Chromium, one worker, 60s test/10s assertion/zero retries.

## Original evidence

- [Source-port baseline](./raw/unit-baseline.txt): 3 RED/3 controls. The actual enclosed HUD method executes on a deliberately labelled DOM port with replace-all child semantics, not a native browser or timing oracle.
- [Actual Chromium baseline](./raw/baseline-actual-stdout.txt): one RED test. In inactive, paused-active, changed-viewport and loaded-paused states, `firstChild` changed and MutationObserver counted exactly 12 child-list replacements across 12 real animation frames. The unchanged text identity assertions are genuine consumer failures.
- [Executed baseline fixture](./raw/executed-baseline-audit.ts.txt) and [actual failure page](./raw/baseline-error-context.md) preserve the original. A separate fixture error looked for the language control after Load had rebuilt HUD and no longer exposed that control; the 60s timeout then closed the page before the final receipt could be read. These failures are not represented as a fully completed native lifecycle or a production fix.
- [Preview setup failure](./raw/baseline-stderr.txt): missing generated `.wrangler/deploy/config.json`, before Chromium opened. Copying the existing generated relative config remedied that environment omission; compiled client bytes were unchanged.
- The first attempted unit harness used TypeScript parser APIs, but installed TypeScript 7's package exports only version metadata. No tests ran in that first fixture attempt. The corrected harness uses the same actual-source extraction pattern as the existing `minimap-unrounded-reference.test.ts`.

No measured CPU/latency improvement, hosted CI cause, native hardware GPU claim, or unchanged-viewport optimization is inferred. Existing #2017 concerns physical pixel projection, not this DOM text replacement. Fresh open-Issue search and its full body were read before creating a distinct scoped report.

## Narrow correction planned

Compare the current rendered text with the newly localized status before assigning `textContent`. Status/locale changes still replace text. Pixel/session invalidation, clipping/pose/UI-scale geometry, navigation, placeholders and ordinary viewport publication remain unchanged. Corrected native fixture will observe locale/UI-scale before the Load rebuild, retaining Load identity coverage and all original budgets.
