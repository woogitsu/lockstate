# ADR DRAFT: Stable action targets in bottom-anchored pooled lists (#1294)

> **Unnumbered draft.** The integrator must assign the next available ADR number
> and add its index row in `docs/adr/README.md` in the same commit that promotes
> this file. A number read from `main` today is not reserved for this draft.

## Status

**Proposed; awaiting the repository owner's decision.** This document does not
authorize an implementation or change the accepted layout. Its recommended
option is a proposal, not an accepted ruling. No production code changes with
this draft.

## Context and reproduced failure

Four capped HUD lists call `assignPooledRows` in
`src/ui/hud/pooled-row-binding.ts`: the Build queue and pending deliveries in
`build-panel.ts`, and the held guards and staff roster in `staff-panel.ts`.
The function keeps an item in its assigned slot while it remains in the
window, and holds a vacated slot empty during a settle interval. These are the
binding and reuse protections accepted for #860 and #877, then used by #1288.
They protect a *logical slot*. The pointer presses a *screen coordinate*.

The inspector rail places `.hud__side` at the bottom with `margin-top: auto`
(`src/ui/hud/hud.css`). When a pooled block gains or loses a drawn row, its top
edge moves. A held-open row may also shrink when its two-line label disappears.
The old control's coordinate can therefore coincide with a different item's
control even though the logical slot is still reserved.

