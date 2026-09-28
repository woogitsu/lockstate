# Cutaway cell doorway in the real app

All screenshots are 1920 × 1080 captures from `tests/browser/oblique-cell-material-app-fullhd.spec.ts` with a saved furnished cell loaded through the app. The before image is from the pre-fix #1757 run. The after images are from this branch after regenerating both cutaway door pose catalogs with Blender 5.2.1.

| Pose | Evidence |
| --- | --- |
| −45° yaw, 25° elevation before | [Detached low leaf](before-yaw-minus45-elev25-fullhd.png) |
| −45° yaw, 25° elevation after | [Framed opening](after-yaw-minus45-elev25-fullhd.png) |
| 0° yaw, 45° elevation after | [Framed opening](after-yaw0-elev45-fullhd.png) |
| +45° yaw, 65° elevation after | [Framed opening](after-yaw45-elev65-fullhd.png) |

The real app test went red on the old cutaway frame: the low timber leaf covered 394 pixels in the isolated doorway region at −45°/25° (limit <20). It passed after the Blender cutaway render omitted the leaf and added a shallow threshold between the existing jambs. The full-height door still uses its original leaf asset. The test also exercised IndexedDB save/load and checked the furnished cell across all three poses without page errors.
