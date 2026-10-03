# Second-touch room-template ownership: source diagnosis

2026-10-03, subjectf0d74f71e2922946877b1af1f5532d4d2c35f634.
[Issue2006](https://github.com/woogitsu/lockstate/issues/2006), isolated branch
codex/hud-template-chord-release-audit-20261003. Production unchanged at this
checkpoint. No browser/server/CI run.

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
