# Rolling out the 2026-09-13 identity

This is the staged plan for moving this repository's interface to the direction
described in [`docs/VISUAL_IDENTITY.md`](./VISUAL_IDENTITY.md) and delivered
verbatim under [`docs/design/2026-09-13-identity-v5/`](./design/2026-09-13-identity-v5/).
[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record; this file is the method.

It is written to be picked up by an agent that has never seen the delivery, in a
container that will be thrown away, with the delivery as the only thing it can
rely on being there.

## How to read a sentence in this document

`docs/ISSUE_BACKLOG.md`'s source-of-truth order gained a rung on 2026-09-15, by
the owner's ruling, and this file is one of that rung's two members: the
repository's reading of an accepted ADR **binds where it restates a ruling** and
**does not bind where it is a snapshot of code**, with the ambiguous case
falling to the second.

**Almost nothing here is the first kind, and saying so is the point of this
section.** This document is a *plan* — sequencing, method, predictions, and
records of what each stage did. A plan is neither a restatement nor a
measurement, and a sequencing decision an agent made does not acquire contract
force by sitting on rung 2. Concretely:

- **The sentences that restate a ruling, named rather than counted**, because a
  count is what rots first: §"The shape of the whole thing" and §"Stage 0" both
  say the navigation moves without waiting for the inventory (ADR 0112 decision
  3) and both quote the owner's words; §"Stage 2" says *"the owner ruled on
  2026-09-13 for 15 / 13 / 11"* and that article 8 was amended (decision 4);
  §"Stage 7" says the owner extended the stage with production prompts
  (decision 5). [`docs/VISUAL_IDENTITY.md`](./VISUAL_IDENTITY.md) carries the
  map from all five rulings to the sentences that restate them, and is the file
  to check a restatement against.
- **The "Landed"/"Worked" sections are readings of the code at a named commit.**
  They bind nothing. Where one disagrees with `src/`, the code is right and the
  sentence rotted.
- **Everything else — the stage order, the gates, the "done when" clauses, the
  weakest-claim notes — is method.** It is what this repository decided to do,
  it is revisable by an agent with evidence, and it is not a contract.
- **§"What an agent may not decide alone" is the exception in the other
  direction:** its four items bind, and not because of this rung. Item 1 is
  `AGENTS.md`'s four reservations restated, which is rung 1; items 2–4 are the
  delivery's and `AGENTS.md`'s boundaries, not this document's invention.

## Where the work is tracked

The nine stages are filed as GitHub issues under one epic, so a session that
dies mid-stage leaves its state somewhere a later one can read. **The issues are
the tracker and this document is the record**: where the two disagree, this
document is right and the issue is what gets edited.

| Stage | Issue |
|---|---|
| — | [#1155](https://github.com/woogitsu/lockstate/issues/1155) — the epic, with the dependency graph |
| 0 — inventory | [#1156](https://github.com/woogitsu/lockstate/issues/1156) |
| 1 — two themes | [#1157](https://github.com/woogitsu/lockstate/issues/1157) |
| 2 — type scale | [#1158](https://github.com/woogitsu/lockstate/issues/1158) |
| 3 — HUD shell | [#1159](https://github.com/woogitsu/lockstate/issues/1159) |
| 4 — build loop | [#1160](https://github.com/woogitsu/lockstate/issues/1160) |
| 5 — operations | [#1161](https://github.com/woogitsu/lockstate/issues/1161) |
| 6 — language | [#1162](https://github.com/woogitsu/lockstate/issues/1162) |
| 7 — world art | [#1163](https://github.com/woogitsu/lockstate/issues/1163) |
| 8 — acceptance | [#1164](https://github.com/woogitsu/lockstate/issues/1164) |
| the five open decisions | [#1165](https://github.com/woogitsu/lockstate/issues/1165) |

**All five decisions were answered on 2026-09-13** (#1165), so every stage is
unblocked as far as the owner is concerned. What remains are the technical
dependencies below.

## The shape of the whole thing, in one paragraph

Nine stages. Stage 0 is an inventory of what exists today — **the owner ruled on
2026-09-13 that the navigation moves without waiting for it**, so it is a record
rather than a gate, and the reason is worth carrying: nobody is playing, so a
surface lost in a re-skin costs nobody a session. It is still produced, and a
surface the direction does not place is still not an agent's to delete. Stages 1
and 2 are the token architecture — a second theme, then the type scale — and
they are the only stages that touch every pixel at once. Stages 3–5 are the HUD
shell, the tools and operations: layout geometry, then the build loop, then the
panels the prototype does not show. Stage 6 is language. Stage 7 is world art,
which is a pipeline problem rather than a UI one and is the longest. Stage 8 is
acceptance. **Stage 1 gates 2 and 3; 3 gates 4 and 5; 0, 6 and 7 run beside the
rest.** Stage 0 gated everything until the owner's ruling of 2026-09-13 released
the navigation from waiting on it; it is now a record produced alongside, and
the sentence it used to carry is kept in its own section so the change is
visible rather than silent.

Nothing here may be merged as one change. `docs/AGENT_WORKFLOW.md` §2 is the
method: an implementing agent takes its own worktree, pushes after its first
coherent chunk, and parallel agents work on unrelated surfaces. Two agents in
`src/ui/tokens.css` will conflict on the design, not merely on the file.

---

## Stage 0 — Inventory, produced alongside rather than first

> **This section said "Inventory before demolition" and made itself the gate on
> every other stage. The owner ruled otherwise on 2026-09-13** — *"tak, od razu,
> nikt nie gra w grę więc nikt nie zauważy problemu"* ("yes, right away, nobody
> plays the game so nobody will notice a problem") — and the argument below is
> kept unchanged, because it is the argument that was overruled and because it
> is still the reason the document is worth producing at all. What changed is
> its position, not its content: it is written while the navigation moves, and
> it is what says where each of today's surfaces went.

**Why it was first.** `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` opens with it,
in the delivery's own words: *"Zanotuj brakujące powierzchnie, zanim zaczniesz
usuwać stary UI"* — note the missing surfaces before you start removing the old
UI. The prototype has five sections; this repository has five different ones,
plus intake, alerts, contraband, incidents, save, account and the minimap.

**Produce**, as a document under `docs/research/` with a dated name:

1. Every reachable HUD surface today: the five tabs of
   `HUD_TAB_IDS` (`src/ui/hud/hud-state.ts:34`), every panel module under
   `src/ui/hud/`, every tool in `src/ui/`, and every top-level surface
   `src/main.ts` composes.
2. Every projection those surfaces read, against the fifteen-member vocabulary
   in `src/simulation/protocol/types.ts`. `docs/HUD_PROJECTIONS.md` and
   `tests/foundation/projection-reachability-contract.test.ts` already carry the
   read/unread split — reconcile with them rather than recount.
3. Every command a surface can issue, against the seventeen in
   `src/simulation/protocol/commands.ts`.
4. The mapping, in both directions, between those surfaces and the direction's
   five sections — **including the rows with no target**, which are the ones
   that get lost.

**Done when** a reader can point at each of today's surfaces and say which of
the new five it lands in, or that the direction does not place it. An unplaced
surface is a question for the owner, not a deletion.

**Gate:** none beyond `pnpm verify`. This stage writes documentation only.

---

## Stage 1 — Two themes, one token architecture

**The problem, stated precisely.** `src/ui/tokens.css` is a three-layer file:
raw ramps, semantic aliases, component aliases. It has exactly one palette and
it is dark. The direction needs a **light default** and a **dark alternative**,
switchable at runtime, following the system when the player has expressed no
preference, and remembered.

**What must not happen:** a second stylesheet that overrides the first. The
delivery's own audit says the prototype's layered overrides are iteration
history to be consolidated, and importing that structure here would be adopting
the one thing its author flagged.

**Approach.** Keep the three layers. Move every *raw ramp* under a theme
selector, leave every semantic alias pointing at role names, and require that no
component stylesheet ever reads a raw ramp — `primitives.css` already obeys
this, which is why the caution-badge repointing recorded in `src/ui/tokens.css`
cost one line. Then the light palette is a second block of ramp values, not a
second design system.

**Hard constraints, each already enforced by a test:**

- `tests/unit/ui-design-tokens.test.ts` **computes** contrast ratios from the
  file. Three owner rulings of 2026-09-02 on issue #788 are recorded in
  `src/ui/tokens.css` with the exact ratios they were chosen to clear. Every one
  of those must hold **in both themes**, and the day palette's teal is already
  the result of one such correction — `#007477`, never back to `#007E80`.
- Constitution article 19: statuses, focus and hierarchy mean the same thing in
  both themes. A theme is not a mood, and it does not change the simulated time
  of day.
- Constitution article 13: the theme is a preference. It gets its own storage
  key, it is not part of the save, and resetting it resets nothing else.
  `src/input/storage.ts` is the existing guarded `localStorage` wrapper; use it.
  A browser that throws on storage access must still switch themes, it merely
  must not remember.

**Evidence required:** every pair the token test computes, in both themes;
a screenshot pair per device tier is *not* evidence and the delivery says so.

**Owner-reserved:** nothing. This is ours.

---

## Stage 2 — The type scale

Body and value text are 13 px and labels 11 px, each multiplied by `--ui-scale`
(`src/ui/tokens.css:371-373`). The delivery asks for 16 / 14 / 12; **the owner
ruled on 2026-09-13 for 15 / 13 / 11**, and amended constitution article 8 to 15
px rather than excepting it. That is the target. The option label carrying the
ruling said *"e.g."*, so a surface that needs a different intermediate step is
inside the ruling provided the step is recorded with its reason — what is not
open is the direction.

This is not a token edit. Three steps of body text changes what fits in every
panel at every breakpoint, and `--ui-scale` multiplies whatever it is given, so
a player who has scaled the UI up is affected three times over. Sequence it:

1. Introduce the full ramp as tokens, with today's values still selected.
2. Move one surface at a time, re-measuring overflow at 390×844 and at 200 %
   text zoom, which constitution article 8 makes an acceptance requirement.
3. Flip the default last, in its own commit, so a revert is one line.

**Weakest claim in this stage, named as `docs/AGENT_WORKFLOW.md` §3 requires:**
that the existing panels have the room. They may not, and the honest outcome may
be that some density stays below the target with the reason written down.

---

### Landed 2026-09-14 (#1158), and the weakest claim above was the right one

The paragraphs above are left exactly as they stood: they are the plan, and
what a plan predicted is worth keeping beside what happened.

**The ramp is 31 / 23 / 19 / 15 / 13 / 11** — the delivery's own scale less the
1 px the owner's three numbers determine, with the upper steps checked a second
way against the delivery's increments before they were written down. `:root`
selects 15 px for body and value. **Labels never moved**: 11 px was already the
ruled size, so the "three steps" this section opens with was two.

**Four surfaces did not have the room, and keep 13 px with their reasons in
`tokens.css`:**

- **The Build panel.** Three pinned floors went red at 15 px, all at 1280×720 —
  `.hud-build__arm` at 56 px against a 44 px tap target (#926), the panel
  arriving with 6 px more content than box (#920), and a queue cancel 2 px
  below the fold with an emptied row no longer keeping its box. Pinning only
  `.hud-build__actions` was tried first and cleared the first two, which is how
  the arm button was identified as the source of the extra 12 px; it left all
  three queue failures red.
- **The alerts list.** #739 caps the worst-case alert sentence at four line
  boxes at every viewport; at 15 px it wraps to five at 1280×720. It surfaced
  a stage later than expected because the alerts section is a child of the
  minimap panel in the map corner, not of the rail.
- **The Rooms panel.** Its own body measured 15 px shorter than its content at
  900×600 (#331). Found only by the whole browser suite — the panel-by-panel
  spec runs had missed it, which is the argument for running the suite whole
  before calling a stage like this done.
- **The events band.** #985 pins its grid row at exactly 32 px while it
  speaks; at 15 px it is 35 px. **This is a recording rather than a floor**:
  nothing overflows, nothing is unreachable, and the invariant #985 is about —
  that the band borrows a definite row and gives it back — holds at 35 as well
  as at 32. Changing the 32 would be re-recording a measurement rather than
  weakening an assertion, and it was still not done: an agent deciding for
  itself which pinned numbers are "only recordings" is how that line stops
  meaning anything. The keep is the conservative answer and the argument for
  re-recording is written down beside it.

**One recorded measurement did move**, and the distinction is the whole of why:
`ARRIVAL_PANEL_HEIGHT_PX` (1280×720 397.3 → 395.6, 375×812 441 → 439.3) is
downstream of the *status strip's* height, not a property of the Rooms panel it
names — the panel is pinned at 13 px and every moved pixel is the strip's.
Keeping those numbers would mean reverting the strip, i.e. not doing the stage.
Its own docblock requires a change to arrive with the measurement that caused
it, which #545 and #634 each did before, and this one does.

**One thing this section did not predict and a later stage owes.** At a 200 %
browser page zoom the HUD already fails its own containment invariants on
`origin/main` — two covered tabs at 195×422 and 188×406 at the default
interface scale, and a scrolling rail plus spilled strip rows from 125 % up.
Measured before and after: **the failing set is identical**, so stage 2
introduces none of it, and the magnitudes move a little (strip spill
32.0 → 34.7 px at 200 %). Constitution article 8's 200 % clause is therefore
**not** met today and was not met before this stage either. That is a layout
defect and belongs to stage 3.

> **This paragraph's measurements come from the same deleted instrument as the
> "23 of 36" below, and are marked for that reason rather than corrected
> (#1202).** Nothing here is re-derivable: the harness was a throwaway spec
> that `d7aab8d8` did not commit. The committed sweep that replaced it,
> `tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`, does still
> report a strip spill of the same order at the tightest pair — `.hud-strip
> spills 35px` at 375×812 @ 200 % on `2559eb14`, against the 34.7 px recorded
> here — so the finding survives its instrument even though the numbers cannot
> be joined to it. **The conclusion is untouched:** article 8's 200 % clause is
> not met today either.

---

## Stage 3 — The HUD shell: collapse, resize, layout memory

What exists: `alerts` and `minimap` collapse through `collapsedPanels`
(`src/ui/hud/hud-state.ts:43`), in memory only.

What the direction adds:

- Collapse arrows on the left navigation, the right inspector and the top metric
  strip, with the handle still reachable after collapse (article 16).
- Drag-resize with real limits: left 72–180 px, right 260–600 px on desktop
  bounded so the map keeps its space, and a height drag on phones from 180 px to
  roughly 66 % of the viewport with a 210 px reserve.
- Keyboard parity on the separator: arrows 10 px, Shift+arrows 40 px, Home/End
  to the extremes, Enter to collapse, and a double-click to the default. The
  W3C window-splitter pattern is the reference; the delivery notes in
  `DOKUMENTACJA/04-RESEARCH-I-BACKLOG.md` that the pattern's own review is
  unfinished, so it is an implementation hint and not an accessibility
  certificate.
- A Layout menu: slider, reset, "map only", and the clock reachable even when
  the metric strip is hidden.
- Layout preferences persisted under their own key, separate from the save.

**The rule that makes this stage dangerous, and it is article 17:** a gesture has
one owner. A resize drag must not pan the camera or place a building; a scroll
inside a panel must not move the map; a drag that starts on a panel must not
build underneath it; `pointercancel` and lost capture must end the gesture.
`src/input/` already owns pointer and touch tiers — the resize handle belongs
inside that abstraction, not beside it.

**Gate:** browser specs under `tests/browser/`, at all three device widths, plus
a pointer-cancel case. `tests/browser/app-shell.spec.ts` is where the shell's
existing specs live; note that it is the slow file (`docs/AGENT_WORKFLOW.md`
records it sorting first and carrying the slow specs) and budget for that.

### Landed 2026-09-14 (#1159)

The paragraphs above are left exactly as they stood: they are the plan, and what
a plan asked for is worth keeping beside what happened.

Everything on the list is in, with two departures from it that are written out
rather than absorbed:

- **The metric strip's fold control is in the Layout menu, not on the strip.**
  A second tap target in the strip needs a reserved gutter of `2 x --tap-target`,
  which is 182 px of a 720 px window at 175 %, and that cost one
  viewport x interface-scale combination at a 200 % page zoom that passes
  without it. The Layout button is the strip's handle, which is what article 16
  asks for; an arrow on the strip is what the delivery asks for, and this is the
  narrower thing.
- **A phone has no arrow on its navigation at all.** All three places one could
  go on that tier cost something a gate already holds -- in the bar's row it
  wraps the bar into a second row, floating above it covers the Build panel
  because the rail is full-width there, and inside `.hud-tabs__inner` it is
  inside what it hides. "Map only" folds and restores the sections there.

**The stage's own gate, beyond the ones it inherited:**
`tests/browser/hud-layout-shell.spec.ts`, 16 specs at three device widths,
including the pointer-cancel case this section asks for and a
cursor-leaves-the-window case beside it.

**The 200 %-zoom debt stage 2 handed this stage is not cleared.** 23 of 36
combinations fail, the same 23 as on the base commit, and `d7aab8d8` carries
both sweeps, the two things this stage had added to that number and removed
again, and what clearing it would actually take.

> **THE "23 OF 36" ABOVE IS KEPT AND IS NOT COMPARABLE TO THE "29 OF 36" THIS
> DOCUMENT REPORTS AT §"Worked 2026-09-15 (#1164)" (#1202).** It stands because
> it is the stage 3 finding, taken with stage 3's instrument, and that
> instrument is gone: `d7aab8d8`'s own message records it as *"a throwaway spec
> and is not committed: it loads 36 pages and asserts nothing"*. Its tolerances
> therefore cannot be read, and the 23 cannot be re-derived by anybody.
>
> **The two numbers are two instruments, not two states of the interface.** The
> committed replacement is
> `tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`. Run on
> `d7aab8d8` — the very commit the 23 came from — it reports **32 of 36**. So
> 29 against 23 is not six regressions during the rollout; it is a stricter
> instrument reading nine more combinations on the same tree, and the
> subtraction is meaningless in either direction.
>
> **Held to the one instrument, the debt went 32 → 29 and nothing was added.**
> The three that were fixed are `1280x720@100%`, `1024x768@100%` and
> `900x600@75%`, all of them at or below 100 % interface scale.
>
> **Re-measured for #1202 rather than quoted**, in two worktrees on two ports,
> `node_modules/.bin/playwright test --config tests/browser/playwright.playtest.config.ts tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`
> in each: **32 of 36** at `d7aab8d8` (detached worktree, the playtest copied
> in, port 5417) and **29 of 36** at `2559eb14` / v0.0.628 (port 5331). That
> extends the stage 8 head reading from `584f5ca1` to `2559eb14` unchanged.
> Neither tree held the Git LFS bytes, so the actor atlases failed to decode in
> both runs; the sweep measures `.hud-*` DOM geometry rather than the canvas,
> and the condition was the same on both sides of the comparison.
>
> **`playwright.playtest.config.ts` has to be named directly.** A playtest is
> deliberately not one of the two gate suites, so `tests/browser/run-suite.ts
> --suite playtest` cannot drive it — `tests/browser/browser-suites.ts` says
> why, and `LOCKSTATE_BROWSER_TEST_PORT` is what moves it off its default 5184.
>
> **What did not change: the row still fails.** 29 of 36 is a smaller debt, not
> a cleared one.

---

## Stage 4 — The build loop against the real simulation

The prototype's loop is: choose → plan → point → cost → confirm, with cost
subtracted locally and undo returning it. **None of that is a decision about
this game's economy.** The delivery says so twice, and `AGENTS.md`'s content
rules say the same in general terms.

Do instead:

- Bind the catalogue view to `src/content/room-catalog.ts` and the existing
  object catalogues; bind planning to `src/ui/build-tool.ts`,
  `src/ui/object-tool.ts` and `src/ui/room-tool.ts`.
- Take cost, requirements and refusals from projections. The UI must not
  recompute capacity, readiness, finances or assignment — constitution article 4
  and this repository's own boundary rule say the same thing from two
  directions.
- Keep the six states distinguishable: pointing, preview, accepted order,
  execution, finished object, refusal (article 3). A refusal must never look
  like a success — which is `docs/adr/STATUS-QUEUE.md`'s standing complaint and
  the subject of several open issues.
- When the money is taken is an economy question with an existing answer. Find
  it before changing anything; a different answer is an ADR.

---

## Stage 5 — Operations: everything the prototype does not show

Staff, intake, schedule, deliveries, security, contraband and incidents keep
full function. The prototype is narrower than the game; narrower is not a
specification. Stage 0's inventory is what this stage is checked against, one
row at a time.

The one semantic move the direction proposes — staff from Security to Manage —
is a UI grouping, not a move of simulation modules, and the delivery says so in
its own words. Anything beyond regrouping is a separate decision.

### The navigation moved on 2026-09-14, ahead of this stage and by the owner's ruling

ADR 0112 decision 3 says the navigation moves **now** rather than after the
inventory, in the owner's own typed words, and stage 3's shell landing is what
unblocked it. So the five sections are already the delivery's five, and this
stage is checked against that arrangement rather than against today's HUD:

| Was | Is | Holds |
|---|---|---|
| `overview` | `overview` — Overview | the Finances readout (#1183) |
| `build` | `build` — Build | the Build panel, materials and deliveries included |
| `rooms` | `zones` — Zones | the Rooms panel |
| `security` | `manage` — Manage | the Staff panel **and** the Intake panel |
| `regime` | `day-plan` — Schedule | the Regime panel |

**Three rulings of 2026-09-14 decided the contents**, each the label of a
clickable option the owner chose rather than a sentence they typed — the weaker
provenance `AGENTS.md`'s 2026-09-08, -09 and -10 entries draw of themselves, and
recorded as such in
[`docs/research/2026-09-14-the-mechanical-navigation-move.md`](./research/2026-09-14-the-mechanical-navigation-move.md)
§7:

1. **Intake moves to Zarządzaj** — *"Zarządzaj (zgodnie z dostawą)"*.
2. **Materials and deliveries stay in Buduj** — *"Buduj"*.
3. **Przegląd gets a new Overview-native readout, and `src/ui/save-panel.ts`
   stays in the rail aside slot** — *"Nowy odczyt w Przeglądzie, panel zapisu
   zostaje w szynie"*. Rulings 1 and 3 landed in one commit, because intake was
   the only thing Overview held and a section that opens onto nothing is what
   article 5 objects to.

**Two things this stage still owes, and neither is a decision:**

- **The Regime panel has to split.** The delivery's table puts *osadzeni*
  (inmates) under Zarządzaj and keeps only *Harmonogram i edycja bloków* under
  Plan dnia; the panel paints the day blocks, the prisoner roster and the
  prisoner inspector together, so Day plan carries all three today. This is the
  one place where a section's contents do not yet match the delivery's own
  table, and it is a code change rather than a mount move.
- **The eleven unplaced surfaces are still unplaced.** Status strip, events
  band, refusal and unavailable lines, alerts list, minimap and zoom, save panel,
  display scale, brand badge, telemetry consent prompt, `src/ui/account/`, and
  the four read models with a route and no reader. A surface the direction does
  not place is not an agent's to delete; each goes to the owner if and when a
  stage needs an answer for it.

### Checked 2026-09-14 (#1161), and the two owed things are answered differently

The paragraphs above are left exactly as they stood. What follows is what the
check found, and it is a record rather than a re-plan.

**Nothing was lost.** All seventeen commands are still issued and all seventeen
still from `src/main.ts`; ten of the fifteen projections still have a reader and
the same five do not; every operational control on Manage and on Build is laid
out, enabled and pressable at 1440x900, 1024x768, 900x600 and 375x812. Two new
gates carry the measurements rather than this document quoting them:
`tests/browser/operations-reachability.spec.ts` (14 specs) and
`tests/browser/unplaced-surfaces.spec.ts` (7 specs), each with its own mutation
table.
[`docs/research/2026-09-14-what-stage-5-checked-and-what-it-found.md`](./research/2026-09-14-what-stage-5-checked-and-what-it-found.md)
is the row-by-row record, including six claims in the two lists before it that
have gone stale and are recorded rather than edited.

**The Manage rail's budget, measured, because this is the first tab to spend it
twice.** `.hud__side` gives 413 / 405 / 391 CSS px at 1440x900, 900x600 and
375x812; the two panels want 161+577, 161+342 and 143+361. So the Staff panel is
**75, 177 and 178 px short** at 1024x768, 900x600 and 375x812 and absorbs the
whole overdraft through its own `overflow-y: auto`, which is exactly the
arrangement the 2026-09-14 move chose and wrote into `hud.css`.

**The first owed thing — the Regime panel's split — is filed rather than
built**, as
[ADR 0115](./adr/0115-where-the-prisoner-roster-lives-and-what-the-manage-rail-can-afford.md).
The measurement above is why: the roster is a further 202-220 px before its own
chrome and before the six-need inspector, and it grows with the population, so
moving it onto Manage takes height from one of the two panels already there and
**naming which is a ruling nobody has made**. The delivery's table names
*osadzeni* under Zarządzaj; the navigation-move record §8 names that same table
as its own weakest claim, and three of its four open questions were ruled on
2026-09-14 while the roster was not one of them. Every row of the panel is
reachable today, and stage 5's exit criterion is that nothing is unreachable —
so splitting a working panel to satisfy an unruled table would be spending a
player-visible change on an unanswered question. ADR 0113's acceptance dates the
question rather than settling it: Plan dnia gains its first write surface under
[#1167](https://github.com/woogitsu/lockstate/issues/1167), which is a reason to
answer this after that lands.

> **RULED BY THE OWNER ON 2026-09-16, AND THE PARAGRAPH ABOVE IS KEPT AS THE
> CASE FOR ASKING.** The panel is split in code and **both halves stay on Plan
> dnia**; the roster does not move to Manage. ADR 0115's Status block is the
> record — it carries the ruling, its weaker provenance (a clickable option
> labelled *"Opcja 4 — rozbij panel w kodzie, obie połowy na Plan dnia
> (zalecane)"*, not a typed sentence), the measurement that declined the third
> Manage panel, and what the ruling does not settle. **Nothing under `src/`
> implements it**, so this stage's owed item is answered rather than
> discharged.

**The second owed thing — the eleven unplaced surfaces — is discharged as a
check and produces one question.** Every one is still mounted, and a twelfth
exists that stage 0 could not have listed: the language picker (#663), inside
the Layout menu, reachable at all three tiers. But `.hud__corner` is
`display: none` at 720 px and below, so the minimap, the zoom control and the
alerts list have no box on a phone — and **the alerts list is the only surface
that issues `DismissAlert`, so one of the seventeen commands cannot be issued at
phone width.** That is deliberate, documented three times in `hud.css` under
#1117, exempted by `app-shell.spec.ts`'s `NEVER_LAID_OUT_BELOW_720`, and
**pre-existing rather than anything this rollout did.** It is nonetheless the
one place where "keeps full function" and the measured page disagree, so it is
the owner question this stage produces. The new spec records the state at all
three tiers rather than asserting the phone one is right.

> **ANSWERED BY THE OWNER ON 2026-09-16, AND THE PARAGRAPH ABOVE IS KEPT EXACTLY
> AS IT STOOD.** It is the question, and the answer is only legible beside it.
> **The alerts fold gets a route below 720 px: it is mounted in the rail, on the
> Overview tab, at that breakpoint and no other.**
> [#1201](https://github.com/woogitsu/lockstate/issues/1201) is the issue; this
> paragraph is the durable record, because the dossier that priced the options
> is held by an unmerged branch ([#1242](https://github.com/woogitsu/lockstate/pull/1242))
> and a GitHub comment is not a record.
>
> **The provenance is the weaker of the two kinds this repository
> distinguishes**, the same kind `CLAUDE.md` flags for the 2026-09-08, -09 and
> -10 releases inside reservation 3 and the same kind ADR 0091's Status block
> records of itself. The owner did not type a sentence; they chose a clickable
> option whose label an agent session had written:
>
> > Zamontuj fold w szynie poniżej 720 px (zalecane)
>
> ("Mount the fold in the rail below 720 px (recommended).") **The option's own
> label is the whole of what was agreed** — the mount, at that breakpoint. No
> markup, no second issuing site and no change to `alertRowDismissal` is agreed
> with it; the command stays on the row that names the alert, which is what
> makes `tests/foundation/unconsumed-command-contract.test.ts`'s
> `producersOf('DismissAlert')` pin survive the change unedited.
>
> **Why Overview and not "wherever the player is", measured rather than
> reasoned.** The dossier mounted a 360 px worst-case stub inside `.hud__side`
> at 375x812, one tab at a time: on Overview the Overview panel measured
> **112.50 px before and 112.50 px after**, unchanged, while the same stub on
> Zones took the Rooms panel from 457.13 to 144.00 and on Manage took the Staff
> panel from 307.38 to 2.00, because the phone sheet is already at its 536 px
> ceiling there. **Those figures are the dossier's and are not re-taken here.**
> "Mount it everywhere" was therefore never on the table; the Overview-only
> shape is the one that costs nothing measurable.
>
> **Two options were declined and both are worth keeping, because each is what
> somebody will propose next.** Accepting the phone as a viewing tier — which
> would have made the closing criterion's *"Każda obecna akcja ma osiągalną
> drogę"* acquire a written phone carve-out in ADR 0112, and would have turned
> `unplaced-surfaces.spec.ts`'s `'desktop: flex / tablet: flex / phone: none'`
> from a recorded assertion into an endorsed one. And putting the fold in the
> Layout menu, which is reachable today but files world state inside the one
> menu constitution article 13 defines as *not* world state. Un-hiding
> `.hud__corner` whole was already measured failing twice and `hud.css` carries
> both runs.
>
> **The caveat the owner was shown before choosing, recorded because it runs
> against the ruling.** The 360 px fold height was read at 1440x900, where
> `.hud-alerts__list` is 372 px wide; at phone width the same sentences wrap to
> more line boxes, so the real worst-case fold is **taller** than 360 px, not
> shorter, and Overview's measured headroom over the stub is 150.31 px. One
> measurement nobody has taken settles whether that headroom survives. The
> ruling is the arrangement; if the re-wrap eats the headroom, what that costs
> is a fresh question rather than a licence to mount it elsewhere.
>
> **Nothing under `src/` implements this**, and the ruling does not by itself
> change that.
>
> **THAT SENTENCE WAS TRUE FOR ONE DAY AND IS KEPT RATHER THAN DELETED**
> (`docs/AGENT_WORKFLOW.md` §4, *mark both directions*). #1279 merged as
> `725aad40` on 2026-09-17 and builds exactly the arrangement the label names
> and nothing wider: `placeAlertsFold` in `src/ui/hud/hud.ts` appends the one
> existing `alertsSection.element` to `overviewPanel.foldSlot` below the
> breakpoint and back to `minimapPanel.body` above it, wired as
> `createHudLayoutShell`'s `onTierChange`. **One node moved, never a second one
> built**, which is why `producersOf('DismissAlert')` is still one producer and
> the pin above survived unedited, as this block said it would.
> `tests/browser/ui-alert-dismiss-on-a-phone.spec.ts` is the gate over the
> press. The first entry ever retired from `app-shell.spec.ts`'s
> `NEVER_LAID_OUT_BELOW_720` is the alerts fold's header, and the spec writes
> the retired string out rather than deleting it, for the reason this rollout
> keeps paragraphs: *"the reason it is gone is not the reason the block below
> predicted would retire all of them"* -- `.hud__corner` is still
> `display: none` at 720 px, and the three entries around it are still exempt
> for that mechanical reason.
>
> **What is still not settled is the caveat above, not the mount.** The fold's
> height at 375 px width has still not been measured, so whether Overview's
> 150.31 px of headroom survives the re-wrap is open exactly as this block left
> it.
>
> **One count in the kept paragraph is stale and is marked rather than
> edited.** *"One of the seventeen commands"* is **eighteen**: opened on this
> branch, `simulationCommandSchema` in `src/simulation/protocol/commands.ts`
> lists eighteen member schemas, `editRegimeBlockSchema` among them. A tally,
> rotting first, exactly as `docs/AGENT_WORKFLOW.md` §4 predicts — and the
> subject of the sentence is unaffected, which is why the sentence stands.

---

## Stage 6 — Language

Every string through a stable key, full sentences, no concatenation, correct
Polish plural forms (*1 osoba / 2 osoby / 5 osób*), locale-formatted numbers and
dates. `src/services/localization/` and `src/content/default-locale-en.ts` are
the existing machinery, and
`tests/foundation/localization-key-completeness.test.ts`,
`second-locale-contract.test.ts` and `pseudo-locale-contract.test.ts` are the
gates.

**The reservation that governs this stage.** `AGENTS.md`'s fourth: the *wording*
of a player-visible string has been ours since 2026-09-04; its *truth* has not.
So for every string this rollout authors:

1. Open the code that makes the sentence true and cite it.
2. Quote the string verbatim in the commit message **and** in the pull request
   body, beside that citation.
3. If the code does not make it true, the string does not ship. "Zapisano"
   before a confirmed write, "wolne miejsce" from a bed count alone, and "brak
   incydentów" standing in for "no data" are the delivery's own three examples,
   and they are article 5.

Simulation code may branch on a stable id and may never read, persist, hash or
compare translated text. That is a determinism rule, not a style preference.

**What has landed under this stage, and the one thing it did not do.** The
Polish catalogue is #661 (669 keys, no English string changed to make one
fit); it reaches a running page through `CATALOG_CHUNKS` in the composition
root (#662); and a player can choose a language since #663 — one cycling
control in the HUD's chrome row, over `lockstate.settings.language`, applied by
reloading rather than by re-rendering
([the ADR draft](./adr/drafts/how-a-language-change-reaches-a-running-page.md)
records why, with the count).

**Fifteen keys are English on a Polish page and it is worth naming them here
rather than leaving them to be rediscovered.** #1159's Layout menu added
`hud.layout.*` to the English catalogue after #661 authored the Polish one, so
all fifteen fall back per key — three of them (`Open the layout menu`, `Hide the
sections`, `Hide the panels`) are on screen at boot.
`tests/browser/ui-language-picker.spec.ts` records them in its own docblock and
deliberately does **not** assert them away: #664's rule is that no gate may be
passable only by completing a translation. They are ordinary catalogue work for
whoever carries the Polish catalogue forward, and the stage is not finished
while they stand.

---

## Stage 7 — World art

`ASSETY/wizja-mapy.png` is one 1536×1024 illustration and is a reference, not an
atlas. `DOKUMENTACJA/08-PROMPT-GRAFIKI.md` carries the exact prompt that made
it, which is what makes it reproducible.

**The owner extended this stage on 2026-09-13:** beyond keeping the illustration
as a reference, production prompts are to be written for tiles and objects in
the same style, so the catalogue can be produced rather than improvised. Those
prompts are repository content and are written:
[`docs/ART_CONCEPT_PROMPTS.md`](./ART_CONCEPT_PROMPTS.md), with an invariants
table taken from the renderer rather than from taste — the two suns' angles come
out of `tooling/blender/render-environment-objects.py`, the tile scale out of
`src/rendering/assets/environment-sprites.ts`.

**A second ruling the same day scoped what those prompts are for**, after the
question was put to the owner: a generated image is a **concept reference to
model from in Blender**, never a sprite published straight to
`public/game-content/source-art/`. The reason is mechanical — this repository's
environment renders satisfy `tests/unit/environment-art.test.ts`'s two aspect
checks by construction, with a recorded drift of `0`, and a generated image
satisfies them by luck; a Blender render can also be produced again from a
pinned toolchain, and a generated image cannot be produced again at all. There
is a precedent for externally produced PNGs — the 23 sheets on disk are
owner-supplied files from 2026-08-22 — and the ruling is that we do not take it.

Production work is the existing pipeline's: `docs/ART_PIPELINE.md`,
`docs/RENDERING.md`, consistent pivots and light direction, eight facings,
depth and culling, atlas memory budget, LFS.

**Two hard mechanics, both already paid for once:**

- Rendered sprites must be published under `public/game-content/source-art/`,
  because the CI decode step fails closed on anything outside it.
- The `git lfs pull --include=` list in `.github/workflows/ci.yml` is a
  **literal list of globs, not a pattern**: every new sprite id has to be named
  there or CI fetches a pointer file and the decode step fails with its own
  message telling you so. That file is owner-reserved
  (`AGENTS.md`, reservation 3) — which means **every batch of new art needs a
  release from the owner before it can go green**, and that is a scheduling
  fact, not a footnote.

---

## Stage 8 — Acceptance

`DOKUMENTACJA/06-PLAN-TESTOW.md` lists thirteen screen-level areas: layout,
resize, collapse, slider/reset, keyboard, build, modal, schedule, save, embed,
theme, text zoom, touch. Work them as written.

On top of them, this repository's own gates, none of which the delivery's mock
tests replace: `pnpm typecheck`, `pnpm test`, `pnpm test:browser`,
`pnpm test:artifact`, `pnpm verify`, `pnpm verify:assets`, `pnpm verify:sql`,
`pnpm test:perf`, `pnpm verify:benchmark`.

The delivery's own closing criterion is the one to quote at the end:

> Każda obecna akcja ma osiągalną drogę; żadna odmowa nie wygląda jak sukces;
> zapis jest prawdziwy i odporny na istniejące scenariusze konfliktu; resize nie
> wydaje komend światu; telefon daje dostęp do mapy; motywy zachowują kontrast i
> fokus; docelowe testy oraz build przechodzą. Pokaż wyniki testów, nie tylko
> screenshot.

("Every present action has a reachable route; no refusal looks like a success;
the save is real and survives the existing conflict scenarios; resize issues no
command to the world; the phone gives access to the map; the themes preserve
contrast and focus; the target tests and the build pass. Show test results, not
just a screenshot.")

### Worked 2026-09-15 (#1164): ten pass, one is not applicable, one fails, one is partial

The paragraphs above are left exactly as they stood. What follows is the
outcome, and it is a record rather than a re-plan.
[`docs/research/2026-09-15-what-stage-8-accepted-and-what-it-did-not.md`](./research/2026-09-15-what-stage-8-accepted-and-what-it-did-not.md)
is the row-by-row pass; this is what a reader of the plan needs to know without
opening it.

**Nine gates, nine green, on `584f5ca1` (v0.0.622).** `pnpm test:browser` **525
passed in 30.5 m**; `pnpm test` 450 files / 5,291 passed / 2 skipped;
`pnpm verify` including the production build; `test:artifact` 2;
`verify:assets` 10 atlases + 3 catalog entries; `verify:sql` 414 pgTAP
assertions; `test:perf` 36; `verify:benchmark` 18 deterministic scenarios;
`typecheck` clean. **None of this is CI's verdict** — the owner's self-hosted
runners were stuck for the whole pass, so no CI run exists for the branch, and
the record says so wherever it quotes a number.

**The three areas that are not a plain pass:**

- **Text (200 % page zoom): FAIL, 29 of 36 combinations.** The harness behind
  this document's own "23 of 36" at §"Stage 3" had been deleted by the commit
  that produced it, so the stage wrote it again and committed it as
  `tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`. **29 against
  23 is not six new failures**: run on `d7aab8d8` itself the rewrite reports
  **32**, so it is the stricter instrument and the two figures cannot be
  compared. Held to one instrument the debt went **32 → 29** — three
  combinations fixed, none added. The 23 above is left unedited on purpose; it
  is a stage 3 finding and this is a stage 8 pass.

  **Re-measured independently for #1202 and both figures reproduced:** **29 of
  36** on `2559eb14` (v0.0.628), 35 commits on from the `584f5ca1` this row
  reports, and **32 of 36** on a detached worktree at `d7aab8d8`. The 23 is now
  marked in place at §"Stage 3" and in `docs/VISUAL_IDENTITY.md`, kept rather
  than overwritten.
- **Embed: NOT APPLICABLE**, and deliberately not recorded as a pass. The row
  is about the delivery's own design-book device previews, which this
  repository does not have. The clause beside it *does* transfer, and was unmet
  when stage 8 measured it: nothing in `src/` bound the `storage` event, so a
  second Lockstate tab never followed the first (#1199).

  > **That clause was written in the present tense and went stale within the
  > hour; it is corrected above rather than deleted** (`docs/AGENT_WORKFLOW.md`
  > §4). #1199 landed as `162e9656` on 2026-09-15, and the commit that recorded
  > this row, `0253a832`, is **one minute and thirty-seven seconds later** on
  > the same day — the two passed each other. `src/input/storage.ts` now carries
  > `subscribeToSettingsChanges`, and `src/main.ts` answers three of the four
  > preference keys with the same apply-path its own control uses. The fourth,
  > `lockstate.settings.language`, is answered by nothing on purpose, and
  > `docs/adr/drafts/what-a-second-tab-follows.md` carries why. **What is not
  > closed is the row's verdict**: this was a NOT APPLICABLE row and remains
  > one, because the previews it is about still do not exist here.
- **Touch: PARTIAL.** Every gesture passes and the phone does reach the map.
  `DismissAlert` still has no route at 375×812 — stage 5's open owner question,
  which stage 8 does not answer. **What stage 8 adds is that the closing
  criterion above depends on it**: *"Każda obecna akcja ma osiągalną drogę"* is
  false at one of the three device tiers the delivery itself names.

  > **The question was answered on 2026-09-16 and the row above is kept as the
  > measurement it was.** The owner ruled that the alerts fold is mounted in the
  > rail on Overview below 720 px — §"Stage 5" carries the ruling, its weaker
  > provenance and the two declined options. **The row does not change**: the
  > ruling settles the arrangement and nothing under `src/` implements it, so
  > *"still has no route at 375×812"* is true of the tree today and stays PARTIAL
  > until something ships.
  >
  > **Something shipped: #1279, `725aad40`, 2026-09-17.** The clause above is
  > kept because it was the true reading for a day, and both directions are
  > marked rather than one overwritten. The fold is mounted in the Overview
  > rail below 720 px and `tests/browser/ui-alert-dismiss-on-a-phone.spec.ts`
  > presses the dismiss control there. **The row's verdict is not moved from
  > PARTIAL here anyway**, and the reason is a rule rather than caution: a
  > verdict in this table is a measurement, and no one has re-run the Touch row
  > against the shipped tree. What changed is that the sentence blocking it is
  > no longer *"nothing implements it"* but *"nobody has re-measured it"*.

**So the closing criterion is six clauses satisfied, one satisfied only
locally, and one false.** The record's §16 takes it apart clause by clause, and
separates a clause that passes from the article behind it that does not:
*"motywy zachowują kontrast i fokus"* holds — contrast computed in both themes,
focus at 3:1 against every surface — while constitution article 8 asks for three
things and the third, 200 % text, is the row above.

---

## What an agent may not decide alone

1. **Anything inside `AGENTS.md`'s four reservations.** For this rollout that is
   concretely: the `ci.yml` LFS include list (stage 7), any migration, any
   deploy configuration, and the *truth* of any player-visible sentence.
2. **Whether a surface that the direction does not place should disappear.**
   Stage 0 produces that list; the owner answers it.
3. **The economy.** Sample prices are demonstration. When money is taken, and
   whether undo refunds it, are existing answers or new ADRs.
4. **Replacing the game application with the prototype.** The delivery forbids
   it, and so does every architectural boundary in `AGENTS.md`.

## The failure mode this plan is written against

A re-skin that looks finished and quietly removes reachable actions, softens
refusals into successes, or ships a sentence the code cannot prove. Constitution
article 20 puts it as well as anything here could: a logic test does not prove
layout or touch; readiness to integrate and readiness to ship are separate
stages; and a code change means re-checking the behaviours it touched.
