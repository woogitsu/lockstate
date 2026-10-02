# Cursor anchored wheel zoom on current main

Issue #1955: native wheel zoom in the angled scene changed the indicated Build square beneath the cursor. The correction preserves the inverse-projected ground point when changing zoom. Keyboard and HUD zoom keep their viewport-centre behavior. No saved state, build cost, collision or deployment configuration changes.

This independent branch starts from main `180bc75ea1` (v0.0.835), rather than importing the larger room-plan branch. Its production test is `tests/browser/oblique-wheel-anchor.spec.ts` at 1920x1080, using actual mouse wheel input after changing yaw/elevation. Main refreshes its older hover readout on physical movement, so the test moves one pixel and returns to the same screen position before comparing; a stale label cannot prove correctness.

The built production client passes 1/1 (6.7 seconds). Removing only the native wheel pivot argument and rebuilding makes the same test fail: expected `18, 23 · North`, received `18, 21 · West` (13.5 seconds). Restoring the source byte-for-byte against HEAD, rebuilding and rerunning returns 1/1 green (6.7 seconds). Both wheel-in and wheel-out are checked. Eight projection unit cases and application/tools TypeScript passed before the actual browser proof. Test and assertion budgets remain 60/10 seconds; one browser worker, no retries.

This proves the independent main-based fix locally. It does not claim full CI, merge or production deployment. The live renderer-switch proof remains on the larger integration branch and is not claimed for this main version.
