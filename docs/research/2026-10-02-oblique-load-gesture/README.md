# Held camera turn across Load — 2026-10-02

Production Full HD browser case: `tests/browser/oblique-camera-load-gesture.spec.ts` at 1920×1080. Create, pause and save a prison. Hold the right mouse button on the world canvas. Activate Load with the keyboard while that button remains down, then move the pointer.

## Evidence for issue #1949

- **Before the fix:** real browser test failed in 6.8 s. The minimap viewport changed after the post-Load pointer movement from `left 2.38975%, top 2.38975%, width 95.2205%, height 95.2205%` to `left 7.28741%, top 8.60236%, width 81.4966%, height 85.4787%`. The old camera turn continued in the loaded prison.
- **Production fix:** the worker-availability boundary releases held keys, right-button turn state, hovered screen position and an active build/room/object pointer gesture. The same browser test passed 1/1 in a 12.3 s suite.
- **Production mutation:** omitting only `worldScene.releaseSessionInput()` from the assembled app reproduced the same red viewport values. Restoring the call passed 1/1 in a 12.0 s suite. [Before pointer move](./loaded-before-stale-turn-fullhd.png) and [after pointer move](./loaded-after-stale-turn-fullhd.png) are the restored green Full HD screenshots; their PNG bytes match.

This browser case directly proves the right-button turn path. The other transient inputs are cleared by the same method, but their effect on an outgoing placement command is **not** proven by this case. No new save fields or camera angle persistence were added.
