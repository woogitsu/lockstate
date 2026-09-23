# Dining table concept and material sources (2026-09-23)

The owner supplied three screenshots of Prison Architect as style references and
asked for multiview concepts before modelling. The four-view sheet
`dining-table-multiview-v2.png` was generated with Codex's built-in image
generator; it is a reference, not a runtime sprite. The Blender collection
`furniture.dining.table.wooden` models its continuous wooden top, bolted steel
frame and three fixed seats. The three seats match the simulation's dining
capacity. Its footprint remains 3×2 tiles.

The generated material swatches `../textures/dining-table-wood-v1.png` and
`../textures/dining-table-steel-v1.png` are fixed source inputs packed into
`../blender/environment.mvp.catalog.blend`. Their pixels do not bypass the
Blender rendering, catalog hashing or sprite atlas. The prompts cannot
reproduce those image bytes; the committed images make the Blender render
reproducible.

## Four-view concept prompt

> Use the three owner screenshots only as visual-style references: rich,
> readable, slightly gritty top-down prison management game environment art,
> hand-painted texture variation, coherent material depth and shadows,
> restrained institutional palette. Design one attractive 3-by-2-tile canteen
> dining table seating exactly three people: robust wood/laminate tabletop on
> a steel frame, three fixed round stools on one long side, believable worn
> edges and subtle surface detail, clean large-scale silhouette. Show the
> exact same prop in four arranged views: large straight orthographic top-down,
> three-quarter overhead, front and end. Neutral background. No people, UI,
> captions, logos or extra objects. Keep it legible around 192×128 pixels.

## Material prompts

Wood: flat, straight-down diffuse swatch of the concept's warm muted
honey-brown institutional wood, natural lengthwise grain, subtle planks,
restrained worn edges, irregular scratches, a faint cup ring and soft stains;
no perspective, frame, stools, lighting or text.

Steel: square diffuse swatch of worn institutional brushed steel, medium dark
desaturated grey with subtle uneven patina, tiny scratches and small tarnish
spots; no object silhouette, reflection, perspective or text.
