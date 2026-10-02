# Existing generic office desk: source and shared-camera alignment

Checkpoint based on `0739759b0c2933cf062c3d5ef38a2c7191485c10`. This retains the existing authored workstation; it does not introduce a new object or palette.

## Actual gap and consumer

The canonical `object.desk` (numeric ID 7, `desk-wooden`) has an authoritative 2x1 footprint. Its default oblique mapping already consumes `furniture.office.desk.generic`, including the genuine Reception room plan. The accepted StaffRoom mapping uses `furniture.office.desk.employee.variants` and remains unchanged.

Fresh GitHub all-state title search `desk in:title` returned no matching Issues on 2026-10-02. Local source history identifies original authorship `382e52e829af0db160f7cc34f0faf24d89607393` and previous framing fix `7f8b7a5f1d29ba866af77b5e848d396410cba97d`. Both already exported 72 poses; this checkpoint fixes geometry/camera alignment, rather than duplicating pose densification.

The previous exporter used 128 pixels and actual orthographic span 2.65: **48.301886792452834 pixels per tile**, while declaring 64. The source is centered at (0,0), but its manifest declared target (1,.5,.4) while camera orbit actually centered (0,0,.4). Previous yaw 0 placed the camera along +X; the common convention places yaw 0 along -Y.

## Retained authored source and actual Blender preparation

The original `assets/source/blender/furniture.office.desk.generic.blend` remains byte-identical:103228 bytes, SHA256 `87ecf22ec7f4d82e5c2c47bb18870b8ef060a84759cb55d38b131fc34e72e11b`. Its21 evaluated meshes and actual material RGBA values are recorded in the adjacent source provenance JSON. No source resave, mesh replacement, scale change or material change was performed.

Native evaluated original bounds are[-.9100000262260437,-.41999998688697815,0]..[.9100000262260437,.42250001430511475,1.2699999809265137]. The desk-only wrapper reuses the unchanged shared kitchen exporter with unit scale and one min-corner translation (1,.5,0). Actual loaded bounds become[.0899999737739563,.08000001311302185,0]..[1.9100000858306885,.92249995470047,1.2699999809265137]. Every evaluated vertex stays within 2x1 at turns 0/2 and 1x2 at turns 1/3.

Actual camera 256 pixels/span 4 gives 64 pixels per tile, centered pivot 128,128 and actual target[1,.5,.6349999904632568]. The native guard reads actual camera offsets and forward direction independently for all 72 poses. Source callbacks validate original hash, all 21 mesh names and evaluated bounds before translation; default shared callbacks and other exporters remain unchanged.

Blender 5.2.1 LTS upstream build ID `9e2066aef7ef`; pinned executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`.

## Verification actually run

- Two complete 72 pose exports plus manifests:73 files directly byte-equal. Manifest SHA256 `d736f8bab54d65c396bd3cb55125ddb1f38fa99a5128bb389828e45f6524eaf7`.
- Every actual256x256 RGBA frame is decoded by integrity assertions, includes a SHA-addressed filename and transparent borders. The complete 72 pose contact sheet and yaw 30/elevation 40 PNG were opened and visually inspected.
- Four native production mutations each exit 1: remove laminate desktop; shift actual source meshes by -.2 X; halve actual camera span; shift actual camera by -.5 X. Exact wrapper restoration then exits 0 for all 72 cameras/four footprint orientations. Failures and restoration hashes are in `verification.json`.
- Append one byte to an actual referenced PNG: existing manifest integrity suite becomes red; exact PNG byte restoration gives 2/2 green.
- Four focused suites actually run: generic office desk manifest integrity, object mapping, module registry, room-template art coverage;48/48 green. The static Blender entrypoint contract also passed 4 cases (its general live scene rebuild was skipped because no `blender` command is on PATH; the desk-specific native runs above explicitly used the pinned executable). No hosted completion claim.

## Pending native player acceptance

The source/export checkpoint is complete. Real built-client Reception placement through workers, normal/90 degree palette calibration and actual SaveLoad remain pending an exclusive browser lease. The source image and static/synthetic assertions are not native player acceptance. The individual placement UI has no orientation field; the rotated Reception plan is the genuine approved rotation route. Neither buildable identity nor costs, save rules, palette, UI or simulation sources changed.
