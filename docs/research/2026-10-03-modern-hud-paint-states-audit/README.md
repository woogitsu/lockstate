# Modern paint state audit

## Historical proof coverage correction

Actual isolated base: `d5703d45672f9020322516c5355e32a9c8b3d830`.
The unchanged foundation coverage test returned 1 RED /3 GREEN. It found two
uncovered modules: the historical hierarchy `source-proof.mjs` and the earlier
public-View `guard-preservation.mjs`. The original raw output is retained.

This branch renames only its hierarchy proof to an inert `.mjs.txt` attachment,
preserving its bytes and documenting deliberate manual replay/cleanup. Root
owns the separate guard attachment repair; this branch does not duplicate it.
No gate or typecheck exemption is changed. This correction concerns evidence
packaging, not the CSS values or the already recorded producer RED/restoration.

## State audit scope

Both light/dark token maps and actual hover/focus/selected/unavailable producer
rules are being read. The real template modal uses 20 ordinary card buttons,
outside the new `.ui-action` resting paint rule. Its generic button rule still
gives every unselected card the same sunken surface and outer form border.
Any correction stays paint-only and preserves the actual selected control,
native focus and all 20 card dimensions. Browser/build acceptance is pending;
neither is executed by this source audit.
