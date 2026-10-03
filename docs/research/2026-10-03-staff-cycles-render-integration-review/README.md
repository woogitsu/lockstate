# Staff Cycles rendering integration review

## Subject and result

Read-only source and bounded test review, 2026-10-03. Base
`4118f5184f1a1d793b74badbbd37421e93b039b3`; independently composed subject
`a0d5d6ab3f026459fbe69f3307445dc33c21d38c` imports the original Staff
`eb844766610e7e3ba38a89ecdb035b0058f4a15b` and
`afe451db2ccf8861b8c7205a7646470a2f54ed65`, camera
`55ebd97ee2b04cf152e181fbb2405b2d6cec2515`, and HUD paint
`32abd38f009a975713c1aa126384859eceb72bad` and
`d5703d45672f9020322516c5355e32a9c8b3d830`.

**No confirmed runtime integration defect in this bounded review.** No
production fix, Issue, producer mutation, browser, server, build or native
acceptance is claimed. Root owns actual compiled-game visual acceptance.

## Measured geometry and consumers

[Executed comparison](./evidence/geometry-review.cjs.txt) and
[actual output](./evidence/geometry-and-consumers.json) retain the exact subject,
original imports and per-file canonical text SHA256. Eight world appearance,
physical structure, orientation, mapping, catalog, registry, scene and projection
consumers are unchanged from the base. The descriptor retains its asset ID,
256-pixel resolution, 128-pixel pivot, nominal 64 pixels per tile, camera target,
orthographic projection and 72 yaw/elevation entries. Its source and image bodies
change as intended. Selected real source/PNG LFS files were hydrated; the
[checkout output](./evidence/selected-lfs-checkout.txt) is retained.

Source read: `paintRaised` in `src/rendering/scene/oblique-world-scene.ts` keys
solid images by kind/identity and continues after a loaded authored image. A
missing/loading image uses the fallback prism; obsolete fallback graphics are
removed in the same publication. `paintAsset` rotates the authored target using
the physical footprint, applies the descriptor pivot and scales by tile size ×
camera zoom / nominal pixels per tile. Cycles does not add a second runtime
shadow or modify that producer. Baked PNG appearance is not physical occupancy.

The existing Staff-room context mapping requires a completed room containing
the whole Chair footprint. Pending/outside cases retain the generic mapping.
Registry URL and context aliases are unchanged. Camera and HUD changes in this
composition affect presentation without changing these eight renderer modules.

## Bounded actual controls

[Raw terminal output](./evidence/focused-render-controls.txt): **66 GREEN in five
files, 4.45 seconds**, using the existing source controls:

- `tests/unit/oblique-staff-room-padded-chair-context.test.ts`
- `tests/unit/object-art-orientation.test.ts`
- `tests/unit/oblique-pending-wall-depth.test.ts`
- `tests/unit/oblique-demand-texture-lifecycle.test.ts`
- `tests/integration/room-template-rebuilt-render-identity.test.ts`

These cover actual context/projection/PNG source behavior and genuine rebuilt
physical ownership/session Save/Load. Unit frame seams are not native player
evidence. No new repeated matrix was added and no negative was run for this
already unchanged producer. [SHA256 manifest](./evidence/sha256.json) identifies
the retained executed script and raw artifacts.

The existing research-index and documentation-link guards also completed
**15 GREEN / two files / 13.05 seconds**; [raw output](./evidence/docs-gates.txt).
Their budgets and guard source are unchanged.

## Integration caveats and next acceptance

1. The actual base's old Staff yaw60/elevation40 frame is
   `3d0fd0a023174ec0a0fa897f33a57d1e07630a5201ec093f394a65634e399646`;
   the Cycles frame is
   `a200ce9518d232a2ef0f6bdac0343738042804f87fb3e57f67c9f648345682f8`.
   New authored gradients do not retain the old exact pad RGB38/41/44.
   [Art handoff](../2026-10-03-staff-chair-retained-cycles/INTEGRATION_HANDOFF.md)
   records the source pins. Root must calibrate the actual compiled-game crop;
   changing a pin alone does not establish visual acceptance.
2. Incoming Staff research row was a four-cell date-first row against this
   base's three-column index. The isolated integration resolved it to one
   canonical linked Record/Question/Decision row and retained the root Guard,
   Laundry and View rows without a duplicate Laundry row. This is an index
   integration correction, not a runtime defect.

Weakest claim: unchanged descriptor geometry and source controls do not prove
that new lighting/shadow pixels look correct beside every actor and wall in the
compiled game. Actual root screenshots at the retained scale and poses can
falsify that appearance judgment. This review changes neither a palette nor a
native threshold and claims no native latency measurement.
