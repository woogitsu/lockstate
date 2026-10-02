# First square order and clock — prepared actual audit

Existing Issue #936 asks whether a newcomer can find Play after building while paused. Current source already renders the truthful clock-dependency note for every nonempty queue; a second sentence would duplicate #920. Existing keyboard application loops exercise transport/completion, but the newly integrated angled Full HD layout needs a bounded visible-text reading.

`tests/browser/first-square-clock-hint.spec.ts` prepares actual New prison / Angled / Build square placement. It checks the real queue, the unchanged clock note and each rendered line against the Build panel bounds, then reaches Play with native Tab/Enter and checks queue completion. No browser run or production defect is claimed yet. This scripted check measures visibility and reachability; it cannot establish whether an uninstructed human understands the note.

Surface: HUD visibility/test only. No camera scene, art, save, price or gameplay changes. Shared browser lease belongs to root then Art; runtime audit pending.

## Actual solo acceptance

Root corrected two fixture assumptions: explicitly pause the new game and use the actual accessible name Play at normal speed. The production Full HD flow passed1/1. Review also added explicit visibility and nonempty line geometry, preventing an empty hidden-text measurement from passing. Mutating only production orderNote.hidden to true made the same test fail at visible-versus-hidden (15.1s); exact source restoration and production rebuild passed1/1 (26.0s). Native Tab/Enter reaches Play and the actual queue completes. This confirms current visibility/reachability, not uninstructed human comprehension or deployment. No gameplay source change is needed for this audited path.
