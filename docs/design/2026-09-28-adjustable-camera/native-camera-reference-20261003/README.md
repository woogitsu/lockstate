# Precise native World camera reference — 2026-10-03

Frozen production base: `282f6413443d784e588ff4c5ec43095796e0244a` (PR #1991). This change touches tests and receipts only. No production data fields, camera, main callback, minimap producer, renderer or built-client bytes change.

## Original actual failure retained

`original-artifact-eight-results.json` is the parent's exact original report: six model cases passed; World FullHD 100% and 200% failed the existing precision-3 corner Y assertion. Both received `380` versus expected `380.00128000000007`, difference `0.001280000000065229`, above the unchanged `<0.0005` budget. Their durations were 4193 ms and 4834 ms. No rerun, timeout or tolerance increase is represented here.

The original expected point reconstructed ground bounds from serialized `HTMLElement.style` percentages. The actual HUD passes full-precision strings using `String(left/top/width/height*100)`. A mathematical six-significant-digit example exactly produces the reported difference:

- unrounded visible top `208 / 2048 * 100 = 10.15625%`;
- serialized percentage example `10.1562%` reconstructs top `207.998976` world pixels;
- at zoom `1.25`, square Y `8*64` gives `(512-207.998976)*1.25 = 380.00128000000007` rather than `(512-208)*1.25 = 380`.

This explains a candidate quantization cause; the parent's failed report did **not** retain raw pre-setter values. The exact raw native comparison remains required and queued. The offline destination supplies this specific tie example explicitly; it is not claimed to implement Chromium's general serializer.

## Test-only correction

`minimap-unrounded-reference.ts` observes original existing CSSOM percentage assignments before their native setters lose decimal precision. It calls every original setter exactly once with the original value. A WeakMap separates style declarations; only the existing minimap viewport is read as the independent reference. Missing/incomplete or replaced non-percentage data fails explicitly. No reference is derived from the ghost SVG or main forward callback.

The native test retains CSS readback and all original map bounds, CSS-derived zoom checks, four corner precision-3 assertions, physical pointer containment, full 28 polygons, worker preflight and exactly-one-command guards. It also checks the unrounded channel's zoom, compares display percentages to raw assignments, and logs both raw and serialized measurements before corner assertions. Existing timeouts, retries, one-worker configuration and built-client subject are preserved.

## Offline proof

11 focused cases execute the actual unchanged HUD percentage-assignment body, the observer fixture and real installed Phaser Camera `preRender/getWorldPoint/matrixCombined` for four corners, zoom1/1.25, CSS backing ratios1/2 and DOM box offsets0/140. The bad raw-scroll forward formula is rejected at zoom1.25 using the unchanged precision-3 boundary; zoom1 remains a legal control. Missing-channel and non-percent overwrite controls remain strict.

- baseline: **11 GREEN**, 258 ms;
- unique fixture producer changed from original assigned string to rounded CSS readback: **5 RED / 6 legal controls GREEN**, 371 ms;
- `finally` exact-byte restore: **11 GREEN**, 246 ms;
- app/tools TypeScript and standalone strict TypeScript of all three changed test files: GREEN.

`receipt.json` contains original report and restored fixture hashes, unique mutation strings and restoration result. No production producer was mutated in this scope. Initial standalone TypeScript invocation needed the installed TypeScript7 `--ignoreConfig` switch; the corrected invocation passed. Artifact collection was blocked by the intentionally absent build in this new test-only worktree; no build/server/browser was launched. Root owns the frozen existing built client and the corrected two-case native run.

## Actual CSSOM compatibility correction

Root's native descriptor inventory directly confirms `style.top = "10.15625%"` reads back `10.1562%`. It also shows configurable own data properties on the CSS declaration, no matching accessors on CSSStyleDeclaration.prototype, and the real style getter on HTMLElement.prototype. The first corrected native attempt failed both cases because the initial observer required nonexistent prototype accessors; those test-instrumentation failures are retained in `initial-observer-native-two-results.json`. They are not production defects or native GREEN evidence.

The observer now wraps **only** `.hud-minimap__viewport` through the existing HTMLElement style getter. Every native getter/write receives its original receiver; each assignment is forwarded once with the unchanged string. Real-style/proxy WeakMaps provide stable identity. Other elements get their original style unchanged. Native CSSOM methods bind to the real style receiver and retain stable method identity. Observation uses the original real style record, not the proxy as a synthetic ground reference.

The offline destination now reproduces the confirmed own-data-property/exotic-write shape. Thirteen focused cases pass, including stable proxy, unrelated-element identity, native receiver and original-write-once controls. Strict changed-test TypeScript passes. Corrected native two-case acceptance is pending root's next run.
