# Room-plan miniature fixture grouping

## Existing behavior and chosen increment

Source review on feature root `3a8486754c` found all 20 plans already have canonical card diagrams. No second preview system is needed. The existing diagram renders one circle per occupied fixture square: a two-square bed looks like two individual marks despite Furniture counting one object.

Keep the existing four-column catalogue, card names, dimensions, furniture counts, native accessible names and roving keyboard contract. Keep the existing 56-pixel diagram envelope and modal height. Draw one inset rectangle per authored object across its full occupied footprint, using the existing object-footprint UI port and canonical instantiated plan. Structural squares and doorway colors retain their existing tokens. No player text, save format, placement command or quarter-turn control changes.

## Obtained source evidence

- All 20 canonical plans and the explicit bed rectangle: 21 unit cases green.
- Design-token gate with the miniature suite: 97 tests green.
- Production mutation changing every footprint to 1 by 1: 16 failures, 5 passes; restoring full footprints: 97 tests green.
- Module boundary gates: 46 tests green. TypeScript build green.

## Runtime verification pending

Prepared actual Full HD room-template-cards browser assertions for two distinct basic-cell fixtures, the elongated bed, three large-cell fixtures and eight four-cell-row fixtures. Browser execution and visual recognizability are pending the coordinator's exclusive browser lease. Unit results do not establish readable runtime miniatures.
