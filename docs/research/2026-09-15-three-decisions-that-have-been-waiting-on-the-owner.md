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

## Read after 2026-09-16: two rulings landed, and this document is not rewritten

**Nothing above or below this section has been rewritten into the past tense,
and that is deliberate.** `docs/AGENT_WORKFLOW.md` §4 says to mark both
directions rather than overwrite, and a dossier that priced a decision is not
made worthless by the decision being made — it becomes the record of *what the
owner was shown before choosing*, which a past-tense rewrite would destroy. The
pricing below stands as written and as measured on `e044a3e8`. What the owner
ruled is recorded here, beside it.

**Four rulings were made on 2026-09-16. Two touch this document; two do not,
and saying which is half the value.**

| ruling, 2026-09-16 | touches | where |
|---|---|---|
| **ADR 0091 decision 2 → option F** — a decided outcome of the SAME route retires the refusal band | **dossier 1** | the worst-case fold row |
| **ADR 0116 → option 2** — a construction-completion event, `'info'`, `'log-only'`, counted | **dossier 1** | what the unreachable log will carry |
| **Constitution article 8** — ADR 0112 decision 4's amendment carries all three numbers, 15 / 13 / 11 | **none of the three** | see below |
| **`RemoveWall`'s object arm** — leave the behaviour, file an issue ([#1270](https://github.com/woogitsu/lockstate/issues/1270)) | **none of the three** | see below |

**The provenance of all four is the weaker of the two kinds this repository
distinguishes, and none of them is upgraded here into a quotation.** The owner
did not type a sentence for any of them; they were shown clickable options an
agent session had written and chose one — ADR 0091's option label reads *"F —
ta sama trasa (zalecane)"*, and that label is the whole of what was agreed.
This is the same provenance `CLAUDE.md` flags for the 2026-09-08, -09 and -10
releases inside reservation 3, and `docs/adr/0091-what-clears-the-refusal-band.md`'s
own Status block states it in those terms. **Read the ADRs' Status blocks
rather than this table**, which is a paraphrase and will rot the way paraphrases
here do.

### What ADR 0091 option F does to dossier 1's fold figures — nothing, and here is why that is checkable

Dossier 1 prices the alerts fold's worst case off
`hud.alert.refusal.zone.not-enclosed`, *"the longest sentence in the refusal
namespace"*. That superlative was re-checked on the merge commit rather than
carried: sorting every `'hud.alert.refusal.*'` value in
`src/content/default-locale-en.ts` by length puts it first at 114 characters
(`src/content/default-locale-en.ts:1215`), ahead of
`hud.alert.refusal.hire.no-duty-for-role` at 109. Option F changes **when the
band retires**, not what any row says and not how tall the fold is — and #1261,
which implemented it, is one line of behaviour in `src/ui/hud/hud.ts`
(`if (notice === undefined || notice.routeDecidedSince === true)`, at
`src/ui/hud/hud.ts:1731`) plus an optional `routeDecidedSince` on the schema
(`src/simulation/protocol/types.ts:1525`). **No file under `src/` with a `.css`
extension moved between `e044a3e8` and this merge** — checked with
`git diff --name-only e044a3e8..HEAD -- 'src/**/*.css'`, which returns nothing —
so every DOM-geometry figure in all three dossiers stands on the tree it was
taken on.

