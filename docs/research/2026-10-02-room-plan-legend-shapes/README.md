# Selected room-plan legend shapes

## Scope and finding

At source base `1f01d1a8cf`, the selected plan drew grouped fixture rectangles, but the Furniture legend retained `hud-template__tile--object` and its 50% border radius. The legend therefore described the old individual dots. The existing door legend also lacked the clearance bar now shown by the actual selected diagram.

The correction reuses the fixture style for the Furniture swatch, with aspect ratio 2 in the existing 0.9rem swatch width. Door swatches reuse the same bar pseudo-element as the selected diagram and card miniatures. Wall, Door and Furniture text and decorative accessibility remain unchanged. Dialog dimensions and approved fit policy are unchanged.

## Obtained source evidence

Actual dialog DOM listener test: before correction 1 failed / 8 passed; correction plus design-token gate 85 passed. Production mutation restoring the old object class: 1 failed / 8 passed. Restored source plus token gate: 85 passed. TypeScript and production Cloudflare artifact build passed.

## Runtime evidence status

`tests/browser/room-template-legend.spec.ts` is prepared for actual angled Full HD startup and Four-cell row selection. It checks furniture aspect/radius, door-bar clearance, existing labels, eight selected fixtures and bounded dialog geometry. First shape run passed 1/1 in 4.5 seconds; restoring the old object-circle class failed 1/1, then restored source passed 1/1 in 4.5 seconds. All runs used one worker and the unchanged 60-second test / 10-second assertion budgets.

Opening the actual screenshot exposed a missed CSS cascade: the generic tile background replaced fixture ink in the legend. The swatch was a rectangle but pale like a floor. Commit `bb2e978795` adds the explicit semantic fixture background and an actual computed-color equality assertion against the selected diagram. Full visual acceptance remains pending until this correction is run, mutated and inspected.

## Weakest claim

Source proof establishes the shared symbol contract; recognition at actual display size still needs the runtime screenshot. A clipped or indistinguishable swatch in that screenshot would require correction before this scope is complete.
