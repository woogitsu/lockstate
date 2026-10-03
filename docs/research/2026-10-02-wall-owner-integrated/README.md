# Integrated square walls and approved object ownership

Root ran the actual built client at 1920×1080 with one browser worker. The
combined source build was `9ceae1ba24`, worker `worker-Ce4CF4WT.js` (436.94 kB),
SHA-256 `2274be8c10fb4ecaf017ae09e7198dec73d4b28fdf493421a7e4dcca33058174`.
Later commits add test evidence, documentation and the existing artifact/source
suite partition; they do not replace simulation or model production bytes.

## Actual player acceptance

[Terminal output](native-nine-cases.txt): **9/9 passed in 4.2 minutes** with the
existing budgets and assertions. Capacity construction precedes Kitchen; both
normal and rotated Kitchen plans finish, and the player saves and loads them.
The three actual stove, fridge and prep-counter objects each retain a unique,
nonempty `sourceOrderId` matching their completed order's anchor and orientation.
The complete before/after ownership tuples are equal after Load.

- [Kitchen q0 ownership](kitchen-q0-ownership.json),
  [actual loaded Full HD](kitchen-q0-loaded-fullhd.png).
- [Kitchen q1 ownership](kitchen-q1-ownership.json),
  [actual loaded Full HD](kitchen-q1-loaded-fullhd.png).

Root opened both loaded screenshots. Authored prep-detail pixels remain visible
at q0 (149/122 worktop/detail samples) and q1 (238/151), with the same counts after
Load. This is actual V8 player Save/Load coverage, separate from upstream unit
migration and negative controls.

## Whole-square wall measurements

Every case places exactly one Brick wall order at (20,20), with `footprint:
square`, and allocates exactly two bricks. All six actual authored masonry
measurements have **zero pixels outside the ground span and zero outside the
authored projected hull**, retaining the existing classifier and tolerance.

| Wall | Yaw/elevation | Native result | Measurement | Screenshot |
| --- | --- | --- | --- | --- |
| Full | −45/45 | 18.9 s, pass | [JSON](full-yaw-45-elev45.json) | [PNG](full-yaw-45-elev45.png) |
| Full | 45/65 | 21.6 s, pass | [JSON](full-yaw45-elev65.json) | [PNG](full-yaw45-elev65.png) |
| Full | 45/80 | 22.2 s, pass | [JSON](full-yaw45-elev80.json) | [PNG](full-yaw45-elev80.png) |
| Low | −45/45 | 19.0 s, pass | [JSON](low-yaw-45-elev45.json) | [PNG](low-yaw-45-elev45.png) |
| Low | 45/65 | 21.1 s, pass | [JSON](low-yaw45-elev65.json) | [PNG](low-yaw45-elev65.png) |
| Low | 45/80 | 23.6 s, pass | [JSON](low-yaw45-elev80.json) | [PNG](low-yaw45-elev80.png) |

The upstream [wall calibration record](../2026-10-02-native-square-wall-footprint/README.md)
retains genuine scale-only and anchor-only producer negatives plus exact
restoration. These new captures are from the combined ownership/Kitchen client,
not copies presented as a new run. Both TypeScript targets, production build,
80 focused integration cases and 26 documentation cases passed before this
evidence checkpoint. Scoped acceptance does not replace full exact-head CI;
neither this branch nor the earlier stacked candidates is released on production.