**What option F does change is dossier 1's stakes, in the direction of its
recommendation rather than against it.** A refusal that retires on its own route
is a row that leaves the *band* sooner; `hud.css`'s own prose already records
that the **log** is what a phone cannot reach -- *"On a phone the log is still
out of reach; on every viewport above 720px it is not."*, read at
`src/ui/hud/hud.css:4702-4703` (**#1201's body cites `:4701-4702` for this
sentence and is one line early**; it is quoted here rather than only pinned,
per §4's rule that a quoted sentence is the most durable citation). So the band
getting quieter moves weight onto the log, and the log is the surface with no
phone route.

### What ADR 0116 option 2 does to dossier 1 — it adds rows to the surface dossier 1 says is unreachable

The owner ruled for a construction-completion event graded `'info'` and routed
`'log-only'`, counted rather than repeated, so twenty-four finished walls are
one row with a count of 24. `'log-only'` is not a quieter band — it is the
alerts **log** and nothing else, which `src/ui/simulation-events.ts:55-58`
states in its own words:

> `'log-only'` means the log and nothing else. It is not silence and it is not
> a lower severity -- there is no grade below `'info'` and inventing a fourth
> tone was never the question; it is the same sentence, on the surface that
> keeps it rather than the surface that interrupts with it.

The routing type is `readonly surfaces: 'band-and-log' | 'log-only'`, at
`src/ui/simulation-events.ts:474`.

**So the ruled event lands, by construction, on the one surface dossier 1
measured as having zero client rects at 375x812.** That does not decide dossier
1 and nothing here treats it as doing so. It does mean the phone log is about to
carry a class of row the player did not have before, which is an argument
against option A (accept the carve-out) that did not exist when option A was
priced. **The RULE is settled; ADR 0116's payload shape is not**, and its own
Status block still reads `Proposed, 2026-09-15` in this tree — so a reader who
takes the ruling from this table and the status from the ADR will find them
disagreeing, and the ADR is the one to fix, not this paragraph.

### The two rulings that touch nothing here, stated plainly rather than omitted

**Constitution article 8 → 15 / 13 / 11 touches none of the three dossiers.**
None of them quotes article 8; dossier 1 quotes articles 6, 7, 12 and 13, and
ADR 0115's added section quotes article 7. The reason to check anyway is that
article 8 is the *type scale*, and dossier 3 is five text labels measured to two
decimal places — a body/label/metadata ramp moving from 16 / 14 / 12 to
15 / 13 / 11 would move every label width in it. **It does not, because the code
already shipped 15 / 13 / 11 and the ruling moved the constitution to the code
rather than the code to the constitution** — which is exactly what
`docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md`'s amendment
section says it is doing (*"said 15 / 14 / 12 while the code shipped
15 / 13 / 11"*). Dossier 3's figures were taken on that code. Nothing moves.

**The `RemoveWall` object-arm ruling touches none of the three either.** It is
about which route a supersession key resolves to, it changes no layout and no
string, and none of these dossiers mentions `RemoveWall`. It is recorded in this
table only so that a reader checking the 2026-09-16 rulings against this file
finds all four accounted for rather than three.

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

  > **Those three line numbers were right on `e044a3e8` and are dead on the
  > merge commit; both are kept rather than the old ones overwritten, because
  > the pair is what shows how fast a `file:line` into `hud.ts` rots.** #1261
  > added 52 lines above them. Re-read and quoted verbatim at the new
  > coordinates:
  >
  > - `src/ui/hud/hud.ts:1879` — `  alertsSection.body.append(alertList, alertsNone);`
  > - `src/ui/hud/hud.ts:1898` — `  minimapPanel.body.append(minimapSurface, alertsSection.element);`
  > - `src/ui/hud/hud.ts:1972` — `  const corner = element('div', { className: 'hud__corner', children: [zoomControl, minimapPanel.element] });`
  >
  > The three lines themselves are byte-identical to what they were; only the
  > numbers moved. The four anchors this dossier carries into `hud.css`,
  > `main.ts`, `commands.ts` and the two spec files were opened at the same time
  > and are all live.
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
and `tests/browser/unplaced-surfaces.spec.ts:226` — the test whose title is
*"the map corner drops at 720px and below, which is where three unplaced
surfaces go"*, and which asserts the string
`'desktop: flex / tablet: flex / phone: none'` **at `:253`, not at `:226`**
(`    expect(readings.join(' / ')).toBe('desktop: flex / tablet: flex / phone: none');`)
— becomes an **endorsed** assertion rather than a recorded one. `:226` is kept
because it is what #1201's body cites and it does open the right test; `:253` is
added because it is the line the sentence is about. It is reachable in code now; nothing is
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

> **THE NUMBER IS RIGHT AND THE ANCHOR IS WRONG, AND BOTH ARE KEPT, BECAUSE
> WHICH HALF FAILED IS THE PART THAT MATTERS.** Opened on the merge commit,
> `src/ui/primitives/primitives.css:434` reads
> `  min-width: calc(72px * var(--ui-scale));` — **72 px, not 64** — and it has
> read 72 since `2a00f98e` (2026-08-29, #579), 17 days before this dossier was
> written. It was 72 on `e044a3e8` too, so this is **not drift**: the citation
> was already wrong when the measurement window opened, which is the failure
> `docs/AGENT_WORKFLOW.md` §4 says a delta pass is blind to.
>
> **The 64 px is real and lives one file away, inside the very breakpoint this
> dossier is measuring.** `src/ui/hud/hud.css:4762`, inside the
> `@media (max-width: 720px)` block opened at `:4642`, read verbatim:
>
> ```
>   .ui-tab { min-width: calc(64px * var(--ui-scale)); padding: var(--space-2); }
> ```
>
> So the measured saturation, the 320 px sum and the break point at 359 px all
> stand exactly as reported — the phone override is what floors the buttons —
> and only the pointer moves: **`hud.css:4762` for the phone rule,
> `primitives.css:434` for the 72 px it overrides.** #1192's own body quotes
> `calc(72px * var(--ui-scale))` correctly, so the two documents disagreed and
> the issue was the one that was right.

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

> **THE PARENTHESIS IS FALSE AND OPTION 3 IS THEREFORE CHEAPER THAN IT IS
> PRICED ABOVE. The wrong sentence is kept rather than deleted**, because it is
> an **absence** claim — *"none exists"* — and §4 names that as the sentence
> form that rots first; deleting it would hide the example.
>
> `src/ui/primitives/tab-button.ts:50` is indeed the label span
> (`      element('span', { className: 'ui-tab__label', text: options.label }),`),
> but it is **not the button's only child**. The line immediately above it,
> `src/ui/primitives/tab-button.ts:49`, reads
> `      createIcon(options.icon, 'lg'),` — and `icon` is a required `IconId` on
> the options type (`src/ui/primitives/tab-button.ts:26`). **All five sections
> already name a distinct icon**, at `src/ui/hud/hud.ts:90-99`: `overview`,
> `build`, `rooms`, `security`, `regime` — and all five are drawn as path lists
> in `src/ui/primitives/icon.ts` (`:60`, `:61`, `:62`, `:63` and `:51`).
>
> **This was also already true on `e044a3e8`** (checked with
> `git show e044a3e8:src/ui/primitives/tab-button.ts`), so again it is not
> drift — it was false when written. **What survives is the second half of the
> cost**, which is the one that is a product argument rather than a work
> estimate: an icon-only bar takes the section name off the screen, and that is
> tie-break rung 4. The authoring cost is zero. Whether the existing icons read
> as their sections *without* the name is unmeasured and is a playtest, not a
> ruler — the same shape of gap this dossier already names for option 4's
> discoverability.

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
(Read with the repin above: the declaration that would move is
`src/ui/hud/hud.css:4762`, the phone override, **not** `primitives.css:434`.)
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

## Still owed by the owner, checked 2026-09-16 rather than assumed

**All three are still open, and the three dossiers have been delivered.** The
distinction matters: what is owed is the *ruling*, not the write-up.

| decision | state, read off GitHub and off the tree on 2026-09-16 |
|---|---|
| **#1201** — `DismissAlert` has no phone route | **open.** Dossier 1 is posted on it as a comment (2026-09-15T21:22:01Z), naming this file §1 as the durable copy. No reply, no ruling |
| **ADR 0115** — where the prisoner roster lives | **still `Proposed`.** Its Status block reads *"**Proposed.** Nothing here is decided and no code implements it."* — unchanged by this PR, which only added measurements under it |
| **#1192 follow-up** — the tab bar's remaining slack | **open.** Dossier 3 is posted on it as a comment (2026-09-15T21:22:27Z), naming this file §3. No reply, no ruling |

**None of the four rulings of 2026-09-16 is a ruling on any of these three.**
Two of them change what the three are worth deciding — see the section near the
top — and none of them answers one. A reader who sees "the owner ruled on
2026-09-16" and infers that this file is spent would be wrong.

**The `RemoveWall` ruling is the one to read as a shape rather than as content**,
because it is the outcome none of the three option lists here offers: *leave the
behaviour, file an issue* ([#1270](https://github.com/woogitsu/lockstate/issues/1270)).
Dossier 1's option A and dossier 3's option 1 are each the do-nothing, but each
is priced as *accept and write it down*; "leave it and track it" is a third
position, cheaper than writing a carve-out into ADR 0112 and more honest than
silence. It is not added to the option lists above, because adding an option
after the dossier was delivered would change the question the owner is holding.

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
- **Every `file:line` this document introduces was re-opened on the merge
  commit and read, rather than sampled.** Three moved (`hud.ts:1827`, `:1846`,
  `:1920`), one was mis-pinned from the start (`primitives.css:434`) and one
  named the test rather than the assertion (`unplaced-surfaces.spec.ts:226`);
  all five are marked in place above with the verbatim line at the new
  coordinate. **No figure taken from the DOM was re-measured in a browser**, and
  it is not claimed to have been: what was checked instead is that no `.css`
  file under `src/ui/` moved between `e044a3e8` and the merge, which makes the
  geometry stand on an unchanged stylesheet but is weaker evidence than a second
  run.
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
