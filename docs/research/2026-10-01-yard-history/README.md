# Shell-free Yard history: implementation and browser QA

## Implemented production behavior

Yard placement records a reversible world zoning transaction. It creates no
wall BuildOrder. Undo removes the pending zoning obligation or completed Yard;
Redo reruns footprint preflight and restores the obligation only when clear.
Save/Load restores the external transaction handlers from room-template state.
The existing history availability projection now exposes those transactions
so the actual HUD Undo and Redo controls are enabled when appropriate.

Standalone backend commits: `53009f866b`, `c0c6011646`, `d3b2ad35ec`.
The combined QA branch includes the interrupted-pointer fix `b7a8c9ddac`.

## Evidence obtained

- Unit matrix covers all 20 plans through completion, encoded Save/Load,
  Undo, encoded Save/Load, Redo and completion.
- Separate two-Yard history test preserves completed and pending ordering.
- Rejected Yard Redo leaves no pending obligation and creates no wall order.
- Removing the zero-shell reconciliation guard makes that refusal test fail;
  restoring it makes the test pass.
- Before external history availability was implemented, the real browser reached
  completed Yard Save/Load but the HUD Undo control was disabled. The added
  production availability assertion likewise failed before the fix.
- After the availability fix, completed-transaction and construction-history
  suites passed: 2 suites, 30 tests. TypeScript passed on the backend checkpoint.

## Browser verification still incomplete

`tests/browser/yard-mouse-history.spec.ts` exercises actual Full HD angled mouse
placement, interrupted pointer release without a new press, and HUD
Save/Load/Undo/Redo. It also asserts that no PlaceBuildOrder is sent for Yard.
This complete browser test has not passed yet and is not completion evidence.

The last run ended before the New prison control existed. Trace showed only
`main`, no runtime console error, 473 requests and pending worker modules,
zod and the medic actor manifest at the unchanged 60-second deadline. Main
and oblique manifests had returned 200. A local isolated Vite dependency cache
was used to investigate shared-cache interference; it did not resolve this cold
bootstrap. That local config override is not committed. No timeout was raised.

Keep the stack draft while the requested save metadata and truthful generic
building Undo/Redo message decisions remain pending. Do not merge this QA stack
as a standalone product change.
