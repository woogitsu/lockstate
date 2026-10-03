# Reception context integration and explicit Blender guards

## Scope and durable plan

See PLAN.md. Fresh own WT from 3d454c2872fb6b777cd9afc2cc13c286bf8346ef. Own wrappers + Reception art/registry/context/tests only. No root checkout, UI/navigation/save/layout/renderer/browser/server changes.

## Actual guard RED -> source fix GREEN

The existing tests/determinism/art-pipeline-determinism.test.ts gate explicitly requires pipeline_common.require_blender_version() in EVERY discovered Blender entry point. On the actual unchanged baseline it failed and named exactly render-classroom-teacher-desk-oblique.py and render-garbage-room-bin-oblique.py. Both wrappers already loaded indirectly guarded source/exporter modules; their missing direct assertion was still a real existing contract failure.

Each now bootstraps the canonical pipeline_common module and calls require_blender_version before loading source builder or shared exporter. Its existing bpy.app.version check pins major/minor5.2 and preserves the existing deliberate mismatch investigation policy; no independent or diverging version rule.

Actual previous-source RED and fixed existing static suite GREEN logs are retained. Four static cases passed; the live scene half skipped because Blender is not on PATH. Separately, BOTH real wrapper --verify invocations passed in installed Blender5.2.1LTS, serial, --threads1, no render calls. They verified genuine source semantic contacts and all72 canonical cameras without changing assets.

before-art-byte-hashes.json independently records both complete sets: source .blend, provenance, descriptor and72 actual PNG each. guard-source-fix-receipt.json verifies all150 files remained byte-for-byte identical after the source fix and real Blender checks. No new source metadata, pixels, renders, camera/sample/palette/scale/footprint settings.

## Reception integration

Pending own source commit import and literal context-selector RED/fix GREEN. Native calibration and consumer screenshots remain root's later serial boundary; no native result is claimed here.
