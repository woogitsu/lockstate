# 2026-09-15 — three decisions that have been waiting on the owner, made answerable

Each of these three is genuinely the owner's under `AGENTS.md` — they touch what
a player is promised, or a layout cost that has to be paid out of something a
player can see. **Nothing here decides any of them.** This pass measures, prices
each option, and states a recommendation, so that each can be ruled on in a
minute instead of being re-derived every session.

Measured on `e044a3e8` (the `main` of 2026-09-15), in a real Chromium, through
`tests/browser/run-suite.ts --suite browser` on port 45243. Git LFS is
unprovisioned in this container, so `World renderer: InvalidStateError: The
source image could not be decoded.` appears in every run; every figure below is
DOM geometry in `.hud-*` and none of it is the canvas.

**Every figure in the brief that produced this pass was treated as a hypothesis
and re-measured.** Two of the three reproduced. The third — ADR 0115's own
table — reproduces in three of six columns and is corrected in that ADR rather
than here. None of the three turned out already fixed.

---

## 1. `DismissAlert` has no route on a phone (#1201)

### The question, in one sentence

**At 375x812 one of the eighteen simulation commands cannot be issued at all:
should that be written down as a deliberate phone carve-out, or should the
alerts list be given a route below 720 px — and if so, whose section carries
it?**

### What the code does today

- `.hud__corner { display: none; }` — `src/ui/hud/hud.css:4704`, inside the
  `@media (max-width: 720px)` opened at `:4642`.
- The alerts fold is appended to the **minimap panel's body**, which is inside
  that corner: `src/ui/hud/hud.ts:1827` (`alertsSection.body.append(...)`),
  `:1846` (`minimapPanel.body.append(minimapSurface, alertsSection.element)`),
  `:1920` (`element('div', { className: 'hud__corner', children: [zoomControl,
  minimapPanel.element] })`).
- The alert row's own control is the only issuer: `src/main.ts:2900`
  (`case 'dismiss-alert':`) → `:2910`
  (`commands?.submit({ type: 'DismissAlert', ...dismissal })`). Pinned:
  `tests/foundation/unconsumed-command-contract.test.ts:364` asserts
  `producersOf('DismissAlert')` is exactly `['src/main.ts']`.
- The control's authored name is **"Clear this alert"** — read off the rendered
  `aria-label` in this pass, three rows, three controls.

### Re-measured, and one figure in #1201 is stale

`getComputedStyle('.hud__corner').display`, HUD shell mounted, four viewports:

| viewport | `display` | `.hud-alerts__list` client rects |
|---|---|---|
| 1440x900 | `flex` | 1 |
| 1024x768 | `flex` | 1 |
| 900x600 | `flex` | 1 |
| **375x812** | **`none`** | **0** |

So the brief and #1201 both reproduce exactly.

**#1201 says *"one of the seventeen members of `simulationCommandSchema`"* and
it is eighteen.** `src/simulation/protocol/commands.ts:778-797` lists eighteen
schemas; `editRegimeBlockSchema` was added by `d60e9938` on 2026-09-14, the day
before #1201 was filed. A tally, rotting first, exactly as
`docs/AGENT_WORKFLOW.md` §4 predicts.

### What the constitution says, quoted

Article 6 (`DOKUMENTACJA/konstytucja.md:35`), and this is the sharpest of the
three that touch it:

> Ostrzeżenia nie znikają dlatego, że przyszło nowsze zdarzenie. **Historia
> zdarzeń pozostaje dostępna.**

