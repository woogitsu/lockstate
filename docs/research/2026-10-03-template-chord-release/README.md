# Second-touch room-template ownership: scoped correction

2026-10-03, subjectf0d74f71e2922946877b1af1f5532d4d2c35f634.
[Issue2006](https://github.com/woogitsu/lockstate/issues/2006), isolated branch
codex/hud-template-chord-release-audit-20261003. No browser/server/CI run.

## Verified actual source and worker boundary

Actual main ghost-install body, installed registered RoomTemplateWorldBridge DOM
handlers, real RoomTemplateTool, actual preflight/quote ports, command sender and
initialized SimulationWorkerStateMachine execute. Phaser display/DOM are plumbing;
real Camera is used in World and real Scene camera APIs in Angled. No worker
verdict, construction command, session state or paid outcome is invented.

Primary touch7 down, non-primary touch8 down, touch8 up while7 remains down:
current bridge overwrites downPointer with8, then its real up dispatch commits
PlaceRoomTemplate. Both World/Angled, normal/mirrored quarterTurn1 Basic cell fail.
Real public snapshots show0 to18 construction orders and one new pending plan at
11,11. Treasury stays25,000: immediate debit/completion is not claimed.
`actual-touch-worker-snapshot4red28controls.log` retains those four exact packets
and snapshot counts. Original4 RED/28 GREEN; diagnostic strict types exit0.

WorldScene's second-finger construction cancellation and ObliqueWorldScene's
second-touch cancelGesture are established contracts; the independent bridge
has no counterpart. Scope granted for a bridge-only cancellation/ownership guard,
keeping selected plan armed and ordinary primary taps legal. Schema, copy, layout,
scene renderer, worker and touch-camera policy are unchanged.

## Rejected mouse candidate: not a producer regression

`original.log` and `invalid-per-button-pointerup-harness.log` are the initial
invalid per-button mouse PointerEvent injection:8 RED/16 legal controls. Native
Pointer Events do not generate overlapping down/up for chorded mouse buttons;
intermediate changes use pointermove. This was checked against the
[W3C Pointer Events recommendation,4.1.1.1](https://www.w3.org/TR/pointerevents3/#chorded-button-interactions).
Correct standard stream24/24 GREEN (`standard-chord24green.log`). No mouse-chord
Issue or correction is inferred from that rejected receipt. This is separate
from #2001's actual Phaser MouseEvents consumer.

The final32-case diagnostic includes those24 standard mouse/revision controls,
four genuine primary touch legal placements and four valid separate-touch-pointer
failures. Event shape follows touch Pointer Events (button0, independent ids,
isPrimary false for second touch). Native timing/isTrusted, implicit capture and
actual browser delivery still require ROOT's later real two-pointer acceptance.
Fresh all-state touch searches and full516/2001 are retained; no duplicate found.

## Correction and production negative

The registered bridge pointerdown now resets its press ownership and returns
when a non-primary touch arrives. It does not stand down the selected plan,
change preview geometry or send a worker command. Neither old finger release
can submit the abandoned gesture; a subsequent fresh primary touch still can.
Ordinary primary mouse/touch, standard mouse chords and rotation invalidation
keep their actual legal controls. Only this bridge guard changes production.

- Original:4 RED/28 legal GREEN, including exact actual worker snapshots.
- Corrected:`fixed32green.log`,32/32 GREEN.
- Remove only the unique second-touch guard from the corrected producer:
  `second-touch-guard-omission4red28controls.log`,same4 RED/28 legal GREEN.
- Finally restore the entire original corrected source byte for byte:
  `exact-restored32green.log`,32/32 GREEN; hash and exits in
  `mutation-restoration.json`.
- Five focused bridge/renderer/session/camera files:`focused-neighbors.log`,
  80/80 GREEN with maxWorkers2. Strict diagnostic types:`strict-final.log`,exit0.
  Both application/tools TypeScript and production client/worker build:
  `production-build.log`,exit0.

These are source/real-worker outcomes. Actual browser trust, implicit touch
capture and native touch ordering are pending ROOT acceptance. No native
result is inferred from unit event injection or a successful build.

## Prepared native acceptance: not run

`tests/browser/room-template-second-touch-ownership.spec.ts` declares two real
application cases, World/Angled at physical1920x1080 and accessibility UI100%.
Page zoom is not substituted for UI scale. Both select Basic cell with clockwise
quarterTurn1 through real controls and hold the actual simulation paused. Public
worker preflight/snapshot messages, unchanged tee commands and window native
pointer receipts are observed; input and worker state are never fabricated.

The valid CDP stream starts primary finger id202, adds id101 by touchMove while
202 remains active, then sends touchEnd with an EMPTY point list. The test must
observe two trusted canvas pointerdowns, a trusted non-primary pointerup with
the primary id still in the observed active set, then the primary pointerup.
It fails closed if native ordering/capture differs or cancellation occurs. The
whole CDP end command releases both fingers; no continued physical hold AFTER
that command is claimed. This probes the per-event second-release ownership
boundary without invalid touchEnd points or manual isTrusted events.

Protocol preparation follows installed Playwright CDP types and the actual
[Chromium touch dispatch implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/devtools/protocol/input_handler.cc):
active ids absent from the valid touchEnd empty set are released individually.
The lower secondary id is a fixture setup choice whose actual order must still
be proven by native receipts, not assumed to pass.

After that gesture, zero construction transmissions, identical actual orders/
pending plan/balance snapshot, armed28-square ghost and unchanged actual cost
are required. A fresh trusted primary press/release must then queue precisely
one rotated Cell at the current real accepted preflight origin, produce18
actual orders and one pending plan, preserve paused clock and treasury, and
stand down the ghost. Immediate debit and completed construction are not claimed.

Strict fixture types exit0 (`native-strict.log`); existing Playwright config
--list collects exactly2 cases (`native-list-only.log`) without launching a
browser/server. No matcher/config/production change accompanies preparation.
Actual native baseline/guard-negative/exact restoration remains ROOT's queued
acceptance. Source fix receipt was added to
[Issue2006](https://github.com/woogitsu/lockstate/issues/2006#issuecomment-5965860535).
