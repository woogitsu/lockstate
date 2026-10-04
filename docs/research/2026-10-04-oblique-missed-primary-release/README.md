# Angled abandoned primary drag and later camera release

Source subject: `124c898d6f9ceadc1651430fce53101992105e80`. Finding: [Issue2030](https://github.com/woogitsu/lockstate/issues/2030).

## Observed original result

The existing release fixture now has two focused regressions using actual shipped Phaser Pointer and InputPlugin release dispatch, the registered Oblique scene callbacks, real BuildTool, unchanged main order producer, SimulationCommandSender and actual SimulationWorkerStateMachine. Graphics/asset loading are inert plumbing. No private gesture mutation or command feed is used.

Original focused run: **2 RED**, other30 unselected. After a held square run, public yaw35/elevation65 and cursor-anchored zoom, actual Pointer.move(buttons0) leaves five preview squares instead of one hover square. In a separate original control, a subsequent genuine right-camera release submits five square-wall packets at x9..13/y12. The exact UTF16LE original output is [original-red.raw.txt](./original-red.raw.txt).

Fresh remote dedup checked missed release / Oblique missing release / camera unintended construction / pointer gesture stays open. Closed516 fixes World only and explicitly recorded no incorrect purchase.2001 covers a camera-button release while primary is still held;1982 covers gameout camera navigation. This new source failure purchases an abandoned primary gesture in Oblique.

## Audit boundary

Read actual World/Oblique down/move/up handlers, inverse projection, public yaw/tilt/zoom/pan/fit and preview/commit geometry, main room-template ghost controller and world bridge read-only. Existing144 transform-picking cases and q1/mirror preflight/coherence/renderer replacement controls cover normal camera changes. Owner policy preserving an accepted template origin until the next physical movement is intentional and is not reported as a defect.

No browser, server, build or native collection ran. OS occurrence frequency and native acceptance remain unmeasured. Correction and exact source-omission restoration results are recorded below.

## Repeat

`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/world-build-camera-button-release.test.ts -t 'Oblique:' --maxWorkers=4`
## Narrow correction and controls

Only Oblique pointermove now withdraws its own non-touch construction gesture when the actual pointer has no buttons held. The same move then publishes the current one-square hover; it does not dispatch or disarm the tool. Touch, foreign pointer identity, still-held primary/camera chords and gameout retention keep their existing routes. Main/HUD arming and command-generation sources are unchanged.

The original transform fixture supplied buttons0 for held mouse moves. Its down/held-move flags now carry1, with ordinary hover/release0. All144 yaw/elevation cases, viewports, fit/picking, room/object orientations and independent exact kernel-order assertions remain intact.

The focused positive control turns the actual camera with a fresh right press after recovery, observes zero submitted construction and **entire worker snapshot equality** across that camera gesture, then submits exactly one full-square order matching the fresh primary press readout. A real Phaser touchstart/touchmove/touchend still previews and completes its own wall run.

Production mutation: remove the actual three-line no-button recovery block. **2 RED /1 legal touch GREEN**, other30 unselected; the stale5-square readout and five unintended order packets recur. Restore the producer from saved bytes: SHA256 `8c9420c31b57cee71f533a4ad031495632de81069926c87036ab102f7e6a6045` matches exactly. Restored focused+neighboring group: **220 GREEN /5 files**, original5000ms and maxWorkers4 unchanged. Raw [omission](./omission-red.raw.txt), [restoration](./restored-green.raw.txt), [strict app/tools types](./types.raw.txt). Types exit0.

Repeat neighboring controls:

`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/world-build-camera-button-release.test.ts tests/unit/oblique-pointer-picking-transform.test.ts tests/unit/oblique-camera-gameout.test.ts tests/unit/oblique-hud-cancel-rearm.test.ts tests/unit/ui-template-camera-preflight-coherence.test.ts --maxWorkers=4`

The original source evidence, not this read-only controller check, is the proof of the bug. No native/browser acceptance is claimed. No CSS, copy, persistence, protocol, asset or observer change is included.
## Final source checkpoint

Strict app and tools typechecking was repeated after the genuine touch control: exit0. Research index, documentation links, published commit citations, strict coverage and rendering-module boundaries: **30 GREEN /5 files**, [raw receipt](./contracts-green.raw.txt). An earlier citation check could not see the already-published root ancestor because this repository's local fetch refspec tracks only main; fetching the published own branch explicitly restored its origin reachability. No citation allowlist or guard was changed.

The shipped camera/picking producer correction is six added lines in ObliqueWorldScene only. The original two source failures and all original neighboring controls are retained. Native acceptance remains pending; this branch did not start any browser, build or server and has no lease to release.