# Kitchen non-slip floor v1

The playable `floor.kitchen.nonslip` frame comes from the Blender 5.2
`environment.mvp.catalog.blend` collection of the same name. It is a 1 × 1
orthographic overhead tile with a matte blue-grey washable surface, a recessed
joint on its east and south edges, and quiet embedded mineral grit. Geometry
reaches all four frame edges; the renderer uses zero transparent margin.

The frame is assigned only to `room.kitchen`. Canteens and other zoned rooms
keep institutional linoleum. The room-name text remains the primary identity
channel, and the existing per-room tint still overlays the tile at its
calibrated alpha. At the game's 64 px tile size, the kitchen reads cooler than
the pale green canteen without crowding furniture or labels.

The 256 × 256 render's measured mean is RGB (173.310, 181.373, 185.388).
`appearance-zoning-tint-legibility.test.ts` decodes the published PNG and
checks that measurement, so a later material revision cannot silently leave
the tint calibration aimed at an older floor.
