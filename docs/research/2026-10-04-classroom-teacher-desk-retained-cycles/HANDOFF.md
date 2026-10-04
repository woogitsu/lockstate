# Retained Classroom teacher desk: modern shader handoff

Base `adb8ff9b67231fe2f6b42beac41dd394f7d1bd72`. First source/sample commit `e0bbf11e4d4fc53f0a8752e78733f7aec815e1cc`.

Existing `room.classroom` / `object.desk` ? accepted `furniture.classroom.teacher-desk`, unchanged registry/context. Current descriptor: `public/game-content/oblique-furniture-classroom-teacher-desk.v1.json`.

| Pin | SHA256 |
| --- | --- |
| Source `assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend` | `a879bba0f04a4f8b08a66fb9e607d1d815a7a6c2a8f7cb84c1d20c7c0d26d376` |
| Descriptor normalized LF bytes | `2c24ed7819e3b96d97d34b9c75949df743e375cbc6b871ea285dabb925920c20` |
| Source60/e40 | `5c8ee6a0fc927377c5e6ea80f92444764d0ba794a25ddd14acafeec79dfa25e7` |
| Source300/e40 | `27c4af4320b7376cbabf43fb4f61b13735197f4e0f3b11fbfe06b03be1f5a4a8` |
| Immutable original133-part source | `c1dd80d253667f8e1bca5b17371b183ec18b5a292bebdf9fd2062e85b01d55ff` |

133 raw parts/55 genuine BVH contacts/2x1 occupied geometry/canonical anchor, camera and pivot retained. No added geometry. All six original shader graphs had default gray BaseRGBA and.5 roughness; dedicated source repairs exactly BaseRGBA and Roughness from existing explicitly authored diffuse/roughness properties. All other inputs, nodes, links and shader Metallic0 remain exact. Original literal-gray soft source and genuine reopened two-pose comparison remain separate history.

Selected soft profile: Cycles CPU1,64 samples,seed0,no adaptive sampling/no denoising,AgX. No shared lighting/profile/palette files changed. Actual72 export72.8690s;4 exact repeats3.9441s;8 real RED/exactrestores11,385 files;12 focused suites49G/1optionalPATHskip;both strict typesG. Existing public kernel q0/q1 Classroom purchase/wholeV10 roundtrip2G unchanged.

## Production commands

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --threads 1 --python-exit-code 1 --python tooling/blender/render-classroom-teacher-desk-cycles.py -- --verify
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --threads 1 --python-exit-code 1 --python tooling/blender/render-classroom-teacher-desk-cycles.py -- --verify-exports
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --threads 1 --python-exit-code 1 --python tooling/blender/render-classroom-teacher-desk-cycles.py -- --repeat-four
& 'C:\Users\matma\AppData\Local\Programs\Python\Python314\python.exe' docs/research/2026-10-04-classroom-teacher-desk-retained-cycles/verify-production-controls.py
```

## Exact native handoff, pending root

Source60/e40 path: `/assets/environment/oblique/furniture.classroom.teacher-desk-yaw+60-elev40.5c8ee6a0fc92.png`. Existing actual native fixture `tests/fixtures/native-classroom-desk-plan.ts` / `CLASSROOM_ART` still carries original source/frame pins. Root owns its later pin correction and genuine built-client run; this branch does not modify any native helper/fixture/config.

Public Classroom at(4,4),7x7 shell,5x5 interior. Separately paid130 desk remains orientation0: q0 anchor(8,5),whole tiles(8,5)/(9,5); q1 anchor(5,8),whole tiles(5,8)/(6,8). Existing native canonical world60/e40 selects source60/e40 for both desks; room-owned student chairs retain their original rotations/assets. No inserted template desk or synthetic gameplay owner is added.

Root must inspect the actual same completed Classroom before/after whole paused SaveLoad and real HTTP/Blob decode. No native/build/browser result is claimed here. All root/Medicine/Delivery surfaces remain outside this branch.
