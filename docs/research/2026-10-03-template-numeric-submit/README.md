# Accepted numeric plan retains original map press ownership

2026-10-03; subject7c9a16a10cc02eb09869a4aad7fbef2884434a65. Original diagnostic subject; source-only genuine callback/worker reproduction followed by handler-only correction. Native pending ROOT; no browser/server started.

## Actual reproduction

Actual main map-ghost adapter, RoomTemplateWorldBridge, RoomTemplateTool, createRoomTemplatePreview, both Scene classes, real Phaser World camera and actual worker preflight/commands/state machine.

1. Selectq1 BasicCell and arm through actual Place on map callback; physical primary event shape button0/buttons1 starts a map press at stationary FullHD cursor900,460. Independently computed retained origin is World11,11 or Angled10,11.
2. Open actual Room plans, keep the same selection/q1. Use public coordinate input callbacks for X20/Y5; invoke actual Place room plan button click listener (keyboard activation's native default is not fabricated).
3. Actual worker accepts q1 plan20,5: one command and18queued shell orders. Numeric success does not stand down shared map tool or change its revision.
4. Close plans, then deliver owning primary release button0/buttons0 with no new canvas pointerdown. Existing bridge still owns old selection/press and sends a second q1 command at original map origin. Actual worker snapshots contain both pending identities and36shell orders.

| Renderer | Before old map release | After old map release | Worker orders |
| --- | --- | --- | --- |
| World | q1Cell20,5 | q1Cell20,5 and11,11 | 36 |
| Angled | q1Cell20,5 | q1Cell20,5 and10,11 | 36 |

Two regression cases RED (armed=true after numeric acceptance and actual2commands instead of1), four legal controls GREEN: leave dialog unchanged, or make numeric31,31 footprint unowned/disabled and do not activate it. The rightful original map release still submits one original18order plan. Both disjoint accepted plans fit real owned32x32land; no invented mouse chord, copied verdict or snapshot mutation.

## Existing contract and deduplication

Fresh complete body/comments of #1908 say an accepted command disarms its original tool; later extension protects matching accepted completion across renderer disposal while preserving newly selected/rearmed tool. Numeric accepted callback is a separate missing consumer of that same contract. #1934 only guards stale numeric status; #2002 busy/session; #2004 construction cancellation; #2001 middle-release; #2006 secondtouch. No new input/layout/copy/save rule is proposed. Reuse/extension of #1908 proposed to coordinator rather than duplicate Issue.

Scoped correction proposal: only numeric accepted handler in src/ui/hud/room-template-preview.ts. Capture tool revision before awaiting placeAt; when result.ok, same revision and tool still armed, standDown that accepted original owner. Do this before local dialog status early return so edited numeric presentation cannot strand accepted ownership. Preserve new selected/rearmed tool, rejected preflight, numeric submit lock and local status guards. Main/bridge/Scene stay unchanged. Coordinator granted this handler-only lease. Corrected numeric acceptance now captures owningSelection and stands down only result.ok/same-revision/still-armed tool before local presentation guard. Main/bridge/Scene unchanged. Initial correction6/6GREEN; expanded delayed/newer/live-session controls and final producer evidence are recorded below.

## Evidence limits

This is actual source callback and authoritative worker proof, not trusted native pointer/key acceptance. Minimal display/DOM plumbing and static empty presentation feed do not manufacture tool/command/worker state. Both actual preflights independently evaluate worker occupancy. Public numeric input/click handlers represent browser default activation but do not prove actual Enter behavior. Native legal held primary plus keyboard-open/coordinates/Enter/close/release is queued only after ROOT confirms scope.

Actual command and pending/order receipts are in actual-commands.jsonl, full initial2RED/4GREEN in initial.log. Queue acceptance is not an upfront1530debit: future furniture is deferred; these are36actual shell orders/two plans, not a claim of completed/paid40orders. Initial diagnostic predates the correction; subsequent actual negatives and byte-restorations are recorded below.

## Expanded source controls checkpoint

Corrected expanded fixtures: 22/22 GREEN (14 ownership cases plus eight real New/Load session controls); strict fixture types exit0. Delayed accepted preflight after local X20?21 edit and close still submits original20,5 exactly once and consumes its original armed map owner. Reopen recomputes blocked21,5 from actual worker occupancy. New Yard selection or public re-arm before the old preflight returns preserves the newer tool, with zero submitted commands because the real tool revision guard rejects that old operation. Eight New/Load ? same/new selection ? renderer controls use actual host/channel/session state and original15s request timeout: retired replies cannot disarm the current public arm or mutate current snapshots.

Two additional actual refusal races first queue a real20,5 plan between numeric readiness and activation, then delay the worker's now-blocked preflight response until dialog close. Numeric activation submits nothing and preserves the original valid map press; its rightful release submits only that map plan. These controls have two actual commands/36 shell orders including the independent occupied-plan setup, rather than reporting them as duplicate numeric acceptance.

Expanded first run had12 observer-only failures: assertions read plan.templateId while actual rotated geometry uses plan.id. The raw expanded-initial.log is preserved; fixing these two observer reads produced20/20 GREEN before adding the refusal controls. These are separate from the original two genuine product failures. Native interaction remains unrun. Producer omission/byte-restoration follows this pushed frozen checkpoint.

## Supported asynchronous completion controls

Four additional World/Angled ? newer Yard selection / same Cell re-arm controls are26/26 GREEN with all earlier cases. They exercise the actual RoomTemplateTool placement-port Promise contract: a real worker accepts the original20,5 command/18 shell orders first; only the public port's Promise completion is held until a public selection/re-arm. The original accepted result then must not consume the newer armed revision. Current main publishes its command immediately rather than awaiting a worker acknowledgement, so this is a supported asynchronous interface completion boundary, not a claim of native ACK timing. Exact fixture types exit0.

The earlier unique accepted standDown omission on frozen5bed2d9d8689789d3660771d30a227ea35736d87 yielded4RED/18legalGREEN; restored original producer bytes (SHA25625f90ad451f43d4a62ab22fa2bc8f2cc6c70799499994669b728cd279400f2bb) yielded22/22GREEN. Neighboring dialog status, keyboard consumers, numeric session readiness, session preflight and tool suites34/34GREEN; app/tools types and production build exit0. Both independent negatives from this expanded frozen checkpoint are completed below.

## Final producer proof

Frozen subject1b1681fb712936532d9b5e3f2c2a402e7cf318cd (verify commit identity in the accompanying restoration receipt): two sequential unique numeric accepted-handler mutations on detached HEAD, exact original bytes restored in each finally, and returned to the branch. No mutant was committed or pushed.

| Control | Actual source result | Exact restoration |
| --- | --- | --- |
| Omit accepted map-owner standDown | 4RED/22legalGREEN: both accepted numeric releases buy a second plan; both edited-close accepted owners stay armed | 26/26GREEN |
| Omit original selection revision guard | 4RED/22legalGREEN: accepted async-port completion incorrectly stands down newer Yard/same-Cell re-arm | 26/26GREEN |

Source SHA256 before/after each mutation:25f90ad451f43d4a62ab22fa2bc8f2cc6c70799499994669b728cd279400f2bb. Full logs: accepted-owner-omission.log, selection-guard-omission.log and their -restored.log files; final-producer-restore.json records the exact frozen SHA and byte equality. Earlier22-case negative/restoration remains archived separately. Two own fixtures26GREEN; five neighboring suites34GREEN; strict own fixture types, application/types tools and production build exit0. All runs use maxWorkers2 and existing request budgets; no browser/server process was launched.

## Delivery boundaries

Permanent production diff is only the numeric accepted callback in src/ui/hud/room-template-preview.ts: remember tool.revision across await; consume result.ok only for the same still-armed owner before the local presentation revision early return. Refusals, actual replaced-session replies/timeouts, selection changes/re-arms and newly accepted asynchronous port completion controls remain protected. Main, bridge, scenes, copy, protocol and persistence are unchanged.

Native trusted held-primary plus dialog keyboard activation/close/release is still pending ROOT acceptance. Source pipeline proof does not assert trusted browser default events, real pixels, completed furniture, material expenditure or paid room completion. Supported async placement-port cases deliberately do not claim current main awaits worker ACK. This corrects existing Issue1908, rather than adding a new policy/duplicate Issue.
