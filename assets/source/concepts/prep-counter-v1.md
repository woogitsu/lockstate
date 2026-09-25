# Kitchen preparation counter concept, 2026-09-23

`prep-counter-multiview-v1.png` is an original generated four-view reference: the same two-tile institutional counter seen overhead and from three oblique sides. It is not the shipped sprite.

The 2×1 Blender collection `furniture.kitchen.prep_counter` translates the visible details into deterministic geometry: brushed steel cabinet and rear hygiene lip, walnut cutting board with two cuts, and three separate steel ingredient wells colored red, green and pale cream. The board reuses a project-owned packed wood texture with a darker Blender material. The final render alone is published to `public/game-content/source-art/` and mapped to `object.prep-counter` placed by `prep-counter-brick`.

Generation prompt: “Create a polished original four-view design reference sheet for one institutional prison-kitchen food preparation counter, horizontal 2×1 footprint, the same object in direct overhead and three oblique views. Use a thick steel worktop, large warm walnut cutting board with broad knife marks, three recessed steel ingredient trays with red tomato, green leaves and pale root vegetable, raised rear lip and sturdy cabinet drawers. Soft northwest key light; keep the board and three trays legible at 128×64 pixels. Clean background, no people, floor, text, labels, logos or existing game's artwork.”

The modeling keeps the established north-up orthographic camera and transparent margin; the generated concept informs shapes and materials but its pixels are never used in the runtime sprite.

2026-09-25 refinement: the shipped overhead image made all three ingredient pans read as the same 2×4 grid of coloured buttons in the 1920×1080 kitchen. The Blender source now gives the red pan rounded tomato pieces, the green pan overlapping narrow leaves with light central veins, and the pale pan smaller cut roots, each with irregular spacing that exposes the dark tray. The steel counter, walnut board, 2×1 footprint, lighting and published art ID remain the same. The screenshot test in `tests/browser/environment-art.spec.ts` exercises the counter in the furnished Full HD kitchen and samples one of the newly exposed tray gaps.
