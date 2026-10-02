# Selected room-plan fixture diagram

Source inspection on feature root 30451a8250 and the previously saved real Full HD card screenshot showed an inconsistency: grouped furniture rectangles in catalogue cards, but separate circles on every occupied square in the selected large diagram. One two-square bed looked like two dots.

The selected diagram now reuses the canonical fixture rectangle projection. Existing tiles retain their original order and count for worker blocked-square indexing; overlays are appended after those tiles with explicit grid coordinates. A blocked square inside furniture also outlines its containing overlay so the furniture cannot conceal worker collision feedback. Door bars reuse the card shape, with the selected diagram's existing floor token. No names, text, fit policy, camera, save fields or modal dimensions change.

## Obtained source evidence

Focused actual dialog-listener DOM case confirms a whole 1 by 2 bed, two fixtures in the basic cell, all 28 tile positions, decorative overlay accessibility, normal and mirrored geometry, and worker blocked-square feedback on both tile and full fixture.

Production mutation omitting the fixture's blocked outline: one failure and three passes. Restoring it gives 80 dialog/token tests green. TypeScript build green.

Prepared actual Full HD browser assertions cover the selected 112-square row, eight fixture rectangles, elongated bed in both mirror orientations, doorway clearance and actual map arming. Runtime execution remains pending the coordinator's browser lease.
