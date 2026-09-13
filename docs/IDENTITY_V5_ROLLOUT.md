# Rolling out the 2026-09-13 identity

This is the staged plan for moving this repository's interface to the direction
described in [`docs/VISUAL_IDENTITY.md`](./VISUAL_IDENTITY.md) and delivered
verbatim under [`docs/design/2026-09-13-identity-v5/`](./design/2026-09-13-identity-v5/).
[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record; this file is the method.

It is written to be picked up by an agent that has never seen the delivery, in a
container that will be thrown away, with the delivery as the only thing it can
rely on being there.

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

**Stage 0 needs no decision from the owner and is safe to start now.** Everything
after it wants at least decisions 1 and 2 of ADR 0112 answered, which is what
#1165 asks for.

## The shape of the whole thing, in one paragraph

Nine stages. Stage 0 is an inventory that must exist before anything is deleted,
because the delivery's prototype is narrower than the game and the cheapest way
to lose a feature is to redraw the HUD around a mock that never had it. Stages 1
and 2 are the token architecture — a second theme, then the type scale — and
they are the only stages that touch every pixel at once. Stages 3–5 are the HUD
shell, the tools and operations: layout geometry, then the build loop, then the
panels the prototype does not show. Stage 6 is language. Stage 7 is world art,
which is a pipeline problem rather than a UI one and is the longest. Stage 8 is
acceptance. **Stage 0 gates everything; 1 gates 2 and 3; 3 gates 4 and 5; 6 and
7 run beside the rest.**

Nothing here may be merged as one change. `docs/AGENT_WORKFLOW.md` §2 is the
method: an implementing agent takes its own worktree, pushes after its first
coherent chunk, and parallel agents work on unrelated surfaces. Two agents in
`src/ui/tokens.css` will conflict on the design, not merely on the file.

---

## Stage 0 — Inventory before demolition

**Why it is first.** `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` opens with it,
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
(`src/ui/tokens.css:371-373`). The direction asks for 16 / 14 / 12 inside a 32 /
24 / 20 / 16 / 14 / 12 ramp.

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

---

## Stage 7 — World art

`ASSETY/wizja-mapy.png` is one 1536×1024 illustration and is a reference, not an
atlas. `DOKUMENTACJA/08-PROMPT-GRAFIKI.md` carries the exact prompt that made
it, which is what makes it reproducible.

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
