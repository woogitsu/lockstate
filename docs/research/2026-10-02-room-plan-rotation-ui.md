# Room-plan rotation controls and occupied-rectangle preview

Measured from the approved base `4df4429595`, in an isolated UI worktree.
The owner decision is recorded in the adjustable-camera design record's
2026-10-02 owner-decisions section. This record covers the UI producer and
preview; authoritative construction and persistence have a separate owner.

## UI and request contract

The native selector offers clockwise 0°, 90°, 180° and 270°. Its English label
is “Room plan rotation (clockwise)”; Polish is “Obrót planu pomieszczenia
(w prawo)”. These new authored labels and the clarified mirror labels are in
the generated player-string inventory. Mirror applies before rotation.
Selection survives choosing another plan. Mouse and native ArrowDown operate
the selector; the existing modal input context retains the keyboard.

The tool uses the shared oriented geometry adapter at the requested world
origin. Selected diagrams and world ghosts consume complete rotated fixture
rectangles. Both preflight and placement requests carry optional quarterTurns
0..3, omitting zero for the existing default. Changing orientation invalidates
a pending placement query. The explicit HUD intent route preserves the field.

Adding a separate control row initially made the Full HD catalogue scroll.
Grouping rotation and mirror and using the existing 8px paragraph spacing
keeps its full cards, fixture sizes and map action visible. The measured
four-cell-row dialog had matching scroll/client height 971px after this fix.

## Evidence obtained

- Before implementation, the two new tool unit cases failed: the requested
  quarter turn still returned 4 × 7, and rotation did not change the revision.
- UI tool, miniature, world bridge and asynchronous dialog suites: 48/48 green.
- Actual browser at 1920 × 1080: existing 20-plan card/fixture comparison,
  oblique application selector and native keyboard/reachability, captured
  mirrored request harness and existing coordinates flow: 4/4 green, 48.3s.
- The real application case checks the four-cell row changing from 7 × 16 to
  16 × 7 and back by keyboard, with the map action visible and no scrolling.
  The harness checks the complete bed changing to 2 × 1, exact grid placement,
  visible/hit-testable 44px control and request quarterTurns3 plus mirrorXtrue.
- Deliberately forcing the tool's preview orientation to zero, excluding
  orientation from revision changes and reverting fixture dimensions to their
  authored values made all three new unit cases red (3 failed, 26 passed).
  Both new browser cases also failed (14.6s / 10.4s), at unchanged dimensions.
- Exact restoration returned 48/48 unit cases and 2/2 new browser cases green
  (13.0s overall, 6.4s application / 0.689s harness).
- Both TypeScript projects and the named production build passed.

Browser execution uses the repository browser server and actual application
entry for the application case; the captured-request case uses its explicit
UI harness. No network-change retry or increased timeout was used.

## Acceptance boundary

This verifies controls, preview rectangles, request production, stale-query
invalidation and Full HD reachability. Actual rotated worker completion,
Save/Load, Undo/Redo and renderer-facing fixture pixels require the combined
gameplay and rendering changes and are assigned to the integrator. This is
not a claim of their completion, full-suite CI, deployment or player research.
The window-capture Escape interaction for armed room plans remains a separate
reproduction candidate; this rotation scope does not change its event handling.
