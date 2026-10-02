# Accepted room-plan receipt across renderer replacement

Date: 2026-10-03. Isolated baseline `0a661e96825a67aea106f5f2712cceb2db4f64cf`.
No browser/server launch. Art/root owns the exclusive native lease.

## Confirmed source result

A genuine bridge pointerdown/up starts actual RoomTemplateTool.placeAt; hold the
placement-port promise pending, replace World with Angled (or reverse), then
resolve the accepted placement. The shared same-revision tool remains armed.
The disposed bridge returns before processing accepted completion. In normal
placement the same existing callback stands the tool down; renderer replacement
should not lose that unchanged accepted intent.

`ui-room-plan-renderer-placement-receipt.test.ts` executes the actual unchanged
main deactivate/changed callback bodies, read with unique source markers,
actual LiveRendererSelection, RoomTemplateTool and installed WorldBridge
pointer listeners. DOM/scene hosting and asset preparation are destinations;
no copied lifecycle sequence is substituted. Preflight and placement port
promises are controlled for deterministic timing; no real worker/native claim.

**2 RED / 6 legal controls GREEN**,8 cases,579ms,maxWorkers2:

- Both renderer directions fail unchanged accepted-tool stand-down.
- Both normal accepted placements stand down.
- Both changed/rearmed Yard controls preserve the newer tool.
- Both delayed refused preflights preserve the unchanged tool and place nothing.

[Original producer receipt](original-renderer-receipt-red.log).
An initial test-only control typo read plan.templateId instead of its real id;
that setup failure was corrected and is not product evidence.

## Fresh duplicate review and granted scope

Fresh all-state room+renderer+placement and room+accepted+disarm searches read.
Full #1908 body and its only comment5938571082 describe accepted receipt loss
when a newer hover query supersedes it, on this same bridge producer. #1681
protects a new angled revision against old replies, and #1967 covers View
option navigation during preparation. This is an extension to existing #1908,
not a newly invented duplicate Issue.

Parent grants only room-template-world-bridge.ts accepted-result processing:
only matching same-revision armed shared-tool may stand down after old bridge
disposal. Changed/rearmed tools remain protected; disposed refusal/DOM updates
remain forbidden. No placement/coordinator/session/policy/copy/schema change.
Fix, actual production negative/exact restore and native acceptance are pending.
