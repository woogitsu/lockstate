# Numeric room-plan status revision ? #1934

`createRoomTemplatePreview` already guards delayed quote and inspect results,
but its numeric placement completion did not. Choosing a new card while the
old operation was pending could make the new card report blocked, submitted or
unavailable from the old operation. The fix reuses the existing refresh revision
for the result and catch paths; no new strings, command or save state is added.

Focused DOM tests construct the actual dialog and RoomTemplateTool. Each test
starts the numeric placement, holds its preflight/accepted-placement/failing-
placement promise, selects Yard, waits for the replacement clear verdict, then
releases the previous operation. Focus, enabled state and the replacement
availability status are asserted after the actual async listener chain finishes.

Executed: original listener gives 3 red cases. Fixed listener gives 25 green
cases across dialog-status, tool, roving and UI orchestration suites. Removing
both production revision guards makes the same 3 cases fail again; restoring
the source returns all 25 cases to green. TypeScript passes.

A Full HD angled production-artifact test with a delayed actual worker query is
committed, but has not run at this checkpoint. The single browser lease is held
by another agent. No browser result is claimed here.
