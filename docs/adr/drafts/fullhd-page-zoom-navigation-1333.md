# Draft: Navigation when Full HD is enlarged (#1333)

**Status:** owner selected option 1 on 2026-09-25; implementation on this
branch. No ADR number is reserved.

## Scope and measured failure

The owner chose a Full HD minimum and HUD direction A: all status readouts stay
at the top. This draft addresses a physical 1920×1080 window at 200% browser
page zoom. The layout viewport is then 960×540 CSS pixels. It does not change
the rule for smaller physical windows.

The existing 200% sweep did not include 1920×1080. I added that window to a
temporary copy of its shared instrument and ran all six interface scales on
`c8ecf154`, then reran those six against PR #1439's exact tree. The result was
the same in both trees:

| Interface scale | Result at physical 1920×1080 and 200% page zoom |
| --- | --- |
| 75%, 100%, 125%, 150% | pass |
| 175% | `.hud__aside` overflows its own box by 51px |
| 200% | `.hud__aside` overflows by 149px; the scale button's centre belongs to a panel header |

At 200%, the 540px HUD has a 206.4px status strip and a 210.8px two-row tab
bar, leaving 122.8px for the rail. The aside is allocated 30.7px while its
content is 180px high. The control is visibly covered in the
[captured layout](../../research/evidence/2026-09-25-fullhd-page-zoom-200.png).
The capture used a checkout without all LFS art bytes. The reported failures
are DOM geometry and `elementFromPoint` readings, not claims about world art.

These measurements extend #1333 to the newly required physical Full HD case.
They also show why the PR #1439 alert-width fix cannot finish the large-scale
layout: the status, navigation and inspector each need space in the same 540px.

## Owner choice

All options preserve direction A's permanent top status readouts and the
44px logical tap target floor. None silently hides an existing tab.

1. **A tab drawer at this height budget (recommended for prototyping).** Keep
   one visible navigation control; open a labelled panel containing all six
   tabs by pointer, keyboard or touch. This returns the two-row tab bar's
   height to the map and inspector while making tab selection a two-action
   path. The open drawer must have an explicit close/focus route and must not
   cover a placement action without a way back.
2. **One horizontally scrollable tab row.** The labels remain on the bar, but
   some are outside its visible width until scrolled. This gives roughly one
   row back; the inspector still needs a separate solution for its 180px of
   content in the remaining height. An overflow cue and keyboard scroll are
   required. This is a proposal, not yet a measured passing layout.
3. **Scroll the whole HUD column.** All controls remain in the document, but
   the map and top status may move off screen during navigation. This has the
   highest risk to the owner's permanent status direction and is not
   recommended.

After a choice, implementation must pass a focused red-then-green browser
test at 1920×1080, page zoom 200%, interface scales 175% and 200%, and the
existing 36-combination ratchet. The art bytes should be materialised for the
final visual review.

The owner selected the clickable option **"Przycisk otwierający szufladę sześciu
zakładek (zalecane)"** on 2026-09-25. This is the weaker provenance of a
choice written by the agent, rather than words independently typed by the owner.
The other options offered were a horizontally scrollable row and scrolling the
whole HUD column. Implement the selected drawer with six reachable tabs, an
explicit close control, Escape support, and focus returned to the trigger.

## Implementation check

The closed control is labelled with the existing localized “show sections”
message. The open three-column drawer is shown in the
[200% capture](../../research/evidence/2026-09-25-fullhd-page-zoom-drawer-200.png).
The capture starts a new prison before opening the drawer; terrain renders
behind it. All nine status
metrics remain above the drawer. At the largest effective zoom, the drawer
scrolls within the remaining height, and each of its six entries is reachable
by Tab or pointer. The selected tab, Escape and the trigger all close the drawer
and return keyboard focus to the trigger. The save area scrolls inside its own
rail at these enlarged sizes.

The new `fullhd-zoom-navigation-drawer.spec.ts` passed at both 175% and 200%
interface scale. Ten focused browser cases passed, including seven chrome
cases; TypeScript and the 40 HUD layout unit tests passed. The existing
36-combination zoom ratchet remained at 12/36 known failures (ceiling 12)
after making every metric visible. CI is still required before the branch can
be merged. The refreshed capture confirms the HUD over rendered terrain.

Resizing the same 200% interface from 960×540 to 960×750 and back is covered
too. It first stayed in the drawer at the taller size because the drawer's
own wrapped metrics made the next fit measurement taller. The shell now
measures the strip without the drawer rule before choosing the next placement;
the browser test observed the failure before the change and the bar/drawer
transition passing afterward. Seventeen regular Full HD browser cases passed.
When the closed drawer trigger has keyboard focus and the window grows back to
the bar layout, focus moves to the visible navigation control. The browser test
failed with focus on the now-hidden trigger before that handoff was added.

A separate regression test starts with the navigation collapsed in persisted
layout settings. Before the fix the drawer trigger stayed
visible but did nothing because the normal restore arrow was hidden in drawer
placement. The trigger now restores navigation and opens the six tabs in one
action. The test went red before this change and all three drawer cases passed
afterward.
