# Shallow-angle room-plan picking

The player can rotate and lower the production oblique camera while placing a room. We checked that its projected ground square and the authoritative worker command agree at an intermediate pose rather than only at quarter turns.

## Evidence

- `tests/unit/oblique-projection.test.ts` covers interior points of ground squares at yaw 37°, 143°, 217°, and 323° and elevation 20°, 25°, and 65°, including tiles adjacent to map and chunk boundaries. Seven focused tests passed. Changing the production inverse projection's elevation denominator from sine to cosine made three tests fail; restoring it returned seven green.
- `tests/browser/oblique-low-angle-picking.spec.ts` uses the actual Full HD game at 1920×1080. HUD camera buttons set yaw 30° and elevation 25°; the player selects the Basic cell plan and points at the unobstructed central playfield. The ghost's origin square contains the cursor, and the actual `PlaceRoomTemplate` worker command names the square independently calculated from the camera transform. One browser test passed in 16.3 seconds. [Production screenshot](low-angle-ghost-fullhd.png).
- An initial test point near the upper playfield activated the approved fit-and-pan behavior, which intentionally freezes the original room origin while moving its preview away from the cursor. A cursor-inside-origin assertion is invalid in that mode. The final test uses the central playfield, where the small plan needs no fit. This was a test assumption, not evidence of a game defect.

This result verifies one full room placement at a shallow intermediate angle. It does not establish every map border or large-plan fit case; the unit grid and existing fit tests cover those separately.
