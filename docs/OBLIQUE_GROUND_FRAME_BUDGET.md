# Oblique ground frame budget

The large saved-prison QA fixture has 400 loaded chunks, a 1,272,960-byte save,
and 1,317 visible ground `Phaser.Image` objects at yaw −45° in the Full HD
oblique preview. The former 512 × 512 transparent floor frames represented
345,243,648 quad pixels per repaint before viewport clipping. Their Blender
alpha union occupied only 98 × 88 pixels at most: all ten published `floor.*`
catalogs fit within the central 128 × 128 crop at every one of 24 yaw × three
elevation poses. Walls, doors, fixtures, furniture, and actors have different
height requirements and retain their 512 × 512 frames.

The floor Blender renderer now renders at 128 × 128 with orthographic scale 2
tiles, preserving exactly 64 pixels per tile and the world pivot at the image
center, now `(64,64)`. The scene already uses each catalog's `resolutionPx` and
`pivotPx`, so the projected placement is unchanged. For 1,317 images the
transparent quad budget becomes 21,577,728 pixels, one sixteenth as large.
The 720 current floor PNGs together fell from 8,177,596 to 3,559,630 bytes
(56.5% less transfer). Previously published hash-named files remain available.

Re-rendering all ten floor catalogs twice with Blender 5.2.1 produced identical
manifest SHA-256 values and frame paths. The registry contract verifies every
PNG's dimensions, SHA-256, pose, source hash, and pivot. A comparison with the
central 128 × 128 area of the old 512 × 512 images found 628 of 720 frames
pixel-identical; the others differ slightly from Blender sampling and lighting
at the image boundary. No source geometry or palette changed.

The image count still scales with the number of visible ground tiles. This
change reduces sprite area and texture transfer; it does not replace ground
sprites with a batched renderer or solve excessive repaint frequency.
