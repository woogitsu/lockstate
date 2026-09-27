# Square construction and room templates

Status: implementation brief from the owner's 2026-09-27 playtest. Tracks #1585 and #1586.

## What the player must see

The current wall tool chooses a tile **edge** from the pointer position. A drag
through tile centres may put the southern or eastern wall one tile inside the
area the player meant to enclose (#886). Its ghost is a narrow strip while the
completed wall has a raised face. The owner's screenshot demonstrates that
these two readings of one gesture are still confusing even with an edge hint.

The new Build tool chooses whole squares. Its preview marks every occupied
square with an opaque ground footprint and draws the proposed raised face
separately. The footprint, collision check, cost, queued order and finished
structure must agree on the same square set. Dragging along the middle of a
row must never silently switch the wall to the next row. A door replaces one
wall square and has an obvious opening on the ground plane.

## Player flow

1. Choose a wall, door, object, or a ready room in a single Build catalogue.
2. Move the pointer to position a snapped, full-size ghost. The ghost shows
   every occupied tile, doors, furniture, room floor and any collision.
3. Inspect dimensions, materials, cost and conflicts beside the ghost. Invalid
   placement cannot be submitted.
4. Click to commit one plan. The same plan supplies all orders, zoning and
   undo. There is one result for the gesture; a partial prefab is a refusal.
5. Save and reload without changing the plan's footprint.

The first templates are a minimum valid Cell, its mirror and a row of cells
facing a shared corridor. Their dimensions follow the current room catalogue's
2×3 minimum interior and real 1×2 bed and 1×1 toilet footprints. The source
references illustrate modular repetition, door rhythm and visible contents;
the art, names and UI are original to Lockstate.

## Geometry and compatibility

The existing `topEdge`/`leftEdge` layers remain the reader for historical
walls. They cannot simply be reinterpreted as occupied tiles: an edge between
two old floor squares has no unique owner square, and choosing either would
move structures inside old cells. New square walls therefore need a separately
versioned tile occupancy representation and a projection that can draw both
forms in one loaded prison. New placement may join an old edge wall visually,
but never rewrites it on load. A later explicit conversion tool could offer a
preview and undo; loading a save must not silently convert geometry.

Topology, pathfinding, construction collision, ownership and removal must use
the union of square obstacles and legacy edges. A door square is a traversable
opening with a door state, not an opaque wall and not an ordinary furniture
object. The tile occupancy representation is authoritative in the simulation;
Phaser receives a projection and never infers construction state from pixels.

Template identity is versioned content. A committed template expands into
ordinary deterministic construction and zoning records; it does not require a
template object to remain live in the simulation. Any save-format addition
needs a compatibility rule before it ships. Object placement and room
requirements continue to use their existing catalogue identifiers.

## Delivery slices

- Establish square occupancy and a red-then-green geometry contract for a
  single wall square and door square. Prove collision, passage, removal and
  restored old edge walls.
- Replace edge picking and ghost in the player-facing Build path. Prove that
  previewed and finished footprints are identical at normal zoom and Full HD.
- Add the Cell and mirrored Cell template definitions, then a shared-corridor
  row. Validate all parts before committing one plan, and test the resulting
  Cell requirements and save/reload in a real browser.
- Rebuild the Build catalogue around the plan flow and visually review the
  1920×1080 state, including an empty prison and a populated cell block.

Do not ship a full-square ghost over an edge-based order: that would replace
the current ambiguity with a false promise about which squares are occupied.
