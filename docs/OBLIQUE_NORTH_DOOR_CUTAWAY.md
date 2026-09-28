# North cell door cutaway

The north-edge door `door.interior.open.full` was the only open cell door
without a cutaway art variant. Selecting a cell lowered its north wall, but
the door fell back to a geometric prism instead of the same Blender material
used by the surrounding wall and west-facing door.

`door.interior.open.cutaway` composes the existing open door leaf with the
existing low frame in Blender 5.2.1. It publishes 24 yaw × 3 elevation poses,
512×512 transparent images, 64 nominal pixels per tile and pivot `(256,256)`.
The scene selects this asset only when its existing occlusion rule lowers a
north-edge door; the logical wall, save data, and camera projection are
unchanged. The source `.blend` files are unchanged because both components
already existed and this module changes their render composition.

Two complete rerenders produced the same manifest SHA-256:
`e678010db0624b455f9157ad043880a4e97709c00af300d5943e09b92e007e82`.
The registry contract failed before publication because the module was absent,
then passed 2/2 after publication. Art determinism tests passed 4/4 with one
skipped; TypeScript projects passed. A targeted Phaser scene test used its real
render feed at 1920×1080 and passed at yaw -45°, 0°, and 45° (one worker, no
asset errors). Screenshots are `docs/evidence/oblique-north-door-cutaway/`
`yaw-45.png`, `yaw0.png`, and `yaw45.png`. The low walnut leaf is most legible
at yaw 45°; at yaw 0° it is almost edge-on, as is the matching full-height
leaf. In each view the door posts and leaf follow the lowered wall rather
than reverting to a gray prism.
