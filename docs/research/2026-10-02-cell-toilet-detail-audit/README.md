# Consumed Cell toilet: existing alignment and proposed physical detail

2026-10-02. Read-only native source audit in an isolated worktree from published
`4f0ad8a7865504172fdfc416cce0440743b2fb78`. This checkpoint changes documentation
only; no model, exporter, descriptor, actor, registry or gameplay file changed.

## Corrected assignment

The proposed Laundry ironing board does not exist in the inspected content.
Exact-name searches in content/buildable definitions, the authored scripts,
sources and module descriptors found no ironing-board counterpart. The genuine
`laundry-basic` template only places two existing washing machines. No new
identity, capability or buildable is proposed. The coordinator selected the
consumed Cell toilet as the next model to inspect instead.

## Verified retained source and export

Buildable `toilet-brick` places `object.toilet`, numeric3, authoritative1×1,
sanitation capability. Its existing default art identity remains the historical
`fixture.cell.toilet_sink`, registered through
`public/game-content/oblique-cell-toilet.v1.json`.

Original source `assets/source/blender/environment.mvp.catalog.blend` SHA256
`57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d`, byte-identical
before/after the actual Blender audit. The source collection has19 meshes and
eight materials, recorded individually with actual evaluated vertex counts,
material assignments and bounds in `source-audit.json`.

The existing exporter applies the previously accepted origin(.5,.5,0) and
XYfit(.8,.8). Every actual evaluated vertex fits all four occupied orientations:
`[.17599999904632568,.08799998462200165,.005000002682209015]` to
`[.9159998893737793,.9621759653091431,1.102500081062317]`.
Actual512px/8orthographic tiles=64pixels per tile, canonical target[0,0,0],
12yaw×6elevation=72poses. Actual forward vectors aim at that declared target.
The yaw0 camera occupies−Y, consistent with the world projection basis.
The existing source already fits; this is **not a new alignment defect**.

The published45°yaw/40°elevation frame was opened. It shows the genuinely
authored bowl/torus seat, dark basin water, teal cistern band, supply pipe and
floor flange. The current source already has substantial physical detail and
must not be described as an undetailed generic slab. The earlier scoped
`2026-10-02-toilet-dense-alignment` record describes actual Cell SaveLoad and
consumer-negative coverage; that historical browser proof was read here,
not rerun or newly accepted.

## Concrete proposed refinement and exact scope

The existing source vertical supply pipe ends beside the cistern without a
modeled connection or shutoff valve. The existing seat rear hinge is one block.
Propose retained19mesh/eightmaterial source with physical pipe coupling,
shutoff valve body/stem/wheel, separate seat hinge barrels and fixing bolts,
and a shallow cistern lid joint. Reuse existing metal/porcelain materials.
Retain the current assembly spacing and previously accepted.8XYfit, canonical
identity, occupied square, original material nodes and Eevee lighting.

Proposed leased paths, awaiting coordinator confirmation before model edits:

- Own `tooling/blender/refine-cell-toilet-angled.py`.
- New `assets/source/blender/fixture.cell.toilet_sink.angled.blend` and matching
  `.provenance.json`; original catalog stays byte-identical.
- Existing `tooling/blender/render-oblique-cell-toilet.py`, its canonical
  descriptor and referenced72frames only. Use existing camera/export helpers;
  retain64actualppt, check evaluated geometry/mesh omission and measured target.
- Scoped integrity and genuine Cell normal/90° worker Build+SaveLoad fixture,
  followed by consumer removal and exact restoration after the browser lease.

The registry, all other models/default callbacks, gameplay/palette/save rules,
root washer/bin bundles and actor assets are outside this proposal.

## Weakest claim

Added details are a proposed improvement, not yet modeled or accepted native
pixels. Native source/mesh/geometry controls and opened repeat exports must
establish the physical additions. Genuine Cell worker-completed/loaded scenes
and a consumer-only negative control must establish their actual consumption.
No browser, hosted state or player completion is claimed for this checkpoint.

