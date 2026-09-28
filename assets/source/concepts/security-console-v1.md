# Security surveillance console concept, 2026-09-23

`security-console-multiview-v1.png` is an original generated reference for the same 2×1 control station in overhead and three oblique views. `../textures/security-console-cctv-v1.png` is an original generated muted-teal hallway feed packed into the three Blender monitor materials. Neither image is used as a finished sprite.

The Blender source collection `furniture.security.surveillance_console` has a blue-grey steel enclosure, three raised monitor hoods that remain visible under the game's vertical camera, CCTV screens, a tactile keyboard, paired joysticks, status lights and guarded red switch. The render is published to `public/game-content/source-art/` and mapped to the existing buildable `security-console-brick` / `object.security-console`.

Prompts:

1. “Generate an original four-view reference sheet of one institutional prison surveillance console, horizontal 2×1 footprint, the same object in orthographic overhead and three oblique views. Three monitor hoods across the north half, one large central screen and two smaller screens, with dark teal camera imagery. South half has keyboard, paired control sticks, amber and teal buttons, guarded red switch. Robust powder-coated steel, soft northwest light, readable at 128×64 px. No people, room, text, labels, logos, UI overlay, or existing game artwork.”
2. “Generate one monochrome teal CCTV display texture: an empty fictional institutional corridor with barred doorways and ceiling lights, strong central perspective, deep dark teal and luminous muted cyan, subtle monitor noise, readable at 70×45 px. No people, screen frame, UI overlay, numbers, labels or text.”

The source scene packs the screen texture and keeps the established north-up orthographic render, 2×1 aspect and transparent margin. Only Blender output is published as runtime art.
