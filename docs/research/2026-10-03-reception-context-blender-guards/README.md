# Reception context integration and explicit Blender guards

## Scope and durable plan

See PLAN.md. Fresh own WT from 3d454c2872fb6b777cd9afc2cc13c286bf8346ef. Own wrappers + Reception art/registry/context/tests only. No root checkout, UI/navigation/save/layout/renderer/browser/server changes.

## Actual guard RED -> source fix GREEN

The existing tests/determinism/art-pipeline-determinism.test.ts gate explicitly requires pipeline_common.require_blender_version() in EVERY discovered Blender entry point. On the actual unchanged baseline it failed and named exactly render-classroom-teacher-desk-oblique.py and render-garbage-room-bin-oblique.py. Both wrappers already loaded indirectly guarded source/exporter modules; their missing direct assertion was still a real existing contract failure.

Each now bootstraps the canonical pipeline_common module and calls require_blender_version before loading source builder or shared exporter. Its existing bpy.app.version check pins major/minor5.2 and preserves the existing deliberate mismatch investigation policy; no independent or diverging version rule.

Actual previous-source RED and fixed existing static suite GREEN logs are retained. Four static cases passed; the live scene half skipped because Blender is not on PATH. Separately, BOTH real wrapper --verify invocations passed in installed Blender5.2.1LTS, serial, --threads1, no render calls. They verified genuine source semantic contacts and all72 canonical cameras without changing assets.

before-art-byte-hashes.json independently records both complete sets: source .blend, provenance, descriptor and72 actual PNG each. guard-source-fix-receipt.json verifies all150 files remained byte-for-byte identical after the source fix and real Blender checks. No new source metadata, pixels, renders, camera/sample/palette/scale/footprint settings.

## Reception integration

Requested source commits fb5201ecd58a86e6a8f8e7a244055289b628dd24 and e2c7c5d4b96b8bb853a712c8511a5a6f1a811e1d were cherry-picked into the own checkout. The model import's research-index conflict was resolved by retaining EVERY current root row and adding only the new Reception record. No historical root indexing was reverted. The imported Reception export wrapper had the identical missing direct guard: actual static contract RED log retained, then the same canonical helper assertion added. Its model/source/metadata/72PNG remain exact.

The production runtime now has one registry entry furniture.reception.waiting-armchair -> /game-content/oblique-furniture-reception-waiting-armchair.v1.json and one ROOM_VISUAL_VARIANTS block: room.reception/object.chair -> this asset. No global chair alias, other room, Reception desk, palette, footprint, price, save/layout rule or renderer implementation changed.

New oblique-reception-chair-context.test.ts exercises actual projectObliqueWorldFrame for BOTH literal purchased chair identities in public template q0 and q1: q0(5,6)/(7,7), orientation0; q1(7,5)/(6,7), orientation1. Camera60 for q0 / -30+90 for q1, elevation40, selects the same true exported canonical source60/e40 PNG and validates its bytes. Published owner rows/room rectangles remain unchanged. Planned/building/outside/absent/other-room chairs retain generic art; Classroom retains school-chair; Reception desk and bin retain previous art. Existing Classroom and Garbage context tests are also GREEN.

Actual previous selector and registry tests:3RED/4controls (both Reception projections selected generic chair; registry entry absent). After source fix:7GREEN. Then two repeatable real production negatives via tooling/research/prove-reception-chair-context.py:

| Actual production mutation | RED | Legal controls still GREEN | Exact restored |
| --- | --- | --- | --- |
| Omit Reception-only context selector block | Both q0/q1 cases,2RED | 5 | 7GREEN |
| Omit actual Reception registry entry | Runtime registry case,1RED | 6 | 7GREEN |

Both production files restored byte-for-byte in finally. The receipt records225 protected art files: three source/provenance/descriptors plus216PNG. They remain byte-identical after mutations, fresh tests and genuine Reception Blender --verify. That invocation passed60meshes/16triangle-interior contacts/all72camera poses/four original occupied turns on Blender5.2.1LTS, --threads1, without rendering. Final focused pack55GREEN/1live scene skip across7files and TypeScript project/tools check GREEN. The live scene determinism test skipped because Blender is not on PATH; real installed Blender wrapper checks are separate obtained evidence.

## Root handoff and limits

Native calibration and consumer screenshots remain root's later serial boundary; no native result is claimed here. Registry integration makes the descriptor discoverable; only completed ObjectChair wholly inside authoritative RoomReception selects it. Generic and Classroom context behavior remains covered by real projection controls.

The previously published public route stays on branch codex/reception-armchair-native-prep-20261003: commits4ae802d1156d748e33ac624389d631259a29f205 then48b72c2f51bbe4dd2d6e21b4624cb1ec8cf6bf1d. It uses public Room plans q0/q1 plus whole paused Save/Load, actual PNG response bodies/decoder and source60/e40. After Loaded it checks public Pause aria-pressed=true + exact whole worker snapshot equality, without currentClock broadcast dependence. Its unchanged60s/expect10s/workers1/retries0 native run and separate BOTH-chair visual calibration remain pending root/delivery lease. This integration does not import that recipe automatically or launch its server.

Source SHA25612cd91c54feb1d35603752eb7efe5c6245be190d77aa31d6e6b81121ea18457d. Frame /assets/environment/oblique/furniture.reception.waiting-armchair-yaw+60-elev40.4e6ee8fdb156.png SHA2564e6ee8fdb156be06a9d023f8806d90aede0b12552d048dcdba383c5f68b4cb0d. Existing genuine model72render/provenance/contact proof is linked in ../2026-10-03-reception-waiting-armchair/README.md.
