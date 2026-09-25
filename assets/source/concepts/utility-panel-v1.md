# Utility control panel concept, 2026-09-23

`utility-panel-multiview-v1.png` is an original generated four-view reference for one 1×1 electrical control cabinet: overhead, front-left, front-right, and rear. It is a Blender modeling target, never a shipped sprite.

The collection `furniture.utility.control_panel` models a waist-high blue-grey steel cabinet with a dark top control recess, six large cream breakers, two colored indicator lenses, a guarded red master switch, painted warning edge, bolts, lower access hatch and feet. The top components remain recognizable when the game's camera looks straight down at 64×64 px. The Blender render alone is published into the runtime catalog and mapped to `object.utility-panel` placed by `utility-panel-brick`.

Generation prompt: “Create an original polished four-view reference sheet of one 1×1 institutional electrical utility control kiosk. Show the same object orthographic overhead and from three oblique sides. Waist-high worn blue-grey steel, broad sloped top hatch with a dark inset, six chunky cream circuit breaker levers in two columns, guarded red switch, amber and teal indicators, yellow-black hazard accents, bolts and hinges. It must read at 64×64 px as electrical control equipment, not a generic locker. Soft northwest key light and southeast fill. No room, floor, characters, text, logos, UI overlay or copied game art.”

The Blender scene keeps the established north-up orthographic camera, exact 1×1 aspect and transparent margin.

## Breaker refinement, 2026-09-25

At Full HD, the six original cream caps still read as a keyboard. The same
four-view reference calls for breaker levers. Each switch now has a recessed
steel cradle, a dark rear pivot and a shorter raised cream handle. The 1×1
footprint, identifier, cabinet, lenses and guarded master switch are unchanged.
The visible dark gap behind a handle remains readable after the runtime atlas
reduces the source from 256 to 128 pixels.
