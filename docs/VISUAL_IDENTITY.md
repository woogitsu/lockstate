# Visual identity and product voice

This document is the repository's reading of the design direction the owner
delivered on 2026-09-13. The delivery itself is vendored verbatim under
[`docs/design/2026-09-13-identity-v5/`](./design/2026-09-13-identity-v5/) and is
never edited; this file says what it binds *here*, what it does not, and where
this repository's code disagrees with it today.

[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record. **The owner ruled on all five of its decisions on 2026-09-13**,
two of them against its recommendations; its Status block carries each ruling
and its provenance, and the three sentences of this document that the rulings
changed say so where they stand. [`docs/IDENTITY_V5_ROLLOUT.md`](./IDENTITY_V5_ROLLOUT.md) is the
staged plan for getting from today's UI to this one.

## The three-line summary, before any detail

1. **The map is the game; panels serve it.** One panel is the place of work at
   any moment, it sits beside the map rather than over it, and opening it issues
   no simulation command.
2. **Every sentence the game shows a player must be true**, and the delivery's
   twenty-article constitution spends most of its length on what that costs.
3. **The delivery is a direction, not an implementation.** Its prototype is a
   standalone HTML/CSS/JS mock with sample data, a single raster map and
   `localStorage`. None of that crosses into this repository.

## What the delivery contains

| Path under the delivery | What it is |
|---|---|
| `START_TUTAJ.md` | Entry point, scope and the handover's own safety rules |
| `DOKUMENTACJA/01-BRIEF-I-DECYZJE.md` | The owner's brief and the source hierarchy for conflicts |
| `DOKUMENTACJA/02-SYSTEM-WIZUALNY.md` | The binding visual system: palettes, rhythm, typography, icons |
| `DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md` | Navigation, build loop, panel geometry, theme, device tiers |
| `DOKUMENTACJA/04-RESEARCH-I-BACKLOG.md` | Five cited sources, what was implemented, eight unimplemented proposals |
| `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` | The brief for the implementing model, in eight ordered steps |
| `DOKUMENTACJA/06-PLAN-TESTOW.md` | Thirteen screen-level acceptance areas |
| `DOKUMENTACJA/07-STATUS-I-OGRANICZENIA.md` | What was verified and what was not — read this before quoting anything |
| `DOKUMENTACJA/08-PROMPT-GRAFIKI.md` | Provenance of the one world illustration, including the full prompt |
| `DOKUMENTACJA/09-REJESTR-WERSJI.md` | The five iterations, each with the sha it was taken at **in the prototype's own repository** |
| `DOKUMENTACJA/konstytucja.md` | The twenty-article product constitution |
| `DOKUMENTACJA/projekt.md` | The full specification, with iterations 01–05 as history |
| `DOKUMENTACJA/audyt.md` | The iteration-05 audit: eight fixed defects, nine logic tests, open risks |
| `AKTUALNY_PROTOTYP/` | The published iteration-05 prototype and its nine-case logic suite, `docs/design/2026-09-13-identity-v5/AKTUALNY_PROTOTYP/tests/audit.cjs` |
| `HISTORIA/` | All five iterations as complete snapshots, plus git patches between them |
| `ASSETY/`, `REFERENCJE/` | The world illustration; screenshots of this repository's UI and the owner's marked-up notes |

## What is binding

### Product promise and voice

**"Twoje decyzje. Żywy świat."** — "Your decisions. A living world." The
delivery states in `DOKUMENTACJA/02-SYSTEM-WIZUALNY.md` that this is identity
material and must not be used in place of a useful heading inside the tools.

The message pattern is **fact → place → next step**, with direct verbs
(*Wybierz, Sprawdź, Zaplanuj, Zapisz* — Choose, Check, Plan, Save). The
specification carries a ten-row table of worked examples. Those rows are
*shapes*, not strings to paste: the numbers in them are invented, and
`AGENTS.md`'s fourth reservation makes the truth of a player-visible sentence
the owner's, not ours, however free we are with its wording.

### The palettes

Day (the default the delivery designs for). Eleven of these rows are
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`'s own table; **"secondary ink" is not** —
it appears as *"Drugorzędny atrament #244454"* in `DOKUMENTACJA/projekt.md`'s
iteration-01 section, and is kept here because the prototype's light theme
carries the value as a live custom property:

| Role | Value |
|---|---|
| Frame / ink | `#122C3A` |
| Secondary ink | `#244454` |
| Text | `#183442` |
| Subtle text | `#5C717D` |
| Action / teal | `#007477` |
| Brand mint | `#89E0C3` |
| Surface | `#FFFFFF` |
| Background | `#F2F6F8` |
| Border | `#DCE5E9` |
| Selection | `#DFF5F0` |
| Warning | `#895300` on `#FFF1D7` |
| Danger | `#B63744` on `#FFEBED` |

Night:

| Role | Value |
|---|---|
| Background | `#10232E` |
| Header frame | `#0B1D27` |
| Panels | `#132A36` / `#193440` |
| Text | `#E0EDF2` |
| Subtle text | `#ADC2CD` |
| Accent | `#8CDEC9` |
| Selection | `#22473F` |
| Primary button | `#89DFC7`, text `#102C2D` |
| Border | `#36505E` |
| Warning | `#F0C77F` on `#443522` |
| Danger | `#FFB3B9` on `#482B35` |

One value carries a recorded correction and must not be reverted: the teal was
darkened from `#007E80` to `#007477` after a contrast check. The delivery says
so in its own words — *"Turkus został przyciemniony z początkowego #007E80 po
sprawdzeniu kontrastu. Nie wracać do pierwszej wartości."*

### Typography, shape and motion

**The delivery's target scale is 32 / 24 / 20 / 16 / 14 / 12 px with 16 px body,
and the owner ruled on 2026-09-13 for a smaller step: 15 / 13 / 11.** The
delivery's figure is kept in this sentence rather than overwritten, because the
gap between what was asked for and what was chosen is the thing a later reader
needs. The ramp is rebuilt around the ruling; the upper steps scale with it —
**built on 2026-09-14 as 31 / 23 / 19 / 15 / 13 / 11** (#1158). The upper three
are derived rather than given, and two derivations were required to agree
before they were written down: the −1 px offset that fits all three of the
owner's numbers exactly (a ratio does not — 15/16 of 14 is 13.125), and the
delivery's own +2/+2/+4/+4/+8 increments laid over 11 / 13 / 15. Both give the
same six numbers, which is why the odd-looking 31 and 19 stand rather than a
rounder 30 and 20. Tabular figures for money and the clock. **The spacing and
motion values below come from `DOKUMENTACJA/projekt.md`, not from
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`, which has no section for either** — worth
saying because the contents table above calls that file the binding visual
system, and a reader who goes there for a spacing scale will not find one.
Spacing 4 / 8 / 12 / 16 / 24 / 32. Radii as revised by iteration 02: **2–4 px for tools, 8 px for
windows, 12 px on the top edge of the mobile inspector** — the larger radii in
the original specification are explicitly history. Motion 160–200 ms, honouring
`prefers-reduced-motion`. Shadow means "floating above the map"; fixed panels
are separated by borders instead.

### Character

"Architectural workshop": flat groups, value columns, zone numbers, a marked
edge on the active element. Explicitly rejected: a separate rounded card per
row, marketing headings, and fake rust or bolts. This is the owner's correction
of iteration 01, which they judged *"zbyt AI-owy"* — too AI-looking — while
keeping its geometry and palette.

### Navigation

Five sections — **Przegląd / Buduj / Strefy / Zarządzaj / Plan dnia** (Overview
/ Build / Zones / Manage / Day plan) — with matter-of-fact titles. Today's HUD
has five too, and they are not the same five; §"Where this repository stands"
below has the mapping.

### The constitution

Twenty articles, in `DOKUMENTACJA/konstytucja.md`, with a tie-break order for
design disputes: data truth and save safety first, then reachability of the
needed action, then legibility, then naming consistency, and aesthetics last.
**The owner accepted the constitution on 2026-09-13, as a product contract
subordinate to `AGENTS.md`.** Six of the twenty (1, 2, 4, 7, 10, 13) restate
constraints this repository already held; the other fourteen are new, and are
now binding rather than proposed.

**Article 8 is amended, by the same ruling and in the same breath as the type
scale.** It reads *"tekst podstawowy 16 px"*; the owner chose 15 px and chose to
amend the article rather than record an exception to it. **That amendment lives
here and in ADR 0112 and never in the delivery** — `docs/design/README.md`'s
rule is that a delivery is not edited after it lands. Everything else in article
8 stands: contrast measured rather than assumed, visible focus, 200 % text, and
a status that carries a label and an icon as well as a colour. **Article 5 — every
sentence the game shows is true — was in the first list when this document was
written, and it does not belong there.** The nearest thing `AGENTS.md` holds is
the fourth reservation, which is about the truth of a *player-visible string*
that somebody is already writing; article 5 is a standing demand on what the
interface may display at all, and it is the most expensive of the fourteen.

## What is explicitly **not** binding

The delivery is unusually disciplined about this and the list is its own, not a
hedge added here:

- **Sample data.** Prices, roles, prisoner counts, the name *Northfield* and the
  campus layout are demonstration. They are not an economy or content change.
- **The prototype's build loop.** No collision, zone, material or worker-queue
  validation; cost is subtracted locally on confirm. The specification says
  outright not to carry that cost model into the game without checking the
  existing economy.
- **The prototype's persistence.** `localStorage` under `lockstate-design-v1`,
  with no protection against two ordinary tabs overwriting each other — the
  audit records that as a known gap, not as a fix to copy.
- **The map illustration.** One 1536×1024 render, not a production atlas. The
  delivery says not to cut sprites out of it.
- **Camera limits and grid.** ±600 / ±500 px and a decorative grid are prototype
  limits, not the chunked world's.
- **`app.js` and the mock's CSS.** The delivery's own audit says the layered
  overrides are iteration history to be consolidated at integration, and
  `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` says not to replace the game
  application with the mock.

## Where this repository stands against it

Measured on this checkout at `e5628369`, so that the gap is a fact rather than
an impression.

1. **There is one theme and it is the dark one.** `grep -rn prefers-color-scheme
   src/` returns nothing, and the token file's ramps are an ink/paper dark set
   (`src/ui/tokens.css:161-190`). The delivery designs a **light** day theme as
   the default and a night theme beside it, switchable and remembered. That is
   the single largest piece of work in the whole direction, and it is a token
   architecture question before it is a colour question.
2. **The type scale was smaller than the target by three steps, and stage 2
   closed the gap on 2026-09-14 (#1158).** The sentence this item used to
   carry is kept below rather than overwritten, because the measurement is
   what the rest of this list is for and a reader needs to see what moved:

   > `src/ui/tokens.css:371-373` sets body and value text to 13 px and labels
   > to 11 px, each multiplied by `--ui-scale`; the delivery asks for
   > 16 / 14 / 12. Raising it is not a token edit — it changes how much fits
   > in every panel at every device tier.

   Today `tokens.css` declares the full ramp — **31 / 23 / 19 / 15 / 13 / 11**,
   the delivery's own scale less the 1 px the owner's three numbers determine —
   and `:root` selects **15 px** for body and value. Labels never moved: 11 px
   was already the ruled size. The upper three steps have no consumer yet and
   the token file says so; `tests/unit/ui-design-tokens.test.ts` pins the
   arithmetic of all six.

   **"Not a token edit" was right, and four surfaces prove it.** These keep
   13 px, each with the assertion that says so beside it in `tokens.css`:

   | Surface | What went red at 15 px |
   |---|---|
   | Build panel | `.hud-build__arm` 56 px against a 44 px tap target (#926); the panel arriving with 6 px more content than box (#920); a queue cancel 2 px below the fold |
   | Alerts list | #739's worst-case sentence wrapping to 5 line boxes against a cap of 4, at 1280×720 |
   | Rooms panel | its own body 15 px shorter than its content at 900×600 (#331) |
   | Events band | #985's 32 px grid row measuring 35 px — **a recording rather than a floor**, and the one keep that rests on not editing a pinned number rather than on a real overflow |

   All four are inside ADR 0112's ruling rather than exceptions to it: the
   label carrying it read *"np."* ("e.g."), and 13 is a step on the ramp the
   owner named. The list of keeps is closed executably, because *adding* one
   breaks no floor and would otherwise erode the ruled scale silently.

   **One recorded measurement did move**, because it is downstream of the type
   scale by construction rather than a property of the thing it names:
   `app-shell.spec.ts`'s `ARRIVAL_PANEL_HEIGHT_PX` at 1280×720 and 375×812,
   by the 1.7 px the status strip's own growth hands the rail. Its docblock
   already required that a change to it arrive with the measurement that
   caused it, and #545 and #634 each moved it that way before.
3. **The interactive hue is a single desaturated steel blue**
   (`--sky-600: #4a7fa5`, `src/ui/tokens.css:186-188`), where the direction has
   a teal action colour and a mint brand colour with different jobs.
4. **The status tones carry measured contrast arguments that a re-skin must not
   silently discard.** `src/ui/tokens.css` records three owner rulings of
   2026-09-02 on issue #788 and the exact ratios they were chosen to clear, and
   `tests/unit/ui-design-tokens.test.ts` *computes* those ratios from the file
   rather than pinning literals. A palette swap that ignores them fails that
   test, which is the intended behaviour.
5. **The five HUD sections were `overview`, `build`, `rooms`, `security` and
   `regime`, and since 2026-09-14 they are the direction's own five.** The
   measurement this item carried is kept above rather than overwritten, because
   it is what the move was measured against.

   > The direction's five are Overview, Build, Zones, Manage and Day plan, and
   > moving staff out of Security into Manage is described in the delivery
   > itself as a UI-semantic proposal rather than a move of simulation modules.

   Today `HUD_TAB_IDS` is `['overview', 'build', 'zones', 'manage', 'day-plan']`
   in the delivery's own order, on ADR 0112 decision 3 — which the owner ruled,
   in their own typed words, happens **now** rather than after the inventory.
   The ids moved with the labels because they are read as
   `hud.dataset.activeTab`, as `.ui-tab[data-tab="…"]`, and as `activeTab ===`
   gates; no tab id is persisted anywhere, re-checked on this branch at `d5137d5d` (v0.0.613), so nothing
   about it was a migration.

   Three rulings of 2026-09-14 decided the contents, and
   [`docs/IDENTITY_V5_ROLLOUT.md`](./IDENTITY_V5_ROLLOUT.md)'s stage 5 carries
   them with their provenance: intake moved to Manage, materials and deliveries
   stayed in Build, and Overview got a readout of its own rather than the save
   panel, which stays in the rail and is reachable from every section. Staff
   moved with the tab it was already on and no simulation module moved with it,
   exactly as the delivery said.

   **Two gaps remain and are named there rather than here:** the Regime panel
   still carries the prisoner roster and inspector on Day plan, where the
   delivery puts them under Zarządzaj; and the eleven surfaces the direction
   does not place are still unplaced.

   **What the move cost, measured, in two places:** the Manage tab is the first
   in this rail's life to lay out two panels at once, and at 900x600 the Intake
   panel came out 42px shorter than its own content beside the Staff panel —
   `hud.css` carries the remedy and the one that was tried first and did not
   work. And the English name for *Plan dnia* is **Schedule** rather than the
   obvious *Day plan*, because at 375x812 a label with a space in it wraps: two
   line boxes instead of one, a tab bar of 82.4px instead of 69.2px, and the
   13.2px came off the rail and put a delivery row's Cancel outside the Build
   panel's visible box. The direction's five titles bind; which English word
   carries one of them is ours, and this one was chosen with a ruler.
6. **The layout system landed on 2026-09-14 (#1159), and the measurement this
   item used to carry is kept below rather than overwritten** — it is what the
   stage was measured against, and a reader needs to see what moved.

   > **Collapse exists; the rest of the layout system does not.** Two panels,
   > `alerts` and `minimap`, collapse through `collapsedPanels` in the HUD shell
   > state (`src/ui/hud/hud-state.ts:43`, `:82`), and that state is in-memory —
   > nothing writes it anywhere. There is no drag-resizable separator in `src/ui/`
   > (the only `aria-valuenow` is `src/ui/primitives/segmented-bar.ts:199`, a
   > progress bar), no layout menu, no reset, and no "map only" mode. The
   > direction makes all of those core, with layout preferences under their own
   > storage key — article 13's hard rule. The mechanism for that key already
   > exists and should be reused rather than rebuilt: `src/input/storage.ts` is a
   > `localStorage` wrapper written around the browsers that throw on access, and
   > `src/main.ts:431` already passes a key-value store into `WorldScene` for
   > exactly this class of preference (`:259` is the docblock that explains why).

   Today three regions fold — the five sections, the right rail and the status
   strip's readouts — two of them drag-resize, and the Layout menu carries a
   slider per resizable region, a reset, a "map only" toggle and a clock. The
   mechanism was reused exactly as that paragraph asks: `src/input/storage.ts`
   gained `loadLayoutSettings` / `saveLayoutSettings` over a key of its own,
   `lockstate.settings.layout`, and the composition root reads it before the
   HUD mounts and writes it on every settled change.

   **Three things a later reader will want and would otherwise have to
   re-derive.** The limits are the delivery's own and live in
   `src/ui/hud/hud-layout.ts` with the passage they came from quoted beside
   them; the one number that is **not** the delivery's is
   `MAP_WIDTH_RESERVE_PX`, which it leaves unspecified. A **stored** size is a
   design pixel and a **resolved** one is a painted pixel, so a width chosen at
   100 % means the same panel at 150 % — the first attempt held every limit
   unscaled and produced a 264 px rail around controls at twice their size. And
   the navigation is a left column only where it fits: `navigationPlacement` is
   a fit test rather than a breakpoint, because `--ui-scale` decides it and no
   media query can ask about `--ui-scale`.

   **What did not land, stated so it is not mistaken for done.** A phone cannot
   fold the sections on their own — the Layout menu's "map only" is that tier's
   route, and `app-shell.spec.ts`'s `NEVER_LAID_OUT_BELOW_720` carries the
   arrow beside the minimap and the zoom pair. And the 200 %-page-zoom debt
   this stage inherited is **unchanged**: 23 of 36 viewport × interface-scale
   combinations fail, the same 23 as before the stage, and commit `d7aab8d8`
   carries both sweeps and what clearing it would take.
7. **The integration points the delivery names are all real.** Every path
   listed under *"Rozpoznane wcześniej punkty integracji"* in
   `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` exists at `e5628369` — checked
   one by one, eighteen of them. That is worth stating because the delivery
   asks the reader to verify it and because it is the part of an outside brief
   that most often rots.

## The rule this document exists to make unmissable

**A visual direction cannot change what the game may say.** Every constitution
article that promises the player something — "Zapisano", "wolne miejsce", "brak
incydentów", a repair button that repairs — is a claim this repository has to be
able to prove in code before the sentence ships. `AGENTS.md`'s fourth
reservation governs that, the wording is ours and the truth is not, and every
authored string goes into the commit message and the pull request body verbatim
beside the code that proves it true.
