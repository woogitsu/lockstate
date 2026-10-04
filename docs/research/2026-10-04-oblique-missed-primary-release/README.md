# Angled abandoned primary drag and later camera release

Source subject: `124c898d6f9ceadc1651430fce53101992105e80`. Finding: [Issue2030](https://github.com/woogitsu/lockstate/issues/2030).

## Observed original result

The existing release fixture now has two focused regressions using actual shipped Phaser Pointer and InputPlugin release dispatch, the registered Oblique scene callbacks, real BuildTool, unchanged main order producer, SimulationCommandSender and actual SimulationWorkerStateMachine. Graphics/asset loading are inert plumbing. No private gesture mutation or command feed is used.

Original focused run: **2 RED**, other30 unselected. After a held square run, public yaw35/elevation65 and cursor-anchored zoom, actual Pointer.move(buttons0) leaves five preview squares instead of one hover square. In a separate original control, a subsequent genuine right-camera release submits five square-wall packets at x9..13/y12. The exact UTF16LE original output is [original-red.raw.txt](./original-red.raw.txt).

Fresh remote dedup checked missed release / Oblique missing release / camera unintended construction / pointer gesture stays open. Closed516 fixes World only and explicitly recorded no incorrect purchase.2001 covers a camera-button release while primary is still held;1982 covers gameout camera navigation. This new source failure purchases an abandoned primary gesture in Oblique.

## Audit boundary

Read actual World/Oblique down/move/up handlers, inverse projection, public yaw/tilt/zoom/pan/fit and preview/commit geometry, main room-template ghost controller and world bridge read-only. Existing144 transform-picking cases and q1/mirror preflight/coherence/renderer replacement controls cover normal camera changes. Owner policy preserving an accepted template origin until the next physical movement is intentional and is not reported as a defect.

No browser, server, build or native collection ran. OS occurrence frequency and native acceptance remain unmeasured. Correction and exact source-omission restoration results will follow separately.

## Repeat

`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/world-build-camera-button-release.test.ts -t 'Oblique:' --maxWorkers=4`