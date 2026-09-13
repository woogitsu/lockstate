# Every HUD surface, and where the direction's five sections put it

**Stage 0 of the identity rollout (issue #1156, epic #1155).** Taken on this
checkout at `a0ffd01b`, against the tree at `e5628369` plus the three
documentation commits that carry `docs/VISUAL_IDENTITY.md`,
`docs/IDENTITY_V5_ROLLOUT.md` and `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md`.

**This is a record, not a gate.** The owner ruled on 2026-09-13 —
*"tak, od razu, nikt nie gra w grę więc nikt nie zauważy problemu"* — that the
navigation moves to the delivery's five sections without waiting for this
document. ADR 0112's Status block carries the ruling verbatim. What the document
is for, therefore, is the one thing the ruling does not make cheap: **a surface
the re-skin drops silently**. Every row below with no target is a question for
the owner and never a deletion.

**How every claim here was obtained.** VERIFIED throughout in
`docs/research/README.md`'s sense: each `file:line` was opened and read in this
worktree, and each tally was re-derived by grep rather than inherited from the
document that states it. Where a repository document and the code disagree, the
code is taken as right and the commit at which the document went false is named.
Nothing here was measured in a browser — this is a reading of the composition
root and the modules it mounts, not a playtest.

---

## 1. The unplaced surfaces — the part that needs an answer

These exist today, a player can reach each one, and the direction's five
sections (Przegląd / Buduj / Strefy / Zarządzaj / Plan dnia) do not say where
any of them goes. `docs/VISUAL_IDENTITY.md`'s §"Navigation" names only the five
titles; its §"Where this repository stands against it" item 5 maps only the tab
*set* against the tab *set*, and says nothing about anything that is not a tab.

| Surface | Where it is today | Why the five sections do not place it |
|---|---|---|
| **Status strip** — metrics, day/clock, transport, brand slot (`src/ui/hud/status-strip.ts:1`, mounted `src/ui/hud/hud.ts:1686`) | A grid row above every tab | It is chrome that spans all five sections. The direction has a metric strip and a "map only" mode that hides it (`docs/IDENTITY_V5_ROLLOUT.md` stage 3), but that is a *layout* decision, not a section assignment. |
| **Alerts list** (`src/ui/hud/hud.ts:1755`, rows built by `src/ui/hud/alert-row-label.ts`) | A collapsible section nested *inside* the minimap panel's body (`hud.ts:1784`), open by default since the owner's ruling of 2026-08-31 recorded at `src/ui/hud/hud-state.ts:46-79` | Refusals and notices are cross-cutting. No section owns "what the prison just refused". |
| **Events band** (`hud.ts:1345`, dwell policy in `src/ui/hud/event-band-dwell.ts`) | A grid row under the strip, one sentence at a time | Same: it is the escape/incident sentence channel, not a section. |
| **Refusal line** (`hud.ts:1244-1246`) and **simulation-unavailable band** (`hud.ts:1128-1129`) | Two further grid rows under the strip | Neither is a place a player navigates to. |
| **Minimap frame + zoom control** (`hud.ts:1693-1784`, `hud.ts:1843`, assembled as `.hud__corner` at `hud.ts:1858`) | Bottom-left corner, on every tab | The direction has a map illustration and camera limits it explicitly does *not* bind (`docs/VISUAL_IDENTITY.md` §"What is explicitly **not** binding"). Where navigation controls live is unstated. |
| **Save panel** (`src/ui/save-panel.ts`, mounted into the rail's aside slot at `src/main.ts:3418`) | Right rail, above nothing, on every tab — create / save now / export / import / load / delete | The delivery's own persistence is a `localStorage` prototype it tells this repository not to copy. It proposes no home for a real save surface. |
| **Display-scale control** (`src/ui/display-scale.ts`, mounted `src/main.ts:3279` and appended at `:3312`) | Same aside slot, above the save panel | A preference. The direction's stage 3 adds a Layout menu; whether accessibility scale joins it is undecided. |
| **Brand badge** (`src/ui/brand-badge.ts`, appended at `src/main.ts:3246`) | The strip's brand slot, from first paint, even with no worker | Build identity. Not a section. |
| **Telemetry consent prompt** (`src/ui/telemetry-consent-prompt.ts`, appended to `appRoot` at `src/main.ts:3518`) | A prompt over the page, only when `pipeline.shouldAskForConsent` | Consent is not a section, and article 5's truth obligation makes its wording the most expensive thing on this list to move. |
| **Intake panel** (`src/ui/hud/intake-panel.ts`, shown on `overview` at `hud.ts:2369`) | The Overview tab's one panel: one "Admit" control plus the arrivals pipeline | Przegląd is glossed "Overview". Admitting a prisoner is an *act*, and the delivery moves acts of that kind toward Zarządzaj. The panel's own docblock (`intake-panel.ts:10-30`) records that it is on Overview because the Build panel had no pixels left, not because Overview is where it belongs. **This is the strongest candidate for a section change and it is not one the direction makes.** |
| **Held guards block** (`staff-panel.ts`, fed by `src/ui/simulation-held-guards.ts:159`) | Inside the Staff panel on the `security` tab | Follows staff to Zarządzaj by default. Nobody has said so. |
| **Procurement: buy / sell materials and pending deliveries** (`hud.ts:1929`, `:1942`, `:1979`; reader `src/ui/simulation-pending-deliveries.ts:160`) | Inside the Build panel on the `build` tab | Buying materials is money, not geometry. Buduj by inheritance; Zarządzaj by subject. |
| **`src/ui/account/` — four modules, no surface at all** (`account-session.ts`, `account-preferences.ts`, `cloud-slot-availability.ts`, `save-list-projection.ts`) | Nowhere. Grepping `projectSaveList`, `projectCloudSlotAvailability`, `loadAccountPreferences` and `AccountSessionState` across `src/` returns no consumer outside that directory; every caller is a test | There is no account surface to place. `save-list-projection.ts:1-10` calls itself the fold "the panel that renders these rows" would use, and that panel does not exist. |
| **`hud/security`, `hud/contraband`, `hud/incidents`, `hud/incident-detail`** | Four read models with a worker route and no reader | Security, contraband and incidents are named in `docs/IDENTITY_V5_ROLLOUT.md` stage 5 as things that "keep full function", which is a promise about something that has no surface today. |

**One surface has the opposite problem.** The Regime panel
(`src/ui/hud/regime-panel.ts`, shown on `regime` at `hud.ts:2373`) holds two
subjects the direction splits: the day's blocks per classification group, which
is Plan dnia, and the prisoner roster with its six-need detail block, which is
people. Placing the panel places only half of it.

---

## 2. Today's surfaces, one by one

### The shell

`mountHud` builds one `.hud` whose children are, in DOM order
(`src/ui/hud/hud.ts:2326`): the status strip, the unavailable band, the
refusal line, the events band, the bottom-left corner, the right rail, and the
tab bar. The root is `pointer-events: none` so anything that is not a control
passes through to the canvas (`hud.ts:58-70`).

| Surface | What it is for | What it reads | What it can issue | How a player reaches it |
|---|---|---|---|---|
| Status strip (`status-strip.ts`) | The always-visible readout: metrics, day and clock, transport | `HudViewModel.counts` / `.clock` / `.roomNeeds`, mapped by `projection.ts`'s `projectStatusMetrics` | `set-clock` (→ nothing; the clock is not a `SimulationCommand`), `undo`, `redo` | Always painted, on all five tabs |
| Unavailable band (`hud.ts:1128`) | "This page has no simulation behind it" (#220) | Host flag passed at mount | — | Appears when the worker could not start |
| Refusal line (`hud.ts:1244`) | What the last press was refused for (#207) | `HudRefusalNoticeViewModel` | — | Appears after a refused command |
| Events band (`hud.ts:1345`) | One event sentence at a time, with a 600 ms dwell floor (`event-band-dwell.ts`) | `HudEventNoticeViewModel` | — | Appears when an event arrives |
| Minimap frame (`hud.ts:1717-1784`) | A camera jump target and the alerts host | Nothing from the simulation; the click is geometry | `toggle-panel` (chrome only) | Bottom-left, all tabs |
| Alerts list (`hud.ts:1755`) | Refusals and notices as rows | `HudViewModel.alerts` | `dismiss-alert` → `DismissAlert` | Inside the minimap panel, open by default |
| Zoom control (`hud.ts:1843`) | Camera zoom in/out | — | — (camera, not simulation) | Bottom-left, all tabs |
| Tab bar (`hud.ts:2302`) | The five sections | `HudShellState.activeTab` | `select-tab` (chrome only) | Bottom-centre, all tabs |
| Rail aside slot (`hud.ts:2298`, handle at `:2622`) | The host's own box, not tab-scoped | — | — | Right edge, all tabs |

### The five tabs and their panels

`HUD_TAB_IDS` is `['overview', 'build', 'rooms', 'security', 'regime']`
(`src/ui/hud/hud-state.ts:34`). Every one of the five answers a tap with a
panel, at `hud.ts:2363-2373`.

| Tab | Panel | What it is for | Projections behind it | Commands it can issue |
|---|---|---|---|---|
| `overview` | Intake (`intake-panel.ts`) | Admit one prisoner; say where the already-admitted arrivals are | `hud/prisoner-population` (`src/ui/simulation-intake.ts:168`, gated `main.ts:1913`) | `AdmitPrisoner` (`main.ts:3142`) |
| `build` | Build (`build-panel.ts`, 3,181 lines — the largest) | The buildable catalogue, coordinates, the order queue, materials and deliveries | `hud/build-queue` (`simulation-build-queue.ts:202`, gated `main.ts:1550`), `hud/pending-deliveries` (`simulation-pending-deliveries.ts:160`, gated `main.ts:1584`) | `PlaceBuildOrder` (`main.ts:2679`), `CancelBuildOrder` (`:2516`), `PlaceObject` (`:2729`), `RemoveObject` (`:2788`), `RemoveWall` (`:2781`), `PurchaseMaterials` (`:2980`), `SellMaterials` (`:3017`), `CancelMaterialPurchase` (`:2549`) |
| `rooms` | Rooms (`rooms-panel.ts`) | The room catalogue, the designation coordinates, and what a zoned room is missing | `hud/room-list` and `hud/room-detail` (`simulation-room-needs.ts:455`, `:491`) — **asked for on every tab since 2026-09-05, not only this one**, because the strip's `ROOMS` badge reads the same readout (`main.ts:1851-1875`) | `ZoneRoom` (`main.ts:2826`), `UnzoneRoom` (`:2857`) |
| `security` | Staff (`staff-panel.ts`) | Hire a role, see coverage, see who is on the payroll, release a held guard, dismiss someone | `hud/staff` twice — `limit: 0` totals (`simulation-staff-coverage.ts:124`) and a row window (`simulation-staff-roster.ts:154`) — plus `hud/held-guards` (`simulation-held-guards.ts:159`); all three gated on `activeTab === 'security'` (`main.ts:1635`, `:1649`, `:1683`) | `HireStaff` (`main.ts:3217`), `DismissStaff` (`:2614`, two presses — `dismiss-arming.ts`), `ReleaseGuardAssignment` (`:2583`) |
| `regime` | Regime (`regime-panel.ts`) | What each classification group's day allows now; the prisoner roster; one prisoner's six needs | `hud/status-strip` (`simulation-regime.ts:151`, gated `main.ts:1719`), `hud/prisoner-roster` (`simulation-prisoner-roster.ts:314`, gated `:1753`), `hud/prisoner-detail` (`simulation-prisoner-detail.ts:212`, gated `:1799` and on a chosen row) | none of its own; `select-prisoner` is chrome (`hud.ts:2167`) |

### The three map tools

Each turns a gesture on the world into something in the HUD's vocabulary, and
each sits at the composition root because the renderer may not submit a command
and the HUD may not import the simulation.

| Tool | Armed from | Produces |
|---|---|---|
| `src/ui/build-tool.ts` | Build panel, `arm-build-tool` (`hud.ts:1919`) | A drag over edges → `place-build-order` / `remove-object` |
| `src/ui/room-tool.ts` | Rooms panel, `arm-room-tool` (`hud.ts:2029`) | A rectangle in tiles → `zone-room` / `unzone-room` |
| `src/ui/object-tool.ts` | Build panel, same arm intent | A tile press → `place-object` / `remove-object` (removal footprint fixed at 1×1, `object-tool.ts`) |

`hud.ts:2280-2283` wires a single `toolStandDown` that stands both panels down
together.

### Top-level surfaces `src/main.ts` composes outside the HUD

| Surface | Mounted at | Notes |
|---|---|---|
| Brand badge | `src/main.ts:3246` | Unconditional, so a browser that cannot start a worker can still report its build |
| Display-scale control | `src/main.ts:3279`, appended `:3310` | Persists `uiScale` through `src/input/storage.ts`; applied before first paint |
| Save panel | `src/main.ts:3418` (inside `bootPersistence`) | Only when IndexedDB opened and a worker started |
| Telemetry consent prompt | `src/main.ts:3518` | Only when telemetry is enabled and consent is unanswered |

---

## 3. Projections: reconciled, not recounted

`PROJECTION_IDS` (`src/simulation/protocol/types.ts:331-347`) has fifteen
members. Grepping each as a string literal across `src/ui/`, `src/rendering/`
and `src/main.ts` on this checkout returns **ten with a reader and five
without**, which is exactly the split
`tests/foundation/projection-reachability-contract.test.ts` states in its
docblock, and this document adopts it rather than restating it differently.

The five with a route and nobody on it: `hud/security`, `hud/contraband`,
`hud/incidents`, `hud/incident-detail`, `world/render-snapshot`.

**One detail in that test's prose is incomplete, and it matters for stage 5.**
Its enumeration attributes `hud/staff` to `src/ui/simulation-staff-coverage.ts`
alone. There are two readers of that id: `simulation-staff-coverage.ts:124`
(`limit: 0`, the coverage totals) and `simulation-staff-roster.ts:154`
(`STAFF_ROSTER_ROW_LIMIT`, the dismissable rows). The *id* count of ten is
right; the module attribution is one short, and has been since
`a8a446ed` (2026-08-29, #533), the commit that added
`src/ui/simulation-staff-roster.ts`. So **eleven modules read ten ids**, and a
re-skin that consolidates the Staff panel has two request paths to keep, not
one. `docs/ARCHITECTURE.md:44` and
`docs/adr/0086-what-refreshes-a-pulled-hud-readout.md:237-238` both already
describe the pair correctly; the contract test's docblock is the one that does
not.

**Two of the ten are not pull-only.** `hud/status-strip` also reaches the strip
by publication (`simulation/status-counts`), which
`docs/HUD_PROJECTIONS.md` §8 describes; `simulation-regime.ts` pulls it for the
one field the publication does not carry.

---

## 4. Commands: all seventeen are issued, and all seventeen from one file

`simulationCommandSchema` (`src/simulation/protocol/commands.ts:731-749`) is a
seventeen-member union. Each literal was grepped across `src/ui/`,
`src/rendering/` and `src/main.ts`; every one has exactly one submission site
and every site is in `src/main.ts`:

| Command | Submitted at | Raised by |
|---|---|---|
| `PlaceBuildOrder` | `main.ts:2679` | Build panel / build tool |
| `CancelBuildOrder` | `main.ts:2516` | Build panel queue row |
| `PlaceObject` | `main.ts:2729` | Build panel / object tool |
| `RemoveObject` | `main.ts:2788` | Build panel / object tool |
| `RemoveWall` | `main.ts:2781` | Build panel / build tool |
| `PurchaseMaterials` | `main.ts:2980` | Build panel materials block |
| `SellMaterials` | `main.ts:3017` | Build panel materials block |
| `CancelMaterialPurchase` | `main.ts:2549` | Build panel deliveries row |
| `ZoneRoom` | `main.ts:2826` | Rooms panel / room tool |
| `UnzoneRoom` | `main.ts:2857` | Rooms panel / room tool |
| `AdmitPrisoner` | `main.ts:3142` | Intake panel |
| `HireStaff` | `main.ts:3217` | Staff panel roles block |
| `DismissStaff` | `main.ts:2614` | Staff panel roster row |
| `ReleaseGuardAssignment` | `main.ts:2583` | Staff panel held-guards row |
| `DismissAlert` | `main.ts:2648` | Alerts list row |
| `Undo` | `main.ts:2459` | Status strip |
| `Redo` | `main.ts:2463` | Status strip |

The HUD itself submits nothing: it raises a `HudIntent`
(`src/ui/hud/hud.ts:357-730`, twenty-two arms, counted by the `|`-prefixed
lines of the union) and the composition root's `switch` translates. Sixteen of
the twenty-two carry a command; `remove-object` carries two, `RemoveWall`
(`main.ts:2781`) and `RemoveObject` (`:2788`), which is how sixteen intents
reach seventeen commands. The six with no `SimulationCommand` behind them are
`select-tab`, `toggle-panel`, `arm-build-tool`, `arm-room-tool`,
`select-prisoner` — chrome and tools — and `set-clock`, which sends the
worker a `simulation/set-clock` protocol message rather than a command.

**Two commands are issued from surfaces the five sections do not name.**
`DismissAlert` comes from the alerts list, which lives inside the minimap panel;
`Undo` and `Redo` come from the status strip. A re-skin that rebuilds the
navigation without rebuilding the strip and the alerts list loses three of the
seventeen.

---

## 5. The mapping, both directions

### Today's surface → the direction's section

| Today | Lands in | Confidence |
|---|---|---|
| `overview` tab / Intake panel | Przegląd **or** Zarządzaj | unsettled — see §1 |
| `build` tab / Build panel (catalogue, coordinates, queue) | Buduj | stated |
| Build panel materials + deliveries blocks | Buduj **or** Zarządzaj | unsettled |
| `rooms` tab / Rooms panel | Strefy | stated |
| `security` tab / Staff panel (roles, coverage, roster) | Zarządzaj | stated — the delivery's one semantic move |
| Staff panel held-guards block | Zarządzaj by inheritance | unsettled |
| `regime` tab / day blocks | Plan dnia | stated |
| `regime` tab / prisoner roster + detail | Plan dnia **or** Zarządzaj | unsettled — the panel splits |
| Status strip, events band, refusal line, unavailable band | no section | unplaced |
| Alerts list | no section | unplaced |
| Minimap + zoom | no section | unplaced |
| Save panel, display scale, brand badge, consent prompt | no section | unplaced |
| `src/ui/account/` | no surface today, no section | unplaced |

### The direction's section → what fills it today

| Section | Filled today by | Empty of |
|---|---|---|
| **Przegląd** (Overview) | The Intake panel, if it stays; otherwise nothing but the strip | A landing readout. Today's `overview` tab has an admission control and no overview. |
| **Buduj** (Build) | The whole Build panel and two of the three map tools | Nothing obvious |
| **Strefy** (Zones) | The whole Rooms panel and the room tool | Nothing obvious |
| **Zarządzaj** (Manage) | The Staff panel | Contraband, incidents and security have no surface at all (four unread projections, §3) |
| **Plan dnia** (Day plan) | The Regime panel's block readout | A schedule the player can *change*. Nothing in the seventeen commands edits a regime. |

The last cell is the sharpest finding in this section: **Plan dnia is a section
for an editing surface this repository has no command for.** Stage 5's
"schedule … keep full function" is a promise about a readout.

---

## 6. Where a repository document has gone false

Three, each with the commit that broke it.

1. **`src/ui/hud/hud-state.ts:22-24`** — *"three of the four existing tabs render
   no panel"*. Written at `84e1c614` (2026-08-25 16:59:24 +0200, #312). It was
   false **68 minutes later**, at `c60b10e9` (18:07:46, #302), which put the
   Staff panel on `security`; `1db8c16a` (18:50:24, #306) put Intake on
   `overview`; and `f8393f00` (2026-08-28 11:31:05, #459) put the Regime panel
   on `regime`. Today all five tabs paint a panel (`hud.ts:2363-2373`), and
   `hud.ts:2370-2372` says so in a comment the neighbouring file never received.
   The consequence for the rollout is not cosmetic: the argument that put the
   fifth tab on `rooms` — *"three of the four existing tabs render no panel …
   so none of them was an unclaimed slot to reuse"* — reads today as if four
   slots were free. None is.
2. **`docs/ARCHITECTURE.md:44`** — *"it has seven readers"* and *"Eight of the
   fifteen read models still have a route and no reader"*. Written at
   `fb2b571a` (2026-08-27), correct on that day. False from `f8393f00`
   (2026-08-28), which added `simulation-prisoner-roster.ts` and
   `simulation-regime.ts` at once. Today it is ten read and five unread. The
   same sentence *does* correctly enumerate `simulation-staff-roster.ts`, which
   arrived later still — so the prose was extended and the tally was not, which
   is `docs/AGENT_WORKFLOW.md` §4's first rule happening inside one sentence.
3. **`tests/foundation/projection-reachability-contract.test.ts`**, the
   docblock's reader enumeration — names one module for `hud/staff` where there
   are two, since `a8a446ed` (2026-08-29, #533). The assertions are unaffected;
   the prose is what is short. Recorded rather than edited, because this agent's
   surface for issue #1156 is one file under `docs/research/` and its index row.

Not a rot, but worth stating because it is the kind of thing this document is
supposed to catch: **`docs/VISUAL_IDENTITY.md`'s item 5 maps five tab *ids*
against five section *names* and stops there.** Everything in §1 above is
outside the frame of that comparison, which is why a mapping done only at that
level would have reported the navigation change as a five-for-five swap.

---

## 7. The weakest claim here, and what would change my mind

**The weakest claim is §5's "unsettled" column, and it is weak by
construction.** Nothing in the delivery, in `docs/VISUAL_IDENTITY.md` or in
ADR 0112 assigns the Intake panel, the materials block, the held-guards block or
the prisoner roster to a section. Those rows are this agent's reading of what
*would* be consistent, not a record of a decision, and a reader should treat
them as the questions §1 says they are. **What would change my mind is one
sentence from the owner per row** — there is no measurement that settles them,
because the fact in question is an intention.

**The second weakest is the completeness of §1 itself.** It was built by reading
`mountHud`'s children list, `mountInterface`'s mount sites and the module
listing of `src/ui/`, and a surface appended to `appRoot` from somewhere this
agent did not open would be invisible to all three. The check that was run: `grep -rn "appRoot\.\|document.body\.\|\.append(" src/main.ts`
returns four lines — `:3246` the brand badge, `:3312` the display scale,
`:3518` the consent prompt, and `:3478`, which sets an `aria-label` on
`appRoot` from `src/ui/app-shell-messages.ts` and paints nothing. The save
panel is the fifth and appends inside its own constructor (`src/main.ts:3418`).
What would change my mind is a DOM mount inside `src/rendering/`, which was not
read for surfaces of its own.

**What is not weak** is §3 and §4: every id and every command literal in this
document was grepped across `src/ui/`, `src/rendering/` and `src/main.ts` on
this checkout, and every `file:line` cited here was opened. The two counts — ten
of fifteen read, seventeen of seventeen issued — are re-derivable by the same
greps in a minute, and are stated with the grep rather than as a tally to
inherit.