("Warnings do not disappear because a newer event arrived. **The event history
stays available.**") At 375x812 the event history is not available at all — not
merely unclearable.

Article 12 (`:59`) requires *"odbiór na telefonie, tablecie i komputerze"*
(acceptance on phone, tablet and desktop). Article 7 (`:39`): *"Każde istotne
działanie jest dostępne bez hovera."* The tie-break order (`:63-67`) puts
*"Dostępność potrzebnego działania"* second, above legibility and aesthetics.

### The options, each with what it costs

**Option A — accept it, and write the carve-out.** Zero code. Cost: the
rollout's closing criterion *"Każda obecna akcja ma osiągalną drogę"* acquires a
phone exception, article 6's second sentence is recorded as knowingly unmet at
one of the three tiers the delivery itself names
(`DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md:44`: 390x844, 1024x768, 1440x900),
and `tests/browser/unplaced-surfaces.spec.ts:226` — which today asserts the
string `'desktop: flex / tablet: flex / phone: none'` — becomes an **endorsed**
assertion rather than a recorded one. It is reachable in code now; nothing is
written.

**Option B — put the alerts fold in the Layout menu.** Reachable today:
`.hud-layout__button` is laid out at 375x812 at **44x44**, measured, and the
menu already carries three rows (*Navigation width*, *Panel height*, *Hide the
counters and the clock*). The precedent is real — the language picker went
there under #663. Cost, measured: the fold is **129 px at one row, 283 px at
three, 360 px at four** (worst case, `hud.alert.refusal.zone.not-enclosed`,
the longest sentence in the refusal namespace, which is the row
`ui-alerts-column.spec.ts` uses for #739). That makes a preferences popover the
tallest surface on the phone. And it puts world state inside the one menu
constitution article 13 defines as *not* world state — *"Układ nie jest stanem
świata"* (`konstytucja.md:73`). New code: a mount move plus a phone-only branch.

**Option C — mount the alerts fold in the rail, on Overview, below 720 px.**
Measured room, HUD shell at 375x812 with three alerts published:

| tab | `.hud__side` | free rail (`.hud__rail` is 654.81) |
|---|---|---|
| Overview | 108.19 | **546.62** |
| Build | 416.56 | 238.25 |
| Zones | 489.13 | **165.68** |
| Manage | 482.38 | 172.43 |
| Day plan | 95.00 | 559.81 |

The worst-case fold is 360 px, so on the subtraction it fits on Overview with
**186.62 px to spare** and does not fit on Zones or Manage.

**Then measured rather than subtracted**, because a fold mounted *inside*
`.hud__side` becomes part of what `.hud__side` measures: a 360 px stub
`prepend`ed to `.hud__side` at 375x812, per tab, with the panels re-read.

| tab | `.hud__side` before → after | what the existing panel did | stub laid out |
|---|---|---|---|
| Overview | 144.50 → **504.50** | Overview panel **112.50 → 112.50**, unchanged | y 246.31–606.31, wholly inside the rail |
| Zones | 489.13 → **536.00** (the cap) | Rooms panel **457.13 → 144.00** | inside |
| Manage | 482.38 → **536.00** (the cap) | Staff panel **307.38 → 2.00** | inside |

**On Overview it costs nothing measurable** — the rail is 654.81 px, the stub
and the Overview panel together are 504.50, and the Overview panel does not move
by a pixel. On the other two it is the sheet's 536 px ceiling that pays, and the
panel already there is what gives way.

Cost: it is an Overview-only mount, and what Overview contains is exactly the
class of question the owner ruled on three times on 2026-09-14 (intake's
section, materials' section, what seeds Przegląd) — so it is a fourth ruling of
that kind, not an implementation detail. It changes nothing about
`alertRowDismissal`, so the dismiss control stays on the row that names the
alert and no second issuing site is invented.

**Option D — un-hide `.hud__corner` below 720 px.** **Already measured failing,
twice**, and `hud.css:4652-4700` carries both runs. The corner and the rail
occupy the same grid area once `.hud__rail` stretches at this breakpoint: the
corner sat at 250x127 @0,616, the Alerts fold header at 208x44 @21,638, and
`elementFromPoint` at that header's centre returned **the Intake panel's Admit
button**, which `app-shell.spec.ts`'s #88 sweep reports as *"controls covered by
something else on the overview tab at 375x812"*. A first attempt that brought
the corner back whole covered the centre pixel and failed *"a click in the
middle of the screen reaches the world, not the HUD"*. The file's own
conclusion: *"bringing the alerts log to a phone is a mobile LAYOUT job, not a
breakpoint edit"*. Cost: two existing gates, and a layout pass nobody has
scheduled.

### Recommendation

**Option C**, mounted on Overview only below 720 px.

It is the only option whose cost has been measured to fit, and measured by
mounting rather than by subtracting: a 360 px worst-case fold on Overview leaves
the Overview panel at 112.50 px, exactly what it is without it, while the same
fold on Zones takes the Rooms panel from 457.13 to 144.00 and on Manage takes
the Staff panel to 2.00 — so "mount it everywhere" is not available and the
Overview-only shape is free. It keeps the command
on the row that names the alert, so nothing in `src/main.ts` or
`alertRowDismissal` moves and
`tests/foundation/unconsumed-command-contract.test.ts:364` stays true as
written. It makes article 6's *"Historia zdarzeń pozostaje dostępna"* true at
the phone tier rather than carved out, which is the difference between the
rollout's closing criterion passing and being amended. Option B is reachable but
files world state under layout preferences; option D is priced and the price is
two gates; option A is free and is the one that has to be written down as a
promise the code does not keep.

**What would change my mind:** a ruling that the phone is a viewing tier and not
an operating one. That is a product position, not a measurement, and it would
make option A correct immediately — in which case the carve-out belongs in ADR
0112 and in `unplaced-surfaces.spec.ts`'s own docblock, not in a comment.

---

## 2. ADR 0115 (Proposed) — where the prisoner roster lives

**The dossier for this one is filed in the ADR itself**, because the ADR already
carries the question, the options and a recommendation, and a second document
restating them is how this repository grows contradictions. What this pass added
there:

- the table's own figures re-measured, twice — on `e044a3e8` and again in a
  detached worktree at `e221e927`, the commit it was taken on, **byte-identical
  between the two**, so nothing below is drift;
- **three of six columns reproduce exactly** (`.hud__side` 413.38 / 405.38 /
  391; Regime 389.38 / 359; roster **219.63 / 202.44**) and **three do not**
  (Intake 268.44 against 161; Staff 526.88 against 577; phone shortfall **388
  against 178**);
- where the Intake column came from: the harness's **empty-prison defaults**
  give 161.00 at 1440x900 and 143.00 at 375x812, the ADR's two numbers to the
  pixel — so the table mixes fixtures rather than using the one it names;
- **the conclusion survives and hardens**: the Manage rail is over budget at
  four of four viewports, not three, which
  `operations-reachability.spec.ts`'s own docblock had already recorded in
  prose;
- option 2 priced rather than described: a roster panel of its measured height
  inserted above the Staff panel takes that panel to **51.56 px at 375x812** and
  **14.88 px at 900x600** if it keeps its natural height, 192.17 and 173.73 if it
  scrolls too;
- and the phone cannot pay for it with the Layout menu: the sheet is capped at
  `min(812 x 0.66, 812 - 210) = 535.92` (`hud-layout.ts`
  `SHEET_MAX_VIEWPORT_FRACTION`, `SHEET_VIEWPORT_RESERVE_PX`, both the
  delivery's own numbers) and `.hud__side` on Manage measures **536.00** — it
  opens at its ceiling.

The ADR's recommendation is unchanged and is now argued from prices rather than
from caution: **option 4**, split the panel in code and keep both halves on Plan
dnia, leaving the placement one `setVisible` away.

**One shape that is deliberately not in the option list**, because this pass did
not measure it: making `.hud__side` a single scroll column so three panels share
one scrollport instead of one panel absorbing the other two. That is the only
arrangement in which option 2 might not cost the Staff panel its readability,
and pricing it means measuring what a rail that scrolls as a whole does to
`operations-reachability.spec.ts`'s per-control reachability readings at all
four viewports. It is a lead, not an option.

---

## 3. #1192 follow-up — the tab bar has no slack at 375x812 in a long locale

### The question, in one sentence

**The five-section tab bar fits Polish at 375x812 with 5.11 px to spare and
breaks at 359 px — is 375 px the supported floor, or does the bar need to stop
depending on how long the section names are?**

### Everything `hud.css` claims about this reproduces

`hud.css:4766-4791` carries the #1192 measurements. Re-measured here, real app,
`test.use({ locale: 'pl-PL' })`, label boxes off `.hud__tabs [data-tab]
.ui-tab__label`:

| viewport | inner bar | five labels sum | tightest pair | bar height |
|---|---|---|---|---|
| 320x812 | 296 | 291.13 | **−4.08** (`Zarządzaj/Plan dnia`) | 69.19 |
| 360x800 | 336 | 291.13 | **+0.19** | 69.19 |
| 375x812 | 351 | 291.13 | **+5.11** | 69.19 |
| 390x844 | 366 | 291.13 | +10.05 | 69.19 |
| 414x896 | **387.16** | 291.13 | +17.00 | 69.19 |

`hud.css` says 291.14 / 5.11 / 4.08 / 10.05 / 387.16. Every one of them.
Nothing here is already fixed and nothing here is wrong.

### The two numbers the brief asked for, which nothing had measured

**Where it breaks.** Sweeping the viewport down in Polish, tightest adjacent
label pair:

```
375 +5.11 | 372 +4.13 | 368 +2.81 | 364 +1.50 | 362 +0.86 | 360 +0.19
358 -0.47 | 352 -2.42 | 344 -4.08 | 336 -4.08 | 320 -4.08
```

**The bar breaks at 359 px**, and below 344 the overlap saturates at −4.08
because `.ui-tab`'s `min-width: calc(64px * var(--ui-scale))`
(`primitives.css:434`) stops the buttons shrinking: five 64 px buttons is 320 px
in a 294 px client box. A 360x800 Android viewport — the commonest there is —
holds by **0.19 px**.

**How much slack in label length.** Appending characters to all five labels at
375x812, tightest pair:

```
+0 chars  +5.11   (sum 291.14)
+1 char   -3.27   (sum 332.13)
+2 chars -11.81   (sum 375.25)
```

**One additional character on the section names overlaps the bar.** That is the
slack: less than one character, in the second of the two locales that exist.

### The options, each with what it costs

Measured by injecting one declaration at a time into the running app in
`pl-PL` and re-reading the bar, at 320 / 358 / 360 / 375.

**Option 1 — accept 375 px as the floor.** Free. Cost: 358-320 px viewports draw
overlapping section names, 0.47 px to 4.08 px; nothing gates below 375, which is
this repository's narrowest measured viewport in 24 specs; and the next locale
after Polish has less than one character of headroom. Note in its favour: the
delivery's own phone tier is **390x844**
(`DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md:44`), where the tightest pair is
+10.05 px.

**Option 2 — let the bar wrap to two rows where it must.** Measured: tightest
pair goes to **+5.25 px at 320** and +7.95 at 358, and the bar goes **69.19 →
82.38 px**, taking **13.19 px off `.hud__rail`** (618.63 → 605.44 at 320). Those
are the same 13.19 px #1192 and #1190 measured putting a delivery row's Cancel
outside the Build panel's visible box, which is what
`build-deliveries-outside-the-fold.spec.ts` exists for. It undoes exactly what
the tracking bought.

**Option 3 — drop the label below the break point (icon-only tabs).** Measured
with `.ui-tab__label { display: none }`: bar **69.19 → 58.00**, so the rail
*gains* **11.18 px** (618.63 → 629.81). But the buttons still sum to 320 px in a
294 px box at 320 px, so it does not fit on its own; with `min-width` also
lowered to 56 px the buttons sum to **280 px in a 280 px client box** and it
fits. Cost: five icons have to be authored and drawn (none exists —
`tab-button.ts:50` renders a single `.ui-tab__label` span and nothing else), and
the section name — the thing the navigation move worked to settle — stops being
on screen, which is tie-break rung 4, *"Spójność nazewnictwa i zachowania."*

**Option 4 — a horizontally scrolling tab bar.** Measured with
`.hud-tabs__inner { overflow-x: auto; flex-wrap: nowrap }` and
`.ui-tab { flex: 0 0 auto }`: **no pair overlaps at any width — the tightest gap
is +17.00 px at 320, 358, 360 and 375 alike** — and the bar height does not move
(69.19). The cost is what is off-screen, `scrollWidth - clientWidth`: **18 px at
375, 27 px at 358, 26 px at 360, 46 px at 320.**

> **This refutes the number #1192 rejected the scrolling bar on**, and the
> refutation is mechanical rather than a disagreement. #1192 measured *"380px of
> content in a 351px box, so two of five sections start off-screen with no
> affordance"* — on the **untracked** bar, before `--label-tracking-tight`
> shipped. With the tracking in place the hidden band at 375x812 is **18 px**,
> about a quarter of one section name. `docs/VISUAL_IDENTITY.md` repeats the old
> reading; it is a snapshot of a measurement, not a ruling, and it predates the
> fix it describes.
>
> ADR 0022's refusal of overflow is about **the rail**, and a tab bar is a
> different surface — #1192 says so itself.

**Option 5 — lower `.ui-tab`'s `min-width` from 64 px to 56 px, labels kept.**
Measured: **+4.78 px at 358** and **+5.45 px at 360** where today gives −0.47 and
+0.19 — so it moves the break point from 359 px to roughly 350 px — and
**−7.70 px at 320**, where today gives −4.08. It makes the middle better and the
worst case worse.

**Not an option, and the measurement says so.** Padding: with
`.ui-tab { padding: var(--space-2) 0 }` the tightest pair is **−4.08 at 320
(unchanged)** and **+1.00 at 375, down from +5.11** — removing the padding
*costs* slack, because the inner bar shrinks with it. #1192 said padding could
not pay for this; it is worse than that.

### Recommendation

**Option 4, applied inside the existing `@media (max-width: 720px)` block, with
option 1 as the do-nothing if the owner would rather freeze the floor.**

The argument is the slack figure. The bar has **less than one character** of
headroom in Polish at 375x812 and **0.19 px** at 360x800, and both numbers are
properties of two locales that happen to exist rather than of a design. Options
2, 3 and 5 each buy a few pixels and each charges for them somewhere a player
looks — 13.19 px of rail, the section names, or the 320 px case. Option 4 is the
only candidate that costs **neither rail height nor a name**, and it is the only
one whose behaviour does not change when a third locale arrives. The number that
disqualified it in #1192 was measured before the fix that is now shipped, and
re-measuring it is what this pass was for.

**What would change my mind:** a ruling that English and Polish are the only
locales that will ship, plus a decision that 375 px is the supported floor. Then
option 1 is right, costs nothing, and the only work is a gate at 375 saying so.
The other thing that would change it is an affordance measurement I did not
take: a scrolling bar with no visible edge fade or scroll cue is a surface a
player can fail to discover, and I measured the geometry rather than whether
anybody would find the fifth section.

---

## What this pass did not reach

- **No option was implemented and no layout, behaviour or ADR `Status` moved.**
  Every CSS declaration above was injected into a running page inside one
  `page.evaluate` and removed in the same call.
- **Option C of dossier 1 was priced with a stub of the fold's height, not with
  the fold.** Whether a real fold mounted in `.hud__side` on Overview keeps
  `app-shell.spec.ts`'s #88 hit test green is unmeasured — it is a different
  grid area from the corner that failed it, which is the reason to expect it to
  pass and not evidence that it does. Nor was the fold's height re-read at phone
  width; see the weakest claim below.
- **Dossier 3's option 4 was measured for geometry only.** Discoverability was
  not measured and is named above as the weak point.
- **The 200 % page-zoom debt (#1202, 29 of 36) is untouched here.** Dossier 3's
  option 2 and option 3 both move the bar height, which is one of the three
  things `docs/VISUAL_IDENTITY.md` item 6 says closing that debt needs, so the
  two decisions interact and neither was measured against the other.

## The weakest claim in this document

**That a 360 px stub is what the alerts fold would actually be on a phone.**
Every fold figure here — 129 px at one row, 283 px at three, **360 px at four** —
was read at **1440x900**, where `.hud-alerts__list` is 372 px wide. In the phone
rail it would be about 343 px wide, and a narrower column wraps the same
sentence to more line boxes, so the real phone fold is **taller than 360 px**,
not shorter. The direction of the error is therefore known and the conclusion is
not conservative in the way the Overview arithmetic makes it look: 504.50 of
654.81 leaves 150.31 px of headroom, which a phone-width re-wrap could plausibly
eat. What would change my mind, and it is one measurement nobody has taken:
publishing four worst-case alerts into a fold mounted at 375 px wide and reading
its height there rather than at desktop width.

**The claim this section used to make has been discharged rather than kept.** It
was that the free-rail figures were a subtraction rather than a mounted panel.
They were; the stub measurement above replaces them, and it is reported beside
the subtraction rather than instead of it.
