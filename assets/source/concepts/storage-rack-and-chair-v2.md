# Storage rack and chair concept references (2026-09-23)

After the owner said the earlier prop art looked too plain, these four-view
references were generated from the owner-supplied Prison Architect screenshots
and the accepted dining-table concept. They are modelling references, not
runtime sprites. The final sprites remain Blender renders with the same 1×1
tile footprints and catalog checks.

- `storage-rack-multiview-v2.png`: open worn-wood shelving with bolted steel
  corner caps, three distinct shelves, visible dark gaps and a few boxes and
  folded bundles. The model uses the project's packed worn wood and steel
  textures; shelves are stepped in depth and height so the game's straight-down
  camera can still show all three.
- `wooden-chair-multiview-v2.png`: steel frame, wooden seat and two separated
  back slats. The seat uses the packed `../textures/wooden-chair-seat-v1.png`
  material image. The model keeps its back and front feet distinct at 64 px.

The built-in image generator produced each concept from a prompt requesting
the same object in straight top-down, three-quarter, front and side views,
consistent materials and a readable small-scale silhouette. The chair-seat
material prompt requested a square, flat diffuse swatch of worn honey-brown
wood with broad planks, fine grain, rubbed edges and restrained scratches,
without furniture outlines, shadows or text. The generated image bytes are
fixed source inputs packed into the `.blend`; prompts alone cannot reproduce
them.
