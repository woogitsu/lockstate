# Retained Laundry washing machine with physical details

Source checkpoint from published `41998ff60f013c099a2337dcd64172aa0ab12c34`. Canonical `object.washing-machine` / numeric6 / `washing-machine-brick`, laundry capability,2x1 footprint and asset `utility.washing-machine.variants` remain unchanged. This is a retained model with added geometry, not a new gameplay asset.

## Existing model and real consumer boundary

Current object/room-plan catalogs and default consumer mapping were inspected. Laundry genuinely constructs two washing machines. There is no constructible Kitchen sink; the existing handwash sink art has an explicit content boundary. Canteen already uses the accepted40mesh wooden bench with worn slats, recessed bolts and brackets, so duplicating that model would not meet this task. The washing machine has shared64pixels-per-tile/72poses but no dedicated angled-detail source.

Fresh all-state title search returns existing Issue1961OPEN. Its actual body acknowledges the earlier source alignment and leaves native Laundry worker/SaveLoad pending. This checkpoint retains that accepted fit and does not report another alignment defect. The original actual yaw300/elevation40 source preview was rendered and opened before modeling.

Original `assets/source/blender/utility.washing-machine.variants.blend`:112729bytes, SHA256 `fb4eccefc3809342b57e4b15822e68ee1a1d0060bc8d75acda288d07284f7e0b`. Fourteen authored meshes: body, control strip, three knobs, display, status light, door ring/glass/handle and four feet. Five materials: enamel,rubber,steel,blue glass,status green. Raw evaluated bounds[-.8500000238418579,-.5899999737739563,0]..[.8500000238418579,.41999998688697815,1.559999942779541]. Existing(1,.8,1)fit and(1,.5,0)anchor give actual loaded bounds[.1499999761581421,.0279999952763319,0]..[1.850000023841858,.8359999656677246,1.559999942779541]. Existing target height.8; original actual height midpoint.7799999713897705. Source audit and accepted bounds were reported to coordinator before any MODELS-row edit.

## Dedicated source and physical additions

Own `refine-washing-machine-angled.py` loads the exact original, retains all14mesh assemblies/materials, and bakes only the previously approved(1,.8,1)fit. Maximum retained coordinate error8.344650265224018e-8; additions do not alter the fitted original evaluated vertices. The dedicated `utility.washing-machine.angled.blend` SHA256 `f2940130e2ec10ad814800bb15418441b48238881c3d038d69168d597f89e8ae` has80meshes:14retained plus66physical additions.

Added geometry: a machined door rim and glass gasket, eight polygonal fasteners, hinge plate/barrel; lower service recess/frame/grip; fourteen side vent recesses and fourteen raised louvres; detergent drawer recess/frame/grip; three control bezels and three pointer marks; four display bezel strips; four raised inspection-hatch seams. Torus rings have actual64x12evaluated geometry. All additions reuse original steel/rubber materials; original blue glass, enamel and green light remain unchanged. The dedicated45/45 preview was rendered and opened: machined door edge, control details, physical side vents and raised lid seam are visible. Retained feet inside the solid cabinet are not claimed as new visible geometry.

New centered evaluated bounds[-.8610000014305115,-.47200000286102295,0]..[.8610000014305115,.335999995470047,1.565000057220459]. Side vent lips extend the accepted body by.011per side and the physical top seams raise it by.005; all additions remain within the authoritative2x1. Own unit-scale wrapper plus one(1,.5,0)translation produces actual loaded bounds[.13900001347064972,.0279999952763319,0]..[1.8610000610351562,.8359999656677246,1.565000057220459]. Measured midpoint target[1,.5,.7825000286102295]. Actual evaluated vertices fit2x1or1x2through all four clockwise quarter turns. The wrapper independently checks72actual camera offsets/forward directions against the world projection basis and actual256px/span4camera=64pixels-per-tile.

## Actual native source controls

Five real native producer mutations each exit1: remove an added vent(mesh-set guard), move it outside measured source bounds, halve loadedYscale, change actual camera span and move the actual camera from its declared vector. Wrapper bytes restored exactly, both original/dedicated source bytes unchanged, native72camera/four-orientation verification exit0. Actual results/digests are in `source-verification.json`.

Pinned Blender5.2.1LTS upstream build ID9e2066aef7ef; executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`. Both own entrypoints explicitly assert the version. The existing washing exporter MODELS row and all shared functions/default callbacks remain unchanged at this source checkpoint.

## Next checkpoint

Production descriptor/72frames remain their accepted earlier version. Full deterministic export/repeat, all decoded borders/contact sheet, actual PNG mutation and focused integrity follow. A genuine normal/90Laundry native worker/SaveLoad fixture is queued behind coordinator's browser leases; no browser launched. No registry/schema/palette/buildable decisions or hosted acceptance claim.
