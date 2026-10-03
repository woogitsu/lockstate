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
[Verified source extension](https://github.com/woogitsu/lockstate/issues/1908#issuecomment-5963107928)
was persisted and fetched with exact authored-body equality.

Parent grants only room-template-world-bridge.ts accepted-result processing:
only matching same-revision armed shared-tool may stand down after old bridge
disposal. Changed/rearmed tools remain protected; disposed refusal/DOM updates
remain forbidden. No placement/coordinator/session/policy/copy/schema change.
## Correction and exact producer proof

The matching selected revision/armed guard now precedes accepted completion
without a disposed presentation check. Accepted completion stands that shared
tool down; local presentation is cleared only if the bridge is live. Refusal
processing still explicitly requires a live bridge and current request.
No other production file changes.

Corrected **8/8 GREEN**,622ms. A production-only mutation restores disposed to
the unique accepted-result early return: **2 RED /6 legal controls GREEN**,
636ms. Finally restores exact corrected bytes; **8/8 GREEN**,629ms. Existing
bridge/tool/renderer-selection controls plus this regression **30/30 GREEN**,
4 files,787ms,maxWorkers2. App/tools TypeScript passes.

Restored whole bridge SHA256:
`814fa06ae54dd6476c2d73bd341a0e761608ecc7e5731dedeee5ea7035ad280b`.

- [Corrected source cases](renderer-receipt-fixed-green.log).
- [Actual disposed-producer negative](renderer-receipt-disposed-producer-red.log).
- [Exact byte-restored cases](renderer-receipt-byte-restored-green.log).
- [Neighboring controls](renderer-receipt-related-restored-green.log).
- [App/tools TypeScript](renderer-receipt-fixed-typecheck.log).

Native actual View change while genuine worker confirmation is held, both
renderer directions and changed-tool/refusal controls, remains queued behind
Art/root. This proof does not claim actual native option events, worker receipt,
browser pixels, hosted CI or deployed completion.


## Actual composition-root timing and extended producer proof

The actual main placement port calls commandSender.submit and resolves without
waiting for a worker command ACK. Therefore withholding only that ACK would
not reproduce the production race. Native reproduction must replace the
renderer while placeAt is awaiting its genuine worker preflight response.

The extended source test now additionally executes the exact unique main
async placement submission callback, unchanged, with a recorded submit
destination. Both renderer directions also hold the accepted preflight rather
than the placement port: release produces precisely the real callback's
PlaceRoomTemplate submission, then matching stand-down. New/rearmed revisions
before preflight completion submit no old command. Normal accepted preflight
still submits and stands down.

Final extended file **14/14 GREEN**,609ms. Same unique production disposed guard
mutation: **4 RED /10 legal controls GREEN**,576ms. Finally restores the same
exact bridge SHA256 above; **14/14 GREEN**,550ms. Related bridge/tool/renderer
suites **36/36 GREEN**,4 files,721ms,maxWorkers2. App/tools TypeScript passes.
The earlier8-case receipts remain retained as the separately obtained original
baseline and placement-port controls; they are not replaced with invented
native or expanded original counts.

- [Actual main submit callback controls](renderer-receipt-actual-submit-fixed-green.log).
- [Expanded actual producer negative](renderer-receipt-actual-submit-disposed-red.log).
- [Expanded exact restoration](renderer-receipt-actual-submit-restored-green.log).
- [Expanded neighboring suites](renderer-receipt-actual-submit-related-green.log).
- [App/tools TypeScript](renderer-receipt-actual-submit-typecheck.log).

## Queued native fixture

`tests/browser/room-template-renderer-preflight-receipt.spec.ts` prepares4 actual
FullHD100% cases: each renderer direction, unchanged cell and rearmed Yard.
It records a real worker preflight reply, temporarily withholds that exact
reply from normal app listeners, changes View with native Home/End, then
replays the unchanged real reply once. It generates no verdict or command.

Unchanged cases require one exact cell command, correlated real queued receipt,
and no new armed preview after real mouse re-entry. Rearmed controls require
clear complete64-square Yard preview, no old command, and ordinary map Escape
still canceling that tool. The actual pointer/preview origin, complete28-cell
squares and quote are checked before withholding. Refused completion remains
covered by the source controls; no native refused-preflight outcome is claimed.

The4-case native file compiles with app/tools TypeScript but has NOT run.
Native baseline/fixed/disposed-only negative/exact-restored proof remains
queued behind Art/root. No new configuration, timeout, retry, worker or copy.
