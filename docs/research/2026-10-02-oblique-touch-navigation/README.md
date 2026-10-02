# Native two-finger navigation in the angled renderer

Issue #1959. Full HD native browser input delivered two distinct touch pointer IDs, but the angled camera viewport did not move while Build was armed. No accidental Build orders were observed in the baseline. The test expands the touch minimap before measuring its actual viewport.

The source provisions additional Phaser pointers and reuses TouchGestureTracker. A second finger cancels the pending construction gesture; pan/pinch adjusts the ground anchor under the moving midpoint. Session release, pointer cancellation and pointer exit clear the relevant touch state.

Built-client baseline red; correction1/1green (7.8s). Removing only input.addPointer(2) and rebuilding reproduces the stationary viewport failure (15.0s). Exact restoration and rebuild pass1/1green (9.3s). The same actual test asserts two delivered native IDs, moved viewport and zero Build orders. Standard60/10second budgets, one worker, no retry. Source TypeScript and ten projection unit cases pass. Pointer-exit cleanup was added after that browser proof and still requires its own lifecycle acceptance; this record does not claim pinch, all touch lifecycle paths or deployment are verified.
## Pending cancellation continuation

Extended native sequence pans, sends touchCancel for two contacts, then starts/releases one fresh contact. The pan succeeds and no accidental orders occur, but the fresh contact emits0 orders instead of1. Actual run red15.0s. A speculative mouse-button guard change did not repair it and was reverted exactly. This is unresolved: distinguish native test delivery/lifecycle from scene state before accepting a production fix. Original pan acceptance remains valid; this broader continuation is not accepted.
