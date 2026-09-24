# #719: the last two status metrics at laptop width

This is a measurement and an undecided layout proposal, not an approved HUD rule. The code measured was `origin/main` `430906af` (v0.0.757). `tests/browser/playtest-719-status-strip-visibility.playtest.ts` is intentionally red until a layout decision is accepted and implemented.

## Current behaviour

Chromium, the existing UI harness and `ui-strip-badged-width.spec.ts`'s fully badged prison fixture at 1280×800: `.hud-strip__metrics` has `clientWidth 1256`, `scrollWidth 1441`, and seven of nine chips fully visible. `funds` and `earned-today` cross the unscrolled right edge. The red playtest says `7/9 visible, 1441px in 1256px` on the unfixed code. The fixture uses 178 prisoners, 36 not housed, 42 understaffed, 36 unguarded, Gang Retaliation, Currency, and a seven-figure treasury; it is not an empty-prison strip.

This reading supersedes the pre-ruling-21 six-of-nine and 1627px examples in #719 and `hud.css`. Ruling 21 in #723 shortened the coverage badge; it did not fit the row. The assembled-page act-6 measurement in #719's owner comment already corroborates the class of bug with 1389px in 1256px in a smaller prison.

## Browser-only CSS trials

All variants below were injected into Chromium after the same `HudViewModel`, without changing production CSS. `stripH` is the strip height; the viewport is the harness viewport. “200%” is `document.documentElement.style.zoom = '2'`, a CSS zoom proxy rather than Chrome's native page zoom, so its numbers do not establish native zoom acceptance. Screenshots are held locally under `C:\Users\matma\Documents\Rozwój gier\lockstate-strip-719-evidence`.

| Viewport | Baseline | Allow metric wrap, 8px gaps | Compact font, badges and gaps | Priority funds first plus thin scrollbar |
| --- | --- | --- | --- | --- |
| 1280×800 | 7/9, stripH 80.7px | 9/9, stripH 114.4px | 8/9, stripH 80.7px | 7/9 including funds, stripH 88.7px |
| 1024×768 | 6/9, 80.7px | 9/9, 114.4px | 6/9, 80.7px | 6/9 including funds, 88.7px |
| 1280×800 at CSS zoom 200% | 3/9, 161.4px | 9/9, 296.2px | 4/9, 161.4px | 4/9 including funds, 177.4px |
| 375×812 | 1/9, 88px | 9/9, 215.4px | 2/9, 88px | 1/9 (funds), 88.7px |

The plain wrap fits the ordinary desktop widths but places `earned-today` alone on its second line at 1280×800. It also spends 33.7px of vertical space there and 127.4px on the phone. The 200% proxy spends 134.8px. It cannot be applied at every viewport without taking significant playfield, and ADR 0085 already records the 1280×720 Build-panel budget at roughly 2px. Compact type sacrifices legibility and still does not fit. I would not use it.

Putting `funds` first keeps the resource visible without taking a whole new row. The thin native scrollbar was not painted in the Chromium screenshots because overlay scrollbars hide when idle; this trial does **not** provide an observable scroll affordance and does not satisfy ADR 0085 decision 2 by itself. A visible edge cue would require an actual design and testing; no such cue is part of this prototype.

## Decision already drafted, not accepted

ADR 0085 decision 2 is **Proposed**. It recommends height-gated wrapping at 1280×800 and taller, plus a priority order that protects funds and non-success badges; it names a visible scroll cue as an option only if the owner revisits the earlier #634 refusal. The owner's #723 ruling accepted shortening the coverage badge and explicitly noted that the remaining width deficit persists. It did not accept ADR 0085 decision 2. Its priority promise and use of playfield height belong to the owner.

The narrow next decision is whether to accept ADR 0085 decision 2's **height-gated wrap plus priority reorder**, allowing the implementation to measure the exact breakpoints against the Build-panel budget. If the owner wants every chip simultaneously visible even at 1280×720 and on mobile, that is a different layout decision: this trial shows a simple wrap takes too much height there. If the owner wants a single row, an explicit overflow cue must be reconsidered against #634; a native scrollbar cannot be assumed visible.

The weakest claim here is the 200% comparison: CSS zoom reproduces scale pressure but is not Chrome native zoom. Native zoom plus the assembled HUD, including the Build and Rooms panels, must be run before choosing a breakpoint or claiming no panel clips.
