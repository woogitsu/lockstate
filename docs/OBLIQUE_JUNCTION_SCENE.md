# Oblique wall junction selection in the game scene

The scene composes visual modules from the real projected edge IDs while
leaving simulation edges intact. At a vertex `(cx, cy)`, a north edge
`north-edge:(cx-1):cy` can meet a west edge above or below it. One below
selects the north-east corner, one above selects the south-east corner, and
both select one west-facing T module before considering either corner. Door
edges are excluded, preserving the opening.

The module is drawn only after its pose-specific frame is loaded. Until then,
the scene keeps the projected individual edges and streams the nearest frame.
A selected near wall uses the cutaway variant. The module anchor is
`groundToScreen({x:(cx+0.11)*64, y:(cy+0.11)*64}, camera)` with the catalog's
`(256,256)` pixel pivot.

The [Full HD browser captures](evidence/oblique-junction-scene/) show the
actual `ObliqueWorldScene` at yaw −45°, 0°, and +45° with one NE corner, one
SE corner, and one T. The targeted Playwright test checked exactly one of each
texture and zero asset load errors at each pose (one worker, one test passed).
The projector contract test used a real `SparseWorld` snapshot; its serialization
remained identical after visual selection and after restore. It also verified
that a door edge is never consumed by a wall junction.

The browser fixture is a small cell, not a large saved prison. Broader Save/Load
playtesting still belongs to the integration gate before merging this stack.
