# Twin laundry washer concept, 2026-09-23

Original generated references:

- `washing-machine-multiview-v1.png`: the same two-bay institution-scale machine from overhead, front-left, front-right and rear. This is a design reference, not a game sprite.
- `washing-machine-overhead-v1.png`: a second concept resolving the camera problem: top access hatches preserve the two drum silhouettes under the game's straight-down orthographic view.

The final model is authored in `tooling/blender/create-environment-catalog.py` as collection `furniture.laundry.washing_machine.twin`, footprint 2×1. It uses a worn blue-grey enamel cabinet, paired ringed drum windows, muted teal laundry, a black north-side control rail, amber indicators, and bolted corners. The Blender render is the only published runtime art. The object draws on `object.washing-machine` placed by `washing-machine-brick`.

Generation prompts:

1. “Create an original four-view design reference sheet for one institutional front-loading washing machine, built for a polished overhead prison-management game. Show the same single machine in true orthographic top-down, front-left three-quarter, front-right three-quarter, and rear three-quarter views. Use two adjacent drum bays in one integrated cabinet, blue-grey enamel steel, dark circular glass, muted teal laundry, amber service controls, worn dimensional bevels. No characters, environment, UI, text, labels, logos, or existing game's assets.”
2. “Refine to a single straight-down orthographic original twin laundry washer, 2×1 horizontal footprint. Put two circular dark glass drum hatches into the top service deck so each is legible at 128×64 px, with nickel bezels, teal laundry, a black north-side control strip and paired tiny amber indicators. Worn slate blue-grey enamel steel, transparent isolated background, upper-left key light, no text or game assets.”

The reference is intentionally not copied pixel for pixel. The final geometry respects the existing north-up render, tile footprint and 6% transparent margin contract.