[Issue #1294](https://github.com/woogitsu/lockstate/issues/1294) records the
original 1280×800 measurement. A fresh Chromium reproduction on `main`
`430906af`, in the non-gating
[playtest at `5d529b55`](https://github.com/woogitsu/lockstate/blob/5d529b553d309aa42db296bab4ba6632e4856a19/tests/browser/playtest-1294-bottom-anchored-pooled-row.playtest.ts),
pressed the old center of guard 4's Release control after guard 4 left and
guard 9 arrived. Guard 4's box was at y=689.875..733.875; guard 9's new box
was at y=692.625..736.625. The press at x=1213.1484, y=711.875 submitted
`release-guard` for **guard 9**. This is an incorrect action target, not only a
visual shift. The smaller, separate measurement moves three controls 3–5 px
when a two-line held-guard label is blanked.

The Build lists did not reproduce the smaller height change in the original
measurement: their one-line label is shorter than the 44 px button. They
still use the same slot contract and layout region, so the decision must name
them rather than silently rely on that incidental height.

## Decision proposed to the owner

**Option 1: anchor pooled slots from the bottom, not merely the enclosing
rail.** A slot's stable identity is its distance from the bottom edge of its
own pooled block. Its screen box must remain in the same position throughout
the settle interval when its item disappears, independent of the number of
drawn rows above it. A new item may occupy that box only after the interval
ends and the original control has ceased to be a plausible pointer target.

The implementation may express this as reverse slot assignment, a fixed-height
slot container, or equivalent layout primitives. The observable invariant,
not a particular CSS technique, is the decision:

1. If an item remains in the window, the center and hit area of its action
   control remain at the same viewport coordinates across adjacent
   publications, except for an explicit viewport resize, rail resize, tab
   change, or user scroll.
2. If an item leaves, its prior control coordinate is inert for the full
   settle interval. No other item's action may be invoked from that coordinate.
   A held-open slot preserves the preceding control's **box and height**, even
   if the label was two lines and is now blank.
3. If the pooled block grows or contracts, it takes or releases space at its
   **top**, preserving occupied and held-open boxes counted from the bottom.
   A slot is collapsed only when that does not move another active or
   held-open control. The panel may scroll when its content exceeds the rail;
   it must not clip the controls to enforce this rule.
4. Identity is checked again on activation. A stale handler or a button that
   has been recycled must never dispatch a command for the item previously
   shown in that slot. The layout rule complements, and does not replace, the
   existing identity-bound action rule.

This applies to all four callers: Build queue Cancel, pending delivery
Cancel, held guard Release, and staff roster dismissal. Their row limits,
settle periods, item ordering policy, copy, and simulation commands remain
separate concerns. The proposal does not decide a new settle duration or
change how a queue is prioritized.

## Relation to accepted layout decisions

[ADR 0115](../0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md)
accepted the roster's placement and left the Manage rail capped and
bottom-anchored. `docs/VISUAL_IDENTITY.md` documents the constrained rail
composition. Option 1 retains both commitments: it changes the placement of
slots *inside* a pooled block, while the block and rail retain their assigned
region. It must not enlarge the rail at the expense of the world or make the
roster migrate to another tab as a side effect. If testing shows that the
invariant cannot be met inside those limits, return to the owner with the
measured conflict rather than silently overriding ADR 0115.

## Alternatives and costs

| Option | Result | Cost and remaining risk |
| --- | --- | --- |
| **1. Bottom-anchored slots (recommended)** | Covers the full-row wrong-recipient click and the 3–5 px shrink while retaining rail composition. | Changes the shared assignment/layout contract in four shipped blocks. Requires keyboard, pointer, touch, scroll and viewport regression work. |
| **2. Preserve only the held-open row's height** | Stops the 3–5 px shift caused by a disappearing two-line label. | The arriving guard can still take the departed guard's exact coordinate when a whole row is added. It cannot close #1294. |
| **3. Remove the rail's bottom anchor while a list is visible** | Lets a top-anchored list grow downward. | Reopens the rail composition documented by `VISUAL_IDENTITY.md` and accepted in ADR 0115, across tabs and viewports. Requires a new layout decision and a broader visual audit. |
| **4. Keep current behavior** | No implementation or test cost. | Accepts a reproduced press dispatching Release for the wrong guard. This would need an explicit owner ruling, not a silent deferral. |

Option 2 may be a component of option 1, but must not be shipped or described
as the whole fix. Option 3 is a valid product alternative if the owner prefers
to change the rail composition; it is wider than this proposal.

## Implementation and verification plan after acceptance

1. Record the present four-call-site geometry and settle behavior at the
   shipped desktop, short-screen, tablet and phone viewports. Include a
   bottom-anchored list with one departing and one arriving item, a full list
   with a middle departure, and a two-line label becoming blank. Keep the
   reproduction above as the red browser assertion: the old coordinate must
   not dispatch to guard 9. Mutate or temporarily remove the eventual layout
   fix and observe the test fail before relying on it as a gate.
2. Implement the slot rule in the common assignment/layout seam and adapt all
   four callers. Keep slot identity, action identity and visual order explicit;
   do not make a DOM index serve as an item id. Ensure a blank slot has no
   focusable or clickable action, including during an animation or rerender.
3. Pointer tests: retain the original press coordinate through consecutive
   publications, settle expiry and a newly claimed row. Assert the command
   names the intended item or no item, never a different one. Repeat for all
   four blocks, including the two Build blocks that did not originally fail.
4. Keyboard tests: focus an action before a publication, then remove or
   reorder its item. Focus must either remain on the same item or move to a
   safe adjacent control with an announced label; Enter/Space must not invoke
   a different item. Tabbing must skip held-open rows.
5. Touch tests: begin a tap on a control, publish a changed list before touch
   end, then release at the original point. Do not dispatch an action for an
   arriving item. Repeat at phone width with wrapped labels and at zoomed
   text sizes where a row changes height.
6. Layout migration checks: verify the accepted rail cap, bottom alignment,
   world area, scroll reachability and unclipped controls at all shipped
   viewports. Confirm that Build queue and deliveries keep their existing
   order and that Staff roster and held-guard sections do not overlap. Run the
   existing pooled-row, held-guard and staff-dismiss browser suites, then the
   relevant full browser gate.

No save migration, simulation change, message schema change or new player
string is implied by this decision. If implementation discovers otherwise,
that is a scope change to review separately.

## Decision requested

Does the owner accept **Option 1**, with the four-block scope and invariant
above? Until that answer is recorded here and in the numbered ADR index, the
status remains **Proposed** and the product implementation stays unapproved.
