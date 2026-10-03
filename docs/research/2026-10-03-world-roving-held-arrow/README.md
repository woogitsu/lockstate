# World ownership of a held camera arrow when a catalogue radio takes focus

## Diagnostic checkpoint

Base: `3bd76298c1964a4eaa802f263c2347e717593206`. Own surface: World scene keyboard focus ownership. Art owns Reception chair; delivery owns #2018 native preparation; root owns native browser/server. No browser/server launched here. No layout, copy, simulation, save-format or binding changes.

Fresh all-state Issues searches covered camera/focus/keyboard, camera pan focus and zoom keyboard. Full #1479/#1968/#1969/#1943 bodies were read. Closed #1943 describes the same held-arrow→radio cause specifically in Oblique; its existing browser recipe uses `?renderer=oblique`. This World parity gap is an extension of that existing cause, not a new Issue.

VERIFIED source: Oblique registers a focusin listener that releases only ArrowUp/Down/Left/Right when the target is a grouped role=radio. World registers keydown, keyup and blur, but no such ownership listener. Its real update continues polling the held arrow after focus moves into Build/Rooms catalogue.

New ordinary unit test runs actual World create listeners, KeyboardInputAdapter, update and public minimap producer with the installed Phaser Camera. Engine hosting/art are doubled; EventTarget focus/key plumbing and focus-node shapes are supplied. Expected motion is independently pinned at 48 world units per 100 ms at zoom 1.25 over the 2048-unit loaded map. No private keyboard verdict or fake worker reply is used. This is source proof; native public focus/render acceptance is not established.

Original producer run: **1 RED / 2 GREEN**. Before focus: y=0.107421875; after radio focus: y=0.130859375, an unwanted further 48 world units. Ordinary HUD-button and ungrouped-radio controls pass; the listener-cleanup control passes. Initial fixture attempt failed because Node Event.target is getter-only; changing only fixture property definition made the intended producer failure observable. That setup failure is not evidence of the production defect.

## Correction and acceptance actually executed

World now uses the existing Oblique ownership rule: grouped radio focus releases only the four physical navigation arrows. Ordinary HUD buttons, ungrouped radios and held KeyD retain their world control. Focus does not cancel construction or reset the camera. The listener is removed with the scene's keyboard listeners on shutdown. The class sweep found this listener present in Oblique and absent in World; only World was changed (10 added lines).

Corrected unit run: **3/3 GREEN**. Removing only the actual `releaseCodes` call from this new production listener produced **1 RED / 2 GREEN**, at the same y=0.130859375 versus 0.107421875 assertion. The exact source bytes were restored, SHA-256 `32BCDD5657A53BD7E754976C1CD00B6D2B1CC1E37AFBB7EDB085F4633A26B454` before and after; restored unit run **3/3 GREEN**. Raw original/corrected/omission/restored outputs are retained next to this record (PowerShell UTF-16LE logs).

Related real keyboard/modal/Oblique minimap and canonical research-index checks: **61/61 GREEN** (four files). App/test strict TypeScript and tools TypeScript both exit 0. Cloudflare production build exit 0 and output verification GREEN; existing large-chunk/plugin timing warnings were retained in `build.txt`. No timeout, floor, skipped assertion or workflow change.

Weakest claim: native DOM focus delivery is supplied here rather than observed in a browser. A later root-owned native World recipe should confirm that boundary. No native pass, deployment or save/session acceptance is claimed. No duplicate Issue was opened or existing Issue marked complete.
