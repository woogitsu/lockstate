# Compact camera controls checkpoint

The existing adjustable-camera port retains four actions and their authored
localized labels. The HUD now uses its existing bordered icon-button primitive:
labels stay in screen-reader text and pointer titles, glyphs are aria-hidden,
and every button retains the existing tap-target and focus treatment. Left and
right use the existing opposed arrow glyphs; elevation uses opposed chevrons.
The group remains between zoom and minimap in the same approved shell slot.

No camera input, remapping, pose mathematics, actor feed, art registry, save state
or player-facing text was changed. The compact single row uses existing spacing
and sizing tokens rather than a new palette or smaller hit targets.

Executed: original text-only controls fail the focused icon/label contract.
The replacement gives 98 passing cases across actual control construction and
activation, design tokens, orchestration boundaries and HUD messages. Inverting
all callback directions makes the control test fail; restoring passes the same
98 cases. TypeScript passes after narrowing the browser test's indexed label.

A production-artifact Full HD case is prepared: it checks the compact bounds,
all four reachable 44px targets, sequential keyboard focus/Enter and actual
canvas changes for each action above the minimap. It has not run yet because
the browser lease is assigned to another agent. This checkpoint makes no
runtime screenshot or measured compact-dimension claim.
