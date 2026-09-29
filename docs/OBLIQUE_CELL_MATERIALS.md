# Warm cell materials for the oblique renderer

The cell was difficult to distinguish from the cool grey corridor at normal
camera scale. The old canonical wall frame had an alpha-weighted red minus blue
channel balance of **−4.90**. The new Blender render measures **+26.58** for
the full wall, **+18.43** for the lowered wall and **+26.14** for the cell floor
at yaw 0° / elevation 45°. The values are a reproducible material contrast
check, not a judgement of the entire scene.

The wall source uses warm lime plaster with subtle procedural mineral variation,
muted sandstone coping, dark warm skirting and the existing thin panel joints.
Every wall and door variant retains its existing full-square pivot and 64 px
per tile camera grid. The cell floor now has its own Blender source rather than
modifying the shared environment catalog: corridor, canteen and terrain source
hashes therefore remain independent. Its seeded fine aggregate and seamless
periodic base remain in place with a warmer concrete palette.

The three scene screenshots use the production `ObliqueWorldScene` and a built
cell RenderFeed at 1920 × 1080. The application screenshot uses the actual
`/?oblique-preview=1` page. Its test imports a valid saved prison with completed
cell edge geometry through the UI, so the wall and floor shown on the canvas
are runtime-selected Blender frames rather than an isolated composition.

| View | Evidence |
| --- | --- |
| Real application, yaw −45° / elevation 45° | [Full HD](evidence/oblique-cell-materials/app-import-yaw-45.png) |
| Phaser scene, yaw −45° / elevation 25° | [Full HD](evidence/oblique-cell-materials/scene-yaw-45-elev25.png) |
| Phaser scene, yaw 0° / elevation 45° | [Full HD](evidence/oblique-cell-materials/scene-yaw0-elev45.png) |
| Phaser scene, yaw +45° / elevation 65° | [Full HD](evidence/oblique-cell-materials/scene-yaw45-elev65.png) |

The tall wall still hides some furniture from certain views. This material
batch leaves the established full/cutaway geometry and the camera's selection
rule intact; a geometry change needs a separate visual and occlusion test.
