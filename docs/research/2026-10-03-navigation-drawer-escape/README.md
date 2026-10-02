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
Issue[#1962](https://github.com/woogitsu/lockstate/issues/1962) covers the same
propagation cause for the Layout menu at FullHD UI200%; it should be extended
with the newly uncovered navigation drawer boundary, rather than duplicated.
Its current body and current comment collection were read before this proposal.
Issue#1479 covers keys changing semantic action across input contexts;#959 is
the earlier accepted world-Escape stand-down behavior. Neither is this drawer
event delivery gap. No new Issue was opened by this diagnostic.

The parent grants only `src/ui/hud/layout-shell.ts` for stopping propagation of
the Escape that closes an open drawer. A closed drawer must keep ordinary world
Escape and other keys; closing/focus restoration and wall/object/room tools must
remain functional. No drawer placement rule, copy, binding/schema, camera pose,
retained preview, or worker command changes are proposed.

Production correction, removal mutation/byte-exact restoration, and genuine
native events with worker-command controls are pending. Browser lease is held
by Art; no browser was launched here. The initial three failures caused by
incomplete DOM/resize stubs were setup errors and are not reported as product
evidence. An accidental broad script invocation also observed inherited
player-string inventory/refusal-vocabulary gate failures on this base; they
are unrelated to this scoped diagnostic and were not edited.

Weakest claim: source event delivery predicts a player-visible drawer loss.
Actual native events may reveal another earlier consumer; the queued browser
baseline must decide that before claiming native acceptance.
