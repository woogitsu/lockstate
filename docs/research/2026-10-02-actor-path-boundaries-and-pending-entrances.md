# Actor path boundaries and later furniture at pending entrances

## Actor continuity audit

Starting from published `c4a6d4f895`, an isolated offline probe admitted one
prisoner, hired one guard and began each population's real east-then-north
locomotion route. After each of five advances it captured the session,
round-tripped it through JSON, restored it and recaptured the state for
`actorsFromSnapshot`. An independent wire reader over
`encodeRenderActorsKeyframe` supplied the live continuous positions. Both were
also compared with these literal expectations:

| State | Prisoner position | Guard position | Saved facing |
| --- | --- | --- | --- |
| Halfway east | (6.5, 6) | (2.5, 2) | east |
| At the turn | (7, 6) | (3, 2) | north |
| Halfway north | (7, 5.5) | (3, 1.5) | north |
| Arrived | (7, 5) | (3, 1) | north |
| Standing after arrival | (7, 5) | (3, 1) | north |

The probe passed all comparisons, including zero snapshot velocity. It found
no additional corner or arrival defect, so no speculative actor change was
made. This is an offline snapshot/live-wire comparison, not browser evidence.

## Chosen existing issue: #1700

The live issue describes furniture ordered later onto a pending Cell's outside
door approach. Its older implementation is absent from the requested base and
the integration source inspected for this task. The actual command boundary
accepted a later chair in each normal/mirrored orientation; a desk with its
second tile on the south approach was also accepted. Nine regression cases
failed before the fix. No duplicate issue was created.

Checkpoint `f896e62634` restores the pending approach reader to object placement
and derives the outward doorway vector in the plan's current orientation. The
northern bank of a four-cell row retains its opposite facing. Every footprint
tile is checked before a furniture order exists. No save or command field is
added, and no scene or UI file changes.

The nine cases passed, including real `PlaceObject` commands before and after
JSON Save/Load, no added furniture orders, an intact pending Cell, the desk's
second tile and a legal neighbouring placement. Both TypeScript targets passed.
Suppressing the production runtime wiring made all nine cases fail again.
Exact restoration was verified with SHA256
`73FADFC3CA991F73693C1E0CC525DFFE15BB76DE2657A25AC43041D4B7C4DF7B`.
The restored entrance, room-session and redo suites passed 65 tests. Sixteen
existing rotated Canteen/four-cell-row save/history/completion cases passed,
checking that valid authored fixture construction still finishes.

## Limits

The art agent's intermittent Canteen progress guard is a separate observation;
this task has no obstruction evidence connecting it to #1700. No browser,
workflow edit, CI polling or merge was performed. The inherited documentation
limitations of the starting checkpoint remain as recorded in the earlier
paused-position evidence; this record claims only the obtained checks above.
The optional documentation-claims scan passed 14 cases and timed out in its
unrelated input-adapter scan at the unchanged five-second guard. That exact
case then passed alone in 168 ms with unchanged code and guard; no full
documentation-suite pass is claimed from that isolated rerun.
