# Draft: live renderer selection from the HUD

## Existing behavior and missing player flow

At `26daf7ee10`, `productionRenderMode` recognizes a URL query before Phaser starts. The composition root holds one constant `worldScene`. There is no HUD view selector. Issue #1592 supplies the owner direction for adjustable angled view; fresh remote searches for renderer/oblique/view switch found no narrower existing issue. This draft does not change the current top-down default or add a saved preference.

## Proposed session-preserving seam

A `LiveRendererSelection` controller serializes renderer replacement. Preparation validates/loads the new catalogue before withdrawing the playable scene. Activation creates a fresh Phaser scene in the existing Game. Deactivation stops/removes the old scene, executing SHUTDOWN and withdrawing global input listeners. Sleeping a scene is insufficient: both scenes install window key handlers, and a sleeping instance could keep changing shared tools. Failed activation reconstructs the prior renderer against the same feed and tool ports.

Worker, `SessionController`, command sender, render feed, persistence and unsaved prison remain identical. A view selection issues no NewGame/Load/Save command and performs no page navigation. Catalogue loading remains lazy on first angled selection. The previous camera mode is reconstructed; its exact zoom, yaw and elevation are held in renderer-only memory. A shared exact world-pixel centre transfers between modes, including an empty world. `captureCameraView` / `restoreCameraView` do not consult or write saved state.

## Composition-root sink audit

- Scene boot: change the active reference from constant to mutable, retain the existing Phaser Game, factor the oblique scene factory using the same feed/tools.
- HUD zoom/minimap/tile navigation: existing callbacks already close over the variable; they must always resolve the current reference.
- HUD pose controls: currently assembled only if the initial scene is oblique. Add a renderer capability update so four controls appear only for the active angled scene, not inert top-down actions.
- Minimap sink: bind the same HUD update port to every activated scene. Replace the published projection only after active scene readiness.
- Plan bridge: its projection callback can resolve the current scene dynamically; its fit controller is currently selected once at install time. Dispose the bridge and reinstall the controller after successful replacement. Its returned cleanup cancels requestAnimationFrame/listeners. Do not duplicate overlays or retain pointer-down gestures across a switch.
- Session lifecycle: existing reframe callback resolves current scene dynamically; coordinate any edits with camera agent.
- Demo actor feed: preserve the actually selected feed rather than reinstalling the base feed during a renderer switch.
- Failure path: restore previous renderer and report the error using existing UI error infrastructure; do not overwrite the whole game root or reset the prison.

## Review boundary and evidence

First checkpoint `249140a794` is dormant: four controller tests pass, and mutating deactivation before catalogue preparation fails the preservation test. This is port-level evidence, not proof of a real worker or Phaser switch. Production wiring requires actual unsaved build, two renderer transitions, unchanged worker identity/tick/world, correct current picking/ghost/minimap and bounded input handlers, plus failed catalogue rollback.

No persistent format, deployment configuration, default renderer or simulation policy is changed. Static truthful labels can be authored under AGENTS reservation 4's dated wording release. The architectural seam is a draft for integrator review before production activation; this document assigns no ADR number.

## Integrator review and coherent wiring checkpoints

The integrator reviewed and accepted this seam for isolated production wiring in this session. Issue #1951 tracks the actual player flow. Source checkpoints implement a native HUD selector and dynamic pose-control capability, one Phaser Game, shared actual feed/tools, cached verified catalogues, outgoing input-session release and single plan-bridge disposal/reinstallation. Camera view memory preserves exact centres and mode-specific poses. Failed recovery exposes no active selection and permits a fresh renderer retry, with truthful native validation feedback; camera ports do not call a destroyed scene.

Mutation evidence obtained: deactivate before prepare fails retention (1 failed / 3 passed); dead scene retained after failed rollback fails availability (1 failed / 4 passed); refetching verified catalogue fails offline recovery (1 failed / 4 passed); replacing restored centre with zero fails two pixel-centre tests (2 failed / 1 passed). Restored focused controller/cache/view/composition tests: 40 passed, TypeScript passed. UI asynchronous selector mutation also fails the busy/duplicate-request case, restored selector/controller 7 passed.

Prepared `tests/browser/live-renderer-selection.spec.ts` uses a subclass of the real production Worker to count construction/termination and obtain real snapshots. It creates an actual unsaved Yard from the current UI, switches both ways and checks unchanged snapshot/worker/commands/URL, canvas changes, pose capability and single bridge. A separate actual registry 503 case checks retaining the old scene and retry. Actual production artifact acceptance now passes all three cases with one browser worker: normal roundtrip, registry 503 retry, and controlled partial activation rollback. The Yard is changed after initial prison creation and never manually saved; actual worker snapshots, sent command lists, worker construction/termination counts and URL remain unchanged through both view transitions. The full-square target at viewport centre remains `16, 16`. The real canvas changes and the pose controls appear only in angled mode. See [Full HD image](./live-renderer-angled-fullhd.png). This image was opened and inspected: the View selector is visible above zoom and the four camera actions, with one room and funds 25,000 preserved. The Build target line is clipped in the existing narrow sidebar; that independent readability limitation is not claimed fixed by renderer switching.

Partial activation first exposed three additional measured listeners (11?14). Inspection showed two were actual scene canvas cancel/lost-capture handlers; the third was Playwright?s lazily installed window pointerdown hit-target interceptor, whose function delegates to `_hitTargetInterceptor`. The final probe counts game-owned canvas pointer listeners and window keyboard/focus/blur listeners and excludes that unrelated window pointerdown action harness. With late cleanup registration restored as a production mutation, the measured game listener count becomes 13 instead of 11 (one case failed, 5.7 s). Early SHUTDOWN registration before attachments removes only the exact callback references owned by each scene, including partial attachment. Restored production acceptance: 3/3 passed, 24.6 s, original 60 s test/10 s assertion budgets, no retries. TypeScript and production artifact build passed. The fault is deliberately injected at native keydown attachment to exercise recovery; this does not claim such a browser platform exception occurs during ordinary play.
