# Shower head physical connection and service fittings ? 2026-10-03

## Actual consumed source and retained history

Existing buildable `shower-head-brick`, object `object.shower-head`, default asset `fixture.shower.head`,1x1 authoritative footprint, actual Shower Room template consumer. The default toilet already has accepted dedicated physical Cell source; `object.sink` remains deliberately not buildable/no room-template consumer under#141. No new sink/buildable/registry decision is made here.

Fresh historical source audit read published `codex/shower-head-refine-2026-09-25` (`6eafe69faab56bacedcaf9ea08e897e843becb0a`) and aligned standalone `codex/shower-head-source-alignment-20261002` (`8c44f6d24dc90ce79b643c023c47df0c0c5b75ed`). Its existing authored43 parts already include the head shell,21 nozzle jets, rolled toroidal ring, colored service valve caps, diffuser, wall plate and arm. They are retained rather than recreated. Original source `assets/source/blender/fixture.shower.head.blend`, SHA256 `ac0cbe6a3673dd8db19c76375ddeb3d6f23d0cab6aa2e56b298ad8a8e70806fe`, remains byte-identical. Ten original materials/complete node graphs/modifiers/positions and all43 raw vertex/topology/polygon-material/evaluated-vertex bytes stay unchanged.

Original1432 nondegenerate geometric polygons plus24 existing zero-area BEVEL clamp faces =1456 evaluated polygons. The two thin retained bevel pieces `Inset blue-grey face` and `Worn raised plate rim` each keep exact zero-area indices `[26,27,30,31,36,37,42,43,49,50,52,53]`. These are preserved, not erased. The rolled ring is nonconvex: comparing its inner faces with the whole solid centroid produces192 false inward indications. Actual geometric-edge audit relative to its medial tube circle and independently positive signed volume proves its outward surfaces. No original winding defect or reversal is claimed.

## Concrete physical gap and actual new Blender geometry

The original arm undersideZ `1.0049999952316284` and bright coupling topZ `0.9210000038146973` have a vertical gap `0.08399999141693115` atX0/Y?0.075. The new actual outlet stem spansZ `0.9210000038146973` to `1.0369999408721924`, connecting that assembly. Further actual geometry adds two locking collars/four fixing bolts, two wall-side bearing clips with footplates/fixings, and service-valve retaining collars/stems/bar grips/fixing heads. Existing colored marks/nozzle rings remain.21 new parts plus43 retained =64 meshes,4210 evaluated polygons:4186 nondegenerate outward plus the24 original zeros. All new parts are solid with positive independent signed volume and zero new degenerates.

New source `assets/source/blender/fixture.shower.head.angled-detail.blend` SHA256 `0a375563958f382d6b1d8dde1a6252ace7ed3883f4994a78d040361a65397ea1`. `reopened-source-audit.json` independently reopens original/new source and compares all43 retained raw data/modifiers/matrices/evaluated bytes, then derives geometric normals and signed volume for all64 actual parts. Dedicated loaded guard checks complete original ten material graphs, exact full64 authored mesh set and evaluated hashes, retained43 invariants, bounds/occupied rotations and actual camera transforms.

Before/after centered fullbounds exactly `[-0.35499998927116394,-0.49999961256980896,0.7099999785423279]` to `[0.35499998927116394,0.47500067949295044,1.1399999856948853]`. This is an elevated wall fixture; the accepted positive minimumZ is preserved. Existing unitXY min-corner translation(.5,.5,0),1x1 footprint, target `[.5,.5,.925]`,256px/4tile camera=64ppt are unchanged. Both historical production and new dedicated actual native Blender verification passed72 cameras/allfour occupied orientations.

Four actual old/new yaw0/60/180/300, elevation40 comparison renders were opened. New grips and connection fittings are visible; accepted original head/nozzle/enamel appearance remains. This is source inspection, not gameplay screenshot acceptance. Pinned Blender5.2.1LTS upstream ID `9e2066aef7ef`, executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`.

## Current boundary

First coherent source/provenance/dedicated guard checkpoint. Canonical72 integration/repeat, meaningful source/loaded/dispatch/decoded-consumer RED controls with byte-exact restoration, TypeScript/full client build follow. Native player Build/SaveLoad and consumed hardware inspection remain root's serial queue. No browser/server, gameplay/schema/copy or workflow changes. No hosted acceptance claim.
