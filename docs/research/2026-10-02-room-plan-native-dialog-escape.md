# Native Room plans Escape preserves the armed preview

## Actual interaction comparison

Confirmed in the built production application at 1920 × 1080, both 100%
and 200% interface scale, in angled view. The isolated baseline includes
the existing room-plan rotation/worker integration and Layout-menu Escape
correction; it contains no native room-plan dialog key consumption.

Create a prison, pause, choose Build → Room plans → Four-cell row → Place
on map, and move once to the map. The actual worker reports clear and the
complete 112-square world ghost carries the material quote. Use keyboard
focus and Enter to reopen the catalogue and activate Close plans. This
accepted existing interaction closes the dialog, returns focus to its opener
and retains the armed preview, worker target and quote.

Reopen by keyboard, focus Close plans and press Escape. The browser's native
dialog closes and focus returns, but the same key also cancels the armed
world preview. Both scale cases fail exactly at the preview being hidden.
No physical map movement or rearming occurs between those close actions.
The accepted dialog convention is already represented by Close plans and
the Layout menu's owned Escape: closing UI does not also cancel placement.

## Cause and scoped correction

Native dialog cancellation occurs after keydown bubbles to window. The
world-template bridge handles Escape there, before the browser completes
default dialog cancellation. The dialog now consumes its own Escape in
keydown, prevents default cancellation, stops propagation and invokes the
existing close/focus-return path. A closed dialog consumes no key. A second
Escape after closure remains world cancellation.

Published fix/test checkpoint `d19f66ce1ae7ca369378e75639bd38e70e43263b`
changes only room-template-preview.ts and adds the focused browser case.
It introduces no labels, command/save fields, gameplay, renderer, art or
camera-policy change.

## Evidence obtained

- Actual artifact baseline: 2 failed (16.2s at 100%, 15.1s at 200%), after
  the native Close plans comparison and focus-return assertions passed.
- Fixed rebuilt artifact: 2 passed (7.7s / 6.4s, 17.3s overall).
- Production mutation removed preventDefault and stopPropagation while
  retaining dialog.close(). After rebuilding, both cases failed again
  (17.1s / 16.0s) at the armed preview being hidden. Dialog closure and
  focus return still passed; this proves key ownership rather than closure.
- Exact source restoration was checked by matching SHA-256 before/after:
  E90AFB8A4AF22AC787DE82862CB030406A244BA4278AE461C311C6809158CE24.
  The rebuilt restored artifact passed both cases (8.2s / 7.6s, 18.8s overall).
- Existing dialog tests: 9 passed. Existing HUD message-registry tests:
  13 passed. Both TypeScript projects and the named production build passed.

The regression verifies identical polygon points and fills for all 112 floor
and fixture squares, the unchanged actual worker preflight target and full
quote, focus return and zero placement commands. It also proves a subsequent
world Escape cancels the plan and fresh map movement cannot resurrect it.
Browser execution used the existing artifact configuration through an
untracked local test selection; no tracked configuration or timeout changed.
No failure qualified for a network-change retry.

## Issue and acceptance boundary

Fresh all-state remote searches and relevant full Issue bodies ruled out
duplicates. #1918 concerns camera bindings behind modal focus, #1923 map
hover across keyboard rearming, #1931 roving focus, #1946 pending readiness,
and #1962 the separate Layout-menu propagation path.
[Issue #1965](https://github.com/woogitsu/lockstate/issues/1965) records this
native catalogue closing/cancellation defect and the prepared correction.

These are local built-artifact results. Full CI, integration and deployed
completion remain separate acceptance boundaries. The measured base also
contains inherited art/routing research-index and art-citation gate failures,
which the coordinator repairs separately; no guard was weakened here.