## Approved source checkpoint

The coordinator approved this exact physical refinement scope after the audit.
The dedicated source now retains19original meshes/eight materials and adds
25physical meshes: pipe coupling/compression collars, shutoff valve body/stem,
480vertex polygonal torus wheel with four spokes and hub, two separate seat
hinge barrels/pins/mounts with fixing bolts, and four cistern lid joint rails.
No texture or palette was authored. Existing material nodes and Eevee
key/fill/ambient settings remain intact.

Source SHA256 `4ced3356c2f2d17d08e4ce3f9b58e4d63d8500be7927da66a982d7752e513d6d`.
The builder records and compares the packed float32 vertex bytes and topology
bytes of each original mesh before/after, unchanged. Each retained material's
canonical node/default/socket/link record is compared byte-for-byte and hashed;
this is a serialized data audit, not a claim that relocated Blender datablock
binary storage is identical. The complete original catalog bytes remain exact.
The accepted.8XY fit is baked into object transforms, leaving original raw
geometry/modifiers untouched; the exporter supplies a unit min-corner shift.
Maximum retained evaluated fit error `4.470348358154297e-8` tiles.

The first builder precision preflight was red at2.270760013870168e-6 after
subtracting a21tile catalog grid offset from already evaluated float32 points;
raw vertex/topology records were equal. The correction removes that parent
layout offset before evaluation, exactly as the existing exporter does. The
comparison tolerance was kept; no authored shape was relaxed or changed.

Actual loaded44mesh bounds are
`[.17599999904632568,.08799998462200165,.005000002682209015]` to
`[.916000247001648,.9621759653091431,1.102500081062317]`, still within all four
occupied orientations. Measured camera target now[.5,.5,.553750041872263];
actual512/8=64pixels per tile stays unchanged. This centered frame target is
declared for runtime pivot composition; changing it does not alone prove an
old alignment defect. Original source already fit correctly.

Native dedicated-source verification exited0 for72actual camera transforms and
four occupied orientations. The actual45/40preview was opened; the original
porcelain/teal bowl/cistern and new metal valve connection are visible. This
preview is authored-source evidence, not a player frame. Full repeat exports,
producer negative controls and genuine native consumer acceptance are pending.
The existing registry is checked without rewriting any row.

## Completed canonical export and real producer controls

After adding the post-load mesh-set check, the first full-export preflight was
red: Blender's library API mutates its assigned list from string names into
Object references, so the independent expected-name list had to be copied at
assignment. This was corrected and all later exports/controls use the corrected
wrapper. No partial preflight is counted as a successful72pose export.

Two complete dedicated-source exports produced73/73 direct byte-identical
files (canonical descriptor plus72referencedPNGs). Manifest SHA256
`e935208968f880695e483df1622311c9dfd2d89c8faa33624dd683bae2a7e1c3`.
All72actual512×512RGBA frames decode with transparent borders, minimum207px.
The cropped72pose sheet and full actual±45/40PNGs were opened. The sheet crops
alpha bounds plus8px and labels its altered framing; it is source inspection,
not native pixel-scale evidence. Valve wheels and pipe couplings are visible
on the supply side; opposite poses legitimately hide them behind the bowl.

The emitted camera target is `[.5,.5,.5537500381469727]`, the actual float32
BlenderVector representation of measured midpoint.553750041872263. The initial
focused pass had two failures from comparing that float32 value to the exact
double midpoint. Expectations now pin the real emitted value; camera geometry
tolerances and pixels-per-tile assertions were preserved.

Eight actual Blender producer controls each exited1: omit physical valve wheel,
move physical hinge, change retained material values, wrong loadedXscale,
camera span, camera vector, measured target, runtime descriptor. Exact wrapper
and original/dedicated source restoration verified byte equality; native
72camera/allfourorientation verification exited0. `producer-controls.json`
records each actual error and the restored byte hashes.

