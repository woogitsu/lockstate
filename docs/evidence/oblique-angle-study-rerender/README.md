# Angle-study render migration

The original nine camera-study views under
[`assets/rendered/camera-study/baseline`](../../../assets/rendered/camera-study/baseline)
remain an archival comparison from commit `b72642c54152b18b7b24050cef2b43d0f6d9fc13`.
The **current** cell and door angle studies are regenerated with the current
`wall.interior.cutaway.blend` (`98b264c5…`) because they are designed to check
the active Blender wall kit. Their previous manifests referenced `9712dc72…`,
so simply updating the source hash would have mislabeled their older images.

Blender 5.2.1 produced both studies from the existing scripts, in order:

1. `tooling/blender/render-interior-cell-angle-study.py`: nine 1280 × 720
   views, one west-cutaway comparison, and an updated canonical `.blend`.
2. `tooling/blender/render-cell-door-angle-study.py`: nine 1920 × 1080
   furnished views and aperture masks, full/cutaway/solid-wall comparisons,
   and an updated door-study `.blend`.

Representative images: [west cutaway at −45°/25°](../../../assets/rendered/camera-study/cell-yaw-45-elev25-west-cutaway.png),
[door at 0°/45°](../../../assets/rendered/cell-door-angle-study/door-yaw+00-elev45.png),
[door cutaway at 0°/45°](../../../assets/rendered/cell-door-angle-study/door-yaw+00-elev45-frame-cutaway.png).
The full set and SHA-256 hashes are in each study's `manifest.json`.

The two pre-existing contract test files failed against the old manifests
before rerendering. They pass after rerendering and still verify each image
hash, camera grid, visible orange actor in the west cutaway, and clear door
aperture against a solid wall. No runtime art or gameplay file changed.
