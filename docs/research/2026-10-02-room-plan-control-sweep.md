# Native room-plan controls in the assembled shell

## Subject and exact baseline

PR1898 checkpoint71e25921a6 has terminal Ubuntu run37001303268:
760 browser cases passed and six failed. Five viewport sweeps never opened
the native plans modal, leaving its eight controls unmeasured. The keyboard
case expected the category filter to lead directly to the radiogroup,
but the actual next focused element was the separate Room plans button.
This was missing test coverage and a stale sequence, not evidence that
the production catalogue itself was inaccessible.

Root reproduced the original1280x720 inventory failure in17.1s after
hydrating actual local artwork. The original keyboard case also failed
with expected wall-brick and an empty focused catalogue row. Its error
context independently identifies Room plans as the active element.

## Complete modal visit and keyboard sequence

The sweep opens the real native dialog through its player button, visits
each real plan choice, and applies the existing five-point hit test to
every inventoried modal control. Each must have a measurable box and no
covering element. The modal backdrop intentionally blocks background
controls, just as the already visited Layout menu covers underlying HUD.
The dialog closes through its real close button; focus must return to its
opener before the remaining ordinary shell checks. No exemption changes.

The keyboard case now asserts header, category filter, plans action,
then exactly one catalogue radio stop, then the arm action. It repeats
the plans action assertion after filtering. Existing radio membership,
single-tab-stop, selection, hidden-row and arrow-navigation assertions
remain unchanged. The first corrected run passed all five sweeps but
exposed the same stale assumption in the filtered sequence; correcting
that second sequence returned the keyboard case to green in5.6s.

## Production sensitivity and exact restoration

Two temporary changes in the actual preview producer disable pointer
events only on Close plans and remove only the plans opener from native
Tab navigation. The new modal assertion fails in8.8s, naming the covered
Close plans control and the header hit instead. The keyboard assertion
fails in12.9s at the newly required plans stop. Both are intended reds.

Byte-exact restoration leaves zero production diff. The restored producer
SHA256 is7440e319f3c0c2a1e46993aec555b15f8df5e8874ac3767b653e2da3c82114b0.
The final unmodified-production group passes6/6 in1.3minutes: all five
original viewports plus keyboard navigation before and after filtering.
No timeout, retry, viewport floor, guard or production behavior changes.

## Limits and delivery

This is native Chromium on Windows, source-server acceptance at the
dependency checkpoint. It repairs the six specific terminal CI failures;
fresh exact-head Ubuntu CI, mergeability and serial-main gates still govern
delivery. It does not prove the separate integration branch, all browsers,
the complete browser suite, or hosted availability. The weakest claim is
cross-platform delivery until the new Ubuntu run terminates.
