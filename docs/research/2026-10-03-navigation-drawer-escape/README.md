# Navigation drawer Escape and armed Build — source diagnostic

Date: 2026-10-03. Baseline: `4b5e06b4d2` (published Laundry integration).
Surface: existing drawer keyboard ownership, without layout/copy/schema changes.

## VERIFIED source-level finding

The actual `createHudLayoutShell` navigation container registers an Escape
handler that prevents the default and closes its drawer. It does not stop
propagation. The actual angled scene registers its existing world `keydown`
handler on `window`; that handler receives the same Escape and calls the real
Build stand-down port. The existing Layout menu stops propagation and retains
the armed tool. Ordinary world Escape still correctly reaches stand-down.

The registered-handler diagnostic instantiates the production shell, production
layout geometry, and actual angled scene/keyboard adapter. DOM paint and Phaser
texture/resize primitives are stubbed; Node event delivery models bubbling order.
The supported 960×540 CSS layout at200% interface scale selects the drawer.
This is the layout viewport that the existing contract names for a FullHD screen
at200% page zoom. This source test does not establish actual browser zoom/rendering.

Obtained focused baseline: **1 red /2 green**,1.13s. The drawer closes, focus
returns to the trigger, then `armed` is false when it must survive. Controls:
ordinary world Escape stands the tool down; Layout menu Escape already consumes
the key and retains arming. See [baseline](registered-source-red.log).

## Nonduplicate and remaining proof

Fresh all-state searches for `drawer Escape` and `Layout Escape` were read.
The current drawer search also returns PRs #1444 and #1451: their existing
owner-approved rule explicitly closes with Escape and returns trigger focus.
Those records were read; the correction preserves that rule.
Issue[#1962](https://github.com/woogitsu/lockstate/issues/1962) covers the same
propagation cause for the Layout menu at FullHD UI200%. The new drawer boundary
was added in [comment5962484013](https://github.com/woogitsu/lockstate/issues/1962#issuecomment-5962484013),
explicitly labelled source proof with native acceptance pending. A fresh GET
verified the persisted comment body exactly; no duplicate Issue was opened.
Its current body and current comment collection were read before this proposal.
Issue#1479 covers keys changing semantic action across input contexts;#959 is
the earlier accepted world-Escape stand-down behavior. Neither is this drawer
event delivery gap. No new Issue was opened by this diagnostic.

The parent grants only `src/ui/hud/layout-shell.ts` for stopping propagation of
the Escape that closes an open drawer. A closed drawer must keep ordinary world
Escape and other keys; closing/focus restoration and wall/object/room tools must
remain functional. No drawer placement rule, copy, binding/schema, camera pose,
retained preview, or worker command changes are proposed.

## Corrected registered handlers and meaningful negative

The correction adds only `event.stopPropagation()` to the open navigation
Escape handler. Closing and focus restoration remain the existing code.
With the corrected producer, the drawer diagnostic and existing HUD geometry/
modal input cases pass **49/49**, with `--maxWorkers=2`. Application and tools
TypeScript checks passed.

Removing that exact added line from the actual producer gives **1 red /2 green**
again,3.54s: the drawer still closes and restores focus but the actual world
stand-down callback runs. The Layout menu and ordinary world Escape controls
stay green. See [producer removal](registered-producer-removal-red.log).
After byte-exact restoration, the same three focused files pass **49/49**,3.91s:
[restored result](registered-exact-restored-green.log). Restored source SHA256:
`4be29de2bc98941bff2ba799a51b3143146310d07306fd7cd0264d9b3134ecb1`.

An initial CRLF marker mismatch did not apply a mutation; that attempt's three
green cases are excluded from the negative claim. The subsequent successful
removal was verified against the unique open-drawer handler before execution.

## Native boundary still pending

`tests/browser/navigation-drawer-escape-native.spec.ts` prepares real keyboard
Escape with physically opened navigation for wall, object and room-area tools
in both renderers. It arms at FullHD1920x1080, then uses the accepted
960x540 CSS layout viewport with200% interface scale to reach the drawer.
It checks actual drawer placement, native input, returned focus, retained tool,
ordinary subsequent Escape and zero build/remove/zone commands from the HUD.
It does not claim actual browser page zoom. No test-level timeout or retry is
changed. Genuine browser baseline/correction/removal/restoration remain pending:
Art retains the browser lease; no browser was launched here. Offline collection
found exactly six prepared cases ([collection](native-six-collection.log));
both application/tools TypeScript checks passed with the native spec included.
The initial three failures caused by
incomplete DOM/resize stubs were setup errors and are not reported as product
evidence. An accidental broad script invocation also observed inherited
player-string inventory/refusal-vocabulary gate failures on this base; they
are unrelated to this scoped diagnostic and were not edited.

Weakest claim: source event delivery predicts a player-visible drawer loss.
Actual native events may reveal another earlier consumer; the queued browser
baseline must decide that before claiming native acceptance.
