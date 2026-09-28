# Outdoor Yard ground v1

`yard-floor-multiview-v1.png` is an original four-view concept reference:
orthographic overhead, low oblique surface, thin earth section, and a 3 × 3
repeat. It guided a separate Blender model, not a crop or direct game sprite.
The generated-image tool did not expose a model-version identifier, so no
specific backend model is claimed.

`floor.yard.compacted-earth` is a 1 × 1 tile in
`environment.mvp.catalog.blend`: warm compacted earth, pale limestone grit,
and three sparse grass clusters. The base material is periodic across both
tile axes. All modeled grit and grass stay inset from the border, and the
render has zero transparent margin. The same pattern repeats per tile; the
result is outdoor ground across a
player-built Yard instead of the indoor linoleum previously drawn there.

The asset changes presentation only. `room.yard` remains the simulation's
outdoor, 8 × 8 minimum room with the same rules. Its tint is the owner-approved
ochre `0xddb35a` exception to ADR 0098; the other 17 room tints and ADR 0101
alpha calculation stay unchanged. No other room floor changes. The Yard label
remains the player-facing room identity; the ground material conveys that this
room is outdoors.
