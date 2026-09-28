# Matte shower-room ceramic v1

`shower-floor-multiview-v1.png` is an original four-view reference: overhead,
oblique surface, thin construction section, and a 3 × 3 repeated material.
The built-in image generator produced the reference; it did not expose a model
version, so no specific backend model is claimed. The image is guidance for a
separate Blender model and is never cut into a game sprite.

The built-in generator prompt was: “Create ONE original four-panel concept
sheet for a top-down prison-management simulation game's shower-room floor,
as a visual reference for a Blender model. Strict 2x2 grid of panels without
captions, logos, UI, people or objects. Panel 1: straight orthographic
overhead of one 1x1 square matte ceramic floor module, cool blue-gray
porcelain mosaic, thin charcoal grout grid, a few subtle wet scuffs and
mineral speckles; sober and legible at 64 pixels. Panel 2: low oblique view
showing slightly recessed grout and matte rough tile surface, no standing
water, no reflective gloss. Panel 3: thin section view showing ceramic slab
and grout depth, understated construction illustration. Panel 4: overhead
3x3 repeat of the same module demonstrating tile continuity and quiet rhythm,
with no prominent repeating stains. Polished original production concept
art, muted institutional palette, realistic material, warm neutral studio
light, clean plain background. Inspired by the clarity and density of a
classic top-down prison management game, but do not copy existing game assets
or UI.”

`floor.shower.ceramic` is a one-game-tile Blender module containing four small,
matte blue-grey ceramic squares, thin recessed charcoal grout, and restrained
mineral speckles. The grout meets at tile borders with a zero-margin render.
The four slightly varied squares avoid a flat block while staying quiet beneath
the room label and shower fixtures. The motif repeats per game tile.

The render is selected only for `room.shower-room`. The nearby `room.laundry`
keeps institutional linoleum; room identity and existing zoning-tint colours
stay as authored. No simulation rule or object placement changes.
