# Modern HUD skin — first semantic treatment

2026-10-03. The coordinator relayed the owner's request for a modern, attractive appearance and granted this isolated cosmetic implementation. Exact base `e93abddb62d1f8a35e5ef94de48abe0c5973c3d3`; branch `codex/modern-hud-skin-20261003`; first source checkpoint `0c8623bb8a4c5c098a4123e72845b928a1901002`.

## Concrete treatment

Six semantic paint roles separate quiet panel interiors, headings, the command frame, filled controls, panel borders and a subtle warm toolbar hairline. The light theme uses the existing cool paper/navy palette instead of blanket white panel bodies; the dark theme uses a deeper navy command frame and panel wells. Primary and selected actions keep the existing teal treatment. Status tones and their meaning remain intact.

The actual higher-specificity Build, Rooms, Staff, Security, Regime and Roster panel rules consume the panel role, alongside Save/manage-saves, minimap/zoom, layout menu and preference chrome. Filled ordinary navigation/icon controls make their interaction surface visible before hover. Headers and section headings form a separate surface tier. Existing disabled, selected, hover and focus rules remain operative.

Four production stylesheets change: tokens, primitives, HUD and application styles. The underlying approved raw palette and all previously pinned aliases remain unchanged; this first treatment selects new roles from those ramps. It adds no shadow, gradient, blur or font download. This is a deliberate matte first treatment, not a claim that a historical implementation prohibition makes modern appearance impossible. Real visual quality remains to be judged on captured gameplay.

No player strings, room/world palette, renderer, gameplay, persistence, protocol, workflow, dimensions, layout allocation, typography sizes/family,44px targets or focus geometry change. The other HUD agent owns the approved Rotate action width and camera disclosure geometry; those changes are separate and must be composed at integration.

## Obtained source evidence

- Existing real token/theme/layout suite: **131 GREEN across3 files** ([raw](./raw/token-theme-layout-green.txt)).
- Strict application and tools TypeScript: both exit0 ([app](./raw/types-app.txt), [tools](./raw/types-tools.txt)).
- Actual PostCSS AST comparison against exact base: **2,152 nonpaint declarations unchanged** across the four files. Values normalize LF/CRLF only; selectors normalize equivalent whitespace. Border widths/styles remain in the comparison while paint values are excluded. This checks source layout/type/focus declarations, not native computed geometry.
- Resolved actual light/dark token values: **32 text-role/surface pairs meet4.5:1**, minimum **4.538:1**; **8 accent/focus pairs meet3:1**, minimum **4.959:1**. [Exact source measurement](./raw/source-contract.json) and [executed inert probe](./raw/executed-source-contract.cjs.txt).
- The first AST comparator treated checkout CRLF versus Git LF as a source difference; the retained [comparator error](./raw/initial-newline-comparator-error.txt) is an observer error, not a product geometry regression. Corrected normalized comparison succeeds without source geometry edits.

## Genuine production omission and exact restoration

At detached immutable `0c8623bb8a4c5c098a4123e72845b928a1901002`, remove only both consumed `--surface-panel` theme declarations. The actual HUD, primitive and application consumers remain unchanged. The existing token contract detects their unresolved source dependencies: **3 RED/73 GREEN** ([negative](./raw/actual-token-omission.txt)). This is a semantic dependency guard, not a fabricated visual-quality test.

Finally restore the original source Buffer byte for byte: SHA256 before/after `efc918d3c32b1b18f9a5c22891e15e24b86b9b82d83d1b3a88bd13bf74ad318c`, source diff0; restored same token file **76 GREEN** ([raw](./raw/exact-restored.txt), [receipt](./raw/mutation-receipt.json), [exact executed inert script](./raw/executed-token-omission.cjs.txt)). Then return to the own branch. No test assertion/threshold/budget was changed.

## Pending actual visual acceptance

No browser, server or build was launched by this agent. Root retains that lease. A requested bounded before/after Full HD comparison must use the same public New prison, paused session, Angled scene/camera and UI scale, with real Build/Rooms/Save controls and both theme choices. Compare readable hierarchy, focus, all top readouts and actual unchanged allocation on those captured subjects. Screenshots must identify their exact source/build subjects. Source GREEN and contrast arithmetic alone do not establish a modern or attractive result.
