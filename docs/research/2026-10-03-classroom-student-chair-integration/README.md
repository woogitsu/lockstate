# Classroom student-chair runtime integration

## Scope and actual first result

Isolated branch based on remote-verified `d4299094d6e1de2b08abbaaa81fd5d7fca0d6279`. Imported the published model chain e74ef8bfd1 / e967a84e91 / c94e722603 / 19cdef4dbe in order; all pre-existing research rows retained. Root owns native/browser/server, full release gates and combined Classroom acceptance; HUD owns command orientation and delivery owns projection audit.

Registered `furniture.classroom.student-chair` through its actual descriptor and replaced only the existing `room.classroom` / `object.chair` value. Old school-chair entry, authored source and 72 frames remain. Teacher desk, Reception, Garbage and global fallback mappings remain unchanged. No template, collision, pricing, palette, player copy or persistence change.

Actual first test run before the runtime fix: four failures / three passing controls. Literal q0/q1 projections selected `furniture.classroom.school-chair`, and the new registry entry was absent. After the fix: seven focused suites, 42 tests GREEN, including actual demand loading, original school source integrity, new source/decoded PNG integrity and adjacent contexts. Existing strict Classroom expectations now assert the published student model.

The new projection test consumes the existing literal public Classroom fixture: four ordinary purchased chair owners per q0/q1, same 5x5 interior, 1x1 occupied footprints. q0 camera60/e40 and q1 camera-30/e40 plus orientation1 both select exact source60/e40. It also checks planned/building fallback, all four boundaries, adjacent rooms, full extent refusal, preserved bookshelf/teacher desk and unchanged published owners/room rectangles.

## Exact assets for root

- Descriptor: `/game-content/oblique-furniture-classroom-student-chair.v1.json`
- Genuine source SHA256: `0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b`
- Exact source60/e40: `/assets/environment/oblique/furniture.classroom.student-chair-yaw+60-elev40.eb690a439214.png`
- PNG SHA256: `eb690a4392146a594fa1b692a2dc0b28b881820e541a7125f7f112c474c50260`
- Original authored school-chair source and all 72 renders are retained; see [actual source/render proof](../2026-10-03-classroom-student-writing-chair/README.md).

## Combined native camera handoff

The existing separately purchased teacher desk retains orientation0 in both room turns. The four template student chairs retain the room turn. Consequently the existing Teacher recipe's world60 camera on q1 selects a different canonical student frame than the student-only q1 projector proof:

| Room turn / world camera | Student source pose | Teacher source pose |
| --- | --- | --- |
| q0 / yaw60, elevation40 | 60/40 | 60/40 |
| q1 / yaw-30, elevation40 (obtained projector proof) | 60/40 | 330/40 |
| q1 / yaw60, elevation40 (existing Teacher native recipe) | 150/40 | 60/40 |

For the existing q1 Teacher recipe, the exact student frame is `/assets/environment/oblique/furniture.classroom.student-chair-yaw+150-elev40.1da832419795.png`, SHA256 `1da832419795e08cf8062eea139ddcc9e34bcbbdcf4e5b76ed74024326420479`. If root instead uses the obtained student projector camera yaw-30, the teacher frame is `/assets/environment/oblique/furniture.classroom.teacher-desk-yaw+330-elev40.ba2ac295ff47.png`, SHA256 `ba2ac295ff4768d9762e183e909c773ca5e3b64ef2004a7f5382631c4ae1f565`. These are actual existing descriptor entries and file hashes; no native result or visual calibration is asserted. Keep the public template owners and ordinary desk orientation0.

## Pending boundary

Repeatable actual Classroom chair-entry omission: three failures / four passing controls. Actual student registry omission: one failure / six passing controls. Both production files restored byte for byte; seven fresh context tests GREEN. Protected 374 source/provenance/descriptor/360 PNG files are unchanged. Final focused gate: 46 GREEN / one optional live-Blender scene skipped because Blender is not on PATH; no live result claimed. Strict source/tools typecheck GREEN; local production build GREEN (initial shell lacked pnpm on PATH, recorded then corrected using the existing runtime). The integrated hash receipt captures actual Windows descriptor bytes and normalizedLF separately. No Blender process was present and none was started.

Native acceptance remains pending. No browser/server started, no Blender matrix repeated. Native per-chair body acceptance, combined Classroom teacher/student view, public paused Save/Load and production release gates remain root work; this report does not claim a native pass.
