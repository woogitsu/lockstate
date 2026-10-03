# Minimap text child identity

2026-10-03. Isolated branch `codex/oblique-steady-projection-audit-20261003`.

## Actual defect and boundary

Oblique repaint already skips unchanged world/pose/actors. Its minimap physical pixels are also cached. This record concerns only HUD `updateMinimap`: assigning identical `textContent` on every publication replaces the real span's text child. The viewport must still update independently of cached pixels.

The actual compiled production subject was `3d454c2872fb6b777cd9afc2cc13c286bf8346ef`, copied byte-for-byte from this agent's own frozen #2018 build into its new isolated worktree. No source/game-state/worker/render-feed injection was used. The real public New/Pause, camera-right and Save/Load controls ran at 1920×1080, default installed Chromium, one worker, 60s test/10s assertion/zero retries.

## Original evidence

- [Source-port baseline](./raw/unit-baseline.txt): 3 RED/3 controls. The actual enclosed HUD method executes on a deliberately labelled DOM port with replace-all child semantics, not a native browser or timing oracle.
- [Actual Chromium baseline](./raw/baseline-actual-stdout.txt): one RED test. In inactive, paused-active, changed-viewport and loaded-paused states, `firstChild` changed and MutationObserver counted exactly 12 child-list replacements across 12 real animation frames. The unchanged text identity assertions are genuine consumer failures.
- [Executed baseline fixture](./raw/executed-baseline-audit.ts.txt) and [actual failure page](./raw/baseline-error-context.md) preserve the original. A separate fixture error looked for the language control inside the closed Settings menu; the 60s timeout then closed the page before the final receipt could be read. The initial report incorrectly inferred that Load had removed this control. The full source audit corrected that inference: the menu must be publicly opened, and language change deliberately saves and reloads the document (ADR0119). These failures are not represented as a fully completed native lifecycle or a production fix.
- [Preview setup failure](./raw/baseline-stderr.txt): missing generated `.wrangler/deploy/config.json`, before Chromium opened. Copying the existing generated relative config remedied that environment omission; compiled client bytes were unchanged.
- The first attempted unit harness used TypeScript parser APIs, but installed TypeScript 7's package exports only version metadata. No tests ran in that first fixture attempt. The corrected harness uses the same actual-source extraction pattern as the existing `minimap-unrounded-reference.test.ts`.

No measured CPU/latency improvement, hosted CI cause, native hardware GPU claim, or unchanged-viewport optimization is inferred. Existing #2017 concerns physical pixel projection, not this DOM text replacement. Fresh open-Issue search and its full body were read before creating a distinct scoped report.

## Narrow correction

Compare the current rendered text with the newly localized status before assigning `textContent`. Status/locale changes still replace text. Pixel/session invalidation, clipping/pose/UI-scale geometry, navigation, placeholders and ordinary viewport publication remain unchanged. Every observation is now written immediately; final capture errors preserve the receipt rather than destroying prior evidence.

Fresh dedup read #2017 and the open minimap search; distinct confirmed Issue: [#2020](https://github.com/woogitsu/lockstate/issues/2020).

## Terminal source and actual consumer results

Source checkpoint `529ec9fd023a8f1140722f032f511e981cef69e5` changes only the text assignment in `updateMinimap`. Its [six source-port controls](./raw/unit-fixed.txt) pass. Detaching this exact commit before [the real unconditional-assignment negative](./raw/unit-negative.txt) gives 3 RED/3 controls. The [executed inert mutation script](./raw/executed-negative.cjs.txt) restores the original Buffer in `finally` before returning to the branch. [Restoration receipt](./raw/source-restoration.json): equal SHA256 `458d831398bd9d101e1e44838e56886cd223cc4e1bebfaf62302c205a8658766`, exact bytes, production diff zero.

[Bounded neighboring gates](./raw/restored-neighbors.txt): 24 GREEN in three named files (HUD text consumer, actual unrounded viewport consumer, Oblique minimap projection reuse). App/tools strict TypeScript and [own production build](./raw/fixed-build.txt) pass.

The explicitly separate fixed native run served the own freshly compiled checkpoint above. [Actual partial receipt](./raw/fixed-partial-receipt.json) proves inactive, paused-active and changed-viewport text children all remain identical with zero child-list replacements over the same 12 actual animation frames. The canvas goes from the real initial 300×150 placeholder to 32×32 active world, and camera-right changes viewport while preserving text. [Full native stdout](./raw/fixed-actual-stdout.txt), [failure context](./raw/fixed-error-context.md) and [exact executed fixed fixture](./raw/executed-fixed-audit.ts.txt) retain the terminal RED: the same closed Settings-menu fixture protocol stopped execution before the next lifecycle stages. Its final capture errors are retained in the partial receipt.

The current fixture now opens the actual Settings menu and awaits both real reloads for auto→English→Polski. It retains Load and public UI-scale checks; this offline correction has NOT been executed. No fully GREEN native test, fixed native Load/locale/UI-scale acceptance, served-script receipt on the failed run, or screenshot is claimed. One failed preview setup, one actual baseline run and one explicit fixed run were performed; zero test retries, no hidden reruns or extra browser sessions. Both own process trees terminated and port5365 was verified free before releasing the exclusive lease to root.

## Final preparation gates and environment boundary

Corrected recipe strict app types pass, tools strict types pass, and [actual no-browser collection](./raw/collection.txt) lists exactly one opt-in audit case. Native budgets remain 60s/10s/one worker/zero retries. The helper imports the already published #2018 real response-byte observer; it introduces no private game hook. The source-native route remains opt-in outside shared CI inventories.

The first [documentation gate](./raw/docs.txt) was 21 GREEN/2 RED: the new source citation lacked its own remote tracking ref, plus the inherited Garbage Blender identifier was misread as a commit. One exact own-branch fetch establishes the already published source, yielding [22 GREEN/1 inherited RED](./raw/docs-published.txt). Own index/links/citations pass. Root already repaired the inherited external label separately; this work deliberately does not edit that concurrent record or any citation budget/allowlist.

Raw output text is retained under the repository's existing text/newline policy; the original byte streams also remain in this agent's TEMP `lockstate-minimap-identity-20261003`. The actual source Buffer restoration SHA above is byte-exact, independently of Git's text normalization. A Git index-lock collision while LFS checkout was still active prevented one attempted commit; the checkout completed, and the later real commit/push succeeded. No stale lock was removed and no other process was killed.
