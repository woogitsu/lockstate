# Paused Load preserves an actor's saved position between tiles

## Starting evidence

Issues #1913 and #1930 were both open when read on 2026-10-02. Their original
production corrections are already ancestors of the published integration
base `e44ac6f66e`: wall ordering in `42a1416a86` and saved heading projection
in `91be012df6`. Neither correction is an ancestor of the main head fetched
for this investigation, `ddb4a4f72e`. This work does not duplicate those fixes.

The heading correction leaves a separate reproducible gap: the snapshot actor
feed reads the last crossed integer tile but ignores the existing saved walk's
sub-tile progress. A prisoner walking north from (6, 6), saved at progress
128/256, appears at (6, 6) after paused Load instead of (6, 5.5). A guard has
the same defect. The live locomotion reader includes that offset already.
Fresh duplicate searches and the bodies of #1922, #1927 and #1930 confirmed
their distinct scopes. The new position defect is tracked as #1964.

## Correction and obtained checks

Checkpoint `bf99cf8407` projects the existing saved walk offsets into both
populations' continuous render positions. It does not construct or advance a
simulation store. Velocity remains zero, saved facing remains intact, and
older saves without in-flight state keep their integer positions.

Four new cases use real admitted/hired actors and real locomotion, capture the
half-leg progress, round-trip the bundle through JSON, restore the runtime and
deliver its recaptured snapshot through the paused `SimulationSnapshotFeed`.
North, east, south and west each failed before the correction. They check both
populations' exact positions and headings, zero velocity, and unchanged actor
positions after 30 seconds of render time. The full feed file passed 55/55.
Both application and tools TypeScript targets passed.

A deliberate production mutation suppressed the saved offset: all four new
cases failed, while the other 51 feed cases passed. Exact byte restoration was
verified against the saved source with SHA256
`475DDBC5D28A6C7938ED3C294A3FF1049604066ABFDE78F767D5AC15E60D29AE`.
The restored feed, oblique actor projection and actor sprite suites passed
78 tests in three files.

## Scope

No save format, simulation behavior, workflow or scene implementation changed.
No browser, CI polling or merge was performed. This evidence establishes the
paused worker-snapshot projection; it does not claim new actual browser pixels
or a production deployment.

The three documentation suites returned 26 passing tests and two failures in
this checkout, identically with its own record removed and the index restored
to the exact base. The inherited failures are two missing research-index rows
(artifact suite routing and Infirmary alignment) and the Infirmary record's
unresolved upstream citation. This scoped checkpoint does not modify those
concurrent records or claim the whole documentation gate is green.