An actual referenced PNG byte mutation made the dedicated integrity test
exit1; byte-exact restoration returned exit0. The unit guard decodes every
RGBA frame including actual PNG filters and checks its transparent borders.
Final focused run:6suites passed,53tests passed/1optional Blender subprocess
skip. Native subprocess evidence is supplied independently by the actual
controls above. App/tools TypeScript compilation exited0.

Registry and original catalog diffs remain empty. Genuine new-model Cell
construction/SaveLoad and consumer-only native negative controls remain queued;
no browser started during the coordinator/HUD leases.

A single fresh GitHub read of historical Issue1952 was rate-limited; its current
remote status was not verified and is not claimed here. No repeated API polling
or Issue mutation followed. The next real-player route is recorded separately
in `native-player-acceptance.md` with calibration and consumer proof pending.

## Corrected physical valve surface normals

Before native player acceptance, an independent analytic check of the actual
polygon normals found the newly authored torus wheel's face winding pointed
inward. The first source-normal audit exited1. This was a real new-detail
geometry defect; the original retained nineteen meshes were unaffected.
The preceding source/export hashes above describe the historical checkpoint,
not the current corrected source. Its descriptor, provenance, repeat and
producer receipts from commit `9e63aa218ce1bdba3ef8ced3d1da9e5878904176` are
preserved as `historical-inward-wheel-*.json`, alongside that Git history.

The builder now winds the wheel faces outward and checks every actual polygon
normal against the analytic outer tube direction. The exporter independently
performs the corresponding check after loading the Blender source. The
minimum normalized outward dot is `0.9998946785926819`. Original mesh vertex,
topology and material audits,44mesh count, allfour occupied orientations,
accepted fit, evaluated bounds, camera target and64pixels per tile remain
verified at their existing limits.

Corrected source SHA256
`335544282e27ff01608f7f10987c054012d38ec3905340c24c142b7b794b1b2a`.
Corrected descriptor SHA256
`f26bf5fbad201a088fcc4bae294681e72600f941a360881c6e902657e2e15f3e`.
Two fresh full72pose exports produced73/73 directly byte-identical files.
All72RGBA frames decode, minimum transparent border207px. Four PNG hashes
changed after the winding correction. The refreshed cropped sheet and actual
45/60 corrected PNG were opened; these remain source-export evidence.

A producer-only control reverses the builder's wheel faces before mesh
creation: actual Blender exits1 at the surface-normal guard, before saving.
The builder is restored byte-exactly (SHA256
`7ae422968e9cd05dac189e455d466d3a836eca1b361d22f1471543fafa902e65`), and
the prepared source bytes remain unchanged by the negative. A second control
reverses only the loaded wheel topology while preserving its vertex positions;
the independent exporter exits1 at its surface-normal guard. The previous
eight geometry/material/camera/descriptor controls were rerun and each exits1.
Exact restored wrapper/source native verification exits0. Actual published
PNG byte mutation remains red, then byte-exact restoration green.

Current focused check: six suites,34passed/1optional Blender subprocess skip;
application/tools TypeScript compilation exits0. Actual Blender subprocess
controls supply the native evidence independently. At that source checkpoint,
fresh worker-built corrected Cell pixels and consumer controls remained pending.

2026-10-03: fresh corrected-source native q0/q1 construction/SaveLoad passed3/3.
Removing only the existing default toilet consumer produced four expected pixel
errors for each actual orientation; exact byte restoration/rebuild passed3/3
again. Native front/valve counts227/122 and201/121 survive Load; original
>100/>8 thresholds remain. Both final loaded FullHDs were opened. Full worker
and source/descriptor72frame bytes stayed identical through the control.
See [native-player-acceptance.md](native-player-acceptance.md) and its compact
receipt, raw provisional/final/negative results, calibration and final images.
Integrated/hosted acceptance remains separate.
