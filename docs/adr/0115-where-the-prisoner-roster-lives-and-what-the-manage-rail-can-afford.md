# ADR 0115: Where the prisoner roster lives, and what the Manage rail can afford

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`. **The arithmetic, performed rather than trusted.** That
> file's own *Next free number* line reads **0115**. Swept 2026-09-14 from this
> worktree at `e221e927`, after `git fetch --all`: every remote head read with
> `git ls-tree --name-only <head> -- docs/adr/`, **366 heads**. The highest
> four-digit prefix on any of them is **0114**, and nothing at 0115 or above
> appears on any.

## Status

**Accepted, 2026-09-16, by the repository owner: option 4 — split the panel in
code, and both halves stay on the Plan dnia (Regime) tab.** That is the whole of
the question this document asks, so the Status moves; what it does not move is
stated three paragraphs down rather than left to be inferred. **Nothing under
`src/` implements it, and the ruling does not by itself change that** — it
settles which arrangement is right, not that it is built.

*The paragraph replaced here read:* **"Proposed.** Nothing here is decided and no
code implements it. It exists because `docs/IDENTITY_V5_ROLLOUT.md` stage 5 lists
the Regime panel's split as something the stage *owes* — *"a code change rather
than a mount move"* — and because the measurement taken while doing the rest of
stage 5 says the split is not a code change with one obvious shape. `AGENTS.md`'s
standing mandate is to decide rather than ask; this is the case it excepts, and
the reason is set out in "Why this is not ours to decide" below." *It is quoted
rather than deleted, because every argument below it was written from a position
this document no longer holds, and because the sentence naming this as the case
the mandate excepts is what makes the ruling's provenance worth recording at
all.*

**The provenance is the weaker of the two kinds this repository distinguishes,
and it is recorded here rather than left to be inferred.** The owner did not
type a sentence. They were shown the options this document prices, in a
clickable question an agent session had written, and chose the one labelled:

> Opcja 4 — rozbij panel w kodzie, obie połowy na Plan dnia (zalecane)

("Option 4 — split the panel in code, both halves on Plan dnia (recommended).")
That is the same provenance `CLAUDE.md` flags for the 2026-09-08, -09 and -10
releases inside reservation 3, and the same
[ADR 0091](./0091-what-clears-the-refusal-band.md) and
[ADR 0116](./0116-whether-a-finished-object-is-an-event.md) record of themselves.
It is weaker than a quoted instruction in exactly one way that matters here:
**the option's own label is the whole of what was agreed.** What was agreed is
the ARRANGEMENT — two panels in code, both mounted on Plan dnia — and not any of
the implementation this document declines to write under it.

**What was declined, and it was declined with a measurement in front of it.**
Option 2, the roster as a third panel on Manage, was priced before the question
was put: a stub of the roster's own measured height inserted into `.hud__side`
above the Staff panel takes the Staff panel to **51.56 px at 375x812** and
**14.88 px at 900x600** as `flex: 0 0 auto` — against `--tap-target`'s 44 px, one
row or less of a panel carrying Hire, the coverage sentence, the payroll fold and
three Dismiss controls. **That figure is not this document's and was not
re-taken here**: it is the 2026-09-15 dossier's, filed as
[#1242](https://github.com/woogitsu/lockstate/pull/1242), which also corrects
three of the six columns of this document's own measurement table. Options 1 and
3 were on the same list and were not chosen.

**What this ruling does NOT settle, stated because the option this document
wrote describes itself as provisional.** Below, option 4 is priced as the one
where *"the placement stays one decision away"*, and §"Why this is not ours to
decide" argues that the question is better answered **after**
[#1167](https://github.com/woogitsu/lockstate/issues/1167) gives Plan dnia its
first write surface. The label the owner chose names the placement — *obie
połowy na Plan dnia* — so the placement is ruled and not deferred; the argument
for re-opening it after #1167 is kept below rather than deleted, and re-opening
it would be a fresh ruling rather than the discharge of this one. Nothing here
authorises moving either half to Manage later without asking again.

## Context

### What the delivery asks for

`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:66-72` gives the
five sections' contents in a two-column table, quoted verbatim and never
edited:

| Sekcja | Zawartość |
|---|---|
| Zarządzaj | Personel, osadzeni, przyjęcia |
| Plan dnia | Harmonogram i edycja bloków |

*osadzeni* is inmates and sits under Zarządzaj; *Harmonogram i edycja bloków*
is the schedule and its block editing, and sits alone under Plan dnia. Today
`src/ui/hud/regime-panel.ts` paints both in one panel on one tab, so Plan dnia
carries all three of the day blocks, the prisoner roster and the prisoner
inspector.

### What that table is worth, stated before it is used

`docs/research/2026-09-14-the-mechanical-navigation-move.md` §8 names its own
weakest claim and it is this table: four Polish nouns, translated once, in the
*delivery's* wording — evidence of what was asked for, never put to the owner
as a ruling. Three of that document's four open questions **were** ruled on,
on 2026-09-14. **The roster was not one of them.** So there is no ruling on
this row, only a table, and this ADR does not treat the table as one.

### What the measurement adds

Taken on `e221e927` in a real Chromium through the UI harness, with the
fullest content each block can draw (`tests/browser/operations-reachability.spec.ts`
seeds the same prison):

| viewport | `.hud__side` | Intake | Staff | Staff's shortfall | Regime panel, whole | its roster half alone |
|---|---|---|---|---|---|---|
| 1440x900 | 413 | 161 | 577 | 0 | 389 | 220 |
| 1024x768 | — | 161 | 502 | **75** | 389 | 220 |
| 900x600 | 405 | 161 | 342 | **177** | 389 | 220 |
| 375x812 | 391 | 143 | 361 | **178** | 359 | 202 |

All figures in CSS px. "Shortfall" is `scrollHeight - clientHeight` on the
Staff panel: how much taller its content is than the box the rail gave it.

**The Manage rail is already over its budget at three of the four viewports**,
and the Staff panel is what absorbs it — `.ui-panel.hud-staff` is
`overflow-y: auto` and `.ui-panel.hud-intake` is `flex: 0 0 auto`, which is
the arrangement the 2026-09-14 move chose and recorded in `hud.css`: the panel
whose height is bounded by `INTAKE_STAGES` keeps its natural height, and the
panel whose height grows with a roster scrolls.

**Moving the roster to Manage adds a third occupant that grows with the
population to a column that is already 178px short at phone width**, and the
roster is 202px there before its panel chrome or the six-need inspector under
it. There is no arrangement of three such panels that does not take height from
one of the two already there. That is the decision, and it is a product
decision about what a player should see at once, not a layout detail.

### THE TABLE ABOVE DOES NOT FULLY REPRODUCE, AND IT IS KEPT RATHER THAN
### OVERWRITTEN BECAUSE WHICH HALF FAILED IS THE INSTRUCTIVE PART

Re-measured 2026-09-15 on `e044a3e8` (99 commits after `e221e927`), in a real
Chromium through `tests/browser/ui-harness.html`, with the `busyPrison()`
fixture copied **verbatim** out of `tests/browser/operations-reachability.spec.ts`
— which is the fixture the paragraph above names. Then re-run a second time in a
detached worktree checked out at `e221e927` itself, the commit the table was
taken on, with the same instrument: **every figure came back byte-identical
between the two trees.** So nothing below is drift. The tree did not move; the
fixture the table claims was not the fixture the table used.

**Three of the six columns reproduce exactly.**

| column | ADR's figure | re-measured, both trees |
|---|---|---|
| `.hud__side` (Day plan) | 413 / — / 405 / 391 | **413.38 / 413.38 / 405.38 / 391** |
| Regime panel, whole | 389 / 389 / 389 / 359 | **389.38 / 389.38 / 389.38 / 359** |
| its roster half alone | 220 / 220 / 220 / 202 | **219.63 / 219.63 / 219.63 / 202.44** |

**Three do not.**

| viewport | Intake, ADR | Intake, measured | Staff, ADR | Staff, measured | shortfall, ADR | shortfall, measured |
|---|---|---|---|---|---|---|
| 1440x900 | 161 | **268.44** | 577 | **526.88** | 0 | **177** |
| 1024x768 | 161 | **268.44** | 502 | **394.88** | 75 | **309** |
| 900x600 | 161 | **268.44** | 342 | **234.88** | 177 | **400** |
| 375x812 | 143 | **250.44** | 361 | **253.56** | 178 | **388** |

**Where the Intake column came from is now known, and it is not the busy
prison.** Mounting the HUD shell and pressing Manage with **no view model
published at all** — the harness's own defaults, an empty prison — gives
`.ui-panel.hud-intake` at **161.00** at 1440x900 and **143.00** at 375x812.
Those are the ADR's two numbers to the pixel. The Staff column matches neither
fixture (defaults give 320.56 and 307.38), so the table mixes at least two
seedings and possibly three.

**The conclusion the ADR draws from the table survives, and gets stronger.** The
claim was that the Manage rail is already over its budget at three of four
viewports with the Staff panel absorbing it. Under the fixture the ADR names it
is over at **all four**, the desktop one included — and at 375x812 it is over by
**388 px** rather than 178. `tests/browser/operations-reachability.spec.ts`'s
own docblock had already recorded the desktop half of this, in the paragraph
beginning *"Re-measured under the same mutation"*: the Staff panel *"is over its
box at every viewport this file visits"*. That sentence and this ADR's table were
written about the same tree and disagree; the table is the one that was wrong.

**Nothing here is an unreachability.** `.ui-panel.hud-staff` is
`overflow-y: auto` (`hud.css`, pinned by that spec's own computed-`overflow-y`
test), so a shortfall is a scroll, not a lost control. "Over budget" in this
document means *the player scrolls*, and `operations-reachability.spec.ts` is
what keeps it meaning only that.

### What a third panel actually costs, measured rather than reasoned

The option list below said *"something on Manage has to give way"* without saying
how much. Measured 2026-09-15: a stub panel of the roster's own measured height
(202 px at phone, 220 px elsewhere) inserted into `.hud__side` above the Staff
panel, on Manage, with the busy prison. `.hud__side`'s own height never moves —
it is bottom-anchored and capped — so the whole cost lands on the one panel that
flexes.

| viewport | Staff box today | roster as `flex: 0 0 auto` | roster as a second `auto` scroller |
|---|---|---|---|
| 1440x900 | 526.88 (177 short) | 306.88 (397 short) | 401.02 (303 short) |
| 1024x768 | 394.88 (309 short) | 174.88 (529 short) | 300.28 (404 short) |
| 900x600 | 234.88 (400 short) | **14.88** (620 short) | 173.73 (461 short) |
| 375x812 | 253.56 (388 short) | **51.56** (590 short) | 192.17 (450 short) |

**At 900x600 the Staff panel becomes 14.88 px tall and at 375x812 it becomes
51.56 px** — against `--tap-target`'s 44 px, that is one row of a panel that has
to carry Hire, the coverage sentence, the payroll fold and three Dismiss
controls. Constitution article 7's *"Docelowe pola dotykowe mają co najmniej
44 x 44 px"* is not broken by it (the controls keep their size and the panel
scrolls), but the panel stops being a readable surface, which is tie-break rung
3, *"Czytelność i orientacja w świecie."*

**And the phone cannot buy its way out with the Layout menu.** The phone rail is
a sheet whose height the player can drag, but `hud-layout.ts` caps it at
`min(viewport.height x SHEET_MAX_VIEWPORT_FRACTION, viewport.height -
SHEET_VIEWPORT_RESERVE_PX)` — the delivery's own *"maks. około 66% wysokości"*
and *"i rezerwa 210 px"* — which at 812 px is **535.92 px**, and
`DEFAULT_SHEET_HEIGHT_PX` is **536**. Measured, `.hud__side` on Manage at
375x812 is **536.00**: the sheet opens at its ceiling and there is no slider
travel left. So on a phone the roster is paid for out of the Staff panel or it
is not paid for.

## The options, with what each costs

1. **Leave the Regime panel whole on Plan dnia.** Free, ships nothing, and
   leaves one section's contents disagreeing with the delivery's table. Nothing
   is unreachable: every control and readout in the panel is laid out and
   pressable at all four viewports today.
2. **Split it, and put the roster on Manage as a third panel.** Follows the
   table. Costs the measurement above: something on Manage has to give way, and
   naming which is itself a ruling nobody has made. **Priced 2026-09-15**: the
   Staff panel is what gives way, and it goes to **51.56 px at 375x812** and
   **14.88 px at 900x600** if the roster keeps its natural height, or to 192.17
   and 173.73 if the roster scrolls too. Nothing becomes unreachable — both
   panels scroll — and nothing on the map is lost, because `.hud__side` is
   capped and does not grow.
3. **Split it, and put the roster on Manage *instead of* one of the two panels
   there.** Follows the table and pays for it honestly, but moves a surface the
   owner ruled onto Manage eight hours before this was written.
4. **Split the panel in code and keep both halves on Plan dnia**, so the split
   exists as two panels and the placement stays one decision away. Cheap,
   reversible, and it is the only option that changes nothing a player sees.

## Why this is not ours to decide

> **ANSWERED 2026-09-16, AND THIS SECTION IS KEPT RATHER THAN RETIRED WITH THE
> QUESTION.** It is the argument that sent the question to the owner, and the
> Status block above is only legible beside it. Read every sentence below as the
> case for asking, made before the answer existed.

`AGENTS.md`'s fourth reservation is about promises to a player, and its standing
mandate is to decide rather than ask. Neither reaches this. What is open here is
**what a section contains**, which is the same class of question the owner
answered three times on 2026-09-14 — intake's section, materials' section, and
what seeds Przegląd — each as a ruling rather than as work an agent did. A
fourth row of that same table is a fourth ruling, and an agent choosing it would
be choosing the kind of thing the three before it were put to the owner for.

Constitution article 5 is the other half: a section that opens onto nothing is a
screen that looks like state and is not — which is why ruling 1 and ruling 4
had to land together on 2026-09-14. The same coupling applies here in reverse:
taking the roster off Plan dnia leaves that section holding two classification
rows and nothing else.

**And that last sentence has an expiry date, which is the one thing here that
is already decided.**
[ADR 0113](./0113-how-a-regime-is-edited-and-whose-day-it-is.md) was accepted
in full by the owner on 2026-09-14: Plan dnia gets a genuine editing surface,
per classification group, with an `EditRegimeBlock` command, and the first
slice is tracked in
[#1167](https://github.com/woogitsu/lockstate/issues/1167). So the section that
looks thin without the roster **today** is the section that gains the only
write surface it has ever had. The argument for keeping the roster there to
stop Plan dnia being empty weakens as #1167 lands, and the argument from the
delivery's table does not move — which is a reason to answer this after #1167
rather than before it, and a reason not to spend a change on it now.

## The recommendation, and it is deliberately the smallest one

> **RULED 2026-09-16: the owner chose option 4, which is what this section
> recommends.** So this is a recommendation the ruling agreed with rather than
> one it overrode, and the sentences below keep their tense deliberately — they
> are what the owner was shown. The one clause the ruling narrows is *"let the
> placement be a one-line mount change afterwards"*: the placement is now ruled,
> and the one-line change it describes would need a fresh ruling to spend.

**Option 4**, if anything is done before the owner answers: split the panel in
code, keep both halves mounted on Plan dnia, and let the placement be a
one-line mount change afterwards — the same shape the 2026-09-14 move's own
commit sequence used for intake (§6 step 3 of the navigation-move record:
*"Either is a one-line `setVisible`/gate change… so the sequencing cost of
waiting for the answer is zero"*).

**This document does not implement it.** Stage 5's own exit criterion is that
nothing is unreachable, and every row of the Regime panel is reachable today at
all four viewports. Splitting a working panel to satisfy a table that has never
been ruled on would be spending a player-visible change on an unanswered
question.

## The weakest claim here, and what would change my mind

**Restated 2026-09-15, because the pass that priced the options found this
claim was the sound half of a table whose other half did not reproduce.** The
roster figures (202.44 / 219.63) re-measure exactly; the Intake and Staff
figures beside them do not, and the section above says which fixture each came
from. The weakness below is unchanged and still the right one to name.

**That the roster's 202-220px is what it would cost on Manage.** It is the
block's height *in the panel it is in today*, at the rail's own width, with four
roster rows and no prisoner selected. A roster panel of its own carries panel
chrome this measurement does not include, and a selected prisoner adds the
six-need inspector, which this measurement also does not include. Both make the
number larger, so the direction of the error is known and the conclusion is
conservative — but the figure is a floor, not an estimate.

What would change my mind about the recommendation: **a ruling**. There is no
measurement that settles which section a subject belongs to.
