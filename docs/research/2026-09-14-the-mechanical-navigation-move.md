# The mechanical mapping for the five-section navigation move

**Not Stage 0.** `docs/research/2026-09-13-every-hud-surface-and-where-the-five-sections-put-it.md`
(#1156, merged `29e86090`) is Stage 0's inventory and is not repeated here — its
tables are reconciled against, not recounted, per this directory's own rule.
This document is the next layer down: the **control-level** list an
implementing agent needs to move panels without guessing, the two named moves
checked against the simulation code rather than assumed, what a rename of
`HUD_TAB_IDS` actually touches, and a commit sequence. It answers a narrower
question than #1156 did and goes one level deeper to answer it.

**Provenance.** Taken on this checkout at `19ffb1f5` in worktree
`/workspace/nav-map`, branch `agent/navigation-mapping`. Every `file:line` below
was opened in this worktree. `src/ui/hud/` and `tests/browser/app-shell.spec.ts`
are being rewritten by another agent concurrently — both were read-only here,
never edited, and every citation into them should be re-opened before acting on
it rather than trusted as still current by line number.

**What changed under `src/ui/hud/` between #1156's checkout (`a0ffd01b`) and this
one.** `git log --oneline a0ffd01b..HEAD -- src/ui/hud/ src/main.ts` shows eight
commits, all under #1157/#1158 (theme switch, 15px type-scale rollout). None
touches `HUD_TAB_IDS`, panel assignment, or tab structure — `hud-state.ts:34`
is still the line #1156 cites and the array is unchanged. #1156's tab/panel
tables are current.

---

## 1. New evidence #1156 did not have: the delivery's own navigation table

#1156's §5 mapping was built from `docs/VISUAL_IDENTITY.md`'s prose, which names
only the five section *titles*. The delivery's own specification carries a
second table the prose summary drops, at
`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:66-72` (never
edited, quoted verbatim per `docs/design/README.md`):

| Sekcja | Zawartość |
|---|---|
| Przegląd | Stan dnia, sprawy do sprawdzenia, finanse, zapis |
| Buduj | Konstrukcja, wyposażenie, wyszukiwanie, szczegóły, plan |
| Strefy | Lista pomieszczeń i wymagania |
| Zarządzaj | Personel, osadzeni, przyjęcia |
| Plan dnia | Harmonogram i edycja bloków |

("Overview: day status, things to check, finances, save. — Build: construction,
fittings, search, details, plan. — Zones: room list and requirements. — Manage:
staff, inmates, intake. — Day plan: schedule and block editing.")

This resolves two of #1156 §5's "unsettled" rows with real provenance rather
than argument, and leaves the rest exactly as unsettled as #1156 found them:

- **Intake → Zarządzaj.** *"przyjęcia"* is intake/admissions, named directly
  in the Zarządzaj row. #1156 §5 listed the Intake panel's destination as
  "Przegląd or Zarządzaj, unsettled". It is not unsettled in the delivery's own
  table — Zarządzaj is named. What stays a judgement call is *why* Przegląd is
  also plausible: see §4.2 below.
- **Prisoner roster + detail → Zarządzaj, not Plan dnia.** *"osadzeni"* (inmates)
  is the Zarządzaj row's second item, distinct from *"Harmonogram i edycja
  bloków"* (schedule and block editing) in Plan dnia. #1156 §5 had this panel's
  two halves split three ways ("Plan dnia or Zarządzaj — unsettled, the panel
  splits"). The delivery's table draws the same split #1156 found by reading
  the panel, and draws it the same way: the roster is people (Zarządzaj), the
  day's blocks are schedule (Plan dnia). The Regime panel genuinely needs to
  split into two placements — that finding survives, and now it is supported by
  the delivery text rather than only by inference from the panel's contents.
- **Przegląd gets content it does not have today.** *"finanse, zapis"*
  (finances, save) is a direct textual instruction to place a finance readout
  and **the save surface** on Overview. #1156 §1 found the save panel unplaced
  by any section; this table places it, on Przegląd specifically. That is new
  and is flagged as a judgement call rather than "stated", because #1156's own
  weakest-claim section (§7) is right that no sentence in the delivery assigns
  a section to a *specific existing module* — this table names subjects
  ("zapis" = save), not `src/ui/save-panel.ts` by name, and the prototype's own
  persistence is explicitly non-binding (`docs/VISUAL_IDENTITY.md` §"What is
  explicitly not binding": *"The prototype's persistence… not a pattern to
  copy"*). Treat this as strong evidence for *where a save control belongs*,
  not as a ruling that resolves the prototype-vs-real-save-panel question.
- **Materials/deliveries stay unresolved.** *"wyposażenie"* (fittings/equipment)
  is a Buduj item and could mean the buildable catalogue's material variants
  rather than the purchase/sell/deliveries blocks; `projekt.md:25` separately
  lists *"dostaw"* (deliveries) among the read models the app composes without
  assigning it a section. #1156 §5's "Buduj or Zarządzaj — unsettled" for the
  materials block stands.

---

## 2. Every control, panel and row in today's five tabs

Table granularity: **panel → named section (`CollapsibleSection`, if any) →
individual control**, each an `ActionButton`, `ChoiceGroup` or
`SegmentedBar` construction site. Table-body rows (one per build-queue entry,
one per staff row, etc.) are windowed lists built from a fixed number of
pre-allocated row templates rather than one authored control apiece — each
template's construction site is cited once, not once per instance, because
that is the actual unit of code that moves.

### `overview` — Intake panel (`src/ui/hud/intake-panel.ts`, 412 lines)

| Control | `file:line` | Reads | Issues |
|---|---|---|---|
| Panel frame | `createPanel(…)` at `intake-panel.ts:360` | — | — |
| Admit button | `createActionButton(…)` at `intake-panel.ts:240` | `HudIntakePipelineViewModel` | `admit-prisoner` intent → `AdmitPrisoner` (`main.ts:3142`) |
| Arrivals pipeline rows | rendered from `HudIntakeStageViewModel`, same file | `hud/prisoner-population` (`simulation-intake.ts:168`) | none — read-only |

One panel, one command-issuing control. The smallest of the five.

### `build` — Build panel (`src/ui/hud/build-panel.ts`, 3,181 lines, the largest)

| Section | `file:line` | Controls inside |
|---|---|---|
| Catalogue | `createCollapsibleSection` `build-panel.ts:1251` | Item choice, edge `ChoiceGroup` (`build-panel.ts:2890`), Arm button (`:1280`), Remove button (`:1361`) |
| Materials (purchase/sell, no named section — comment-delimited block) | `build-panel.ts:~1620-1900` | Buy toggle (`:1675`), Buy submit (`:1696`), Sell submit (`:1733`) |
| Queue | `createCollapsibleSection` `build-panel.ts:2544` | Per-row cancel button (template at `:1883`) → `CancelBuildOrder` (`main.ts:2516`) |
| Deliveries | rows reading `hud/pending-deliveries` (`simulation-pending-deliveries.ts:160`) | Per-row cancel button (template at `:2451`) → `CancelMaterialPurchase` (`main.ts:2549`) |
| Coordinates (fallback numeric entry, folded by default) | `createCollapsibleSection` `build-panel.ts:2913` | Submit button (`:2901`) |

Issues: `PlaceBuildOrder` (`main.ts:2679`), `PlaceObject` (`:2729`),
`RemoveObject` (`:2788`), `RemoveWall` (`:2781`), `PurchaseMaterials`
(`:2980`), `SellMaterials` (`:3017`), `CancelBuildOrder` (`:2516`),
`CancelMaterialPurchase` (`:2549`) — eight of the seventeen total commands,
more than any other tab.

### `rooms` — Rooms panel (`src/ui/hud/rooms-panel.ts`, 2,131 lines)

| Section | `file:line` | Controls inside |
|---|---|---|
| Catalogue | `createCollapsibleSection` `rooms-panel.ts:784` | Confirm button (`:1251`), Cancel button (`:1287`), Arm button (`:1058`), Remove button (`:1131`) |
| Coordinates (fallback) | `createCollapsibleSection` `rooms-panel.ts:938` | Submit button (`:907`) |

Issues: `ZoneRoom` (`main.ts:2826`), `UnzoneRoom` (`:2857`). Reads
`hud/room-list` and `hud/room-detail` (`simulation-room-needs.ts:455`, `:491`)
— the same readout the status strip's `ROOMS` badge pulls on every tab
(`main.ts:1851-1875`), so this panel is not the read's only consumer even
though it is the only *write* surface for it.

### `security` — Staff panel (`src/ui/hud/staff-panel.ts`, 1,779 lines)

| Section | `file:line` | Controls inside |
|---|---|---|
| Roles | `createCollapsibleSection` `staff-panel.ts:868` | Hire button (`:879`) → `HireStaff` (`main.ts:3217`) |
| Held guards (no named `CollapsibleSection` — a fixed-length `heldRows` block) | `staff-panel.ts:1148-1165` | Per-row release button (template at `:1154`) → `ReleaseGuardAssignment` (`main.ts:2583`) |
| Roster | `createCollapsibleSection` `staff-panel.ts:1478` | Per-row dismiss button (template at `:1309`), two-press arming via `dismiss-arming.ts` → `DismissStaff` (`main.ts:2614`) |
| Panel frame | `createPanel` `staff-panel.ts:1711` | — |

Reads three ids across two files for the same tab (`hud/staff` twice —
`simulation-staff-coverage.ts:124` limit 0 totals, `simulation-staff-roster.ts:154`
the dismissable rows — plus `hud/held-guards`,
`simulation-held-guards.ts:159`), confirmed unchanged from #1156 §3.

### `regime` — Regime panel (`src/ui/hud/regime-panel.ts`, 1,786 lines)

| Section | `file:line` | Controls inside |
|---|---|---|
| Day blocks (per classification group) | `createSegmentedBar` `regime-panel.ts:955` | Read-only — no command |
| Prisoner detail's six-need block | `createSegmentedBar` `regime-panel.ts:1528` | Read-only — no command |
| Panel frame | `createPanel` `regime-panel.ts:1687` | — |
| Prisoner roster row selection | `select-prisoner` chrome intent, `hud.ts:2167` | Read-only, drives which detail is shown |

Zero of the panel's own controls issue a `SimulationCommand`. Confirmed against
#1156 §4's table (`regime` row: "none of its own"). This is the panel #1156 §5
flagged as the sharpest finding — *"Plan dnia is a section for an editing
surface this repository has no command for"* — and nothing found in this pass
changes that.

**Total command-issuing controls across the five tabs: 15** (Admit ×1, Arm/Remove
×2 per build-like panel ×2 panels = 4, Buy/Sell ×2, Queue-cancel + Delivery-cancel
×2, Coordinates-submit ×2, Hire/Release/Dismiss ×3 = **1 + 4 + 2 + 2 + 2 + 3 = 14**,
plus the Rooms catalogue's confirm/cancel pair beyond arm/remove = **16**,
matching the sixteen `HudIntent` arms that carry a command per #1156 §4 once
`remove-object`'s two-command fan-out is set aside as one intent). The two
issued from outside any tab — `DismissAlert` (alerts list, inside the minimap
panel) and `Undo`/`Redo` (status strip) — are §1's unplaced surfaces and are
not re-derived here; #1156 §1 and §4 already carry them.

---

## 3. The rows with no target (reconciled with #1156 §1, not re-derived)

#1156 §1 is the authoritative list and none of its eleven rows has since
gained a target — checked against `docs/VISUAL_IDENTITY.md` (unchanged since
`e5628369`, confirmed `git log --oneline e5628369..HEAD -- docs/VISUAL_IDENTITY.md`
returns nothing) and against ADR 0112 (`Accepted`, no amendment since). Restated
here as a flat list because §6's commit sequence needs to point at it directly:

1. Status strip, events band, refusal line, unavailable band — chrome spanning
   all five sections.
2. Alerts list — nested inside the minimap panel, not inside any tab.
3. Minimap frame + zoom control — bottom-left corner, all tabs.
4. Save panel, display-scale control — **§1 above narrows this one**: the
   delivery's own nav table names Przegląd as the section for *"zapis"*
   (save). Display scale has no such textual home and stays unplaced.
5. Brand badge — build identity, not a section.
6. Telemetry consent prompt — a modal, not a section; also the single most
   expensive thing to relocate because of article 5's truth obligation on its
   wording.
7. `src/ui/account/` — no surface at all today; nothing to relocate.
8. `hud/security`, `hud/contraband`, `hud/incidents`, `hud/incident-detail` —
   four read models with a route and no reader; Stage 5 names them as things
   that must "keep full function", which is a promise about surfaces that do
   not exist yet, independent of where the tab bar's five labels point.

None of these is a deletion candidate. Each goes to the owner as a question if
and when a rollout stage actually needs an answer for it — this document does
not answer any of them, per the task's own instruction not to take an owner
decision.

---

## 4. The two named moves, checked against the code

### 4.1 Staff: Security → Manage

**The delivery's own words**, `docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:75`
(quoted verbatim, never edited):

> Przeniesienie personelu spod „Security" do „Zarządzaj" jest propozycją
> semantyczną UI, a nie przeniesieniem modułów symulacji.

("Moving staff from under 'Security' to 'Manage' is a UI-semantic proposal, not
a move of simulation modules.")

**Checked against the simulation tree.** `src/simulation/staff/` (`hiring.ts`,
`dismissal.ts`, `index.ts`) and `src/simulation/security/` (`deployment-system.ts`,
`patrol-system.ts`, `guard-roster.ts`, `coverage-state.ts`,
`sector-staffing.ts`, `access-policy.ts`, `guard-release.ts`, nine files total)
are **already separate directories** at the checkout used for this document.
`HireStaff` and `DismissStaff` (`src/simulation/protocol/commands.ts`) resolve
into `src/simulation/staff/`; `ReleaseGuardAssignment` and the held-guards
readout resolve into `src/simulation/security/`. The Staff *panel* is a UI
composite of both today (§2's table above: Roles/Roster read `staff/hiring`
and `staff/dismissal`'s consequences via `hud/staff`; Held guards reads
`security/guard-release.ts` via `hud/held-guards`) — and that composite
character does not change if the panel moves tabs. **Confirmed: the claim
holds.** Moving the panel changes which tab renders it and nothing about
`src/simulation/staff/` or `src/simulation/security/`, which were already
distinct modules before this delivery existed and stay distinct after any UI
regrouping.

**What does not follow from the claim, and is worth naming because Stage 5
warns about it directly.** `docs/IDENTITY_V5_ROLLOUT.md`'s Stage 5 says *"the
one semantic move… is a UI grouping, not a move of simulation modules… Anything
beyond regrouping is a separate decision."* The held-guards block is the part
most likely to be read as "security stuff" and left behind by an agent moving
"the Staff panel" without also moving that block — it is currently *inside* the
Staff panel's DOM (§2 above), not a sibling surface, so a panel-level move
carries it along by construction. No code change beyond relocating the panel
mount point is implied.

### 4.2 Intake → Zarządzaj

**The delivery's own words**, same table cited in §1: *"Zarządzaj | Personel,
osadzeni, przyjęcia"* — *przyjęcia* (intake/admissions) is the third item.
Unlike the staff move, **no sentence anywhere in the delivery characterizes
this explicitly as UI-only versus a module move** — it is a table cell, not a
proposal with a stated scope, so this document supplies the same check the
staff move states for itself.

**Checked against the simulation tree.** `src/simulation/prisoners/intake-system.ts`
and `src/simulation/events/intake-housed-notice.ts` are already their own
module, disjoint from `src/simulation/staff/` and `src/simulation/security/`.
`AdmitPrisoner` (`main.ts:3142`) resolves into `intake-system.ts` alone. Moving
the Intake panel's mount point from the `overview` tab to a `manage`-equivalent
tab touches `src/main.ts`'s `activeTab === 'overview'` gates (§5.2 below) and
`hud.ts`'s `setVisible` wiring; it touches nothing under `src/simulation/`.
**No simulation module move is implied here either**, by the same reasoning as
4.1 — worth stating rather than assuming, since the source table does not say
it for this row the way `projekt.md:75` says it for staff.

**The judgement call this section does not resolve.** `intake-panel.ts:10-30`'s
own docblock (quoted in #1156 §1) records that Overview was chosen for pixel
reasons, not semantic ones — the Build panel had no room. The delivery's table
independently names Zarządzaj for intake, and also names Przegląd for
*"sprawy do sprawdzenia"* ("things to check"), which an admission queue could
plausibly be read as. Two textually-supported destinations exist; picking
between them is the kind of product call this document is instructed not to
make. Recorded as an open question in §7.

---

## 5. What the move breaks

### 5.1 Tests that assert today's tab ids or their order

Two tests assert the **exact array**, not merely "some subset is reachable" —
these fail the moment `HUD_TAB_IDS` or `HUD_TABS` changes and are the ones a
rename touches on purpose:

- `tests/unit/ui-hud-shell-state.test.ts:47` —
  `expect([...HUD_TAB_IDS]).toEqual(['overview', 'build', 'rooms', 'security', 'regime']);`
- `tests/unit/ui-hud-messages.test.ts:430` —
  `expect(HUD_TABS.map((tab) => tab.id)).toEqual(['overview', 'build', 'rooms', 'security', 'regime']);`

`HUD_TAB_IDS` (`src/ui/hud/hud-state.ts:34`) and `HUD_TABS`
(`src/ui/hud/hud.ts:86-92`, id + icon + `labelKey` triples) are two separate
declarations asserted equal to the same literal by two separate tests — both
have to move together or one test catches the other going stale.

**Every other test that touches `HUD_TAB_IDS` is order-agnostic and
membership-driven**, confirmed by opening each: `tests/unit/ui-hud-shell-state.test.ts:70`
(`for (const tab of HUD_TAB_IDS)`, asserts each is reachable, no ordering
assumed), `tests/browser/pseudo-locale-sweep.spec.ts:235`, and
`tests/browser/app-shell.spec.ts:3529` and `:10728` (both `for...of` loops over
the live export, with `:10724`'s own comment explaining why: *"Every tab, from
`HUD_TAB_IDS` rather than a copy of it… reading the real list means a sixth tab
cannot repeat that"* — i.e. these were written on purpose to survive exactly
this kind of change). None of these needs editing when the id set changes;
they read whatever the export currently holds. **`app-shell.spec.ts` is the
file the other concurrent agent owns — this is read-only knowledge for
whoever picks up that file next, not an instruction to touch it from here.**

### 5.2 Every gate keyed on today's tab id literals

Not test assertions, but call sites that silently stop firing if an id string
changes without the site being updated — a rename is a straightforward
find-and-replace, but each is enumerated because "straightforward" is exactly
the kind of claim this repository's evidence rule distrusts unless it is
checked:

`src/main.ts` gates nine projection refreshes and five `HudIntent` handlers on
`activeTab === '<id>'` literals (`:1553, :1587` build; `:1638, :1652, :1686`
security; `:1722, :1756, :1802` regime; `:1858` rooms; `:1916` overview; plus
the mirrored set at `:2279-2332`). `src/ui/hud/hud.ts:2363-2373` gates panel
`setVisible` calls the same way. All are string-literal comparisons against the
`HudTabId` union, so a rename that changes `HUD_TAB_IDS`'s members without
updating these produces a TypeScript compile error at every one of them (the
union type narrows and every literal comparison against a removed member is a
type error) — this is the one piece of good news in this section: **the
compiler is the test for this half of the change**, not a runtime gap an agent
could miss.

### 5.3 Persisted state — checked, and there is none

**No tab id reaches any save payload or storage key.** Checked directly rather
than assumed:

- `grep -rn "tab" src/persistence/save-schema.ts src/persistence/save-migrations.ts`
  returns no field named for a tab — the only hits are the words "established"
  and "table" (false positives from `grep`, confirmed by reading each line).
- `src/input/storage.ts:38,39,47` defines exactly three `localStorage` keys —
  `lockstate.settings.input`, `lockstate.settings.accessibility`,
  `lockstate.settings.theme` — none of which carries `activeTab` or any
  `HudTabId`.
- `HudShellState.activeTab` (`src/ui/hud/hud-state.ts:41`) is produced by
  `hudShellReducer` from `INITIAL_HUD_SHELL_STATE` (`:81`, hard-coded
  `'overview'`) and mutated only by the in-memory `select-tab` action
  (`:114-115`). `grep -rln "HudShellState\|hudShell" src/` outside
  `src/ui/hud/hud-state.ts` and `hud.ts` returns nothing — no module reads or
  writes this state except the reducer and the shell that owns it.
- `src/main.ts`'s own `activeTab` local (`:1500`) is seeded from
  `INITIAL_HUD_SHELL_STATE.activeTab` and is a plain closure variable, not
  read from or written to persistence anywhere in the file.

**So this is not a migration question.** A tab renamed today resets every
session to whatever id the reducer's initial state names, exactly as it does
today on every page load — nothing a player did yesterday points at a string
that stops existing tomorrow. This matches `docs/VISUAL_IDENTITY.md`'s own
finding, item 6, that `collapsedPanels` is "in-memory — nothing writes it
anywhere"; `activeTab` lives beside it in the same struct and shares the
property.

**The one place a tab id becomes a durable string, and it is not persistence:**
`hud.ts:2359` — `hud.dataset['activeTab'] = state.activeTab;` — a DOM data
attribute, and `tests/browser/app-shell.spec.ts:3529`'s locator pattern
`` `.ui-tab[data-tab="${tab}"]` `` reads tab ids as CSS attribute values. Both
are computed live from the current `HUD_TAB_IDS`/`HUD_TABS` export at every run
and neither is a stored value that could go stale — flagged for completeness,
not as a hazard.

---

## 6. A proposed commit sequence

Ordered so the tree is green after each step and no step depends on a
product decision this document is not allowed to make. Steps 1-4 need no
owner ruling beyond ADR 0112's decision 3, which has already been made; step 5
needs the two open questions in §7 answered or explicitly deferred with a
placeholder id.

1. **Rename the two id declarations and their `labelKey`s together, in one
   commit.** `HUD_TAB_IDS` (`hud-state.ts:34`) and `HUD_TABS`
   (`hud.ts:86-92`) both move to the delivery's five ids (a translit such as
   `overview | build | zones | manage | day-plan` — the exact strings are an
   implementation choice, not a player-visible string, so they are not
   reserved by `AGENTS.md`'s fourth exclusion). This one commit necessarily
   also touches every `activeTab === '<old-id>'` literal in `main.ts` and
   `hud.ts` (§5.2), because leaving any of them on an old literal is a
   silent-never-fires bug, not a compile error, for the three ids that are
   renamed rather than removed (`security`→`manage`, nothing removed outright
   since all five map to all five). **New localization keys for the five tab
   labels are needed here** (`HUD_MESSAGE_KEY.tabZones`, `.tabManage`,
   `.tabDayPlan` replacing `.tabRooms`, `.tabSecurity`, `.tabRegime`) — their
   *English source and Polish translation strings* are player-visible and are
   not authored by this rename; ship the keys wired to placeholder text (or
   reuse the old English/Polish pair verbatim as a stand-in) and flag the
   actual wording as owed, per Stage 6's own rule that a string's truth is
   checked before it ships.
   - Update `tests/unit/ui-hud-shell-state.test.ts:47` and
     `tests/unit/ui-hud-messages.test.ts:430`'s literal arrays in the same
     commit — this is the one test edit this document's constraints allow
     for, since it is asserting the very fact being changed on purpose, not a
     weakening of a floor. (No other test file needs editing per §5.1.)
   - `pnpm verify` gate: everything under `src/ui/hud/` and `tests/unit/`
     compiles and the two updated assertions pass; the browser suite is
     unaffected because its loops are membership-driven (§5.1).
2. **Move the Rooms tab's panel mount from `'rooms'` to the renamed zones id
   and the Staff panel's mount from `'security'` to the renamed manage id** —
   a one-line change each at `hud.ts:2363-2373`'s `setVisible` calls and the
   matching `activeTab === …` gates in `main.ts`. These are "stated" per
   #1156 §5 and carry no judgement call.
3. **Move the Intake panel's mount from `overview` to manage, OR leave it on
   overview** — whichever §7's answer picks. Either is a one-line
   `setVisible`/gate change, identical in shape to step 2, so the sequencing
   cost of waiting for the answer is zero; this step can be dropped in
   wherever the answer arrives.
4. **Split the Regime panel.** This is the one step that is not a mount-point
   change: the panel currently paints day-blocks and prisoner-roster/detail
   together (§1, §2). Splitting it into two panels — one for Plan dnia's day
   blocks, one for Zarządzaj's roster — is a real code change to
   `regime-panel.ts`, not a relabel, and is sized separately from steps 1-3
   for that reason. Land it as its own commit so a review of "did the split
   preserve every control" is not mixed into a mechanical rename.
5. **Placeholder rows.** For every entry in §3's unplaced list, no code
   change is proposed by this document — they stay exactly where they are
   today (chrome outside any tab) until an owner decision gives one a home,
   per the task's own instruction that an unplaced surface is a finding, not
   something to move on inference.

Each step above is independently green under `pnpm verify` and steps 2-4 can
land in any order relative to each other once step 1 has merged, since none of
them touches an id another one depends on.

---

## 7. Open questions for the owner — three of them ruled on 2026-09-14

**The owner answered questions 1, 2 and 4 on 2026-09-14, after this document was
written and while the pull request carrying it was open.** The questions are
kept below exactly as they were asked, because the arguments on both sides are
the reason each ruling means something; the rulings are recorded here, ahead of
them, so a reader cannot take a question for an open one.

| Question | Ruling | Against the argument this document gave? |
|---|---|---|
| 1 — Intake: Zarządzaj or Przegląd? | **Zarządzaj** | No — it follows the delivery's own table |
| 2 — Materials and deliveries: Buduj or Zarządzaj? | **Buduj** | No — no source settled it either way |
| 4 — What seeds Przegląd? | **A new Overview-native readout; `src/ui/save-panel.ts` stays in the rail** | No |

**Provenance is the weaker kind, and this document should say so in the same
breath it records the rulings.** Each is the label of a clickable option a
session wrote and the owner chose, not a sentence the owner typed — the
distinction `AGENTS.md`'s 2026-09-08, -09 and -10 entries draw of themselves,
and the one ADR 0112's decision 3 does not need because it quotes words the
owner typed. The option labels, verbatim, in the Polish they were put in:

> 1. *"Zarządzaj (zgodnie z dostawą)"* — "Manage (as the delivery says)"
> 2. *"Buduj"*
> 4. *"Nowy odczyt w Przeglądzie, panel zapisu zostaje w szynie"* — "A new
>    readout in Overview, the save panel stays in the rail"

**What ruling 1 costs, and it was put to the owner before they chose.** Moving
Intake out leaves Przegląd with no panel at all, because Intake is the only
thing that tab shows today (§1's own table). Ruling 4 is what answers for
that, and the two therefore land together or Przegląd ships empty — which is a
thing constitution article 5 has an opinion about, since an empty section is a
screen that looks like state and is not.

**What ruling 4 decides and what it does not.** It decides that Przegląd gets
its own finance-and-save readout calling the same persistence functions, and
that `src/ui/save-panel.ts` is **not** moved bodily into the tab system — it
stays mounted in the rail aside slot (`src/main.ts:3418`), reachable from every
section, which §1 item 4 records as a property rather than an accident. It does
**not** decide what that readout contains field by field; that is ordinary work
under the standing mandate, and every number it shows is still subject to
`AGENTS.md`'s fourth reservation — the wording is ours, the truth is not.

**Question 3 was never open** — §4.1 settles it by DOM containment and this
document said so when it listed it.

**Still to do, and named here so it is not lost:** these three rulings belong in
`docs/IDENTITY_V5_ROLLOUT.md` beside the stages they change, and Przegląd's
readout needs an issue of its own. Neither is done in this document, which is a
measurement pass; both are held until the stage 3 shell branch merges, because
`src/ui/hud/` is being rewritten while this is written.

---

### The questions as they were asked


1. **Intake: Zarządzaj or Przegląd?** The delivery's nav table names Zarządzaj
   (§1, §4.2). `intake-panel.ts`'s own docblock and `docs/VISUAL_IDENTITY.md`'s
   framing of Overview needing "a landing readout" both read consistently with
   *keeping* Intake on the Overview-successor tab, since it is presently the
   only thing that tab shows. Arguments for each:
   - **For Zarządzaj:** the delivery's table says so in as many words
     (*"przyjęcia"*). Admitting a prisoner is an act on a person, which is the
     same category as the roster and staff hiring/dismissal, all landing in
     the same section.
   - **For Przegląd:** the panel's only reason for being on `overview` today
     is that Build had no pixels left (`intake-panel.ts:10-30`) — an
     accident of layout, not a claim about subject. But an accident that
     nonetheless leaves Przegląd with *something* to show; moving it to
     Zarządzaj leaves Przegląd literally empty of any panel (§1's own table:
     "A landing readout. Today's overview tab has an admission control and no
     overview") unless the finances/save content §1 also flags gets built at
     the same time — which is a materially larger piece of work than a mount
     rename.
2. **Materials/deliveries: Buduj or Zarządzaj?** §1 above found the delivery's
   text ambiguous (*"wyposażenie"* could be catalogue variants or the
   purchase block; deliveries are listed among read models with no section
   named). Unresolved by any source available to this document.
3. **Held-guards block: does it need calling out separately, or does "the
   Staff panel moves" already answer for it?** §4.1 argues the DOM containment
   answers this by construction (moving the panel moves the block), and this
   document takes that as settled rather than open — flagged here only so a
   later reader who disagrees can see the reasoning was made, not skipped.
4. **What exactly seeds Przegląd's "finanse, zapis"?** Whether that means
   relocating `src/ui/save-panel.ts` bodily into the tab, or building a new
   Overview-native save affordance that calls the same persistence functions,
   is a real architecture choice (the save panel is presently outside the tab
   system entirely — §1 item 4, mounted at `src/main.ts:3418` in the rail
   aside slot, not inside `mountHud`). Not attempted here.

---

## 8. The weakest claims, named

**Everything in §1 rests on one table cell's wording, translated once, by this
document.** *"przyjęcia"*, *"osadzeni"*, *"zapis"*, *"finanse"* are four Polish
nouns in a two-column table with no elaboration in `projekt.md` beyond the one
sentence at `:75` about staff. Unlike ADR 0112's decision 3, which quotes the
owner's own words, this table is the *delivery's* wording and was never put to
the owner as a ruling — it carries exactly the weight `docs/adr/0112…md`
assigns delivery content generally (evidence of what was asked for, not a
decision this repository made) and none of the weight a ruling carries. Treat
§1's resolutions of #1156's "unsettled" rows as **better-sourced arguments**,
not as settled questions — §7 still lists two of them as open for that reason.

**§2's control count (16) is a re-derivation against #1156 §4's count (16 via
the 22-intent/17-command reconciliation) and the two arrive at the same number
by different routes** — one counting `HudIntent` arms, one counting
`createActionButton`/panel-confirm sites directly. Agreement between two
independent counts is offered as the check, not as proof neither has an error
a third method would catch; a control built without `createActionButton` (a
raw `<button>`, say) would be invisible to this document's grep and would not
show up in either count.

**§5.3's "no persistence" finding is a negative** — proving something is
*absent* from three files and one storage-key list is only as strong as the
completeness of the search. The check run was `grep -rn "tab"` across the two
persistence files plus a direct read of every `localStorage` key declaration
in `src/input/storage.ts`, plus tracing `HudShellState`'s only producer and
only consumers by import. What would change this finding: a persistence path
that stores UI state by a route this document did not check — `IndexedDB`
object stores beyond `save-schema.ts`'s envelope were not independently
enumerated, only the schema file that defines what goes into them.
