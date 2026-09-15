# What stage 5 checked, row by row, and what it found

**Stage 5 of the identity rollout (issue #1161, epic #1155).** Taken in
worktree `/workspace/stage5-ops`, branch `agent/1161-operations`, on `e221e927`
(v0.0.620) — `origin/main` as it stood after the six changes of 2026-09-13 and
-14: the type scale (#1158), the layout shell (#1159), the navigation move
(#1190), the build loop's figures (#1160), the alerts empty state (#1184) and
the language picker (#663).

**What this document is and is not.** It is not a second inventory.
`docs/research/2026-09-13-every-hud-surface-and-where-the-five-sections-put-it.md`
(#1156) is the inventory and
`docs/research/2026-09-14-the-mechanical-navigation-move.md` is the
control-level map under it; this is the **check** stage 5 was given — issue
#1161's *"No command that was issuable before is unreachable after"* — run
against those two lists one row at a time. Where a claim in either has gone
stale it is recorded here rather than edited there, per this directory's own
rule that a record becomes older rather than wrong.

**How every claim here was obtained.** VERIFIED throughout in
`docs/research/README.md`'s sense, and in two distinct ways which are never
mixed:

- **Read.** Each `file:line` was opened in this worktree, and each tally was
  re-derived by grep rather than inherited.
- **Measured.** Every pixel figure and every reachability verdict was taken in
  a real Chromium through `tests/browser/`, at the viewport named beside it.
  Nothing below is a layout claim made by reading CSS.

Two new gates carry the measurements so that they are re-runnable rather than
quoted: `tests/browser/operations-reachability.spec.ts` (14 specs) and
`tests/browser/unplaced-surfaces.spec.ts` (7 specs). Both carry their own
mutation tables.

---

## 1. The seventeen commands: all seventeen are still issued, and all seventeen from one file

`simulationCommandSchema` (`src/simulation/protocol/commands.ts`) is unchanged
at seventeen members. Each literal was grepped as `type: '<Command>'` across
`src/` on this checkout. **Every one has exactly one submission site and every
site is still in `src/main.ts`**, which is #1156 §4's finding re-derived rather
than inherited — and **every line number in that table has moved**, because
`src/main.ts` grew by roughly 250 lines over the two days.

| Command | #1156 §4 said | Is now | Reached from |
|---|---|---|---|
| `PlaceBuildOrder` | `main.ts:2679` | `main.ts:2928` | Build panel / build tool |
| `CancelBuildOrder` | `:2516` | `:2760` | Build panel queue row |
| `PlaceObject` | `:2729` | `:2978` | Build panel / object tool |
| `RemoveObject` | `:2788` | `:3037` | Build panel / object tool |
| `RemoveWall` | `:2781` | `:3030` | Build panel / build tool |
| `PurchaseMaterials` | `:2980` | `:3229` | Build panel materials block |
| `SellMaterials` | `:3017` | `:3266` | Build panel materials block |
| `CancelMaterialPurchase` | `:2549` | `:2793` | Build panel deliveries row |
| `ZoneRoom` | `:2826` | `:3075` | Rooms panel / room tool |
| `UnzoneRoom` | `:2857` | `:3106` | Rooms panel / room tool |
| `AdmitPrisoner` | `:3142` | `:3391` | Intake panel — **now on Manage** |
| `HireStaff` | `:3217` | `:3466` | Staff panel roles block |
| `DismissStaff` | `:2614` | `:2858` | Staff panel roster row |
| `ReleaseGuardAssignment` | `:2583` | `:2827` | Staff panel held-guards row |
| `DismissAlert` | `:2648` | `:2897` | Alerts list row — **see §4** |
| `Undo` | `:2459` | `:2690`, `:2703` | Status strip |
| `Redo` | `:2463` | `:2707` | Status strip |

### The tab gates moved with the ids, completely

`src/main.ts` holds nine `activeTab !== '<id>'` guards on projection refreshes
and nine mirrored `activeTab === '<id>'` calls in the `select-tab` handler.
All eighteen were read. **None is on a retired id**: `build` twice, `manage`
four times (held guards, staff roster, staff coverage, intake pipeline),
`day-plan` three times, in both directions. The intake gate is `'manage'`
(`main.ts:2083`, `:2552`) and the Intake panel's mount is `'manage'`
(`hud.ts:2511`) — the pair a mount move most easily leaves disagreeing, and
they agree.

The Rooms readout has no tab gate at all, which is correct and is not a
regression: `main.ts:2024` records that the `activeTab !== 'rooms'` guard was
deliberately removed on 2026-09-05 because the status strip's `ROOMS` badge
reads the same readout from every tab.

### Measured: every operational control is pressable, at four viewports

`tests/browser/operations-reachability.spec.ts`, against a prison seeded to
make every block as tall as that block can be. Three questions per control —
does the browser give it a box, can its panel bring it inside its own fold, and
does `elementFromPoint` at its centre answer the control — at the three device
tiers plus 900x600, the shortest rail in the suite.

**Manage (Intake + Staff), eleven controls, all four viewports: pass.**
`Admit a prisoner`; `Who to hire`; the role row; `Hire Guard · 80`; three
`Release`; the payroll header; three `Dismiss`. None disabled, none clipped
beyond what its panel can scroll to, none covered.

**Build (materials and deliveries), all four viewports: pass.** The `Buy`
control and both delivery-row `Cancel` controls.

**And the presses still raise the intents they name**, checked at 1440x900:
`select-tab`, `admit-prisoner`, `hire-staff`, `release-guard` — the last
carrying `guardId: 1`, the guard the row was aimed at, because a release aimed
at the wrong guard is #912's defect and a bare `kind` cannot see it.

### The rail's height budget, measured, because Manage now spends it twice

| viewport | `.hud__side` | Intake panel | Staff panel | Staff's shortfall |
|---|---|---|---|---|
| 1440x900 | 413 | 161 | 577 | 0 |
| 1024x768 | — | 161 | 502 | **75** |
| 900x600 | 405 | 161 | 342 | **177** |
| 375x812 | 391 | 143 | 361 | **178** |

CSS px; "shortfall" is `scrollHeight - clientHeight`. The 2026-09-14 move's own
answer holds and is now asserted rather than described: the Intake panel pays
for its own content at every viewport (`panelOverflow` and `bodyOverflow` both
0, the over-admission warning and all three stage lines on screen), and the
Staff panel is what gives way and can, because it scrolls.

**The measurement that is worth more than the pass.** Turning
`.ui-panel.hud-staff`'s `overflow-y` from `auto` to `hidden` left **thirteen of
the fourteen** specs green. `scrollIntoView` scrolls an `overflow: hidden` box
as willingly as an `overflow: auto` one — programmatic scrolling is not the
affordance a player has — so a per-control reachability sweep certifies a panel
no finger and no wheel can reach. The separate assertion on the computed
`overflow-y` is what catches it. Any future spec in this repository that asks
"is this control reachable" by scrolling to it first inherits this hole.

---

## 2. The fifteen projections: ten read, five unread, unchanged

Each member of `PROJECTION_IDS` (`src/simulation/protocol/types.ts:331-347`)
grepped as a string literal across `src/ui/`, `src/rendering/` and
`src/main.ts`. **Ten with a reader, five without**, identical to #1156 §3 and to
`tests/foundation/projection-reachability-contract.test.ts`'s split. The five
with a route and nobody on it are still `hud/security`, `hud/contraband`,
`hud/incidents`, `hud/incident-detail` and `world/render-snapshot`.

`hud/staff` still has **two** readers — `simulation-staff-coverage.ts:124` and
`simulation-staff-roster.ts:154` — so eleven modules read ten ids, and the
contract test's docblock is still one short in its prose exactly as #1156 §6
item 3 records. Nothing about the navigation move changed either half.

**So "security, contraband and incidents keep full function" is, as #1156 §1
already said, a promise about surfaces that do not exist.** Stage 5 confirms it
has not become less true: no reader was added, none was removed, and no route
was deleted. There is nothing here to lose and nothing here to check beyond
that.

---

## 3. The eleven unplaced surfaces, measured at three device tiers

`tests/browser/unplaced-surfaces.spec.ts`, on the assembled page.

| Surface | Desktop 1440x900 | Tablet 1024x768 | Phone 375x812 |
|---|---|---|---|
| Status strip | laid out | laid out | laid out |
| Brand badge | laid out | laid out | laid out |
| Events band | present, no box | same | same |
| Refusal line | present, no box | same | same |
| Unavailable band | present, no box | same | same |
| Alerts list | present, no box | present, no box | **corner dropped** |
| Minimap frame | laid out | laid out | **no box** |
| Zoom control | laid out | laid out | **no box** |
| Save panel | laid out, four controls pressable | same | same |
| Display-scale control | laid out, cycle pressable | same | same |
| Telemetry consent prompt | *read, not measured* — see below | — | — |
| `src/ui/account/` | no surface, as before | — | — |

**Two rows of that table are read rather than measured, and are marked so.**
The telemetry consent prompt is appended to `appRoot` only inside
`if (telemetry.enabled && appRoot !== null)` and then only when
`pipeline.shouldAskForConsent` (`main.ts:3963-3973`) — so in the dev-server
page the browser suite opens it is correctly absent from the DOM entirely, and
a presence assertion on it would be asserting the wrong thing. It was read at
that call site and confirmed unchanged, not measured. `src/ui/account/` has no
surface to measure at all.

Three of the measured rows are conditional by design and *present with no box*
is the correct state: the unavailable band only when the worker could not start
(#220), the refusal line only after a refusal (#207), the events band only when
an event arrives.

**Nothing has been deleted and nothing has quietly lost its mount.**
`src/ui/account/`'s four modules still have no consumer outside their own
directory — `projectSaveList`, `projectCloudSlotAvailability`,
`loadAccountPreferences` and `AccountSessionState` grepped across `src/`, every
caller a test — which is unchanged from #1156 §1.

**Two surfaces moved slots since #1156 took its walk**, and both are
additions rather than losses. The display-scale control and the theme control
now sit inside a `hud-chrome-prefs` row appended to the rail's aside slot
(`main.ts:3596`, `:3645`, `:3731`) rather than being appended directly; and a
twelfth surface exists that #1156 could not have listed — the **language
picker** (#663), mounted into `HudLayoutShell.preferencesSlot`
(`main.ts:3732`, slot at `layout-shell.ts:543`), which lives inside the Layout
menu body. It is measured with the menu open: laid out and pressable at all
three tiers, along with the menu's clock row.

**One thing an inventory reader would get wrong.** The save panel is still
mounted in the rail's aside slot and is *not* inside the tab system, which is
what the owner's fourth ruling of 2026-09-14 decided. But opening the Layout
menu covers it: with the menu open, the save panel, the display scale and the
theme control all fail a hit test at their own centres, because the menu is
over them. That is what a menu is and it is not a finding — it is recorded only
so that the next person who measures those three with a menu open does not
report it as one.

---

## 4. The finding: `DismissAlert` is unreachable on a phone, and no rollout document says so

`.hud__corner` — which holds the minimap frame, the zoom control and the alerts
list nested inside the minimap panel — is `display: none` at 720 CSS px and
below. Measured: `getComputedStyle('.hud__corner').display` is `flex` at
1440x900 and 1024x768 and `none` at 375x812.

This is **deliberate, documented and pre-existing.** The rule lives inside
`@media (max-width: 720px)` at `hud.css:4704`; three copies of a correction
under #1117 say so in that file's own prose; and `app-shell.spec.ts`'s #88
sweep exempts the controls that fall with it through
`NEVER_LAID_OUT_BELOW_720`. **Stage 5 did not cause it and this document does
not claim it did.**

What no document in the rollout says out loud is the consequence:
**the alerts list is the only surface that issues `DismissAlert`
(`main.ts:2897`), so one of the seventeen commands cannot be issued at phone
width.** #1156 §4 comes closest — *"a re-skin that rebuilds the navigation
without rebuilding the strip and the alerts list loses three of the
seventeen"* — but it is about a hypothetical re-skin, and the state it warns
of is the state today at one of the three device tiers the delivery names.

**This is an owner question and it is asked here rather than answered.** The
three surfaces are all on #1156 §1's unplaced list, and ADR 0112's rule for an
unplaced surface is that it goes to the owner if and when a stage needs an
answer for it. Stage 5 is the stage that needs one, because "keeps full
function" and "one of the seventeen commands is unreachable on a phone" cannot
both be true.

`tests/browser/unplaced-surfaces.spec.ts` **records** the state at all three
tiers rather than asserting the phone one is right, so that whichever way the
answer goes, the change shows up in a diff.

---

## 5. Where the two lists have gone stale

Recorded, not edited: `docs/research/README.md`'s rule is that a record becomes
older rather than wrong.

1. **Every `main.ts:NNNN` in #1156 §2 and §4** — see §1's table above. The
   *structure* those tables describe is exactly right; only the line numbers
   moved.
2. **#1156 §1's Intake row** — *"shown on `overview` at `hud.ts:2369`"*. It is
   `manage` at `hud.ts:2511`, by the owner's ruling of 2026-09-14. The row's own
   last sentence — *"this is the strongest candidate for a section change and it
   is not one the direction makes"* — was right and has since been answered.
3. **#1156 §1's and §2's tab ids** — `rooms`, `security` and `regime` are
   `zones`, `manage` and `day-plan`. `hud-state.ts:34-60` carries the mapping.
4. **#1156 §2's "The five tabs and their panels" table** is now five tabs and
   **six** panels: the Overview panel (#1183) is new and `overview` is no longer
   the Intake panel's tab.
5. **#1156 §5's "unsettled" column** — three of its rows were ruled on
   2026-09-14 (intake to Zarządzaj, materials and deliveries stay on Buduj,
   Przegląd gets its own readout and the save panel stays in the rail). The
   prisoner-roster row was **not**, which is ADR 0115's subject.
6. **The navigation-move record §2's control count of 16** is a count of
   *command-issuing* controls across all five tabs and is not comparable with
   the eleven this document measures on Manage, which includes two section
   headers and a role row. Both are right about different things; noted because
   the two numbers sit one document apart and invite being read as a
   contradiction.

**Not a rot, but the thing an inventory cannot catch and this check could:**
every claim in both documents is about *what is mounted where*, and none is
about *what a player can press*. The two are different questions at the tier
where `.hud__corner` disappears, which is how §4 went unreported through two
research documents that were both correct.

---

## 6. What stage 5 does not close

- **The Regime panel's split.** `docs/IDENTITY_V5_ROLLOUT.md` stage 5 lists it
  as owed. It is filed as
  [ADR 0115](../adr/0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md)
  and deliberately not implemented: the measurement says the Manage rail cannot
  take a third panel without something already there giving way, naming which is
  a ruling nobody has made, and every row of the panel is reachable today.
- **The phone alerts question of §4.**
- **`hud/security`, `hud/contraband`, `hud/incidents` and `hud/incident-detail`**
  still have no reader. Building surfaces for them is not a re-skin and is not
  this stage.
- **The 200%-page-zoom debt** stage 2 handed stage 3 and stage 3 did not clear
  (23 of 36 combinations, `d7aab8d8`). Not re-measured here; nothing in this
  stage touched it.

---

## 7. The weakest claims here, and what would change my mind

**The weakest is that the reachability sweep is the right question.** It asks
whether a control has a box, whether its panel can bring that box into view, and
whether anything is over it. It does **not** ask whether a player would ever
find it: the brief's own second definition of lost — *"a control that moved to a
section where nobody will look"* — is not measurable by any of these three, and
nothing in this document addresses it. What would change my mind is a playtest;
`tests/browser/*.playtest.ts` is where one would go and none was run for this.

**The second weakest is the seeded prison.** Every measurement in §1 is taken
against one view model, chosen to make each block as tall as that block can
draw. It is an argued worst case, not an enumerated one: a locale with longer
words, a seven-figure payroll, or a role catalogue with more than one entry each
make a panel taller than what was measured. The pseudo-locale sweep
(`tests/browser/pseudo-locale-sweep.spec.ts`) is the existing gate for the first
of those and was not extended here.

**The third is §3's completeness**, and it inherits #1156 §7's own version of
this doubt: the list of surfaces is the list those two documents produced, plus
the one this check found (the language picker). A surface mounted from somewhere
neither document read would be invisible to all three. The check run here was
the same one #1156 ran — the mount sites in `src/main.ts` — re-read on this
checkout, which found `chromeRow` and `preferencesSlot` and would not find a
mount inside `src/rendering/`.

**What is not weak** is §1 and §2. Every command literal and every projection id
was grepped on this checkout, every reachability verdict was measured in a real
browser at a named viewport, and both new spec files carry mutation tables with
both outputs. The two counts — seventeen of seventeen issued, ten of fifteen
read — are re-derivable by the same greps in a minute.
