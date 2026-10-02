# Infirmary source/export alignment - 2026-10-02

## Current checkpoint

Export work is based on integrated checkpoint `e8bb730290`. The original Blender models are byte-identical. All 144 committed poses were exported twice with identical PNG and manifest bytes. The evaluated-source, actual camera and frame integrity gates passed after deliberate mutations failed. Actual built-client Infirmary construction and Save/Load were then verified at integrated checkpoint `84bff0e11c`, with isolated palette regions and a production renderer mutation. See [player acceptance](player-acceptance.md). No hosted delivery or CI completion is claimed.

The completed route used actual Storage Room and Delivery Bay capacity/save bootstrap, native Infirmary placement at (20,5), worker completion, authoritative medical-bed anchor (21,6) and medicine-cabinet anchor (23,6), angled FullHD screenshots, real Save/Load, and independent bed/cabinet palette evidence. Renderer sources were mutated temporarily and restored byte-exactly; no UI or gameplay source change belongs to this proof.

## Proven source and framing defects

The old exporter used a 128-pixel image and orthographic scale `max(footprint) * 1.35`: 47.407 pixels per tile for the 1x2 bed and 94.815 for the 1x1 cabinet, while both manifests declared 64. The actual camera targeted the source origin while the manifests declared occupied-footprint centres; its yaw basis also differed from the game's square pipeline.

The cabinet source includes the previously authored bed: 20 mesh objects, with 11 bed meshes unselected and 9 cabinet meshes selected. The old exporter rendered all 20. Its supposed 1x1 asset therefore included a 1.82-tile bed and visibly clipped the image border.

![Old cabinet export includes clipped bed geometry](original-cabinet-with-bed.png)

## Original source identity and retained geometry

| Asset | Original and final source SHA-256 | Source meshes -> exported meshes |
| --- | --- | --- |
| Medical bed | `1737b03a3ee1342e813e7096e0aef189f05d714d5a69437a8fe490c026d232be` | 11 -> 11 |
| Medicine cabinet | `17670457233caef94855cdaf64b2cf1bd3c8623318941cbd3ce2e5c50224ac75` | 20 -> 9 |

Bed retained names: `bed_base`, `mattress`, `rail`, `rail.001`, `leg`, `leg.001`, `leg.002`, `leg.003`, `headboard`, `pillow`, `control`.

Cabinet retained names: `cabinet_body`, `inner`, `shelf`, `shelf.001`, `shelf.002`, `door`, `door.001`, `handle`, `handle.001`.

The wrapper verifies the original source hash and exact saved selected mesh-name set before excluding foreign meshes. Preparation changes only the scene in memory. It grounds the bed by +0.090000004 in Z and the cabinet by -0.030000031 in Z, then the shared pipeline places them around the minimum corner of their occupied rectangles at unchanged authored X/Y scale.

| Asset | Evaluated final minimum | Evaluated final maximum | Declared target |
| --- | --- | --- | --- |
| Bed, 1x2 | [0.039999992, 0.089999974, 0] | [0.960000038, 1.910000086, 1.350000024] | [0.5, 1, 0.675] |
| Cabinet, 1x1 | [0.090000004, 0.114999995, 0] | [0.909999967, 0.932499945, 1.179999948] | [0.5, 0.5, 0.59] |

![Opened bed preview](bed-yaw45-elev45.png)
![Opened standalone cabinet front preview](cabinet-front-yaw210-elev40.png)

The cabinet's authored doors face source +Y. Their handles remain visible in the front poses, including yaw210/elevation40 shown above. No source facing or model detail was replaced.

## Shared callback scope

`render-kitchen-fixtures-oblique.py` accepts optional `prepare_source=None` immediately after loading a source. Existing callers omit it. Only the medical wrapper passes its preparation callback. Stove, prep-counter and fridge previews from that unchanged default path were rendered and byte-compared with their existing committed yaw45/elevation45 evidence; all three were identical.

## Export and mutation evidence

Both assets use the shared 256x256 export, exact 64 pixels per tile, pivot [128,128], canonical yaw camera basis, deterministic pixel/PNG normalization, and transparent-edge checks. Every evaluated vertex including modifiers is contained in its declared footprint and grounded. The medical camera verifies its scale, declared target, yaw basis and aim across all 72 poses per asset. The unit gate independently decompresses and checks all four transparent PNG edges in every exported frame.

| Production mutation | Observed red guard |
| --- | --- |
| Retain foreign bed meshes in cabinet export | actual geometry escapes 1x1 footprint |
| Camera placed around origin instead of declared target | actual camera target/yaw basis mismatch |
| Orthographic camera scale 4 -> 2 | actual scale differs from 64 pixels per tile |
| Append a byte to a referenced bed PNG | manifest/frame SHA-256 mismatch |

Actual Blender mutation results are preserved in [actual-export-guard-mutations.json](actual-export-guard-mutations.json). Exact source-script restoration hashes after those guards:

- medical wrapper: `7d0463c65932b3786d22285eb0d05166a8e00c3530daa1d1a53d901358252f9b`
- shared square exporter: `a3e481fd158707c8e615fa87eee19a110716b81e14b11e903225d374d5c643d6`

Two full exports matched all 144 PNG bytes and these manifest SHA-256 values:

- bed: `044618dbc6dc4eb8297276c1e57ee1b3e182a00b5af05f105ea7c45a35836748`
- cabinet: `a11e50040c8cbacce296079ce4b41e0bf9e3d52a75729efb4c440599227a3e81`

The new medical integrity gate initially failed both old manifests. After export, the medical/utility/kitchen/art-pipeline suites passed 14/14. Application and tools typechecks and the production build passed. An early kitchen byte check encountered unhydrated LFS pointer files in this isolated checkout; hydration restored that pre-existing integrity gate to green. All 144 obsolete medical frame paths were removed from the original manifests' exact file list.

## Repeat the source and export gates

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 --python tooling/blender/render-medical-oblique.py -- --verify
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 --python tooling/blender/render-medical-oblique.py
node node_modules/vitest/vitest.mjs run tests/unit/oblique-medical-fixture-integrity.test.ts
```

Renders were produced with Blender 5.2.1 LTS, upstream Blender build identifier 9e2066aef7ef (not a Lockstate commit). The host executable SHA256 is `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`. Repeat-byte evidence is from this pinned host toolchain.
