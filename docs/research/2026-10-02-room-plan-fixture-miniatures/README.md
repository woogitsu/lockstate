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

## Source-scale and contrast audit

The existing min(8, 56 / height, 56 / width) cell size bounds every complete plan diagram by 56 pixels on each axis. The largest four-cell row is 16 by 7: 3.5 pixels per square and 56 by 24.5 overall. A single-square fixture retains 2.5 pixels after the one-pixel total inset; a two-square bed stays one 2.5 by 6 pixel rectangle. These are source dimensions, not a claim of runtime readability.

WCAG relative-luminance arithmetic over the shipped token ramps gives wall/floor, door/floor, fixture/floor ratios respectively 5.11, 5.58, 13.05 for light and 5.41, 9.49, 12.44 for dark. Door/wall is only 1.09 in light and 1.75 in dark. Miniature doors therefore use a short bar with floor-colored clearance above and below, retaining existing semantic tokens and the square footprint; shape distinguishes an entrance from a full wall without relying only on hue. The selected large preview and its worker collision highlighting are unchanged.

The native dialog retains width min(960px, viewport minus 40px), maximum height viewport minus 80px, and its existing overflow container. No HUD collision rectangle or simulation collision extent changes. Fixture overlays are decorative, aria-hidden through their miniature parent, and pointer-events none; the native card button remains the only selection target.
