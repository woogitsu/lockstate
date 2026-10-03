# Next proposed physical model: existing default wooden chair ? 2026-10-03

**Proposal only. No model, export, source dispatch or catalog has been changed. No native browser/server.** Read at prepared dock branch `b1c8937d7544856a67299a761d1e601f3ad8481c`; model selection awaits the parent's narrow lease in a new independent worktree.

## Why this existing object

`chair-wooden` genuinely places `object.chair`, numeric8, authoritative1x1, seating capability. Default consumer is `furniture.chair.wooden`, canonical `/game-content/oblique-cell-chair.v1.json`, retained source `assets/source/blender/furniture.chair.wooden.blend`. Reception uses two chairs, Staff Room two, Classroom four. The existing Classroom override consumes a separate physically modeled school chair and is excluded. Individual q0 and genuine rotated Reception q1/native SaveLoad are already recorded in the existing wooden-chair alignment evidence; those historic native runs were not rerun here.

The current default chair has **16** authored parts: broad wooden seat/back, steel underframe/front lip, rear posts/front legs, four rubber feet and two back brackets. The opened existing72-pose sheet shows a strong chair silhouette but an empty under-seat span with direct leg-to-pan joints, and no physical mounting plates/gussets, transverse/side stretchers, seat fixing heads or back-rail collars. Those connections are a meaningful visible structural addition at lower oblique elevations. This is a physical-detail refinement proposal; **its current footprint, palette and all-camera alignment are already correct**.

More complete candidates were excluded: the Canteen table already has62 modeled parts/trays/utensils; the default desk already has94 physical parts; Staff Room desk was reopened and has49 parts including lamp articulation, drawers/pulls, textured laminate, open ledger, paperwork and pencil cup; Common Room bench already has separate cushion seams, real frame and arm fittings; Classroom chair already has frame stretchers and physical rivets. No fictional kitchen sink or new buildable is introduced.

## Actual current source audit

[Native read-only source audit](retained-source-audit.json) reopened the actual `.blend` with pinned Blender5.2.1, retained hash `dab33079c7a42b2967950bab72048953270520383adbf3873a65aeb8e1b6687d`,5730180bytes. It records all16 names, raw topology/material-index fingerprints, actual transforms/modifiers, four existing material names, raw and evaluated geometric face winding, and allfour transformed1x1 bounds.

Centered bounds are[-0.3859996795654297,-0.485249400138855,0] to[0.3859996795654297,0.4852507412433624,1.3200000524520874]. The existing producer `--verify` passed all72 actual cameras and allfour orientations; loaded bounds[0.11400030553340912,0.014750592410564423,0] to[0.8859996795654297,0.9852507710456848,1.3200000524520874]. All retained raw/evaluated geometric faces point outward. The independent audit computes polygon area vectors from actual world-space edges after modifiers. An initial shortcut using evaluated normal attributes flagged12 chair-seat faces; the edge-vector cross-check found0 inward faces. Weighted normals are not topology evidence, so **no inward-winding defect or topology reversal is proposed**. The Staff Room torus also invalidates a global-centroid convex assumption and is not mislabeled as faulty.

## Existing branch check and preservation

Fresh remote chair refs were inspected. `codex/chair-refinement-art-2026-09-24` is0bb7ad70f1d41e934d906e59ae9388050017d032; `codex/chair-plank-clarity-2026-09-27` is6db914860fd7bb1073a45052fb90d6472e2fdddc; `codex/oblique-cell-chair-dense-20260929` is0dac27c446f9fa7aaefe85faf54753c2e0eb1a9f. The old plank branch already models three seat boards and rivets; it must not be presented as a newly invented idea or duplicated as another densification task. Current accepted source16 is preserved. Proposed detail instead retains its exact broad-seat silhouette and adds structural connections beneath it; old source files/branches remain untouched.

## Proposed exact art lease

- New own `tooling/blender/refine-wooden-chair-angled-detail.py`.
- New own `tooling/blender/render-wooden-chair-detail-oblique.py` using the existing shared64ppt exporter without altering shared functions/default callbacks.
- New `assets/source/blender/furniture.chair.wooden.angled-detail.blend` and corresponding provenance.
- Existing `public/game-content/oblique-cell-chair.v1.json` and only its72 canonical chair PNGs.
- Existing `tooling/blender/render-wooden-chair-oblique.py`, only chair source tuple and chair-only verification dispatch.

Keep original16 raw vertices/polygon/material indices/material graphs/transforms/modifiers byte-fingerprinted, allfour original materials, existing1x1 identity/front-axis and measured target[.5,.5,.6600000262260437]. Add actual side/transverse frame stretchers, seat corner mounts/gussets and visible back rail retaining collars/fixings **inside existing bounds**. The original broad timber surfaces, colors, foot placement and silhouette remain intact. New assembly source will be independently reopened; every new physical part must have outward geometric normals.

Before future integration: paired actual Blender source views/all72 border inspection, two byte-identical72+descriptor exports, producer-only omitted brace/mount and camera/source dispatch RED controls with finally byte-exact restoration. Native proof later must reuse genuine individual q0 and rotated Reception q1 plus actual worker/SaveLoad and consumer-removal RED, preserving the accepted Classroom override and existing budgets. No renderer/core/HUD/mapping/registry/schema/CI changes are proposed. No acceptance beyond this read-only audit is claimed.
