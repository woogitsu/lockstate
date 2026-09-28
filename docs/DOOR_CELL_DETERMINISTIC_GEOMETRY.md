# Stable sphere topology in the door and cell study

The door hardware and the cell-study actor head previously used Blender's UV-sphere operator. Its face ordering can vary across calls. Both now use `pipeline_common.uv_sphere_mesh` with explicit vertex and face order. The box primitives remain unchanged because the measured unstable path and the repository gate concern UV and ico spheres.

The door source and dependent renders/manifests were rebuilt with Blender 5.2.1. The visible geometry is equivalent: comparing decoded RGBA pixels against the previous committed render, the 10 cell-study images changed in 532 of 9,216,000 pixels; the 22 Full HD door-study images changed in 587 of 45,619,200 pixels. The greatest difference in one frame was 95 pixels. The isolated runtime door changed in one pixel at yaw 0°/elevation 25°; the other eight poses retained their existing content hashes. Existing content-addressed PNGs are retained for previously published URLs.

The manifests carry the SHA-256 of the committed `.blend` files and updated PNGs. The cell-study PNG and manifest hashes are stable on a repeated render. Re-saving `.blend` itself changes its file SHA, even when the model is identical; the repository's live determinism gate compares scene fingerprints rather than `.blend` bytes. The pinned Blender live gate passed 5/5 tests, including two independently built scene fingerprints. The door/cell art contract and oblique registry tests also pass.

As a mutation check, restoring the door's UV-sphere operator in a temporary working copy made the unchanged static determinism test fail and identify `build-interior-door-leaf.py`. Restoring the fixed code made that gate green again.
